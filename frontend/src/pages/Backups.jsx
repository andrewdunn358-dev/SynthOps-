import React, { useState, useEffect } from 'react';
import { apiClient } from '../App';
import { toast } from 'sonner';
import { getErrorMessage } from '../lib/errorHandler';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Textarea } from '../components/ui/textarea';
import { 
  HardDrive, Plus, CheckCircle, XCircle, AlertTriangle, 
  Calendar, Filter, Trash2, Edit, Database
} from 'lucide-react';

const STATUS_CONFIG = {
  success: { label: 'Success', color: 'bg-emerald-500/20 text-emerald-400', icon: CheckCircle },
  failed: { label: 'Failed', color: 'bg-red-500/20 text-red-400', icon: XCircle },
  partial: { label: 'Partial', color: 'bg-amber-500/20 text-amber-400', icon: AlertTriangle },
};

const INITIAL_FORM = {
  client_id: '',
  backup_date: new Date().toISOString().split('T')[0],
  backup_type: 'full',
  status: 'success',
  storage_size_gb: '',
  destination: 'local',
  notes: '',
};

export default function Backups() {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingLog, setEditingLog] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [filterClient, setFilterClient] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7));

  useEffect(() => {
    fetchData();
  }, [filterClient, filterStatus, filterMonth]);

  const fetchData = async () => {
    try {
      const params = new URLSearchParams();
      if (filterClient !== 'all') params.append('client_id', filterClient);
      if (filterStatus !== 'all') params.append('status', filterStatus);
      if (filterMonth) params.append('month', filterMonth);

      const [logsRes, statsRes, clientsRes] = await Promise.all([
        apiClient.get(`/backups?${params.toString()}`),
        apiClient.get('/backups/stats'),
        apiClient.get('/clients'),
      ]);
      setLogs(logsRes.data);
      setStats(statsRes.data);
      setClients(clientsRes.data);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to load backup data'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.client_id) {
      toast.error('Please select a client');
      return;
    }
    try {
      const payload = {
        ...form,
        storage_size_gb: form.storage_size_gb ? parseFloat(form.storage_size_gb) : null,
      };
      if (editingLog) {
        await apiClient.put(`/backups/${editingLog.id}`, payload);
        toast.success('Backup log updated');
      } else {
        await apiClient.post('/backups', payload);
        toast.success('Backup log created');
      }
      setShowDialog(false);
      setEditingLog(null);
      setForm(INITIAL_FORM);
      fetchData();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to save backup log'));
    }
  };

  const handleEdit = (log) => {
    setEditingLog(log);
    setForm({
      client_id: log.client_id,
      backup_date: log.backup_date,
      backup_type: log.backup_type,
      status: log.status,
      storage_size_gb: log.storage_size_gb || '',
      destination: log.destination || 'local',
      notes: log.notes || '',
    });
    setShowDialog(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this backup log?')) return;
    try {
      await apiClient.delete(`/backups/${id}`);
      toast.success('Backup log deleted');
      fetchData();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to delete'));
    }
  };

  const openNew = () => {
    setEditingLog(null);
    setForm(INITIAL_FORM);
    setShowDialog(true);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse"><CardContent className="p-4"><div className="h-16 bg-muted rounded" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="backups-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3" style={{ fontFamily: 'Barlow Condensed' }}>
            <HardDrive className="h-8 w-8 text-primary" />
            BACKUP TRACKING
          </h1>
          <p className="text-muted-foreground">Record and monitor client backup status</p>
        </div>
        <Button onClick={openNew} data-testid="add-backup-btn">
          <Plus className="h-4 w-4 mr-2" />
          Log Backup
        </Button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold font-mono">{stats.total_this_month}</p>
              <p className="text-xs text-muted-foreground">This Month</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold font-mono text-emerald-400">{stats.successful}</p>
              <p className="text-xs text-muted-foreground">Successful</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-red-500">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold font-mono text-red-400">{stats.failed}</p>
              <p className="text-xs text-muted-foreground">Failed</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold font-mono">{stats.success_rate}%</p>
              <p className="text-xs text-muted-foreground">Success Rate</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold font-mono">{stats.total_storage_gb} GB</p>
              <p className="text-xs text-muted-foreground">Total Storage</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Recent Failures Alert */}
      {stats?.recent_failures?.length > 0 && (
        <Card className="border-red-500/50 bg-red-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-red-400">
              <XCircle className="h-4 w-4" />
              Recent Failures
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {stats.recent_failures.map(f => (
                <div key={f.id} className="flex items-center justify-between text-sm p-2 bg-red-500/10 rounded">
                  <span className="font-medium">{f.client_name}</span>
                  <span className="text-muted-foreground">{f.backup_date}</span>
                  <span className="text-muted-foreground text-xs">{f.notes || 'No details'}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center" data-testid="backup-filters">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={filterMonth} onValueChange={setFilterMonth}>
          <SelectTrigger className="w-[160px]">
            <Calendar className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: 12 }, (_, i) => {
              const d = new Date();
              d.setMonth(d.getMonth() - i);
              const val = d.toISOString().slice(0, 7);
              return <SelectItem key={val} value={val}>{d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</SelectItem>;
            })}
          </SelectContent>
        </Select>
        <Select value={filterClient} onValueChange={setFilterClient}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Clients" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Clients</SelectItem>
            {clients.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Backup Log Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 font-medium text-muted-foreground">Date</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Client</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Type</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Size</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Destination</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Notes</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center p-8 text-muted-foreground">
                      <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      No backup logs found for this period
                    </td>
                  </tr>
                ) : (
                  logs.map(log => {
                    const statusConf = STATUS_CONFIG[log.status] || STATUS_CONFIG.success;
                    const StatusIcon = statusConf.icon;
                    return (
                      <tr key={log.id} className="border-b border-border/50 hover:bg-muted/30" data-testid={`backup-row-${log.id}`}>
                        <td className="p-3 font-mono text-xs">{log.backup_date}</td>
                        <td className="p-3 font-medium">{log.client_name}</td>
                        <td className="p-3">
                          <Badge variant="outline" className="capitalize">{log.backup_type}</Badge>
                        </td>
                        <td className="p-3">
                          <Badge className={statusConf.color}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {statusConf.label}
                          </Badge>
                        </td>
                        <td className="p-3 font-mono text-xs">{log.storage_size_gb ? `${log.storage_size_gb} GB` : '-'}</td>
                        <td className="p-3 capitalize text-xs">{log.destination || '-'}</td>
                        <td className="p-3 text-xs text-muted-foreground max-w-[200px] truncate">{log.notes || '-'}</td>
                        <td className="p-3 text-right">
                          <div className="flex gap-1 justify-end">
                            <Button size="icon" variant="ghost" onClick={() => handleEdit(log)} data-testid={`edit-backup-${log.id}`}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="text-red-400" onClick={() => handleDelete(log.id)} data-testid={`delete-backup-${log.id}`}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingLog ? 'Edit Backup Log' : 'Log Backup'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Client *</Label>
              <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                <SelectTrigger data-testid="backup-client-select">
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Date</Label>
                <Input type="date" value={form.backup_date} onChange={(e) => setForm({ ...form, backup_date: e.target.value })} data-testid="backup-date" />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={form.backup_type} onValueChange={(v) => setForm({ ...form, backup_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">Full</SelectItem>
                    <SelectItem value="incremental">Incremental</SelectItem>
                    <SelectItem value="differential">Differential</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="success">Success</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="partial">Partial</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Size (GB)</Label>
                <Input type="number" step="0.1" placeholder="e.g. 125.5" value={form.storage_size_gb} onChange={(e) => setForm({ ...form, storage_size_gb: e.target.value })} data-testid="backup-size" />
              </div>
              <div>
                <Label>Destination</Label>
                <Select value={form.destination} onValueChange={(v) => setForm({ ...form, destination: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="local">Local</SelectItem>
                    <SelectItem value="cloud">Cloud</SelectItem>
                    <SelectItem value="offsite">Offsite</SelectItem>
                    <SelectItem value="nas">NAS</SelectItem>
                    <SelectItem value="tape">Tape</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea placeholder="Any additional details..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="backup-notes" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button onClick={handleSubmit} data-testid="backup-submit">
                {editingLog ? 'Update' : 'Log Backup'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
