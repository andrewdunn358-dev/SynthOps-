#!/bin/bash

# ============================================
# SynthOps Uninstallation Script
# ============================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════╗"
echo "║          SynthOps Uninstallation              ║"
echo "╚═══════════════════════════════════════════════╝"
echo -e "${NC}"

echo -e "${YELLOW}Warning: This will stop and remove all SynthOps containers.${NC}"
echo ""

read -p "Do you want to keep your data (database, volumes)? (y/n): " KEEP_DATA

echo ""
echo -e "${BLUE}Stopping services...${NC}"

if docker compose version &> /dev/null; then
    docker compose --profile admin --profile extras down
else
    docker-compose --profile admin --profile extras down
fi

if [ "$KEEP_DATA" = "n" ] || [ "$KEEP_DATA" = "N" ]; then
    echo -e "${YELLOW}Removing data volumes...${NC}"
    
    if docker compose version &> /dev/null; then
        docker compose --profile admin --profile extras down -v
    else
        docker-compose --profile admin --profile extras down -v
    fi
    
    echo -e "${GREEN}✓ All data removed${NC}"
else
    echo -e "${GREEN}✓ Data preserved${NC}"
fi

# Optional: Remove images
read -p "Remove Docker images? (y/n): " REMOVE_IMAGES
if [ "$REMOVE_IMAGES" = "y" ] || [ "$REMOVE_IMAGES" = "Y" ]; then
    echo -e "${BLUE}Removing images...${NC}"
    docker rmi synthops-backend synthops-frontend 2>/dev/null || true
    echo -e "${GREEN}✓ Images removed${NC}"
fi

echo ""
echo -e "${GREEN}"
echo "╔═══════════════════════════════════════════════╗"
echo "║      SynthOps Uninstallation Complete         ║"
echo "╚═══════════════════════════════════════════════╝"
echo -e "${NC}"

if [ "$KEEP_DATA" = "y" ] || [ "$KEEP_DATA" = "Y" ]; then
    echo "Your data has been preserved in Docker volumes."
    echo "To reinstall, run: ./install.sh"
else
    echo "All SynthOps data has been removed."
fi
echo ""
