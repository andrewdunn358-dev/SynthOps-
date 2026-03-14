import React, { useState } from 'react';
import { useAuth } from '../App';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { ScrollArea } from '../components/ui/scroll-area';
import {
  Book, LayoutDashboard, Server, Users, Ticket, FolderKanban,
  AlertTriangle, FileText, Clock, BarChart3, Shield, Settings,
  Monitor, Network, CheckCircle, ArrowLeft, Search, HelpCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function UserManual() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const isAdmin = user?.role === 'admin';

  const Section = ({ title, icon: Icon, children, id }) => (
    <div id={id} className="mb-8">
      <h2 className="text-xl font-bold flex items-center gap-2 mb-4 text-primary">
        {Icon && <Icon className="h-5 w-5" />}
        {title}
      </h2>
      <div className="space-y-4 text-muted-foreground">
        {children}
      </div>
    </div>
  );

  const SubSection = ({ title, children }) => (
    <div className="mb-4">
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <div className="pl-4 border-l-2 border-muted">
        {children}
      </div>
    </div>
  );

  const Tip = ({ children }) => (
    <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 my-3">
      <p className="text-sm text-blue-400 flex items-start gap-2">
        <HelpCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <span>{children}</span>
      </p>
    </div>
  );

  const Warning = ({ children }) => (
    <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 my-3">
      <p className="text-sm text-amber-400 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <span>{children}</span>
      </p>
    </div>
  );

  return (
    <div className="space-y-6" data-testid="user-manual">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/settings')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Settings
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2" style={{ fontFamily: 'Barlow Condensed' }}>
              <Book className="h-8 w-8" />
              USER MANUAL
            </h1>
            <p className="text-muted-foreground">
              SynthOps Documentation for {isAdmin ? 'Administrators' : 'Engineers'}
            </p>
          </div>
        </div>
        <Badge variant="outline" className="text-sm">
          Version 1.0
        </Badge>
      </div>

      <Tabs defaultValue="getting-started" className="space-y-4">
        <TabsList className="grid grid-cols-2 md:grid-cols-5 w-full">
          <TabsTrigger value="getting-started">Getting Started</TabsTrigger>
          <TabsTrigger value="daily-operations">Daily Operations</TabsTrigger>
          <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          {isAdmin && <TabsTrigger value="admin">Administration</TabsTrigger>}
        </TabsList>

        {/* GETTING STARTED */}
        <TabsContent value="getting-started">
          <Card>
            <CardContent className="p-6">
              <ScrollArea className="h-[600px] pr-4">
                <Section title="Welcome to SynthOps" icon={LayoutDashboard} id="welcome">
                  <p>
                    SynthOps is your central IT Operations Portal designed to streamline MSP operations.
                    This manual will help you navigate and use all features effectively.
                  </p>
                  
                  <SubSection title="Dashboard Overview">
                    <p>The Dashboard is your home screen showing:</p>
                    <ul className="list-disc list-inside space-y-1 mt-2">
                      <li><strong>Server Status</strong> - Quick view of online/offline servers</li>
                      <li><strong>Open Tickets</strong> - Zammad ticket count</li>
                      <li><strong>Active Incidents</strong> - Current issues requiring attention</li>
                      <li><strong>Trend Charts</strong> - 14-day incident and task trends</li>
                      <li><strong>Quick Actions</strong> - Create tasks, log incidents</li>
                    </ul>
                    <Tip>Click any stat card to navigate directly to that section.</Tip>
                  </SubSection>

                  <SubSection title="Navigation">
                    <p>The sidebar provides access to all modules:</p>
                    <ul className="list-disc list-inside space-y-1 mt-2">
                      <li><strong>Clients</strong> - View and manage client companies</li>
                      <li><strong>Servers</strong> - All monitored servers from TRMM</li>
                      <li><strong>Tasks</strong> - Work items and to-do list</li>
                      <li><strong>Projects</strong> - Project management with jobs</li>
                      <li><strong>Incidents</strong> - Log and track incidents</li>
                      <li><strong>Tickets</strong> - Zammad helpdesk tickets</li>
                      <li><strong>Monthly Health Check</strong> - Server health reviews</li>
                      <li><strong>Documentation</strong> - Runbooks and guides</li>
                      <li><strong>Reports</strong> - Analytics and exports</li>
                    </ul>
                  </SubSection>
                </Section>

                <Section title="Server Management" icon={Server} id="servers">
                  <SubSection title="Viewing Servers">
                    <p>
                      Servers are synced automatically from Tactical RMM. Each server shows:
                    </p>
                    <ul className="list-disc list-inside space-y-1 mt-2">
                      <li><strong>Status</strong> - Online (green), Offline (red), or Maintenance (yellow)</li>
                      <li><strong>Client</strong> - Which client owns this server</li>
                      <li><strong>Last Seen</strong> - When the agent last checked in</li>
                      <li><strong>Operating System</strong> - Windows Server, Linux, etc.</li>
                    </ul>
                  </SubSection>

                  <SubSection title="Server Actions">
                    <p>Click on any server to access:</p>
                    <ul className="list-disc list-inside space-y-1 mt-2">
                      <li><strong>View Details</strong> - Full server information</li>
                      <li><strong>Connect</strong> - Opens TRMM Take Control (remote access)</li>
                      <li><strong>Set Maintenance</strong> - Mark server for planned downtime</li>
                    </ul>
                    <Tip>Use the search bar to quickly find servers by hostname or client name.</Tip>
                  </SubSection>
                </Section>

                <Section title="Client Management" icon={Users} id="clients">
                  <p>
                    Clients represent your customer companies. Each client has:
                  </p>
                  <ul className="list-disc list-inside space-y-1 mt-2">
                    <li>Associated servers and workstations</li>
                    <li>Site locations</li>
                    <li>Open incidents and tasks</li>
                    <li>Health score based on server uptime</li>
                  </ul>
                  <SubSection title="Client Detail Page">
                    <p>Click a client name to see their full details including:</p>
                    <ul className="list-disc list-inside space-y-1 mt-2">
                      <li>All servers with status</li>
                      <li>Workstation count</li>
                      <li>Recent incidents</li>
                      <li>Site breakdown</li>
                    </ul>
                  </SubSection>
                </Section>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* DAILY OPERATIONS */}
        <TabsContent value="daily-operations">
          <Card>
            <CardContent className="p-6">
              <ScrollArea className="h-[600px] pr-4">
                <Section title="Tasks" icon={CheckCircle} id="tasks">
                  <p>Tasks help you track work items. Create tasks for:</p>
                  <ul className="list-disc list-inside space-y-1 mt-2">
                    <li>Maintenance activities</li>
                    <li>Client requests</li>
                    <li>Follow-up actions from incidents</li>
                    <li>Project work items</li>
                  </ul>

                  <SubSection title="Creating a Task">
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Click "New Task" or use Quick Actions on Dashboard</li>
                      <li>Enter task title and description</li>
                      <li>Select client (optional)</li>
                      <li>Set priority (Low, Medium, High, Critical)</li>
                      <li>Assign to an engineer</li>
                      <li>Set due date if needed</li>
                    </ol>
                  </SubSection>

                  <SubSection title="Task Statuses">
                    <ul className="list-disc list-inside space-y-1">
                      <li><Badge className="bg-blue-500/20 text-blue-400">Open</Badge> - New task, not started</li>
                      <li><Badge className="bg-yellow-500/20 text-yellow-400">In Progress</Badge> - Currently being worked on</li>
                      <li><Badge className="bg-emerald-500/20 text-emerald-400">Completed</Badge> - Finished</li>
                      <li><Badge className="bg-red-500/20 text-red-400">Blocked</Badge> - Cannot proceed</li>
                    </ul>
                  </SubSection>
                </Section>

                <Section title="Incidents" icon={AlertTriangle} id="incidents">
                  <p>
                    Incidents are unplanned events that disrupt or could disrupt services.
                    Log incidents to track issues and resolution.
                  </p>

                  <SubSection title="Logging an Incident">
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Go to Incidents or use Dashboard Quick Action</li>
                      <li>Click "Log Incident"</li>
                      <li>Enter title describing the issue</li>
                      <li>Select client affected</li>
                      <li>Choose severity level</li>
                      <li>Add detailed description</li>
                    </ol>
                    <Warning>Always log incidents for server outages, security events, or service disruptions.</Warning>
                  </SubSection>

                  <SubSection title="Severity Levels">
                    <ul className="list-disc list-inside space-y-1">
                      <li><Badge className="bg-red-600">Critical</Badge> - Total service outage, immediate action required</li>
                      <li><Badge className="bg-red-500/80">High</Badge> - Major impact, needs urgent attention</li>
                      <li><Badge className="bg-amber-500">Medium</Badge> - Moderate impact, standard response</li>
                      <li><Badge className="bg-emerald-500">Low</Badge> - Minor issue, can be scheduled</li>
                    </ul>
                  </SubSection>
                </Section>

                <Section title="Tickets (Zammad)" icon={Ticket} id="tickets">
                  <p>
                    Tickets from Zammad helpdesk are synced and displayed here.
                    View ticket details, status, and organization.
                  </p>
                  <SubSection title="Ticket Statuses">
                    <ul className="list-disc list-inside space-y-1">
                      <li><strong>Open</strong> - Awaiting response</li>
                      <li><strong>Merged</strong> - Combined with another ticket</li>
                      <li><strong>Closed</strong> - Resolved</li>
                    </ul>
                  </SubSection>
                  <Tip>The Dashboard shows total open tickets. Click to view all open tickets in Zammad.</Tip>
                </Section>

                <Section title="Time Tracking" icon={Clock} id="time">
                  <p>
                    Log time spent on tasks, projects, and client work for accurate billing.
                  </p>
                  <SubSection title="Logging Time">
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Go to Time Tracking</li>
                      <li>Click "Log Time"</li>
                      <li>Select client and/or project</li>
                      <li>Enter duration (hours/minutes)</li>
                      <li>Add description of work done</li>
                      <li>Choose billable or non-billable</li>
                    </ol>
                  </SubSection>
                </Section>

                <Section title="Projects" icon={FolderKanban} id="projects">
                  <p>
                    Projects help manage larger work efforts with multiple jobs and tasks.
                  </p>
                  <SubSection title="Project Structure">
                    <ul className="list-disc list-inside space-y-1">
                      <li><strong>Project</strong> - The overall initiative (e.g., "Server Migration")</li>
                      <li><strong>Jobs</strong> - Major phases within the project</li>
                      <li><strong>Tasks</strong> - Individual work items within jobs</li>
                    </ul>
                  </SubSection>
                </Section>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* MONITORING */}
        <TabsContent value="monitoring">
          <Card>
            <CardContent className="p-6">
              <ScrollArea className="h-[600px] pr-4">
                <Section title="NOC Display" icon={Monitor} id="noc">
                  <p>
                    The NOC Display provides a full-screen view ideal for wall monitors.
                    It auto-refreshes every 30 seconds.
                  </p>
                  <SubSection title="What it Shows">
                    <ul className="list-disc list-inside space-y-1">
                      <li>Server status grid with color-coded indicators</li>
                      <li>Offline server alerts (red banner)</li>
                      <li>Active incident count</li>
                      <li>Open ticket count</li>
                      <li>Bitdefender security status</li>
                      <li>Incident trend chart (7 days)</li>
                    </ul>
                  </SubSection>
                  <Tip>Access NOC Display from the sidebar. It opens in a new tab for TV displays.</Tip>
                </Section>

                <Section title="Monthly Health Checks" icon={CheckCircle} id="health-checks">
                  <p>
                    Monthly Health Checks ensure proactive server maintenance.
                  </p>
                  <SubSection title="Performing a Health Check">
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Go to Monthly Health Check</li>
                      <li>Select "New Health Check"</li>
                      <li>Choose the client</li>
                      <li>Select servers to check</li>
                      <li>Go through each checklist item</li>
                      <li>Add notes for any issues found</li>
                      <li>Sign off when complete</li>
                    </ol>
                  </SubSection>
                  <SubSection title="Checklist Items">
                    <p>Standard checks include:</p>
                    <ul className="list-disc list-inside space-y-1 mt-2">
                      <li>Disk space usage</li>
                      <li>Windows updates status</li>
                      <li>Backup verification</li>
                      <li>Event log review</li>
                      <li>Service status</li>
                      <li>Performance metrics</li>
                    </ul>
                  </SubSection>
                </Section>

                <Section title="Infrastructure Monitoring" icon={Network} id="infrastructure">
                  <p>
                    Monitor devices not covered by TRMM including Proxmox hosts, 
                    routers, switches, and other network devices.
                  </p>
                  <SubSection title="Device Types">
                    <ul className="list-disc list-inside space-y-1">
                      <li><strong>Proxmox</strong> - Monitor hypervisor hosts with API integration</li>
                      <li><strong>SNMP</strong> - Network devices like routers and switches</li>
                      <li><strong>Ping</strong> - Any device that responds to ICMP ping</li>
                    </ul>
                  </SubSection>
                  <SubSection title="Adding a Device">
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Go to Infrastructure (Admin section)</li>
                      <li>Click "Add Device"</li>
                      <li>Select device type</li>
                      <li>Enter IP address and credentials</li>
                      <li>Click "Add Device"</li>
                    </ol>
                  </SubSection>
                </Section>

                <Section title="Bitdefender Security" icon={Shield} id="security">
                  <p>
                    Security alerts from Bitdefender GravityZone are integrated
                    and displayed on the Dashboard and NOC Display.
                  </p>
                  <SubSection title="Alert Types">
                    <ul className="list-disc list-inside space-y-1">
                      <li>Malware detections</li>
                      <li>Policy violations</li>
                      <li>Endpoint protection status</li>
                    </ul>
                  </SubSection>
                  <Warning>Security alerts require immediate attention. Investigate any malware detections promptly.</Warning>
                </Section>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* REPORTS */}
        <TabsContent value="reports">
          <Card>
            <CardContent className="p-6">
              <ScrollArea className="h-[600px] pr-4">
                <Section title="Reports Overview" icon={BarChart3} id="reports-overview">
                  <p>
                    The Reports page provides comprehensive analytics and exports.
                  </p>
                  <SubSection title="Report Tabs">
                    <ul className="list-disc list-inside space-y-1">
                      <li><strong>Overview</strong> - Weekly status, all clients summary, trend charts</li>
                      <li><strong>Clients</strong> - Per-client health and asset reports</li>
                      <li><strong>Operations</strong> - Ticket aging, incident trends, offline history</li>
                      <li><strong>Staff</strong> - Time tracking summary, workload distribution</li>
                      <li><strong>Infrastructure</strong> - Server and device uptime</li>
                    </ul>
                  </SubSection>
                </Section>

                <Section title="Exporting Reports" icon={FileText} id="exports">
                  <SubSection title="PDF Export">
                    <p>Available PDF exports:</p>
                    <ul className="list-disc list-inside space-y-1 mt-2">
                      <li>Weekly Status Report</li>
                      <li>All Clients Summary</li>
                      <li>Individual Client Report</li>
                      <li>Incident Trends Report</li>
                    </ul>
                    <p className="mt-2">Click the PDF button next to any report to download.</p>
                  </SubSection>

                  <SubSection title="CSV Export">
                    <p>Export data to CSV for spreadsheets:</p>
                    <ul className="list-disc list-inside space-y-1 mt-2">
                      <li>Client lists</li>
                      <li>Server inventories</li>
                      <li>Time tracking data</li>
                    </ul>
                  </SubSection>
                </Section>

                <Section title="Trend Charts" icon={BarChart3} id="charts">
                  <p>
                    Interactive charts show trends over time:
                  </p>
                  <ul className="list-disc list-inside space-y-1 mt-2">
                    <li><strong>Incidents</strong> - Stacked by severity (Critical, High, Medium, Low)</li>
                    <li><strong>Tasks</strong> - Created vs Completed per day</li>
                    <li><strong>Hours Logged</strong> - Daily time tracking</li>
                  </ul>
                  <Tip>Charts are also displayed on the Dashboard (14 days) and NOC Display (7 days).</Tip>
                </Section>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ADMINISTRATION (Admin only) */}
        {isAdmin && (
          <TabsContent value="admin">
            <Card>
              <CardContent className="p-6">
                <ScrollArea className="h-[600px] pr-4">
                  <Section title="User Management" icon={Users} id="users">
                    <p>
                      Manage user accounts, roles, and permissions.
                    </p>
                    <SubSection title="User Roles">
                      <ul className="list-disc list-inside space-y-1">
                        <li><Badge>Admin</Badge> - Full access to all features and settings</li>
                        <li><Badge variant="secondary">Engineer</Badge> - Access to operations, no admin features</li>
                        <li><Badge variant="outline">Viewer</Badge> - Read-only access</li>
                      </ul>
                    </SubSection>

                    <SubSection title="Creating Users">
                      <ol className="list-decimal list-inside space-y-1">
                        <li>Go to Admin page</li>
                        <li>Click "Add User"</li>
                        <li>Enter username, email, and temporary password</li>
                        <li>Select role</li>
                        <li>User can change password on first login</li>
                      </ol>
                    </SubSection>

                    <SubSection title="Resetting Passwords">
                      <p>As an admin, you can reset any user's password:</p>
                      <ol className="list-decimal list-inside space-y-1 mt-2">
                        <li>Find the user in Admin page</li>
                        <li>Click the key icon</li>
                        <li>Enter new temporary password</li>
                        <li>Inform user of their new password</li>
                      </ol>
                    </SubSection>
                  </Section>

                  <Section title="Integration Management" icon={Settings} id="integrations">
                    <SubSection title="Tactical RMM">
                      <p>TRMM syncs automatically. To force sync:</p>
                      <ol className="list-decimal list-inside space-y-1 mt-2">
                        <li>Go to Admin page</li>
                        <li>Find Tactical RMM card</li>
                        <li>Click "Sync Now"</li>
                      </ol>
                      <Warning>Large syncs may take several minutes. Do not interrupt.</Warning>
                    </SubSection>

                    <SubSection title="Zammad">
                      <p>Zammad requires API token configuration in environment variables.</p>
                      <p className="mt-2">Required variables:</p>
                      <ul className="list-disc list-inside space-y-1 mt-1 font-mono text-sm">
                        <li>ZAMMAD_API_URL</li>
                        <li>ZAMMAD_API_TOKEN</li>
                      </ul>
                    </SubSection>

                    <SubSection title="Bitdefender GravityZone">
                      <p>Configure Bitdefender API access for security monitoring.</p>
                      <p className="mt-2">Required variables:</p>
                      <ul className="list-disc list-inside space-y-1 mt-1 font-mono text-sm">
                        <li>BITDEFENDER_API_URL</li>
                        <li>BITDEFENDER_API_KEY</li>
                        <li>BITDEFENDER_COMPANY_ID</li>
                      </ul>
                    </SubSection>

                    <SubSection title="Microsoft Teams">
                      <p>Configure Teams webhook for notifications:</p>
                      <ol className="list-decimal list-inside space-y-1 mt-2">
                        <li>Create incoming webhook in Teams channel</li>
                        <li>Add webhook URL to environment</li>
                        <li>Test from Settings page</li>
                      </ol>
                    </SubSection>
                  </Section>

                  <Section title="System Maintenance" icon={Shield} id="maintenance">
                    <SubSection title="Docker Commands">
                      <p className="font-mono text-sm bg-muted p-2 rounded">
                        # Restart services<br/>
                        docker compose restart<br/><br/>
                        # View logs<br/>
                        docker compose logs -f backend<br/><br/>
                        # Rebuild after updates<br/>
                        docker compose build --no-cache<br/>
                        docker compose up -d
                      </p>
                    </SubSection>

                    <SubSection title="Database Backup">
                      <p className="font-mono text-sm bg-muted p-2 rounded">
                        # Backup MongoDB<br/>
                        docker exec synthops-mongo mongodump --out /backup<br/><br/>
                        # Restore<br/>
                        docker exec synthops-mongo mongorestore /backup
                      </p>
                    </SubSection>
                  </Section>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
