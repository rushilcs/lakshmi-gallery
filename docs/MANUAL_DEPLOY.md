# Manual deploy to AWS (without GitHub Actions)

For architecture, OIDC/GitHub setup, and Secrets Manager (`cloudfront-*`, `admin-password`), see the repo root **[`DEPLOYMENT.md`](../DEPLOYMENT.md)**.

If CI fails (e.g. OIDC / `AWS_DEPLOY_ROLE_ARN`), you can deploy the same way the workflow does: **your laptop’s AWS credentials** + **Docker** + **CDK** + **S3 / CloudFront**.

## Prerequisites

- [AWS CLI](https://docs.aws.amazon.com/cli/) configured for the **same account** as the stack (`aws sts get-caller-identity`).
- [Docker](https://docs.docker.com/get-docker/) running.
- Node.js (for `infra/` and `client/` builds).

First-time AWS account setup (one-time): [CDK bootstrap](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html) in your region, e.g.:

```bash
npx cdk bootstrap aws://ACCOUNT_ID/us-east-1
```

## 1. Deploy or refresh infrastructure (CDK)

From the repo root:

```bash
cd infra
npm ci
npx cdk deploy --all --require-approval never
```

Note the **outputs** in the terminal (or CloudFormation console), especially:

- `EcrRepoUri` — ECR repository for the API image  
- `AlbDns` — load balancer hostname (API base)  
- `FrontendBucketName`, `FrontendCfDistId` — static site + cache invalidation  
- `ClusterName`, `ApiServiceName`, `WorkerServiceName`, `MigrateTaskDefArn`, `PrivateSubnets`, `EcsSecurityGroup` — for ECS steps below  

If the stack already exists and you only changed **app code** (not `infra/`), you can skip CDK this time and go straight to image + ECS + frontend.

## 2. Build and push the backend image to ECR

ECR repo name in code: **`lakshmi-gallery-backend`** (see `infra/lib/stack.ts`).

```bash
# Set your account and region
export AWS_REGION=us-east-1
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
export ECR_REPOSITORY=lakshmi-gallery-backend

aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$ECR_REGISTRY"

cd ../server
docker build -t "$ECR_REPOSITORY:latest" .
docker tag "$ECR_REPOSITORY:latest" "$ECR_REGISTRY/$ECR_REPOSITORY:latest"
docker push "$ECR_REGISTRY/$ECR_REPOSITORY:latest"
```

## 3. Run database migrations (one-off ECS task)

ECS must run the migrate container once (same as CI). You need **cluster**, **migrate task definition ARN**, **private subnets** (comma-separated), and **ECS security group** from CDK outputs.

Example shape (replace placeholders from your outputs):

```bash
aws ecs run-task \
  --cluster YOUR_CLUSTER_NAME \
  --task-definition YOUR_MIGRATE_TASK_DEF_ARN \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-aaa,subnet-bbb],securityGroups=[sg-ccc],assignPublicIp=DISABLED}"
```

Wait until the task stops, then check exit code in the ECS console or:

```bash
aws ecs describe-tasks --cluster YOUR_CLUSTER_NAME --tasks TASK_ARN \
  --query 'tasks[0].containers[0].exitCode'
```

(`0` = success.)

## 4. Roll the API and worker to the new image

```bash
aws ecs update-service --cluster YOUR_CLUSTER_NAME --service YOUR_API_SERVICE_NAME --force-new-deployment
aws ecs update-service --cluster YOUR_CLUSTER_NAME --service YOUR_WORKER_SERVICE_NAME --force-new-deployment
```

## 5. Build and upload the frontend

The client build uses relative **`/api`** only (no `http://` API base). Production traffic goes **HTTPS → CloudFront → `/api/*` → ALB** after CDK deploy (`frontendDistribution.addBehavior` in `infra/lib/stack.ts`). Local dev uses Vite’s `/api` proxy.

```bash
cd ../client
npm ci
npm run build
```

Upload to the **frontend bucket** and refresh CloudFront (replace names/IDs from CDK outputs):

```bash
export BUCKET=YOUR_FRONTEND_BUCKET_NAME
export DIST_ID=YOUR_FRONTEND_CLOUDFRONT_DIST_ID

aws s3 sync dist/ "s3://$BUCKET/" \
  --delete \
  --cache-control "public, max-age=31536000, immutable" \
  --exclude "index.html" \
  --exclude "*.json"

aws s3 cp dist/index.html "s3://$BUCKET/index.html" \
  --cache-control "public, max-age=0, must-revalidate"

aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*"
```

## Summary

| Step | What |
|------|------|
| `cdk deploy` | Infra (when `infra/` changed or first time) |
| `docker build` + `docker push` | New API/worker/migrate image `:latest` on ECR |
| `ecs run-task` (migrate) | DB migrations |
| `ecs update-service --force-new-deployment` ×2 | API + worker pick up new image |
| `vite build` + `s3 sync` + CloudFront invalidation | Frontend |

This matches what `.github/workflows/deploy.yml` automates, minus GitHub’s OIDC login.
