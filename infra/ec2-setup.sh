#!/bin/bash
# One-time bootstrap for EC2 t4g.micro (Amazon Linux 2023, ARM64).
# Run as root via EC2 user data or manually: sudo bash ec2-setup.sh
set -euo pipefail

# ── Docker ────────────────────────────────────────────────────────────────────
dnf install -y docker git
systemctl enable --now docker
usermod -aG docker ec2-user

# docker-compose v2 plugin
mkdir -p /usr/local/lib/docker/cli-plugins
curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-aarch64" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# docker buildx plugin
BUILDX_VERSION=$(curl -sf https://api.github.com/repos/docker/buildx/releases/latest | python3 -c "import sys,json; print(json.load(sys.stdin)['tag_name'])")
curl -SL "https://github.com/docker/buildx/releases/download/${BUILDX_VERSION}/buildx-${BUILDX_VERSION}.linux-arm64" \
  -o /usr/local/lib/docker/cli-plugins/docker-buildx
chmod +x /usr/local/lib/docker/cli-plugins/docker-buildx

# ── Caddy (static binary — AL2023 has no package repo for Caddy) ──────────────
ARCH=$(uname -m)
CADDY_VERSION=$(curl -sf https://api.github.com/repos/caddyserver/caddy/releases/latest \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['tag_name'])")
CADDY_ARCH="${ARCH/x86_64/amd64}"
CADDY_ARCH="${CADDY_ARCH/aarch64/arm64}"
curl -SL "https://github.com/caddyserver/caddy/releases/download/${CADDY_VERSION}/caddy_${CADDY_VERSION#v}_linux_${CADDY_ARCH}.tar.gz" \
  | tar -xz -C /usr/local/bin caddy
chmod +x /usr/local/bin/caddy

# caddy system user and dirs
useradd --system --no-create-home --shell /usr/sbin/nologin caddy 2>/dev/null || true
mkdir -p /etc/caddy /var/lib/caddy
chown caddy:caddy /var/lib/caddy

# systemd service
cat > /etc/systemd/system/caddy.service <<'EOF'
[Unit]
Description=Caddy
After=network-online.target
Wants=network-online.target

[Service]
User=caddy
Group=caddy
ExecStart=/usr/local/bin/caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
ExecReload=/usr/local/bin/caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
TimeoutStopSec=5s
AmbientCapabilities=CAP_NET_BIND_SERVICE
Environment=HOME=/var/lib/caddy

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable caddy

# ── SSM Agent (pre-installed on AL2023, ensure it's running) ──────────────────
systemctl enable --now amazon-ssm-agent

# ── App directory ─────────────────────────────────────────────────────────────
mkdir -p /opt/musicone
chown ec2-user:ec2-user /opt/musicone

echo "Bootstrap complete. Next: copy Caddyfile, clone repo, set env vars."
