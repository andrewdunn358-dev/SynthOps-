# SynthOps User Manual
## IT Operations Portal for Synthesis IT Ltd

**Version 1.0** | Last Updated: March 12, 2026

---

## Table of Contents
1. [Getting Started](#getting-started)
2. [Dashboard](#dashboard)
3. [Client Management](#client-management)
4. [Server & Infrastructure](#server--infrastructure)
5. [Task Management](#task-management)
6. [Project Tracking](#project-tracking)
7. [Incident Management](#incident-management)
8. [Maintenance Scheduling](#maintenance-scheduling)
9. [Documentation & Runbooks](#documentation--runbooks)
10. [Time Tracking](#time-tracking)
11. [Staff Dashboard](#staff-dashboard)
12. [Sophie AI Assistant](#sophie-ai-assistant)
13. [Tactical RMM Integration](#tactical-rmm-integration)
14. [Admin Settings](#admin-settings)
15. [Troubleshooting](#troubleshooting)

---

## Getting Started

### Accessing SynthOps
1. Navigate to your SynthOps portal URL
2. Enter your credentials (email and password)
3. Click **Sign In**

### First-Time Setup
If you're a new user, contact your administrator to:
- Create your account
- Assign your role (Admin, Engineer, or Viewer)
- Configure TRMM integration

### User Roles
| Role | Permissions |
|------|-------------|
| **Admin** | Full access - user management, settings, all features |
| **Engineer** | Create/edit clients, servers, tasks, projects, incidents |
| **Viewer** | Read-only access to all dashboards and data |

---

## Dashboard

The Dashboard is your command center, showing:

### Overview Cards
- **Clients**: Total active client count
- **Servers**: Total servers with online count
- **Open Tasks**: Tasks requiring attention
- **Active Projects**: Currently running projects
- **Open Incidents**: Unresolved incidents
- **Pending Checks**: Health checks awaiting completion

### Server Status
- Real-time view of online vs offline servers
- Alert banner for active incidents requiring attention

### Quick Actions
- **New Task**: Quickly create a task
- **Log Incident**: Report a new incident
- **Schedule Maintenance**: Plan maintenance work
- **Add Client**: Register a new client

### Recent Activity
Timeline of recent actions across the portal:
- New incidents logged
- Tasks created/completed
- Maintenance scheduled
- Client updates

---

## Client Management

### Viewing Clients
1. Click **Clients** in the sidebar
2. Browse the grid of client cards
3. Use the search bar to filter by name or code

### Client Card Information
Each card displays:
- Client name and code
- Number of sites
- Number of servers
- Contract type (Monthly/Ad-hoc)
- Quick action menu (three dots)

### Adding a New Client
1. Click **Add Client** button
2. Fill in required fields:
   - **Client Name** (required)
   - **Code** (required) - Short unique identifier
   - **Contact Name** - Primary contact
   - **Email** - Contact email
   - **Phone** - Contact phone
   - **Address** - Business address
   - **Contract Type** - Monthly or Ad-hoc
   - **Monthly Hours** - Contracted hours (if monthly)
   - **Notes** - Internal notes
3. Click **Create**

### Syncing from Tactical RMM
1. Click **Sync from TRMM** button
2. Wait for synchronization to complete
3. New clients, sites, and agents will be imported automatically

### Editing a Client
1. Click the three-dot menu on a client card
2. Select **Edit**
3. Modify fields as needed
4. Click **Update**

### Deleting a Client
1. Click the three-dot menu on a client card
2. Select **Delete**
3. Confirm the deletion

> **Warning**: Deleting a client will NOT remove associated servers, tasks, or incidents. Reassign these first if needed.

---

## Server & Infrastructure

### Servers List
Navigate to **Servers** to view all managed servers.

### Filtering Servers
- **Search**: Filter by hostname or IP address
- **Status Filter**: Show Online, Offline, or Maintenance
- **Client Filter**: Filter by specific client

### Server Information
Each row displays:
- **Status**: Color-coded indicator (green=online, red=offline, yellow=maintenance)
- **Hostname**: Server name
- **Client**: Associated client
- **Role**: Server function (Domain Controller, File Server, etc.)
- **IP Address**: Network address
- **OS**: Operating system
- **Environment**: Production, Staging, Development, or Test

### Adding a Server Manually
1. Click **Add Server**
2. Select the client and site
3. Fill in server details:
   - Hostname (required)
   - Role
   - Server Type (Physical, Virtual, Cloud)
   - IP Address
   - Operating System
   - CPU Cores
   - RAM (GB)
   - Storage (GB)
   - Environment
   - Criticality
   - Status
   - Notes
4. Click **Create**

### Server Detail View
Click any server row to view:
- Full specifications
- Maintenance history
- Health check results
- Recent alerts
- Notes and documentation

---

## Task Management

### Views
Switch between views using the tabs:
- **List View**: Traditional task list
- **Kanban View**: Drag-and-drop board

### Kanban Columns
- **Open**: New tasks awaiting work
- **In Progress**: Currently being worked on
- **Blocked**: Tasks with dependencies or issues
- **Completed**: Finished tasks

### Creating a Task
1. Click **Add Task**
2. Fill in details:
   - **Title** (required)
   - **Description**
   - **Client** - Associate with a client
   - **Project** - Associate with a project
   - **Priority** - Low, Medium, High, Critical
   - **Status** - Initial status
   - **Due Date** - Target completion date
   - **Assigned To** - Team member
3. Click **Create**

### Managing Tasks
- **Change Status**: Use the dropdown in list view or drag in Kanban
- **Edit**: Click the three-dot menu > Edit
- **Delete**: Click the three-dot menu > Delete

### Priority Colors
| Priority | Color |
|----------|-------|
| Low | Gray |
| Medium | Yellow |
| High | Orange |
| Critical | Red |

---

## Project Tracking

### Project Overview
Projects group related tasks and track overall progress.

### Creating a Project
1. Click **Add Project**
2. Enter details:
   - **Project Name** (required)
   - **Description**
   - **Client** - Associate with a client
   - **Status** - Planning, Active, On Hold, Completed
   - **Start Date**
   - **Target Date**
3. Click **Create**

### Project Card Information
- Project name and client
- Description summary
- Progress bar showing task completion
- Status badge
- Target date

### Project Status Flow
```
Planning → Active → On Hold (optional) → Completed
```

---

## Incident Management

### Logging an Incident
1. Navigate to **Incidents**
2. Click **Log Incident**
3. Fill in details:
   - **Title** (required)
   - **Description** - What happened
   - **Client** - Affected client
   - **Server** - Affected server (if applicable)
   - **Priority** - Low, Medium, High, Critical
   - **Status** - New, In Progress, Resolved
4. Click **Create**

### Incident Workflow
1. **New**: Incident logged, awaiting triage
2. **In Progress**: Being investigated/resolved
3. **Resolved**: Issue fixed, awaiting closure

### Resolution
When resolving an incident:
1. Click **Resolve**
2. Add resolution notes
3. Document root cause if known
4. Click **Save**

---

## Maintenance Scheduling

### Scheduling Maintenance
1. Navigate to **Maintenance**
2. Click **Schedule Maintenance**
3. Select:
   - **Server** - Target server
   - **Maintenance Type** - Category of work
   - **Scheduled Date** - When to perform
   - **Notes** - Additional instructions
4. Click **Schedule**

### Maintenance Types
- Firmware Update
- OS Patching
- Security Update
- Backup Verification
- Hardware Check
- Performance Tuning
- Certificate Renewal
- Database Maintenance
- Log Cleanup
- General Maintenance

### Completing Maintenance
1. Find the maintenance record
2. Click **Complete**
3. Add completion notes if needed
4. Status updates to "Completed"

---

## Documentation & Runbooks

### Creating Documentation
1. Navigate to **Documentation**
2. Click **New Document**
3. Enter:
   - **Title** (required)
   - **Category** - Runbook, Guide, Policy, Template, Other
   - **Client** - Associate with client (optional)
   - **Tags** - Comma-separated keywords
   - **Content** - Markdown-supported content
4. Click **Save**

### Markdown Support
Documents support full Markdown syntax:
- **Headers**: `# H1`, `## H2`, `### H3`
- **Bold**: `**text**`
- **Italic**: `*text*`
- **Code**: `` `code` `` or code blocks
- **Lists**: `- item` or `1. item`
- **Links**: `[text](url)`

### Searching Documentation
- Use the search bar to find by title or content
- Filter by category
- Filter by client

---

## Time Tracking

### Logging Time
1. Navigate to **Time Tracking**
2. Click **Add Entry**
3. Fill in:
   - **Client** - Who the work was for
   - **Task** - Associated task (optional)
   - **Project** - Associated project (optional)
   - **Date** - When the work was done
   - **Duration** - Time in minutes
   - **Description** - What was done
   - **Billable** - Toggle if billable
4. Click **Add**

### Viewing Time Entries
- Filter by date range
- Filter by client
- View totals per client/project

### Weekly Summary
The summary card shows:
- Total hours this week
- Billable vs non-billable split
- Hours by client

### Exporting Timesheets
1. Set your date range filter
2. Click **Export**
3. Choose format (CSV)
4. Download file

---

## Staff Dashboard

### Overview
The Staff dashboard shows real-time team activity:
- Who is working on what
- Current task status
- Recent completions

### Staff Cards
Each team member card shows:
- Name and role
- Current task (if any)
- Status (Available, Busy, Away)
- Recent activity

---

## Sophie AI Assistant

### What is Sophie?
Sophie is your AI-powered IT assistant. She can:
- Answer IT troubleshooting questions
- Suggest solutions for common issues
- Help draft documentation
- Provide best practice recommendations

### Using Sophie
1. Click **Ask Sophie** in the sidebar
2. Type your question in the chat
3. Press Enter or click Send
4. Sophie will respond with helpful information

### Example Questions
- "How do I reset a user's password in Active Directory?"
- "What are the best practices for backup retention?"
- "How do I troubleshoot a slow server?"
- "What ports do I need to open for RDP?"

### Tips for Better Responses
- Be specific with your questions
- Include relevant context (OS, environment)
- Ask follow-up questions if needed

---

## Tactical RMM Integration

### Overview
SynthOps integrates with Tactical RMM to automatically sync:
- Clients
- Sites
- Agents (servers/workstations)

### Running a Sync
1. Go to **Clients** page
2. Click **Sync from TRMM**
3. Wait for completion
4. Check the sync results

### What Gets Synced
| TRMM | SynthOps |
|------|----------|
| Clients | Clients |
| Sites | Sites |
| Agents | Servers |
| Agent Status | Server Status |
| Hardware Info | Server Specs |

### Manual Sync vs Automatic
- **Manual Sync**: Click the sync button when needed
- **Automatic Sync**: Can be scheduled (contact admin)

### Troubleshooting Sync Issues
If sync fails:
1. Check TRMM API connectivity (Admin > Settings)
2. Verify API key is correct
3. Check server logs for errors

---

## Admin Settings

### User Management (Admin Only)
1. Navigate to **Admin**
2. View all users
3. Actions:
   - **Add User**: Create new account
   - **Edit Role**: Change user permissions
   - **Disable User**: Temporarily revoke access
   - **Reset Password**: Force password reset

### TRMM Configuration
1. Navigate to **Settings**
2. Enter TRMM details:
   - **API URL**: Your TRMM server URL
   - **API Key**: Your TRMM API key
3. Click **Test Connection**
4. Click **Save** if successful

### Theme Settings
Toggle between:
- **Dark Mode**: Dark background, light text
- **Light Mode**: Light background, dark text

---

## Troubleshooting

### Common Issues

#### Can't Log In
- Verify email and password are correct
- Check if account is active (contact admin)
- Clear browser cache and cookies

#### Sync Not Working
- Verify TRMM credentials in Settings
- Check TRMM API is accessible
- Try manual sync from Clients page

#### Missing Servers
- Run a new sync from TRMM
- Check if agent is online in TRMM
- Verify client/site mapping

#### Slow Performance
- Clear browser cache
- Try a different browser
- Check network connectivity

#### Error Messages
If you see validation errors:
- Check all required fields are filled
- Ensure numeric fields contain numbers
- Verify dates are in correct format

### Getting Help
For issues not covered here:
1. Ask Sophie for quick answers
2. Check the Documentation section
3. Contact your system administrator

---

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Search | `Ctrl + K` or `/` |
| Quick Task | `Ctrl + T` |
| Quick Incident | `Ctrl + I` |
| Open Sophie | `Ctrl + .` |
| Save/Submit | `Ctrl + Enter` |

---

## Glossary

| Term | Definition |
|------|------------|
| **Agent** | TRMM agent installed on a managed device |
| **Client** | A customer/organization you manage |
| **Site** | A physical location belonging to a client |
| **Server** | Any managed device (server or workstation) |
| **TRMM** | Tactical RMM - Remote Monitoring & Management tool |
| **Health Check** | Periodic verification of server best practices |
| **Runbook** | Step-by-step guide for common procedures |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | March 2026 | Initial release |

---

**SynthOps** - Developed for Synthesis IT Ltd

For support, contact your system administrator.
