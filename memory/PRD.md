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
- Up to 10 users with role-based access

---

## What's Been Implemented (March 12, 2026)

### Recent Bug Fixes (Latest Session)
- [x] **CRITICAL FIX**: Fixed "Objects are not valid as React child" crash on Clients page
  - Created `getErrorMessage` utility to convert Pydantic validation errors to readable strings
  - Applied fix across all pages with toast.error calls
- [x] **CRITICAL FIX**: Fixed SelectItem empty value crash in Tasks, Projects, Incidents, TimeTracking pages
  - Changed empty string values to 'none' and updated handlers to convert back to null
- [x] Fixed `contract_hours_monthly` field to send null instead of empty string
- [x] Added comprehensive backend API tests (22 tests passing)

### Backend (FastAPI)
- [x] User registration and authentication (JWT + bcrypt)
- [x] Role-based access control (admin, engineer, viewer)
- [x] Client CRUD with Tactical RMM sync
- [x] Site management
- [x] Server management with health check integration
- [x] Task management with kanban view
- [x] Project tracking
- [x] Incident logging and resolution
- [x] Maintenance scheduling and completion
- [x] Documentation with markdown support
- [x] Time entry tracking
- [x] Staff activity endpoint
- [x] Dashboard stats and activity feed
- [x] Sophie AI chat (Claude Sonnet 4.5 via Emergent)
- [x] Tactical RMM test connection and sync
- [x] Field-level encryption for sensitive data
- [x] Health check templates (18 pre-loaded)

### Frontend (React + Shadcn/UI)
- [x] Login page with registration
- [x] Dashboard with stats and activity
- [x] Clients list and detail pages
- [x] Servers list and detail pages
- [x] Server health checks UI
- [x] Tasks with list and kanban views
- [x] Projects management
- [x] Incidents tracking
- [x] Maintenance log
- [x] Documentation viewer/editor
- [x] Time tracking
- [x] Staff activity dashboard
- [x] Admin panel with user management
- [x] Settings page with theme toggle
- [x] Sophie AI chat modal
- [x] Responsive sidebar navigation

---

## Prioritized Backlog

### P0 - Critical (Next)
- [ ] Google OAuth integration
- [ ] TOTP 2FA setup/verification
- [ ] Session management

### P1 - High Priority
- [ ] Export reports (PDF/Excel)
- [ ] Client monthly reports
- [ ] Timesheet export
- [ ] Health check monthly report

### P2 - Medium Priority
- [ ] Drag-and-drop Kanban
- [ ] Scheduled TRMM sync (cron)
- [ ] Audit logging
- [ ] Bulk operations

### P3 - Future Enhancements
- [ ] Docker Compose for production
- [ ] One-line install script
- [ ] Vaultwarden integration
- [ ] phpMyAdmin integration
- [ ] Monitoring integration (Uptime Kuma)

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
│   │   └── components/    # Layout, Sophie, UI
│   ├── package.json
│   └── .env
└── memory/
    └── PRD.md             # This file
```

### Database Collections (MongoDB)
- users
- clients
- sites
- servers
- tasks
- projects
- incidents
- maintenance
- documentation
- time_entries
- health_checks
- sophie_chats

### API Endpoints Summary
- `/api/auth/*` - Authentication
- `/api/users/*` - User management
- `/api/clients/*` - Client CRUD
- `/api/sites/*` - Site CRUD
- `/api/servers/*` - Server CRUD
- `/api/tasks/*` - Task management
- `/api/projects/*` - Project management
- `/api/incidents/*` - Incident tracking
- `/api/maintenance/*` - Maintenance logging
- `/api/docs/*` - Documentation
- `/api/time-entries/*` - Time tracking
- `/api/health-checks/*` - Health checks
- `/api/dashboard/*` - Dashboard stats
- `/api/staff/*` - Staff activity
- `/api/sophie/*` - AI chat
- `/api/integrations/trmm/*` - Tactical RMM

---

## Next Tasks
1. ~~Fix frontend crash on Clients page~~ ✅ DONE
2. Complete enhanced Tactical RMM integration (NOC-style live view)
3. Implement Google OAuth
4. Add TOTP 2FA functionality
5. Create export/report features
6. Add Docker Compose for production deployment
7. Create one-line install script for GitHub
