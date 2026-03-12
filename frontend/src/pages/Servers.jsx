import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../App';
import { toast } from 'sonner';
import { getErrorMessage } from '../lib/errorHandler';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog';
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
  Server, Plus, Search, MoreVertical, Edit, Trash2,
  HardDrive, Cpu, Database, Download
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { Textarea } from '../components/ui/textarea';

const SERVER_ROLES = [
  'Domain Controller',
  'Hypervisor',
  'File Server',
  'Web Server',
  'Database Server',
  'Application Server',
  'Backup Server',
  'Print Server',
  'Mail Server',
  'Other'
];

export default function Servers() {
  const navigate = useNavigate();
  const [servers, setServers] = useState([]);
  const [clients, setClients] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingServer, setEditingServer] = useState(null);

  const [form, setForm] = useState({
    site_id: '',
    hostname: '',
    role: '',
    server_type: 'virtual',
    ip_address: '',
    operating_system: '',
    os_version: '',
    cpu_cores: '',
    ram_gb: '',
    storage_gb: '',
    environment: 'production',
    criticality: 'medium',
    status: 'online',
    notes: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (clientFilter !== 'all') {
      fetchSites(clientFilter);
    }
  }, [clientFilter]);

  const fetchData = async () => {
    try {
      const [serversRes, clientsRes] = await Promise.all([
        apiClient.get('/servers'),
        apiClient.get('/clients')
      ]);
      setServers(serversRes.data);
      setClients(clientsRes.data);
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const fetchSites = async (clientId) => {
    try {
      const response = await apiClient.get(`/sites?client_id=${clientId}`);
      setSites(response.data);
    } catch (error) {
      console.error('Failed to fetch sites');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = {
        ...form,
        cpu_cores: form.cpu_cores ? parseInt(form.cpu_cores) : null,
        ram_gb: form.ram_gb ? parseInt(form.ram_gb) : null,
        storage_gb: form.storage_gb ? parseInt(form.storage_gb) : null
      };
      
      if (editingServer) {
        await apiClient.put(`/servers/${editingServer.id}`, data);
        toast.success('Server updated');
      } else {
        await apiClient.post('/servers', data);
        toast.success('Server created');
      }
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to save server'));
    }
  };

  const handleEdit = (server) => {
    setEditingServer(server);
    if (server.client_id) {
      fetchSites(server.client_id);
    }
    setForm({
      site_id: server.site_id,
      hostname: server.hostname,
      role: server.role || '',
      server_type: server.server_type || 'virtual',
      ip_address: server.ip_address || '',
      operating_system: server.operating_system || '',
      os_version: server.os_version || '',
      cpu_cores: server.cpu_cores || '',
      ram_gb: server.ram_gb || '',
      storage_gb: server.storage_gb || '',
      environment: server.environment || 'production',
      criticality: server.criticality || 'medium',
      status: server.status || 'online',
      notes: server.notes || ''
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this server?')) return;
    try {
      await apiClient.delete(`/servers/${id}`);
      toast.success('Server deleted');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete server');
    }
  };

  const resetForm = () => {
    setEditingServer(null);
    setForm({
      site_id: '',
      hostname: '',
      role: '',
      server_type: 'virtual',
      ip_address: '',
      operating_system: '',
      os_version: '',
      cpu_cores: '',
      ram_gb: '',
      storage_gb: '',
      environment: 'production',
      criticality: 'medium',
      status: 'online',
      notes: ''
    });
  };

  const filteredServers = servers.filter(s => {
    const matchesSearch = s.hostname.toLowerCase().includes(search.toLowerCase()) ||
                          s.ip_address?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
    const matchesClient = clientFilter === 'all' || s.client_id === clientFilter;
    return matchesSearch && matchesStatus && matchesClient;
  });

  const getStatusColor = (status) => {
    switch (status) {
      case 'online': return 'status-online';
      case 'offline': return 'status-offline';
      case 'maintenance': return 'status-maintenance';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="space-y-6" data-testid="servers-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Barlow Condensed' }}>
            SERVERS
          </h1>
          <p className="text-muted-foreground">Manage your infrastructure</p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline"
            onClick={() => window.open(`${process.env.REACT_APP_BACKEND_URL}/api/export/servers`, '_blank')}
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button data-testid="add-server">
                <Plus className="h-4 w-4 mr-2" />
                Add Server
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingServer ? 'Edit Server' : 'Add New Server'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Client</Label>
                  <Select 
                    value={clientFilter !== 'all' ? clientFilter : ''} 
                    onValueChange={(v) => { setClientFilter(v); fetchSites(v); }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select client" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Site *</Label>
                  <Select value={form.site_id} onValueChange={(v) => setForm({ ...form, site_id: v })}>
                    <SelectTrigger data-testid="server-site">
                      <SelectValue placeholder="Select site" />
                    </SelectTrigger>
                    <SelectContent>
                      {sites.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Hostname *</Label>
                  <Input
                    value={form.hostname}
                    onChange={(e) => setForm({ ...form, hostname: e.target.value })}
                    placeholder="DC01"
                    required
                    data-testid="server-hostname"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                    <SelectTrigger data-testid="server-role">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      {SERVER_ROLES.map((role) => (
                        <SelectItem key={role} value={role}>{role}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>IP Address</Label>
                  <Input
                    value={form.ip_address}
                    onChange={(e) => setForm({ ...form, ip_address: e.target.value })}
                    placeholder="192.168.1.10"
                    data-testid="server-ip"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Operating System</Label>
                  <Input
                    value={form.operating_system}
                    onChange={(e) => setForm({ ...form, operating_system: e.target.value })}
                    placeholder="Windows Server 2022"
                    data-testid="server-os"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Server Type</Label>
                  <Select value={form.server_type} onValueChange={(v) => setForm({ ...form, server_type: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="physical">Physical</SelectItem>
                      <SelectItem value="virtual">Virtual</SelectItem>
                      <SelectItem value="cloud">Cloud</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>CPU Cores</Label>
                  <Input
                    type="number"
                    value={form.cpu_cores}
                    onChange={(e) => setForm({ ...form, cpu_cores: e.target.value })}
                    placeholder="4"
                  />
                </div>
                <div className="space-y-2">
                  <Label>RAM (GB)</Label>
                  <Input
                    type="number"
                    value={form.ram_gb}
                    onChange={(e) => setForm({ ...form, ram_gb: e.target.value })}
                    placeholder="16"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Storage (GB)</Label>
                  <Input
                    type="number"
                    value={form.storage_gb}
                    onChange={(e) => setForm({ ...form, storage_gb: e.target.value })}
                    placeholder="500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Environment</Label>
                  <Select value={form.environment} onValueChange={(v) => setForm({ ...form, environment: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="production">Production</SelectItem>
                      <SelectItem value="staging">Staging</SelectItem>
                      <SelectItem value="development">Development</SelectItem>
                      <SelectItem value="test">Test</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Criticality</Label>
                  <Select value={form.criticality} onValueChange={(v) => setForm({ ...form, criticality: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="online">Online</SelectItem>
                      <SelectItem value="offline">Offline</SelectItem>
                      <SelectItem value="maintenance">Maintenance</SelectItem>
                      <SelectItem value="decommissioned">Decommissioned</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Additional notes..."
                  rows={2}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" data-testid="save-server">
                  {editingServer ? 'Update' : 'Create'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search servers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="search-servers"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40" data-testid="filter-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="online">Online</SelectItem>
            <SelectItem value="offline">Offline</SelectItem>
            <SelectItem value="maintenance">Maintenance</SelectItem>
          </SelectContent>
        </Select>
        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="w-48" data-testid="filter-client">
            <SelectValue placeholder="Client" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Clients</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Server Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
            </div>
          ) : filteredServers.length === 0 ? (
            <div className="empty-state py-12">
              <Server className="h-16 w-16" />
              <p className="text-lg font-medium">No servers found</p>
              <p className="text-muted-foreground">Add your first server or sync from Tactical RMM</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="table-dense">
                  <TableHead>Status</TableHead>
                  <TableHead>Hostname</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>OS</TableHead>
                  <TableHead>Environment</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredServers.map((server) => (
                  <TableRow 
                    key={server.id} 
                    className="table-dense cursor-pointer"
                    onClick={() => navigate(`/servers/${server.id}`)}
                    data-testid={`server-row-${server.hostname}`}
                  >
                    <TableCell>
                      <span className={`status-dot ${getStatusColor(server.status)}`} />
                    </TableCell>
                    <TableCell className="font-mono font-medium">{server.hostname}</TableCell>
                    <TableCell>{server.client_name || '-'}</TableCell>
                    <TableCell>{server.role || '-'}</TableCell>
                    <TableCell className="font-mono text-muted-foreground">{server.ip_address || '-'}</TableCell>
                    <TableCell className="text-muted-foreground">{server.operating_system || '-'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{server.environment}</Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEdit(server); }}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={(e) => { e.stopPropagation(); handleDelete(server.id); }}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
