# AWS EC2 Setup Guide

One-time steps to move from home server to EC2. After this, deploys work exactly
as before via GitHub Actions — just SSH into EC2 instead of your home server.

---

## 1. Create EC2 instance role (one-time, done by you with admin credentials)

The deploy role doesn't have IAM permissions, so create this manually once:

```bash
# Create the role
aws iam create-role \
  --role-name musicone-ec2-instance-role \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}'

# Attach SSM managed policy so you can shell in without SSH
aws iam attach-role-policy \
  --role-name musicone-ec2-instance-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore

# Create instance profile and add the role to it
aws iam create-instance-profile --instance-profile-name musicone-ec2-profile
aws iam add-role-to-instance-profile \
  --instance-profile-name musicone-ec2-profile \
  --role-name musicone-ec2-instance-role
```

Also create and attach the deploy policy to the role you'll hand over:

```bash
aws iam create-policy \
  --policy-name musicone-deploy-policy \
  --policy-document file://infra/iam-deploy-policy.json
```

Then attach `musicone-deploy-policy` to the role you'll hand over.

---

## 2. Run the provision script

This launches the instance, creates the security group, and allocates an Elastic IP:

```bash
DEPLOY_ROLE_ARN=arn:aws:iam::<account>:role/<role> bash infra/aws-provision.sh
```

The script prints the public IP at the end — use it for DNS and the GitHub secret.

---

## 3. Point DNS to EC2

Add A records pointing to the Elastic IP output by the script:

```
api.themusic.one     → <PUBLIC_IP>
grafana.themusic.one → <PUBLIC_IP>
```

---

## 4. Bootstrap the instance

SSH in and run the setup script (user-data runs it automatically, but you can verify):

```bash
ssh -i ~/.ssh/musicone-ec2.pem ec2-user@<PUBLIC_IP>
# Wait ~2 min after launch for user-data to finish, then:
docker --version && caddy version
```

---

## 5. Clone the repo and configure Caddy

```bash
ssh -i ~/.ssh/musicone-ec2.pem ec2-user@<PUBLIC_IP>

git clone https://github.com/<your-org>/music-search-links.git /opt/musicone
sudo cp /opt/musicone/infra/Caddyfile /etc/caddy/Caddyfile
sudo systemctl restart caddy

# Verify TLS (may take ~30s for cert provisioning)
curl -I https://api.themusic.one/musicone/api/health
```

---

## 6. Create the prod env file on EC2

```bash
sudo tee /opt/musicone/.env.prod.sh > /dev/null <<'EOF'
export DATABASE_URL="<your-value>"
export SUPABASE_URL="<your-value>"
export SUPABASE_ANON_KEY="<your-value>"
export YOUTUBE_API_KEY="<your-value>"
export SPOTIFY_CLIENT_ID="<your-value>"
export SPOTIFY_CLIENT_SECRET="<your-value>"
export ODESLI_API_KEY="<your-value>"
export ALLOWED_ORIGINS="https://themusic.one,https://www.themusic.one"
export FRONTEND_URL="https://themusic.one"
export COOKIE_DOMAIN=".themusic.one"
export COOKIE_SAMESITE="lax"
export GRAFANA_PASSWORD="<your-value>"
export GF_SERVER_ROOT_URL="https://grafana.themusic.one"
EOF
chmod 600 /opt/musicone/.env.prod.sh
```

> GitHub Actions passes env vars directly via `appleboy/ssh-action` — this file is only needed for manual runs.

---

## 7. First manual deploy (smoke test before wiring CI)

```bash
ssh -i ~/.ssh/musicone-ec2.pem ec2-user@<PUBLIC_IP>
cd /opt/musicone && source .env.prod.sh

COMPOSE_PROJECT_NAME=musicone-prod \
  docker compose -f docker-compose.yml up -d loki promtail grafana

COMPOSE_PROJECT_NAME=musicone-prod \
  docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build api

COMPOSE_PROJECT_NAME=musicone-staging \
  docker compose -f docker-compose.yml -f docker-compose.staging.yml up -d --build api

curl https://api.themusic.one/musicone/api/health
curl https://api.themusic.one/musicone-staging/api/health
curl https://grafana.themusic.one/api/health
```

---

## 8. Add GitHub secrets

| Secret | Value |
|--------|-------|
| `EC2_HOST` | The Elastic IP from the provision script |
| `EC2_SSH_KEY` | Full contents of `~/.ssh/musicone-ec2.pem` |

All other secrets (`DATABASE_URL`, `SUPABASE_*`, etc.) are already in your repo — no changes needed.

---

## 9. Decommission home server

Once CI deploys are green on EC2:

1. Update `VITE_API_URL` GitHub secret to `https://api.themusic.one`
2. Remove the old self-hosted runner: repo Settings → Actions → Runners
3. Shut down the home server

---

## Ongoing costs

| Resource | Monthly |
|----------|---------|
| t4g.micro (on-demand) | ~$6.05 |
| Elastic IP (attached) | $0 |
| EBS 20 GB gp3 | ~$1.60 |
| Data transfer (first 100 GB free) | $0 |
| **Total** | **~$7.65/mo** |

Switch to a 1-year No Upfront Savings Plan to bring it to ~$3.80/mo.
