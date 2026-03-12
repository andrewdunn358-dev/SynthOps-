# IT Operations Portal - Expanded Plan v2
## MSP/Multi-Client IT Service Management Portal

---

## OVERVIEW

A comprehensive **MSP-style IT Operations Portal** for managing multiple clients, their infrastructure, staff workloads, monthly health checks, and operational tasks - with Tactical RMM integration.

---

## 1. EXPANDED ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           REVERSE PROXY (Traefik)                           │
│                        HTTPS / SSL Termination                              │
└─────────────────────────────────────────────────────────────────────────────┘
          │              │              │              │              │
    ┌─────┴─────┐  ┌─────┴─────┐  ┌─────┴─────┐  ┌─────┴─────┐  ┌─────┴─────┐
    │ Frontend  │  │  Backend  │  │Vaultwarden│  │phpMyAdmin │  │ (Future)  │
    │  React    │  │  FastAPI  │  │ Passwords │  │ DB Admin  │  │ Uptime    │
    │  :3000    │  │  :8001    │  │  :8080    │  │  :8081    │  │ Kuma      │
    └───────────┘  └─────┬─────┘  └───────────┘  └───────────┘  └───────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
    ┌────┴────┐    ┌─────┴─────┐   ┌─────┴─────┐
    │ MariaDB │    │  Tactical │   │  (Future) │
    │  :3306  │    │  RMM API  │   │ Monitoring│
    └─────────┘    │ (External)│   │    API    │
                   └───────────┘   └───────────┘
```

---

## 2. MULTI-CLIENT STRUCTURE

### Client Hierarchy
```
MSP Portal (Your Company)
├── Client A (Company A)
│   ├── Site: Main Office
│   │   ├── Server: DC01
│   │   ├── Server: FS01
│   │   └── Server: HV01
│   └── Site: Branch Office
│       └── Server: DC02
├── Client B (Company B)
│   └── Site: HQ
│       ├── Server: DC01
│       └── Server: APP01
└── Client C...
```

### Database Schema - Client Management

```sql
-- CLIENTS (Top level - your customers)
CREATE TABLE clients (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) UNIQUE,  -- Short code like "ACME"
    contact_name VARCHAR(255),
    contact_email VARCHAR(255),
    contact_phone VARCHAR(50),
    address TEXT,
    contract_type ENUM('monthly', 'yearly', 'ad-hoc', 'project'),
    contract_hours_monthly INT,  -- Contracted support hours
    billing_rate DECIMAL(10,2),
    notes_encrypted TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    tactical_rmm_client_id INT,  -- Link to Tactical RMM
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_code (code),
    INDEX idx_active (is_active)
);

-- SITES (Locations within a client)
CREATE TABLE sites (
    id INT AUTO_INCREMENT PRIMARY KEY,
    client_id INT NOT NULL REFERENCES clients(id),
    name VARCHAR(255) NOT NULL,
    address TEXT,
    contact_name VARCHAR(255),
    contact_phone VARCHAR(50),
    tactical_rmm_site_id INT,  -- Link to Tactical RMM
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_client (client_id)
);

-- SERVERS (Now linked to sites/clients)
CREATE TABLE servers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    site_id INT NOT NULL REFERENCES sites(id),
    hostname VARCHAR(255) NOT NULL,
    role VARCHAR(100),
    server_type ENUM('physical', 'virtual', 'cloud') DEFAULT 'virtual',
    ip_address VARCHAR(45),
    operating_system VARCHAR(100),
    os_version VARCHAR(50),
    cpu_cores INT,
    ram_gb INT,
    storage_gb INT,
    environment ENUM('production', 'test', 'development', 'staging'),
    criticality ENUM('critical', 'high', 'medium', 'low') DEFAULT 'medium',
    notes_encrypted TEXT,
    status ENUM('online', 'offline', 'maintenance', 'decommissioned'),
    last_health_check DATETIME,
    tactical_rmm_agent_id VARCHAR(255),  -- Link to Tactical RMM agent
    created_by INT REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_site (site_id),
    INDEX idx_hostname (hostname),
    INDEX idx_status (status)
);
```

---

## 3. TACTICAL RMM INTEGRATION

### API Integration Strategy

Based on the Tactical RMM API documentation:
- **Authentication**: X-API-KEY header
- **Endpoints**: RESTful, trailing slash required
- **Data Available**: Clients, Sites, Agents, Software, Tasks, Audit logs

### Sync Configuration Table

```sql
CREATE TABLE tactical_rmm_config (
    id INT AUTO_INCREMENT PRIMARY KEY,
    api_url VARCHAR(255) NOT NULL,  -- e.g., https://api.yourtrmm.com
    api_key_encrypted VARCHAR(255) NOT NULL,
    sync_enabled BOOLEAN DEFAULT TRUE,
    last_sync DATETIME,
    sync_interval_minutes INT DEFAULT 60,
    sync_clients BOOLEAN DEFAULT TRUE,
    sync_sites BOOLEAN DEFAULT TRUE,
    sync_agents BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tactical_rmm_sync_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sync_type ENUM('clients', 'sites', 'agents', 'full'),
    status ENUM('started', 'completed', 'failed'),
    items_synced INT,
    items_added INT,
    items_updated INT,
    error_message TEXT,
    started_at DATETIME,
    completed_at DATETIME
);
```

### API Integration Code Structure

```python
# backend/integrations/tactical_rmm.py

class TacticalRMMClient:
    """
    Tactical RMM API Client
    
    Key Endpoints:
    - GET /clients/          → List all clients
    - GET /clients/{id}/     → Client details
    - GET /clients/{id}/sites/ → Sites for client
    - GET /agents/           → List all agents
    - GET /agents/{agent_id}/ → Agent details + custom fields
    - GET /software/{agent_id}/ → Installed software
    - POST /agents/{agent_id}/cmd/ → Run command
    """
    
    def __init__(self, api_url: str, api_key: str):
        self.api_url = api_url.rstrip('/')
        self.headers = {
            "Content-Type": "application/json",
            "X-API-KEY": api_key
        }
    
    async def get_clients(self) -> List[dict]:
        """Fetch all clients from Tactical RMM"""
        pass
    
    async def get_sites(self, client_id: int) -> List[dict]:
        """Fetch sites for a client"""
        pass
    
    async def get_agents(self, detail: bool = True) -> List[dict]:
        """Fetch all agents"""
        pass
    
    async def sync_all(self) -> SyncResult:
        """Full sync: clients → sites → agents"""
        pass
```

### Sync Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    TACTICAL RMM SYNC FLOW                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Manual Trigger or Scheduled (hourly)                        │
│     ↓                                                           │
│  2. Fetch Clients from TRMM API                                 │
│     GET /clients/                                               │
│     ↓                                                           │
│  3. For each client:                                            │
│     - Create/Update in local DB                                 │
│     - Store tactical_rmm_client_id                              │
│     ↓                                                           │
│  4. Fetch Sites for each client                                 │
│     GET /clients/{id}/sites/                                    │
│     ↓                                                           │
│  5. Fetch Agents                                                │
│     GET /agents/?detail=true                                    │
│     ↓                                                           │
│  6. Match agents to sites, create servers                       │
│     - Store tactical_rmm_agent_id                               │
│     ↓                                                           │
│  7. Log sync results                                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. MONTHLY HEALTH CHECKS SYSTEM

### Health Check Templates (Best Practices)

```sql
-- Health check categories and items
CREATE TABLE health_check_templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    check_type ENUM('manual', 'automated') DEFAULT 'manual',
    server_roles JSON,  -- Which server roles this applies to
    frequency ENUM('daily', 'weekly', 'monthly', 'quarterly'),
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INT DEFAULT 0
);

-- Individual health check instance
CREATE TABLE health_checks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    server_id INT NOT NULL REFERENCES servers(id),
    template_id INT REFERENCES health_check_templates(id),
    check_date DATE NOT NULL,
    period_month INT,  -- e.g., 1-12
    period_year INT,   -- e.g., 2026
    performed_by INT REFERENCES users(id),
    status ENUM('pending', 'passed', 'warning', 'failed', 'skipped'),
    notes_encrypted TEXT,
    value_recorded VARCHAR(255),  -- e.g., "85%" for disk space
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_server_date (server_id, check_date),
    INDEX idx_period (period_year, period_month)
);
```

### Pre-loaded Health Check Templates

| Category | Check Item | Server Roles | Frequency |
|----------|-----------|--------------|-----------|
| **Storage** | Disk Space Usage (alert >80%) | All | Monthly |
| **Storage** | RAID Health Status | Physical | Monthly |
| **Storage** | SAN/NAS Connectivity | All | Monthly |
| **Active Directory** | DC Replication Status | Domain Controller | Monthly |
| **Active Directory** | FSMO Roles Verification | Domain Controller | Monthly |
| **Active Directory** | AD Sites & Services | Domain Controller | Monthly |
| **Active Directory** | DNS Health Check | Domain Controller | Monthly |
| **Active Directory** | Group Policy Replication | Domain Controller | Monthly |
| **Active Directory** | Tombstone Lifetime Check | Domain Controller | Quarterly |
| **Active Directory** | SYSVOL Replication | Domain Controller | Monthly |
| **Backup** | Backup Job Status | All | Weekly |
| **Backup** | Backup Storage Capacity | Backup Server | Monthly |
| **Backup** | Test Restore Verification | All | Monthly |
| **Backup** | Offsite Backup Sync | Backup Server | Monthly |
| **Security** | Windows Updates Status | All Windows | Monthly |
| **Security** | Antivirus Definitions | All | Weekly |
| **Security** | Certificate Expiry Check | All | Monthly |
| **Security** | SSL/TLS Certificate Validity | Web Servers | Monthly |
| **Security** | Local Admin Accounts Audit | All | Quarterly |
| **Security** | Failed Login Attempts Review | Domain Controller | Monthly |
| **Performance** | CPU Usage Trends | All | Monthly |
| **Performance** | Memory Usage Trends | All | Monthly |
| **Performance** | Event Log Errors Review | All | Monthly |
| **Hyper-V** | VM Snapshot Cleanup | Hypervisor | Monthly |
| **Hyper-V** | VM Resource Allocation | Hypervisor | Monthly |
| **Hyper-V** | Hyper-V Replication Status | Hypervisor | Monthly |
| **Hyper-V** | Integration Services Version | Hypervisor | Quarterly |
| **Network** | NIC Teaming Status | Physical | Monthly |
| **Network** | DNS Resolution Test | All | Monthly |
| **Hardware** | Firmware Version Check | Physical | Quarterly |
| **Hardware** | BIOS/UEFI Updates | Physical | Quarterly |
| **Hardware** | Hardware Warranty Status | Physical | Quarterly |

### Health Check Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                MONTHLY HEALTH CHECK WORKFLOW                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Start of Month: Generate check lists for all servers        │
│     - Based on server role → applicable templates               │
│     - Status: "pending"                                         │
│                                                                 │
│  2. Engineer opens Server → Health Checks tab                   │
│     - Sees checklist for current month                          │
│     - Each item shows: Category, Check, Status, Notes           │
│                                                                 │
│  3. Engineer performs check:                                    │
│     - Mark as: Passed / Warning / Failed / Skipped              │
│     - Add value if applicable (e.g., "Disk: 72%")               │
│     - Add notes                                                 │
│                                                                 │
│  4. Dashboard shows:                                            │
│     - Servers with pending checks                               │
│     - Servers with warnings/failures                            │
│     - Completion percentage per client                          │
│                                                                 │
│  5. End of Month: Generate reports                              │
│     - Per client PDF export                                     │
│     - Summary of all checks                                     │
│     - Trends over time                                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Health Check UI - Server Page

```
┌─────────────────────────────────────────────────────────────────┐
│  SERVER: DC01 (Client: ACME Corp)                    [Edit]     │
├─────────────────────────────────────────────────────────────────┤
│  Role: Domain Controller | IP: 192.168.1.10 | Status: Online    │
├──────────┬──────────┬──────────┬──────────┬──────────────────────┤
│ Overview │ Health   │ Incidents│ Tasks    │ Maintenance          │
│          │ Checks ◄ │          │          │                      │
├──────────┴──────────┴──────────┴──────────┴──────────────────────┤
│                                                                 │
│  MONTHLY HEALTH CHECKS - January 2026         [Generate Report] │
│  ─────────────────────────────────────────────────────────────  │
│  Progress: ████████░░░░░░░░ 12/20 (60%)                         │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Category: Storage                                           ││
│  ├─────────────────────────────────────────────────────────────┤│
│  │ ☑ Disk Space Usage        [PASSED]  Value: 72%    [Notes]  ││
│  │ ☐ RAID Health Status      [PENDING]               [Check]  ││
│  ├─────────────────────────────────────────────────────────────┤│
│  │ Category: Active Directory                                  ││
│  ├─────────────────────────────────────────────────────────────┤│
│  │ ☑ DC Replication Status   [PASSED]               [Notes]   ││
│  │ ☑ FSMO Roles Verification [PASSED]               [Notes]   ││
│  │ ☐ DNS Health Check        [PENDING]               [Check]  ││
│  │ ⚠ Group Policy Replication [WARNING] Notes: Slow [View]    ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. STAFF MANAGEMENT & TIME TRACKING

### Staff/User Tables

```sql
-- Extended users table for staff management
ALTER TABLE users ADD COLUMN (
    job_title VARCHAR(100),
    department VARCHAR(100),
    hourly_rate DECIMAL(10,2),
    contracted_hours_weekly INT DEFAULT 40,
    manager_id INT REFERENCES users(id),
    can_approve_timesheets BOOLEAN DEFAULT FALSE
);

-- Time entries for timesheet
CREATE TABLE time_entries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id),
    client_id INT REFERENCES clients(id),
    task_id INT REFERENCES tasks(id),
    project_id INT REFERENCES projects(id),
    incident_id INT REFERENCES incidents(id),
    entry_date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    duration_minutes INT NOT NULL,
    description TEXT,
    is_billable BOOLEAN DEFAULT TRUE,
    billing_rate DECIMAL(10,2),
    status ENUM('draft', 'submitted', 'approved', 'rejected') DEFAULT 'draft',
    approved_by INT REFERENCES users(id),
    approved_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_date (user_id, entry_date),
    INDEX idx_client (client_id),
    INDEX idx_status (status)
);

-- Weekly timesheets for approval workflow
CREATE TABLE timesheets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id),
    week_start DATE NOT NULL,  -- Monday of the week
    week_end DATE NOT NULL,    -- Sunday of the week
    total_hours DECIMAL(5,2),
    billable_hours DECIMAL(5,2),
    status ENUM('draft', 'submitted', 'approved', 'rejected') DEFAULT 'draft',
    submitted_at DATETIME,
    approved_by INT REFERENCES users(id),
    approved_at DATETIME,
    rejection_notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_user_week (user_id, week_start)
);
```

### Staff Activity Dashboard

```
┌─────────────────────────────────────────────────────────────────┐
│  STAFF DASHBOARD                              January 15, 2026   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ CURRENT ACTIVITY (Live)                      [Refresh]      ││
│  ├──────────┬────────────┬─────────────┬───────────────────────┤│
│  │ Staff    │ Client     │ Working On  │ Duration              ││
│  ├──────────┼────────────┼─────────────┼───────────────────────┤│
│  │ John D.  │ ACME Corp  │ Task: DC    │ 🟢 1h 23m             ││
│  │          │            │ Migration   │                       ││
│  │ Sarah M. │ TechStart  │ Incident:   │ 🟢 45m                ││
│  │          │            │ VPN Issue   │                       ││
│  │ Mike R.  │ -          │ Not clocked │ ⚪ -                  ││
│  │          │            │ in          │                       ││
│  │ Lisa K.  │ BigCo      │ Health      │ 🟢 2h 10m             ││
│  │          │            │ Checks      │                       ││
│  └──────────┴────────────┴─────────────┴───────────────────────┘│
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ WEEKLY SUMMARY                                              ││
│  ├──────────┬────────┬──────────┬──────────┬──────────────────┤│
│  │ Staff    │ Hours  │ Billable │ Tasks    │ Status            ││
│  ├──────────┼────────┼──────────┼──────────┼──────────────────┤│
│  │ John D.  │ 32.5h  │ 28.0h    │ 8        │ On Track          ││
│  │ Sarah M. │ 38.0h  │ 35.5h    │ 12       │ On Track          ││
│  │ Mike R.  │ 22.0h  │ 18.0h    │ 5        │ ⚠ Under Hours     ││
│  │ Lisa K.  │ 40.0h  │ 38.0h    │ 15       │ ✓ Complete        ││
│  └──────────┴────────┴──────────┴──────────┴──────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Project Assignment & Sign-off

```sql
-- Project assignments with sign-off
CREATE TABLE project_assignments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    project_id INT NOT NULL REFERENCES projects(id),
    user_id INT NOT NULL REFERENCES users(id),
    role ENUM('lead', 'member', 'reviewer') DEFAULT 'member',
    assigned_by INT REFERENCES users(id),
    assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_assignment (project_id, user_id)
);

-- Task sign-offs (internal approval)
CREATE TABLE task_signoffs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    task_id INT NOT NULL REFERENCES tasks(id),
    signoff_type ENUM('completion', 'review', 'qa') NOT NULL,
    signed_by INT NOT NULL REFERENCES users(id),
    signed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    UNIQUE KEY unique_signoff (task_id, signoff_type)
);

-- Project milestones with sign-off
CREATE TABLE project_milestones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    project_id INT NOT NULL REFERENCES projects(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    due_date DATE,
    status ENUM('pending', 'in_progress', 'completed', 'signed_off'),
    completed_at DATETIME,
    signed_off_by INT REFERENCES users(id),
    signed_off_at DATETIME,
    sort_order INT DEFAULT 0
);
```

---

## 6. REPORTING & EXPORTS

### Report Types

| Report | Frequency | Export Format | Contents |
|--------|-----------|---------------|----------|
| **Client Monthly Report** | Monthly | PDF, Excel | Health checks, incidents, tasks completed, hours |
| **Staff Timesheet** | Weekly | PDF, Excel | Time entries, billable hours, client breakdown |
| **Health Check Summary** | Monthly | PDF | All servers, status summary, issues found |
| **Project Status** | On-demand | PDF | Progress, milestones, time spent, assignments |
| **Incident Report** | On-demand | PDF | Incident details, timeline, resolution |

### Export Endpoints

```
GET /api/reports/client/{id}/monthly?year=2026&month=1      → PDF
GET /api/reports/timesheet/{user_id}/weekly?week_start=...  → Excel
GET /api/reports/health-checks?client_id=1&month=1&year=2026 → PDF
GET /api/reports/project/{id}/status                        → PDF
```

---

## 7. UPDATED API ENDPOINTS

### Client Management
```
GET    /api/clients                    - List all clients
GET    /api/clients/{id}               - Client details with stats
POST   /api/clients                    - Create client
PUT    /api/clients/{id}               - Update client
DELETE /api/clients/{id}               - Deactivate client
GET    /api/clients/{id}/sites         - List client sites
GET    /api/clients/{id}/servers       - List all client servers
GET    /api/clients/{id}/health-status - Health check summary
```

### Sites
```
GET    /api/sites                      - List all sites
GET    /api/sites/{id}                 - Site details
POST   /api/sites                      - Create site
PUT    /api/sites/{id}                 - Update site
DELETE /api/sites/{id}                 - Delete site
```

### Tactical RMM Integration
```
GET    /api/integrations/trmm/config   - Get TRMM config
PUT    /api/integrations/trmm/config   - Update TRMM config
POST   /api/integrations/trmm/sync     - Trigger full sync
GET    /api/integrations/trmm/sync/status - Get sync status
GET    /api/integrations/trmm/sync/logs - Get sync history
POST   /api/integrations/trmm/test     - Test connection
```

### Health Checks
```
GET    /api/health-checks/templates    - List check templates
POST   /api/health-checks/templates    - Create template
GET    /api/health-checks/server/{id}  - Get checks for server
POST   /api/health-checks/server/{id}/generate - Generate monthly checks
PUT    /api/health-checks/{id}         - Update check status
GET    /api/health-checks/pending      - All pending checks
GET    /api/health-checks/summary      - Dashboard summary
```

### Time Tracking
```
GET    /api/time-entries               - List time entries (with filters)
POST   /api/time-entries               - Create time entry
PUT    /api/time-entries/{id}          - Update time entry
DELETE /api/time-entries/{id}          - Delete time entry
POST   /api/time-entries/start         - Start timer
POST   /api/time-entries/stop          - Stop timer
GET    /api/timesheets                 - List timesheets
GET    /api/timesheets/{id}            - Get timesheet details
POST   /api/timesheets/{id}/submit     - Submit for approval
PUT    /api/timesheets/{id}/approve    - Approve timesheet
PUT    /api/timesheets/{id}/reject     - Reject timesheet
```

### Staff Dashboard
```
GET    /api/staff/activity             - Current staff activity
GET    /api/staff/summary              - Weekly staff summary
GET    /api/staff/{id}/workload        - User workload details
```

### Reports
```
GET    /api/reports/client/{id}/monthly - Client monthly report
GET    /api/reports/timesheet/{id}     - Timesheet export
GET    /api/reports/health-checks      - Health check report
GET    /api/reports/project/{id}       - Project status report
```

---

## 8. UPDATED FRONTEND PAGES

```
/                              → Main Dashboard
/login                         → Login
/clients                       → Client list
/clients/:id                   → Client detail (sites, servers, summary)
/clients/new                   → Add client
/sites/:id                     → Site detail
/servers                       → All servers (filterable by client)
/servers/:id                   → Server detail + health checks
/servers/:id/health-checks     → Server health check page
/tasks                         → Task list / Kanban
/tasks/:id                     → Task detail
/projects                      → Project list
/projects/:id                  → Project detail with assignments
/incidents                     → Incident list
/incidents/:id                 → Incident detail
/maintenance                   → Maintenance log
/docs                          → Documentation
/docs/:slug                    → Doc viewer
/passwords                     → Vaultwarden link

/time                          → My time entries
/time/entry                    → Log time
/timesheets                    → My timesheets
/timesheets/:id                → Timesheet detail

/staff                         → Staff dashboard (manager view)
/staff/activity                → Live activity view
/staff/timesheets              → Approve timesheets

/reports                       → Reports center
/reports/client/:id            → Generate client report
/reports/health                → Health check reports

/admin                         → Admin panel
/admin/users                   → User management
/admin/database                → phpMyAdmin link
/admin/integrations            → Tactical RMM config
/admin/health-templates        → Manage health check templates
/admin/audit                   → Audit logs

/settings                      → User settings
/settings/2fa                  → 2FA setup
```

---

## 9. IMPLEMENTATION PHASES (UPDATED)

### Phase 1: Core Foundation
- [ ] FastAPI backend with MariaDB
- [ ] User auth (JWT + bcrypt)
- [ ] Client/Site/Server CRUD
- [ ] Basic encryption utilities
- [ ] Database schema

### Phase 2: Core Operations
- [ ] Task management (list + kanban)
- [ ] Project tracking with assignments
- [ ] Incident logging
- [ ] Maintenance log
- [ ] Basic dashboard

### Phase 3: Tactical RMM Integration
- [ ] TRMM API client implementation
- [ ] Config UI for API credentials
- [ ] Manual sync trigger
- [ ] Automatic scheduled sync
- [ ] Sync logging

### Phase 4: Health Checks System
- [ ] Health check templates (pre-loaded)
- [ ] Server health check UI
- [ ] Monthly check generation
- [ ] Check completion workflow
- [ ] Health check dashboard widgets

### Phase 5: Time Tracking & Staff
- [ ] Time entry CRUD
- [ ] Timer start/stop
- [ ] Timesheet workflow
- [ ] Staff activity dashboard
- [ ] Approval workflow

### Phase 6: Reporting
- [ ] Client monthly report (PDF)
- [ ] Timesheet export (Excel)
- [ ] Health check report
- [ ] Project status report

### Phase 7: Auth & Security
- [ ] Google OAuth
- [ ] TOTP 2FA
- [ ] Session management
- [ ] Audit logging

### Phase 8: Polish & Integration
- [ ] Vaultwarden link
- [ ] phpMyAdmin access
- [ ] Dark/light theme
- [ ] Mobile responsive
- [ ] Docker Compose finalization

### Phase 9: Future - Monitoring
- [ ] Uptime Kuma integration
- [ ] Live server status
- [ ] Automated health checks

---

## 10. SUMMARY

This expanded portal now includes:

| Feature | Description |
|---------|-------------|
| **Multi-Client** | Manage multiple clients with sites and servers |
| **Tactical RMM Sync** | Import clients/sites/agents from TRMM |
| **Health Checks** | Monthly sysadmin checklists with best practices |
| **Time Tracking** | Timesheets with export and approval |
| **Staff Dashboard** | See what staff are doing in real-time |
| **Project Sign-offs** | Internal approval workflow |
| **Reports** | Monthly client reports, timesheets, health summaries |
| **Multi-User (10)** | Role-based access with encryption |
| **2FA + OAuth** | Secure authentication options |

Ready to build when you are!
