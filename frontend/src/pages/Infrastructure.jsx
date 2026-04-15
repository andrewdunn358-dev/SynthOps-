import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../App';
import { toast } from 'sonner';
import { getErrorMessage } from '../lib/errorHandler';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { Progress } from '../components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../components/ui/collapsible';
import { 
  Server, Router, Network, Plus, Edit, Trash2, RefreshCw, 
  CheckCircle, XCircle, Clock, Wifi, WifiOff, HardDrive, Activity,
  Cpu, MemoryStick, Database, Monitor, Container, ChevronDown, ChevronRight,
  Play, Square, Eye
} from 'lucide-react';

const DEVICE_TYPES = [
  { value: 'proxmox', label: 'Proxmox Server', icon: HardDrive, defaultPort: 8006 },
  { value: 'ping', label: 'Ping Monitor', icon: Wifi, defaultPort: null },
  { value: 'snmp', label: 'SNMP Device', icon: Router, defaultPort: 161 },
];

function formatBytes(bytes, decimals = 1) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

function formatUptime(seconds) {
  if (!seconds) return '-';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h`;
}

// Proxmox Detail Card Component
function ProxmoxDetailCard({ device, onRefresh, onDebug }) {
  const [expanded, setExpanded] = useState(true);
  const extraData = device.extra_data || {};
  const nodes = extraData.nodes || [];
  const summary = extraData.summary || {};
  const version = extraData.version || {};
  const errors = extraData.errors || [];

  if (!nodes.length && device.status !== 'online') {
    return (
      <Card className="border-dashed">
        <CardContent className="p-6 text-center text-muted-foreground">
          <HardDrive className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>No data available. Device may be offline or credentials not configured.</p>
          <div className="flex gap-2 justify-center mt-2">
            <Button variant="outline" size="sm" onClick={() => onRefresh(device)}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Check Status
            </Button>
            <Button variant="outline" size="sm" onClick={() => onDebug(device)}>
              <Eye className="h-4 w-4 mr-2" />
              Debug API
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-l-4 border-l-purple-500">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-purple-500/20">
              <HardDrive className="h-6 w-6 text-purple-400" />
            </div>
            <div>
              <CardTitle className="text-lg">{device.name}</CardTitle>
              <CardDescription className="font-mono text-xs">
                {device.ip_address}:{device.port || 8006}
                {version.version && <span className="ml-2">• Proxmox VE {version.version}</span>}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={device.status === 'online' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}>
              {device.status === 'online' ? <CheckCircle className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
              {device.status}
            </Badge>
            <Button variant="ghost" size="sm" onClick={() => onDebug(device)} title="Debug API">
              <Eye className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onRefresh(device)}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Show API errors if any */}
        {errors.length > 0 && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-sm font-medium text-red-400 mb-2">API Errors:</p>
            {errors.map((err, idx) => (
              <p key={idx} className="text-xs text-red-300 font-mono">{err}</p>
            ))}
          </div>
        )}
        {/* Summary Stats */}
        {summary.total_nodes > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="p-3 bg-muted rounded-lg text-center">
              <Server className="h-4 w-4 mx-auto mb-1 text-blue-400" />
              <p className="text-xl font-bold">{summary.total_nodes}</p>
              <p className="text-xs text-muted-foreground">Nodes</p>
            </div>
            <div className="p-3 bg-muted rounded-lg text-center">
              <Monitor className="h-4 w-4 mx-auto mb-1 text-purple-400" />
              <p className="text-xl font-bold">{summary.running_vms}/{summary.total_vms}</p>
              <p className="text-xs text-muted-foreground">VMs Running</p>
            </div>
            <div className="p-3 bg-muted rounded-lg text-center">
              <Container className="h-4 w-4 mx-auto mb-1 text-cyan-400" />
              <p className="text-xl font-bold">{summary.running_containers}/{summary.total_containers}</p>
              <p className="text-xs text-muted-foreground">Containers</p>
            </div>
            <div className="p-3 bg-muted rounded-lg text-center">
              <Cpu className="h-4 w-4 mx-auto mb-1 text-orange-400" />
              <p className="text-xl font-bold">{nodes.reduce((sum, n) => sum + (n.maxcpu || 0), 0)}</p>
              <p className="text-xs text-muted-foreground">Total CPUs</p>
            </div>
            <div className="p-3 bg-muted rounded-lg text-center">
              <MemoryStick className="h-4 w-4 mx-auto mb-1 text-emerald-400" />
              <p className="text-xl font-bold">{formatBytes(nodes.reduce((sum, n) => sum + (n.maxmem || 0), 0))}</p>
              <p className="text-xs text-muted-foreground">Total RAM</p>
            </div>
          </div>
        )}

        {/* Nodes */}
        {nodes.map((node, idx) => (
          <Collapsible key={idx} defaultOpen={true}>
            <Card className="bg-muted/50">
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-muted/80 transition-colors py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <ChevronDown className="h-4 w-4 text-muted-foreground collapsible-chevron" />
                      <Server className="h-5 w-5 text-blue-400" />
                      <div>
                        <span className="font-medium">{node.name}</span>
                        <span className={`ml-2 text-xs ${node.status === 'online' ? 'text-emerald-400' : 'text-red-400'}`}>
                          • {node.status}
                        </span>
                        {node.uptime && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            • Uptime: {formatUptime(node.uptime)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-1" title="CPU Usage">
                        <Cpu className="h-4 w-4 text-orange-400" />
                        <span className={node.cpu > 80 ? 'text-red-400' : ''}>{node.cpu}%</span>
                      </div>
                      <div className="flex items-center gap-1" title="RAM Usage">
                        <MemoryStick className="h-4 w-4 text-emerald-400" />
                        <span className={node.mem_percent > 80 ? 'text-red-400' : ''}>{node.mem_percent}%</span>
                      </div>
                    </div>
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0 space-y-4">
                  {/* Resource Bars */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>CPU ({node.maxcpu} cores)</span>
                        <span className={node.cpu > 80 ? 'text-red-400' : ''}>{node.cpu}%</span>
                      </div>
                      <Progress value={node.cpu} className="h-2" />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>Memory ({formatBytes(node.maxmem)})</span>
                        <span className={node.mem_percent > 80 ? 'text-red-400' : ''}>{node.mem_percent}%</span>
                      </div>
                      <Progress value={node.mem_percent} className="h-2" />
                    </div>
                    {node.maxdisk && (
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span>Root Disk ({formatBytes(node.maxdisk)})</span>
                          <span>{Math.round((node.disk / node.maxdisk) * 100)}%</span>
                        </div>
                        <Progress value={(node.disk / node.maxdisk) * 100} className="h-2" />
                      </div>
                    )}
                  </div>

                  {/* VMs Table */}
                  {node.vms && node.vms.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                        <Monitor className="h-4 w-4 text-purple-400" />
                        Virtual Machines ({node.vms.length})
                      </h4>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-16">VMID</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead className="w-24">Status</TableHead>
                            <TableHead className="w-20">CPU</TableHead>
                            <TableHead className="w-28">Memory</TableHead>
                            <TableHead className="w-24">Uptime</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {node.vms.map((vm) => (
                            <TableRow key={vm.vmid}>
                              <TableCell className="font-mono text-xs">{vm.vmid}</TableCell>
                              <TableCell className="font-medium">{vm.name || `VM ${vm.vmid}`}</TableCell>
                              <TableCell>
                                <Badge className={
                                  vm.status === 'running' ? 'bg-emerald-500/20 text-emerald-400' :
                                  vm.status === 'stopped' ? 'bg-gray-500/20 text-gray-400' :
                                  'bg-yellow-500/20 text-yellow-400'
                                }>
                                  {vm.status === 'running' ? <Play className="h-3 w-3 mr-1" /> : <Square className="h-3 w-3 mr-1" />}
                                  {vm.status}
                                </Badge>
                              </TableCell>
                              <TableCell>{vm.cpu}%</TableCell>
                              <TableCell>
                                {formatBytes(vm.mem)} / {formatBytes(vm.maxmem)}
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {formatUptime(vm.uptime)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  {/* Containers Table */}
                  {node.containers && node.containers.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                        <Container className="h-4 w-4 text-cyan-400" />
                        LXC Containers ({node.containers.length})
                      </h4>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-16">CTID</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead className="w-24">Status</TableHead>
                            <TableHead className="w-20">CPU</TableHead>
                            <TableHead className="w-28">Memory</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {node.containers.map((ct) => (
                            <TableRow key={ct.vmid}>
                              <TableCell className="font-mono text-xs">{ct.vmid}</TableCell>
                              <TableCell className="font-medium">{ct.name || `CT ${ct.vmid}`}</TableCell>
                              <TableCell>
                                <Badge className={
                                  ct.status === 'running' ? 'bg-emerald-500/20 text-emerald-400' :
                                  ct.status === 'stopped' ? 'bg-gray-500/20 text-gray-400' :
                                  'bg-yellow-500/20 text-yellow-400'
                                }>
                                  {ct.status === 'running' ? <Play className="h-3 w-3 mr-1" /> : <Square className="h-3 w-3 mr-1" />}
                                  {ct.status}
                                </Badge>
                              </TableCell>
                              <TableCell>{ct.cpu}%</TableCell>
                              <TableCell>
                                {formatBytes(ct.mem)} / {formatBytes(ct.maxmem)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        ))}
      </CardContent>
    </Card>
  );
}

export default function Infrastructure() {
  const navigate = useNavigate();
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [form, setForm] = useState({
    name: '',
    device_type: 'ping',
    ip_address: '',
    port: '',
    location: '',
    description: '',
    api_token_id: '',
    api_token_secret: '',
    snmp_community: 'public',
    snmp_version: '2c',
    check_interval: 60,
    is_active: true
  });

  useEffect(() => {
    fetchDevices();
  }, []);

  const fetchDevices = async () => {
    try {
      const res = await apiClient.get('/infrastructure/devices');
      setDevices(res.data);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to load devices'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // Prepare form data - convert empty strings to null for optional integer fields
      const submitData = {
        ...form,
        port: form.port === '' ? null : parseInt(form.port) || null,
      };
      
      if (editingDevice) {
        await apiClient.put(`/infrastructure/devices/${editingDevice.id}`, submitData);
        toast.success('Device updated');
      } else {
        await apiClient.post('/infrastructure/devices', submitData);
        toast.success('Device added');
      }
      setDialogOpen(false);
      resetForm();
      fetchDevices();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to save device'));
    }
  };

  const handleDelete = async (device) => {
    if (!confirm(`Delete ${device.name}?`)) return;
    try {
      await apiClient.delete(`/infrastructure/devices/${device.id}`);
      toast.success('Device deleted');
      fetchDevices();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to delete device'));
    }
  };

  const handleCheck = async (device) => {
    try {
      toast.info(`Checking ${device.name}...`);
      const res = await apiClient.post(`/infrastructure/devices/${device.id}/check`);
      toast.success(`${device.name}: ${res.data.status}`);
      fetchDevices();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Check failed'));
    }
  };

  const handleCheckAll = async () => {
    setChecking(true);
    try {
      const res = await apiClient.post('/infrastructure/check-all');
      toast.success(`Checked ${res.data.online + res.data.offline} devices: ${res.data.online} online, ${res.data.offline} offline`);
      fetchDevices();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Check failed'));
    } finally {
      setChecking(false);
    }
  };

  const [debugDialogOpen, setDebugDialogOpen] = useState(false);
  const [debugData, setDebugData] = useState(null);
  const [debugLoading, setDebugLoading] = useState(false);

  const handleDebug = async (device) => {
    setDebugLoading(true);
    setDebugDialogOpen(true);
    setDebugData(null);
    try {
      const res = await apiClient.get(`/infrastructure/devices/${device.id}/debug`);
      setDebugData(res.data);
    } catch (error) {
      setDebugData({ error: getErrorMessage(error, 'Debug request failed') });
    } finally {
      setDebugLoading(false);
    }
  };

  const openEditDialog = (device) => {
    setEditingDevice(device);
    setForm({
      name: device.name,
      device_type: device.device_type,
      ip_address: device.ip_address,
      port: device.port || '',
      location: device.location || '',
      description: device.description || '',
      api_token_id: '',
      api_token_secret: '',
      snmp_community: '',
      snmp_version: '2c',
      check_interval: device.check_interval || 60,
      is_active: device.is_active
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setEditingDevice(null);
    setForm({
      name: '',
      device_type: 'ping',
      ip_address: '',
      port: '',
      location: '',
      description: '',
      api_token_id: '',
      api_token_secret: '',
      snmp_community: 'public',
      snmp_version: '2c',
      check_interval: 60,
      is_active: true
    });
  };

  const getStatusBadge = (status) => {
    if (status === 'online') {
      return <Badge className="bg-emerald-500/20 text-emerald-400"><CheckCircle className="h-3 w-3 mr-1" /> Online</Badge>;
    } else if (status === 'offline') {
      return <Badge className="bg-red-500/20 text-red-400"><XCircle className="h-3 w-3 mr-1" /> Offline</Badge>;
    }
    return <Badge className="bg-gray-500/20 text-gray-400"><Clock className="h-3 w-3 mr-1" /> Unknown</Badge>;
  };

  const getDeviceIcon = (type) => {
    const deviceType = DEVICE_TYPES.find(t => t.value === type);
    const Icon = deviceType?.icon || Server;
    return <Icon className="h-5 w-5 text-muted-foreground" />;
  };

  // Categorize devices
  const proxmoxDevices = devices.filter(d => d.device_type === 'proxmox');
  const pingDevices = devices.filter(d => d.device_type === 'ping');
  const snmpDevices = devices.filter(d => d.device_type === 'snmp');

  // Summary stats
  const total = devices.length;
  const online = devices.filter(d => d.status === 'online').length;
  const offline = devices.filter(d => d.status === 'offline').length;

  // Proxmox summary
  const proxmoxSummary = proxmoxDevices.reduce((acc, d) => {
    const summary = d.extra_data?.summary || {};
    acc.vms += summary.total_vms || 0;
    acc.runningVms += summary.running_vms || 0;
    acc.containers += summary.total_containers || 0;
    acc.runningContainers += summary.running_containers || 0;
    return acc;
  }, { vms: 0, runningVms: 0, containers: 0, runningContainers: 0 });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="infrastructure-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2" style={{ fontFamily: 'Barlow Condensed' }}>
            <Network className="h-8 w-8 text-primary" />
            INFRASTRUCTURE MONITORING
          </h1>
          <p className="text-muted-foreground mt-1">
            Monitor Proxmox hosts, routers, and other network devices
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleCheckAll} disabled={checking} data-testid="check-all-btn">
            <RefreshCw className={`h-4 w-4 mr-2 ${checking ? 'animate-spin' : ''}`} />
            Check All
          </Button>
          <Button onClick={() => { resetForm(); setDialogOpen(true); }} data-testid="add-device-btn">
            <Plus className="h-4 w-4 mr-2" />
            Add Device
          </Button>
        </div>
      </div>

      {/* Status Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-full bg-blue-500/20">
              <Server className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{total}</p>
              <p className="text-xs text-muted-foreground">Total Devices</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-full bg-emerald-500/20">
              <Wifi className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-emerald-400">{online}</p>
              <p className="text-xs text-muted-foreground">Online</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-full bg-red-500/20">
              <WifiOff className="h-5 w-5 text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-400">{offline}</p>
              <p className="text-xs text-muted-foreground">Offline</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-full bg-purple-500/20">
              <HardDrive className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{proxmoxDevices.length}</p>
              <p className="text-xs text-muted-foreground">Proxmox Hosts</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-full bg-purple-500/20">
              <Monitor className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{proxmoxSummary.runningVms}/{proxmoxSummary.vms}</p>
              <p className="text-xs text-muted-foreground">VMs Running</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-full bg-cyan-500/20">
              <Container className="h-5 w-5 text-cyan-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{proxmoxSummary.runningContainers}/{proxmoxSummary.containers}</p>
              <p className="text-xs text-muted-foreground">Containers</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for different views */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="proxmox">Proxmox ({proxmoxDevices.length})</TabsTrigger>
          <TabsTrigger value="network">Network Devices ({pingDevices.length + snmpDevices.length})</TabsTrigger>
          <TabsTrigger value="all">All Devices</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Proxmox Section */}
          {proxmoxDevices.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <HardDrive className="h-5 w-5 text-purple-400" />
                Proxmox Servers
              </h2>
              {proxmoxDevices.map(device => (
                <ProxmoxDetailCard key={device.id} device={device} onRefresh={handleCheck} onDebug={handleDebug} />
              ))}
            </div>
          )}

          {/* Network Devices Section */}
          {(pingDevices.length > 0 || snmpDevices.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Router className="h-5 w-5 text-cyan-400" />
                  Network Devices
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Device</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>IP Address</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Response</TableHead>
                      <TableHead>Last Check</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...pingDevices, ...snmpDevices].map((device) => (
                      <TableRow key={device.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getDeviceIcon(device.device_type)}
                            <span className="font-medium">{device.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {device.device_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {device.ip_address}
                          {device.port && <span className="text-muted-foreground">:{device.port}</span>}
                        </TableCell>
                        <TableCell>{device.location || '-'}</TableCell>
                        <TableCell>{getStatusBadge(device.status)}</TableCell>
                        <TableCell>
                          {device.response_time_ms ? `${device.response_time_ms}ms` : '-'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {device.last_check 
                            ? new Date(device.last_check).toLocaleString()
                            : 'Never'}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" onClick={() => handleCheck(device)}>
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => openEditDialog(device)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" className="text-red-400" onClick={() => handleDelete(device)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {devices.length === 0 && (
            <Card>
              <CardContent className="p-12 text-center">
                <Network className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-xl font-semibold mb-2">No Devices Configured</h3>
                <p className="text-muted-foreground mb-4">
                  Add your first infrastructure device to start monitoring
                </p>
                <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Device
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Proxmox Tab */}
        <TabsContent value="proxmox" className="space-y-4">
          {proxmoxDevices.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <HardDrive className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-xl font-semibold mb-2">No Proxmox Servers</h3>
                <p className="text-muted-foreground mb-4">
                  Add a Proxmox server to monitor VMs and containers
                </p>
                <Button onClick={() => { 
                  resetForm(); 
                  setForm(prev => ({ ...prev, device_type: 'proxmox', port: 8006 }));
                  setDialogOpen(true); 
                }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Proxmox Server
                </Button>
              </CardContent>
            </Card>
          ) : (
            proxmoxDevices.map(device => (
              <ProxmoxDetailCard key={device.id} device={device} onRefresh={handleCheck} />
            ))
          )}
        </TabsContent>

        {/* Network Tab */}
        <TabsContent value="network">
          <Card>
            <CardHeader>
              <CardTitle>Network Devices</CardTitle>
              <CardDescription>
                Ping monitors and SNMP devices
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pingDevices.length === 0 && snmpDevices.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Router className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No network devices configured</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Device</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>IP Address</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Response</TableHead>
                      <TableHead>Last Check</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...pingDevices, ...snmpDevices].map((device) => (
                      <TableRow key={device.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getDeviceIcon(device.device_type)}
                            <span className="font-medium">{device.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {device.device_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {device.ip_address}
                          {device.port && <span className="text-muted-foreground">:{device.port}</span>}
                        </TableCell>
                        <TableCell>{device.location || '-'}</TableCell>
                        <TableCell>{getStatusBadge(device.status)}</TableCell>
                        <TableCell>
                          {device.response_time_ms ? `${device.response_time_ms}ms` : '-'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {device.last_check 
                            ? new Date(device.last_check).toLocaleString()
                            : 'Never'}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" onClick={() => handleCheck(device)}>
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => openEditDialog(device)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" className="text-red-400" onClick={() => handleDelete(device)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* All Devices Tab */}
        <TabsContent value="all">
          <Card>
            <CardHeader>
              <CardTitle>All Monitored Devices</CardTitle>
            </CardHeader>
            <CardContent>
              {devices.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Network className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No devices configured</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Device</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>IP Address</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Response</TableHead>
                      <TableHead>Last Check</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {devices.map((device) => (
                      <TableRow key={device.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getDeviceIcon(device.device_type)}
                            <span className="font-medium">{device.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {device.device_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {device.ip_address}
                          {device.port && <span className="text-muted-foreground">:{device.port}</span>}
                        </TableCell>
                        <TableCell>{device.location || '-'}</TableCell>
                        <TableCell>{getStatusBadge(device.status)}</TableCell>
                        <TableCell>
                          {device.response_time_ms ? `${device.response_time_ms}ms` : '-'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {device.last_check 
                            ? new Date(device.last_check).toLocaleString()
                            : 'Never'}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" onClick={() => handleCheck(device)}>
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => openEditDialog(device)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" className="text-red-400" onClick={() => handleDelete(device)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingDevice ? 'Edit Device' : 'Add Device'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Device Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g., Proxmox-01"
                  required
                  data-testid="device-name-input"
                />
              </div>
              <div>
                <Label>Device Type</Label>
                <Select value={form.device_type} onValueChange={(v) => {
                  const type = DEVICE_TYPES.find(t => t.value === v);
                  setForm({ ...form, device_type: v, port: type?.defaultPort || '' });
                }}>
                  <SelectTrigger data-testid="device-type-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEVICE_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>IP Address / Hostname</Label>
                <Input
                  value={form.ip_address}
                  onChange={(e) => setForm({ ...form, ip_address: e.target.value })}
                  placeholder="192.168.1.1"
                  required
                  data-testid="device-ip-input"
                />
              </div>
              <div>
                <Label>Port (optional)</Label>
                <Input
                  type="number"
                  value={form.port}
                  onChange={(e) => setForm({ ...form, port: e.target.value })}
                  placeholder={form.device_type === 'proxmox' ? '8006' : form.device_type === 'snmp' ? '161' : ''}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Location</Label>
                <Input
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="e.g., Main Office"
                />
              </div>
              <div>
                <Label>Check Interval (seconds)</Label>
                <Input
                  type="number"
                  value={form.check_interval}
                  onChange={(e) => setForm({ ...form, check_interval: parseInt(e.target.value) || 60 })}
                  min={10}
                />
              </div>
            </div>

            {/* Proxmox specific fields */}
            {form.device_type === 'proxmox' && (
              <div className="space-y-4 p-4 bg-muted rounded-lg">
                <p className="text-sm font-medium">Proxmox API Credentials</p>
                <div>
                  <Label>API Token ID</Label>
                  <Input
                    value={form.api_token_id}
                    onChange={(e) => setForm({ ...form, api_token_id: e.target.value })}
                    placeholder="user@pam!tokenname"
                    data-testid="proxmox-token-id"
                  />
                </div>
                <div>
                  <Label>API Token Secret</Label>
                  <Input
                    type="password"
                    value={form.api_token_secret}
                    onChange={(e) => setForm({ ...form, api_token_secret: e.target.value })}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    data-testid="proxmox-token-secret"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Create token in Proxmox: Datacenter → Permissions → API Tokens
                </p>
              </div>
            )}

            {/* SNMP specific fields */}
            {form.device_type === 'snmp' && (
              <div className="space-y-4 p-4 bg-muted rounded-lg">
                <p className="text-sm font-medium">SNMP Settings</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Community String</Label>
                    <Input
                      value={form.snmp_community}
                      onChange={(e) => setForm({ ...form, snmp_community: e.target.value })}
                      placeholder="public"
                    />
                  </div>
                  <div>
                    <Label>Version</Label>
                    <Select value={form.snmp_version} onValueChange={(v) => setForm({ ...form, snmp_version: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">v1</SelectItem>
                        <SelectItem value="2c">v2c</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            <div>
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional notes about this device"
                rows={2}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" data-testid="save-device-btn">
                {editingDevice ? 'Update' : 'Add Device'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Debug Dialog */}
      <Dialog open={debugDialogOpen} onOpenChange={setDebugDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Proxmox API Debug</DialogTitle>
          </DialogHeader>
          {debugLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : debugData ? (
            <div className="space-y-4">
              {debugData.error ? (
                <div className="p-4 bg-red-500/10 rounded-lg text-red-400">
                  {debugData.error}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Device</p>
                      <p className="font-medium">{debugData.device_name}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Endpoint</p>
                      <p className="font-mono text-sm">{debugData.ip_address}:{debugData.port}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Token ID</p>
                    <p className="font-mono text-xs bg-muted p-2 rounded">{debugData.token_id}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-2">API Call Results:</p>
                    <div className="space-y-3">
                      {debugData.api_calls?.map((call, idx) => (
                        <div key={idx} className="border rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <code className="text-sm font-medium">{call.endpoint}</code>
                            {call.error ? (
                              <Badge className="bg-red-500/20 text-red-400">Error</Badge>
                            ) : (
                              <Badge className={call.status_code === 200 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-yellow-500/20 text-yellow-400'}>
                                {call.status_code}
                              </Badge>
                            )}
                          </div>
                          <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-48 overflow-y-auto">
                            {call.error || JSON.stringify(call.response, null, 2)}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </div>
                  {debugData.connection_error && (
                    <div className="p-4 bg-red-500/10 rounded-lg">
                      <p className="text-sm font-medium text-red-400">Connection Error:</p>
                      <p className="text-xs font-mono text-red-300">{debugData.connection_error}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDebugDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
