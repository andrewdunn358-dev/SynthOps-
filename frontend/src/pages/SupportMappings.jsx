import React, { useState, useEffect } from 'react';
import { apiClient } from '../App';
import { toast } from 'sonner';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import { CheckCircle2, AlertTriangle, RefreshCw, UserPlus, Link2, Search, Globe, ShieldCheck, ShieldOff, Wifi, WifiOff } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../components/ui/dialog';
import { Label } from '../components/ui/label';

// ─────────────────────────────────────────────
// Name Mappings Tab (existing functionality)
// ─────────────────────────────────────────────
function NameMappingsTab({ clients, sites }) {
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState({});
  const [creatingClient, setCreatingClient] = useState(null);
  const [newClientForm, setNewClientForm] = useState({ name: '', code: '', service_category: 'mixed_services' });
  const [savingNewClient, setSavingNewClient] = useState(false);
  const [pendingMappings, setPendingMappings] = useState({});
  const [filter, setFilter] = useState('all');

  useEffect(() => { fetchMappings(); }, []);

  const fetchMappings = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/support/mappings');
      setMappings(res.data);
    } catch (e) {
      toast.error('Failed to load mappings');
    } finally {
      setLoading(false);
    }
  };

  const setPending = (rawId, field, value) =>
    setPendingMappings(prev => ({ ...prev, [rawId]: { ...(prev[rawId] || {}), [field]: value } }));
  const getPending = (rawId, field, fallback) => pendingMappings[rawId]?.[field] ?? fallback;

  const saveMapping = async (mapping) => {
    const pending = pendingMappings[mapping.raw_id] || {};
    const mappedType = pending.mapped_type || mapping.mapped_type;
    const mappedId = pending.mapped_id || mapping.mapped_id;
    if (!mappedType || !mappedId) { toast.error('Please select a type and a client or site'); return; }

    let mappedName = '', parentClientId = '', parentClientName = '';
    if (mappedType === 'client') {
      const c = clients.find(c => c.id === mappedId);
      mappedName = c?.name || mappedId;
      parentClientId = mappedId; parentClientName = mappedName;
    } else {
      const s = sites.find(s => s.id === mappedId);
      mappedName = s?.name || mappedId;
      const pc = clients.find(c => c.id === s?.client_id);
      parentClientId = s?.client_id || ''; parentClientName = pc?.name || '';
    }

    setSaving(prev => ({ ...prev, [mapping.raw_id]: true }));
    try {
      const result = await apiClient.post('/support/mappings', {
        raw_id: mapping.raw_id, raw_name: mapping.raw_name,
        mapped_type: mappedType, mapped_id: mappedId, mapped_name: mappedName,
        parent_client_id: parentClientId, parent_client_name: parentClientName,
      });
      toast.success(`Mapped "${mapping.raw_name}" → ${mappedName}. Updated ${result.data.snapshots_updated} snapshots.`);
      setPendingMappings(prev => { const n = { ...prev }; delete n[mapping.raw_id]; return n; });
      fetchMappings();
    } catch (e) {
      toast.error('Failed to save mapping');
    } finally {
      setSaving(prev => ({ ...prev, [mapping.raw_id]: false }));
    }
  };

  const createClientAndMap = async (mapping) => {
    if (!newClientForm.name || !newClientForm.code) { toast.error('Name and code are required'); return; }
    setSavingNewClient(true);
    try {
      const clientRes = await apiClient.post('/clients', {
        name: newClientForm.name, code: newClientForm.code.toUpperCase(),
        client_type: 'web_services', service_category: newClientForm.service_category, contract_type: 'monthly',
      });
      const newClient = clientRes.data;
      const result = await apiClient.post('/support/mappings', {
        raw_id: mapping.raw_id, raw_name: mapping.raw_name,
        mapped_type: 'client', mapped_id: newClient.id, mapped_name: newClient.name,
        parent_client_id: newClient.id, parent_client_name: newClient.name,
      });
      toast.success(`Created "${newClient.name}" and mapped ${result.data.snapshots_updated} snapshots`);
      setCreatingClient(null);
      setNewClientForm({ name: '', code: '', service_category: 'mixed_services' });
      fetchMappings();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to create client');
    } finally {
      setSavingNewClient(false);
    }
  };

  const filtered = mappings.filter(m => {
    if (filter === 'mapped' && !m.mapped_id) return false;
    if (filter === 'unmapped' && m.mapped_id) return false;
    if (search) return m.raw_name.toLowerCase().includes(search.toLowerCase());
    return true;
  });

  const mappedCount = mappings.filter(m => m.mapped_id).length;
  const unmappedCount = mappings.filter(m => !m.mapped_id).length;

  if (loading) return <div className="py-8 text-center text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {[['Total', mappings.length, ''], ['Mapped', mappedCount, 'text-green-500'], ['Unresolved', unmappedCount, unmappedCount > 0 ? 'text-amber-500' : 'text-green-500']].map(([label, val, cls]) => (
          <Card key={label}><CardContent className="pt-4 pb-4"><p className="text-sm text-muted-foreground">{label}</p><p className={`text-2xl font-bold mt-1 ${cls}`}>{val}</p></CardContent></Card>
        ))}
      </div>
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search names..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2">
          {['all', 'unmapped', 'mapped'].map(f => (
            <Button key={f} size="sm" variant={filter === f ? 'default' : 'outline'} onClick={() => setFilter(f)} className="capitalize">{f}</Button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={fetchMappings}><RefreshCw className="h-4 w-4 mr-1" /> Refresh</Button>
      </div>
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Spreadsheet Name</TableHead>
              <TableHead>Map To</TableHead>
              <TableHead>Client / Site</TableHead>
              <TableHead>Parent Client</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">{filter === 'unmapped' ? '🎉 All names are mapped!' : 'No results found'}</TableCell></TableRow>
            ) : filtered.map(m => {
              const currentType = getPending(m.raw_id, 'mapped_type', m.mapped_type || '');
              const currentId = getPending(m.raw_id, 'mapped_id', m.mapped_id || '');
              const isMapped = !!m.mapped_id;
              const hasPendingChange = pendingMappings[m.raw_id] !== undefined;
              return (
                <TableRow key={m.raw_id} className={isMapped && !hasPendingChange ? 'opacity-70' : ''}>
                  <TableCell>{isMapped && !hasPendingChange ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />}</TableCell>
                  <TableCell className="font-medium">{m.raw_name}</TableCell>
                  <TableCell>
                    <Select value={currentType || 'none'} onValueChange={v => { setPending(m.raw_id, 'mapped_type', v === 'none' ? '' : v); setPending(m.raw_id, 'mapped_id', ''); }}>
                      <SelectTrigger className="w-28 h-8 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none" disabled>Select...</SelectItem>
                        <SelectItem value="client">Client</SelectItem>
                        <SelectItem value="site">Site</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    {currentType === 'client' && (
                      <Select value={currentId || 'none'} onValueChange={v => setPending(m.raw_id, 'mapped_id', v === 'none' ? '' : v)}>
                        <SelectTrigger className="w-52 h-8 text-sm"><SelectValue placeholder="Select client..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none" disabled>Select client...</SelectItem>
                          {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                    {currentType === 'site' && (
                      <Select value={currentId || 'none'} onValueChange={v => setPending(m.raw_id, 'mapped_id', v === 'none' ? '' : v)}>
                        <SelectTrigger className="w-52 h-8 text-sm"><SelectValue placeholder="Select site..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none" disabled>Select site...</SelectItem>
                          {sites.map(s => { const p = clients.find(c => c.id === s.client_id); return <SelectItem key={s.id} value={s.id}>{s.name}{p ? ` (${p.name})` : ''}</SelectItem>; })}
                        </SelectContent>
                      </Select>
                    )}
                    {!currentType && isMapped && <span className="text-sm text-muted-foreground">{m.mapped_name}</span>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {currentType === 'site' && currentId ? (() => { const s = sites.find(s => s.id === currentId); const p = clients.find(c => c.id === s?.client_id); return p?.name || '—'; })() : currentType === 'client' ? '—' : m.parent_client_name || '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {(hasPendingChange || !isMapped) && (
                        <Button size="sm" className="h-7 text-xs" onClick={() => saveMapping(m)} disabled={saving[m.raw_id]}>
                          <Link2 className="h-3 w-3 mr-1" />{saving[m.raw_id] ? 'Saving...' : 'Map'}
                        </Button>
                      )}
                      {!isMapped && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                          setCreatingClient(m.raw_id);
                          setNewClientForm({ name: m.raw_name, code: m.raw_name.slice(0,6).toUpperCase().replace(/[^A-Z0-9]/g,''), service_category: 'mixed_services' });
                        }}>
                          <UserPlus className="h-3 w-3 mr-1" />New
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent></Card>

      {/* Create New Client Dialog */}
      {mappings.map(m => m.raw_id === creatingClient ? (
        <Dialog key={m.raw_id} open={true} onOpenChange={() => setCreatingClient(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Create Web Services Client</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">Creating a new Web Services client for "<strong>{m.raw_name}</strong>"</p>
            <div className="space-y-4 py-2">
              <div><Label>Client Name *</Label><input className="w-full mt-1 border rounded px-3 py-2 text-sm bg-background" value={newClientForm.name} onChange={e => setNewClientForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div><Label>Client Code *</Label><input className="w-full mt-1 border rounded px-3 py-2 text-sm bg-background uppercase" value={newClientForm.code} onChange={e => setNewClientForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} maxLength={10} /></div>
              <div><Label>Service Category</Label>
                <Select value={newClientForm.service_category} onValueChange={v => setNewClientForm(f => ({ ...f, service_category: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="web_hosting">Web Hosting</SelectItem>
                    <SelectItem value="email_only">Email Only</SelectItem>
                    <SelectItem value="domain_only">Domain Only</SelectItem>
                    <SelectItem value="broadband">Broadband</SelectItem>
                    <SelectItem value="mixed_services">Mixed Services</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreatingClient(null)}>Cancel</Button>
              <Button onClick={() => createClientAndMap(m)} disabled={savingNewClient}>{savingNewClient ? 'Creating...' : 'Create & Map'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null)}
    </div>
  );
}

// ─────────────────────────────────────────────
// Hosting Domains Tab (new)
// ─────────────────────────────────────────────
function HostingDomainsTab({ clients: initialClients }) {
  const [accounts, setAccounts] = useState([]);
  const [clients, setClients] = useState(initialClients);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [saving, setSaving] = useState({});
  const [expandedDomains, setExpandedDomains] = useState({});
  const [creatingFor, setCreatingFor] = useState(null); // primary_domain
  const [newClientForm, setNewClientForm] = useState({ name: '', code: '', service_category: 'web_hosting' });
  const [savingNewClient, setSavingNewClient] = useState(false);

  useEffect(() => { fetchAccounts(); }, []);

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/hosting/accounts');
      setAccounts(res.data);
    } catch (e) {
      toast.error('Failed to load hosting accounts');
    } finally {
      setLoading(false);
    }
  };

  const [syncing, setSyncing] = useState(false);

  const syncAllToSupportCount = async () => {
    const confirmed = window.confirm(
      `Add all ${mappedCount} mapped hosting accounts to the current month's support count?\n\nClients already in the count won't be duplicated.`
    );
    if (!confirmed) return;
    setSyncing(true);
    try {
      const res = await apiClient.post('/hosting/sync-to-support-count');
      toast.success(res.data.message);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to sync');
    } finally {
      setSyncing(false);
    }
  };

  const mapAccount = async (primaryDomain, clientId) => {
    setSaving(prev => ({ ...prev, [primaryDomain]: true }));
    try {
      await apiClient.put(`/hosting/accounts/${encodeURIComponent(primaryDomain)}/map`, { client_id: clientId || null });
      toast.success(clientId ? 'Domain mapped' : 'Domain unmapped');
      fetchAccounts();
    } catch (e) {
      toast.error('Failed to save');
    } finally {
      setSaving(prev => ({ ...prev, [primaryDomain]: false }));
    }
  };

  const createClientAndMap = async () => {
    if (!newClientForm.name || !newClientForm.code) { toast.error('Name and code are required'); return; }
    setSavingNewClient(true);
    try {
      const clientRes = await apiClient.post('/clients', {
        name: newClientForm.name,
        code: newClientForm.code.toUpperCase(),
        client_type: 'web_services',
        service_category: newClientForm.service_category,
        contract_type: 'monthly',
      });
      const newClient = clientRes.data;
      await apiClient.put(`/hosting/accounts/${encodeURIComponent(creatingFor)}/map`, { client_id: newClient.id });
      toast.success(`Created "${newClient.name}" and mapped ${creatingFor}`);
      setClients(prev => [...prev, newClient]);
      setCreatingFor(null);
      setNewClientForm({ name: '', code: '', service_category: 'web_hosting' });
      fetchAccounts();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to create client');
    } finally {
      setSavingNewClient(false);
    }
  };

  const filtered = accounts.filter(a => {
    if (filter === 'mapped' && !a.client_id) return false;
    if (filter === 'unmapped' && a.client_id) return false;
    if (search) {
      const q = search.toLowerCase();
      return a.primary_domain.toLowerCase().includes(q) ||
        (a.all_domains || []).some(d => d.toLowerCase().includes(q)) ||
        (clients.find(c => c.id === a.client_id)?.name || '').toLowerCase().includes(q);
    }
    return true;
  });

  const mappedCount = accounts.filter(a => a.client_id).length;
  const unmappedCount = accounts.filter(a => !a.client_id).length;

  if (loading) return <div className="py-8 text-center text-muted-foreground">Loading hosting accounts...</div>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Map each hosting account to a SynthOps client. Mapped domains appear automatically on the Support Count.
        Use <strong>New</strong> to create a Web Services client on the spot.
      </p>

      <div className="grid grid-cols-3 gap-4">
        {[['Total Accounts', accounts.length, ''], ['Mapped', mappedCount, 'text-green-500'], ['Unmapped', unmappedCount, unmappedCount > 0 ? 'text-amber-500' : 'text-green-500']].map(([label, val, cls]) => (
          <Card key={label}><CardContent className="pt-4 pb-4"><p className="text-sm text-muted-foreground">{label}</p><p className={`text-2xl font-bold mt-1 ${cls}`}>{val}</p></CardContent></Card>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 max-w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search domain or client..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2">
          {['all', 'unmapped', 'mapped'].map(f => (
            <Button key={f} size="sm" variant={filter === f ? 'default' : 'outline'} onClick={() => setFilter(f)} className="capitalize">{f}</Button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={fetchAccounts}><RefreshCw className="h-4 w-4 mr-1" /> Refresh</Button>
        {mappedCount > 0 && (
          <Button size="sm" onClick={syncAllToSupportCount} disabled={syncing}>
            {syncing ? 'Syncing...' : `Sync ${mappedCount} Mapped to Support Count`}
          </Button>
        )}
      </div>

      <Card><CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Primary Domain</TableHead>
              <TableHead>All Domains</TableHead>
              <TableHead>Package</TableHead>
              <TableHead>SSL</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Map to Client</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">{filter === 'unmapped' ? '🎉 All hosting accounts are mapped!' : 'No results'}</TableCell></TableRow>
            ) : filtered.map(a => {
              const isMapped = !!a.client_id;
              const extraDomains = (a.all_domains || []).filter(d => d !== a.primary_domain);
              const isExpanded = expandedDomains[a.primary_domain];

              return (
                <TableRow key={a.primary_domain} className={isMapped ? 'opacity-80' : ''}>
                  <TableCell>
                    {isMapped ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />}
                  </TableCell>

                  <TableCell className="font-medium font-mono text-sm">
                    <div className="flex items-center gap-1.5">
                      <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      {a.primary_domain}
                    </div>
                  </TableCell>

                  <TableCell>
                    {extraDomains.length === 0 ? <span className="text-xs text-muted-foreground">—</span> : (
                      <div>
                        {(isExpanded ? extraDomains : extraDomains.slice(0, 2)).map(d => (
                          <div key={d} className="text-xs text-muted-foreground font-mono">{d}</div>
                        ))}
                        {extraDomains.length > 2 && (
                          <button className="text-xs text-blue-500 hover:underline mt-0.5"
                            onClick={() => setExpandedDomains(prev => ({ ...prev, [a.primary_domain]: !isExpanded }))}>
                            {isExpanded ? 'Show less' : `+${extraDomains.length - 2} more`}
                          </button>
                        )}
                      </div>
                    )}
                  </TableCell>

                  <TableCell><span className="text-xs text-muted-foreground">{a.package || '—'}</span></TableCell>

                  <TableCell>
                    {a.has_ssl ? <ShieldCheck className="h-4 w-4 text-green-500" /> : <ShieldOff className="h-4 w-4 text-gray-400" />}
                  </TableCell>

                  <TableCell>
                    {a.enabled
                      ? <Badge variant="outline" className="text-xs text-green-600 border-green-500">Active</Badge>
                      : <Badge variant="outline" className="text-xs text-gray-500">Disabled</Badge>}
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Select
                        value={a.client_id || 'none'}
                        onValueChange={v => mapAccount(a.primary_domain, v === 'none' ? null : v)}
                        disabled={saving[a.primary_domain]}
                      >
                        <SelectTrigger className="w-44 h-8 text-sm"><SelectValue placeholder="Select client..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— Unmapped —</SelectItem>
                          {clients.map(c => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}{c.client_type === 'web_services' && ' ★'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {!isMapped && (
                        <Button size="sm" variant="outline" className="h-8 text-xs px-2 shrink-0"
                          onClick={() => {
                            const name = a.primary_domain.replace(/\.(co\.uk|com|org|net|uk)$/, '');
                            setCreatingFor(a.primary_domain);
                            setNewClientForm({
                              name,
                              code: name.slice(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, ''),
                              service_category: 'web_hosting',
                            });
                          }}>
                          <UserPlus className="h-3 w-3 mr-1" />New
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent></Card>

      {/* Create New Web Services Client Dialog */}
      <Dialog open={!!creatingFor} onOpenChange={() => setCreatingFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Create Web Services Client</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Creating a new Web Services client for <strong>{creatingFor}</strong>. It will appear in Support Count but not in monitoring views.
          </p>
          <div className="space-y-4 py-2">
            <div><Label>Client Name *</Label>
              <input className="w-full mt-1 border rounded px-3 py-2 text-sm bg-background" value={newClientForm.name}
                onChange={e => setNewClientForm(f => ({ ...f, name: e.target.value }))} placeholder="Client name..." />
            </div>
            <div><Label>Client Code * <span className="text-muted-foreground text-xs">(short unique code)</span></Label>
              <input className="w-full mt-1 border rounded px-3 py-2 text-sm bg-background uppercase" value={newClientForm.code}
                onChange={e => setNewClientForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} maxLength={10} />
            </div>
            <div><Label>Service Category</Label>
              <Select value={newClientForm.service_category} onValueChange={v => setNewClientForm(f => ({ ...f, service_category: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="web_hosting">Web Hosting</SelectItem>
                  <SelectItem value="email_only">Email Only</SelectItem>
                  <SelectItem value="domain_only">Domain Only</SelectItem>
                  <SelectItem value="broadband">Broadband</SelectItem>
                  <SelectItem value="mixed_services">Mixed Services</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatingFor(null)}>Cancel</Button>
            <Button onClick={createClientAndMap} disabled={savingNewClient}>
              {savingNewClient ? 'Creating...' : 'Create & Map'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────
export default function SupportMappings() {
  const [clients, setClients] = useState([]);
  const [sites, setSites] = useState([]);
  const [loadingShared, setLoadingShared] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [clientsRes, sitesRes] = await Promise.all([
          apiClient.get('/clients'),
          apiClient.get('/sites'),
        ]);
        setClients(clientsRes.data);
        setSites(sitesRes.data);
      } catch (e) {
        toast.error('Failed to load client data');
      } finally {
        setLoadingShared(false);
      }
    };
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Support Mappings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Map historical spreadsheet names and hosting accounts to SynthOps clients.
        </p>
      </div>

      {loadingShared ? (
        <div className="py-8 text-center text-muted-foreground">Loading...</div>
      ) : (
        <Tabs defaultValue="names">
          <TabsList>
            <TabsTrigger value="names">Name Mappings</TabsTrigger>
            <TabsTrigger value="hosting">Hosting Domains</TabsTrigger>
          </TabsList>
          <TabsContent value="names" className="mt-4">
            <NameMappingsTab clients={clients} sites={sites} />
          </TabsContent>
          <TabsContent value="hosting" className="mt-4">
            <HostingDomainsTab clients={clients} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
