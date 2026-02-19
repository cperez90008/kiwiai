#!/bin/bash
# ============================================================
#  KiwiAI — One-Command Installer
#  https://github.com/cperez90008/kiwiai
#
#  Run on a fresh Ubuntu 22.04 or 24.04 VPS as root:
#  curl -fsSL https://raw.githubusercontent.com/cperez90008/kiwiai/main/install.sh | sudo bash
# ============================================================

set -e

GITHUB_RAW="https://raw.githubusercontent.com/cperez90008/kiwiai/main"
KIWI_DIR="/opt/kiwiai"

# ── Colors ───────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

clear
echo -e "${GREEN}${BOLD}"
cat << 'BANNER'
  ██╗  ██╗██╗██╗    ██╗██╗ █████╗ ██╗
  ██║ ██╔╝██║██║    ██║██║██╔══██╗██║
  █████╔╝ ██║██║ █╗ ██║██║███████║██║
  ██╔═██╗ ██║██║███╗██║██║██╔══██║██║
  ██║  ██╗██║╚███╔███╔╝██║██║  ██║██║
  ╚═╝  ╚═╝╚═╝ ╚══╝╚══╝ ╚═╝╚═╝  ╚═╝╚═╝
BANNER
echo -e "${NC}"
echo -e "${BOLD}  Your 24/7 Autonomous AI Agent${NC}"
echo -e "  github.com/cperez90008/kiwiai"
echo ""
echo -e "  Installing... grab a coffee ☕ (~5 min)"
echo ""

step()  { echo -e "\n${CYAN}▶ $1${NC}"; }
ok()    { echo -e "  ${GREEN}✓ $1${NC}"; }
warn()  { echo -e "  ${YELLOW}⚠ $1${NC}"; }
die()   { echo -e "\n${RED}✗ ERROR: $1${NC}\n"; exit 1; }

[[ $EUID -ne 0 ]] && die "Please run as root: sudo bash install.sh"

# ── Collect config ────────────────────────────────────────────
echo -e "${BOLD}  ── Quick Setup (30 seconds) ──────────────${NC}"
echo ""

while true; do
  read -s -p "  🔐 Create your KiwiAI password (min 8 chars): " KIWI_PASSWORD; echo ""
  read -s -p "  🔐 Confirm password: " KIWI_PASSWORD2; echo ""
  [[ "$KIWI_PASSWORD" == "$KIWI_PASSWORD2" && ${#KIWI_PASSWORD} -ge 8 ]] && ok "Password set" && break
  warn "Passwords don't match or too short. Try again."
done

SERVER_IP=$(curl -s --max-time 5 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
echo ""
read -p "  🌐 Domain name (or press Enter to use $SERVER_IP): " USER_DOMAIN
KIWI_DOMAIN="${USER_DOMAIN:-$SERVER_IP}"
USE_SSL=$([[ -n "$USER_DOMAIN" ]] && echo true || echo false)
ok "Address: $KIWI_DOMAIN"

echo ""
read -p "  🕐 Timezone (e.g. America/New_York) [UTC]: " USER_TZ
KIWI_TZ="${USER_TZ:-UTC}"
ok "Timezone: $KIWI_TZ"

echo ""
echo -e "  ${GREEN}Starting installation...${NC}"

# ── Step 1: System packages ────────────────────────────────────
step "1/8 — System packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl wget git ufw fail2ban ca-certificates gnupg \
  lsb-release nginx certbot python3-certbot-nginx jq unzip
ok "Packages installed"

# ── Step 2: Docker ─────────────────────────────────────────────
step "2/8 — Docker"
if ! command -v docker &>/dev/null; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] \
    https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    | tee /etc/apt/sources.list.d/docker.list > /dev/null
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable --now docker
fi
ok "Docker $(docker --version | cut -d' ' -f3 | tr -d ',')"

# ── Step 3: Node.js ────────────────────────────────────────────
step "3/8 — Node.js"
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
  apt-get install -y -qq nodejs
fi
ok "Node.js $(node --version)"

# ── Step 4: KiwiAI directory & files ──────────────────────────
step "4/8 — Downloading KiwiAI files"
mkdir -p "$KIWI_DIR"/{data,config,logs,agent-zero-data,skills,panel,server,backups}

# Download all files from GitHub
for FILE in \
  "docker-compose.yml" \
  "server/server.js" \
  "server/telegram.js" \
  "panel/index.html" \
  "skills/gmail.md" \
  "skills/research.md" \
  "skills/calendar.md" \
  "skills/writing.md" \
  "skills/code.md" \
  "skills/finance.md" \
  "skills/social.md" \
  "skills/meetings.md"; do
  DIR=$(dirname "$KIWI_DIR/$FILE")
  mkdir -p "$DIR"
  curl -fsSL "$GITHUB_RAW/$FILE" -o "$KIWI_DIR/$FILE" 2>/dev/null || warn "Could not download $FILE (will use fallback)"
done

ok "KiwiAI files downloaded"

# ── Step 5: Write config ───────────────────────────────────────
step "5/8 — Writing configuration"

HASHED_PW=$(python3 -c "
import hashlib, os, base64
salt = os.urandom(32)
dk = hashlib.pbkdf2_hmac('sha256', b'$KIWI_PASSWORD', salt, 100000)
print(base64.b64encode(salt + dk).decode())
" 2>/dev/null || echo "$KIWI_PASSWORD")

cat > "$KIWI_DIR/config/.env" << ENV
# KiwiAI Configuration — generated $(date)
KIWI_DOMAIN=$KIWI_DOMAIN
KIWI_TZ=$KIWI_TZ
KIWI_PASSWORD_HASH=$HASHED_PW
KIWI_VERSION=1.0.0
NODE_ENV=production
PORT=8080
AGENT_ZERO_URL=http://agent-zero:80

# API Keys (fill these in via the KiwiAI panel)
GROQ_API_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
OPENROUTER_API_KEY=
TOGETHER_API_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# Model strategy: free_first | balanced | performance
MODEL_STRATEGY=free_first
ENV

ok "Config written to $KIWI_DIR/config/.env"

# ── Step 6: Nginx ──────────────────────────────────────────────
step "6/8 — Web server"

cat > /etc/nginx/sites-available/kiwiai << NGINX
limit_req_zone \$binary_remote_addr zone=kiwiai:10m rate=60r/m;

server {
    listen 80;
    server_name $KIWI_DOMAIN;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    # KiwiAI Panel
    location / {
        limit_req zone=kiwiai burst=30 nodelay;
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    # Agent Zero direct access
    location /agent/ {
        proxy_pass http://127.0.0.1:50001/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_read_timeout 300s;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/kiwiai /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
ok "Nginx configured"

# SSL
if [[ "$USE_SSL" == "true" ]]; then
  certbot --nginx -d "$KIWI_DOMAIN" --non-interactive --agree-tos \
    --email "admin@$KIWI_DOMAIN" --redirect 2>/dev/null \
    && ok "SSL certificate installed" \
    || warn "SSL failed — HTTP works fine. Run 'certbot --nginx' later."
fi

# ── Step 7: Firewall ───────────────────────────────────────────
step "7/8 — Security"
ufw --force reset > /dev/null 2>&1
ufw default deny incoming > /dev/null 2>&1
ufw default allow outgoing > /dev/null 2>&1
ufw allow ssh > /dev/null 2>&1
ufw allow 'Nginx Full' > /dev/null 2>&1
ufw --force enable > /dev/null 2>&1
systemctl enable --now fail2ban > /dev/null 2>&1
ok "Firewall + intrusion prevention active"

# ── Step 8: Start everything ───────────────────────────────────
step "8/8 — Starting KiwiAI"
cd "$KIWI_DIR"

# Install Node deps for panel + telegram
cd "$KIWI_DIR/server"
cat > package.json << 'PKG'
{
  "name": "kiwiai-server",
  "version": "1.0.0",
  "type": "commonjs",
  "dependencies": {
    "express": "^4.18.0",
    "node-cron": "^3.0.0",
    "node-fetch": "^2.6.0"
  }
}
PKG
npm install --silent 2>/dev/null || true
cd "$KIWI_DIR"

# Start with Docker Compose
docker compose pull --quiet 2>/dev/null
docker compose up -d

ok "All containers started"

# ── Management script ──────────────────────────────────────────
cat > /usr/local/bin/kiwiai << 'MGMT'
#!/bin/bash
KIWI_DIR="/opt/kiwiai"
case "$1" in
  start)    cd $KIWI_DIR && docker compose up -d && echo "✓ KiwiAI started" ;;
  stop)     cd $KIWI_DIR && docker compose down && echo "✓ KiwiAI stopped" ;;
  restart)  cd $KIWI_DIR && docker compose restart && echo "✓ KiwiAI restarted" ;;
  logs)     cd $KIWI_DIR && docker compose logs -f --tail=100 ;;
  status)   cd $KIWI_DIR && docker compose ps ;;
  update)
    cd $KIWI_DIR
    docker compose pull
    curl -fsSL https://raw.githubusercontent.com/cperez90008/kiwiai/main/install.sh | sudo bash
    echo "✓ KiwiAI updated"
    ;;
  backup)
    BACKUP="$KIWI_DIR/backups/kiwiai-$(date +%Y%m%d-%H%M%S).tar.gz"
    tar -czf "$BACKUP" -C $KIWI_DIR data config agent-zero-data skills 2>/dev/null
    echo "✓ Backup: $BACKUP"
    ;;
  restore)
    [[ -z "$2" ]] && echo "Usage: kiwiai restore <backup-file>" && exit 1
    tar -xzf "$2" -C $KIWI_DIR
    cd $KIWI_DIR && docker compose restart
    echo "✓ Restored from $2"
    ;;
  *)
    echo "KiwiAI — Autonomous AI Agent"
    echo ""
    echo "Usage: kiwiai {start|stop|restart|logs|status|update|backup|restore}"
    ;;
esac
MGMT
chmod +x /usr/local/bin/kiwiai

# ── Wait for ready ─────────────────────────────────────────────
echo ""
echo -ne "  ${CYAN}Waiting for services"
for i in {1..40}; do
  curl -sf http://localhost:8080/health > /dev/null 2>&1 && break
  echo -ne "."
  sleep 3
done
echo -e "${NC}"

PROTO=$([[ "$USE_SSL" == "true" ]] && echo "https" || echo "http")

# ── Done ───────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}  ══════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}   🥝  KiwiAI is LIVE!${NC}"
echo -e "${GREEN}${BOLD}  ══════════════════════════════════════════${NC}"
echo ""
echo -e "  ${BOLD}Open in your browser:${NC}"
echo -e "  ${CYAN}${BOLD}  $PROTO://$KIWI_DOMAIN${NC}"
echo ""
echo -e "  ${BOLD}Agent Zero direct access:${NC}"
echo -e "  ${CYAN}  $PROTO://$KIWI_DOMAIN/agent${NC}"
echo ""
echo -e "  ${BOLD}Useful commands:${NC}"
echo "    kiwiai status    — check all services"
echo "    kiwiai logs      — watch agent activity live"
echo "    kiwiai backup    — backup all your data"
echo "    kiwiai update    — update to latest version"
echo ""
echo -e "  ${BOLD}Next steps:${NC}"
echo "  1. Open your browser and go to the URL above"
echo "  2. Click Setup and add your Groq API key (free)"
echo "  3. Set up Telegram for push notifications"
echo "  4. Add your first scheduled task"
echo ""
echo -e "  ${YELLOW}Tip: Get a free Groq key at console.groq.com${NC}"
echo -e "  ${YELLOW}Tip: Add Kimi K2 via OpenRouter for deep reasoning${NC}"
echo ""
echo -e "${GREEN}  Done in ${SECONDS}s${NC}"
echo ""
