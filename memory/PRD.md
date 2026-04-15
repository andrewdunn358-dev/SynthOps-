# SynthOps - IT Operations Portal
## Product Requirements Document

**Company:** Synthesis IT Ltd  
**Last Updated:** April 2026

---

## Original Problem Statement
Build a self-hosted IT Operations Portal named "SynthOps" - a "one-stop-shop" to centralize infrastructure information (from Tactical RMM), tasks, incidents, projects, and documentation to reduce operational stress and improve oversight for their Managed Service Provider (MSP) business.

---

## Core Requirements

### Dashboard
- [x] Overview showing servers, tasks, incidents, and projects
- [x] Quick stats and system health indicators
- [x] Infrastructure Monitoring section
- [x] **Upcoming tasks alert (due within 2 days)**

### Tasks (Enhanced - March 2025)
- [x] Task list and Kanban views
- [x] **Recurring tasks** - daily, weekly, monthly, yearly patterns
- [x] **Task reminders** - configurable days before due date
- [x] **Task notes** - all users can add notes to tasks
- [x] **Task detail view** - click task to see full details
- [x] **Dashboard alerts for upcoming tasks**

### Infrastructure Management
- [x] Server/Infrastructure Inventory synced from Tactical RMM
- [x] NOC-style server view
- [x] Infrastructure Monitoring page (Proxmox, SNMP, Ping)
- [x] Detailed Proxmox view with VMs and containers

### Project Management
- [x] Project tracking with jobs and tasks
- [x] Time entries tracking
- [x] Engineers can create/edit projects

### Customer CRM
1. **Full CRM Page at /customers** - linked to TRMM clients
2. **Customer Notes** - activity tracking with timestamps

### Stock & Asset Management
1. **Full Asset Page at /stock** - hardware inventory
2. **Asset tracking** - cost, warranty, status, location

### Monthly Health Check
1. **Server sorting** - alphabetically by client
2. **Draft save** - resume later with Continue button

### Integrations
- [x] Tactical RMM (sync clients, sites, agents)
- [x] MeshCentral (Connect button)
- [x] Vaultwarden (Docker integration)
- [x] Microsoft Teams (webhook alerts)
- [x] Sophie AI Assistant (Gemini)
- [x] Bitdefender GravityZone (security alerts)
- [x] Proxmox (API monitoring)
- [x] Altaro Backup API (live VM backup status)
- [x] **AhsayCBS Backup API** (live backup user status)
- [x] ~~Zammad~~ **REMOVED**

---

## Completed (April 2026)

### AhsayCBS Backup API Integration
1. **Live user data**: Pulls real-time backup user status from AhsayCBS REST API (16 users via /obs/api/json/2/ListUsers.do)
2. **Backup health detection**: Classifies users as Healthy (<26h), Warning (26-72h), Stale (>72h), Never
3. **Stale backup alerts**: Highlighted at top with user name and days since last backup (3 stale detected)
4. **User table**: Login name, alias, client type (ACB/OBM), backup status, data size, quota usage bar, online status
5. **Smart caching**: Results cached in MongoDB ahsay_cache; falls back to cache on API errors
6. **NOC Integration**: Reminders view shows separate Ahsay panel (12 healthy, 3 stale, 1907 GB, 75% health rate)
7. **Tabbed UI**: 3 tabs — "Altaro Live Status", "Ahsay CBS Status", "Manual Logs"

## Completed (February 2026)

### NOC Display Fixes
1. **All Clients Visible** - NOC now fetches `/clients` to show all 42 clients
2. **Bitdefender Agent Count** - Security panel shows: Agents Installed (398), Companies (44), Active Alerts
3. **Servers Only in Device Grid** - NOC shows only servers (58) in the device grid
4. **Clients Grid Added** - New grid section showing all clients with server/workstation counts

### NOC Auto-Cycle Feature
1. **5 Views**: Security, Clients, Servers, Reminders, Alerts - auto-rotates every 15 seconds
2. **Manual Controls**: Previous/Next arrows, clickable view pills, Pause/Play button
3. **Progress Bar**: Visual indicator of time until next view switch

### Altaro Backup API Integration
1. **Live backup data**: Pulls real-time VM backup status from Altaro/Hornetsecurity API (19 customers, 41 VMs)
2. **Smart caching**: Results cached in MongoDB; falls back to cache when API rate-limited
3. **Customer breakdown**: Per-customer VM counts, success/fail badges, expandable VM details
4. **Failed backup alerts**: Highlighted at top of page with customer and VM name

### Backup Tracking System
1. **Backend CRUD**: `/api/backups` - Create, Read, Update, Delete backup logs
2. **Backup Stats**: `/api/backups/stats` - Monthly summary
3. **Frontend Page**: `/backups` - Full page with stat cards, filters, data table
4. **Dashboard & NOC Integration**: Backup stats on dashboard and NOC reminders

### Bug Fixes (February 2026)
1. **Task Assignment Dropdown** - Decoupled API fetches
2. **Login Auth Detection** - Redirect if authenticated
3. **Daily Tech Tips** - 30 curated MSP/IT tips on Dashboard
4. **Zammad Full Removal** - All backend/frontend code removed

## Completed (December 2025)
- Customer CRM Feature
- Stock & Asset Management
- Monthly Health Check Enhancements
- Sophie AI Migration to Gemini
- Project Work Logs UI enhancement
- Various bug fixes

---

## Remaining Tasks (Priority Order)

### P1 - High
- [x] NOC Display - Show all clients including TRMM imports (DONE)
- [x] NOC Display - Bitdefender agent count on security panel (DONE)
- [x] Zammad backend code fully removed (DONE)
- [x] AhsayCBS Backup API Integration (DONE)
- [ ] Proxmox VM/Container data fetch (pending user token permissions)

### P2 - Medium  
- [ ] SNMP device monitoring (full data)
- [ ] Let's Encrypt SSL
- [ ] Verify Server vs Workstation classification on live TRMM data
- [ ] Scheduled daily Altaro/Ahsay sync to DB

### P3 - Low/Future
- [ ] Mobile application
- [ ] Backend refactoring (split server.py into modules)

---

## API Endpoints

### Backup Integrations
- `GET /api/backups/altaro/status` - Live Altaro/Hornetsecurity backup status
- `GET /api/backups/ahsay/status` - Live AhsayCBS backup user status
- `GET /api/backups` - List manual backup logs
- `POST /api/backups` - Create backup log
- `PUT /api/backups/{id}` - Update backup log
- `DELETE /api/backups/{id}` - Delete backup log
- `GET /api/backups/stats` - Monthly backup statistics

### Customer CRM
- `GET /api/customers` - List all customers
- `POST /api/customers` - Create customer
- `GET /api/customers/{id}` - Get customer details
- `PUT /api/customers/{id}` - Update customer
- `DELETE /api/customers/{id}` - Delete customer
- `GET /api/customers/{id}/notes` - List customer notes
- `POST /api/customers/{id}/notes` - Add customer note
- `DELETE /api/customers/{id}/notes/{note_id}` - Delete note

### Stock/Asset Management
- `GET /api/assets` - List all assets
- `POST /api/assets` - Create asset
- `GET /api/assets/{id}` - Get asset details
- `PUT /api/assets/{id}` - Update asset
- `DELETE /api/assets/{id}` - Delete asset

### Tasks
- `GET /api/tasks` - List tasks
- `GET /api/tasks/{task_id}` - Get single task
- `GET /api/tasks/upcoming?days=2` - Get upcoming tasks
- `GET /api/tasks/{task_id}/notes` - List task notes
- `POST /api/tasks/{task_id}/notes` - Add note
- `DELETE /api/tasks/{task_id}/notes/{note_id}` - Delete note

---

## Deployment
```bash
git pull origin main && docker compose build --no-cache && docker compose up -d
```
