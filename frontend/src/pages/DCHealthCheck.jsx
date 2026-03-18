import React, { useState, useEffect, useRef } from 'react';
import { apiClient } from '../App';
import { toast } from 'sonner';
import { getErrorMessage } from '../lib/errorHandler';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { 
  Shield, Server, CheckCircle, XCircle, Clock, 
  FileText, Download, Printer, Calendar, User,
  ChevronDown, ChevronUp, AlertTriangle, History, Trash2
} from 'lucide-react';

// Health check templates - Standard Server Checks
const STANDARD_SERVER_CHECKS = [
  // Storage
  { id: 'std-1', category: 'Storage', name: 'Disk Space Usage', description: 'Check disk space on all drives. Alert if >80% used.\nRun: Get-PSDrive -PSProvider FileSystem' },
  { id: 'std-2', category: 'Storage', name: 'RAID Health Status', description: 'Verify RAID array health and check for degraded disks' },
  // Backup
  { id: 'std-3', category: 'Backup', name: 'Backup Job Status', description: 'Verify all backup jobs completing successfully' },
  { id: 'std-4', category: 'Backup', name: 'Test Restore Verification', description: 'Perform test restore to verify backup integrity (if scheduled this month)' },
  { id: 'std-5', category: 'Backup', name: 'Backup Storage Capacity', description: 'Check backup destination has sufficient free space for growth' },
  // Security
  { id: 'std-6', category: 'Security', name: 'Windows Updates Status', description: 'Check for pending Windows updates and review installed updates' },
  { id: 'std-7', category: 'Security', name: 'Antivirus Status', description: 'Verify AV definitions are current and no threats detected' },
  { id: 'std-8', category: 'Security', name: 'Certificate Expiry Check', description: 'Check SSL/TLS certificate expiry dates (warn if <60 days)' },
  { id: 'std-9', category: 'Security', name: 'Local Admin Accounts', description: 'Review local administrator accounts - remove any unauthorized' },
  { id: 'std-10', category: 'Security', name: 'Failed Login Attempts', description: 'Review Security event log for failed login attempts (Event ID 4625)' },
  // Performance
  { id: 'std-11', category: 'Performance', name: 'CPU Usage Review', description: 'Review CPU usage patterns for anomalies. Check for sustained >80%' },
  { id: 'std-12', category: 'Performance', name: 'Memory Usage Review', description: 'Review memory usage patterns. Check available RAM and page file usage' },
  { id: 'std-13', category: 'Performance', name: 'Disk I/O Performance', description: 'Check disk queue length and I/O latency for bottlenecks' },
  // Event Logs
  { id: 'std-14', category: 'Event Logs', name: 'System Event Log Review', description: 'Review System event log for critical errors and warnings' },
  { id: 'std-15', category: 'Event Logs', name: 'Application Event Log Review', description: 'Review Application event log for errors' },
  // Services
  { id: 'std-16', category: 'Services', name: 'Critical Services Status', description: 'Verify all critical services are running and set to auto-start' },
  { id: 'std-17', category: 'Services', name: 'Scheduled Tasks Review', description: 'Review scheduled tasks for failures or disabled critical tasks' },
  // Hardware (Physical Servers)
  { id: 'std-18', category: 'Hardware', name: 'Hardware Health (iLO/iDRAC)', description: 'Check hardware health via iLO/iDRAC/vendor tools. Review any warnings' },
  { id: 'std-19', category: 'Hardware', name: 'Temperature & Fans', description: 'Verify CPU/system temperatures normal and all fans operational' },
  { id: 'std-20', category: 'Hardware', name: 'Power Supply Status', description: 'Check redundant PSU status - both should be healthy' },
  // UPS / Power (Physical Servers)
  { id: 'std-21', category: 'UPS / Power', name: 'UPS PowerChute Status', description: 'Verify APC PowerChute agent is running and communicating with UPS.\nCheck: Services > APC PBE Agent' },
  { id: 'std-22', category: 'UPS / Power', name: 'UPS Battery Health', description: 'Check UPS battery status in PowerChute. Replace if "Battery Needs Replacement"' },
  { id: 'std-23', category: 'UPS / Power', name: 'UPS Runtime Capacity', description: 'Verify UPS runtime is sufficient (recommend >10 mins at current load)' },
  { id: 'std-24', category: 'UPS / Power', name: 'UPS Shutdown Settings', description: 'Confirm graceful shutdown is configured correctly with appropriate delay' },
  { id: 'std-25', category: 'UPS / Power', name: 'UPS Self-Test Results', description: 'Review recent UPS self-test results for any failures' },
  // Network
  { id: 'std-26', category: 'Network', name: 'Network Connectivity', description: 'Verify network connectivity, DNS resolution, and gateway reachability' },
  { id: 'std-27', category: 'Network', name: 'NIC Teaming Status', description: 'If NIC teaming configured, verify all adapters active and healthy' },
  { id: 'std-28', category: 'Network', name: 'Network Errors', description: 'Check for network adapter errors, dropped packets, or CRC errors' },
  // Licensing & Compliance
  { id: 'std-29', category: 'Licensing', name: 'Windows Activation', description: 'Verify Windows is activated and license is valid' },
  { id: 'std-30', category: 'Licensing', name: 'Software License Check', description: 'Review key software licenses (SQL, Exchange, etc.) for expiry' },
  // Documentation
  { id: 'std-31', category: 'Documentation', name: 'Asset Info Current', description: 'Verify server documentation is current (IP, specs, contacts)' },
  { id: 'std-32', category: 'Documentation', name: 'Recovery Procedures', description: 'Confirm disaster recovery documentation exists and is accessible' },
  // Firmware & Drivers
  { id: 'std-33', category: 'Firmware', name: 'BIOS/Firmware Version', description: 'Check if BIOS/firmware updates are available (apply during maintenance window)' },
];

// Health check templates - Active Directory Checks
const AD_SERVER_CHECKS = [
  // Replication
  { id: 'ad-1', category: 'AD Replication', name: 'Replication Summary', description: 'Run: repadmin /replsummary\nConfirm no replication failures between DCs' },
  { id: 'ad-2', category: 'AD Replication', name: 'Replication Status Detail', description: 'Run: repadmin /showrepl\nCheck largest delta times are reasonable (<24 hours)' },
  { id: 'ad-3', category: 'AD Replication', name: 'Replication Queue', description: 'Run: repadmin /queue\nConfirm replication queue is not backed up' },
  // DC Diagnostics
  { id: 'ad-4', category: 'AD Diagnostics', name: 'DC Diagnostics Full', description: 'Run: dcdiag /v\nConfirm all tests pass: Advertising, Replications, NetLogons, Services, DFSREvent, SysVolCheck' },
  { id: 'ad-5', category: 'AD Diagnostics', name: 'FSMO Roles Verification', description: 'Run: netdom query fsmo\nConfirm FSMO role holders are online and healthy' },
  // SYSVOL/NETLOGON
  { id: 'ad-6', category: 'AD SYSVOL', name: 'SYSVOL Check', description: 'Run: dcdiag /test:sysvolcheck\nConfirm SYSVOL share exists and is accessible' },
  { id: 'ad-7', category: 'AD SYSVOL', name: 'DFS Replication Status', description: 'Run: dcdiag /test:dfsrevent\nCheck for DFS replication issues' },
  { id: 'ad-8', category: 'AD SYSVOL', name: 'Network Shares Verification', description: 'Run: net share\nConfirm SYSVOL and NETLOGON shares exist' },
  { id: 'ad-9', category: 'AD SYSVOL', name: 'GPO Folder Consistency', description: 'Compare SYSVOL GPO folders match across DCs' },
  // DNS
  { id: 'ad-10', category: 'AD DNS', name: 'DNS Health Check', description: 'Run: dcdiag /test:dns\nConfirm DNS zones replicate correctly' },
  { id: 'ad-11', category: 'AD DNS', name: 'DNS Forwarders Check', description: 'Verify DNS forwarders are configured and responding' },
  { id: 'ad-12', category: 'AD DNS', name: 'DNS Event Log Review', description: 'Check DNS Server event log for errors' },
  { id: 'ad-13', category: 'AD DNS', name: 'DNS Scavenging', description: 'Verify DNS scavenging is enabled and stale records are being cleaned' },
  // Time Sync
  { id: 'ad-14', category: 'AD Time Sync', name: 'NTP Source Check', description: 'Run: w32tm /query /source\nVerify time source is correct' },
  { id: 'ad-15', category: 'AD Time Sync', name: 'Time Sync Status', description: 'Run: w32tm /query /status\nPDC should use external NTP, other DCs sync from domain' },
  { id: 'ad-16', category: 'AD Time Sync', name: 'Time Skew Check', description: 'Verify time difference between DCs is <5 minutes (Kerberos requirement)' },
  // Event Logs
  { id: 'ad-17', category: 'AD Events', name: 'Directory Service Log', description: 'Check Directory Service event log for NTDS errors, replication failures' },
  { id: 'ad-18', category: 'AD Events', name: 'Kerberos Issues Check', description: 'Check event logs for Kerberos authentication issues' },
  // Services
  { id: 'ad-19', category: 'AD Services', name: 'AD Critical Services', description: 'Run: Get-Service NTDS,DNS,DFSR,NetLogon,KDC\nConfirm all AD services are running' },
  // Accounts
  { id: 'ad-20', category: 'AD Accounts', name: 'Stale Computer Accounts', description: 'Run: Get-ADComputer -Filter * -Properties LastLogonDate | Where {$_.LastLogonDate -lt (Get-Date).AddDays(-90)}\nReview old computer objects' },
  { id: 'ad-21', category: 'AD Accounts', name: 'Stale User Accounts', description: 'Review user accounts not logged in >90 days. Disable if appropriate' },
  { id: 'ad-22', category: 'AD Accounts', name: 'Locked Accounts Check', description: 'Run: Search-ADAccount -LockedOut\nInvestigate unusual lockouts' },
  { id: 'ad-23', category: 'AD Accounts', name: 'Service Account Passwords', description: 'Review service accounts - ensure passwords not expired or expiring soon' },
  { id: 'ad-24', category: 'AD Accounts', name: 'Admin Group Membership', description: 'Review Domain Admins, Enterprise Admins membership for unauthorized accounts' },
  // GPO
  { id: 'ad-25', category: 'AD GPO', name: 'Group Policy Processing', description: 'Run: gpresult /r\nConfirm GPO processing works correctly' },
  { id: 'ad-26', category: 'AD GPO', name: 'Unlinked GPOs', description: 'Review and clean up any unlinked GPOs in the domain' },
  // Backup
  { id: 'ad-27', category: 'AD Backup', name: 'System State Backup', description: 'Confirm System State backup is current and successful' },
  { id: 'ad-28', category: 'AD Backup', name: 'AD Recycle Bin', description: 'Verify AD Recycle Bin is enabled (if Forest functional level 2008 R2+)' },
  // Sites & Subnets
  { id: 'ad-29', category: 'AD Sites', name: 'Site Links Status', description: 'Verify AD site links are configured correctly and schedules appropriate' },
  { id: 'ad-30', category: 'AD Sites', name: 'Subnet Assignments', description: 'Verify all network subnets are assigned to correct AD sites' },
  // DHCP (if role installed)
  { id: 'ad-31', category: 'AD DHCP', name: 'DHCP Scope Usage', description: 'Check DHCP scope utilization - expand if >80% used' },
  { id: 'ad-32', category: 'AD DHCP', name: 'DHCP Failover Status', description: 'If DHCP failover configured, verify partnership is healthy' },
];

export default function DCHealthCheck() {
  const [servers, setServers] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedServerId, setSelectedServerId] = useState('');
  const [selectedServer, setSelectedServer] = useState(null);
  const [isADServer, setIsADServer] = useState(false);
  
  // Current check form
  const [checkResults, setCheckResults] = useState({});
  const [checkNotes, setCheckNotes] = useState({});
  const [signOffName, setSignOffName] = useState('');
  const [checkDate, setCheckDate] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);
  
  // History
  const [history, setHistory] = useState([]);
  const [historyFilter, setHistoryFilter] = useState({ server: 'all', year: new Date().getFullYear().toString() });
  const [viewingRecord, setViewingRecord] = useState(null);
  const [activeTab, setActiveTab] = useState('new-check');
  
  const printRef = useRef();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [serversRes, clientsRes, historyRes] = await Promise.all([
        apiClient.get('/servers'),
        apiClient.get('/clients'),
        apiClient.get('/health-checks')
      ]);
      setServers(serversRes.data || []);
      setClients(clientsRes.data || []);
      setHistory(historyRes.data || []);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to load data'));
    } finally {
      setLoading(false);
    }
  };

  const handleServerSelect = (serverId) => {
    setSelectedServerId(serverId);
    const server = servers.find(s => s.id === serverId);
    setSelectedServer(server);
    
    // Check if it's an AD server (you can customize this logic)
    const isAD = server?.role?.toLowerCase().includes('domain controller') ||
                 server?.role?.toLowerCase().includes('dc') ||
                 server?.role?.toLowerCase().includes('active directory') ||
                 server?.hostname?.toLowerCase().includes('dc');
    setIsADServer(isAD);
    
    // Reset form
    setCheckResults({});
    setCheckNotes({});
    setSignOffName('');
    setCheckDate(new Date().toISOString().split('T')[0]);
  };

  const getChecksForServer = () => {
    if (isADServer) {
      return [...STANDARD_SERVER_CHECKS, ...AD_SERVER_CHECKS];
    }
    return STANDARD_SERVER_CHECKS;
  };

  const groupChecksByCategory = (checks) => {
    return checks.reduce((acc, check) => {
      if (!acc[check.category]) acc[check.category] = [];
      acc[check.category].push(check);
      return acc;
    }, {});
  };

  const handleCheckStatusChange = (checkId, status) => {
    setCheckResults(prev => ({ ...prev, [checkId]: status }));
  };

  const handleNoteChange = (checkId, note) => {
    setCheckNotes(prev => ({ ...prev, [checkId]: note }));
  };

  const handleSaveHealthCheck = async (isDraft = false) => {
    if (!selectedServer) {
      toast.error('Please select a server');
      return;
    }
    
    if (!isDraft && !signOffName.trim()) {
      toast.error('Please enter your name to sign off');
      return;
    }

    const checks = getChecksForServer();
    const completedChecks = checks.filter(c => checkResults[c.id]).length;
    
    if (!isDraft) {
      const allChecked = checks.every(c => checkResults[c.id]);
      if (!allChecked) {
        toast.error('Please complete all checks before signing off');
        return;
      }
    }

    setSaving(true);
    try {
      const checkData = {
        server_id: selectedServer.id,
        server_name: selectedServer.hostname,
        check_date: checkDate,
        signed_off_by: isDraft ? '' : signOffName,
        is_ad_server: isADServer,
        is_draft: isDraft,
        completed_count: completedChecks,
        total_count: checks.length,
        checks: checks.map(c => ({
          id: c.id,
          category: c.category,
          name: c.name,
          description: c.description,
          status: checkResults[c.id] || '',
          notes: checkNotes[c.id] || ''
        })),
        created_at: new Date().toISOString()
      };

      await apiClient.post('/health-checks', checkData);
      toast.success(isDraft ? 'Progress saved - you can continue later' : 'Health check completed and saved');
      
      // Refresh history
      const historyRes = await apiClient.get('/health-checks');
      setHistory(historyRes.data || []);
      
      if (!isDraft) {
        // Reset form only on complete save
        setSelectedServerId('');
        setSelectedServer(null);
        setCheckResults({});
        setCheckNotes({});
        setSignOffName('');
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to save health check'));
    } finally {
      setSaving(false);
    }
  };

  const loadDraftHealthCheck = async (record) => {
    // Load a draft to continue
    setSelectedServerId(record.server_id);
    const server = servers.find(s => s.id === record.server_id);
    setSelectedServer(server);
    setIsADServer(record.is_ad_server);
    setCheckDate(record.check_date);
    
    // Load check results and notes
    const results = {};
    const notes = {};
    record.checks.forEach(c => {
      if (c.status) results[c.id] = c.status;
      if (c.notes) notes[c.id] = c.notes;
    });
    setCheckResults(results);
    setCheckNotes(notes);
    
    // Switch to the "New Check" tab to show the checklist
    setActiveTab('new-check');
    
    toast.success('Draft loaded - continue where you left off');
  };

  const handleDeleteHealthCheck = async (checkId, serverName) => {
    if (!confirm(`Are you sure you want to delete this health check record for "${serverName}"? This cannot be undone.`)) {
      return;
    }
    
    try {
      await apiClient.delete(`/health-checks/${checkId}`);
      toast.success('Health check record deleted');
      // Refresh the history list
      const historyRes = await apiClient.get('/health-checks');
      setHistory(historyRes.data || []);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to delete health check'));
    }
  };

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>Server Health Check - ${viewingRecord?.server_name || selectedServer?.hostname}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { color: #333; border-bottom: 2px solid #333; padding-bottom: 10px; }
            h2 { color: #666; margin-top: 30px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f4f4f4; }
            .pass { color: green; font-weight: bold; }
            .fail { color: red; font-weight: bold; }
            .na { color: gray; }
            .header-info { display: flex; justify-content: space-between; margin-bottom: 20px; }
            .signature-line { margin-top: 40px; border-top: 1px solid #333; padding-top: 10px; }
            @media print { body { -webkit-print-color-adjust: exact; } }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const getClientName = (serverId) => {
    const server = servers.find(s => s.id === serverId);
    if (!server) return 'Unknown';
    const client = clients.find(c => c.id === server.client_id);
    return client?.name || 'Unknown';
  };

  const filteredHistory = history.filter(h => {
    if (historyFilter.server !== 'all' && h.server_id !== historyFilter.server) return false;
    if (historyFilter.year !== 'all') {
      const year = new Date(h.check_date).getFullYear().toString();
      if (year !== historyFilter.year) return false;
    }
    return true;
  });

  const years = [...new Set(history.map(h => new Date(h.check_date).getFullYear()))].sort((a, b) => b - a);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="health-check-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-8 w-8 text-primary" />
            Monthly Server Health Check
          </h1>
          <p className="text-muted-foreground mt-1">
            Document monthly health checks for your servers
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="new-check" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            New Health Check
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Check History
          </TabsTrigger>
        </TabsList>

        {/* New Health Check Tab */}
        <TabsContent value="new-check" className="space-y-4">
          {/* Server Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                Select Server
              </CardTitle>
              <CardDescription>
                Choose the server to perform the monthly health check on
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Server</Label>
                  <Select value={selectedServerId} onValueChange={handleServerSelect}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a server..." />
                    </SelectTrigger>
                    <SelectContent>
                      {[...servers]
                        .sort((a, b) => {
                          const clientA = getClientName(a.id) || 'ZZZ';
                          const clientB = getClientName(b.id) || 'ZZZ';
                          if (clientA !== clientB) return clientA.localeCompare(clientB);
                          return (a.hostname || '').localeCompare(b.hostname || '');
                        })
                        .map(server => (
                          <SelectItem key={server.id} value={server.id}>
                            {getClientName(server.id)} - {server.hostname}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {selectedServer && (
                  <>
                    <div>
                      <Label>Server Type</Label>
                      <div className="mt-2">
                        <Badge variant={isADServer ? 'default' : 'secondary'}>
                          {isADServer ? 'Domain Controller / AD Server' : 'Standard Server'}
                        </Badge>
                      </div>
                    </div>
                    <div>
                      <Label>Check Date</Label>
                      <Input 
                        type="date" 
                        value={checkDate}
                        onChange={(e) => setCheckDate(e.target.value)}
                      />
                    </div>
                  </>
                )}
              </div>
              
              {selectedServer && (
                <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                  <input
                    type="checkbox"
                    id="isADServer"
                    checked={isADServer}
                    onChange={(e) => setIsADServer(e.target.checked)}
                    className="rounded"
                  />
                  <Label htmlFor="isADServer" className="cursor-pointer">
                    This is a Domain Controller / Active Directory server (include AD-specific checks)
                  </Label>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Health Check Form */}
          {selectedServer && (
            <Card>
              <CardHeader>
                <CardTitle>Health Check Items</CardTitle>
                <CardDescription>
                  Complete all checks and mark as Pass, Fail, or N/A
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div ref={printRef}>
                  {/* Print Header (hidden on screen) */}
                  <div className="hidden print:block mb-6">
                    <h1>Monthly Server Health Check</h1>
                    <div className="header-info">
                      <div>
                        <strong>Server:</strong> {selectedServer.hostname}<br />
                        <strong>Client:</strong> {getClientName(selectedServer.id)}<br />
                        <strong>Type:</strong> {isADServer ? 'Domain Controller' : 'Standard Server'}
                      </div>
                      <div>
                        <strong>Date:</strong> {checkDate}<br />
                        <strong>Performed By:</strong> {signOffName}
                      </div>
                    </div>
                  </div>

                  {Object.entries(groupChecksByCategory(getChecksForServer())).map(([category, checks]) => (
                    <div key={category} className="mb-6">
                      <h3 className="font-semibold text-lg mb-3 flex items-center gap-2 border-b pb-2">
                        {category.startsWith('AD') ? (
                          <Shield className="h-4 w-4 text-blue-500" />
                        ) : (
                          <Server className="h-4 w-4 text-gray-500" />
                        )}
                        {category}
                      </h3>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[200px]">Check</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead className="w-[150px]">Status</TableHead>
                            <TableHead className="w-[200px]">Notes</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {checks.map(check => (
                            <TableRow key={check.id}>
                              <TableCell className="font-medium">{check.name}</TableCell>
                              <TableCell className="text-sm text-muted-foreground whitespace-pre-line">
                                {check.description}
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-1">
                                  <Button
                                    size="sm"
                                    variant={checkResults[check.id] === 'pass' ? 'default' : 'outline'}
                                    className={checkResults[check.id] === 'pass' ? 'bg-green-600 hover:bg-green-700' : ''}
                                    onClick={() => handleCheckStatusChange(check.id, 'pass')}
                                  >
                                    <CheckCircle className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant={checkResults[check.id] === 'fail' ? 'default' : 'outline'}
                                    className={checkResults[check.id] === 'fail' ? 'bg-red-600 hover:bg-red-700' : ''}
                                    onClick={() => handleCheckStatusChange(check.id, 'fail')}
                                  >
                                    <XCircle className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant={checkResults[check.id] === 'na' ? 'default' : 'outline'}
                                    className={checkResults[check.id] === 'na' ? 'bg-gray-600 hover:bg-gray-700' : ''}
                                    onClick={() => handleCheckStatusChange(check.id, 'na')}
                                  >
                                    N/A
                                  </Button>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Input
                                  placeholder="Notes..."
                                  value={checkNotes[check.id] || ''}
                                  onChange={(e) => handleNoteChange(check.id, e.target.value)}
                                />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ))}

                  {/* Sign Off Section */}
                  <div className="signature-line mt-8 pt-4 border-t">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Signed Off By</Label>
                        <Input
                          placeholder="Your name..."
                          value={signOffName}
                          onChange={(e) => setSignOffName(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Date</Label>
                        <Input type="date" value={checkDate} disabled />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 mt-6">
                  <Button onClick={() => handleSaveHealthCheck(true)} variant="outline" disabled={saving}>
                    {saving ? 'Saving...' : 'Save Progress'}
                  </Button>
                  <Button onClick={() => handleSaveHealthCheck(false)} disabled={saving}>
                    {saving ? 'Saving...' : 'Complete & Sign Off'}
                  </Button>
                  <Button variant="outline" onClick={handlePrint}>
                    <Printer className="h-4 w-4 mr-2" />
                    Print
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Health Check History
              </CardTitle>
              <CardDescription>
                View and print previous health check records
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Filters */}
              <div className="flex gap-4 mb-4">
                <div>
                  <Label>Filter by Server</Label>
                  <Select value={historyFilter.server} onValueChange={(v) => setHistoryFilter(prev => ({ ...prev, server: v }))}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Servers</SelectItem>
                      {servers.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.hostname}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Filter by Year</Label>
                  <Select value={historyFilter.year} onValueChange={(v) => setHistoryFilter(prev => ({ ...prev, year: v }))}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Years</SelectItem>
                      {years.map(y => (
                        <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* History Table */}
              {filteredHistory.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No health checks recorded yet</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Server</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Signed Off By</TableHead>
                      <TableHead>Result</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredHistory.map(record => {
                      const passCount = record.checks?.filter(c => c.status === 'pass').length || 0;
                      const failCount = record.checks?.filter(c => c.status === 'fail').length || 0;
                      const totalChecks = record.checks?.length || 0;
                      const isDraft = record.is_draft || !record.signed_off_by;
                      
                      return (
                        <TableRow key={record.id}>
                          <TableCell>{new Date(record.check_date).toLocaleDateString()}</TableCell>
                          <TableCell className="font-medium">{record.server_name}</TableCell>
                          <TableCell>{getClientName(record.server_id)}</TableCell>
                          <TableCell>
                            <Badge variant={record.is_ad_server ? 'default' : 'secondary'}>
                              {record.is_ad_server ? 'AD Server' : 'Standard'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {isDraft ? (
                              <Badge variant="outline" className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                                Draft
                              </Badge>
                            ) : (
                              record.signed_off_by
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="text-green-600">{passCount} pass</span>
                              {failCount > 0 && (
                                <span className="text-red-600">{failCount} fail</span>
                              )}
                              <span className="text-muted-foreground">/ {totalChecks}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              {isDraft && (
                                <Button size="sm" onClick={() => loadDraftHealthCheck(record)} data-testid={`continue-draft-${record.id}`}>
                                  Continue
                                </Button>
                              )}
                              <Button size="sm" variant="outline" onClick={() => setViewingRecord(record)}>
                                View
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteHealthCheck(record.id, record.server_name);
                                }}
                                data-testid={`delete-check-${record.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* View Record Dialog */}
      <Dialog open={!!viewingRecord} onOpenChange={() => setViewingRecord(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Health Check Record - {viewingRecord?.server_name}</DialogTitle>
          </DialogHeader>
          
          {viewingRecord && (
            <div ref={printRef}>
              <div className="grid grid-cols-2 gap-4 mb-6 p-4 bg-muted rounded-lg">
                <div>
                  <strong>Server:</strong> {viewingRecord.server_name}<br />
                  <strong>Type:</strong> {viewingRecord.is_ad_server ? 'Domain Controller' : 'Standard Server'}
                </div>
                <div>
                  <strong>Date:</strong> {new Date(viewingRecord.check_date).toLocaleDateString()}<br />
                  <strong>Signed Off By:</strong> {viewingRecord.signed_off_by}
                </div>
              </div>

              {Object.entries(groupChecksByCategory(viewingRecord.checks || [])).map(([category, checks]) => (
                <div key={category} className="mb-4">
                  <h3 className="font-semibold mb-2">{category}</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Check</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {checks.map(check => (
                        <TableRow key={check.id}>
                          <TableCell>{check.name}</TableCell>
                          <TableCell>
                            <Badge variant={
                              check.status === 'pass' ? 'default' :
                              check.status === 'fail' ? 'destructive' : 'secondary'
                            } className={check.status === 'pass' ? 'bg-green-600' : ''}>
                              {check.status?.toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell>{check.notes || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingRecord(null)}>Close</Button>
            <Button onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
