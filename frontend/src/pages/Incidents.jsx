import React, { useState, useEffect } from 'react';
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
  AlertTriangle, Plus, Search, MoreVertical, CheckCircle,
  Clock, AlertCircle, Download
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { Textarea } from '../components/ui/textarea';

export default function Incidents() {
  const [incidents, setIncidents] = useState([]);
  const [trmmAlerts, setTrmmAlerts] = useState([]);
  const [clients, setClients] = useState([]);
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('open');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState(null);

  const [form, setForm] = useState({
    title: '',
    client_id: '',
    server_id: '',
    severity: 'medium',
    description: ''
  });

  const [resolveForm, setResolveForm] = useState({
    root_cause: '',
    resolution_notes: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [incidentsRes, clientsRes, serversRes] = await Promise.all([
        apiClient.get('/incidents'),
        apiClient.get('/clients'),
        apiClient.get('/servers')
      ]);
      setIncidents(incidentsRes.data);
      setClients(clientsRes.data);
      setServers(serversRes.data);
      
      // Fetch TRMM alerts - offline servers as incidents
      const offlineServers = serversRes.data.filter(s => s.status === 'offline');
      const trmmIncidents = offlineServers.map(s => ({
        id: `trmm-${s.id}`,
        title: `Server Offline: ${s.hostname}`,
        source: 'trmm',
        severity: 'high',
        status: 'open',
        client_name: s.client_name,
        server_name: s.hostname,
        description: `Server ${s.hostname} is currently offline. Last seen: ${s.last_seen || 'Unknown'}`,
        created_at: s.last_seen || new Date().toISOString()
      }));
      setTrmmAlerts(trmmIncidents);
    } catch (error) {
      toast.error('Failed to load incidents');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = {
        ...form,
        client_id: form.client_id && form.client_id !== 'none' ? form.client_id : null,
        server_id: form.server_id && form.server_id !== 'none' ? form.server_id : null
      };
      await apiClient.post('/incidents', data);
      toast.success('Incident created');
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to create incident'));
    }
  };

  const handleResolve = async (e) => {
    e.preventDefault();
    if (!selectedIncident) return;
    
    try {
      await apiClient.put(`/incidents/${selectedIncident.id}/resolve`, resolveForm);
      toast.success('Incident resolved');
      setResolveDialogOpen(false);
      setSelectedIncident(null);
      setResolveForm({ root_cause: '', resolution_notes: '' });
      fetchData();
    } catch (error) {
      toast.error('Failed to resolve incident');
    }
  };

  const handleConfirmResolution = async (incident) => {
    if (!incident) return;
    if (!confirm(
      `Confirm resolution of "${incident.title}"?\n\n` +
      `The system marked this resolved automatically — ` +
      (incident.auto_resolved_reason || 'underlying issue cleared') +
      `.\n\nClicking OK closes the incident.`
    )) return;
    try {
      await apiClient.put(`/incidents/${incident.id}/confirm-resolution`, {});
      toast.success('Resolution confirmed');
      fetchData();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to confirm resolution'));
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this incident?')) return;
    try {
      await apiClient.delete(`/incidents/${id}`);
      toast.success('Incident deleted');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete incident');
    }
  };

  const resetForm = () => {
    setForm({
      title: '',
      client_id: '',
      server_id: '',
      severity: 'medium',
      description: ''
    });
  };

  // Combine manual incidents with TRMM alerts
  const allIncidents = [
    ...incidents.map(i => ({ ...i, source: 'manual' })),
    ...(sourceFilter !== 'manual' ? trmmAlerts : [])
  ];

  const filteredIncidents = allIncidents.filter(i => {
    const matchesSearch = i.title.toLowerCase().includes(search.toLowerCase()) ||
                          i.server_name?.toLowerCase().includes(search.toLowerCase()) ||
                          i.client_name?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || i.status === statusFilter;
    const matchesSource = sourceFilter === 'all' || i.source === sourceFilter;
    return matchesSearch && matchesStatus && matchesSource;
  }).sort((a, b) => {
    // Sort by severity (critical > high > medium > low) then by date
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    if (severityOrder[a.severity] !== severityOrder[b.severity]) {
      return severityOrder[a.severity] - severityOrder[b.severity];
    }
    return new Date(b.created_at) - new Date(a.created_at);
  });

  // Stats
  const openIncidents = allIncidents.filter(i => i.status === 'open').length;
  const criticalIncidents = allIncidents.filter(i => i.severity === 'critical' && i.status === 'open').length;
  const trmmAlertCount = trmmAlerts.length;

  const getSeverityClass = (severity) => `severity-${severity}`;

  const getStatusIcon = (status) => {
    switch (status) {
      case 'resolved': return <CheckCircle className="h-4 w-4 text-emerald-400" />;
      case 'investigating': return <AlertCircle className="h-4 w-4 text-amber-400" />;
      default: return <Clock className="h-4 w-4 text-red-400" />;
    }
  };

  return (
    <div className="space-y-6" data-testid="incidents-page">
      {/* TRMM Alert Banner */}
      {trmmAlertCount > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-400" />
            <div>
              <p className="font-semibold text-red-400">
                {trmmAlertCount} Server{trmmAlertCount > 1 ? 's' : ''} Offline (TRMM)
              </p>
              <p className="text-sm text-muted-foreground">
                These servers are detected as offline in Tactical RMM and require attention.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Barlow Condensed' }}>
            INCIDENTS
          </h1>
          <p className="text-muted-foreground">
            Track and manage incidents • {openIncidents} open 
            {criticalIncidents > 0 && <span className="text-red-400"> • {criticalIncidents} critical</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline"
            onClick={() => window.open(`${process.env.REACT_APP_BACKEND_URL}/api/export/incidents`, '_blank')}
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button data-testid="add-incident">
                <Plus className="h-4 w-4 mr-2" />
                Log Incident
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Log New Incident</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Title *</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Brief incident title"
                  required
                  data-testid="incident-title"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Client</Label>
                  <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                    <SelectTrigger data-testid="incident-client">
                      <SelectValue placeholder="Select client" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Severity</Label>
                  <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v })}>
                    <SelectTrigger data-testid="incident-severity">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Affected Server</Label>
                <Select value={form.server_id} onValueChange={(v) => setForm({ ...form, server_id: v })}>
                  <SelectTrigger data-testid="incident-server">
                    <SelectValue placeholder="Select server" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {servers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.hostname} ({s.client_name})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Describe the incident..."
                  rows={4}
                  data-testid="incident-description"
                />
              </div>
              
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" data-testid="save-incident">
                  Log Incident
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
            placeholder="Search incidents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="search-incidents"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40" data-testid="filter-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="investigating">Investigating</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>
        
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-40" data-testid="filter-source">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
            <SelectItem value="trmm">TRMM Alerts</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Incidents Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
            </div>
          ) : filteredIncidents.length === 0 ? (
            <div className="empty-state py-12">
              <AlertTriangle className="h-16 w-16" />
              <p className="text-lg font-medium">No incidents found</p>
              <p className="text-muted-foreground">All clear! No incidents to display.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="table-dense">
                  <TableHead>Status</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Server</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredIncidents.map((incident) => (
                  <TableRow 
                    key={incident.id} 
                    className="table-dense"
                    data-testid={`incident-row-${incident.id}`}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(incident.status)}
                        <span className="capitalize">{incident.status}</span>
                        {incident.awaiting_confirmation && (
                          <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/40 text-xs">
                            Awaiting confirmation
                          </Badge>
                        )}
                        {incident.occurrence_count > 1 && (
                          <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/40 text-xs" title="This incident has recurred">
                            ×{incident.occurrence_count}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const src = incident.source || 'manual';
                        if (src === 'manual') return <Badge variant="outline">Manual</Badge>;
                        if (src === 'trmm_offline') return <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/40">Server Offline</Badge>;
                        if (src === 'trmm') return <Badge variant="outline" className="bg-cyan-500/10 text-cyan-400">TRMM</Badge>;
                        return <Badge variant="outline" className="bg-cyan-500/10 text-cyan-400">{src.replace(/_/g, ' ')}</Badge>;
                      })()}
                    </TableCell>
                    <TableCell className="font-medium">{incident.title}</TableCell>
                    <TableCell>{incident.client_name || '-'}</TableCell>
                    <TableCell className="font-mono text-muted-foreground">
                      {incident.server_name || '-'}
                    </TableCell>
                    <TableCell>
                      <Badge className={getSeverityClass(incident.severity)}>
                        {incident.severity}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(incident.date_opened).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {incident.awaiting_confirmation && (
                            <DropdownMenuItem onClick={() => handleConfirmResolution(incident)}>
                              <CheckCircle className="h-4 w-4 mr-2 text-emerald-500" />
                              Confirm Resolution
                            </DropdownMenuItem>
                          )}
                          {incident.status !== 'resolved' && (
                            <DropdownMenuItem onClick={() => {
                              setSelectedIncident(incident);
                              setResolveDialogOpen(true);
                            }}>
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Resolve
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem 
                            onClick={() => handleDelete(incident.id)}
                            className="text-destructive"
                          >
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

      {/* Resolve Dialog */}
      <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Resolve Incident</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleResolve} className="space-y-4">
            <div className="space-y-2">
              <Label>Root Cause</Label>
              <Textarea
                value={resolveForm.root_cause}
                onChange={(e) => setResolveForm({ ...resolveForm, root_cause: e.target.value })}
                placeholder="What caused this incident?"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Resolution Notes</Label>
              <Textarea
                value={resolveForm.resolution_notes}
                onChange={(e) => setResolveForm({ ...resolveForm, resolution_notes: e.target.value })}
                placeholder="How was it resolved?"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setResolveDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" data-testid="resolve-incident">
                Resolve
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
