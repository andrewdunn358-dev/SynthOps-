#!/bin/bash
#
# SynthOps One-Line Installer for Ubuntu
# Usage: curl -fsSL https://raw.githubusercontent.com/YOUR_REPO/main/install-synthops.sh | sudo bash
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
# If git repo exists, pull latest. Otherwise clone.
if [ -d "$INSTALL_DIR/.git" ]; then
    git pull origin main
else
    # For now, create the docker-compose and config files directly
    # In production, replace with: git clone https://github.com/YOUR_REPO/synthops.git .
    echo "Creating configuration files..."
fi

echo -e "${GREEN}[6/7] Configuring environment...${NC}"

# Generate secure secrets if not exists
if [ ! -f "$INSTALL_DIR/.env" ]; then
    JWT_SECRET=$(openssl rand -hex 32)
    ENCRYPTION_KEY=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
    
    cat > $INSTALL_DIR/.env << EOF
# SynthOps Environment Configuration
# Generated on $(date)

# Security
JWT_SECRET=$JWT_SECRET
ENCRYPTION_KEY=$ENCRYPTION_KEY

# Application
FRONTEND_URL=http://$(hostname -I | awk '{print $1}')

# Tactical RMM Integration (configure these)
TACTICAL_RMM_API_URL=
TACTICAL_RMM_API_KEY=

# Zammad Integration (configure these)
ZAMMAD_API_URL=
ZAMMAD_API_TOKEN=

# MeshCentral (configure this)
MESHCENTRAL_URL=

# Vaultwarden
VAULTWARDEN_URL=http://localhost:8082
VAULTWARDEN_ADMIN_TOKEN=$JWT_SECRET

# Microsoft Teams Webhook (configure this)
TEAMS_WEBHOOK_URL=

# Sync interval in minutes
SYNC_INTERVAL_MINUTES=15

# Database admin (optional)
MONGO_EXPRESS_USER=admin
MONGO_EXPRESS_PASSWORD=$(openssl rand -hex 8)
EOF
    
    echo -e "${GREEN}Environment file created at $INSTALL_DIR/.env${NC}"
    echo -e "${YELLOW}Please edit this file to add your API keys${NC}"
fi

# Create docker-compose file if not exists
if [ ! -f "$INSTALL_DIR/docker-compose.yml" ]; then
    cat > $INSTALL_DIR/docker-compose.yml << 'DOCKER_EOF'
version: '3.8'

services:
  backend:
    image: ghcr.io/synthesis-it/synthops-backend:latest
    container_name: synthops-backend
    restart: unless-stopped
    ports:
      - "8001:8001"
    env_file:
      - .env
    environment:
      - MONGO_URL=mongodb://mongo:27017
      - DB_NAME=synthops
    depends_on:
      - mongo
    networks:
      - synthops-network

  frontend:
    image: ghcr.io/synthesis-it/synthops-frontend:latest
    container_name: synthops-frontend
    restart: unless-stopped
    ports:
      - "80:80"
    depends_on:
      - backend
    networks:
      - synthops-network

  mongo:
    image: mongo:7
    container_name: synthops-mongo
    restart: unless-stopped
    volumes:
      - mongo-data:/data/db
    networks:
      - synthops-network

  vaultwarden:
    image: vaultwarden/server:latest
    container_name: synthops-vaultwarden
    restart: unless-stopped
    ports:
      - "8082:80"
    environment:
      - DOMAIN=${VAULTWARDEN_URL:-http://localhost:8082}
      - ADMIN_TOKEN=${VAULTWARDEN_ADMIN_TOKEN:-}
      - SIGNUPS_ALLOWED=true
    volumes:
      - vaultwarden-data:/data
    networks:
      - synthops-network

networks:
  synthops-network:
    driver: bridge

volumes:
  mongo-data:
  vaultwarden-data:
DOCKER_EOF
fi

echo -e "${GREEN}[7/7] Starting SynthOps...${NC}"
cd $INSTALL_DIR
docker compose pull
docker compose up -d

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
    echo -e "${YELLOW}Next Steps:${NC}"
    echo -e "  1. Edit ${CYAN}/opt/synthops/.env${NC} to add your API keys:"
    echo -e "     - TACTICAL_RMM_API_URL and TACTICAL_RMM_API_KEY"
    echo -e "     - ZAMMAD_API_URL and ZAMMAD_API_TOKEN"
    echo -e "     - MESHCENTRAL_URL"
    echo -e "     - TEAMS_WEBHOOK_URL (optional)"
    echo ""
    echo -e "  2. After editing, restart SynthOps:"
    echo -e "     ${CYAN}cd /opt/synthops && docker compose restart${NC}"
    echo ""
    echo -e "  3. Create your admin account at http://$SERVER_IP"
    echo ""
    echo -e "${GREEN}Management Commands:${NC}"
    echo -e "  Start:   ${CYAN}cd /opt/synthops && docker compose up -d${NC}"
    echo -e "  Stop:    ${CYAN}cd /opt/synthops && docker compose down${NC}"
    echo -e "  Logs:    ${CYAN}cd /opt/synthops && docker compose logs -f${NC}"
    echo -e "  Update:  ${CYAN}cd /opt/synthops && docker compose pull && docker compose up -d${NC}"
    echo ""
else
    echo -e "${RED}Error: Some services failed to start. Check logs with:${NC}"
    echo -e "${CYAN}cd /opt/synthops && docker compose logs${NC}"
    exit 1
fi
