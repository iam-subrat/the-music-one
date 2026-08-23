#!/bin/bash
# Provisions all AWS resources for MusicOne EC2 deployment.
#
# Usage:
#   AWS_PROFILE=<profile> bash infra/aws-provision.sh
#
# Prerequisites:
#   - AWS CLI v2 configured with a profile whose user has musicone-deploy-policy attached
#   - Your SSH public key already imported into EC2 as a key pair, OR
#     set KEY_PAIR_NAME to an existing key pair name
set -euo pipefail

# ── Configuration — edit these ────────────────────────────────────────────────
REGION="ap-south-1"                       # Match your Supabase region
KEY_PAIR_NAME="musicone-ec2"              # EC2 key pair name
INSTANCE_TYPE="t4g.micro"                 # ARM64; use t3.micro for x86 free tier
PROJECT_TAG="musicone"
# ─────────────────────────────────────────────────────────────────────────────

if [[ -z "${AWS_PROFILE:-}" ]]; then
  echo "Error: AWS_PROFILE is not set."
  echo "Usage: AWS_PROFILE=<profile> bash infra/aws-provision.sh"
  exit 1
fi

export AWS_PROFILE
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "Running as account: $ACCOUNT_ID  Region: $REGION"

# ── 1. Verify EC2 instance profile exists (created manually — see docs) ───────
# The musicone-ec2-profile must be created by you before running this script.
# It requires IAM permissions outside the scope of the deploy role.
# See docs/aws-ec2-setup.md → "Create EC2 instance role" for the one-time steps.
INSTANCE_PROFILE=$(aws iam get-instance-profile \
  --instance-profile-name musicone-ec2-profile \
  --query InstanceProfile.InstanceProfileName --output text 2>/dev/null || true)

if [[ -z "$INSTANCE_PROFILE" ]]; then
  echo "Error: Instance profile 'musicone-ec2-profile' not found."
  echo "Create it first — see docs/aws-ec2-setup.md → 'Create EC2 instance role'."
  exit 1
fi
echo "→ Instance profile verified: musicone-ec2-profile"

# ── 2. Security group ─────────────────────────────────────────────────────────
echo "→ Creating security group..."

VPC_ID=$(aws ec2 describe-vpcs \
  --filters Name=isDefault,Values=true \
  --query "Vpcs[0].VpcId" --output text --region "$REGION")

SG_ID=$(aws ec2 create-security-group \
  --group-name musicone-sg \
  --description "MusicOne API + Caddy" \
  --vpc-id "$VPC_ID" \
  --region "$REGION" \
  --query GroupId --output text 2>/dev/null) || true

if [[ -z "$SG_ID" || "$SG_ID" == "None" ]]; then
  SG_ID=$(aws ec2 describe-security-groups \
    --filters Name=group-name,Values=musicone-sg Name=vpc-id,Values="$VPC_ID" \
    --query "SecurityGroups[0].GroupId" \
    --output text --region "$REGION")
fi

echo "  Security group: $SG_ID"

# HTTP (Caddy ACME challenge + redirect)
aws ec2 authorize-security-group-ingress \
  --group-id "$SG_ID" --region "$REGION" \
  --protocol tcp --port 80 --cidr 0.0.0.0/0 2>/dev/null || true

# HTTPS
aws ec2 authorize-security-group-ingress \
  --group-id "$SG_ID" --region "$REGION" \
  --protocol tcp --port 443 --cidr 0.0.0.0/0 2>/dev/null || true

# SSH — restricted to your current public IP
MY_IP=$(curl -sf https://checkip.amazonaws.com)
aws ec2 authorize-security-group-ingress \
  --group-id "$SG_ID" --region "$REGION" \
  --protocol tcp --port 22 --cidr "${MY_IP}/32" 2>/dev/null || true

echo "  SSH restricted to: $MY_IP"

aws ec2 create-tags --resources "$SG_ID" --region "$REGION" \
  --tags Key=Project,Value="$PROJECT_TAG" Key=Name,Value=musicone-sg

# ── 3. Find latest Amazon Linux 2023 ARM64 AMI ───────────────────────────────
echo "→ Finding latest AL2023 ARM64 AMI..."

AMI_ID=$(aws ec2 describe-images \
  --owners amazon \
  --filters \
    Name=name,Values="al2023-ami-*-arm64" \
    Name=state,Values=available \
  --query "sort_by(Images, &CreationDate)[-1].ImageId" \
  --output text --region "$REGION")

echo "  AMI: $AMI_ID"

# ── 4. Launch EC2 instance ────────────────────────────────────────────────────
echo "→ Launching EC2 instance..."

INSTANCE_ID=$(aws ec2 run-instances \
  --image-id "$AMI_ID" \
  --instance-type "$INSTANCE_TYPE" \
  --key-name "$KEY_PAIR_NAME" \
  --security-group-ids "$SG_ID" \
  --iam-instance-profile Name=musicone-ec2-profile \
  --block-device-mappings '[{"DeviceName":"/dev/xvda","Ebs":{"VolumeSize":30,"VolumeType":"gp3","DeleteOnTermination":true}}]' \
  --user-data file://$(dirname "$0")/ec2-setup.sh \
  --tag-specifications \
    "ResourceType=instance,Tags=[{Key=Name,Value=musicone-prod},{Key=Project,Value=$PROJECT_TAG}]" \
    "ResourceType=volume,Tags=[{Key=Project,Value=$PROJECT_TAG}]" \
  --region "$REGION" \
  --query "Instances[0].InstanceId" --output text)

echo "  Instance ID: $INSTANCE_ID"
echo "  Waiting for instance to be running..."
aws ec2 wait instance-running --instance-ids "$INSTANCE_ID" --region "$REGION"

# ── 5. Allocate and associate Elastic IP ─────────────────────────────────────
echo "→ Allocating Elastic IP..."

ALLOC_ID=$(aws ec2 allocate-address \
  --domain vpc --region "$REGION" \
  --query AllocationId --output text)

aws ec2 create-tags --resources "$ALLOC_ID" --region "$REGION" \
  --tags Key=Project,Value="$PROJECT_TAG" Key=Name,Value=musicone-eip

aws ec2 associate-address \
  --instance-id "$INSTANCE_ID" \
  --allocation-id "$ALLOC_ID" \
  --region "$REGION"

PUBLIC_IP=$(aws ec2 describe-addresses \
  --allocation-ids "$ALLOC_ID" \
  --query "Addresses[0].PublicIp" --output text --region "$REGION")

echo "  Elastic IP: $PUBLIC_IP"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Done. Resources created:"
echo "    Instance:   $INSTANCE_ID"
echo "    Public IP:  $PUBLIC_IP  ← add this to DNS + EC2_HOST GitHub secret"
echo "    Sec group:  $SG_ID"
echo ""
echo "  Next steps:"
echo "    1. Point DNS A records to $PUBLIC_IP"
echo "    2. Wait ~2 min for user-data bootstrap to finish"
echo "    3. SSH in: ssh -i ~/.ssh/${KEY_PAIR_NAME}.pem ec2-user@$PUBLIC_IP"
echo "    4. Follow docs/aws-ec2-setup.md steps 4–7"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
