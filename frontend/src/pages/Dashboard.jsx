import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../App';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { ScrollArea } from '../components/ui/scroll-area';
import { Progress } from '../components/ui/progress';
import { 
  Building2, Server, ListTodo, FolderKanban, AlertTriangle, 
  Activity, ArrowRight, CheckCircle, Clock, AlertCircle,
  RefreshCw, Wrench, WifiOff, X, Bell, Shield, ShieldAlert,
  Network, HardDrive, Monitor, Container, Cpu, MemoryStick, Calendar, Lightbulb, XCircle
} from 'lucide-react';

function formatBytes(bytes, decimals = 1) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [offlineDevices, setOfflineDevices] = useState([]);
  const [dismissedAlerts, setDismissedAlerts] = useState([]);
  const [securityAlerts, setSecurityAlerts] = useState(null);
  const [infraStatus, setInfraStatus] = useState(null);
  const [upcomingTasks, setUpcomingTasks] = useState([]);
  const [techTip, setTechTip] = useState(null);
  const [backupStats, setBackupStats] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [statsRes, activityRes, serversRes] = await Promise.all([
        apiClient.get('/dashboard/stats'),
        apiClient.get('/dashboard/activity'),
        apiClient.get('/servers')
      ]);
      setStats(statsRes.data);
      setActivity(activityRes.data);
      
      // Get offline devices (servers only for critical alerts)
      const offline = serversRes.data.filter(s => 
        s.status === 'offline' && s.server_type === 'server'
      );
      setOfflineDevices(offline);
      
      // Try to get Bitdefender security alerts
      try {
        const securityRes = await apiClient.get('/bitdefender/alerts');
        setSecurityAlerts(securityRes.data);
      } catch (e) {
        // Bitdefender not configured
      }

      // Try to get infrastructure status
      try {
        const infraRes = await apiClient.get('/infrastructure/status');
        setInfraStatus(infraRes.data);
      } catch (e) {
        // Infrastructure not configured
      }

      // Try to get upcoming tasks
      try {
        const upcomingRes = await apiClient.get('/tasks/upcoming?days=2');
        setUpcomingTasks(upcomingRes.data);
      } catch (e) {
        // Upcoming tasks endpoint not available
      }

      // Get daily tech tip
      try {
        const tipRes = await apiClient.get('/dashboard/tech-tip');
        setTechTip(tipRes.data);
      } catch (e) {
        // Tech tip not available
      }

      // Get backup stats
      try {
        const backupRes = await apiClient.get('/backups/stats');
        setBackupStats(backupRes.data);
      } catch (e) {
        // Backup stats not available
      }
    } catch (error) {
      console.error('Dashboard fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  const dismissAlert = (serverId) => {
    setDismissedAlerts([...dismissedAlerts, serverId]);
  };

  const visibleOfflineDevices = offlineDevices.filter(d => !dismissedAlerts.includes(d.id));

  const statCards = [
    { 
      title: 'Clients', 
      value: stats?.total_clients || 0, 
      icon: Building2, 
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
      path: '/clients'
    },
    { 
      title: 'Servers', 
      value: stats?.total_servers || 0, 
      subtitle: `${stats?.servers_online || 0} online`,
      icon: Server, 
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
      path: '/servers'
    },
    { 
      title: 'Open Tasks', 
      value: stats?.open_tasks || 0, 
      icon: ListTodo, 
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10',
      path: '/tasks'
    },
    { 
      title: 'Active Projects', 
      value: stats?.active_projects || 0, 
      icon: FolderKanban, 
      color: 'text-orange-400',
      bgColor: 'bg-orange-500/10',
      path: '/projects'
    },
    { 
      title: 'Open Incidents', 
      value: stats?.open_incidents || 0, 
      icon: AlertTriangle, 
      color: stats?.open_incidents > 0 ? 'text-red-400' : 'text-muted-foreground',
      bgColor: stats?.open_incidents > 0 ? 'bg-red-500/10' : 'bg-muted',
      path: '/incidents'
    },
    { 
      title: 'Pending Checks', 
      value: stats?.pending_health_checks || 0, 
      icon: CheckCircle, 
      color: 'text-cyan-400',
      bgColor: 'bg-cyan-500/10',
      path: '/servers'
    },
  ];

  const getActivityIcon = (type) => {
    switch (type) {
      case 'task': return ListTodo;
      case 'incident': return AlertTriangle;
      case 'maintenance': return Wrench;
      default: return Activity;
    }
  };

  const getStatusBadge = (status, severity) => {
    if (severity) {
      const colors = {
        critical: 'bg-red-500/20 text-red-400',
        high: 'bg-orange-500/20 text-orange-400',
        medium: 'bg-yellow-500/20 text-yellow-400',
        low: 'bg-blue-500/20 text-blue-400'
      };
      return <Badge className={colors[severity] || colors.medium}>{severity}</Badge>;
    }
    
    const colors = {
      open: 'bg-blue-500/20 text-blue-400',
      in_progress: 'bg-yellow-500/20 text-yellow-400',
      completed: 'bg-emerald-500/20 text-emerald-400',
      resolved: 'bg-emerald-500/20 text-emerald-400',
      scheduled: 'bg-purple-500/20 text-purple-400'
    };
    return <Badge className={colors[status] || colors.open}>{status?.replace('_', ' ')}</Badge>;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4">
                <div className="h-16 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="dashboard">
      {/* Offline Server Alerts */}
      {visibleOfflineDevices.length > 0 && (
        <Card className="border-red-500/50 bg-red-500/5 animate-pulse-slow">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2 text-red-400">
              <WifiOff className="h-5 w-5" />
              <Bell className="h-4 w-4" />
              {visibleOfflineDevices.length} Server{visibleOfflineDevices.length > 1 ? 's' : ''} Offline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {visibleOfflineDevices.slice(0, 5).map((device) => (
                <div 
                  key={device.id}
                  className="flex items-center justify-between p-2 bg-red-500/10 rounded"
                >
                  <div className="flex items-center gap-3">
                    <Server className="h-4 w-4 text-red-400" />
                    <div>
                      <span className="font-mono font-medium">{device.hostname}</span>
                      <span className="text-sm text-muted-foreground ml-2">
                        {device.client_name}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => navigate(`/servers/${device.id}`)}
                    >
                      View
                    </Button>
                    <Button 
                      size="sm" 
                      variant="ghost"
                      onClick={() => dismissAlert(device.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              {visibleOfflineDevices.length > 5 && (
                <Button 
                  variant="link" 
                  className="text-red-400"
                  onClick={() => navigate('/reports')}
                >
                  View all {visibleOfflineDevices.length} offline servers
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upcoming Tasks Alert */}
      {upcomingTasks.length > 0 && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-amber-400" />
                <span className="font-medium">
                  {upcomingTasks.length} task{upcomingTasks.length > 1 ? 's' : ''} due in the next 2 days
                </span>
              </div>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => navigate('/tasks')}
              >
                View All
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
            <div className="space-y-2">
              {upcomingTasks.slice(0, 5).map(task => (
                <div 
                  key={task.id} 
                  className="flex items-center justify-between p-2 bg-muted/50 rounded-sm hover:bg-muted cursor-pointer"
                  onClick={() => navigate('/tasks')}
                >
                  <div className="flex items-center gap-3">
                    <ListTodo className="h-4 w-4 text-amber-400" />
                    <div>
                      <span className="font-medium">{task.title}</span>
                      {task.client_name && (
                        <span className="text-sm text-muted-foreground ml-2">• {task.client_name}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {task.is_recurring && (
                      <Badge variant="outline" className="text-purple-400">
                        <RefreshCw className="h-3 w-3 mr-1" />
                        {task.recurrence_pattern}
                      </Badge>
                    )}
                    <Badge variant="outline" className={
                      task.priority === 'urgent' ? 'text-red-400' :
                      task.priority === 'high' ? 'text-amber-400' : ''
                    }>
                      {task.priority}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {task.due_date ? new Date(task.due_date).toLocaleDateString() : 'No date'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Barlow Condensed' }}>
            DASHBOARD
          </h1>
          <p className="text-muted-foreground">Welcome to SynthOps Control Center</p>
        </div>
        <Button variant="outline" onClick={fetchData} data-testid="refresh-dashboard">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Daily Tech Tip */}
      {techTip && (
        <Card className="border-l-4 border-l-cyan-500 bg-gradient-to-r from-cyan-500/5 to-transparent" data-testid="daily-tech-tip">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-cyan-500/20 mt-0.5 shrink-0">
                <Lightbulb className="h-5 w-5 text-cyan-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-sm text-cyan-400">Daily Tech Tip</span>
                  <Badge variant="outline" className="text-xs">{techTip.category}</Badge>
                </div>
                <p className="text-sm leading-relaxed">{techTip.tip}</p>
                <p className="text-xs text-muted-foreground mt-1">Source: {techTip.source}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Security Status Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Bitdefender Status - Always visible */}
        <Card className={`border-l-4 ${
          securityAlerts?.has_critical ? 'border-l-red-500 bg-red-500/5' :
          securityAlerts?.has_high ? 'border-l-orange-500 bg-orange-500/5' :
          securityAlerts?.total > 0 ? 'border-l-yellow-500 bg-yellow-500/5' :
          'border-l-emerald-500 bg-emerald-500/5'
        }`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-full ${
                  securityAlerts?.total > 0 ? 'bg-red-500/20' : 'bg-emerald-500/20'
                }`}>
                  <Shield className={`h-6 w-6 ${
                    securityAlerts?.total > 0 ? 'text-red-400' : 'text-emerald-400'
                  }`} />
                </div>
                <div>
                  <h3 className="font-semibold">Bitdefender Security</h3>
                  <p className={`text-sm ${
                    securityAlerts?.total > 0 ? 'text-red-400' : 'text-emerald-400'
                  }`}>
                    {securityAlerts?.total > 0 
                      ? `${securityAlerts.total} Active Alert${securityAlerts.total > 1 ? 's' : ''}`
                      : 'All Systems Protected'
                    }
                  </p>
                </div>
              </div>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => window.open('https://cloudgz.gravityzone.bitdefender.com/', '_blank')}
              >
                Open Console
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
            {/* Endpoint stats when no alerts */}
            {securityAlerts?.total === 0 && (
              <div className="mt-3 pt-3 border-t border-border">
                {securityAlerts?.endpoint_count > 0 ? (
                  <>
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-muted-foreground">Protected Endpoints</span>
                      <span className="font-medium text-emerald-400">{securityAlerts.endpoint_count}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Companies</span>
                      <span className="font-medium">{securityAlerts.company_count || 0}</span>
                    </div>
                    {securityAlerts.companies && securityAlerts.companies.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {securityAlerts.companies.slice(0, 3).map((company, idx) => (
                          <div key={company.id || idx} className="flex items-center gap-2 text-xs text-muted-foreground">
                            <div className={`w-2 h-2 rounded-full ${company.is_suspended ? 'bg-yellow-500' : 'bg-emerald-500'}`}></div>
                            <span className="truncate flex-1">{company.name}</span>
                            <span className="ml-auto opacity-70">{company.endpoints} endpoints</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Deploy latest update to see endpoint stats
                  </p>
                )}
              </div>
            )}
            {/* Alerts list when there are alerts */}
            {securityAlerts?.alerts && securityAlerts.alerts.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border space-y-2">
                {securityAlerts.alerts.slice(0, 3).map((alert, idx) => (
                  <div key={alert.id || idx} className="flex items-center gap-2 text-sm">
                    <ShieldAlert className="h-4 w-4 text-red-400" />
                    <span className="truncate">{alert.title}</span>
                    <Badge variant="outline" className="ml-auto text-xs">{alert.endpoint}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Server Health Summary */}
        <Card className={`border-l-4 ${
          offlineDevices.length > 0 ? 'border-l-red-500 bg-red-500/5' : 'border-l-emerald-500 bg-emerald-500/5'
        }`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-full ${
                  offlineDevices.length > 0 ? 'bg-red-500/20' : 'bg-emerald-500/20'
                }`}>
                  <Server className={`h-6 w-6 ${
                    offlineDevices.length > 0 ? 'text-red-400' : 'text-emerald-400'
                  }`} />
                </div>
                <div>
                  <h3 className="font-semibold">Server Health</h3>
                  <p className={`text-sm ${
                    offlineDevices.length > 0 ? 'text-red-400' : 'text-emerald-400'
                  }`}>
                    {offlineDevices.length > 0 
                      ? `${offlineDevices.length} Server${offlineDevices.length > 1 ? 's' : ''} Offline`
                      : `${stats?.servers_online || 0} Servers Online`
                    }
                  </p>
                </div>
              </div>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => navigate('/servers')}
              >
                View All
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
            {offlineDevices.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border space-y-2">
                {offlineDevices.slice(0, 3).map((server) => (
                  <div key={server.id} className="flex items-center gap-2 text-sm">
                    <WifiOff className="h-4 w-4 text-red-400" />
                    <span className="truncate">{server.hostname}</span>
                    <Badge variant="outline" className="ml-auto text-xs">{server.client_name}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Infrastructure Status Row - Show if there are infrastructure devices */}
      {infraStatus && infraStatus.total > 0 && (
        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Network className="h-5 w-5 text-purple-400" />
                Infrastructure Monitoring
              </CardTitle>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => navigate('/infrastructure')}
              >
                View Details
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {/* Device Status */}
              <div className="p-3 bg-muted rounded-lg text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <span className={`h-2 w-2 rounded-full ${infraStatus.online > 0 ? 'bg-emerald-400' : 'bg-gray-400'}`} />
                  <span className="text-xs text-muted-foreground">Devices</span>
                </div>
                <p className="text-xl font-bold">
                  <span className="text-emerald-400">{infraStatus.online}</span>
                  <span className="text-muted-foreground mx-1">/</span>
                  <span>{infraStatus.total}</span>
                </p>
              </div>

              {/* Proxmox Stats */}
              {infraStatus.by_type?.proxmox && (
                <>
                  <div className="p-3 bg-muted rounded-lg text-center">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <HardDrive className="h-4 w-4 text-purple-400" />
                      <span className="text-xs text-muted-foreground">Proxmox</span>
                    </div>
                    <p className="text-xl font-bold">
                      <span className={infraStatus.by_type.proxmox.online > 0 ? 'text-emerald-400' : 'text-red-400'}>
                        {infraStatus.by_type.proxmox.online}
                      </span>
                      <span className="text-muted-foreground mx-1">/</span>
                      <span>{infraStatus.by_type.proxmox.total}</span>
                    </p>
                  </div>
                </>
              )}

              {/* Network Devices */}
              {(infraStatus.by_type?.ping || infraStatus.by_type?.snmp) && (
                <div className="p-3 bg-muted rounded-lg text-center">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <Network className="h-4 w-4 text-cyan-400" />
                    <span className="text-xs text-muted-foreground">Network</span>
                  </div>
                  <p className="text-xl font-bold">
                    <span className="text-emerald-400">
                      {(infraStatus.by_type?.ping?.online || 0) + (infraStatus.by_type?.snmp?.online || 0)}
                    </span>
                    <span className="text-muted-foreground mx-1">/</span>
                    <span>
                      {(infraStatus.by_type?.ping?.total || 0) + (infraStatus.by_type?.snmp?.total || 0)}
                    </span>
                  </p>
                </div>
              )}

              {/* Aggregate VM/Container stats from Proxmox devices */}
              {infraStatus.devices && (() => {
                const proxmoxDevices = infraStatus.devices.filter(d => d.device_type === 'proxmox' && d.extra_data?.summary);
                const totalVms = proxmoxDevices.reduce((sum, d) => sum + (d.extra_data?.summary?.total_vms || 0), 0);
                const runningVms = proxmoxDevices.reduce((sum, d) => sum + (d.extra_data?.summary?.running_vms || 0), 0);
                const totalCts = proxmoxDevices.reduce((sum, d) => sum + (d.extra_data?.summary?.total_containers || 0), 0);
                const runningCts = proxmoxDevices.reduce((sum, d) => sum + (d.extra_data?.summary?.running_containers || 0), 0);
                
                if (totalVms === 0 && totalCts === 0) return null;
                
                return (
                  <>
                    {totalVms > 0 && (
                      <div className="p-3 bg-muted rounded-lg text-center">
                        <div className="flex items-center justify-center gap-2 mb-1">
                          <Monitor className="h-4 w-4 text-purple-400" />
                          <span className="text-xs text-muted-foreground">VMs</span>
                        </div>
                        <p className="text-xl font-bold">
                          <span className="text-emerald-400">{runningVms}</span>
                          <span className="text-muted-foreground mx-1">/</span>
                          <span>{totalVms}</span>
                        </p>
                      </div>
                    )}
                    {totalCts > 0 && (
                      <div className="p-3 bg-muted rounded-lg text-center">
                        <div className="flex items-center justify-center gap-2 mb-1">
                          <Container className="h-4 w-4 text-cyan-400" />
                          <span className="text-xs text-muted-foreground">Containers</span>
                        </div>
                        <p className="text-xl font-bold">
                          <span className="text-emerald-400">{runningCts}</span>
                          <span className="text-muted-foreground mx-1">/</span>
                          <span>{totalCts}</span>
                        </p>
                      </div>
                    )}
                  </>
                );
              })()}

              {/* Offline Alerts */}
              {infraStatus.offline > 0 && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-center">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <WifiOff className="h-4 w-4 text-red-400" />
                    <span className="text-xs text-red-400">Offline</span>
                  </div>
                  <p className="text-xl font-bold text-red-400">{infraStatus.offline}</p>
                </div>
              )}
            </div>

            {/* Show offline infrastructure devices if any */}
            {infraStatus.devices && infraStatus.devices.filter(d => d.status === 'offline').length > 0 && (
              <div className="mt-3 pt-3 border-t border-border">
                <div className="flex flex-wrap gap-2">
                  {infraStatus.devices
                    .filter(d => d.status === 'offline')
                    .slice(0, 5)
                    .map(device => (
                      <Badge key={device.id} className="bg-red-500/20 text-red-400">
                        <WifiOff className="h-3 w-3 mr-1" />
                        {device.name}
                      </Badge>
                    ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Backup Status Row */}
      {backupStats && backupStats.total_this_month > 0 && (
        <Card className={`border-l-4 ${backupStats.failed > 0 ? 'border-l-red-500 bg-red-500/5' : 'border-l-emerald-500 bg-emerald-500/5'}`} data-testid="dashboard-backup-stats">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-full ${backupStats.failed > 0 ? 'bg-red-500/20' : 'bg-emerald-500/20'}`}>
                  <HardDrive className={`h-6 w-6 ${backupStats.failed > 0 ? 'text-red-400' : 'text-emerald-400'}`} />
                </div>
                <div>
                  <h3 className="font-semibold">Backup Status (This Month)</h3>
                  <p className="text-sm text-muted-foreground">
                    {backupStats.successful} successful, {backupStats.failed} failed &middot; {backupStats.success_rate}% success rate &middot; {backupStats.total_storage_gb} GB total
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate('/backups')}>
                View All <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
            {backupStats.recent_failures?.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border space-y-1">
                {backupStats.recent_failures.slice(0, 3).map((f, idx) => (
                  <div key={f.id || idx} className="flex items-center gap-2 text-sm">
                    <XCircle className="h-4 w-4 text-red-400" />
                    <span>{f.client_name}</span>
                    <span className="text-muted-foreground ml-auto text-xs">{f.backup_date}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map((stat) => (
          <Card 
            key={stat.title}
            className="stat-card cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => navigate(stat.path)}
            data-testid={`stat-${stat.title.toLowerCase().replace(' ', '-')}`}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className={`p-2 rounded ${stat.bgColor}`}>
                  <stat.icon className={`h-5 w-5 ${stat.color}`} />
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold font-mono">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.title}</p>
              {stat.subtitle && (
                <p className="text-xs text-emerald-400 mt-1">{stat.subtitle}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Server Status */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg" style={{ fontFamily: 'Barlow Condensed' }}>SERVER STATUS</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate('/servers')}>
              View All <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-sm bg-emerald-500/10 border border-emerald-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <span className="status-dot status-online" />
                  <span className="text-sm text-emerald-400">Online</span>
                </div>
                <p className="text-3xl font-bold font-mono text-emerald-400">{stats?.servers_online || 0}</p>
              </div>
              <div className="p-4 rounded-sm bg-red-500/10 border border-red-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <span className="status-dot status-offline" />
                  <span className="text-sm text-red-400">Offline</span>
                </div>
                <p className="text-3xl font-bold font-mono text-red-400">{stats?.servers_offline || 0}</p>
              </div>
            </div>
            
            {stats?.open_incidents > 0 && (
              <div className="mt-4 p-4 rounded-sm bg-red-500/10 border border-red-500/20">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-red-400" />
                  <span className="text-red-400 font-medium">
                    {stats.open_incidents} active incident{stats.open_incidents > 1 ? 's' : ''} require attention
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg" style={{ fontFamily: 'Barlow Condensed' }}>QUICK ACTIONS</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button 
              variant="outline" 
              className="w-full justify-start" 
              onClick={() => navigate('/tasks')}
              data-testid="quick-new-task"
            >
              <ListTodo className="h-4 w-4 mr-2" />
              New Task
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-start" 
              onClick={() => navigate('/incidents')}
              data-testid="quick-new-incident"
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              Log Incident
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-start" 
              onClick={() => navigate('/maintenance')}
              data-testid="quick-new-maintenance"
            >
              <Wrench className="h-4 w-4 mr-2" />
              Schedule Maintenance
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-start" 
              onClick={() => navigate('/clients')}
              data-testid="quick-new-client"
            >
              <Building2 className="h-4 w-4 mr-2" />
              Add Client
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg" style={{ fontFamily: 'Barlow Condensed' }}>RECENT ACTIVITY</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[300px]">
            {activity.length === 0 ? (
              <div className="empty-state">
                <Activity className="h-12 w-12" />
                <p>No recent activity</p>
              </div>
            ) : (
              <div className="space-y-1">
                {activity.map((item, idx) => {
                  const Icon = getActivityIcon(item.type);
                  return (
                    <div key={idx} className="activity-item py-3">
                      <div className="flex items-start gap-3">
                        <Icon className="h-4 w-4 mt-0.5 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                            {getStatusBadge(item.status, item.severity)}
                            <span className="text-xs text-muted-foreground">
                              {item.timestamp ? new Date(item.timestamp).toLocaleString() : '-'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
