import React, { useState, useEffect } from 'react';
import { apiClient } from '../App';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { 
  BarChart3, Server, Laptop, Monitor, Download, RefreshCw,
  CheckCircle, XCircle, AlertTriangle, Clock, Building2,
  HardDrive, Cpu, Wifi, WifiOff
} from 'lucide-react';

export default function Reports() {
  const [loading, setLoading] = useState(true);
  const [servers, setServers] = useState([]);
  const [clients, setClients] = useState([]);
  const [reportType, setReportType] = useState('overview');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [serversRes, clientsRes] = await Promise.all([
        apiClient.get('/servers'),
        apiClient.get('/clients')
      ]);
      setServers(serversRes.data || []);
      setClients(clientsRes.data || []);
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // Calculate statistics
  const totalDevices = servers.length;
  const serverCount = servers.filter(s => s.server_type === 'server').length;
  const workstationCount = servers.filter(s => s.server_type === 'workstation').length;
  const onlineCount = servers.filter(s => s.status === 'online').length;
  const offlineCount = servers.filter(s => s.status === 'offline').length;
  const maintenanceCount = servers.filter(s => s.status === 'maintenance').length;

  // OS breakdown
  const osBreakdown = servers.reduce((acc, s) => {
    let os = s.operating_system || 'Unknown';
    // Simplify OS names
    if (os.includes('Windows 11')) os = 'Windows 11';
    else if (os.includes('Windows 10')) os = 'Windows 10';
    else if (os.includes('Server 2022')) os = 'Windows Server 2022';
    else if (os.includes('Server 2019')) os = 'Windows Server 2019';
    else if (os.includes('Server 2016')) os = 'Windows Server 2016';
    else if (os.includes('Server 2012')) os = 'Windows Server 2012';
    else if (os.includes('macOS') || os.includes('Mac OS')) os = 'macOS';
    else if (os.includes('Linux') || os.includes('Ubuntu') || os.includes('CentOS')) os = 'Linux';
    else if (os.length > 30) os = os.substring(0, 30) + '...';
    
    acc[os] = (acc[os] || 0) + 1;
    return acc;
  }, {});

  // Sort OS by count
  const sortedOsBreakdown = Object.entries(osBreakdown)
    .sort((a, b) => b[1] - a[1]);

  // Device type breakdown (laptops vs desktops)
  const laptopCount = servers.filter(s => 
    s.hostname?.toLowerCase().includes('laptop') || 
    s.hostname?.toLowerCase().includes('lt') ||
    s.hostname?.toLowerCase().includes('nb') ||
    s.hostname?.toLowerCase().includes('book')
  ).length;
  const desktopCount = workstationCount - laptopCount;

  // Client breakdown
  const clientDeviceCounts = clients.map(c => ({
    name: c.name,
    code: c.code,
    serverCount: servers.filter(s => s.client_name === c.name && s.server_type === 'server').length,
    workstationCount: servers.filter(s => s.client_name === c.name && s.server_type === 'workstation').length,
    onlineCount: servers.filter(s => s.client_name === c.name && s.status === 'online').length,
    offlineCount: servers.filter(s => s.client_name === c.name && s.status === 'offline').length,
    total: servers.filter(s => s.client_name === c.name).length
  })).filter(c => c.total > 0).sort((a, b) => b.total - a.total);

  // Offline devices by client
  const offlineDevices = servers.filter(s => s.status === 'offline');

  // Stale devices (not seen in 30+ days) - we'd need last_seen field from TRMM
  const staleDevices = servers.filter(s => {
    // For now, mark offline devices as potentially stale
    return s.status === 'offline';
  });

  const exportReport = () => {
    let url = '';
    switch (reportType) {
      case 'servers':
        url = `${process.env.REACT_APP_BACKEND_URL}/api/export/servers`;
        break;
      case 'clients':
        url = `${process.env.REACT_APP_BACKEND_URL}/api/export/clients`;
        break;
      default:
        url = `${process.env.REACT_APP_BACKEND_URL}/api/export/servers`;
    }
    window.open(url, '_blank');
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="grid grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-32 bg-muted rounded animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="reports-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Barlow Condensed' }}>
            REPORTS
          </h1>
          <p className="text-muted-foreground">Infrastructure analytics and insights</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={reportType} onValueChange={setReportType}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="overview">Overview</SelectItem>
              <SelectItem value="servers">Servers</SelectItem>
              <SelectItem value="clients">By Client</SelectItem>
              <SelectItem value="offline">Offline Devices</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={exportReport}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <Monitor className="h-8 w-8 mx-auto mb-2 text-primary" />
            <p className="text-3xl font-bold">{totalDevices}</p>
            <p className="text-sm text-muted-foreground">Total Devices</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Server className="h-8 w-8 mx-auto mb-2 text-blue-400" />
            <p className="text-3xl font-bold">{serverCount}</p>
            <p className="text-sm text-muted-foreground">Servers</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Laptop className="h-8 w-8 mx-auto mb-2 text-purple-400" />
            <p className="text-3xl font-bold">{workstationCount}</p>
            <p className="text-sm text-muted-foreground">Workstations</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <CheckCircle className="h-8 w-8 mx-auto mb-2 text-emerald-400" />
            <p className="text-3xl font-bold">{onlineCount}</p>
            <p className="text-sm text-muted-foreground">Online</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <XCircle className="h-8 w-8 mx-auto mb-2 text-red-400" />
            <p className="text-3xl font-bold">{offlineCount}</p>
            <p className="text-sm text-muted-foreground">Offline</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-amber-400" />
            <p className="text-3xl font-bold">{maintenanceCount}</p>
            <p className="text-sm text-muted-foreground">Maintenance</p>
          </CardContent>
        </Card>
      </div>

      {/* Health Bar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Fleet Health</CardTitle>
          <CardDescription>
            {onlineCount} of {totalDevices} devices online ({totalDevices > 0 ? Math.round((onlineCount / totalDevices) * 100) : 0}%)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Progress value={totalDevices > 0 ? (onlineCount / totalDevices) * 100 : 0} className="h-4" />
          <div className="flex justify-between mt-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-emerald-500" />
              Online: {onlineCount}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-red-500" />
              Offline: {offlineCount}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-amber-500" />
              Maintenance: {maintenanceCount}
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* OS Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Operating Systems</CardTitle>
            <CardDescription>Device count by OS version</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {sortedOsBreakdown.slice(0, 10).map(([os, count]) => (
                <div key={os} className="flex items-center justify-between">
                  <span className="text-sm font-medium truncate max-w-[200px]">{os}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary rounded-full" 
                        style={{ width: `${(count / totalDevices) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-mono w-12 text-right">{count}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Device Types */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Device Types</CardTitle>
            <CardDescription>Breakdown by device category</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded">
                <div className="flex items-center gap-3">
                  <Server className="h-5 w-5 text-blue-400" />
                  <span>Servers</span>
                </div>
                <Badge variant="outline" className="font-mono">{serverCount}</Badge>
              </div>
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded">
                <div className="flex items-center gap-3">
                  <Laptop className="h-5 w-5 text-purple-400" />
                  <span>Laptops (estimated)</span>
                </div>
                <Badge variant="outline" className="font-mono">{laptopCount}</Badge>
              </div>
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded">
                <div className="flex items-center gap-3">
                  <Monitor className="h-5 w-5 text-cyan-400" />
                  <span>Desktops (estimated)</span>
                </div>
                <Badge variant="outline" className="font-mono">{desktopCount}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Client Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Devices by Client</CardTitle>
          <CardDescription>Infrastructure summary per client</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead className="text-center">Servers</TableHead>
                <TableHead className="text-center">Workstations</TableHead>
                <TableHead className="text-center">Total</TableHead>
                <TableHead className="text-center">Online</TableHead>
                <TableHead className="text-center">Offline</TableHead>
                <TableHead className="text-center">Health</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientDeviceCounts.slice(0, 20).map((client) => (
                <TableRow key={client.code}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{client.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center font-mono">{client.serverCount}</TableCell>
                  <TableCell className="text-center font-mono">{client.workstationCount}</TableCell>
                  <TableCell className="text-center font-mono font-bold">{client.total}</TableCell>
                  <TableCell className="text-center">
                    <Badge className="bg-emerald-500/20 text-emerald-400">{client.onlineCount}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    {client.offlineCount > 0 ? (
                      <Badge className="bg-red-500/20 text-red-400">{client.offlineCount}</Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="w-16 h-2 bg-muted rounded-full overflow-hidden mx-auto">
                      <div 
                        className={`h-full rounded-full ${
                          client.total > 0 && (client.onlineCount / client.total) > 0.8 
                            ? 'bg-emerald-500' 
                            : (client.onlineCount / client.total) > 0.5 
                              ? 'bg-amber-500' 
                              : 'bg-red-500'
                        }`}
                        style={{ width: `${client.total > 0 ? (client.onlineCount / client.total) * 100 : 0}%` }}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Offline Devices Alert */}
      {offlineDevices.length > 0 && (
        <Card className="border-red-500/30">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <WifiOff className="h-5 w-5 text-red-400" />
              Offline Devices ({offlineDevices.length})
            </CardTitle>
            <CardDescription>Devices currently not responding</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-[300px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hostname</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>OS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {offlineDevices.slice(0, 50).map((device) => (
                    <TableRow key={device.id}>
                      <TableCell className="font-mono">{device.hostname}</TableCell>
                      <TableCell>{device.client_name || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">{device.server_type}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {device.operating_system?.split(',')[0] || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
