$ErrorActionPreference = "Stop"
$AWS_REGION = "us-east-1"
$CERT_ARN = "arn:aws:acm:us-east-1:656373082056:certificate/532b54a1-3618-4d49-bdd6-ded8e33e9849"
$ALB_ARN = "arn:aws:elasticloadbalancing:us-east-1:656373082056:loadbalancer/app/hadaf-api-alb/6e5c40484b347a88"
$TG_ARN = "arn:aws:elasticloadbalancing:us-east-1:656373082056:targetgroup/hadaf-api-tg/85e673ef9e8178e3"

Write-Host "Checking ACM SSL Certificate status for api.hadaf.co.in..." -ForegroundColor Cyan
$status = (aws acm describe-certificate --certificate-arn $CERT_ARN --region $AWS_REGION --query "Certificate.Status" --output text).Trim()
Write-Host "Current Certificate Status: $status" -ForegroundColor Yellow

if ($status -ne "ISSUED") {
  Write-Host "Certificate is still $status. Waiting for GoDaddy DNS propagation..." -ForegroundColor Yellow
  exit 1
}

Write-Host "Creating HTTPS (443) listener on hadaf-api-alb..." -ForegroundColor Cyan
aws elbv2 create-listener `
  --load-balancer-arn $ALB_ARN `
  --protocol HTTPS `
  --port 443 `
  --certificates CertificateArn=$CERT_ARN `
  --default-actions Type=forward,TargetGroupArn=$TG_ARN `
  --region $AWS_REGION | Out-Null

Write-Host "[OK] HTTPS (443) listener active on https://api.hadaf.co.in !" -ForegroundColor Green

