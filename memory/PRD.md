# SynthOps - IT Operations Portal
## Product Requirements Document

**Company:** Synthesis IT Ltd  
**Last Updated:** March 2025

---

## Original Problem Statement
Build a self-hosted IT Operations Portal named "SynthOps" - a "one-stop-shop" to centralize infrastructure information (from Tactical RMM), ticketing system (Zammad), tasks, incidents, projects, and documentation to reduce operational stress and improve oversight for their Managed Service Provider (MSP) business.

---

## Core Requirements

### Dashboard
- [x] Overview showing servers, tasks, incidents, and projects
- [x] Quick stats and system health indicators
- [x] Infrastructure Monitoring section showing device status, VMs, containers

### Infrastructure Management
- [x] Server/Infrastructure Inventory synced from Tactical RMM
- [x] NOC-style server view with real-time status
- [x] Client and Site management
- [x] Workstation vs Server classification
- [x] Infrastructure Monitoring page with tabs (Proxmox, Network, All Devices)
- [x] Add/Edit/Delete monitored devices (Proxmox, SNMP, Ping)
- [x] Detailed Proxmox view showing nodes, VMs, containers with resource usage

### Task & Ticket Management
- [x] Task/Job Tracking system
- [x] Zammad ticket integration (view/reply)
- [x] Default to "Open" tickets filter

### Project Management
- [x] Project tracking with jobs and tasks
- [x] Time entries tracking
- [x] Detailed project view with tabs

### Incidents
- [x] Incident logging
- [x] Auto-populate from TRMM alerts

### Documentation
- [x] Documentation/Runbook area
- [x] Content seeding from backend

### Integrations
- [x] Tactical RMM (sync clients, sites, agents)
- [x] Zammad (tickets)
- [x] MeshCentral (Connect button on server pages)
- [x] Vaultwarden (Docker integration)
- [x] Microsoft Teams (webhook alerts)
- [x] Sophie AI Assistant (Claude via Emergent)
- [x] Bitdefender GravityZone (security alerts)
- [x] Proxmox (API monitoring - VMs, containers, resource usage)
- [ ] SendGrid (email summary reports - planned)

### Management Features
- [x] User Management with role-based access (Admin, Engineer, Viewer)
- [x] Password reset functionality
- [x] Custom Report Builder
- [x] Monthly Health Checks

### UI/UX
- [x] Dark/light mode
- [x] Floating AI assistant (Sophie)
- [x] Company logo throughout

### Security
- [x] JWT-based authentication
- [x] Rate limiting
- [x] Secure headers

### Deployment
- [x] Docker-based deployment
- [x] One-line installer script (install-synthops.sh)
- [x] docker-compose.yml with all services
- [x] Self-signed SSL support
- [ ] Let's Encrypt SSL (planned)

---

## Completed Work (March 2025)

### Infrastructure Monitoring Integration (Latest)
- Integrated Infrastructure Monitoring into Dashboard
  - Shows device counts (online/offline)
  - Shows VM/container counts from Proxmox
  - Shows offline device alerts
  - "View Details" button links to Infrastructure page
- Enhanced Infrastructure page with:
  - Summary statistics cards
  - Tabs for different views (Overview, Proxmox, Network Devices, All)
  - Detailed Proxmox server cards showing:
    - Node stats (CPU, RAM, disk usage with progress bars)
    - VM list with status, CPU, memory, uptime
    - Container list with status and resources
    - Summary counts (nodes, running VMs/containers)
  - Device management (Add/Edit/Delete)
  - Check All and individual device check buttons
- Added Infrastructure link to sidebar navigation
- Fixed port validation bug in Add Device form

### Previous Session Work
- Deployment fixes (emergentintegrations package, yarn.lock)
- System reliability (systemd service, restart policies)
- SSL implementation (self-signed certificates, Nginx reverse proxy)
- Domain/DNS configuration for internal subdomains
- Authentication improvements (case-insensitive login)
- Monthly Health Check redesign
- Bitdefender GravityZone integration

---

## Pending Tasks (Priority Order)

### P0 - Critical
- [x] Infrastructure monitoring in dashboard (COMPLETED)

### P1 - High
- [ ] User verification of Server vs Workstation classification on live system
- [ ] Let's Encrypt SSL in docker-compose.yml

### P2 - Medium
- [ ] SNMP device monitoring (full implementation with data)
- [ ] SendGrid email summary reports
- [ ] Refactor monolithic server.py

### P3 - Low/Future
- [ ] Mobile application
- [ ] Consolidate Staff/Admin pages
- [ ] In-app Help page from USER_MANUAL.md

---

## Architecture

```
/app/
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── server.py (monolithic - needs refactoring)
│   └── .env
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   └── src/
│       ├── App.js (routes include /infrastructure)
│       ├── components/
│       │   ├── Layout.jsx (sidebar with Infrastructure link)
│       │   └── common/
│       └── pages/
│           ├── Dashboard.jsx (Infrastructure section added)
│           ├── Infrastructure.jsx (enhanced with Proxmox detail view)
│           └── ...
├── docker-compose.yml
├── install-synthops.sh
└── nginx/
    └── nginx.conf
```

---

## Key API Endpoints

### Infrastructure
- `GET /api/infrastructure/devices` - List all devices
- `POST /api/infrastructure/devices` - Add device
- `GET /api/infrastructure/devices/{id}` - Get device
- `PUT /api/infrastructure/devices/{id}` - Update device
- `DELETE /api/infrastructure/devices/{id}` - Delete device
- `POST /api/infrastructure/devices/{id}/check` - Check single device
- `GET /api/infrastructure/status` - Get summary status
- `POST /api/infrastructure/check-all` - Check all devices

---

## Credentials (Private Repo)
- Tactical RMM: https://api.synthesis-it.co.uk/
- Zammad: https://help.synthesis-it.co.uk
- MeshCentral: https://mesh.synthesis-it.co.uk
- Proxmox: User's internal server (credentials in handoff)

---

## Known Issues
1. Server vs Workstation classification - needs user verification after deployment
2. Ping checks show "offline" in preview environment due to network restrictions (expected)
