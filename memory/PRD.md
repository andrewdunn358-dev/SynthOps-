# SynthOps - IT Operations Portal
## Product Requirements Document

**Company:** Synthesis IT Ltd  
**Last Updated:** March 2026

---

## Original Problem Statement
Build a self-hosted IT Operations Portal named "SynthOps" - a "one-stop-shop" to centralize infrastructure information (from Tactical RMM), ticketing system (Zammad), tasks, incidents, projects, and documentation to reduce operational stress and improve oversight for their Managed Service Provider (MSP) business.

---

## Core Requirements

### Dashboard
- [x] Overview showing servers, tasks, incidents, and projects
- [x] Quick stats and system health indicators
- [x] Bitdefender security status card
- [x] Open tickets alert from Zammad

### Infrastructure Management
- [x] Server/Infrastructure Inventory synced from Tactical RMM
- [x] NOC-style server view with real-time status
- [x] Client and Site management
- [x] Workstation vs Server classification (fixed)
- [x] **Infrastructure Monitoring page** - Monitor Proxmox hosts, SNMP devices, and ping devices
- [ ] Client Detail Page showing 0 assets (needs re-verification)

### Task & Ticket Management
- [x] Task/Job Tracking system
- [x] Zammad ticket integration (view/reply)
- [x] Default to "Open" tickets filter
- [x] Zammad stats counts "open" + "merged" as open tickets

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
- [ ] Proxmox API (infrastructure monitoring - partial)
- [ ] SendGrid (email summary reports - planned)

### Management Features
- [x] User Management with role-based access (Admin, Engineer, Viewer)
- [x] Password reset functionality
- [x] Custom Report Builder
- [x] Monthly Health Checks (redesigned workflow)
- [x] Infrastructure device management (Proxmox, SNMP, Ping)

### UI/UX
- [x] Dark/light mode
- [x] Floating AI assistant (Sophie)
- [x] Company logo throughout
- [x] Admin section in sidebar (Infrastructure, Admin, Settings)

### Security
- [x] JWT-based authentication
- [x] Rate limiting
- [x] Secure headers
- [x] Case-insensitive login (username or email)

### Deployment
- [x] Docker-based deployment
- [x] One-line installer script (install-synthops.sh)
- [x] docker-compose.yml with all services
- [x] Self-signed SSL certificate generation
- [x] Systemd service for auto-start on reboot
- [ ] Let's Encrypt SSL (planned)

---

## Completed Work (March 2026)

### Comprehensive Reports Feature (Latest)
- Added 12 new report endpoints:
  - `/reports/weekly-status` - Weekly status summary
  - `/reports/all-clients-summary` - All clients health overview
  - `/reports/client-health/{id}` - Per-client health report
  - `/reports/client-assets/{id}` - Client asset inventory
  - `/reports/ticket-aging` - Open tickets by age
  - `/reports/incident-trends` - Incidents over time
  - `/reports/time-tracking-summary` - Hours by engineer/client/project
  - `/reports/workload-distribution` - Staff task distribution
  - `/reports/infrastructure-uptime` - Device uptime stats
  - `/reports/offline-history` - Offline server history
  - `/reports/security-summary` - Bitdefender alerts summary
- Redesigned Reports page with 5 tabs: Overview, Clients, Operations, Staff, Infrastructure
- Added CSV export for all major report types

### User Manual
- Comprehensive in-app documentation for Engineers and Admins
- Accessible from Settings page via "Help & Documentation" card
- 5 tabbed sections: Getting Started, Daily Operations, Monitoring, Reports, Administration
- Role-aware content (Administration tab only visible to admins)
- Includes tips, warnings, and step-by-step guides
- Route: `/manual`

### PDF Export & Historical Trend Charts
- **PDF Export** for: Weekly Status, All Clients Summary, Individual Client Reports, Incident Trends
- **Interactive Trend Charts** using Recharts:
  - Incidents (30 days) - Stacked area chart by severity
  - Tasks (30 days) - Bar chart showing Created vs Completed
  - Hours Logged (30 days) - Line chart
- Backend trend data endpoints: `/reports/trends/incidents`, `/reports/trends/tasks`, `/reports/trends/time-logged`
- **Dashboard Trend Charts** - Added 14-day incident and task trends to the main dashboard
- **NOC Display Trend Chart** - Added 7-day incident trends chart to the NOC view

### UI Fixes
- Fixed favicon to use Synthesis IT logo
- Page title now shows "SynthOps | IT Operations Portal"

### Infrastructure Monitoring Feature
- Added Infrastructure Management page at /infrastructure
- CRUD APIs for managing Proxmox, SNMP, and Ping devices
- Device status checking with response time tracking
- Added to sidebar navigation and Admin page quick access
- Supports device types: Proxmox (API auth), SNMP (community string), Ping (ICMP)

### Zammad Integration Fix
- Updated stats endpoint to count "open" + "merged" as open tickets
- Made state matching case-insensitive
- Added search API for fetching all tickets

---

## Pending Tasks (Priority Order)

### P0 - Critical
- [ ] User verification of Infrastructure Monitoring feature after VPS deployment

### P1 - High
- [ ] Complete Proxmox API integration (VM status, resources, alerts)
- [ ] Let's Encrypt SSL in docker-compose.yml
- [ ] Re-verify Client Detail page 0 assets issue

### P2 - Medium
- [ ] SendGrid email summary reports
- [ ] Refactor monolithic server.py (4700+ lines)

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
│   ├── server.py (monolithic - 4700+ lines, needs refactoring)
│   └── .env
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   └── src/
│       ├── components/
│       │   ├── Layout.jsx (sidebar with admin section)
│       │   └── SophieFloating.jsx
│       └── pages/
│           ├── Admin.jsx (with Infrastructure card)
│           ├── Infrastructure.jsx (NEW - device monitoring)
│           ├── Dashboard.jsx
│           ├── MonthlyHealthCheck.jsx
│           └── ...
├── docker-compose.yml
├── install-synthops.sh
├── nginx/nginx.conf (SSL proxy)
└── ssl/ (generated certs)
```

---

## Key API Endpoints

### Infrastructure Management
- GET /api/infrastructure/devices - List all devices
- POST /api/infrastructure/devices - Add device
- PUT /api/infrastructure/devices/{id} - Update device
- DELETE /api/infrastructure/devices/{id} - Delete device
- POST /api/infrastructure/devices/{id}/check - Check device status
- POST /api/infrastructure/check-all - Check all devices
- GET /api/infrastructure/status - Status summary

### Zammad
- GET /api/zammad/stats - Ticket statistics
- GET /api/zammad/tickets - List tickets

---

## Test Credentials
- Email: admin@test.com
- Password: admin123
- Role: admin

---

## Known Issues
1. Client Detail Page may show 0 assets - needs verification with actual data
2. Zammad/TRMM/Bitdefender integrations require user's internal network access
