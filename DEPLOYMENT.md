# Lakshmi Gallery — Deployment Guide

## Pre-deploy checklist (first time or new account)

Before deploying, you must:

1. **Bootstrap CDK** in your AWS account/region:
   ```bash
   cdk bootstrap aws://ACCOUNT_ID/us-east-1
   ```
2. **Create the GitHub OIDC provider** in IAM (one-time per account) — see [OIDC for GitHub Actions](#oidc-for-github-actions-one-time-setup) below.
3. **Create an IAM role** GitHub Actions can assume (trust policy scoped to your repo/`main`), attach policies for ECR, ECS, CDK/CloudFormation, S3, CloudFront, etc., then set **`AWS_DEPLOY_ROLE_ARN`** as a GitHub repository secret (Actions).
4. **Push an initial Docker image to ECR** (`lakshmi-gallery-backend:latest`) *before* or right after the first ECS deploy — the API/worker tasks need an image to start. **CI/CD pushes subsequent images** on each push to `main` (once OIDC works).
5. **After first `cdk deploy`**, open **Secrets Manager** and set (CDK creates the secrets; you supply values where noted):
   - `lakshmi-gallery/cloudfront-private-key` → PEM for CloudFront signed URLs  
   - `lakshmi-gallery/cloudfront-key-pair-id` → CloudFront key pair ID  
   - Optionally **`lakshmi-gallery/admin-password`** → your preferred admin login password (CDK may have auto-generated one)
6. **Run DB migrations** once: the GitHub workflow runs a one-off ECS migrate task; for a fully manual first deploy, see **[`docs/MANUAL_DEPLOY.md`](docs/MANUAL_DEPLOY.md)** (same `run-task` pattern as CI).

For the full first-time command sequence (CDK, ECR, ECS, frontend), see **[Deploy → First-time setup](#first-time-setup)** below and **`docs/MANUAL_DEPLOY.md`**.

---

## Architecture

```
Client (browser)
  │
  ├──▶ CloudFront (frontend) ──▶ S3 (frontend assets)
  │
  ├──▶ ALB (HTTPS) ──▶ ECS Fargate: API service
  │                        │
  │                        ├── RDS Postgres (private subnet)
  │                        ├── S3 media bucket (presigned uploads)
  │                        └── SQS (enqueue jobs)
  │
  └──▶ CloudFront (media) ──▶ S3 (media assets, signed URLs)
                                    ▲
                                    │
                          ECS Fargate: Worker service
                              ├── SQS (poll jobs)
                              ├── S3 (read originals, write derivatives)
                              ├── Sharp (thumbnails, previews, watermarks)
                              └── Rekognition (face indexing/clustering)
```

**Request flow:**
1. Admin uploads photos → presigned S3 PUT URLs → direct upload → `POST /api/uploads/complete`
2. API inserts `image_assets` (status=pending) → enqueues `process_image` to SQS
3. Worker polls SQS → generates thumb/preview with Sharp → uploads to S3 → updates DB (status=completed) → enqueues `index_faces`
4. Worker processes `index_faces` → Rekognition creates face clusters → writes `person_clusters` + joins
5. Client views gallery → API returns signed CloudFront URLs for media

### Cost & scaling (what runs 24/7 vs on-demand)

| Component | Idle behavior | Notes |
|-----------|---------------|--------|
| **Frontend** (S3 + CloudFront) | Always available | Pay per request + tiny storage; no change. |
| **Media** (S3 + CloudFront signed URLs) | Always available | Same. |
| **API** (ECS Fargate + ALB) | **Always at least 1 task** | ALB needs healthy targets; scaling to 0 would return errors until a redesign (e.g. Lambda/App Runner). |
| **Worker** (ECS Fargate) | **Scales to 0** when SQS is empty | Application Auto Scaling tracks `ApproximateNumberOfMessagesVisible` on the job queue (target ~1 msg/task). **First job after idle** may wait **~1–3+ minutes** while Fargate starts a task. |
| **RDS Postgres** | **Always on** (instance) | True scale-to-zero needs Aurora Serverless v2 or external DB—larger migration. |
| **NAT Gateway** | **Always on** | Major idle cost driver; removing it needs VPC interface endpoints for ECR/S3/Secrets/etc. |

Deploy applies worker scaling automatically—no console changes beyond a normal `cdk deploy`.

## Custom domain (e.g. lakshmigallery.com)

### What the repo does today

- The **frontend** is one CloudFront distribution (`FrontendCf`) with the default hostname `*.cloudfront.net` (e.g. `d3pg7tiyxv6pjq.cloudfront.net`).
- That same distribution already has a behavior for **`/api/*`** → your **ALB** (so the CloudFront URL is the correct entry point for both SPA and API).
- **Alternate domain names (CNAMEs) and an ACM certificate were not attached** until you pass CDK context (see below). `infra/cdk.json` had unused `domainName` / `frontendDomainName` keys — they are **not** wired into the stack.

### Why your apex hits Google

If `nslookup lakshmigallery.com` points to **34.111.x.x** (or similar) and responses show **`via: google`**, traffic is going to **Google-hosted infrastructure**, not CloudFront. Fixing that is a **DNS change** at your registrar: you must stop using that A/AAAA record and point the name at **this** CloudFront distribution instead.

### AWS requirements

1. **ACM certificate in `us-east-1` (N. Virginia)** — CloudFront only uses certificates in that region, even if the rest of the stack is elsewhere.
2. The certificate must cover every hostname you add to the distribution, e.g. **`lakshmigallery.com`** and **`www.lakshmigallery.com`** (SAN cert or two names on one cert).
3. **DNS validation**: in ACM, create the CNAME records ACM shows; wait until status is **Issued**.
4. Deploy with CDK context so the **frontend** distribution gets `certificate` + `domainNames`, and ECS env gets CORS origins for your HTTPS URLs.

### CDK context (after cert is issued)

Example (adjust ARN and comma-separated names):

```bash
npx cdk deploy --all \
  -c customDomainCertificateArn=arn:aws:acm:us-east-1:ACCOUNT:certificate/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx \
  -c customDomainNames=lakshmigallery.com,www.lakshmigallery.com \
  -c publicAppUrl=https://lakshmigallery.com
```

- **`publicAppUrl`**: canonical site URL for `PUBLIC_APP_URL` (first custom host is used if omitted).
- **`ALLOWED_ORIGINS`** is set automatically to the default `*.cloudfront.net` URL plus `https://` for each name in `customDomainNames`.

For **GitHub Actions**, add the same `-c` flags to the `cdk deploy` step (or store a small deploy script).

### DNS records at your DNS provider

Use the **exact** `*.cloudfront.net` domain from stack output **`FrontendCfDomain`** (or the CloudFront console) as the target — below `d3pg7tiyxv6pjq.cloudfront.net` is only an example.

| Name | Type | Value / target |
|------|------|----------------|
| **www** | **CNAME** | `d3pg7tiyxv6pjq.cloudfront.net` |
| **@** (apex) | **ALIAS / ANAME / flattened CNAME** (if your provider supports it) | `d3pg7tiyxv6pjq.cloudfront.net` |

If your DNS host **cannot** point the apex to CloudFront, use **Route 53** for the zone (alias A/AAAA to the distribution) or serve only **`www`** and redirect apex → www from DNS/provider rules.

**Do not** point `lakshmigallery.com` at a random Google IP if you want this stack; that will never reach CloudFront.

### Media CloudFront

The **media** distribution is separate and still uses only its default `*.cloudfront.net` name unless you extend the CDK similarly (another cert + aliases). Signed URLs use the media domain from the API; custom **site** domain does not replace that unless you change it deliberately.

## AWS Prerequisites

- An AWS account with programmatic access
- AWS CLI v2 installed locally
- Node.js 22+
- Docker (for building images)

### OIDC for GitHub Actions (one-time setup)

Create an IAM OIDC identity provider for GitHub:
```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

Create an IAM role `github-deploy-role` with trust policy for your repo:
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::ACCOUNT:oidc-provider/token.actions.githubusercontent.com" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
      "StringLike": { "token.actions.githubusercontent.com:sub": "repo:YOUR_ORG/lakshmi-gallery:ref:refs/heads/main" }
    }
  }]
}
```

Attach `AdministratorAccess` (or scoped policies for ECR, ECS, S3, CloudFront, SQS, RDS, Secrets Manager, IAM, CloudFormation, VPC, ALB, CloudWatch Logs).

Set the role ARN as GitHub secret: `AWS_DEPLOY_ROLE_ARN`.

## Environment Variables

### Secrets (stored in AWS Secrets Manager, injected into ECS)

| Variable | Source | Notes |
|---|---|---|
| `DB_USERNAME` | RDS-generated secret | Auto-created by CDK |
| `DB_PASSWORD` | RDS-generated secret | Auto-created by CDK |
| `SESSION_SECRET` | SM: `lakshmi-gallery/session-secret` | Auto-generated by CDK |
| `ADMIN_PASSWORD` | SM: `lakshmi-gallery/admin-password` | Auto-generated; update in console |
| `CLOUDFRONT_PRIVATE_KEY` | SM: `lakshmi-gallery/cloudfront-private-key` | Set manually after deploy (PEM) |
| `CLOUDFRONT_KEY_PAIR_ID` | SM: `lakshmi-gallery/cloudfront-key-pair-id` | Set manually after deploy |

### Plain Environment Variables (set in ECS task definition via CDK)

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `4000` |
| `AWS_REGION` | Stack region |
| `S3_BUCKET` | Media bucket name |
| `CLOUDFRONT_DOMAIN` | Media CloudFront domain |
| `REKOGNITION_COLLECTION_ID_PREFIX` | `lakshmi-gallery` |
| `SQS_QUEUE_URL` | Job queue URL |
| `ALLOWED_ORIGINS` | Frontend CloudFront URL |
| `PUBLIC_APP_URL` | Frontend CloudFront URL |
| `DB_HOST` | RDS endpoint |
| `DB_PORT` | `5432` |
| `DB_NAME` | `gallery` |

`DATABASE_URL` is composed at container startup by `docker-entrypoint.sh` from `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD`.

## Local Development

```bash
# Start Postgres (e.g. via Docker)
docker run -d --name gallery-pg -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=gallery -p 5432:5432 postgres:16

# Server
cd server
cp .env.example .env
# Edit .env: DATABASE_URL=postgresql://postgres:dev@localhost:5432/gallery
npm install
npm run db:migrate
npm run dev         # API on :4000
npm run worker      # Worker (in-memory queue)
```

### Local with SQS (optional)

```bash
# Set in .env:
SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789/lakshmi-gallery-jobs
FORCE_SQS=true
# Then run worker as normal; it will use SQS instead of in-memory
```

## Deploy

### First-time setup

```bash
# 1. Install CDK
npm install -g aws-cdk

# 2. Bootstrap CDK in your AWS account/region
cdk bootstrap aws://ACCOUNT_ID/us-east-1

# 3. Deploy infrastructure
cd infra
npm install
npx cdk deploy --all --require-approval never

# 4. Note outputs: ECR repo URI, bucket names, CloudFront domains, etc.

# 5. Set CloudFront signing keys in Secrets Manager (console or CLI)
# Create a CloudFront key group and key pair, then store:
aws secretsmanager put-secret-value --secret-id lakshmi-gallery/cloudfront-private-key --secret-string file://private_key.pem
aws secretsmanager put-secret-value --secret-id lakshmi-gallery/cloudfront-key-pair-id --secret-string "K2XXXXX"

# 6. Build + push initial Docker image
cd ../server
aws ecr get-login-password | docker login --username AWS --password-stdin ACCOUNT.dkr.ecr.REGION.amazonaws.com
docker build -t ACCOUNT.dkr.ecr.REGION.amazonaws.com/lakshmi-gallery-backend:latest .
docker push ACCOUNT.dkr.ecr.REGION.amazonaws.com/lakshmi-gallery-backend:latest

# 7. Run database migrations (one-off Fargate task — same idea as CI; see docs/MANUAL_DEPLOY.md for full aws ecs run-task example using MigrateTaskDefArn, subnets, security group from CDK outputs)

# 8. Force ECS services to pick up the image
aws ecs update-service --cluster lakshmi-gallery-cluster --service lakshmi-gallery-api --force-new-deployment
aws ecs update-service --cluster lakshmi-gallery-cluster --service lakshmi-gallery-worker --force-new-deployment

# 9. Build + deploy frontend
cd ../client
npm install
npm run build
aws s3 sync dist/ s3://lakshmi-gallery-frontend-ACCOUNT/ --delete
aws cloudfront create-invalidation --distribution-id DIST_ID --paths "/*"
```

### Subsequent deploys (CI/CD)

Push to `main` → GitHub Actions runs automatically:
1. Builds + pushes Docker image to ECR
2. Deploys CDK (infra changes)
3. Runs migrations as one-off ECS task
4. Force-deploys API + Worker services
5. Builds + uploads frontend to S3
6. Invalidates CloudFront

## Rollback

### Quick rollback (ECS)
```bash
# Find previous task definition revision
aws ecs list-task-definitions --family-prefix lakshmi-gallery --sort DESC --max-items 5

# Update service to previous revision
aws ecs update-service \
  --cluster lakshmi-gallery-cluster \
  --service lakshmi-gallery-api \
  --task-definition lakshmi-gallery-api:PREVIOUS_REVISION \
  --force-new-deployment
```

### Full rollback (CDK)
```bash
# Revert the commit, push to main, CI/CD redeploys previous code
git revert HEAD
git push origin main
```

### Database rollback
Manual. Drizzle migrations are forward-only. If needed, write a reverse migration SQL and apply manually.

## Estimated AWS Costs (monthly, starting)

| Service | Estimate |
|---|---|
| ECS Fargate (2 tasks, 0.25-0.5 vCPU) | ~$25–50 |
| RDS Postgres (t4g.micro, single-AZ) | ~$15 |
| NAT Gateway (1) | ~$35 |
| S3 (storage + requests) | ~$1–5 |
| CloudFront (2 distributions) | ~$1–5 |
| SQS | ~$0.50 |
| ALB | ~$18 |
| Secrets Manager (6 secrets) | ~$3 |
| CloudWatch Logs | ~$2 |
| **Total** | **~$100–130/mo** |

To reduce costs: use NAT instances instead of NAT Gateway ($35→$5), or schedule ECS to 0 when idle.
