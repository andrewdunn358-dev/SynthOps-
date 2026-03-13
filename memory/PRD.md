# SynthOps - IT Operations Portal
## Product Requirements Document

### Original Problem Statement
Build a self-hosted IT Operations Portal called SynthOps for Synthesis IT Ltd - an MSP managing multiple clients. The portal centralizes infrastructure management, tasks, incidents, projects, documentation, and includes an AI assistant called "Sophie" for IT troubleshooting advice.

### User Personas
1. **Admin** - Full system access, user management, TRMM configuration
2. **Engineer** - Day-to-day operations, task management, health checks
3. **Viewer** - Read-only access to dashboards and reports

---

## What's Been Implemented (March 13, 2026)

### Latest Session - Complete Overhaul
- [x] **Synthesis IT Logo** - Company branding throughout app
- [x] **Floating Sophie AI** - Chat button in bottom-right corner
- [x] **Reports Builder** - Custom report generation with:
  - Client filter, Date range, Group by options
  - Include checkboxes (Servers, Tickets, Incidents, Maintenance, Time)
  - Export to CSV
  - Visual breakdown by client, OS distribution
- [x] **Incidents + TRMM Alerts** - Offline servers auto-shown as incidents
  - Alert banner showing count of offline servers
  - Source filter (All/Manual/TRMM)
  - TRMM badge on each incident row
- [x] **Admin Panel Overhaul**
  - User Management with Create User button
  - Role dropdown (Admin/Engineer/Viewer)
  - Password reset functionality
  - Status toggle (Active/Inactive)
  - Role permissions reference
  - Removed phpMyAdmin (MongoDB incompatible)
- [x] **Tickets** - Defaults to Open tickets only
- [x] **Maintenance** - Defaults to Upcoming & Overdue
  - Alert banners for overdue/upcoming items
- [x] **Documentation** - Seeded with actual runbook content
  - AD Health Check Guide
  - Backup Best Practices
  - New Server Setup Checklist
- [x] **DC Health Check** - Fixed category filtering
- [x] **One-Line Ubuntu Installer** - `/app/install-synthops.sh`

### Previous Sessions
- [x] Full Project Tracking with Jobs & Worksheets
- [x] NOC Display Dashboard (`/display`)
- [x] MeshCentral Remote Access (Connect button)
- [x] Vaultwarden Password Manager integration
- [x] Microsoft Teams Webhook notifications
- [x] Security Hardening (rate limiting, headers, audit)
- [x] Zammad Ticket Response feature
- [x] Tactical RMM full sync
- [x] APScheduler background sync
- [x] Docker Compose deployment
- [x] CSV Export features
- [x] MSP Reports Dashboard

---

## Prioritized Backlog

### P0 - Critical
- [x] All core features implemented

### P1 - High Priority
- [ ] SSL with Let's Encrypt for production
- [ ] SendGrid Email Notifications (waiting for API key)

### P2 - Medium Priority
- [ ] Scheduled Maintenance Windows (suppress alerts)
- [ ] Client Portal (read-only customer view)
- [ ] Google OAuth login option

### P3 - Future Enhancements
- [ ] Mobile-friendly responsive design
- [ ] Slack/Discord webhooks
- [ ] PDF Report Generation
- [ ] In-app help documentation viewer

---

## Installation

### One-Line Ubuntu Install
```bash
curl -fsSL https://raw.githubusercontent.com/andrewdunn358-dev/SynthOps-/main/install-synthops.sh | sudo bash
```

### Docker Compose
```bash
git clone https://github.com/andrewdunn358-dev/SynthOps-.git
cd SynthOps-
cp .env.example .env
docker compose up -d
```

### Environment Variables
```
# Required
TACTICAL_RMM_API_URL=https://api.your-trmm.com/
TACTICAL_RMM_API_KEY=your-key

# Optional
ZAMMAD_API_URL=https://help.yourcompany.com
ZAMMAD_API_TOKEN=your-token
MESHCENTRAL_URL=https://mesh.yourcompany.com
TEAMS_WEBHOOK_URL=your-webhook-url
```

---

## Architecture

```
/app/
├── backend/
│   ├── server.py          # FastAPI application
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.js
│   │   ├── pages/         # All UI pages
│   │   └── components/    # Layout, SophieFloating, UI
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
├── install-synthops.sh    # One-line installer
├── install.sh             # Full installer script
├── uninstall.sh
├── README.md
├── USER_MANUAL.md
└── .env.example
```

---

## User Roles

| Role | Permissions |
|------|-------------|
| Admin | Full access, user management, system settings |
| Engineer | Manage servers/clients, create tasks/incidents, time tracking |
| Viewer | View dashboards and reports only |

---

## Test Credentials
- **Email:** admin@synthesis-it.co.uk
- **Password:** admin123

---

## Integration Status

| Integration | Status | Notes |
|-------------|--------|-------|
| Tactical RMM | ✅ Active | Full sync working |
| Zammad | ✅ Active | Tickets + Reply |
| MeshCentral | ✅ Active | Connect button |
| Vaultwarden | ✅ Active | Docker container |
| Teams Webhook | ✅ Ready | Add URL to .env |
| SendGrid | ⏳ Pending | Needs API key |
| Sophie AI | ✅ Active | Claude Sonnet 4.5 |

---

Built with ❤️ for MSPs by Synthesis IT Ltd
