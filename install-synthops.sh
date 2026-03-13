#!/bin/bash
#
# SynthOps One-Line Installer for Ubuntu
# Usage: curl -fsSL https://raw.githubusercontent.com/andrewdunn358-dev/SynthOps-/main/install-synthops.sh | sudo bash
#
# This script installs Docker, Docker Compose, and deploys SynthOps
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                                                               ║"
echo "║   ███████╗██╗   ██╗███╗   ██╗████████╗██╗  ██╗ ██████╗ ██████╗███████╗  ║"
echo "║   ██╔════╝╚██╗ ██╔╝████╗  ██║╚══██╔══╝██║  ██║██╔═══██╗██╔══██╗██╔════╝ ║"
echo "║   ███████╗ ╚████╔╝ ██╔██╗ ██║   ██║   ███████║██║   ██║██████╔╝███████╗ ║"
echo "║   ╚════██║  ╚██╔╝  ██║╚██╗██║   ██║   ██╔══██║██║   ██║██╔═══╝ ╚════██║ ║"
echo "║   ███████║   ██║   ██║ ╚████║   ██║   ██║  ██║╚██████╔╝██║     ███████║ ║"
echo "║   ╚══════╝   ╚═╝   ╚═╝  ╚═══╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝ ╚═╝     ╚══════╝ ║"
echo "║                                                               ║"
echo "║              IT Operations Portal Installer                   ║"
echo "║                    Synthesis IT Ltd                           ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Please run as root (use sudo)${NC}"
    exit 1
fi

# Check if Ubuntu
if ! grep -q "Ubuntu" /etc/os-release 2>/dev/null; then
    echo -e "${YELLOW}Warning: This script is designed for Ubuntu. Proceeding anyway...${NC}"
fi

echo -e "${GREEN}[1/7] Updating system packages...${NC}"
apt-get update -qq

echo -e "${GREEN}[2/7] Installing prerequisites...${NC}"
apt-get install -y -qq ca-certificates curl gnupg lsb-release git

echo -e "${GREEN}[3/7] Installing Docker...${NC}"
if ! command -v docker &> /dev/null; then
    # Add Docker's official GPG key
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    
    # Add the repository
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    
    # Start Docker
    systemctl start docker
    systemctl enable docker
    echo -e "${GREEN}Docker installed successfully${NC}"
else
    echo -e "${YELLOW}Docker already installed${NC}"
fi

echo -e "${GREEN}[4/7] Creating SynthOps directory...${NC}"
INSTALL_DIR="/opt/synthops"
mkdir -p $INSTALL_DIR
cd $INSTALL_DIR

echo -e "${GREEN}[5/7] Downloading SynthOps...${NC}"
# Clone the repository
if [ -d "$INSTALL_DIR/.git" ]; then
    cd $INSTALL_DIR
    git pull origin main
else
    # Clone fresh
    rm -rf $INSTALL_DIR/*
    git clone https://github.com/andrewdunn358-dev/SynthOps-.git $INSTALL_DIR
    cd $INSTALL_DIR
fi

echo -e "${GREEN}[6/7] Configuring environment...${NC}"

# Generate secure secrets if not exists
if [ ! -f "$INSTALL_DIR/.env" ]; then
    JWT_SECRET=$(openssl rand -hex 32)
    ENCRYPTION_KEY=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
    
    cat > $INSTALL_DIR/.env << EOF
# SynthOps Environment Configuration
# Synthesis IT Ltd
# Generated on $(date)

# Security
JWT_SECRET=$JWT_SECRET
ENCRYPTION_KEY=$ENCRYPTION_KEY

# Application
FRONTEND_URL=http://$(hostname -I | awk '{print $1}')

# Tactical RMM Integration
TACTICAL_RMM_API_URL=https://api.synthesis-it.co.uk/
TACTICAL_RMM_API_KEY=SZRL0SCTYLK6YCL1CP2O4GYXX8ZKNUES

# Zammad Integration
ZAMMAD_API_URL=https://help.synthesis-it.co.uk
ZAMMAD_API_TOKEN=nbsIJ4v3bV2hjOdEkdillRU5uWGhFt5B9yK2RHC89pHoE8Z2hsvNv_FxSVz1f2SZ

# MeshCentral
MESHCENTRAL_URL=https://mesh.synthesis-it.co.uk

# Vaultwarden
VAULTWARDEN_URL=http://$(hostname -I | awk '{print $1}'):8082
VAULTWARDEN_ADMIN_TOKEN=$JWT_SECRET

# Microsoft Teams Webhook (add your webhook URL)
TEAMS_WEBHOOK_URL=

# Sync interval in minutes
SYNC_INTERVAL_MINUTES=15

# Database admin
MONGO_EXPRESS_USER=admin
MONGO_EXPRESS_PASSWORD=$(openssl rand -hex 8)
EOF
    
    echo -e "${GREEN}Environment file created at $INSTALL_DIR/.env${NC}"
fi

# docker-compose.yml comes from GitHub repo, no need to create

echo -e "${GREEN}[7/8] Building and starting SynthOps...${NC}"
cd $INSTALL_DIR
docker compose build --no-cache
docker compose up -d

echo -e "${GREEN}[8/8] Setting up auto-start on boot...${NC}"
# Create systemd service for SynthOps
cat > /etc/systemd/system/synthops.service << 'SVCEOF'
[Unit]
Description=SynthOps IT Operations Portal
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/synthops
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
SVCEOF

# Enable the service
systemctl daemon-reload
systemctl enable synthops.service
echo -e "${GREEN}SynthOps will auto-start on boot${NC}"

# Wait for services to start
echo -e "${YELLOW}Waiting for services to start...${NC}"
sleep 10

# Check if services are running
if docker compose ps | grep -q "running"; then
    SERVER_IP=$(hostname -I | awk '{print $1}')
    
    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║              SynthOps Installed Successfully!                 ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${CYAN}Access your SynthOps portal:${NC}"
    echo -e "  ${GREEN}SynthOps:${NC}     http://$SERVER_IP"
    echo -e "  ${GREEN}Vaultwarden:${NC}  http://$SERVER_IP:8082"
    echo ""
    echo -e "${YELLOW}Your integrations are pre-configured:${NC}"
    echo -e "  - Tactical RMM: https://api.synthesis-it.co.uk/"
    echo -e "  - Zammad: https://help.synthesis-it.co.uk"
    echo -e "  - MeshCentral: https://mesh.synthesis-it.co.uk"
    echo ""
    echo -e "${YELLOW}Optional: Add Teams webhook for alerts:${NC}"
    echo -e "  ${CYAN}nano /opt/synthops/.env${NC}  # Add TEAMS_WEBHOOK_URL"
    echo -e "  ${CYAN}cd /opt/synthops && docker compose restart${NC}"
    echo ""
    echo -e "  Create your admin account at http://$SERVER_IP"
    echo ""
    echo -e "${GREEN}Management Commands:${NC}"
    echo -e "  Start:   ${CYAN}sudo systemctl start synthops${NC}"
    echo -e "  Stop:    ${CYAN}sudo systemctl stop synthops${NC}"
    echo -e "  Status:  ${CYAN}sudo systemctl status synthops${NC}"
    echo -e "  Logs:    ${CYAN}cd /opt/synthops && docker compose logs -f${NC}"
    echo -e "  Rebuild: ${CYAN}cd /opt/synthops && docker compose build --no-cache && docker compose up -d${NC}"
    echo ""
    echo -e "${YELLOW}Auto-start is ENABLED - SynthOps will start automatically on reboot${NC}"
    echo ""
else
    echo -e "${RED}Error: Some services failed to start. Check logs with:${NC}"
    echo -e "${CYAN}cd /opt/synthops && docker compose logs${NC}"
    exit 1
fi
