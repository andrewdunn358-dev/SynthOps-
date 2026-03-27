# CHANGELOG

## February 2026

### NOC Display Fixes
- Fixed NOC Display to show all 42 clients including TRMM-imported ones (PHL, ACMS, Aston Beaumont etc.)
- Added Bitdefender agent count to NOC security panel (398 agents, 44 companies, per-company endpoint breakdown)
- NOC device grid shows servers only (58), workstations excluded per user preference
- Added new Clients grid section on NOC with server/workstation counts per client
- Removed Zammad ticket fetch and ticket panel from NOC

### Zammad Integration Complete Removal
- Removed all Zammad endpoints from server.py (~400 lines): /zammad/test, /zammad/tickets, /zammad/stats, /zammad/organizations, /zammad/tickets/{id}/reply, /zammad/ticket-to-task, /zammad/sync-to-tasks
- Removed scheduled_zammad_sync() background function
- Removed Zammad scheduler job from start_scheduler()
- Cleaned /sync/status and /sync/trigger endpoints of Zammad references
- Removed Zammad API call from Reports.jsx

## December 2025

### Customer CRM Feature
- Full CRM page at /customers with stats, search, filtering
- Customer management with tabbed dialog (Basic Info, Contract, Other)
- Customer notes with activity tracking

### Stock & Asset Management
- Full asset page at /stock with stats and warranty alerts
- Asset types: Server, Laptop, Desktop, Network, Storage, Other
- Full purchase/warranty tracking

### Monthly Health Check Enhancements
- Server list sorting alphabetically by client
- Save progress/draft functionality
- Continue button for resuming drafts
- UPS/AD check sections added
- Delete functionality added
- Duplicate draft saving bug fixed (POST → PUT)

### Sophie AI Migration
- Migrated from Emergent LLM to Gemini 2.5 Flash (user's GOOGLE_API_KEY)

### Project Work Logs
- Work logs UI enhanced to show full notes in clickable Dialog

### Other Fixes
- SelectItem empty value React crashes fixed
- /api/time-entries 500 error fixed
- New favicon generated
- Bitdefender API recursive endpoint counting
