import React, { useState, useEffect } from 'react';
import { apiClient } from '../App';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import { CheckCircle2, Circle, Search, Link2, AlertTriangle, RefreshCw, UserPlus } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../components/ui/dialog';
import { Label } from '../components/ui/label';

export default function SupportMappings() {
  const [mappings, setMappings] = useState([]);
  const [clients, setClients] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState({});
  const [creatingClient, setCreatingClient] = useState(null); // raw_id being used to create
  const [newClientForm, setNewClientForm] = useState({ name: '', code: '', service_category: 'mixed_services' });
  const [savingNewClient, setSavingNewClient] = useState(false);
  const [pendingMappings, setPendingMappings] = useState({});
  const [filter, setFilter] = useState('all'); // all, mapped, unmapped

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [mappingsRes, clientsRes, sitesRes] = await Promise.all([
        apiClient.get('/support/mappings'),
        apiClient.get('/clients'),
        apiClient.get('/sites'),
      ]);
      setMappings(mappingsRes.data);
      setClients(clientsRes.data);
      setSites(sitesRes.data);
    } catch (e) {
      toast.error('Failed to load mappings');
    } finally {
      setLoading(false);
    }
  };

  const setPending = (rawId, field, value) => {
    setPendingMappings(prev => ({
      ...prev,
      [rawId]: { ...(prev[rawId] || {}), [field]: value },
    }));
  };

  const getPending = (rawId, field, fallback) => {
    return pendingMappings[rawId]?.[field] ?? fallback;
  };

  const createClientAndMap = async (mapping) => {
    if (!newClientForm.name || !newClientForm.code) {
      toast.error('Name and code are required');
      return;
    }
    setSavingNewClient(true);
    try {
      // Create the client
      const clientRes = await apiClient.post('/clients', {
        name: newClientForm.name,
        code: newClientForm.code.toUpperCase(),
        client_type: 'service_only',
        service_category: newClientForm.service_category,
        contract_type: 'monthly',
      });
      const newClient = clientRes.data;

      // Now map to the new client
      const result = await apiClient.post('/support/mappings', {
        raw_id: mapping.raw_id,
        raw_name: mapping.raw_name,
        mapped_type: 'client',
        mapped_id: newClient.id,
        mapped_name: newClient.name,
        parent_client_id: newClient.id,
        parent_client_name: newClient.name,
      });

      toast.success(`Created "${newClient.name}" and mapped ${result.data.snapshots_updated} snapshots`);
      setCreatingClient(null);
      setNewClientForm({ name: '', code: '', service_category: 'mixed_services' });
      await fetchAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to create client');
    } finally {
      setSavingNewClient(false);
    }
  };

  const saveMapping = async (mapping) => {
    const pending = pendingMappings[mapping.raw_id] || {};
    const mappedType = pending.mapped_type || mapping.mapped_type;
    const mappedId = pending.mapped_id || mapping.mapped_id;

    if (!mappedType || !mappedId) {
      toast.error('Please select a type and a client or site');
      return;
    }

    // Get the name and parent client for the mapped item
    let mappedName = '';
    let parentClientId = '';
    let parentClientName = '';

    if (mappedType === 'client') {
      const client = clients.find(c => c.id === mappedId);
      mappedName = client?.name || mappedId;
      parentClientId = mappedId;
      parentClientName = mappedName;
    } else {
      const site = sites.find(s => s.id === mappedId);
      mappedName = site?.name || mappedId;
      const parentClient = clients.find(c => c.id === site?.client_id);
      parentClientId = site?.client_id || '';
      parentClientName = parentClient?.name || '';
    }

    setSaving(prev => ({ ...prev, [mapping.raw_id]: true }));
    try {
      const result = await apiClient.post('/support/mappings', {
        raw_id: mapping.raw_id,
        raw_name: mapping.raw_name,
        mapped_type: mappedType,
        mapped_id: mappedId,
        mapped_name: mappedName,
        parent_client_id: parentClientId,
        parent_client_name: parentClientName,
      });

      toast.success(
        `Mapped "${mapping.raw_name}" → ${mappedName}. Updated ${result.data.snapshots_updated} snapshots.`
      );

      // Clear pending for this item
      setPendingMappings(prev => {
        const next = { ...prev };
        delete next[mapping.raw_id];
        return next;
      });

      // Refresh mappings
      await fetchAll();
    } catch (e) {
      toast.error('Failed to save mapping');
    } finally {
      setSaving(prev => ({ ...prev, [mapping.raw_id]: false }));
    }
  };

  // Filter sites by selected client (for the site dropdown)
  const sitesForClient = (clientId) => {
    if (!clientId) return sites;
    return sites.filter(s => s.client_id === clientId);
  };

  const filtered = mappings.filter(m => {
    if (filter === 'mapped' && !m.mapped_id) return false;
    if (filter === 'unmapped' && m.mapped_id) return false;
    if (search) {
      return m.raw_name.toLowerCase().includes(search.toLowerCase());
    }
    return true;
  });

  const mappedCount = mappings.filter(m => m.mapped_id).length;
  const unmappedCount = mappings.filter(m => !m.mapped_id).length;

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Loading mappings...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Support Data Mappings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Link spreadsheet client names to SynthOps clients or sites. Sites will appear indented under their parent client in the Support Count view.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">Total Unresolved</p>
            <p className="text-2xl font-bold mt-1">{mappings.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">Mapped</p>
            <p className="text-2xl font-bold mt-1 text-green-500">{mappedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">Still Unresolved</p>
            <p className={`text-2xl font-bold mt-1 ${unmappedCount > 0 ? 'text-amber-500' : 'text-green-500'}`}>
              {unmappedCount}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search names..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {['all', 'unmapped', 'mapped'].map(f => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? 'default' : 'outline'}
              onClick={() => setFilter(f)}
              className="capitalize"
            >
              {f}
            </Button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={fetchAll}>
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      {/* Mappings table */}
      <Card>
        <CardContent className="p-0">
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
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {filter === 'unmapped' ? '🎉 All names are mapped!' : 'No results found'}
                  </TableCell>
                </TableRow>
              ) : filtered.map(m => {
                const currentType = getPending(m.raw_id, 'mapped_type', m.mapped_type || '');
                const currentId = getPending(m.raw_id, 'mapped_id', m.mapped_id || '');
                const isMapped = !!m.mapped_id;
                const hasPendingChange = pendingMappings[m.raw_id] !== undefined;

                return (
                  <TableRow key={m.raw_id} className={isMapped && !hasPendingChange ? 'opacity-70' : ''}>
                    {/* Status icon */}
                    <TableCell>
                      {isMapped && !hasPendingChange
                        ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                        : <AlertTriangle className="h-4 w-4 text-amber-500" />
                      }
                    </TableCell>

                    {/* Raw name */}
                    <TableCell className="font-medium">{m.raw_name}</TableCell>

                    {/* Type selector */}
                    <TableCell>
                      <Select
                        value={currentType || 'none'}
                        onValueChange={v => {
                          setPending(m.raw_id, 'mapped_type', v === 'none' ? '' : v);
                          setPending(m.raw_id, 'mapped_id', ''); // reset selection
                        }}
                      >
                        <SelectTrigger className="w-28 h-8 text-sm">
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none" disabled>Select...</SelectItem>
                          <SelectItem value="client">Client</SelectItem>
                          <SelectItem value="site">Site</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>

                    {/* Client or site selector */}
                    <TableCell>
                      {currentType === 'client' && (
                        <Select
                          value={currentId || 'none'}
                          onValueChange={v => setPending(m.raw_id, 'mapped_id', v === 'none' ? '' : v)}
                        >
                          <SelectTrigger className="w-52 h-8 text-sm">
                            <SelectValue placeholder="Select client..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none" disabled>Select client...</SelectItem>
                            {clients.map(c => (
                              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {currentType === 'site' && (
                        <Select
                          value={currentId || 'none'}
                          onValueChange={v => setPending(m.raw_id, 'mapped_id', v === 'none' ? '' : v)}
                        >
                          <SelectTrigger className="w-52 h-8 text-sm">
                            <SelectValue placeholder="Select site..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none" disabled>Select site...</SelectItem>
                            {sites.map(s => {
                              const parent = clients.find(c => c.id === s.client_id);
                              return (
                                <SelectItem key={s.id} value={s.id}>
                                  {s.name} {parent ? `(${parent.name})` : ''}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      )}
                      {!currentType && isMapped && (
                        <span className="text-sm text-muted-foreground">{m.mapped_name}</span>
                      )}
                    </TableCell>

                    {/* Parent client (for sites) */}
                    <TableCell className="text-sm text-muted-foreground">
                      {currentType === 'site' && currentId ? (
                        (() => {
                          const site = sites.find(s => s.id === currentId);
                          const parent = clients.find(c => c.id === site?.client_id);
                          return parent?.name || '—';
                        })()
                      ) : currentType === 'client' ? (
                        '—'
                      ) : (
                        m.parent_client_name || '—'
                      )}
                    </TableCell>

                    {/* Save button */}
                    <TableCell>
                      <div className="flex gap-1">
                        {(hasPendingChange || !isMapped) && (
                          <Button
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => saveMapping(m)}
                            disabled={saving[m.raw_id]}
                          >
                            <Link2 className="h-3 w-3 mr-1" />
                            {saving[m.raw_id] ? 'Saving...' : 'Map'}
                          </Button>
                        )}
                        {!isMapped && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => {
                              setCreatingClient(m.raw_id);
                              setNewClientForm({ name: m.raw_name, code: m.raw_name.slice(0,6).toUpperCase().replace(/[^A-Z0-9]/g,''), service_category: 'mixed_services' });
                            }}
                          >
                            <UserPlus className="h-3 w-3 mr-1" />
                            New
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {/* Create New Service Only Client Dialog */}
      {mappings.map(m => m.raw_id === creatingClient ? (
        <Dialog key={m.raw_id} open={true} onOpenChange={() => setCreatingClient(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create Service Only Client</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Creating a new Service Only client for "<strong>{m.raw_name}</strong>" — this client won't appear in NOC or monitoring views.
            </p>
            <div className="space-y-4 py-2">
              <div>
                <Label>Client Name *</Label>
                <input
                  className="w-full mt-1 border rounded px-3 py-2 text-sm bg-background"
                  value={newClientForm.name}
                  onChange={e => setNewClientForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Client name..."
                />
              </div>
              <div>
                <Label>Client Code * <span className="text-muted-foreground text-xs">(short unique code)</span></Label>
                <input
                  className="w-full mt-1 border rounded px-3 py-2 text-sm bg-background uppercase"
                  value={newClientForm.code}
                  onChange={e => setNewClientForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                  placeholder="e.g. ACME"
                  maxLength={10}
                />
              </div>
              <div>
                <Label>Service Category</Label>
                <Select value={newClientForm.service_category} onValueChange={v => setNewClientForm(f => ({ ...f, service_category: v }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
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
              <Button onClick={() => createClientAndMap(m)} disabled={savingNewClient}>
                {savingNewClient ? 'Creating...' : 'Create & Map'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null)}
    </div>
  );
}
