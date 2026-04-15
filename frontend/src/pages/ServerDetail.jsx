import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiClient } from '../App';
import { toast } from 'sonner';
import { getErrorMessage } from '../lib/errorHandler';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Progress } from '../components/ui/progress';
import { Input } from '../components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { 
  Server, ArrowLeft, Cpu, HardDrive, Database, Network,
  CheckCircle, AlertTriangle, Clock, RefreshCw, Check, X, AlertCircle,
  Monitor, Package, Shield, Users, Activity, Disc, Wifi,
  Search, Download, Eye, ExternalLink, Terminal
} from 'lucide-react';

export default function ServerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [server, setServer] = useState(null);
  const [healthChecks, setHealthChecks] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  
  // TRMM Live Data
  const [trmmData, setTrmmData] = useState(null);
  const [software, setSoftware] = useState([]);
  const [softwareSearch, setSoftwareSearch] = useState('');
  const [loadingTrmm, setLoadingTrmm] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [trmmUrl, setTrmmUrl] = useState(null);

  useEffect(() => {
    fetchData();
    fetchTrmmConfig();
  }, [id]);

  const fetchTrmmConfig = async () => {
    try {
      const res = await apiClient.get('/integrations/trmm/status');
      if (res.data.status === 'connected' && res.data.url) {
        // Get base TRMM URL (remove /api if present)
        const baseUrl = res.data.url.replace(/\/api\/?$/, '').replace(/\/$/, '');
        setTrmmUrl(baseUrl);
      }
    } catch (error) {
      console.log('TRMM not configured');
    }
  };

  const openRemoteConnect = () => {
    // Open TRMM takecontrol page for this agent
    if (trmmUrl && server?.tactical_rmm_agent_id) {
      // Format: https://rmm.url/takecontrol/{agent_id}
      const baseUrl = trmmUrl.replace(/\/api\/?$/, '').replace(/\/$/, '');
      const connectUrl = `${baseUrl}/takecontrol/${server.tactical_rmm_agent_id}`;
      // Open in new window (not tab) with specific dimensions
      window.open(connectUrl, 'TRMMConnect', 'width=1400,height=900,menubar=no,toolbar=no,location=no,status=no');
    } else if (trmmUrl) {
      const baseUrl = trmmUrl.replace(/\/api\/?$/, '').replace(/\/$/, '');
      window.open(baseUrl, 'TRMMConnect', 'width=1400,height=900,menubar=no,toolbar=no,location=no,status=no');
    }
  };

  const fetchData = async () => {
    try {
      const [serverRes, healthRes, incidentsRes, maintenanceRes] = await Promise.all([
        apiClient.get(`/servers/${id}`),
        apiClient.get(`/health-checks/server/${id}`),
        apiClient.get(`/incidents?server_id=${id}`),
        apiClient.get(`/maintenance?server_id=${id}`)
      ]);
      setServer(serverRes.data);
      setHealthChecks(healthRes.data);
      setIncidents(incidentsRes.data);
      setMaintenance(maintenanceRes.data);
      
      // If server has TRMM agent ID, fetch live data
      if (serverRes.data.tactical_rmm_agent_id) {
        fetchTrmmData(serverRes.data.tactical_rmm_agent_id);
      }
    } catch (error) {
      toast.error('Failed to load server details');
      navigate('/servers');
    } finally {
      setLoading(false);
    }
  };

  const fetchTrmmData = async (agentId) => {
    setLoadingTrmm(true);
    try {
      const [detailsRes, softwareRes] = await Promise.all([
        apiClient.get(`/integrations/trmm/agent/${agentId}`),
        apiClient.get(`/integrations/trmm/agent/${agentId}/software`)
      ]);
      setTrmmData(detailsRes.data);
      setSoftware(softwareRes.data?.software || []);
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Failed to fetch TRMM data:', error);
    } finally {
      setLoadingTrmm(false);
    }
  };

  const refreshTrmmData = useCallback(() => {
    if (server?.tactical_rmm_agent_id) {
      fetchTrmmData(server.tactical_rmm_agent_id);
    }
  }, [server]);

  const generateHealthChecks = async () => {
    setGenerating(true);
    try {
      const response = await apiClient.post(`/health-checks/server/${id}/generate`);
      toast.success(response.data.message);
      fetchData();
    } catch (error) {
      toast.error('Failed to generate health checks');
    } finally {
      setGenerating(false);
    }
  };

  const updateHealthCheck = async (checkId, status, notes = '', value = '') => {
    try {
      await apiClient.put(`/health-checks/${checkId}`, { status, notes, value_recorded: value });
      toast.success('Health check updated');
      fetchData();
    } catch (error) {
      toast.error('Failed to update health check');
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'passed': return <Check className="h-4 w-4 text-emerald-400" />;
      case 'warning': return <AlertCircle className="h-4 w-4 text-amber-400" />;
      case 'failed': return <X className="h-4 w-4 text-red-400" />;
      case 'skipped': return <Clock className="h-4 w-4 text-slate-400" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'passed': return 'health-passed';
      case 'warning': return 'health-warning';
      case 'failed': return 'health-failed';
      case 'skipped': return 'health-skipped';
      default: return 'health-pending';
    }
  };

  // Format uptime from boot_time
  const formatUptime = (bootTime) => {
    if (!bootTime) return 'Unknown';
    const bootDate = new Date(bootTime * 1000);
    const now = new Date();
    const diffMs = now - bootDate;
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) return `${days}d ${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  // Filter software
  const filteredSoftware = software.filter(s => 
    s.name?.toLowerCase().includes(softwareSearch.toLowerCase()) ||
    s.publisher?.toLowerCase().includes(softwareSearch.toLowerCase())
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-64 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  if (!server) return null;

  const completedChecks = healthChecks.filter(c => c.status !== 'pending').length;
  const totalChecks = healthChecks.length;
  const progressPercent = totalChecks > 0 ? (completedChecks / totalChecks) * 100 : 0;

  // Group health checks by category
  const checksByCategory = healthChecks.reduce((acc, check) => {
    const cat = check.category || 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(check);
    return acc;
  }, {});

  // Check if has TRMM integration
  const hasTrmm = !!server.tactical_rmm_agent_id;

  return (
    <div className="space-y-6" data-testid="server-detail">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/servers')} data-testid="back-button">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded flex items-center justify-center ${
              server.status === 'online' ? 'bg-emerald-500/10' : 
              server.status === 'maintenance' ? 'bg-amber-500/10' : 'bg-red-500/10'
            }`}>
              <Server className={`h-6 w-6 ${
                server.status === 'online' ? 'text-emerald-400' : 
                server.status === 'maintenance' ? 'text-amber-400' : 'text-red-400'
              }`} />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight font-mono">
                {server.hostname}
              </h1>
              <p className="text-muted-foreground">
                {server.client_name} • {server.site_name}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {trmmUrl && hasTrmm && (
            <Button 
              variant="default"
              size="sm" 
              onClick={openRemoteConnect}
              className="bg-cyan-600 hover:bg-cyan-700"
              data-testid="trmm-connect-btn"
            >
              <Terminal className="h-4 w-4 mr-2" />
              Connect via TRMM
            </Button>
          )}
          {hasTrmm && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={refreshTrmmData}
              disabled={loadingTrmm}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loadingTrmm ? 'animate-spin' : ''}`} />
              Refresh Live
            </Button>
          )}
          <Badge className={`capitalize ${
            server.status === 'online' ? 'bg-emerald-500/20 text-emerald-400' :
            server.status === 'maintenance' ? 'bg-amber-500/20 text-amber-400' :
            'bg-red-500/20 text-red-400'
          }`}>
            {server.status}
          </Badge>
        </div>
      </div>

      {/* Live Status Banner */}
      {hasTrmm && trmmData && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Activity className={`h-5 w-5 ${trmmData.status === 'online' ? 'text-emerald-400' : 'text-red-400'}`} />
                  <span className="font-semibold">
                    {trmmData.status === 'online' ? 'Agent Online' : 'Agent Offline'}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground">
                  Last seen: {trmmData.last_seen ? new Date(trmmData.last_seen).toLocaleString() : 'Unknown'}
                </div>
                {trmmData.logged_username && (
                  <div className="flex items-center gap-1 text-sm">
                    <Users className="h-4 w-4" />
                    <span>Logged in: <span className="font-mono">{trmmData.logged_username}</span></span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3">
                {trmmData.needs_reboot && (
                  <Badge variant="destructive">Reboot Required</Badge>
                )}
                {trmmData.has_patches_pending && (
                  <Badge className="bg-amber-500/20 text-amber-400">Updates Pending</Badge>
                )}
                {trmmData.maintenance_mode && (
                  <Badge variant="outline">Maintenance Mode</Badge>
                )}
                {lastRefresh && (
                  <span className="text-xs text-muted-foreground">
                    Updated: {lastRefresh.toLocaleTimeString()}
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Hardware Specs - Enhanced with TRMM data */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Network className="h-4 w-4" />
              <span className="text-xs">IP Address</span>
            </div>
            <p className="font-mono text-sm">
              {(Array.isArray(server.local_ips) ? server.local_ips.join(', ') : server.local_ips) || 
               trmmData?.local_ips || server.ip_address || '-'}
            </p>
            {(server.public_ip || trmmData?.public_ip) && (
              <p className="font-mono text-xs text-muted-foreground">
                Public: {server.public_ip || trmmData?.public_ip}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Server className="h-4 w-4" />
              <span className="text-xs">Role</span>
            </div>
            <p className="text-sm">{server.role || trmmData?.monitoring_type || '-'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Cpu className="h-4 w-4" />
              <span className="text-xs">CPU</span>
            </div>
            <p className="font-mono text-sm">
              {trmmData?.cpu_model?.[0]?.split(',')[0] || `${server.cpu_cores || '-'} cores`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Monitor className="h-4 w-4" />
              <span className="text-xs">Graphics</span>
            </div>
            <p className="text-sm truncate">{trmmData?.graphics || '-'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <HardDrive className="h-4 w-4" />
              <span className="text-xs">Storage</span>
            </div>
            <p className="text-sm truncate">
              {trmmData?.physical_disks?.[0] || `${server.storage_gb || '-'} GB`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Clock className="h-4 w-4" />
              <span className="text-xs">Uptime</span>
            </div>
            <p className="font-mono text-sm">{formatUptime(trmmData?.boot_time)}</p>
          </CardContent>
        </Card>
      </div>

      {/* OS Info */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <p className="text-sm text-muted-foreground">Operating System</p>
              <p className="font-medium">{trmmData?.operating_system || server.operating_system || '-'}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {trmmData?.version && (
                <Badge variant="outline">Agent v{trmmData.version}</Badge>
              )}
              <Badge variant="outline" className="capitalize">{server.environment}</Badge>
              <Badge className={`priority-${server.criticality}`}>{server.criticality}</Badge>
              {trmmData?.plat && (
                <Badge variant="outline">{trmmData.plat} / {trmmData.goarch}</Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Checks Summary from TRMM */}
      {trmmData?.checks && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold">{trmmData.checks.total}</p>
              <p className="text-sm text-muted-foreground">Total Checks</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-emerald-400">{trmmData.checks.passing}</p>
              <p className="text-sm text-muted-foreground">Passing</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-red-400">{trmmData.checks.failing}</p>
              <p className="text-sm text-muted-foreground">Failing</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-amber-400">{trmmData.checks.warning}</p>
              <p className="text-sm text-muted-foreground">Warnings</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-blue-400">{trmmData.checks.info}</p>
              <p className="text-sm text-muted-foreground">Info</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue={hasTrmm ? "software" : "health"}>
        <TabsList>
          {hasTrmm && (
            <TabsTrigger value="software">
              <Package className="h-4 w-4 mr-2" />
              Software ({software.length})
            </TabsTrigger>
          )}
          <TabsTrigger value="health">Health Checks ({healthChecks.length})</TabsTrigger>
          <TabsTrigger value="incidents">Incidents ({incidents.length})</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance ({maintenance.length})</TabsTrigger>
        </TabsList>

        {/* Software Tab - NOC Style */}
        {hasTrmm && (
          <TabsContent value="software" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Installed Software</CardTitle>
                    <CardDescription>
                      {software.length} applications installed on this machine
                    </CardDescription>
                  </div>
                  <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search software..."
                      value={softwareSearch}
                      onChange={(e) => setSoftwareSearch(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loadingTrmm ? (
                  <div className="p-8 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
                    <p className="text-muted-foreground mt-2">Loading software list...</p>
                  </div>
                ) : filteredSoftware.length === 0 ? (
                  <div className="empty-state py-8">
                    <Package className="h-12 w-12" />
                    <p>No software found</p>
                  </div>
                ) : (
                  <div className="max-h-[500px] overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Version</TableHead>
                          <TableHead>Publisher</TableHead>
                          <TableHead>Size</TableHead>
                          <TableHead>Installed</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredSoftware.map((sw, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium max-w-[300px] truncate">
                              {sw.name}
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {sw.version?.substring(0, 20) || '-'}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {sw.publisher || '-'}
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {sw.size || '-'}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {sw.install_date && sw.install_date !== '01-1-01' ? sw.install_date : '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="health" className="mt-4 space-y-4">
          {/* Health Check Progress */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Monthly Health Checks</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}
                </p>
              </div>
              <Button onClick={generateHealthChecks} disabled={generating} data-testid="generate-checks">
                <RefreshCw className={`h-4 w-4 mr-2 ${generating ? 'animate-spin' : ''}`} />
                Generate Checks
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Progress</span>
                  <span className="font-mono">{completedChecks}/{totalChecks}</span>
                </div>
                <Progress value={progressPercent} className="h-2" />
              </div>
            </CardContent>
          </Card>

          {/* Health Checks by Category */}
          {Object.keys(checksByCategory).length === 0 ? (
            <Card>
              <CardContent className="p-8">
                <div className="empty-state">
                  <CheckCircle className="h-12 w-12" />
                  <p>No health checks yet</p>
                  <p className="text-muted-foreground">Click "Generate Checks" to create this month's checklist</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            Object.entries(checksByCategory).map(([category, checks]) => (
              <Card key={category}>
                <CardHeader>
                  <CardTitle className="text-base">{category}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {checks.map((check) => (
                    <div 
                      key={check.id} 
                      className="flex items-center justify-between p-3 rounded-sm bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        {getStatusIcon(check.status)}
                        <div>
                          <p className="font-medium text-sm">{check.template_name}</p>
                          {check.value_recorded && (
                            <p className="text-xs text-muted-foreground font-mono">
                              Value: {check.value_recorded}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={getStatusBadgeClass(check.status)}>
                          {check.status}
                        </Badge>
                        {check.status === 'pending' && (
                          <div className="flex gap-1">
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="h-7 px-2 text-emerald-400 hover:text-emerald-300"
                              onClick={() => updateHealthCheck(check.id, 'passed')}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="h-7 px-2 text-amber-400 hover:text-amber-300"
                              onClick={() => updateHealthCheck(check.id, 'warning')}
                            >
                              <AlertCircle className="h-4 w-4" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="h-7 px-2 text-red-400 hover:text-red-300"
                              onClick={() => updateHealthCheck(check.id, 'failed')}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="incidents" className="mt-4">
          <Card>
            <CardContent className="p-4">
              {incidents.length === 0 ? (
                <div className="empty-state py-8">
                  <AlertTriangle className="h-12 w-12" />
                  <p>No incidents recorded</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {incidents.map((incident) => (
                    <div key={incident.id} className="flex items-center justify-between p-3 rounded-sm bg-muted/50">
                      <div>
                        <p className="font-medium">{incident.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(incident.date_opened).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={`severity-${incident.severity}`}>{incident.severity}</Badge>
                        <Badge variant="outline" className="capitalize">{incident.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="maintenance" className="mt-4">
          <Card>
            <CardContent className="p-4">
              {maintenance.length === 0 ? (
                <div className="empty-state py-8">
                  <Clock className="h-12 w-12" />
                  <p>No maintenance recorded</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {maintenance.map((m) => (
                    <div key={m.id} className="flex items-center justify-between p-3 rounded-sm bg-muted/50">
                      <div>
                        <p className="font-medium">{m.maintenance_type}</p>
                        <p className="text-sm text-muted-foreground">
                          {m.scheduled_date ? new Date(m.scheduled_date).toLocaleDateString() : 'Not scheduled'}
                          {m.engineer_name && ` • ${m.engineer_name}`}
                        </p>
                      </div>
                      <Badge variant="outline" className="capitalize">{m.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
