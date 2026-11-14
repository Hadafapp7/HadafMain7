# Deploying the Hadaf API on AWS ECS (Fargate)

The repo root [`Dockerfile`](../Dockerfile) builds the API server (`artifacts/api-server`) into a small Node 22 image.
Steps below replace the Lightsail box (`44.206.122.220`). Replace `ACCOUNT_ID` and the region (`us-east-1`) as needed.

## 1. Build and test the image locally

```powershell
cd C:\Hadaf-App\Hadaf-App
docker build -t hadaf-api .
docker run --rm -p 5000:5000 --env-file artifacts\api-server\.env hadaf-api
curl.exe http://localhost:5000/api/healthz        # -> {"status":"ok"}
```

> The image never contains `.env` files (see `.dockerignore`). Secrets are injected at runtime.

## 2. Push to ECR

```powershell
aws ecr create-repository --repository-name hadaf-api --region us-east-1
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com
docker tag hadaf-api:latest ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/hadaf-api:latest
docker push ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/hadaf-api:latest
```

## 3. Store secrets in AWS Secrets Manager (or SSM Parameter Store)

Create one secret per value (names used by [`ecs/task-definition.json`](../ecs/task-definition.json)):
`hadaf/DATABASE_URL`, `hadaf/CLERK_SECRET_KEY`, `hadaf/REVENUECAT_SECRET_API_KEY`, `hadaf/ADMIN_API_KEY`.

Plain settings go straight into the task definition: `NODE_ENV=production`, `PORT=5000`, `CLERK_PUBLISHABLE_KEY`,
`AWS_REGION`, `BEDROCK_MODEL_ID`, `AWS_SES_REGION`, `SES_FROM_EMAIL`, `SES_REPLY_TO`, `REVENUECAT_ENTITLEMENT_ID`,
and `OTP_RETURN_IN_RESPONSE=true` while no SMS provider is connected.

## 4. IAM roles

* **Execution role** (`ecsTaskExecutionRole`): the AWS managed policy `AmazonECSTaskExecutionRolePolicy` + `secretsmanager:GetSecretValue`
  on the `hadaf/*` secrets (so ECS can pull the image and inject secrets).
* **Task role** (`hadafApiTaskRole`): `bedrock:InvokeModel`, `bedrock:InvokeModelWithResponseStream`, `ses:SendEmail`.
  The API now detects the task role automatically, so **no `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` is needed on ECS**
  (remove the long-lived keys from the environment).

## 5. Network + load balancer

1. Create an **Application Load Balancer** (internet-facing, public subnets) with an HTTPS :443 listener and an ACM certificate for
   `api.hadaf.co.in` (request it in ACM, validate via the GoDaddy DNS CNAME it shows you).
2. Target group: type **IP**, protocol HTTP, port **5000**, health check path **`/api/healthz`**.
3. Security groups: ALB allows 80/443 from anywhere; the ECS service SG allows **5000 only from the ALB SG**.
4. The task needs outbound internet (Supabase, Clerk, Bedrock): use public subnets with *Assign public IP = ENABLED*
   (cheapest) or private subnets + NAT gateway.

## 6. Cluster, task definition and service

```powershell
aws ecs create-cluster --cluster-name hadaf
aws logs create-log-group --log-group-name /ecs/hadaf-api
# edit ecs\task-definition.json (ACCOUNT_ID, role ARNs, secret ARNs) then:
aws ecs register-task-definition --cli-input-json file://ecs/task-definition.json
aws ecs create-service --cluster hadaf --service-name hadaf-api --task-definition hadaf-api --desired-count 1 --launch-type FARGATE `
  --network-configuration "awsvpcConfiguration={subnets=[subnet-AAA,subnet-BBB],securityGroups=[sg-XXXX],assignPublicIp=ENABLED}" `
  --load-balancers "targetGroupArn=arn:aws:elasticloadbalancing:us-east-1:ACCOUNT_ID:targetgroup/hadaf-api/XXXX,containerName=hadaf-api,containerPort=5000" `
  --health-check-grace-period-seconds 60
```

Use at least **0.5 vCPU / 1 GB** — the 512 MB Lightsail box froze under memory pressure.

## 7. Cut over DNS (no app update required)

The mobile app already talks to `https://api.hadaf.co.in`. In GoDaddy, change the `api` record from the Lightsail IP `A` record
to a **CNAME → the ALB DNS name** (`hadaf-alb-123.us-east-1.elb.amazonaws.com`). Wait for the TTL, verify, then stop the Lightsail instance:

```powershell
curl.exe -i https://api.hadaf.co.in/api/users/me     # expect 401 + x-clerk-auth-status: signed-out
```

## 8. Deploying a new version

```powershell
docker build -t hadaf-api . ; docker tag hadaf-api:latest ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/hadaf-api:latest ; docker push ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/hadaf-api:latest
aws ecs update-service --cluster hadaf --service hadaf-api --force-new-deployment
```

## Logs

`aws logs tail /ecs/hadaf-api --follow` (or CloudWatch → Log groups → `/ecs/hadaf-api`). This replaces `pm2 logs`.

## Database notes

On every boot the API runs additive, idempotent schema fix-ups (`artifacts/api-server/src/lib/schema-sync.ts`), e.g. the
`goals.block_apps` / `forfeit_*` columns, so deploys do not need a manual migration step.

