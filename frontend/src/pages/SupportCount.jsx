import React, { useState, useEffect } from 'react';
import { apiClient } from '../App';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetDescription,
} from '../components/ui/sheet';
import { Save, Download, Search, ChevronLeft, ChevronRight, Edit, X, Plus, Copy, Lock, Unlock, Trash2, Globe } from 'lucide-react';

const CATEGORY_LABELS = {
  security: 'Security', backup: 'Backup', devices: 'Devices', onsite: 'Onsite',
  connectivity: 'Connectivity', hosting: 'Hosting', office365: 'Office 365', other: 'Other',
};

const CATEGORY_COLOURS = {
  security:     'bg-red-100/50 dark:bg-red-900/30 text-red-800 dark:text-red-300',
  backup:       'bg-orange-100/50 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300',
  devices:      'bg-blue-100/50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
  onsite:       'bg-indigo-100/50 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-300',
  connectivity: 'bg-cyan-100/50 dark:bg-cyan-900/30 text-cyan-800 dark:text-cyan-300',
  hosting:      'bg-teal-100/50 dark:bg-teal-900/30 text-teal-800 dark:text-teal-300',
  office365:    'bg-purple-100/50 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300',
  other:        'bg-gray-100/50 dark:bg-gray-800/50 text-gray-800 dark:text-gray-300',
};

const stickyBg = (idx, isEditing) => {
  if (isEditing) return 'bg-accent';
  return idx % 2 === 0 ? 'bg-white dark:bg-gray-950' : 'bg-gray-50 dark:bg-gray-900';
};

export default function SupportCount() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [editingRow, setEditingRow] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [hiddenCategories, setHiddenCategories] = useState({});
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [addClientId, setAddClientId] = useState('');
  const [allClients, setAllClients] = useState([]);
  const [wiping, setWiping] = useState(false);
  const [copyingMonth, setCopyingMonth] = useState(false);
  const [rollingOver, setRollingOver] = useState(false);
  const [remarksPopup, setRemarksPopup] = useState(null);  // { client, text } | null
  const [domainsPopup, setDomainsPopup] = useState(null);  // { client, domains } | null

  const wipeMonth = async () => {
    const confirmed = window.confirm(
      `⚠️ WIPE ENTIRE MONTH?\n\nThis permanently deletes ALL ${filteredRows.length} rows from ${formatMonthLabel(selectedMonth)}.\n\nThis cannot be undone. Are you absolutely sure?`
    );
    if (!confirmed) return;
    const confirmed2 = window.confirm(`Last chance — delete everything in ${formatMonthLabel(selectedMonth)}?`);
    if (!confirmed2) return;
    setWiping(true);
    try {
      const res = await apiClient.delete(`/support/monthly-count/wipe-month?month=${selectedMonth}`);
      toast.success(`Wiped ${res.data.deleted} rows from ${formatMonthLabel(selectedMonth)}`);
      fetchData(selectedMonth);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to wipe month');
    } finally {
      setWiping(false);
    }
  };
  const [locks, setLocks] = useState({});
  const [lockingMonth, setLockingMonth] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // client_id to delete
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    fetchData(selectedMonth);
    fetchLocks();
    if (allClients.length === 0) {
      apiClient.get('/clients').then(r => setAllClients(r.data)).catch(() => {});
    }
    apiClient.get('/auth/me').then(r => setCurrentUser(r.data)).catch(() => {});
  }, [selectedMonth]);

  const fetchData = async (month) => {
    setLoading(true);
    try {
      const url = month ? `/support/monthly-count?month=${month}` : '/support/monthly-count';
      const res = await apiClient.get(url);
      setData(res.data);
      if (!selectedMonth && res.data.month) setSelectedMonth(res.data.month);
    } catch (e) {
      toast.error('Failed to load support count data');
    } finally {
      setLoading(false);
    }
  };

  const fetchLocks = async () => {
    try {
      const res = await apiClient.get('/support/monthly-count/locks');
      setLocks(res.data || {});
    } catch (e) {}
  };

  const isAdmin = currentUser?.role === 'admin';
  const isLocked = locks[selectedMonth]?.locked === true;

  const startEdit = (row) => {
    if (isLocked) { toast.error('This month is locked'); return; }
    setEditingRow(row.snapshot_key || row.client_id);
    setEditValues({
      support_type: row.support_type || '',
      products: { ...row.products },
      remarks: row.remarks || '',
    });
  };

  const cancelEdit = () => { setEditingRow(null); setEditValues({}); };

  const saveRow = async (row) => {
    setSaving(true);
    try {
      await apiClient.put(`/support/monthly-count/${row.client_id}`, {
        month: selectedMonth,
        site_name: row.site_name || null,
        ...editValues,
      });
      toast.success('Saved');
      setEditingRow(null);
      fetchData(selectedMonth);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const deleteClientFromMonth = async (clientId) => {
    try {
      await apiClient.delete(`/support/monthly-count/${clientId}?month=${selectedMonth}`);
      toast.success('Removed from month');
      setDeleteConfirm(null);
      fetchData(selectedMonth);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to remove');
    }
  };

  const toggleLock = async () => {
    if (!isAdmin) { toast.error('Only admins can lock/unlock months'); return; }
    setLockingMonth(true);
    try {
      if (isLocked) {
        await apiClient.post(`/support/monthly-count/${selectedMonth}/unlock`);
        toast.success(`${formatMonthLabel(selectedMonth)} unlocked`);
      } else {
        await apiClient.post(`/support/monthly-count/${selectedMonth}/lock`);
        toast.success(`${formatMonthLabel(selectedMonth)} locked`);
      }
      fetchLocks();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to change lock');
    } finally {
      setLockingMonth(false);
    }
  };

  const addClientToMonth = async () => {
    if (!addClientId) { toast.error('Please select a client'); return; }
    const client = allClients.find(c => c.id === addClientId);
    if (!client) return;
    try {
      await apiClient.put(`/support/monthly-count/${addClientId}`, {
        month: selectedMonth, support_type: null, products: {}, remarks: null,
      });
      toast.success(`${client.name} added to ${selectedMonth}`);
      setAddClientOpen(false);
      setAddClientId('');
      fetchData(selectedMonth);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to add client');
    }
  };

  const copyFromPreviousMonth = async () => {
    if (!data?.available_months?.length) return;
    const months = [...data.available_months].sort();
    const idx = months.indexOf(selectedMonth);
    if (idx <= 0) { toast.error('No previous month available'); return; }
    const prevMonth = months[idx - 1];
    const confirmed = window.confirm(
      `Copy all data from ${formatMonthLabel(prevMonth)} into ${formatMonthLabel(selectedMonth)}?\n\nOnly fills in clients that don't already have data this month.`
    );
    if (!confirmed) return;
    setCopyingMonth(true);
    try {
      const res = await apiClient.post('/support/monthly-count/copy-from-previous', {
        target_month: selectedMonth, source_month: prevMonth,
      });
      toast.success(`Copied ${res.data.copied} clients from ${formatMonthLabel(prevMonth)}`);
      fetchData(selectedMonth);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to copy');
    } finally {
      setCopyingMonth(false);
    }
  };

  const rolloverToNextMonth = async () => {
    if (!isAdmin) { toast.error('Only admins can roll over months'); return; }
    const confirmed = window.confirm(
      `Roll over to next month?\n\nThis will:\n• Lock the current live month\n• Create a fresh sheet for next month, copying current values\n• Skip any clients marked as removed\n\nThis is also done automatically at 00:05 on the 1st of each month.\n\nContinue?`
    );
    if (!confirmed) return;
    setRollingOver(true);
    try {
      const res = await apiClient.post('/support/monthly-count/rollover');
      const r = res.data;
      toast.success(
        `Locked ${formatMonthLabel(r.from_month)}, opened ${formatMonthLabel(r.to_month)}. ` +
        `${r.copied} clients carried forward` +
        (r.skipped_removed > 0 ? `, ${r.skipped_removed} removed clients skipped` : '') +
        (r.skipped_already_present > 0 ? `, ${r.skipped_already_present} already in next month` : '') +
        '.'
      );
      // Jump the picker to the new live month and refresh
      setSelectedMonth(r.to_month);
      fetchData(r.to_month);
      fetchLocks();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to roll over');
    } finally {
      setRollingOver(false);
    }
  };

  const navigateMonth = (direction) => {
    if (!data?.available_months?.length) return;
    const months = [...data.available_months].sort();
    const idx = months.indexOf(selectedMonth);
    if (direction === 'prev' && idx > 0) setSelectedMonth(months[idx - 1]);
    if (direction === 'next' && idx < months.length - 1) setSelectedMonth(months[idx + 1]);
  };

  const exportCSV = () => {
    if (!data) return;
    const products = data.products;
    const headers = ['Client', 'Support Type', ...products.map(p => p.name), 'Remarks'];
    const rows = filteredRows.map(row => [
      row.client_name, row.support_type || '',
      ...products.map(p => { const v = row.products?.[p.name]; return v !== undefined && v !== null ? v : ''; }),
      row.remarks || '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `support-count-${selectedMonth}.csv`; a.click();
  };

  const toggleCategory = (cat) => setHiddenCategories(prev => ({ ...prev, [cat]: !prev[cat] }));

  const formatMonthLabel = (m) => {
    if (!m) return '';
    const [year, month] = m.split('-');
    return new Date(parseInt(year), parseInt(month) - 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' });
  };

  const filteredRows = data?.rows?.filter(row => {
    if (!search) return true;
    const s = search.toLowerCase();
    if ((row.client_name || '').toLowerCase().includes(s)) return true;
    if ((row.parent_client_name || '').toLowerCase().includes(s)) return true;
    // hosting_domains is an array of strings (e.g. ["acme.co.uk", "acme.com"])
    if (Array.isArray(row.hosting_domains) && row.hosting_domains.some(d => (typeof d === 'string' ? d : '').toLowerCase().includes(s))) return true;
    return false;
  }) || [];

  // Build a sorted list of distinct clients to show in the search dropdown.
  // Sites are tagged with their parent so the user can disambiguate.
  const clientSuggestions = (() => {
    if (!data?.rows) return [];
    const seen = new Set();
    const list = [];
    for (const row of data.rows) {
      const name = row.client_name;
      if (!name || seen.has(name)) continue;
      seen.add(name);
      list.push({
        name,
        is_site: !!row.is_site,
        parent: row.parent_client_name || null,
      });
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  })();

  const filteredSuggestions = (() => {
    if (!search) return clientSuggestions.slice(0, 50);
    const s = search.toLowerCase();
    return clientSuggestions.filter(c =>
      c.name.toLowerCase().includes(s) ||
      (c.parent || '').toLowerCase().includes(s)
    ).slice(0, 50);
  })();

  const productsByCategory = {};
  (data?.products || []).forEach(p => {
    if (!productsByCategory[p.category]) productsByCategory[p.category] = [];
    productsByCategory[p.category].push(p);
  });

  const visibleProducts = (data?.products || []).filter(p => !hiddenCategories[p.category]);

  const renderCellValue = (product, value, row) => {
    // Determine display value: manual edit wins over Giacom.
    // A product key explicitly present in row.products (even if 0 or null)
    // is a deliberate manual override and beats Giacom. Only fall back to
    // Giacom when the user has never touched this field.
    const hasManualOverride = row?.products && Object.prototype.hasOwnProperty.call(row.products, product.name);
    const giacomVal = row?.giacom_products?.[product.name];
    const giacomHasValue = giacomVal !== undefined && giacomVal !== null;

    let displayVal;
    let fromGiacom = false;
    if (hasManualOverride) {
      displayVal = value;  // could be 0 — that's still a deliberate value
    } else if (giacomHasValue) {
      displayVal = giacomVal;
      fromGiacom = true;
    } else {
      displayVal = undefined;
    }

    if (displayVal === null || displayVal === undefined || displayVal === '') {
      if (product.name === 'Domain Name' && row?.hosting_domains?.length > 0) {
        return (
          <div className="flex flex-wrap gap-0.5">
            {row.hosting_domains.map(d => (
              <span key={d} className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-mono">
                <Globe className="h-2.5 w-2.5 shrink-0" />{d}
              </span>
            ))}
          </div>
        );
      }
      return <span className="text-gray-300">—</span>;
    }

    if (product.name === 'Domain Name' && row?.hosting_domains?.length > 0) {
      return (
        <div className="space-y-0.5">
          {displayVal !== null && displayVal !== undefined && displayVal !== '' && (
            <div><span className="text-sm font-medium">{displayVal}</span></div>
          )}
          <div className="flex flex-wrap gap-0.5">
            {row.hosting_domains.map(d => (
              <span key={d} className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-mono">
                <Globe className="h-2.5 w-2.5 shrink-0" />{d}
              </span>
            ))}
          </div>
        </div>
      );
    }

    if (product.unit === 'yes/no') return displayVal ? <span className="text-green-600 font-medium">✓</span> : <span className="text-gray-300">—</span>;
    if (product.unit === 'gb') return <span className="text-xs">{displayVal}GB</span>;
    // Show a tooltip when a manual override differs from Giacom — purple still
    // indicates "this number came from Giacom"; default colour means "this is
    // your manual entry". If the manual value differs from what Giacom would
    // have shown, surface that in the title for awareness.
    const overridesGiacom = hasManualOverride && giacomHasValue && giacomVal !== value;
    return (
      <span
        className={`text-sm font-medium ${fromGiacom ? 'text-purple-600 dark:text-purple-400' : ''}`}
        title={fromGiacom ? 'From Giacom' : (overridesGiacom ? `Manual override (Giacom: ${giacomVal})` : '')}
      >
        {displayVal}
      </span>
    );
  };

  const renderEditCell = (product, editVals, setEditVals) => {
    const current = editVals.products?.[product.name];
    if (product.unit === 'yes/no') {
      return <input type="checkbox" checked={!!current} onChange={e => setEditVals(v => ({ ...v, products: { ...v.products, [product.name]: e.target.checked } }))} className="w-4 h-4" />;
    }
    if (product.unit === 'text') {
      return <input className="w-24 text-xs border rounded px-1 py-0.5" value={current || ''} onChange={e => setEditVals(v => ({ ...v, products: { ...v.products, [product.name]: e.target.value } }))} />;
    }
    return (
      <input type="number" min="0" className="w-16 text-xs border rounded px-1 py-0.5 text-center"
        value={current ?? ''}
        onChange={e => setEditVals(v => ({ ...v, products: { ...v.products, [product.name]: e.target.value === '' ? undefined : Number(e.target.value) } }))}
      />
    );
  };

  const hasPreviousMonth = (() => {
    if (!data?.available_months?.length) return false;
    const months = [...data.available_months].sort();
    return months.indexOf(selectedMonth) > 0;
  })();

  // Current live month = today's calendar month. Rollover is only meaningful
  // when you're looking at the live month.
  const currentLiveMonthStr = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();
  const isViewingCurrentLiveMonth = selectedMonth === currentLiveMonthStr;

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-10 bg-muted rounded animate-pulse w-64" />
        <div className="h-96 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold">Monthly Support Count</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {filteredRows.length} clients · {visibleProducts.length} products shown
            </p>
          </div>
          {isLocked && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs font-medium border border-amber-300 dark:border-amber-700">
              <Lock className="h-3 w-3" /> Locked
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && !isLocked && (
            <Button
              variant="outline"
              size="sm"
              onClick={wipeMonth}
              disabled={wiping || filteredRows.length === 0}
              className="border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              {wiping ? 'Wiping...' : 'Wipe Month'}
            </Button>
          )}
          {isAdmin && (
            <Button
              variant={isLocked ? 'outline' : 'outline'}
              size="sm"
              onClick={toggleLock}
              disabled={lockingMonth}
              className={isLocked ? 'border-amber-400 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20' : ''}
            >
              {isLocked ? <><Unlock className="h-4 w-4 mr-1" /> Unlock Month</> : <><Lock className="h-4 w-4 mr-1" /> Lock Month</>}
            </Button>
          )}
          {isAdmin && isViewingCurrentLiveMonth && (
            <Button
              variant="outline"
              size="sm"
              onClick={rolloverToNextMonth}
              disabled={rollingOver}
              title="Lock this month and open the next one. Auto-runs at 00:05 on the 1st of each month."
              className="border-emerald-400 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
            >
              <Copy className="h-4 w-4 mr-1" /> {rollingOver ? 'Rolling over...' : 'Roll Over to Next Month'}
            </Button>
          )}
          {!isLocked && (
            <Button variant="outline" size="sm" onClick={() => setAddClientOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add Client
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-1" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Month selector + search */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigateMonth('prev')}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-48">
              <SelectValue>{formatMonthLabel(selectedMonth)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(data?.available_months || []).map(m => (
                <SelectItem key={m} value={m}>
                  <span className="flex items-center gap-1.5">
                    {locks[m]?.locked && <Lock className="h-3 w-3 text-amber-500" />}
                    {formatMonthLabel(m)}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigateMonth('next')}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground z-10" />
          <Input
            className="pl-8 h-8 w-64 text-sm"
            placeholder="Search clients, domains..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
            onKeyDown={(e) => { if (e.key === 'Escape') { setSearchOpen(false); e.currentTarget.blur(); } }}
          />
          {search && (
            <button
              type="button"
              onClick={() => { setSearch(''); setSearchOpen(false); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              title="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          {searchOpen && filteredSuggestions.length > 0 && (
            <div className="absolute top-full left-0 mt-1 w-72 bg-popover border rounded-md shadow-lg max-h-72 overflow-y-auto z-50">
              <div className="px-3 py-1.5 text-xs text-muted-foreground border-b sticky top-0 bg-popover">
                {filteredSuggestions.length === clientSuggestions.length
                  ? `${clientSuggestions.length} clients`
                  : `${filteredSuggestions.length} of ${clientSuggestions.length} clients`}
              </div>
              {filteredSuggestions.map(c => (
                <button
                  key={c.name + (c.parent || '')}
                  type="button"
                  className="w-full text-left px-3 py-1.5 hover:bg-accent text-sm border-b last:border-b-0"
                  onMouseDown={(e) => {
                    // Prevent the input losing focus before we can read the click
                    e.preventDefault();
                    setSearch(c.name);
                    setSearchOpen(false);
                  }}
                >
                  <div className="truncate">{c.name}</div>
                  {c.is_site && c.parent && (
                    <div className="text-xs text-muted-foreground truncate">site of {c.parent}</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-1 flex-wrap">
          {Object.entries(productsByCategory).map(([cat, prods]) => (
            <button key={cat} onClick={() => toggleCategory(cat)}
              className={`text-xs px-2 py-1 rounded-full border transition-opacity ${hiddenCategories[cat] ? 'opacity-40' : ''} ${CATEGORY_COLOURS[cat] || ''}`}>
              {CATEGORY_LABELS[cat]} ({prods.length})
            </button>
          ))}
        </div>
      </div>

      {/* Spreadsheet table */}
      <div className="overflow-auto rounded-lg border bg-background" style={{ maxHeight: 'calc(100vh - 260px)' }}>
        <table className="text-xs border-collapse w-full">
          <thead className="sticky top-0 z-20 bg-background">
            <tr className="border-b">
              <th className="sticky left-0 z-30 bg-white dark:bg-gray-950 border-r px-2 py-2 text-center font-bold text-xs" style={{ width: '64px', minWidth: '64px' }} rowSpan={2}>Actions</th>
              <th className="sticky z-30 bg-white dark:bg-gray-950 border-r px-3 py-2 text-left font-bold min-w-52 text-sm" style={{ left: '64px' }} rowSpan={2}>Client</th>
              <th className="border-r px-2 py-2 text-left font-bold min-w-28 text-xs" rowSpan={2}>Support Type</th>
              {Object.entries(productsByCategory).map(([cat, prods]) => {
                if (hiddenCategories[cat]) return null;
                return (
                  <th key={cat} colSpan={prods.length} className={`px-2 py-1 text-center font-bold border-r text-xs ${CATEGORY_COLOURS[cat] || ''}`}>
                    {CATEGORY_LABELS[cat]}
                  </th>
                );
              })}
              <th colSpan={4} className="px-2 py-1 text-center font-bold border-r text-xs bg-teal-100/50 dark:bg-teal-900/30 text-teal-800 dark:text-teal-300">
                20i
              </th>
              <th className="px-2 py-1 text-center font-bold border-r text-xs bg-blue-100/50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300" rowSpan={2} title="Total unique domains for this client (hosting + registrations, deduped)">
                Domains
              </th>
              <th className="px-2 py-1 text-center font-bold border-r text-xs bg-purple-100/50 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300" rowSpan={2}>
                Giacom<br/>Monthly
              </th>
              <th className="px-3 py-2 text-left font-bold min-w-32 text-xs bg-gray-50 dark:bg-gray-900" rowSpan={2}>Remarks</th>
            </tr>
            <tr className="border-b bg-muted/50">
              {visibleProducts.map(p => (
                <th key={p.id} className="px-2 py-2 text-left font-bold border-r text-xs min-w-16 max-w-24">
                  {p.name}
                </th>
              ))}
              <th className="px-2 py-2 text-left font-bold border-r text-xs min-w-20">SSL Expiry</th>
              <th className="px-2 py-2 text-left font-bold border-r text-xs min-w-24">Domain Renewal</th>
              <th className="px-2 py-2 text-left font-bold border-r text-xs min-w-24">Package</th>
              <th className="px-2 py-2 text-left font-bold border-r text-xs min-w-14">Turbo</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={visibleProducts.length + 10} className="text-center py-12 text-muted-foreground">No data for this month</td>
              </tr>
            ) : filteredRows.map((row, idx) => {
              const rowBg = idx % 2 === 0 ? 'bg-white dark:bg-gray-950' : 'bg-gray-50 dark:bg-gray-900';
              return (
                <tr key={row.client_id}
                  className={`border-b hover:bg-accent/30 transition-colors group ${rowBg}`}>

                  {/* Actions — sticky leftmost */}
                  <td className={`sticky left-0 z-10 border-r px-2 py-1.5 whitespace-nowrap text-center ${rowBg}`} style={{ width: '64px', minWidth: '64px' }}>
                    {!isLocked ? (
                      <div className="flex gap-0.5 justify-center">
                        <Button size="sm" variant="ghost" className="h-6 px-1.5 text-muted-foreground hover:text-foreground" onClick={() => startEdit(row)} title="Edit">
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 px-1.5 text-muted-foreground hover:text-red-600" onClick={() => setDeleteConfirm(row.client_id)} title="Remove from this month">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <Lock className="h-3 w-3 text-amber-400 mx-auto" />
                    )}
                  </td>

                  {/* Client name — sticky next */}
                  <td className={`sticky z-10 border-r px-3 py-1.5 font-medium min-w-52 ${rowBg}`} style={{ left: '64px' }}>
                    <div className="flex items-center gap-2">
                      {row.is_site ? (
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs text-muted-foreground truncate">{row.parent_client_name}</span>
                          <span className="truncate max-w-44 pl-2 border-l-2 border-blue-300 dark:border-blue-700 text-sm" title={row.client_name}>
                            {row.client_name}
                          </span>
                        </div>
                      ) : (
                        <span className="truncate max-w-48" title={row.client_name}>{row.client_name}</span>
                      )}
                      {row.client_id?.startsWith('UNRESOLVED:') && <span className="text-amber-500 text-xs shrink-0">⚠</span>}
                    </div>
                  </td>

                  <td className="border-r px-2 py-1.5 text-left min-w-28">
                    {row.support_type
                      ? <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800">{row.support_type}</span>
                      : <span className="text-gray-300">—</span>
                    }
                  </td>

                  {visibleProducts.map(p => (
                    <td key={p.id} className="border-r px-2 py-1.5 text-center">
                      {renderCellValue(p, row.products?.[p.name], row)}
                    </td>
                  ))}

                  {/* SSL Expiry */}
                  <td className="border-r px-2 py-1.5 text-center text-xs">
                    {row.ssl_expiry ? (() => {
                      const expiry = new Date(row.ssl_expiry);
                      const daysLeft = Math.ceil((expiry - new Date()) / (1000 * 60 * 60 * 24));
                      const colour = daysLeft < 0 ? 'text-red-600 font-bold' : daysLeft < 30 ? 'text-red-500 font-medium' : daysLeft < 60 ? 'text-amber-500' : 'text-green-600';
                      return <span className={colour} title={expiry.toLocaleDateString('en-GB')}>{daysLeft < 0 ? 'EXPIRED' : `${daysLeft}d`}</span>;
                    })() : <span className="text-gray-300">—</span>}
                  </td>

                  {/* Domain Renewal */}
                  <td className="border-r px-2 py-1.5 text-center text-xs">
                    {row.domain_renewal ? (() => {
                      const renewal = new Date(row.domain_renewal);
                      const daysLeft = Math.ceil((renewal - new Date()) / (1000 * 60 * 60 * 24));
                      const colour = daysLeft < 0 ? 'text-red-600 font-bold' : daysLeft < 30 ? 'text-red-500 font-medium' : daysLeft < 60 ? 'text-amber-500' : 'text-muted-foreground';
                      return <span className={colour} title={renewal.toLocaleDateString('en-GB')}>{renewal.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}</span>;
                    })() : <span className="text-gray-300">—</span>}
                  </td>

                  {/* Package type */}
                  <td className="border-r px-2 py-1.5 text-center text-xs text-muted-foreground">
                    {row.hosting_packages?.length > 0
                      ? <span title={row.hosting_packages.join(', ')} className="truncate block max-w-28">{row.hosting_packages[0]}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>

                  {/* Website Turbo */}
                  <td className="border-r px-2 py-1.5 text-center text-xs">
                    {row.website_turbo
                      ? <span className="text-teal-600 font-medium" title="Website Turbo active">⚡</span>
                      : <span className="text-gray-300">—</span>}
                  </td>

                  {/* Domains count — click to expand the full list */}
                  <td className="border-r px-2 py-1.5 text-center text-xs">
                    {row.domain_count > 0 ? (
                      <button
                        type="button"
                        onClick={() => setDomainsPopup({ client: row.client_name, domains: row.hosting_domains || [] })}
                        className="font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                        title="Click to view all domains"
                      >
                        {row.domain_count}
                      </button>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>

                  {/* Giacom monthly cost */}
                  <td className="border-r px-2 py-1.5 text-center text-xs">
                    {row.giacom_monthly_cost != null
                      ? <span className="font-medium text-purple-600 dark:text-purple-400">£{row.giacom_monthly_cost.toFixed(2)}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>

                  <td className="px-3 py-1.5 text-xs text-muted-foreground">
                    {row.remarks ? (
                      <button
                        type="button"
                        onClick={() => setRemarksPopup({ client: row.client_name, text: row.remarks })}
                        className="line-clamp-1 text-left max-w-48 hover:text-foreground hover:underline cursor-pointer"
                        title="Click to view full remarks"
                      >
                        {row.remarks}
                      </button>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add client dialog */}
      <Dialog open={addClientOpen} onOpenChange={setAddClientOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Client to {formatMonthLabel(selectedMonth)}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Add a client that isn't currently in this month's support count.</p>
          <Select value={addClientId || 'none'} onValueChange={v => setAddClientId(v === 'none' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder="Select client..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none" disabled>Select client...</SelectItem>
              {allClients.filter(c => !data?.rows?.find(r => r.client_id === c.id)).map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}{c.client_type === 'web_services' && ' (Service Only)'}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddClientOpen(false)}>Cancel</Button>
            <Button onClick={addClientToMonth} disabled={!addClientId}>Add to Month</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Remove from {formatMonthLabel(selectedMonth)}?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            This removes <strong>{filteredRows.find(r => r.client_id === deleteConfirm)?.client_name}</strong> from this month's support count. Their data in other months is not affected.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteClientFromMonth(deleteConfirm)}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remarks popup — full text view */}
      <Dialog open={!!remarksPopup} onOpenChange={() => setRemarksPopup(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Remarks · {remarksPopup?.client}</DialogTitle>
          </DialogHeader>
          <div className="text-sm whitespace-pre-wrap break-words py-2">
            {remarksPopup?.text}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemarksPopup(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Domains popup — list of all domains for this client */}
      <Dialog open={!!domainsPopup} onOpenChange={() => setDomainsPopup(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Domains · {domainsPopup?.client}</DialogTitle>
          </DialogHeader>
          <div className="py-2 max-h-96 overflow-y-auto">
            {(domainsPopup?.domains || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No domains.</p>
            ) : (
              <div className="space-y-1">
                {(domainsPopup?.domains || []).map(d => (
                  <div key={d} className="flex items-center gap-2 text-sm font-mono px-2 py-1 rounded bg-muted/50">
                    <Globe className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                    <span className="truncate">{d}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-3">
              Total: {(domainsPopup?.domains || []).length} unique domain{(domainsPopup?.domains || []).length === 1 ? '' : 's'}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDomainsPopup(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit row — side panel (Sheet) */}
      <Sheet
        open={!!editingRow}
        onOpenChange={(open) => { if (!open) cancelEdit(); }}
      >
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          {(() => {
            const row = filteredRows.find(r => (r.snapshot_key || r.client_id) === editingRow);
            if (!row) return null;
            return (
              <>
                <SheetHeader>
                  <SheetTitle>{row.client_name}</SheetTitle>
                  <SheetDescription>
                    Editing {formatMonthLabel(selectedMonth)}
                    {row.is_site && row.parent_client_name ? ` · site of ${row.parent_client_name}` : ''}
                  </SheetDescription>
                </SheetHeader>

                <div className="space-y-5 py-4">
                  {/* Support type */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Support Type</label>
                    <select
                      className="w-full text-sm border rounded px-2 py-1.5 bg-background"
                      value={editValues.support_type || ''}
                      onChange={e => setEditValues(v => ({ ...v, support_type: e.target.value }))}
                    >
                      <option value="">—</option>
                      {['Monthly', 'PAYG', 'Support Fund', 'Hosting'].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>

                  {/* Products grouped by category */}
                  {Object.entries(productsByCategory).map(([cat, prods]) => (
                    <div key={cat} className="space-y-2">
                      <div className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${CATEGORY_COLOURS[cat] || ''}`}>
                        {CATEGORY_LABELS[cat]}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {prods.map(p => {
                          const current = editValues.products?.[p.name];
                          return (
                            <div key={p.id} className="space-y-1">
                              <label className="text-xs text-muted-foreground">{p.name}</label>
                              {p.unit === 'yes/no' ? (
                                <div className="flex items-center gap-2 h-9">
                                  <input
                                    type="checkbox"
                                    className="w-4 h-4"
                                    checked={!!current}
                                    onChange={e => setEditValues(v => ({ ...v, products: { ...v.products, [p.name]: e.target.checked } }))}
                                  />
                                  <span className="text-xs text-muted-foreground">{current ? 'Yes' : 'No'}</span>
                                </div>
                              ) : p.unit === 'text' ? (
                                <input
                                  type="text"
                                  className="w-full text-sm border rounded px-2 py-1.5 bg-background"
                                  value={current || ''}
                                  onChange={e => setEditValues(v => ({ ...v, products: { ...v.products, [p.name]: e.target.value } }))}
                                />
                              ) : (
                                <input
                                  type="number"
                                  min="0"
                                  className="w-full text-sm border rounded px-2 py-1.5 bg-background"
                                  value={current ?? ''}
                                  onChange={e => setEditValues(v => ({ ...v, products: { ...v.products, [p.name]: e.target.value === '' ? undefined : Number(e.target.value) } }))}
                                  placeholder={p.unit === 'gb' ? 'GB' : ''}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {/* Remarks */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Remarks</label>
                    <textarea
                      className="w-full text-sm border rounded px-2 py-1.5 bg-background min-h-24 resize-y"
                      value={editValues.remarks || ''}
                      onChange={e => setEditValues(v => ({ ...v, remarks: e.target.value }))}
                      placeholder="Notes about this client for this month..."
                    />
                  </div>
                </div>

                <SheetFooter className="gap-2">
                  <Button variant="outline" onClick={cancelEdit} disabled={saving}>
                    <X className="h-4 w-4 mr-1" /> Cancel
                  </Button>
                  <Button onClick={() => saveRow(row)} disabled={saving}>
                    <Save className="h-4 w-4 mr-1" /> {saving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </SheetFooter>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}
