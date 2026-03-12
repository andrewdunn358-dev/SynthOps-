# SynthOps - IT Operations Portal

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License">
  <img src="https://img.shields.io/badge/docker-ready-brightgreen.svg" alt="Docker Ready">
</p>

A comprehensive, self-hosted IT Operations Portal designed for MSPs and IT teams. Centralize your infrastructure management, ticketing, projects, and documentation in one place.

## Features

### 🖥️ Infrastructure Management
- **Server & Workstation Tracking** - Separate views for servers and workstations
- **NOC-Style Live View** - Real-time server details with hardware, software, and status
- **Tactical RMM Integration** - Auto-sync clients, sites, and agents
- **Health Monitoring** - Track online/offline status with alerts

### 🎫 Ticketing Integration
- **Zammad Integration** - View and respond to tickets directly
- **Ticket → Task Sync** - Automatically create tasks from tickets
- **Multi-organization Support** - Link tickets to clients

### 📊 Reports & Analytics
- **Device Inventory** - OS breakdown, device types, client distribution
- **Fleet Health** - Online/offline status overview
- **CSV Exports** - Export clients, servers, incidents, timesheets

### 📋 Project & Task Management
- **Kanban Board** - Visual task management
- **Project Tracking** - Track deliverables and progress
- **Time Tracking** - Log hours against clients and projects

### 🔧 Maintenance & Health Checks
- **Monthly Health Checks** - 36+ server health check templates
- **DC Health Checks** - Comprehensive Active Directory checklist
- **Maintenance Scheduling** - Plan and track maintenance windows

### 🤖 AI Assistant
- **Sophie** - AI-powered IT assistant for troubleshooting advice

## Quick Start

### One-Line Installation

```bash
curl -fsSL https://raw.githubusercontent.com/your-org/synthops/main/install.sh | bash
```

### Manual Installation

1. Clone the repository:
```bash
git clone https://github.com/your-org/synthops.git
cd synthops
```

2. Copy environment file and configure:
```bash
cp .env.example .env
nano .env  # Add your TRMM and Zammad credentials
```

3. Start services:
```bash
docker compose up -d
```

4. Access the portal at `http://localhost`

## Configuration

### Required Settings

| Variable | Description |
|----------|-------------|
| `JWT_SECRET` | Secret key for JWT tokens (auto-generated) |
| `ENCRYPTION_KEY` | 32-character encryption key (auto-generated) |

### Tactical RMM Integration

| Variable | Description |
|----------|-------------|
| `TACTICAL_RMM_API_URL` | Your TRMM API URL (e.g., `https://api.yourcompany.com/`) |
| `TACTICAL_RMM_API_KEY` | Your TRMM API key |

### Zammad Integration (Optional)

| Variable | Description |
|----------|-------------|
| `ZAMMAD_API_URL` | Your Zammad URL (e.g., `https://tickets.yourcompany.com`) |
| `ZAMMAD_API_TOKEN` | Your Zammad API token |

### Auto-Sync Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `SYNC_INTERVAL_MINUTES` | 15 | How often to sync TRMM and Zammad |

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│   Backend   │────▶│   MongoDB   │
│   (React)   │     │  (FastAPI)  │     │             │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │
       │                   ├──────▶ Tactical RMM API
       │                   │
       │                   └──────▶ Zammad API
       │
       └──────▶ nginx (reverse proxy)
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| Frontend | 80/443 | React web application |
| Backend | 8001 | FastAPI REST API |
| MongoDB | 27017 | Database |
| Mongo Express | 8081 | Database admin UI (optional) |
| Vaultwarden | 8082 | Password manager (optional) |

## Commands

```bash
# View logs
docker compose logs -f

# View specific service logs
docker compose logs -f backend

# Restart services
docker compose restart

# Stop services
docker compose down

# Update to latest version
git pull && docker compose up -d --build

# Enable optional services
docker compose --profile admin --profile extras up -d
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `POST /api/auth/refresh` - Refresh token

### Clients
- `GET /api/clients` - List clients
- `POST /api/clients` - Create client
- `GET /api/clients/{id}` - Get client details

### Servers
- `GET /api/servers` - List servers
- `GET /api/servers/{id}` - Get server details

### Integrations
- `POST /api/integrations/trmm/sync` - Sync from TRMM
- `GET /api/zammad/tickets` - Get Zammad tickets
- `POST /api/zammad/sync-to-tasks` - Sync tickets to tasks

### Exports
- `GET /api/export/timesheet` - Export timesheet CSV
- `GET /api/export/clients` - Export clients CSV
- `GET /api/export/servers` - Export servers CSV

## Health Check Templates

SynthOps includes 36+ health check templates including:

### Active Directory
- AD Replication (repadmin /replsummary, /showrepl)
- DC Diagnostics (dcdiag /v)
- FSMO Roles verification
- SYSVOL/NETLOGON checks
- DNS Health
- Time Synchronization
- Account management (stale, disabled, locked)
- Group Policy health
- Backup verification

### General Server
- Disk space monitoring
- RAID health
- Certificate expiry
- Windows updates
- Antivirus status
- Performance trends

## Security

- JWT-based authentication
- Password hashing with bcrypt
- HTTPS support (configure SSL certificates)
- Role-based access control (Admin, Engineer, Viewer)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - See [LICENSE](LICENSE) for details.

## Support

For support, please open an issue on GitHub or contact your system administrator.

---

Built with ❤️ for MSPs by Synthesis IT Ltd
