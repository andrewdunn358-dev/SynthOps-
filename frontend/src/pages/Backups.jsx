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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { 
  HardDrive, Plus, CheckCircle, XCircle, AlertTriangle, 
  Calendar, Filter, Trash2, Edit, Database, RefreshCw, 
  Cloud, Server, Clock, ChevronDown, ChevronRight
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
  const [altaro, setAltaro] = useState(null);
  const [altaroLoading, setAltaroLoading] = useState(false);
  const [ahsay, setAhsay] = useState(null);
  const [ahsayLoading, setAhsayLoading] = useState(false);
  const [expandedCustomers, setExpandedCustomers] = useState({});
  const [activeTab, setActiveTab] = useState('altaro');

  useEffect(() => {
    fetchData();
    fetchAltaro();
    fetchAhsay();
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

  const fetchAltaro = async () => {
    setAltaroLoading(true);
    try {
      const res = await apiClient.get('/backups/altaro/status');
      setAltaro(res.data);
    } catch (e) {
      // Altaro not configured or rate limited
    } finally {
      setAltaroLoading(false);
    }
  };

  const fetchAhsay = async () => {
    setAhsayLoading(true);
    try {
      const res = await apiClient.get('/backups/ahsay/status');
      setAhsay(res.data);
    } catch (e) {
      // Ahsay not configured
    } finally {
      setAhsayLoading(false);
    }
  };

  const toggleCustomer = (name) => {
    setExpandedCustomers(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const formatSize = (bytes) => {
    if (!bytes || bytes === 0) return '-';
    const gb = bytes / (1024 ** 3);
    return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / (1024 ** 2)).toFixed(0)} MB`;
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '-';
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const timeAgo = (dateStr) => {
    if (!dateStr) return 'Never';
    const d = new Date(dateStr);
    const now = new Date();
    const diffHours = Math.floor((now - d) / (1000 * 60 * 60));
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays}d ago`;
    return `${Math.floor(diffDays / 30)}mo ago`;
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
          <p className="text-muted-foreground">Live Altaro & Ahsay backup status and manual backup logs</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchAhsay} disabled={ahsayLoading} data-testid="refresh-ahsay">
            <RefreshCw className={`h-4 w-4 mr-2 ${ahsayLoading ? 'animate-spin' : ''}`} />
            Refresh Ahsay
          </Button>
          <Button variant="outline" onClick={fetchAltaro} disabled={altaroLoading} data-testid="refresh-altaro">
            <RefreshCw className={`h-4 w-4 mr-2 ${altaroLoading ? 'animate-spin' : ''}`} />
            Refresh Altaro
          </Button>
          <Button onClick={openNew} data-testid="add-backup-btn">
            <Plus className="h-4 w-4 mr-2" />
            Log Backup
          </Button>
        </div>
      </div>

      {/* Altaro Summary Stats */}
      {altaro?.summary && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4" data-testid="altaro-summary">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold font-mono">{altaro.summary.total_customers}</p>
              <p className="text-xs text-muted-foreground">Customers</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold font-mono">{altaro.summary.total_vms}</p>
              <p className="text-xs text-muted-foreground">Total VMs</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold font-mono text-emerald-400">{altaro.summary.successful}</p>
              <p className="text-xs text-muted-foreground">Successful</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-red-500">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold font-mono text-red-400">{altaro.summary.failed}</p>
              <p className="text-xs text-muted-foreground">Failed</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold font-mono">{altaro.summary.success_rate}%</p>
              <p className="text-xs text-muted-foreground">Success Rate</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold font-mono">{altaro.summary.total_size_gb} GB</p>
              <p className="text-xs text-muted-foreground">Total Backed Up</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Failed VMs Alert */}
      {altaro?.failed_vms?.length > 0 && (
        <Card className="border-red-500/50 bg-red-500/5" data-testid="altaro-failures">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-red-400">
              <XCircle className="h-4 w-4" />
              Failed Backups ({altaro.failed_vms.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {altaro.failed_vms.map((f, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm p-2 bg-red-500/10 rounded">
                  <span className="font-medium">{f.customer}</span>
                  <span className="text-muted-foreground">{f.vm}</span>
                  <span className="text-muted-foreground text-xs">{f.last_backup ? timeAgo(f.last_backup) : 'Never'}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="altaro" data-testid="tab-altaro">Altaro Live Status</TabsTrigger>
          <TabsTrigger value="ahsay" data-testid="tab-ahsay">Ahsay CBS Status</TabsTrigger>
          <TabsTrigger value="manual" data-testid="tab-manual">Manual Logs</TabsTrigger>
        </TabsList>

        {/* Altaro Tab */}
        <TabsContent value="altaro" className="space-y-4">
          {altaroLoading ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground"><RefreshCw className="h-8 w-8 mx-auto mb-2 animate-spin" />Loading Altaro data...</CardContent></Card>
          ) : altaro?.customers ? (
            <>
              {altaro.from_cache && (
                <div className="text-xs text-amber-400 flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Showing cached data (API rate limited to 1 request per 5 min)
                  {altaro.fetched_at && <span> &middot; Last fetched: {new Date(altaro.fetched_at).toLocaleString()}</span>}
                </div>
              )}
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left p-3 font-medium text-muted-foreground w-8"></th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Customer</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">VMs</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Size</th>
                        </tr>
                      </thead>
                      <tbody>
                        {altaro.customers.map(customer => (
                          <React.Fragment key={customer.name}>
                            <tr 
                              className="border-b border-border/50 hover:bg-muted/30 cursor-pointer"
                              onClick={() => toggleCustomer(customer.name)}
                              data-testid={`altaro-customer-${customer.name}`}
                            >
                              <td className="p-3">
                                {expandedCustomers[customer.name] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </td>
                              <td className="p-3 font-medium">{customer.name}</td>
                              <td className="p-3 font-mono text-xs">{customer.total_vms}</td>
                              <td className="p-3">
                                <div className="flex gap-1">
                                  {customer.successful > 0 && <Badge className="bg-emerald-500/20 text-emerald-400"><CheckCircle className="h-3 w-3 mr-1" />{customer.successful}</Badge>}
                                  {customer.failed > 0 && <Badge className="bg-red-500/20 text-red-400"><XCircle className="h-3 w-3 mr-1" />{customer.failed}</Badge>}
                                  {customer.unknown > 0 && <Badge variant="outline" className="text-xs">{customer.unknown} unknown</Badge>}
                                </div>
                              </td>
                              <td className="p-3 font-mono text-xs">{customer.total_size_gb} GB</td>
                            </tr>
                            {expandedCustomers[customer.name] && customer.vms.map((vm, vIdx) => (
                              <tr key={`${customer.name}-${vIdx}`} className="border-b border-border/30 bg-muted/10">
                                <td className="p-2"></td>
                                <td className="p-2 pl-8 text-xs">
                                  <div className="flex items-center gap-2">
                                    <Server className="h-3 w-3 text-muted-foreground" />
                                    <span>{vm.name}</span>
                                    <span className="text-muted-foreground">({vm.host} - {vm.host_type})</span>
                                  </div>
                                </td>
                                <td className="p-2 text-xs text-muted-foreground">
                                  {vm.last_backup_time ? timeAgo(vm.last_backup_time) : 'Never'}
                                </td>
                                <td className="p-2">
                                  <div className="flex items-center gap-2">
                                    <Badge className={vm.status === 'success' ? 'bg-emerald-500/20 text-emerald-400' : vm.status === 'failed' ? 'bg-red-500/20 text-red-400' : 'bg-gray-500/20 text-gray-400'}>
                                      {vm.status === 'success' ? <CheckCircle className="h-3 w-3 mr-1" /> : vm.status === 'failed' ? <XCircle className="h-3 w-3 mr-1" /> : <AlertTriangle className="h-3 w-3 mr-1" />}
                                      {vm.result_name}
                                    </Badge>
                                    {vm.offsite_status === 'Success' && (
                                      <Badge variant="outline" className="text-xs"><Cloud className="h-3 w-3 mr-1" />Offsite OK</Badge>
                                    )}
                                  </div>
                                </td>
                                <td className="p-2 font-mono text-xs">
                                  {vm.size_gb > 0 ? `${vm.size_gb} GB` : '-'}
                                  {vm.duration_seconds > 0 && <span className="text-muted-foreground ml-2">({formatDuration(vm.duration_seconds)})</span>}
                                </td>
                              </tr>
                            ))}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card><CardContent className="p-8 text-center text-muted-foreground">
              <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
              Altaro backup data not available. Check API configuration.
            </CardContent></Card>
          )}
        </TabsContent>

        {/* Ahsay CBS Tab */}
        <TabsContent value="ahsay" className="space-y-4">
          {ahsayLoading ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground"><RefreshCw className="h-8 w-8 mx-auto mb-2 animate-spin" />Loading Ahsay data...</CardContent></Card>
          ) : ahsay?.users ? (
            <>
              {ahsay.from_cache && (
                <div className="text-xs text-amber-400 flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Showing cached data
                  {ahsay.fetched_at && <span> &middot; Last fetched: {new Date(ahsay.fetched_at).toLocaleString()}</span>}
                </div>
              )}
              {/* Ahsay Summary */}
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4" data-testid="ahsay-summary">
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold font-mono">{ahsay.summary.total_users}</p>
                    <p className="text-xs text-muted-foreground">Total Users</p>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-emerald-500">
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold font-mono text-emerald-400">{ahsay.summary.successful}</p>
                    <p className="text-xs text-muted-foreground">Healthy (&lt;26h)</p>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-amber-500">
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold font-mono text-amber-400">{ahsay.summary.warning}</p>
                    <p className="text-xs text-muted-foreground">Warning (26-72h)</p>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-red-500">
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold font-mono text-red-400">{ahsay.summary.stale}</p>
                    <p className="text-xs text-muted-foreground">Stale (&gt;72h)</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold font-mono">{ahsay.summary.total_data_gb} GB</p>
                    <p className="text-xs text-muted-foreground">Total Data</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold font-mono">{ahsay.summary.health_rate}%</p>
                    <p className="text-xs text-muted-foreground">Health Rate</p>
                  </CardContent>
                </Card>
              </div>

              {/* Stale Users Alert */}
              {ahsay.stale_users?.length > 0 && (
                <Card className="border-red-500/50 bg-red-500/5" data-testid="ahsay-stale-alert">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2 text-red-400">
                      <XCircle className="h-4 w-4" />
                      Stale Backups ({ahsay.stale_users.length}) - No backup in 72+ hours
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1">
                      {ahsay.stale_users.map((u, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm p-2 bg-red-500/10 rounded">
                          <span className="font-medium">{u.alias || u.login_name}</span>
                          <span className="text-muted-foreground text-xs">{u.last_backup ? `${Math.floor(u.age_hours / 24)}d ago` : 'Never'}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Ahsay Users Table */}
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left p-3 font-medium text-muted-foreground">User</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Type</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Last Backup</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Data Size</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Quota Used</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Online</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ahsay.users.map(u => {
                          const statusColors = {
                            success: 'bg-emerald-500/20 text-emerald-400',
                            warning: 'bg-amber-500/20 text-amber-400',
                            stale: 'bg-red-500/20 text-red-400',
                            never: 'bg-gray-500/20 text-gray-400',
                          };
                          const statusLabels = {
                            success: 'Healthy',
                            warning: 'Warning',
                            stale: 'Stale',
                            never: 'Never',
                          };
                          const StatusIcon = u.backup_status === 'success' ? CheckCircle : u.backup_status === 'stale' ? XCircle : AlertTriangle;
                          return (
                            <tr key={u.login_name} className="border-b border-border/50 hover:bg-muted/30" data-testid={`ahsay-user-${u.login_name}`}>
                              <td className="p-3">
                                <div className="font-medium">{u.alias || u.login_name}</div>
                                {u.alias && u.alias !== u.login_name && <div className="text-xs text-muted-foreground">{u.login_name}</div>}
                              </td>
                              <td className="p-3">
                                <Badge variant="outline" className="text-xs">{u.client_type}</Badge>
                              </td>
                              <td className="p-3">
                                <Badge className={statusColors[u.backup_status]}>
                                  <StatusIcon className="h-3 w-3 mr-1" />
                                  {statusLabels[u.backup_status]}
                                </Badge>
                              </td>
                              <td className="p-3 text-xs">
                                {u.last_backup ? (
                                  <div>
                                    <div>{timeAgo(u.last_backup)}</div>
                                    <div className="text-muted-foreground">{new Date(u.last_backup).toLocaleDateString()}</div>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">Never</span>
                                )}
                              </td>
                              <td className="p-3 font-mono text-xs">{u.data_size_gb} GB</td>
                              <td className="p-3">
                                {u.quota_gb > 0 ? (
                                  <div className="flex items-center gap-2">
                                    <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                                      <div
                                        className={`h-full rounded-full ${u.quota_used_pct > 90 ? 'bg-red-500' : u.quota_used_pct > 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                        style={{ width: `${Math.min(u.quota_used_pct, 100)}%` }}
                                      />
                                    </div>
                                    <span className="text-xs font-mono">{u.quota_used_pct}%</span>
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">Unlimited</span>
                                )}
                              </td>
                              <td className="p-3">
                                {u.online ? <Badge className="bg-emerald-500/20 text-emerald-400 text-xs">Online</Badge> : <span className="text-xs text-muted-foreground">Offline</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card><CardContent className="p-8 text-center text-muted-foreground">
              <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
              Ahsay CBS data not available. Check API configuration.
            </CardContent></Card>
          )}
        </TabsContent>

        {/* Manual Logs Tab */}
        <TabsContent value="manual" className="space-y-4">
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
        </TabsContent>
      </Tabs>

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
