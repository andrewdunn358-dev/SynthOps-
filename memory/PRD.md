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
- [x] Sophie AI Assistant (Claude)
- [x] Bitdefender GravityZone (security alerts)
- [x] Proxmox (API monitoring)
- [x] ~~Zammad~~ **REMOVED**

---

## Completed Previous Sessions (March 2025)

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

## Completed This Session (February 2026)

### NOC Display Fixes
1. **All Clients Visible** - NOC now fetches `/clients` to show all 42 clients (including TRMM-imported ones like PHL, ACMS, Aston Beaumont)
2. **Bitdefender Agent Count** - Security panel now shows: Agents Installed (398), Companies (44), Active Alerts count, and per-company endpoint breakdown
3. **Servers Only in Device Grid** - NOC shows only servers (58) in the device grid, not workstations (per user request)
4. **Clients Grid Added** - New grid section showing all clients with server/workstation counts

### NOC Auto-Cycle Feature
1. **4 Views**: Security, Clients, Servers, Alerts - auto-rotates every 15 seconds
2. **Manual Controls**: Previous/Next arrows, clickable view pills, Pause/Play button
3. **Progress Bar**: Visual indicator of time until next view switch
4. **Smooth Transitions**: Fade in/out between views
5. **Data Refresh**: Continues fetching fresh data every 30 seconds regardless of view

### Bug Fixes (This Session)
1. **Task Assignment Dropdown** - Users fetch separated from Promise.all so it doesn't fail silently when other requests fail
2. **Login Auth Detection** - Login page now redirects to dashboard if user is already authenticated
3. **Daily Tech Tips** - 30 curated MSP/IT tech tips rotate daily on the Dashboard (DNS, Security, Backup, PowerShell, etc.)
1. **Backend** - All Zammad endpoints removed (~400 lines): /zammad/test, /zammad/tickets, /zammad/stats, /zammad/organizations, /zammad/tickets/{id}/reply, /zammad/ticket-to-task, /zammad/sync-to-tasks
2. **Scheduled Sync** - `scheduled_zammad_sync()` function and scheduler job removed
3. **Sync Status** - `/sync/status` and `/sync/trigger` no longer reference Zammad
4. **Frontend** - Reports.jsx Zammad ticket API call removed, NOCDisplay.jsx Zammad ticket fetch removed

---

## Completed Previous Session (December 2025)

### Customer CRM Feature
1. **Full CRM Page at /customers**
   - Stats cards: Total Customers, Active, Total Contract Value, With Notes
   - Search and filter by status
   - Customer table with contact info, contract details, server count
   
2. **Customer Management**
   - Add/Edit customer dialog with tabbed interface (Basic Info, Contract, Other)
   - Link customers to TRMM clients
   - Contract tracking: type, value, start/end dates
   - Account manager assignment
   
3. **Customer Notes**
   - Activity notes with timestamps
   - Any user can add notes
   - Note count displayed on table

### Stock & Asset Management Feature
1. **Full Asset Page at /stock**
   - Stats cards: Total Assets, In Stock, Deployed, Total Value
   - Warranty expiry alerts
   - Search and filter by type/status

2. **Asset Types**
   - Server, Laptop, Desktop, Network, Storage, Other
   - Status: In Stock, In Refurb, Deployed, Disposed, Sold
   - Condition: New, Refurbished, Used

3. **Asset Details**
   - Manufacturer, Model, Serial Number, Specifications
   - Purchase date, cost, supplier
   - Warranty end date with expiry tracking
   - Assign to customer and location

### Monthly Health Check Enhancements
1. **Server List Sorting** - Alphabetically by client name
2. **Save Progress/Draft** - Save without sign-off, resume later
3. **Continue Button** - History tab shows drafts with Continue button

---

## Remaining Tasks (Priority Order)

### P1 - High
- [x] NOC Display - Show all clients including TRMM imports (DONE)
- [x] NOC Display - Bitdefender agent count on security panel (DONE)
- [x] Zammad backend code fully removed (DONE)
- [ ] Proxmox VM/Container data fetch (confirmed working by user)

### P2 - Medium  
- [ ] SNMP device monitoring (full data)
- [ ] Let's Encrypt SSL
- [ ] Verify Server vs Workstation classification on live TRMM data

### P3 - Low/Future
- [ ] Mobile application
- [ ] Backend refactoring (split server.py into modules)

---

## API Endpoints Added

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

### customers collection - New
```
id: uuid
name: string
trmm_client_id: uuid (optional, links to clients)
contact_name, contact_email, contact_phone: string
address, website: string
contract_type: string (monthly, annual, project, adhoc)
contract_value: float
contract_start, contract_end: datetime
account_manager: uuid (user id)
notes: encrypted string
tags: array
is_active: boolean
created_at, updated_at: datetime
```

### customer_notes collection - New
```
id: uuid
customer_id: uuid
content: encrypted string
created_by: uuid
created_at: datetime
```

### assets collection - New
```
id: uuid
name: string
asset_type: string (server, laptop, desktop, network, storage, other)
manufacturer, model, serial_number: string
specifications: encrypted string
purchase_date: datetime
purchase_cost: float
warranty_end: datetime
supplier: string
status: string (in_stock, in_refurb, deployed, disposed, sold)
condition: string (new, refurbished, used)
assigned_customer_id: uuid
location: string
notes: encrypted string
tags: array
created_by: uuid
created_at, updated_at: datetime
```

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
