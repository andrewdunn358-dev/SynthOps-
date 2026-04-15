import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient, useAuth } from '../App';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import {
  Plus, Search, Filter, CheckCircle2, Circle, ExternalLink,
  Trash2, Edit, ChevronDown,
} from 'lucide-react';

export default function SupportChanges() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [changes, setChanges] = useState([]);
  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterClient, setFilterClient] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [searchText, setSearchText] = useState('');

  // New change dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingChange, setEditingChange] = useState(null);
  const [form, setForm] = useState({
    client_id: '',
    product_id: '',
    product_name: '',
    change_description: '',
    requested_by: '',
    completed_by: '',
    accounts_informed: false,
    worksheet_submitted: false,
    profile_updated: false,
    date: new Date().toISOString().split('T')[0],
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchInit();
  }, []);

  useEffect(() => {
    fetchChanges();
  }, [filterClient, filterMonth]);

  const fetchInit = async () => {
    try {
      const [clientsRes, productsRes] = await Promise.all([
        apiClient.get('/clients'),
        apiClient.get('/support/products'),
      ]);
      setClients(clientsRes.data);
      setProducts(productsRes.data);
    } catch (e) {
      toast.error('Failed to load data');
    }
  };

  const fetchChanges = async () => {
    setLoading(true);
    try {
      let url = '/support/changes?';
      if (filterClient) url += `client_id=${filterClient}&`;
      if (filterMonth) url += `month=${filterMonth}&`;
      const res = await apiClient.get(url);
      setChanges(res.data);
    } catch (e) {
      toast.error('Failed to load changes');
    } finally {
      setLoading(false);
    }
  };

  const openNew = () => {
    setEditingChange(null);
    setForm({
      client_id: filterClient || '',
      product_id: '',
      product_name: '',
      change_description: '',
      requested_by: '',
      completed_by: '',
      accounts_informed: false,
      worksheet_submitted: false,
      profile_updated: false,
      date: new Date().toISOString().split('T')[0],
    });
    setDialogOpen(true);
  };

  const openEdit = (change) => {
    setEditingChange(change);
    setForm({
      client_id: change.client_id || '',
      product_id: change.product_id || '',
      product_name: change.product_name || '',
      change_description: change.change_description || '',
      requested_by: change.requested_by || '',
      completed_by: change.completed_by || '',
      accounts_informed: change.accounts_informed || false,
      worksheet_submitted: change.worksheet_submitted || false,
      profile_updated: change.profile_updated || false,
      date: change.date ? change.date.split('T')[0] : new Date().toISOString().split('T')[0],
    });
    setDialogOpen(true);
  };

  const saveForm = async () => {
    if (!form.client_id) { toast.error('Client is required'); return; }
    if (!form.change_description) { toast.error('Change description is required'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        date: new Date(form.date).toISOString(),
      };
      if (editingChange) {
        await apiClient.put(`/support/changes/${editingChange.id}`, payload);
        toast.success('Change updated');
      } else {
        await apiClient.post('/support/changes', payload);
        toast.success('Change logged');
      }
      setDialogOpen(false);
      fetchChanges();
    } catch (e) {
      toast.error('Failed to save change');
    } finally {
      setSaving(false);
    }
  };

  const toggleField = async (change, field) => {
    try {
      await apiClient.put(`/support/changes/${change.id}`, {
        ...change,
        [field]: !change[field],
      });
      setChanges(prev => prev.map(c =>
        c.id === change.id ? { ...c, [field]: !c[field] } : c
      ));
    } catch (e) {
      toast.error('Failed to update');
    }
  };

  const deleteChange = async (id) => {
    if (!window.confirm('Delete this change record?')) return;
    try {
      await apiClient.delete(`/support/changes/${id}`);
      setChanges(prev => prev.filter(c => c.id !== id));
      toast.success('Deleted');
    } catch (e) {
      toast.error('Failed to delete');
    }
  };

  const clientName = (id) => {
    const c = clients.find(c => c.id === id);
    return c?.name || id;
  };

  // Generate last 13 months for filter
  const monthOptions = [];
  const now = new Date();
  for (let i = 0; i < 13; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleString('en-GB', { month: 'long', year: 'numeric' });
    monthOptions.push({ val, label });
  }

  // Client-side text filter
  const filtered = changes.filter(c => {
    if (!searchText) return true;
    const q = searchText.toLowerCase();
    return (
      (c.change_description || '').toLowerCase().includes(q) ||
      (c.product_name || '').toLowerCase().includes(q) ||
      (c.requested_by || '').toLowerCase().includes(q) ||
      (c.completed_by || '').toLowerCase().includes(q) ||
      clientName(c.client_id).toLowerCase().includes(q)
    );
  });

  // Stats
  const pending = changes.filter(c => !c.accounts_informed || !c.worksheet_submitted).length;
  const needsProfileUpdate = changes.filter(c => !c.profile_updated).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Support Changes</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Track licence, device, and service changes across all clients
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-2" /> Log Change
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">Total This Month</p>
            <p className="text-2xl font-bold mt-1">
              {changes.filter(c => {
                const m = new Date(c.date).toISOString().slice(0,7);
                const current = new Date().toISOString().slice(0,7);
                return m === current;
              }).length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">Pending Admin</p>
            <p className={`text-2xl font-bold mt-1 ${pending > 0 ? 'text-amber-500' : 'text-green-500'}`}>
              {pending}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">Profile Not Updated</p>
            <p className={`text-2xl font-bold mt-1 ${needsProfileUpdate > 0 ? 'text-red-500' : 'text-green-500'}`}>
              {needsProfileUpdate}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search changes..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
          />
        </div>
        <Select value={filterClient} onValueChange={setFilterClient}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="All clients" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All clients</SelectItem>
            {clients.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterMonth} onValueChange={setFilterMonth}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All months" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All months</SelectItem>
            {monthOptions.map(m => (
              <SelectItem key={m.val} value={m.val}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(filterClient || filterMonth) && (
          <Button variant="ghost" onClick={() => { setFilterClient(''); setFilterMonth(''); }}>
            Clear filters
          </Button>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No changes found. {changes.length > 0 && 'Try adjusting your filters.'}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Change</TableHead>
                  <TableHead>Requested By</TableHead>
                  <TableHead>Completed By</TableHead>
                  <TableHead className="text-center">Accounts</TableHead>
                  <TableHead className="text-center">Worksheet</TableHead>
                  <TableHead className="text-center">Count Updated</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(c => (
                  <TableRow key={c.id} className="group">
                    <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                      {c.date ? new Date(c.date).toLocaleDateString('en-GB') : '—'}
                    </TableCell>
                    <TableCell>
                      <button
                        className="text-sm font-medium hover:underline text-left"
                        onClick={() => {
                          const client = clients.find(cl => cl.id === c.client_id);
                          if (client) navigate(`/clients/${client.id}`);
                        }}
                      >
                        {clientName(c.client_id)}
                      </button>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.product_name || '—'}
                    </TableCell>
                    <TableCell className="text-sm max-w-xs truncate">
                      {c.change_description}
                    </TableCell>
                    <TableCell className="text-sm">{c.requested_by || '—'}</TableCell>
                    <TableCell className="text-sm">{c.completed_by || '—'}</TableCell>
                    {/* Toggle checkboxes */}
                    {['accounts_informed', 'worksheet_submitted', 'profile_updated'].map(field => (
                      <TableCell key={field} className="text-center">
                        <button
                          onClick={() => toggleField(c, field)}
                          className="hover:opacity-70 transition-opacity"
                          title={`Toggle ${field.replace(/_/g, ' ')}`}
                        >
                          {c[field]
                            ? <CheckCircle2 className="h-5 w-5 text-green-500 mx-auto" />
                            : <Circle className="h-5 w-5 text-muted-foreground mx-auto" />
                          }
                        </button>
                      </TableCell>
                    ))}
                    <TableCell>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        {user?.role === 'admin' && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteChange(c.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
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

      {/* Log / Edit Change Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingChange ? 'Edit Change' : 'Log Change'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Client *</label>
                <Select value={form.client_id} onValueChange={v => setForm(f => ({ ...f, client_id: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select client..." />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Date</label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Product / Service</label>
              <Select
                value={form.product_id || 'other'}
                onValueChange={v => {
                  const prod = products.find(p => p.id === v);
                  setForm(f => ({ ...f, product_id: v === 'other' ? '' : v, product_name: prod?.name || f.product_name }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select product..." />
                </SelectTrigger>
                <SelectContent>
                  {products.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                  <SelectItem value="other">Other / free text</SelectItem>
                </SelectContent>
              </Select>
              {(!form.product_id || form.product_id === 'other') && (
                <Input
                  className="mt-2"
                  placeholder="Product / service name..."
                  value={form.product_name}
                  onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))}
                />
              )}
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Change Description *</label>
              <Input
                placeholder="e.g. Increase from 8 to 9 licences"
                value={form.change_description}
                onChange={e => setForm(f => ({ ...f, change_description: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Requested By</label>
                <Input
                  placeholder="Client contact"
                  value={form.requested_by}
                  onChange={e => setForm(f => ({ ...f, requested_by: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Completed By</label>
                <Input
                  placeholder="Engineer name"
                  value={form.completed_by}
                  onChange={e => setForm(f => ({ ...f, completed_by: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-6 pt-1">
              {[
                { key: 'accounts_informed', label: 'Accounts Informed' },
                { key: 'worksheet_submitted', label: 'Worksheet Submitted' },
                { key: 'profile_updated', label: 'Support Count Updated' },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={form[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))}
                    className="rounded"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveForm} disabled={saving}>
              {saving ? 'Saving...' : editingChange ? 'Save Changes' : 'Log Change'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
