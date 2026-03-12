import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiClient } from '../App';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Progress } from '../components/ui/progress';
import { 
  Server, ArrowLeft, Cpu, HardDrive, Database, Network,
  CheckCircle, AlertTriangle, Clock, RefreshCw, Check, X, AlertCircle
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

  useEffect(() => {
    fetchData();
  }, [id]);

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
    } catch (error) {
      toast.error('Failed to load server details');
      navigate('/servers');
    } finally {
      setLoading(false);
    }
  };

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
        <Badge className={`capitalize ${
          server.status === 'online' ? 'bg-emerald-500/20 text-emerald-400' :
          server.status === 'maintenance' ? 'bg-amber-500/20 text-amber-400' :
          'bg-red-500/20 text-red-400'
        }`}>
          {server.status}
        </Badge>
      </div>

      {/* Specs Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Network className="h-4 w-4" />
              <span className="text-xs">IP Address</span>
            </div>
            <p className="font-mono text-sm">{server.ip_address || '-'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Server className="h-4 w-4" />
              <span className="text-xs">Role</span>
            </div>
            <p className="text-sm">{server.role || '-'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Cpu className="h-4 w-4" />
              <span className="text-xs">CPU</span>
            </div>
            <p className="font-mono text-sm">{server.cpu_cores || '-'} cores</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Database className="h-4 w-4" />
              <span className="text-xs">RAM</span>
            </div>
            <p className="font-mono text-sm">{server.ram_gb || '-'} GB</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <HardDrive className="h-4 w-4" />
              <span className="text-xs">Storage</span>
            </div>
            <p className="font-mono text-sm">{server.storage_gb || '-'} GB</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Server className="h-4 w-4" />
              <span className="text-xs">Type</span>
            </div>
            <p className="text-sm capitalize">{server.server_type}</p>
          </CardContent>
        </Card>
      </div>

      {/* OS Info */}
      {server.operating_system && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">Operating System</p>
                <p className="font-medium">{server.operating_system} {server.os_version}</p>
              </div>
              <Badge variant="outline" className="capitalize">{server.environment}</Badge>
              <Badge className={`priority-${server.criticality}`}>{server.criticality}</Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="health">
        <TabsList>
          <TabsTrigger value="health">Health Checks ({healthChecks.length})</TabsTrigger>
          <TabsTrigger value="incidents">Incidents ({incidents.length})</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance ({maintenance.length})</TabsTrigger>
        </TabsList>

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
