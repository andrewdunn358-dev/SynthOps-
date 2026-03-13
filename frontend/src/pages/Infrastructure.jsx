import React, { useState, useEffect } from 'react';
import { apiClient } from '../App';
import { toast } from 'sonner';
import { getErrorMessage } from '../lib/errorHandler';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
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
  Server, Router, Network, Plus, Edit, Trash2, RefreshCw, 
  CheckCircle, XCircle, Clock, Wifi, WifiOff, HardDrive, Activity
} from 'lucide-react';

const DEVICE_TYPES = [
  { value: 'proxmox', label: 'Proxmox Server', icon: HardDrive, defaultPort: 8006 },
  { value: 'ping', label: 'Ping Monitor', icon: Wifi, defaultPort: null },
  { value: 'snmp', label: 'SNMP Device', icon: Router, defaultPort: 161 },
];

export default function Infrastructure() {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState(null);
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
      if (editingDevice) {
        await apiClient.put(`/infrastructure/devices/${editingDevice.id}`, form);
        toast.success('Device updated');
      } else {
        await apiClient.post('/infrastructure/devices', form);
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

  // Summary stats
  const total = devices.length;
  const online = devices.filter(d => d.status === 'online').length;
  const offline = devices.filter(d => d.status === 'offline').length;

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
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Network className="h-8 w-8 text-primary" />
            Infrastructure Monitoring
          </h1>
          <p className="text-muted-foreground mt-1">
            Monitor Proxmox hosts, routers, and other network devices
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleCheckAll} disabled={checking}>
            <RefreshCw className={`h-4 w-4 mr-2 ${checking ? 'animate-spin' : ''}`} />
            Check All
          </Button>
          <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Add Device
          </Button>
        </div>
      </div>

      {/* Status Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-full bg-blue-500/20">
              <Server className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{total}</p>
              <p className="text-sm text-muted-foreground">Total Devices</p>
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
              <p className="text-sm text-muted-foreground">Online</p>
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
              <p className="text-sm text-muted-foreground">Offline</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-full bg-yellow-500/20">
              <Activity className="h-5 w-5 text-yellow-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{total - online - offline}</p>
              <p className="text-sm text-muted-foreground">Unknown</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Devices Table */}
      <Card>
        <CardHeader>
          <CardTitle>Monitored Devices</CardTitle>
          <CardDescription>
            Add Proxmox servers, routers, firewalls, and other devices to monitor
          </CardDescription>
        </CardHeader>
        <CardContent>
          {devices.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Network className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No devices configured</p>
              <p className="text-sm">Add your first device to start monitoring</p>
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
                />
              </div>
              <div>
                <Label>Device Type</Label>
                <Select value={form.device_type} onValueChange={(v) => {
                  const type = DEVICE_TYPES.find(t => t.value === v);
                  setForm({ ...form, device_type: v, port: type?.defaultPort || '' });
                }}>
                  <SelectTrigger>
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
                  />
                </div>
                <div>
                  <Label>API Token Secret</Label>
                  <Input
                    type="password"
                    value={form.api_token_secret}
                    onChange={(e) => setForm({ ...form, api_token_secret: e.target.value })}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
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
              <Button type="submit">
                {editingDevice ? 'Update' : 'Add Device'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
