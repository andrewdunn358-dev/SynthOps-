#!/bin/bash

# ============================================
# SynthOps Installation Script
# IT Operations Portal for MSPs
# ============================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════╗"
echo "║           SynthOps Installation               ║"
echo "║      IT Operations Portal for MSPs            ║"
echo "╚═══════════════════════════════════════════════╝"
echo -e "${NC}"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${YELLOW}Note: Some commands may require sudo${NC}"
fi

# Check prerequisites
echo -e "${BLUE}Checking prerequisites...${NC}"

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}Docker not found. Installing Docker...${NC}"
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
    echo -e "${GREEN}Docker installed successfully${NC}"
fi

# Check Docker Compose
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${YELLOW}Docker Compose not found. Installing...${NC}"
    sudo apt-get update
    sudo apt-get install -y docker-compose-plugin
    echo -e "${GREEN}Docker Compose installed successfully${NC}"
fi

echo -e "${GREEN}✓ Docker and Docker Compose are installed${NC}"

# Create directory structure
echo -e "${BLUE}Setting up directory structure...${NC}"
mkdir -p nginx/ssl

# Check for .env file
if [ ! -f .env ]; then
    echo -e "${YELLOW}Creating .env file from template...${NC}"
    cp .env.example .env
    
    # Generate random secrets
    JWT_SECRET=$(openssl rand -hex 32)
    ENCRYPTION_KEY=$(openssl rand -hex 16)
    MONGO_PASS=$(openssl rand -hex 12)
    
    # Update .env with generated secrets
    sed -i "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" .env
    sed -i "s/ENCRYPTION_KEY=.*/ENCRYPTION_KEY=$ENCRYPTION_KEY/" .env
    sed -i "s/MONGO_EXPRESS_PASSWORD=.*/MONGO_EXPRESS_PASSWORD=$MONGO_PASS/" .env
    
    echo -e "${GREEN}✓ .env file created with secure random secrets${NC}"
    echo -e "${YELLOW}⚠ Please edit .env and add your TRMM and Zammad credentials${NC}"
else
    echo -e "${GREEN}✓ .env file already exists${NC}"
fi

# Interactive configuration
echo ""
echo -e "${BLUE}Configuration${NC}"
echo "============="

# Ask for domain
read -p "Enter your domain (e.g., ops.yourcompany.com): " DOMAIN
if [ -n "$DOMAIN" ]; then
    sed -i "s|FRONTEND_URL=.*|FRONTEND_URL=https://$DOMAIN|" .env
    echo -e "${GREEN}✓ Domain set to: $DOMAIN${NC}"
fi

# Ask for TRMM credentials
echo ""
read -p "Do you want to configure Tactical RMM? (y/n): " CONFIG_TRMM
if [ "$CONFIG_TRMM" = "y" ] || [ "$CONFIG_TRMM" = "Y" ]; then
    read -p "Enter TRMM API URL (e.g., https://api.yourcompany.com/): " TRMM_URL
    read -p "Enter TRMM API Key: " TRMM_KEY
    if [ -n "$TRMM_URL" ]; then
        sed -i "s|TACTICAL_RMM_API_URL=.*|TACTICAL_RMM_API_URL=$TRMM_URL|" .env
    fi
    if [ -n "$TRMM_KEY" ]; then
        sed -i "s|TACTICAL_RMM_API_KEY=.*|TACTICAL_RMM_API_KEY=$TRMM_KEY|" .env
    fi
    echo -e "${GREEN}✓ TRMM configured${NC}"
fi

# Ask for Zammad credentials
echo ""
read -p "Do you want to configure Zammad? (y/n): " CONFIG_ZAMMAD
if [ "$CONFIG_ZAMMAD" = "y" ] || [ "$CONFIG_ZAMMAD" = "Y" ]; then
    read -p "Enter Zammad URL (e.g., https://tickets.yourcompany.com): " ZAMMAD_URL
    read -p "Enter Zammad API Token: " ZAMMAD_TOKEN
    if [ -n "$ZAMMAD_URL" ]; then
        sed -i "s|ZAMMAD_API_URL=.*|ZAMMAD_API_URL=$ZAMMAD_URL|" .env
    fi
    if [ -n "$ZAMMAD_TOKEN" ]; then
        sed -i "s|ZAMMAD_API_TOKEN=.*|ZAMMAD_API_TOKEN=$ZAMMAD_TOKEN|" .env
    fi
    echo -e "${GREEN}✓ Zammad configured${NC}"
fi

# Ask about optional services
echo ""
read -p "Install Mongo Express (database admin UI)? (y/n): " INSTALL_MONGO_EXPRESS
read -p "Install Vaultwarden (password manager)? (y/n): " INSTALL_VAULTWARDEN

# Build and start services
echo ""
echo -e "${BLUE}Building and starting services...${NC}"

# Determine which profile to use
PROFILES=""
if [ "$INSTALL_MONGO_EXPRESS" = "y" ] || [ "$INSTALL_MONGO_EXPRESS" = "Y" ]; then
    PROFILES="--profile admin"
fi
if [ "$INSTALL_VAULTWARDEN" = "y" ] || [ "$INSTALL_VAULTWARDEN" = "Y" ]; then
    PROFILES="$PROFILES --profile extras"
fi

# Start services
if docker compose version &> /dev/null; then
    docker compose $PROFILES up -d --build
else
    docker-compose $PROFILES up -d --build
fi

# Wait for services to start
echo -e "${BLUE}Waiting for services to start...${NC}"
sleep 10

# Check service health
echo ""
echo -e "${BLUE}Checking service status...${NC}"
if docker compose version &> /dev/null; then
    docker compose ps
else
    docker-compose ps
fi

# Print success message
echo ""
echo -e "${GREEN}"
echo "╔═══════════════════════════════════════════════╗"
echo "║       SynthOps Installation Complete!         ║"
echo "╚═══════════════════════════════════════════════╝"
echo -e "${NC}"

echo ""
echo "Access your installation:"
echo -e "  ${BLUE}SynthOps Portal:${NC} http://$DOMAIN (or http://localhost)"
if [ "$INSTALL_MONGO_EXPRESS" = "y" ] || [ "$INSTALL_MONGO_EXPRESS" = "Y" ]; then
    echo -e "  ${BLUE}Database Admin:${NC}  http://$DOMAIN:8081"
fi
if [ "$INSTALL_VAULTWARDEN" = "y" ] || [ "$INSTALL_VAULTWARDEN" = "Y" ]; then
    echo -e "  ${BLUE}Vaultwarden:${NC}     http://$DOMAIN:8082"
fi

echo ""
echo "Default login:"
echo "  Create your first account at the login page"
echo ""
echo "Useful commands:"
echo "  View logs:     docker compose logs -f"
echo "  Stop:          docker compose down"
echo "  Restart:       docker compose restart"
echo "  Update:        git pull && docker compose up -d --build"
echo ""
echo -e "${YELLOW}⚠ For production, configure SSL certificates in nginx/ssl/${NC}"
echo ""
