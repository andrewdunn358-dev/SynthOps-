import React, { useState, useEffect } from 'react';
import { apiClient, useAuth } from '../App';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from './ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from './ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from './ui/table';
import {
  Edit, Save, X, History, Plus, AlertCircle, ChevronDown, ChevronRight, CheckCircle2,
} from 'lucide-react';

const CATEGORY_LABELS = {
  security: 'Security',
  backup: 'Backup',
  devices: 'Devices',
  onsite: 'Onsite Devices',
  connectivity: 'Connectivity',
  hosting: 'Hosting',
  office365: 'Office 365',
  other: 'Other',
};

const CATEGORY_ORDER = ['security','backup','devices','onsite','connectivity','hosting','office365','other'];

const SUPPORT_TYPES = ['Monthly', 'PAYG', 'Support Fund', 'Hosting', 'None'];

export default function SupportTab({ clientId, clientName }) {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [profile, setProfile] = useState(null);
  const [history, setHistory] = useState([]);
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState({});
  const [editSupportType, setEditSupportType] = useState('');
  const [editRemarks, setEditRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [changeDialogOpen, setChangeDialogOpen] = useState(false);
  const [changeForm, setChangeForm] = useState({
    product_id: '',
    product_name: '',
    change_description: '',
    requested_by: '',
    completed_by: '',
    accounts_informed: false,
    profile_updated: false,
  });
  const [savingChange, setSavingChange] = useState(false);
  const [recentChanges, setRecentChanges] = useState([]);

  useEffect(() => {
    if (clientId) fetchAll();
  }, [clientId]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [prodRes, profRes, changesRes] = await Promise.all([
        apiClient.get('/support/products'),
        apiClient.get(`/support/profile/${clientId}`),
        apiClient.get(`/support/changes?client_id=${clientId}`),
      ]);
      setProducts(prodRes.data);
      setProfile(profRes.data);
      setRecentChanges(changesRes.data.slice(0, 10));
      // Expand all categories by default
      const expanded = {};
      CATEGORY_ORDER.forEach(c => { expanded[c] = true; });
      setExpandedCategories(expanded);
    } catch (e) {
      toast.error('Failed to load support profile');
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await apiClient.get(`/support/profile/${clientId}/history`);
      setHistory(res.data);
    } catch (e) {
      toast.error('Failed to load history');
    }
  };

  const startEditing = () => {
    setEditValues({ ...(profile?.products || {}) });
    setEditSupportType(profile?.support_type || '');
    setEditRemarks(profile?.remarks || '');
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setEditValues({});
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      const res = await apiClient.put(`/support/profile/${clientId}`, {
        client_id: clientId,
        support_type: editSupportType || null,
        remarks: editRemarks || null,
        products: editValues,
      });
      setProfile(res.data);
      setEditing(false);
      toast.success('Support profile saved — changes auto-logged');
      // Refresh recent changes to show the auto-logged entry
      const changesRes = await apiClient.get(`/support/changes?client_id=${clientId}`);
      setRecentChanges(changesRes.data.slice(0, 10));
    } catch (e) {
      toast.error('Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const handleValueChange = (productName, value) => {
    setEditValues(prev => {
      if (value === '' || value === null || value === undefined) {
        const next = { ...prev };
        delete next[productName];
        return next;
      }
      return { ...prev, [productName]: value };
    });
  };

  const saveChange = async () => {
    if (!changeForm.change_description) {
      toast.error('Change description is required');
      return;
    }
    setSavingChange(true);
    try {
      await apiClient.post('/support/changes', {
        ...changeForm,
        client_id: clientId,
        date: new Date().toISOString(),
      });
      toast.success('Change logged');
      setChangeDialogOpen(false);
      setChangeForm({
        product_id: '', product_name: '', change_description: '',
        requested_by: '', completed_by: '', accounts_informed: false,
        profile_updated: false,
      });
      // Refresh recent changes
      const changesRes = await apiClient.get(`/support/changes?client_id=${clientId}`);
      setRecentChanges(changesRes.data.slice(0, 10));
    } catch (e) {
      toast.error('Failed to log change');
    } finally {
      setSavingChange(false);
    }
  };

  const toggleCategory = (cat) => {
    setExpandedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  // Group products by category
  const grouped = {};
  CATEGORY_ORDER.forEach(cat => { grouped[cat] = []; });
  products.forEach(p => {
    if (grouped[p.category]) grouped[p.category].push(p);
    else grouped['other'] = [...(grouped['other'] || []), p];
  });

  const renderValue = (product, value) => {
    if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>;
    if (product.unit === 'yes/no') return value ? <Badge variant="outline" className="text-green-600 border-green-600">Yes</Badge> : <Badge variant="outline">No</Badge>;
    if (product.unit === 'gb') return <span>{value} GB</span>;
    if (product.unit === 'text') return <span className="text-sm">{value}</span>;
    return <span className="font-medium">{value}</span>;
  };

  const renderEditInput = (product) => {
    const current = editValues[product.name];
    if (product.unit === 'yes/no') {
      return (
        <Select
          value={current ? 'yes' : 'no'}
          onValueChange={v => handleValueChange(product.name, v === 'yes')}
        >
          <SelectTrigger className="h-8 w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="yes">Yes</SelectItem>
            <SelectItem value="no">No</SelectItem>
          </SelectContent>
        </Select>
      );
    }
    if (product.unit === 'text') {
      return (
        <Input
          className="h-8 w-48"
          value={current || ''}
          onChange={e => handleValueChange(product.name, e.target.value)}
          placeholder="Enter value..."
        />
      );
    }
    // count / licences / gb
    return (
      <Input
        type="number"
        min="0"
        className="h-8 w-24"
        value={current ?? ''}
        onChange={e => handleValueChange(product.name, e.target.value === '' ? '' : Number(e.target.value))}
        placeholder="0"
      />
    );
  };

  if (loading) {
    return (
      <div className="space-y-3 mt-2">
        {[1,2,3].map(i => <div key={i} className="h-16 bg-muted rounded animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4 mt-2">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {profile?.support_type && (
            <Badge variant="secondary" className="text-sm px-3 py-1">
              {profile.support_type}
            </Badge>
          )}
          {profile?.needs_review && (
            <Badge variant="destructive" className="gap-1">
              <AlertCircle className="h-3 w-3" />
              Needs Review
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setChangeDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Log Change
          </Button>
          {!editing ? (
            <Button variant="outline" size="sm" onClick={startEditing}>
              <Edit className="h-4 w-4 mr-1" /> Edit Profile
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={cancelEditing}>
                <X className="h-4 w-4 mr-1" /> Cancel
              </Button>
              <Button size="sm" onClick={saveProfile} disabled={saving}>
                <Save className="h-4 w-4 mr-1" /> {saving ? 'Saving...' : 'Save'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Warning: unresolved changes where support count not updated */}
      {recentChanges.some(c => !c.profile_updated && !c.auto_logged) && (
        <div className="flex items-start gap-3 p-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700">
          <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-amber-800 dark:text-amber-300">Support Count not updated</p>
            <p className="text-amber-700 dark:text-amber-400 mt-0.5">
              There {recentChanges.filter(c => !c.profile_updated && !c.auto_logged).length === 1 ? 'is' : 'are'}{' '}
              <strong>{recentChanges.filter(c => !c.profile_updated && !c.auto_logged).length}</strong> logged{' '}
              {recentChanges.filter(c => !c.profile_updated && !c.auto_logged).length === 1 ? 'change' : 'changes'}{' '}
              where the support count hasn't been marked as updated. Check the changes below and tick "Support Count Updated" once done.
            </p>
          </div>
        </div>
      )}

      {/* Confirmation: everything in sync */}
      {recentChanges.length > 0 && recentChanges.every(c => c.profile_updated || c.auto_logged) && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-green-300 bg-green-50 dark:bg-green-900/20 dark:border-green-700 text-sm text-green-700 dark:text-green-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Support count is up to date with all logged changes.
        </div>
      )}
      {editing && (
        <Card>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Support Type</label>
                <Select value={editSupportType || "none"} onValueChange={v => setEditSupportType(v === "none" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORT_TYPES.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Remarks</label>
                <Input
                  value={editRemarks}
                  onChange={e => setEditRemarks(e.target.value)}
                  placeholder="Any notes..."
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Product sections by category */}
      {CATEGORY_ORDER.map(cat => {
        const catProducts = grouped[cat];
        if (!catProducts || catProducts.length === 0) return null;
        const hasValues = catProducts.some(p => profile?.products?.[p.name] !== undefined && profile?.products?.[p.name] !== null);
        if (!editing && !hasValues) return null; // hide empty categories when not editing

        return (
          <Card key={cat}>
            <CardHeader
              className="py-3 px-4 cursor-pointer select-none"
              onClick={() => toggleCategory(cat)}
            >
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {CATEGORY_LABELS[cat]}
                </CardTitle>
                {expandedCategories[cat]
                  ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                }
              </div>
            </CardHeader>
            {expandedCategories[cat] && (
              <CardContent className="pt-0 pb-3">
                <Table>
                  <TableBody>
                    {catProducts.map(product => {
                      const val = profile?.products?.[product.name];
                      if (!editing && (val === undefined || val === null)) return null;
                      return (
                        <TableRow key={product.id} className="border-b last:border-0">
                          <TableCell className="py-2 font-medium w-48">{product.name}</TableCell>
                          <TableCell className="py-2">
                            {editing
                              ? renderEditInput(product)
                              : renderValue(product, val)
                            }
                          </TableCell>
                          {product.unit === 'count' || product.unit === 'licences' ? (
                            <TableCell className="py-2 text-xs text-muted-foreground">
                              {product.unit}
                            </TableCell>
                          ) : <TableCell />}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            )}
          </Card>
        );
      })}

      {/* Remarks display (view mode) */}
      {!editing && profile?.remarks && (
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-sm text-muted-foreground font-medium mb-1">Remarks</p>
            <p className="text-sm">{profile.remarks}</p>
          </CardContent>
        </Card>
      )}

      {/* Recent changes */}
      {recentChanges.length > 0 && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Recent Changes
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 pb-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Change</TableHead>
                  <TableHead className="text-xs">Requested By</TableHead>
                  <TableHead className="text-xs">Completed By</TableHead>
                  <TableHead className="text-xs">Accounts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentChanges.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="py-2 text-xs text-muted-foreground whitespace-nowrap">
                      {c.date ? new Date(c.date).toLocaleDateString('en-GB') : '—'}
                    </TableCell>
                    <TableCell className="py-2 text-sm">
                      {c.product_name && <span className="font-medium mr-1">{c.product_name}:</span>}
                      {c.change_description}
                      {c.auto_logged && (
                        <Badge variant="outline" className="ml-2 text-xs text-blue-600 border-blue-400">auto</Badge>
                      )}
                    </TableCell>
                    <TableCell className="py-2 text-sm">{c.requested_by || '—'}</TableCell>
                    <TableCell className="py-2 text-sm">{c.completed_by || '—'}</TableCell>
                    <TableCell className="py-2">
                      {c.accounts_informed
                        ? <Badge variant="outline" className="text-xs text-green-600 border-green-600">Yes</Badge>
                        : <Badge variant="outline" className="text-xs text-amber-600 border-amber-600">No</Badge>
                      }
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* History button */}
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        onClick={async () => {
          if (!showHistory) await fetchHistory();
          setShowHistory(!showHistory);
        }}
      >
        <History className="h-4 w-4 mr-1" />
        {showHistory ? 'Hide' : 'View'} Monthly History
      </Button>

      {showHistory && history.length > 0 && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Monthly Snapshots
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 pb-3">
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {history.map(snap => (
                <div key={snap.month} className="border rounded p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm">{snap.month}</span>
                    {snap.support_type && (
                      <Badge variant="secondary" className="text-xs">{snap.support_type}</Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-x-4 gap-y-1">
                    {Object.entries(snap.products || {}).map(([name, val]) => (
                      <div key={name} className="flex justify-between text-xs">
                        <span className="text-muted-foreground truncate mr-2">{name}</span>
                        <span className="font-medium whitespace-nowrap">{String(val)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Log Change Dialog */}
      <Dialog open={changeDialogOpen} onOpenChange={setChangeDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Log Change — {clientName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Product / Service</label>
              <Select
                value={changeForm.product_id}
                onValueChange={v => {
                  const prod = products.find(p => p.id === v);
                  setChangeForm(f => ({ ...f, product_id: v, product_name: prod?.name || '' }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select product..." />
                </SelectTrigger>
                <SelectContent>
                  {products.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                  <SelectItem value="other">Other (free text)</SelectItem>
                </SelectContent>
              </Select>
              {changeForm.product_id === 'other' && (
                <Input
                  className="mt-2"
                  placeholder="Product / service name..."
                  value={changeForm.product_name}
                  onChange={e => setChangeForm(f => ({ ...f, product_name: e.target.value }))}
                />
              )}
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Change Description *</label>
              <Input
                placeholder="e.g. Increase from 8 to 9 licences"
                value={changeForm.change_description}
                onChange={e => setChangeForm(f => ({ ...f, change_description: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Requested By</label>
                <Input
                  placeholder="Client contact name"
                  value={changeForm.requested_by}
                  onChange={e => setChangeForm(f => ({ ...f, requested_by: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Completed By</label>
                <Input
                  placeholder="Engineer name"
                  value={changeForm.completed_by}
                  onChange={e => setChangeForm(f => ({ ...f, completed_by: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-6">
              {[
                { key: 'accounts_informed', label: 'Accounts Informed' },
                { key: 'profile_updated', label: 'Support Count Updated' },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={changeForm[key]}
                    onChange={e => setChangeForm(f => ({ ...f, [key]: e.target.checked }))}
                    className="rounded"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangeDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveChange} disabled={savingChange}>
              {savingChange ? 'Saving...' : 'Log Change'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
