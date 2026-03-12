import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../App';
import { toast } from 'sonner';
import { getErrorMessage } from '../lib/errorHandler';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
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
  Monitor, Search, RefreshCw, User, Cpu, HardDrive, AlertCircle
} from 'lucide-react';

export default function Machines() {
  const navigate = useNavigate();
  const [machines, setMachines] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [machinesRes, clientsRes] = await Promise.all([
        apiClient.get('/machines'),
        apiClient.get('/clients')
      ]);
      setMachines(machinesRes.data);
      setClients(clientsRes.data);
    } catch (error) {
      console.error('Failed to load machines');
    } finally {
      setLoading(false);
    }
  };

  const handleFullSync = async () => {
    setSyncing(true);
    try {
      const response = await apiClient.post('/integrations/trmm/sync/full');
      toast.success(`Synced: ${response.data.stats.clients_synced} clients, ${response.data.stats.agents_synced} servers, ${response.data.stats.workstations_synced} workstations`);
      fetchData();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Sync failed'));
    } finally {
      setSyncing(false);
    }
  };

  const filteredMachines = machines.filter(m => {
    const matchesSearch = m.hostname?.toLowerCase().includes(search.toLowerCase()) ||
                          m.logged_in_username?.toLowerCase().includes(search.toLowerCase()) ||
                          m.ip_address?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || m.status === statusFilter;
    const matchesClient = clientFilter === 'all' || m.client_id === clientFilter;
    return matchesSearch && matchesStatus && matchesClient;
  });

  const getStatusColor = (status) => {
    switch (status) {
      case 'online': return 'status-online';
      case 'offline': return 'status-offline';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="space-y-6" data-testid="machines-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Barlow Condensed' }}>
            WORKSTATIONS
          </h1>
          <p className="text-muted-foreground">Client machines and endpoints</p>
        </div>
        <Button onClick={handleFullSync} disabled={syncing} data-testid="full-sync">
          <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
          Full Sync from TRMM
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Monitor className="h-4 w-4" />
              <span className="text-sm">Total</span>
            </div>
            <p className="text-2xl font-bold font-mono">{machines.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-emerald-400 mb-1">
              <span className="status-dot status-online" />
              <span className="text-sm">Online</span>
            </div>
            <p className="text-2xl font-bold font-mono text-emerald-400">
              {machines.filter(m => m.status === 'online').length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-red-400 mb-1">
              <span className="status-dot status-offline" />
              <span className="text-sm">Offline</span>
            </div>
            <p className="text-2xl font-bold font-mono text-red-400">
              {machines.filter(m => m.status === 'offline').length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-amber-400 mb-1">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">Needs Reboot</span>
            </div>
            <p className="text-2xl font-bold font-mono text-amber-400">
              {machines.filter(m => m.needs_reboot).length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search machines, users, IP..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="search-machines"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="online">Online</SelectItem>
            <SelectItem value="offline">Offline</SelectItem>
          </SelectContent>
        </Select>
        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="w-48">
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

      {/* Machines Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
            </div>
          ) : filteredMachines.length === 0 ? (
            <div className="empty-state py-12">
              <Monitor className="h-16 w-16" />
              <p className="text-lg font-medium">No workstations found</p>
              <p className="text-muted-foreground">Sync from Tactical RMM to import workstations</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="table-dense">
                  <TableHead>Status</TableHead>
                  <TableHead>Hostname</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>OS</TableHead>
                  <TableHead>CPU</TableHead>
                  <TableHead>RAM</TableHead>
                  <TableHead>Alerts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMachines.map((machine) => (
                  <TableRow 
                    key={machine.id} 
                    className="table-dense cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/machines/${machine.id}`)}
                  >
                    <TableCell>
                      <span className={`status-dot ${getStatusColor(machine.status)}`} />
                    </TableCell>
                    <TableCell className="font-mono font-medium">{machine.hostname}</TableCell>
                    <TableCell>{machine.client_name || '-'}</TableCell>
                    <TableCell>
                      {machine.logged_in_username ? (
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3 text-muted-foreground" />
                          <span>{machine.logged_in_username}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">No user</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground text-xs">
                      {machine.ip_address || '-'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">
                      {machine.operating_system || '-'}
                    </TableCell>
                    <TableCell className="text-xs">
                      {machine.cpu_cores ? `${machine.cpu_cores} cores` : '-'}
                    </TableCell>
                    <TableCell className="text-xs">
                      {machine.total_ram ? `${machine.total_ram} GB` : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {machine.needs_reboot && (
                          <Badge className="bg-amber-500/20 text-amber-400 text-xs">Reboot</Badge>
                        )}
                        {machine.has_patches_pending && (
                          <Badge className="bg-blue-500/20 text-blue-400 text-xs">
                            {machine.patches_pending_count} patches
                          </Badge>
                        )}
                      </div>
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
