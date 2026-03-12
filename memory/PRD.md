# SynthOps - IT Operations Portal
## Product Requirements Document

### Original Problem Statement
Build a self-hosted IT Operations Portal called SynthOps for Synthesis IT Ltd - an MSP managing multiple clients. The portal centralizes infrastructure management, tasks, incidents, projects, documentation, and includes an AI assistant called "Sophie" for IT troubleshooting advice.

### User Personas
1. **IT Admin** - Full system access, user management, TRMM configuration
2. **IT Engineer** - Day-to-day operations, task management, health checks
3. **IT Viewer** - Read-only access to dashboards and reports

### Core Requirements
- Multi-client management (Clients → Sites → Servers)
- Tactical RMM integration for client/agent sync
- Zammad integration for ticket management
- Monthly health checks with best practices
- Task/Kanban management with assignments
- Project tracking with milestones
- Incident logging and resolution
- Maintenance scheduling
- Documentation/Runbooks (markdown)
- Time tracking with timesheets
- Staff activity dashboard
- Sophie AI assistant (Claude Sonnet 4.5)
- JWT authentication with 2FA support
- Dark/Light theme toggle
- NOC Display for TV screens
- Microsoft Teams webhook notifications
- MeshCentral remote access integration
- Vaultwarden password manager integration
- Docker deployment with Vaultwarden

---

## What's Been Implemented (March 12, 2026)

### Latest Session - Logo & P1 Features
- [x] **Synthesis IT Logo** - Updated sidebar, login, and NOC display with company branding
- [x] **Zammad Ticket Response** - Full ticket conversation view with reply functionality
- [x] **DC Health Check Page** (`/dc-health-check`)
  - 36 Active Directory health check templates
  - Select server and run manual checks
  - Mark checks as Pass/Fail with notes
  - Check history with filtering by client/month
  - Export to CSV

### Previous Session - Iteration 4
- [x] **NOC Display Dashboard** (`/display` route)
  - Full-screen TV-optimized display
  - Real-time server status grid (online/offline/maintenance)
  - Open tickets counter, active incidents
  - Auto-refresh every 30 seconds
  - Dark theme optimized for displays
- [x] **MeshCentral Remote Access Integration**
  - Connect button on Server Detail page (cyan styled)
  - Opens MeshCentral in new window
  - `/api/config/meshcentral` endpoint
  - `/api/servers/{id}/mesh-url` endpoint
- [x] **Vaultwarden Integration**
  - Password Vault button in sidebar (amber styled)
  - `/api/config/vaultwarden` endpoint
  - Included in Docker Compose
- [x] **Microsoft Teams Webhook Notifications**
  - `/api/notifications/config` endpoint
  - `/api/notifications/teams/test` endpoint
  - Auto-alerts when server goes offline during sync
  - Settings page shows Teams configuration status
- [x] **Security Hardening**
  - Rate limiting middleware (120 requests/minute)
  - Security headers middleware (X-Frame-Options, X-XSS-Protection, etc.)
  - Audit logging endpoints
- [x] **Updated Settings Page**
  - Integrations section (MeshCentral, Vaultwarden status)
  - Notifications section (Teams webhook status)
  - Test Teams webhook button

### Previous Sessions
- [x] Fixed "Objects are not valid as React child" crash
- [x] Fixed SelectItem empty value crash
- [x] Tactical RMM full sync (clients, sites, servers, workstations)
- [x] NOC-style Server Detail view with live TRMM data
- [x] CSV Export features (Clients, Servers, Incidents, Time Tracking)
- [x] Zammad ticket integration with auto-task creation
- [x] MSP Reports Dashboard
- [x] Server/Workstation separation
- [x] Background scheduler (APScheduler) for auto-sync
- [x] Docker Compose deployment configuration
- [x] Comprehensive User Manual

---

## Prioritized Backlog

### P0 - Critical (Next)
- [ ] **SendGrid Email Notifications** - BLOCKED: Waiting for user API key
  - Server offline alerts
  - New ticket notifications
  - Task assignment emails
  - Daily/weekly summary reports

### P1 - High Priority
- [ ] **Full Project Tracking Module** - Job worksheets and tracking
- [ ] **Sophie AI Assistant** - Frontend chat UI with Claude integration
- [ ] **SSL with Let's Encrypt** - Production HTTPS setup

### P2 - Medium Priority
- [ ] **Sophie AI Assistant** - Frontend chat UI with Claude integration
- [ ] **Scheduled Maintenance Windows** - Suppress alerts during planned downtime
- [ ] **Client Portal** - Read-only view for customers
- [ ] **Google OAuth** - Social login option
- [ ] **TOTP 2FA** - Two-factor authentication setup

### P3 - Future Enhancements
- [ ] **Mobile-friendly Dashboard** - Responsive design for phones
- [ ] **Slack/Discord Webhooks** - Additional notification channels
- [ ] **In-App Documentation** - View USER_MANUAL.md inside app
- [ ] **PDF Report Generation** - Exportable reports

---

## Architecture

```
/app/
├── backend/
│   ├── server.py          # Main FastAPI application
│   ├── requirements.txt   # Python dependencies
│   └── .env               # Environment variables
├── frontend/
│   ├── src/
│   │   ├── App.js         # Main React app with routing
│   │   ├── pages/         # All page components
│   │   │   ├── NOCDisplay.jsx    # TV display dashboard
│   │   │   ├── Settings.jsx      # Updated with integrations
│   │   │   └── ...
│   │   └── components/    # Layout, Sophie, UI
│   ├── package.json
│   └── .env
├── docker-compose.yml     # Production deployment
├── install.sh             # Installation script
├── USER_MANUAL.md         # User documentation
└── memory/
    └── PRD.md             # This file
```

### Database Collections (MongoDB)
- users, clients, sites, servers
- tasks, projects, incidents, maintenance
- documentation, time_entries
- health_checks, health_check_templates
- sophie_chats, sync_logs
- notification_log, audit_log

### Key API Endpoints
- `/api/auth/*` - Authentication
- `/api/config/meshcentral` - MeshCentral config
- `/api/config/vaultwarden` - Vaultwarden config
- `/api/notifications/config` - Notification settings
- `/api/notifications/teams/test` - Test Teams webhook
- `/api/sync/status` - Background sync status
- `/api/sync/trigger/{type}` - Manual sync trigger
- `/api/zammad/tickets` - Zammad tickets
- `/api/trmm/agents/{id}/summary` - NOC view data
- `/api/[entity]/export` - CSV exports

---

## Integrations

| Integration | Status | Configuration |
|-------------|--------|---------------|
| Tactical RMM | Active | API Key in .env |
| Zammad | Active | API Token in .env |
| MeshCentral | Active | URL: https://mesh.synthesis-it.co.uk |
| Vaultwarden | Active | URL: http://localhost:8082 (Docker) |
| Teams Webhook | Ready | TEAMS_WEBHOOK_URL in .env |
| SendGrid | Pending | Waiting for API key |
| Claude AI | Ready | Emergent LLM Key |

---

## Test Credentials
- **Email:** admin@synthesis-it.co.uk
- **Password:** admin123

## Docker Deployment
```bash
# Production deployment
docker-compose up -d

# With admin tools (Mongo Express)
docker-compose --profile admin up -d
```

## Environment Variables Required
```
TACTICAL_RMM_API_URL=
TACTICAL_RMM_API_KEY=
ZAMMAD_API_URL=
ZAMMAD_API_TOKEN=
MESHCENTRAL_URL=
VAULTWARDEN_URL=
TEAMS_WEBHOOK_URL=
SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=
```
