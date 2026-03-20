import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecsPatterns from "aws-cdk-lib/aws-ecs-patterns";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as rds from "aws-cdk-lib/aws-rds";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import { Construct } from "constructs";

export interface LakshmiGalleryStackProps extends cdk.StackProps {
  appName: string;
}

export class LakshmiGalleryStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: LakshmiGalleryStackProps) {
    super(scope, id, props);

    const { appName } = props;

    // ─── A) Networking ───
    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        { name: "public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: "private", subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
      ],
    });

    const ecsSg = new ec2.SecurityGroup(this, "EcsSg", { vpc, description: "ECS tasks" });
    const rdsSg = new ec2.SecurityGroup(this, "RdsSg", { vpc, description: "RDS" });
    rdsSg.addIngressRule(ecsSg, ec2.Port.tcp(5432), "ecs-to-rds-5432");

    // ─── B) ECR (import existing repo or create) ───
    const ecrRepoName = `${appName}-backend`;
    const repo = ecr.Repository.fromRepositoryName(this, "BackendRepo", ecrRepoName);

    // ─── C) RDS Postgres ───
    const dbCredentials = rds.Credentials.fromGeneratedSecret("gallery_admin", {
      secretName: `${appName}/rds-credentials`,
    });
    const dbInstance = new rds.DatabaseInstance(this, "Postgres", {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16_4 }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [rdsSg],
      credentials: dbCredentials,
      databaseName: "gallery",
      multiAz: false,
      allocatedStorage: 20,
      maxAllocatedStorage: 50,
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
      deletionProtection: false,
    });

    // We pass individual RDS connection fields as env/secrets so the Docker entrypoint
    // composes DATABASE_URL at runtime. See server/docker-entrypoint.sh.

    // ─── Application Secrets ───
    const sessionSecret = new secretsmanager.Secret(this, "SessionSecret", {
      secretName: `${appName}/session-secret`,
      generateSecretString: { excludePunctuation: true, passwordLength: 48 },
    });
    const adminPasswordSecret = new secretsmanager.Secret(this, "AdminPasswordSecret", {
      secretName: `${appName}/admin-password`,
      generateSecretString: { excludePunctuation: false, passwordLength: 24 },
    });
    const cfPrivateKeySecret = new secretsmanager.Secret(this, "CfPrivateKeySecret", {
      secretName: `${appName}/cloudfront-private-key`,
      description: "CloudFront signing private key (PEM). Set manually after deploy.",
    });
    const cfKeyPairIdSecret = new secretsmanager.Secret(this, "CfKeyPairIdSecret", {
      secretName: `${appName}/cloudfront-key-pair-id`,
      description: "CloudFront key pair ID. Set manually after deploy.",
    });

    // ─── D) S3 Media Bucket (import existing) ───
    const mediaBucketName = `${appName}-media-${this.account}`;
    const mediaBucket = s3.Bucket.fromBucketName(this, "MediaBucket", mediaBucketName);

    // ─── E) CloudFront Media Distribution ───
    const oac = new cloudfront.S3OriginAccessControl(this, "MediaOac", {
      signing: cloudfront.Signing.SIGV4_ALWAYS,
    });
    const mediaDistribution = new cloudfront.Distribution(this, "MediaCf", {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(mediaBucket, { originAccessControl: oac }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
      },
    });

    // ─── F) Frontend S3 + CloudFront ───
    const frontendBucket = new s3.Bucket(this, "FrontendBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    const frontendOac = new cloudfront.S3OriginAccessControl(this, "FrontendOac", {
      signing: cloudfront.Signing.SIGV4_ALWAYS,
    });
    const frontendDistribution = new cloudfront.Distribution(this, "FrontendCf", {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(frontendBucket, { originAccessControl: frontendOac }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      defaultRootObject: "index.html",
      errorResponses: [
        { httpStatus: 403, responsePagePath: "/index.html", responseHttpStatus: 200, ttl: cdk.Duration.seconds(0) },
        { httpStatus: 404, responsePagePath: "/index.html", responseHttpStatus: 200, ttl: cdk.Duration.seconds(0) },
      ],
    });

    // ─── G) SQS ───
    const dlq = new sqs.Queue(this, "DLQ", {
      queueName: `${appName}-dlq`,
      retentionPeriod: cdk.Duration.days(14),
    });
    const jobQueue = new sqs.Queue(this, "JobQueue", {
      queueName: `${appName}-jobs`,
      visibilityTimeout: cdk.Duration.minutes(10),
      retentionPeriod: cdk.Duration.days(4),
      deadLetterQueue: { queue: dlq, maxReceiveCount: 5 },
    });

    // ─── H) ECS Cluster ───
    const cluster = new ecs.Cluster(this, "Cluster", {
      vpc,
      clusterName: `${appName}-cluster`,
      containerInsights: true,
    });

    // Shared task execution role for pulling from ECR + Secrets Manager
    const executionRole = new iam.Role(this, "TaskExecRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonECSTaskExecutionRolePolicy")],
    });
    // Allow reading all app secrets
    for (const secret of [sessionSecret, adminPasswordSecret, cfPrivateKeySecret, cfKeyPairIdSecret, dbInstance.secret!]) {
      secret.grantRead(executionRole);
    }

    // ── API task role ──
    const apiTaskRole = new iam.Role(this, "ApiTaskRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    });
    jobQueue.grantSendMessages(apiTaskRole);
    apiTaskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:AbortMultipartUpload",
          "s3:ListMultipartUploadParts",
        ],
        resources: [mediaBucket.arnForObjects("galleries/*")],
      }),
    );
    apiTaskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["s3:ListBucketMultipartUploads"],
        resources: [mediaBucket.bucketArn],
      }),
    );

    // ── Worker task role ──
    const workerTaskRole = new iam.Role(this, "WorkerTaskRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    });
    workerTaskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:AbortMultipartUpload",
          "s3:ListMultipartUploadParts",
        ],
        resources: [mediaBucket.arnForObjects("galleries/*")],
      }),
    );
    workerTaskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["s3:ListBucketMultipartUploads"],
        resources: [mediaBucket.bucketArn],
      }),
    );
    jobQueue.grantConsumeMessages(workerTaskRole);
    workerTaskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["sqs:ChangeMessageVisibility"],
        resources: [jobQueue.queueArn],
      }),
    );
    workerTaskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "rekognition:CreateCollection",
          "rekognition:DescribeCollection",
          "rekognition:IndexFaces",
          "rekognition:SearchFacesByImage",
          "rekognition:ListCollections",
        ],
        resources: ["*"],
      }),
    );

    // ── Shared environment ──
    const sharedEnv: Record<string, string> = {
      NODE_ENV: "production",
      PORT: "4000",
      AWS_REGION: this.region,
      S3_BUCKET: mediaBucket.bucketName,
      CLOUDFRONT_DOMAIN: mediaDistribution.distributionDomainName,
      REKOGNITION_COLLECTION_ID_PREFIX: appName,
      SQS_QUEUE_URL: jobQueue.queueUrl,
      ALLOWED_ORIGINS: `https://${frontendDistribution.distributionDomainName}`,
      PUBLIC_APP_URL: `https://${frontendDistribution.distributionDomainName}`,
      DB_HOST: dbInstance.dbInstanceEndpointAddress,
      DB_PORT: dbInstance.dbInstanceEndpointPort,
      DB_NAME: "gallery",
    };

    const sharedSecrets: Record<string, ecs.Secret> = {
      DB_USERNAME: ecs.Secret.fromSecretsManager(dbInstance.secret!, "username"),
      DB_PASSWORD: ecs.Secret.fromSecretsManager(dbInstance.secret!, "password"),
      SESSION_SECRET: ecs.Secret.fromSecretsManager(sessionSecret),
      ADMIN_PASSWORD: ecs.Secret.fromSecretsManager(adminPasswordSecret),
      CLOUDFRONT_PRIVATE_KEY: ecs.Secret.fromSecretsManager(cfPrivateKeySecret),
      CLOUDFRONT_KEY_PAIR_ID: ecs.Secret.fromSecretsManager(cfKeyPairIdSecret),
    };

    // ── API Service ──
    const apiLogGroup = new logs.LogGroup(this, "ApiLogs", {
      logGroupName: `/ecs/${appName}/api`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const apiTaskDef = new ecs.FargateTaskDefinition(this, "ApiTaskDef", {
      memoryLimitMiB: 512,
      cpu: 256,
      executionRole,
      taskRole: apiTaskRole,
    });
    apiTaskDef.addContainer("api", {
      image: ecs.ContainerImage.fromEcrRepository(repo, "latest"),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "api", logGroup: apiLogGroup }),
      environment: sharedEnv,
      secrets: sharedSecrets,
      portMappings: [{ containerPort: 4000 }],
    });
    const apiService = new ecsPatterns.ApplicationLoadBalancedFargateService(this, "ApiService", {
      cluster,
      serviceName: `${appName}-api`,
      taskDefinition: apiTaskDef,
      desiredCount: 1,
      assignPublicIp: false,
      taskSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [ecsSg],
      publicLoadBalancer: true,
      listenerPort: 80,
      healthCheck: { command: ["CMD-SHELL", "wget -qO- http://localhost:4000/health || exit 1"], interval: cdk.Duration.seconds(30), timeout: cdk.Duration.seconds(5), retries: 3 },
    });
    apiService.targetGroup.configureHealthCheck({ path: "/health", interval: cdk.Duration.seconds(30) });

    // ── Worker Service ──
    const workerLogGroup = new logs.LogGroup(this, "WorkerLogs", {
      logGroupName: `/ecs/${appName}/worker`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const workerTaskDef = new ecs.FargateTaskDefinition(this, "WorkerTaskDef", {
      memoryLimitMiB: 1024,
      cpu: 512,
      executionRole,
      taskRole: workerTaskRole,
    });
    workerTaskDef.addContainer("worker", {
      image: ecs.ContainerImage.fromEcrRepository(repo, "latest"),
      command: ["node", "dist/src/worker/run.js"],
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "worker", logGroup: workerLogGroup }),
      environment: sharedEnv,
      secrets: sharedSecrets,
    });
    const workerService = new ecs.FargateService(this, "WorkerService", {
      cluster,
      serviceName: `${appName}-worker`,
      taskDefinition: workerTaskDef,
      desiredCount: 1,
      assignPublicIp: false,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [ecsSg],
    });

    // ─── J) Migration Task Definition ───
    const migrateTaskDef = new ecs.FargateTaskDefinition(this, "MigrateTaskDef", {
      memoryLimitMiB: 512,
      cpu: 256,
      executionRole,
      taskRole: apiTaskRole,
    });
    migrateTaskDef.addContainer("migrate", {
      image: ecs.ContainerImage.fromEcrRepository(repo, "latest"),
      command: ["node", "dist/src/db/migrate-run.js"],
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "migrate",
        logGroup: new logs.LogGroup(this, "MigrateLogs", {
          logGroupName: `/ecs/${appName}/migrate`,
          retention: logs.RetentionDays.ONE_WEEK,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        }),
      }),
      environment: sharedEnv,
      secrets: sharedSecrets,
    });

    // DATABASE_URL is composed at container startup from DB_HOST, DB_PORT, DB_NAME,
    // DB_USERNAME, DB_PASSWORD via docker-entrypoint.sh

    // ─── Outputs ───
    new cdk.CfnOutput(this, "EcrRepoUri", { value: repo.repositoryUri });
    new cdk.CfnOutput(this, "MediaBucketName", { value: mediaBucket.bucketName });
    new cdk.CfnOutput(this, "MediaCfDomain", { value: mediaDistribution.distributionDomainName });
    new cdk.CfnOutput(this, "MediaCfDistId", { value: mediaDistribution.distributionId });
    new cdk.CfnOutput(this, "FrontendBucketName", { value: frontendBucket.bucketName });
    new cdk.CfnOutput(this, "FrontendCfDomain", { value: frontendDistribution.distributionDomainName });
    new cdk.CfnOutput(this, "FrontendCfDistId", { value: frontendDistribution.distributionId });
    new cdk.CfnOutput(this, "SqsQueueUrl", { value: jobQueue.queueUrl });
    new cdk.CfnOutput(this, "SqsDlqUrl", { value: dlq.queueUrl });
    new cdk.CfnOutput(this, "RdsEndpoint", { value: dbInstance.dbInstanceEndpointAddress });
    new cdk.CfnOutput(this, "ClusterName", { value: cluster.clusterName });
    new cdk.CfnOutput(this, "ApiServiceName", { value: apiService.service.serviceName });
    new cdk.CfnOutput(this, "WorkerServiceName", { value: workerService.serviceName });
    new cdk.CfnOutput(this, "MigrateTaskDefArn", { value: migrateTaskDef.taskDefinitionArn });
    new cdk.CfnOutput(this, "VpcId", { value: vpc.vpcId });
    new cdk.CfnOutput(this, "PrivateSubnets", { value: vpc.privateSubnets.map((s) => s.subnetId).join(",") });
    new cdk.CfnOutput(this, "EcsSecurityGroup", { value: ecsSg.securityGroupId });
    new cdk.CfnOutput(this, "AlbDns", { value: apiService.loadBalancer.loadBalancerDnsName });
  }
}
