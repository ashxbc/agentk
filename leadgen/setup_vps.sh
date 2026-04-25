#!/bin/bash
# AgentK LeadGen — VPS setup script
# Run once: bash setup_vps.sh

set -e

LEADGEN_DIR="/root/leadgen"

echo "═══════════════════════════════════════"
echo "   AgentK LeadGen — VPS Setup"
echo "═══════════════════════════════════════"

# 1. System deps
echo "[1/6] Installing system dependencies..."
apt-get update -qq
apt-get install -y -qq python3 python3-pip python3-venv git curl

# 2. Copy files
echo "[2/6] Setting up /root/leadgen..."
mkdir -p "$LEADGEN_DIR"
cp leadgen.py "$LEADGEN_DIR/"
cp requirements.txt "$LEADGEN_DIR/"

# 3. Python venv + deps
echo "[3/6] Creating Python venv and installing packages..."
python3 -m venv "$LEADGEN_DIR/venv"
"$LEADGEN_DIR/venv/bin/pip" install -q --upgrade pip
"$LEADGEN_DIR/venv/bin/pip" install -q -r "$LEADGEN_DIR/requirements.txt"

# 4. Run setup (onboarding)
echo "[4/6] Running onboarding setup..."
cd "$LEADGEN_DIR"
"$LEADGEN_DIR/venv/bin/python" leadgen.py

# 5. Install pm2 if not present
echo "[5/6] Setting up pm2..."
if ! command -v pm2 &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
    apt-get install -y -qq nodejs
    npm install -g pm2 --silent
fi

# 6. Start with pm2
echo "[6/6] Starting leadgen with pm2..."
pm2 delete leadgen 2>/dev/null || true
pm2 start "$LEADGEN_DIR/venv/bin/python" \
    --name leadgen \
    --interpreter none \
    -- "$LEADGEN_DIR/leadgen.py"
pm2 save

# Persist across reboots
env_cmd=$(pm2 startup systemd -u root --hp /root 2>&1 | tail -1)
if [[ "$env_cmd" == sudo* ]] || [[ "$env_cmd" == systemctl* ]]; then
    eval "$env_cmd"
fi
pm2 save

echo ""
echo "✅ Done! LeadGen is running."
echo ""
echo "Useful commands:"
echo "  pm2 logs leadgen        — live logs"
echo "  pm2 status              — process status"
echo "  pm2 restart leadgen     — restart"
echo "  pm2 stop leadgen        — stop"
echo "  cat /root/leadgen/config.json   — view config"
echo ""
