import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../App';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { ScrollArea } from '../components/ui/scroll-area';
import { 
  Building2, Server, ListTodo, FolderKanban, AlertTriangle, 
  Activity, ArrowRight, CheckCircle, Clock, AlertCircle,
  RefreshCw, Wrench, WifiOff, X, Bell, Ticket
} from 'lucide-react';

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [offlineDevices, setOfflineDevices] = useState([]);
  const [dismissedAlerts, setDismissedAlerts] = useState([]);
  const [ticketStats, setTicketStats] = useState(null);

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
      
      // Try to get ticket stats
      try {
        const ticketRes = await apiClient.get('/zammad/stats');
        setTicketStats(ticketRes.data);
      } catch (e) {
        // Zammad not configured
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

      {/* Open Tickets Alert */}
      {ticketStats && ticketStats.open > 0 && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Ticket className="h-5 w-5 text-amber-400" />
                <span className="font-medium">
                  {ticketStats.open} open ticket{ticketStats.open > 1 ? 's' : ''} in Zammad
                </span>
              </div>
              <Button size="sm" variant="outline" onClick={() => navigate('/tickets')}>
                View Tickets
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
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
