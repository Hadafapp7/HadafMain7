$ErrorActionPreference = "Continue"
$AWS_REGION = "us-east-1"

Write-Host "`n=== 1. Uploading Secrets from artifacts/api-server/.env to AWS SSM Parameter Store ===" -ForegroundColor Cyan
$envVars = @{}
Get-Content "artifacts\api-server\.env" | ForEach-Object {
  if ($_ -match "^\s*([A-Z0-9_]+)\s*=\s*(.+)$") {
    $envVars[$matches[1]] = $matches[2].Trim()
  }
}

$secretKeys = @(
  "DATABASE_URL",
  "CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "REVENUECAT_SECRET_API_KEY",
  "ADMIN_API_KEY"
)

foreach ($key in $secretKeys) {
  if ($envVars.ContainsKey($key) -and $envVars[$key]) {
    aws ssm put-parameter `
      --name "/hadaf/prod/$key" `
      --type "SecureString" `
      --value $envVars[$key] `
      --overwrite `
      --region $AWS_REGION | Out-Null
    Write-Host "  [OK] Uploaded /hadaf/prod/$key" -ForegroundColor Green
  }
}

Write-Host "`n=== 2. Creating CloudWatch Log Group (/ecs/hadaf-api) ===" -ForegroundColor Cyan
aws logs create-log-group --log-group-name /ecs/hadaf-api --region $AWS_REGION 2>$null
aws logs put-retention-policy --log-group-name /ecs/hadaf-api --retention-in-days 14 --region $AWS_REGION 2>$null
Write-Host "  [OK] Log group /ecs/hadaf-api ready" -ForegroundColor Green

Write-Host "`n=== 3. Creating IAM Roles (hadafEcsTaskRole & ecsTaskExecutionRole) ===" -ForegroundColor Cyan
aws iam create-role --role-name hadafEcsTaskRole --assume-role-policy-document file://ecs/trust-policy.json 2>$null | Out-Null
aws iam attach-role-policy --role-name hadafEcsTaskRole --policy-arn arn:aws:iam::aws:policy/AmazonBedrockFullAccess
aws iam attach-role-policy --role-name hadafEcsTaskRole --policy-arn arn:aws:iam::aws:policy/AmazonSESFullAccess
Write-Host "  [OK] hadafEcsTaskRole configured" -ForegroundColor Green

aws iam create-role --role-name ecsTaskExecutionRole --assume-role-policy-document file://ecs/trust-policy.json 2>$null | Out-Null
aws iam attach-role-policy --role-name ecsTaskExecutionRole --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
aws iam attach-role-policy --role-name ecsTaskExecutionRole --policy-arn arn:aws:iam::aws:policy/AmazonSSMReadOnlyAccess
Write-Host "  [OK] ecsTaskExecutionRole configured" -ForegroundColor Green

Write-Host "`n=== 4. Registering ECS Task Definition (hadaf-api) ===" -ForegroundColor Cyan
aws ecs register-task-definition --cli-input-json file://ecs/task-definition.json --region $AWS_REGION | Out-Null
Write-Host "  [OK] Task definition 'hadaf-api' registered successfully!" -ForegroundColor Green

Write-Host "`n=== 5. Creating ECS Cluster (hadaf-cluster) ===" -ForegroundColor Cyan
aws iam create-service-linked-role --aws-service-name ecs.amazonaws.com 2>$null | Out-Null
Start-Sleep -Seconds 2
aws ecs create-cluster --cluster-name hadaf-cluster --capacity-providers FARGATE FARGATE_SPOT --region $AWS_REGION | Out-Null
Write-Host "  [OK] ECS Cluster 'hadaf-cluster' is ready!" -ForegroundColor Green

Write-Host "`nAll CLI setup complete! Now open the AWS ECS Console to launch the service in 'hadaf-cluster'." -ForegroundColor Yellow

