# SynthOps - IT Operations Portal
## Product Requirements Document

**Company:** Synthesis IT Ltd  
**Last Updated:** March 2025

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

### Integrations
- [x] Tactical RMM (sync clients, sites, agents)
- [x] MeshCentral (Connect button)
- [x] Vaultwarden (Docker integration)
- [x] Microsoft Teams (webhook alerts)
- [x] Sophie AI Assistant (Claude)
- [x] Bitdefender GravityZone (security alerts)
- [x] Proxmox (API monitoring)
- [x] ~~Zammad~~ **REMOVED**

---

## Completed This Session (March 2025)

### Task System Enhancements
1. **Recurring Tasks**
   - Added `is_recurring`, `recurrence_pattern`, `recurrence_interval`, `recurrence_end_date` fields
   - Pattern options: daily, weekly, monthly, yearly
   - Toggle switch in task creation form

2. **Task Notes**
   - All authenticated users can add notes to any task
   - Notes show author name and timestamp
   - Note creators (or admins) can delete their notes
   - Notes count badge on task list

3. **Task Detail View**
   - Click any task to open detail dialog
   - Shows all task info, assigned user, client, project
   - Notes section with ability to add new notes
   - Edit button to modify task

4. **Dashboard Upcoming Tasks**
   - Alert card shows tasks due in next 2 days
   - Shows task title, client, priority, recurrence pattern
   - Link to view all tasks

### Zammad Removal
- Removed Tickets page and route
- Removed from sidebar navigation
- Removed from Dashboard
- Removed from ClientDetail page
- Removed Zammad status from Admin page

### Other Fixes
- Rate limiter now only limits login attempts (prevents 429 errors)
- Engineers can view user list (for task assignment)
- Fixed Ticket reference error in ClientDetail

---

## Remaining Tasks (Priority Order)

### P1 - High
- [ ] Customer CRM section (linked to TRMM + manual)
- [ ] Stock/Asset tracking sheet
- [ ] Monthly health check - save progress
- [ ] Monthly check server list alphabetical order
- [ ] Bitdefender alerts investigation

### P2 - Medium  
- [ ] SNMP device monitoring (full data)
- [ ] Let's Encrypt SSL

### P3 - Low/Future
- [ ] Mobile application
- [ ] Backend refactoring (split server.py)

---

## API Endpoints Added

### Task Notes
- `GET /api/tasks/{task_id}/notes` - List task notes
- `POST /api/tasks/{task_id}/notes` - Add note
- `DELETE /api/tasks/{task_id}/notes/{note_id}` - Delete note

### Task Detail
- `GET /api/tasks/{task_id}` - Get single task with full details

### Upcoming Tasks
- `GET /api/tasks/upcoming?days=2` - Get tasks due within X days

---

## Database Schema Changes

### tasks collection - New Fields
```
is_recurring: boolean (default: false)
recurrence_pattern: string ("daily", "weekly", "monthly", "yearly")
recurrence_interval: number (default: 1)
recurrence_end_date: datetime (optional)
reminder_days: number (default: 0)
```

### task_notes collection - New
```
id: uuid
task_id: uuid
content: encrypted string
created_by: uuid
created_at: datetime
```

---

## Deployment
```bash
git pull origin main && docker compose build --no-cache && docker compose up -d
```
