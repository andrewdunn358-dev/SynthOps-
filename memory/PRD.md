# SynthOps - IT Operations Portal
## Product Requirements Document

**Company:** Synthesis IT Ltd  
**Last Updated:** December 2025

---

## Original Problem Statement
Build a self-hosted IT Operations Portal named "SynthOps" - a "one-stop-shop" to centralize infrastructure information (from Tactical RMM), ticketing system (Zammad), tasks, incidents, projects, and documentation to reduce operational stress and improve oversight for their Managed Service Provider (MSP) business.

---

## Core Requirements

### Dashboard
- [x] Overview showing servers, tasks, incidents, and projects
- [x] Quick stats and system health indicators

### Infrastructure Management
- [x] Server/Infrastructure Inventory synced from Tactical RMM
- [x] NOC-style server view with real-time status
- [x] Client and Site management
- [x] Workstation vs Server classification
- [ ] Client Detail Page showing 0 assets (needs re-verification)

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
- [ ] SendGrid (email summary reports - planned)

### Management Features
- [x] User Management with role-based access (Admin, Engineer, Viewer)
- [x] Password reset functionality
- [x] Custom Report Builder
- [ ] Monthly Health Checks (partial)

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
- [ ] Let's Encrypt SSL (planned)

---

## Completed Work (December 2025)

### Deployment Fix (Latest)
- Fixed `emergentintegrations` package installation in Dockerfile
- Reordered pip install commands to use special index URL

### Infrastructure
- Created Dockerfiles for frontend and backend
- Comprehensive docker-compose.yml with Vaultwarden
- One-line install-synthops.sh script

### Features Implemented
- User Management (Admin page)
- Report Builder page
- Incidents page with TRMM alerts
- Floating Sophie AI widget
- DC Health Check page
- Project Management with jobs/tasks/time entries
- MS Teams webhook notifications

### Bug Fixes
- Documentation page "headings only" issue
- DC Health Check template filter
- Tickets page default filter

---

## Pending Tasks (Priority Order)

### P0 - Critical
- [ ] User verification of recent features after VPS deployment

### P1 - High
- [ ] Let's Encrypt SSL in docker-compose.yml
- [ ] Re-verify Client Detail page 0 assets issue

### P2 - Medium
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
│       ├── components/common/FloatingSophie.jsx
│       └── pages/
│           ├── Admin.jsx
│           ├── DCHealthCheck.jsx
│           ├── ProjectDetail.jsx
│           └── ReportsBuilder.jsx
├── docker-compose.yml
├── install-synthops.sh
├── README.md
└── USER_MANUAL.md
```

---

## Credentials (Private Repo)
- Tactical RMM: https://api.synthesis-it.co.uk/
- Zammad: https://help.synthesis-it.co.uk
- MeshCentral: https://mesh.synthesis-it.co.uk

---

## Known Issues
1. Client Detail Page may show 0 assets - needs verification with actual data
