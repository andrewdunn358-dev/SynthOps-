# IT Operations Portal - Implementation Plan

## Overview
A self-hosted IT Operations Portal for small IT teams (up to 10 users) with centralized infrastructure management, task tracking, incident logging, and integrated password management via Vaultwarden.

---

## 1. ARCHITECTURE

### System Architecture
```
┌─────────────────────────────────────────────────────────────────┐
│                        Reverse Proxy (Traefik)                  │
│                    HTTPS Termination / Routing                  │
└─────────────────────────────────────────────────────────────────┘
                │                    │                    │
        ┌───────┴───────┐   ┌───────┴───────┐   ┌───────┴───────┐
        │   Frontend    │   │   Backend     │   │  Vaultwarden  │
        │   (React)     │   │   (FastAPI)   │   │  (Passwords)  │
        │   Port 3000   │   │   Port 8001   │   │   Port 8080   │
        └───────────────┘   └───────┬───────┘   └───────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │         MariaDB               │
                    │         Port 3306             │
                    └───────────────┬───────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │        phpMyAdmin             │
                    │        Port 8081              │
                    └───────────────────────────────┘
```

### Technology Stack
| Component | Technology | Purpose |
|-----------|------------|---------|
| Backend | FastAPI (Python) | REST API, business logic |
| Frontend | React + Bootstrap/Tailwind | Dashboard UI |
| Database | MariaDB | Data persistence |
| Auth | JWT + Google OAuth | Multi-method authentication |
| 2FA | TOTP (pyotp) | Two-factor authentication |
| Passwords | Vaultwarden | Credential management |
| Admin DB | phpMyAdmin | Database administration |
| Proxy | Traefik | HTTPS, routing |
| Encryption | AES-256-GCM + bcrypt | Data protection |

---

## 2. MULTI-USER SYSTEM

### User Roles
| Role | Permissions |
|------|-------------|
| **Admin** | Full access, user management, system config |
| **Engineer** | CRUD on all operational data, view audit logs |
| **Viewer** | Read-only access to dashboards and data |

### User Management Features
- User registration (admin-controlled or self-register with approval)
- Role assignment per user
- Activity audit logging per user
- Session management (active sessions, force logout)
- Password policies (min length, complexity, expiry)

### User Table Schema
```sql
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255), -- NULL if OAuth-only user
    role ENUM('admin', 'engineer', 'viewer') DEFAULT 'engineer',
    auth_provider ENUM('local', 'google', 'both') DEFAULT 'local',
    google_id VARCHAR(255),
    totp_secret_encrypted VARCHAR(255), -- Encrypted TOTP secret
    totp_enabled BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    last_login DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME ON UPDATE CURRENT_TIMESTAMP
);
```

---

## 3. ENCRYPTION STRATEGY

### A. Data-at-Rest Encryption (Database Level)
```
┌─────────────────────────────────────────────────────┐
│              MariaDB Encryption                      │
│  - innodb_encrypt_tables = ON                       │
│  - innodb_encrypt_log = ON                          │
│  - encrypt_binlog = ON                              │
│  - Encryption key stored in /etc/mysql/keys/        │
└─────────────────────────────────────────────────────┘
```

### B. End-to-End Encryption (Application Level)
For sensitive fields (notes, descriptions with secrets):

```python
# Encryption approach using AES-256-GCM
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

class FieldEncryption:
    """
    - Master key derived from environment variable
    - Per-field encryption with unique nonces
    - Encrypted fields stored as base64 in DB
    """
    
    ENCRYPTED_FIELDS = [
        'server.notes',
        'incident.resolution_notes', 
        'maintenance.notes',
        'documentation.content',
        'task.description'  # Optional
    ]
```

### C. Encryption Key Management
```
┌─────────────────────────────────────────────────────┐
│              Key Hierarchy                           │
├─────────────────────────────────────────────────────┤
│  MASTER_KEY (env var)                               │
│      │                                               │
│      ├── DB_ENCRYPTION_KEY (MariaDB)                │
│      │                                               │
│      ├── FIELD_ENCRYPTION_KEY (sensitive fields)    │
│      │                                               │
│      └── TOTP_ENCRYPTION_KEY (2FA secrets)          │
└─────────────────────────────────────────────────────┘
```

---

## 4. DATABASE SCHEMA

### Core Tables

```sql
-- SERVERS / INFRASTRUCTURE
CREATE TABLE servers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    hostname VARCHAR(255) NOT NULL,
    role VARCHAR(100),  -- domain controller, hypervisor, etc
    ip_address VARCHAR(45),
    operating_system VARCHAR(100),
    location VARCHAR(255),
    environment ENUM('production', 'test', 'development', 'staging'),
    notes_encrypted TEXT,  -- E2E encrypted
    status ENUM('online', 'offline', 'maintenance', 'decommissioned'),
    created_by INT REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_hostname (hostname),
    INDEX idx_environment (environment)
);

-- TASKS / JOBS
CREATE TABLE tasks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description_encrypted TEXT,
    server_id INT REFERENCES servers(id),
    project_id INT REFERENCES projects(id),
    priority ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium',
    status ENUM('open', 'in_progress', 'completed', 'blocked') DEFAULT 'open',
    due_date DATE,
    assigned_to INT REFERENCES users(id),
    created_by INT REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_priority (priority),
    INDEX idx_assigned (assigned_to)
);

-- PROJECTS
CREATE TABLE projects (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status ENUM('planning', 'active', 'on_hold', 'completed') DEFAULT 'planning',
    start_date DATE,
    target_date DATE,
    created_by INT REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME ON UPDATE CURRENT_TIMESTAMP
);

-- INCIDENTS
CREATE TABLE incidents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    server_id INT REFERENCES servers(id),
    severity ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium',
    status ENUM('open', 'investigating', 'resolved', 'closed') DEFAULT 'open',
    date_opened DATETIME DEFAULT CURRENT_TIMESTAMP,
    date_resolved DATETIME,
    description_encrypted TEXT,
    root_cause_encrypted TEXT,
    resolution_notes_encrypted TEXT,
    created_by INT REFERENCES users(id),
    resolved_by INT REFERENCES users(id),
    INDEX idx_status (status),
    INDEX idx_severity (severity),
    INDEX idx_server (server_id)
);

-- MAINTENANCE LOG
CREATE TABLE maintenance_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    server_id INT REFERENCES servers(id) NOT NULL,
    maintenance_type VARCHAR(100),
    scheduled_date DATETIME,
    completed_date DATETIME,
    engineer_id INT REFERENCES users(id),
    notes_encrypted TEXT,
    status ENUM('scheduled', 'in_progress', 'completed', 'cancelled'),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- DOCUMENTATION / RUNBOOKS
CREATE TABLE documentation (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE,
    category VARCHAR(100),
    content_encrypted LONGTEXT,  -- Markdown content, encrypted
    is_published BOOLEAN DEFAULT TRUE,
    created_by INT REFERENCES users(id),
    updated_by INT REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_category (category),
    INDEX idx_slug (slug)
);

-- AUDIT LOG
CREATE TABLE audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT REFERENCES users(id),
    action VARCHAR(50),  -- CREATE, UPDATE, DELETE, LOGIN, etc
    entity_type VARCHAR(50),  -- server, task, incident, etc
    entity_id INT,
    old_values JSON,
    new_values JSON,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user (user_id),
    INDEX idx_entity (entity_type, entity_id),
    INDEX idx_created (created_at)
);

-- USER SESSIONS
CREATE TABLE user_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT REFERENCES users(id),
    token_hash VARCHAR(255),
    ip_address VARCHAR(45),
    user_agent TEXT,
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user (user_id),
    INDEX idx_token (token_hash)
);
```

---

## 5. API ENDPOINTS

### Authentication
```
POST   /api/auth/register          - Register new user (admin only or with approval)
POST   /api/auth/login             - Local login (email/password)
POST   /api/auth/login/google      - Google OAuth login
POST   /api/auth/logout            - Logout (invalidate session)
POST   /api/auth/refresh           - Refresh JWT token
POST   /api/auth/2fa/setup         - Setup TOTP 2FA
POST   /api/auth/2fa/verify        - Verify TOTP code
DELETE /api/auth/2fa/disable       - Disable 2FA
GET    /api/auth/sessions          - List active sessions
DELETE /api/auth/sessions/{id}     - Revoke specific session
```

### User Management (Admin)
```
GET    /api/users                  - List all users
GET    /api/users/{id}             - Get user details
POST   /api/users                  - Create user
PUT    /api/users/{id}             - Update user
DELETE /api/users/{id}             - Deactivate user
PUT    /api/users/{id}/role        - Change user role
```

### Servers
```
GET    /api/servers                - List servers (with filters)
GET    /api/servers/{id}           - Get server details + related data
POST   /api/servers                - Create server
PUT    /api/servers/{id}           - Update server
DELETE /api/servers/{id}           - Delete server
GET    /api/servers/{id}/incidents - Get incidents for server
GET    /api/servers/{id}/tasks     - Get tasks for server
GET    /api/servers/{id}/maintenance - Get maintenance logs
```

### Tasks
```
GET    /api/tasks                  - List tasks (with filters)
GET    /api/tasks/kanban           - Get tasks grouped by status
GET    /api/tasks/{id}             - Get task details
POST   /api/tasks                  - Create task
PUT    /api/tasks/{id}             - Update task
DELETE /api/tasks/{id}             - Delete task
PUT    /api/tasks/{id}/status      - Quick status update
PUT    /api/tasks/{id}/assign      - Assign task
```

### Projects
```
GET    /api/projects               - List projects
GET    /api/projects/{id}          - Get project with tasks
POST   /api/projects               - Create project
PUT    /api/projects/{id}          - Update project
DELETE /api/projects/{id}          - Delete project
GET    /api/projects/{id}/progress - Get progress stats
```

### Incidents
```
GET    /api/incidents              - List incidents (with filters)
GET    /api/incidents/{id}         - Get incident details
POST   /api/incidents              - Create incident
PUT    /api/incidents/{id}         - Update incident
PUT    /api/incidents/{id}/resolve - Resolve incident
DELETE /api/incidents/{id}         - Delete incident
```

### Maintenance
```
GET    /api/maintenance            - List maintenance logs
GET    /api/maintenance/{id}       - Get maintenance details
POST   /api/maintenance            - Schedule maintenance
PUT    /api/maintenance/{id}       - Update maintenance
DELETE /api/maintenance/{id}       - Delete maintenance
```

### Documentation
```
GET    /api/docs                   - List documentation
GET    /api/docs/{slug}            - Get doc by slug
POST   /api/docs                   - Create documentation
PUT    /api/docs/{id}              - Update documentation
DELETE /api/docs/{id}              - Delete documentation
GET    /api/docs/categories        - List categories
```

### Dashboard
```
GET    /api/dashboard/stats        - Get overview stats
GET    /api/dashboard/activity     - Get recent activity
GET    /api/dashboard/alerts       - Get active alerts/incidents
```

### Admin
```
GET    /api/admin/audit-logs       - View audit logs
GET    /api/admin/system-health    - System health check
GET    /api/admin/phpmyadmin-url   - Get phpMyAdmin URL
```

---

## 6. FRONTEND PAGES & COMPONENTS

### Page Structure
```
/                           → Dashboard (landing)
/login                      → Login page
/register                   → Registration (if enabled)
/servers                    → Server list
/servers/:id                → Server detail page
/servers/new                → Add server
/tasks                      → Task list view
/tasks/kanban               → Kanban board view
/tasks/:id                  → Task detail
/projects                   → Project list
/projects/:id               → Project detail with tasks
/incidents                  → Incident list
/incidents/:id              → Incident detail
/maintenance                → Maintenance log
/docs                       → Documentation list
/docs/:slug                 → Documentation viewer
/docs/editor/:id            → Markdown editor
/passwords                  → Vaultwarden integration link
/admin                      → Admin panel
/admin/users                → User management
/admin/database             → phpMyAdmin link
/admin/audit                → Audit log viewer
/settings                   → User settings
/settings/2fa               → 2FA setup
/settings/sessions          → Session management
```

### UI Components
```
├── Layout
│   ├── Sidebar (collapsible)
│   ├── Header (user menu, theme toggle, notifications)
│   └── Footer
├── Dashboard
│   ├── StatCard (servers, tasks, incidents, projects)
│   ├── ActivityFeed
│   ├── AlertsBanner
│   └── QuickActions
├── Data Display
│   ├── DataTable (sortable, filterable, paginated)
│   ├── KanbanBoard
│   ├── StatusBadge
│   ├── PriorityBadge
│   └── ProgressBar
├── Forms
│   ├── ServerForm
│   ├── TaskForm
│   ├── IncidentForm
│   ├── ProjectForm
│   └── DocumentEditor (markdown)
├── Auth
│   ├── LoginForm
│   ├── RegisterForm
│   ├── TwoFactorSetup
│   └── GoogleOAuthButton
└── Admin
    ├── UserTable
    ├── AuditLogViewer
    └── SystemHealthWidget
```

---

## 7. DOCKER COMPOSE STRUCTURE

```yaml
version: '3.8'

services:
  # Reverse Proxy
  traefik:
    image: traefik:v2.10
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./traefik:/etc/traefik
      - traefik-certs:/letsencrypt
    
  # Frontend
  frontend:
    build: ./frontend
    labels:
      - "traefik.http.routers.frontend.rule=Host(`portal.yourdomain.com`)"
    depends_on:
      - backend
    environment:
      - REACT_APP_BACKEND_URL=https://portal.yourdomain.com
      - REACT_APP_VAULTWARDEN_URL=https://vault.yourdomain.com

  # Backend API
  backend:
    build: ./backend
    labels:
      - "traefik.http.routers.backend.rule=Host(`portal.yourdomain.com`) && PathPrefix(`/api`)"
    depends_on:
      - mariadb
    environment:
      - DATABASE_URL=mysql://user:pass@mariadb:3306/itportal
      - MASTER_ENCRYPTION_KEY=${MASTER_ENCRYPTION_KEY}
      - JWT_SECRET=${JWT_SECRET}
      - GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
      - GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
    volumes:
      - ./backend:/app

  # Database
  mariadb:
    image: mariadb:10.11
    environment:
      - MYSQL_ROOT_PASSWORD=${DB_ROOT_PASSWORD}
      - MYSQL_DATABASE=itportal
      - MYSQL_USER=${DB_USER}
      - MYSQL_PASSWORD=${DB_PASSWORD}
    volumes:
      - mariadb-data:/var/lib/mysql
      - ./db/encryption-keys:/etc/mysql/encryption
    command: >
      --plugin-load-add=file_key_management
      --file-key-management-filename=/etc/mysql/encryption/keyfile
      --innodb-encrypt-tables=ON
      --innodb-encrypt-log=ON
      --encrypt-binlog=ON

  # phpMyAdmin
  phpmyadmin:
    image: phpmyadmin:latest
    labels:
      - "traefik.http.routers.phpmyadmin.rule=Host(`dbadmin.yourdomain.com`)"
    environment:
      - PMA_HOST=mariadb
      - PMA_USER=${DB_USER}
      - PMA_PASSWORD=${DB_PASSWORD}
    depends_on:
      - mariadb

  # Vaultwarden (Password Manager)
  vaultwarden:
    image: vaultwarden/server:latest
    labels:
      - "traefik.http.routers.vaultwarden.rule=Host(`vault.yourdomain.com`)"
    environment:
      - ADMIN_TOKEN=${VAULTWARDEN_ADMIN_TOKEN}
      - SIGNUPS_ALLOWED=false
      - INVITATIONS_ALLOWED=true
    volumes:
      - vaultwarden-data:/data

volumes:
  mariadb-data:
  vaultwarden-data:
  traefik-certs:
```

---

## 8. SECURITY MEASURES

### Authentication Security
- Password hashing: bcrypt with cost factor 12
- JWT tokens: RS256 signed, 15-minute access, 7-day refresh
- Rate limiting: 5 login attempts per minute
- Session management: Track all active sessions
- 2FA: TOTP with encrypted secrets

### Data Security
- Database encryption at rest (MariaDB native)
- Sensitive field encryption (AES-256-GCM)
- All traffic over HTTPS (Traefik + Let's Encrypt)
- CORS restricted to portal domain
- SQL injection prevention (parameterized queries)
- XSS prevention (React + CSP headers)

### Access Control
- Role-based access control (RBAC)
- Audit logging for all mutations
- IP-based session validation
- Force logout capability

---

## 9. IMPLEMENTATION PHASES

### Phase 1: Core Infrastructure (Foundation)
- [ ] FastAPI backend setup with MariaDB
- [ ] User authentication (JWT + bcrypt)
- [ ] Basic CRUD for servers
- [ ] Database schema implementation
- [ ] Encryption utilities

### Phase 2: Core Features
- [ ] Task management (list + kanban)
- [ ] Project tracking
- [ ] Incident logging
- [ ] Maintenance log
- [ ] Dashboard with stats

### Phase 3: Authentication Enhancements
- [ ] Google OAuth integration
- [ ] TOTP 2FA setup
- [ ] Session management
- [ ] User management (admin)

### Phase 4: Advanced Features
- [ ] Documentation system (markdown)
- [ ] Audit logging
- [ ] Activity feed
- [ ] Search across entities
- [ ] Bulk operations

### Phase 5: Integration & Polish
- [ ] Vaultwarden integration link
- [ ] phpMyAdmin admin access
- [ ] Dark/light theme toggle
- [ ] Mobile responsive design
- [ ] Docker Compose finalization

---

## 10. FILE STRUCTURE

```
/app/
├── backend/
│   ├── server.py              # Main FastAPI app
│   ├── requirements.txt
│   ├── .env
│   ├── models/
│   │   ├── __init__.py
│   │   ├── user.py
│   │   ├── server.py
│   │   ├── task.py
│   │   ├── project.py
│   │   ├── incident.py
│   │   ├── maintenance.py
│   │   └── documentation.py
│   ├── routes/
│   │   ├── __init__.py
│   │   ├── auth.py
│   │   ├── users.py
│   │   ├── servers.py
│   │   ├── tasks.py
│   │   ├── projects.py
│   │   ├── incidents.py
│   │   ├── maintenance.py
│   │   ├── documentation.py
│   │   └── dashboard.py
│   ├── utils/
│   │   ├── encryption.py
│   │   ├── auth.py
│   │   └── database.py
│   └── middleware/
│       ├── auth.py
│       └── audit.py
├── frontend/
│   ├── src/
│   │   ├── App.js
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Login.jsx
│   │   │   ├── Servers.jsx
│   │   │   ├── Tasks.jsx
│   │   │   ├── Projects.jsx
│   │   │   ├── Incidents.jsx
│   │   │   ├── Maintenance.jsx
│   │   │   ├── Documentation.jsx
│   │   │   ├── Admin.jsx
│   │   │   └── Settings.jsx
│   │   ├── components/
│   │   │   ├── Layout/
│   │   │   ├── Dashboard/
│   │   │   ├── Forms/
│   │   │   └── Common/
│   │   └── utils/
│   │       ├── api.js
│   │       └── auth.js
│   └── package.json
├── docker/
│   ├── docker-compose.yml
│   ├── docker-compose.dev.yml
│   └── traefik/
│       └── traefik.yml
└── docs/
    └── setup.md
```

---

## 11. ENVIRONMENT VARIABLES

```env
# Backend (.env)
DATABASE_URL=mysql://itportal_user:password@mariadb:3306/itportal
MASTER_ENCRYPTION_KEY=<32-byte-base64-key>
JWT_SECRET=<random-256-bit-key>
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7

# Google OAuth
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>

# Frontend (.env)
REACT_APP_BACKEND_URL=https://portal.yourdomain.com
REACT_APP_VAULTWARDEN_URL=https://vault.yourdomain.com
REACT_APP_PHPMYADMIN_URL=https://dbadmin.yourdomain.com

# Docker (.env)
DB_ROOT_PASSWORD=<secure-root-password>
DB_USER=itportal_user
DB_PASSWORD=<secure-password>
VAULTWARDEN_ADMIN_TOKEN=<admin-token>
```

---

## 12. DEFAULT ADMIN ACCOUNT

On first deployment, create default admin:
```
Email: admin@localhost
Username: admin
Password: ChangeMe123! (force change on first login)
Role: admin
```

---

## Summary

This plan provides a **complete, secure, multi-user IT Operations Portal** with:

- **10 user support** with role-based access
- **Dual encryption**: database-level + field-level for sensitive data
- **Flexible auth**: JWT + Google OAuth + TOTP 2FA
- **Full operational tracking**: servers, tasks, projects, incidents, maintenance
- **Integrated tools**: Vaultwarden, phpMyAdmin
- **Dark/Light theme** toggle
- **Docker-ready** deployment

Ready to proceed with implementation when you give the go-ahead!
