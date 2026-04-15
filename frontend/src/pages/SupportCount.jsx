import React, { useState, useEffect, useRef } from 'react';
import { apiClient } from '../App';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import { Save, Download, Search, ChevronLeft, ChevronRight, Edit, X } from 'lucide-react';

const CATEGORY_LABELS = {
  security: 'Security',
  backup: 'Backup',
  devices: 'Devices',
  onsite: 'Onsite',
  connectivity: 'Connectivity',
  hosting: 'Hosting',
  office365: 'Office 365',
  other: 'Other',
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

export default function SupportCount() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [search, setSearch] = useState('');
  const [editingRow, setEditingRow] = useState(null); // client_id being edited
  const [editValues, setEditValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [hiddenCategories, setHiddenCategories] = useState({});

  useEffect(() => {
    fetchData(selectedMonth);
  }, [selectedMonth]);

  const fetchData = async (month) => {
    setLoading(true);
    try {
      const url = month ? `/support/monthly-count?month=${month}` : '/support/monthly-count';
      const res = await apiClient.get(url);
      setData(res.data);
      if (!selectedMonth && res.data.month) {
        setSelectedMonth(res.data.month);
      }
    } catch (e) {
      toast.error('Failed to load support count data');
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (row) => {
    setEditingRow(row.client_id);
    setEditValues({
      support_type: row.support_type || '',
      products: { ...row.products },
      remarks: row.remarks || '',
    });
  };

  const cancelEdit = () => {
    setEditingRow(null);
    setEditValues({});
  };

  const saveRow = async (clientId) => {
    setSaving(true);
    try {
      await apiClient.put(`/support/monthly-count/${clientId}`, {
        month: selectedMonth,
        ...editValues,
      });
      toast.success('Saved');
      setEditingRow(null);
      fetchData(selectedMonth);
    } catch (e) {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
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
      row.client_name,
      row.support_type || '',
      ...products.map(p => {
        const val = row.products?.[p.name];
        return val !== undefined && val !== null ? val : '';
      }),
      row.remarks || '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `support-count-${selectedMonth}.csv`;
    a.click();
  };

  const toggleCategory = (cat) => {
    setHiddenCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const formatMonthLabel = (m) => {
    if (!m) return '';
    const [year, month] = m.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleString('en-GB', { month: 'long', year: 'numeric' });
  };

  const filteredRows = data?.rows?.filter(row => {
    if (!search) return true;
    return (row.client_name || '').toLowerCase().includes(search.toLowerCase());
  }) || [];

  // Group products by category for column headers
  const productsByCategory = {};
  (data?.products || []).forEach(p => {
    if (!productsByCategory[p.category]) productsByCategory[p.category] = [];
    productsByCategory[p.category].push(p);
  });

  const visibleProducts = (data?.products || []).filter(p => !hiddenCategories[p.category]);

  const renderCellValue = (product, value) => {
    if (value === null || value === undefined || value === '') return <span className="text-gray-300">—</span>;
    if (product.unit === 'yes/no') return value ? <span className="text-green-600 font-medium">✓</span> : <span className="text-gray-300">—</span>;
    if (product.unit === 'gb') return <span className="text-xs">{value}GB</span>;
    return <span className="text-sm font-medium">{value}</span>;
  };

  const renderEditCell = (product, editVals, setEditVals) => {
    const current = editVals.products?.[product.name];
    if (product.unit === 'yes/no') {
      return (
        <input
          type="checkbox"
          checked={!!current}
          onChange={e => setEditVals(v => ({ ...v, products: { ...v.products, [product.name]: e.target.checked } }))}
          className="w-4 h-4"
        />
      );
    }
    if (product.unit === 'text') {
      return (
        <input
          className="w-24 text-xs border rounded px-1 py-0.5"
          value={current || ''}
          onChange={e => setEditVals(v => ({ ...v, products: { ...v.products, [product.name]: e.target.value } }))}
        />
      );
    }
    return (
      <input
        type="number"
        min="0"
        className="w-16 text-xs border rounded px-1 py-0.5 text-center"
        value={current ?? ''}
        onChange={e => setEditVals(v => ({
          ...v,
          products: { ...v.products, [product.name]: e.target.value === '' ? undefined : Number(e.target.value) }
        }))}
      />
    );
  };

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
        <div>
          <h1 className="text-2xl font-bold">Monthly Support Count</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {filteredRows.length} clients · {visibleProducts.length} products shown
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
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
                <SelectItem key={m} value={m}>{formatMonthLabel(m)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigateMonth('next')}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-8 h-8 w-48 text-sm"
            placeholder="Search clients..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {/* Category toggles */}
        <div className="flex gap-1 flex-wrap">
          {Object.entries(productsByCategory).map(([cat, prods]) => (
            <button
              key={cat}
              onClick={() => toggleCategory(cat)}
              className={`text-xs px-2 py-1 rounded-full border transition-opacity ${
                hiddenCategories[cat] ? 'opacity-40' : ''
              } ${CATEGORY_COLOURS[cat] || 'bg-gray-100/50 dark:bg-gray-800/50 text-gray-800 dark:text-gray-300'}`}
            >
              {CATEGORY_LABELS[cat]} ({prods.length})
            </button>
          ))}
        </div>
      </div>

      {/* Spreadsheet table */}
      <div className="overflow-auto rounded-lg border bg-background" style={{ maxHeight: 'calc(100vh - 260px)' }}>
        <table className="text-xs border-collapse w-full">
          <thead className="sticky top-0 z-20 bg-background">
            {/* Category header row */}
            <tr className="border-b">
              <th className="sticky left-0 z-30 bg-background border-r px-3 py-2 text-left font-semibold min-w-52 text-sm" rowSpan={2}>
                Client
              </th>
              <th className="sticky left-52 z-30 bg-background border-r px-2 py-2 text-center font-semibold min-w-28 text-xs" rowSpan={2}>
                Support Type
              </th>
              {Object.entries(productsByCategory).map(([cat, prods]) => {
                if (hiddenCategories[cat]) return null;
                return (
                  <th
                    key={cat}
                    colSpan={prods.length}
                    className={`px-2 py-1 text-center font-semibold border-r text-xs ${CATEGORY_COLOURS[cat] || ''}`}
                  >
                    {CATEGORY_LABELS[cat]}
                  </th>
                );
              })}
              <th className="px-3 py-2 text-left font-semibold min-w-32 text-xs bg-gray-50" rowSpan={2}>
                Remarks
              </th>
              <th className="px-2 py-2 bg-background" rowSpan={2} />
            </tr>
            {/* Product name row */}
            <tr className="border-b bg-muted/50">
              {visibleProducts.map(p => (
                <th
                  key={p.id}
                  className="px-1 py-2 text-center font-medium border-r text-xs min-w-14 max-w-20"
                  title={p.name}
                >
                  <span className="block max-w-20 truncate mx-auto">{p.name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={visibleProducts.length + 4} className="text-center py-12 text-muted-foreground">
                  No data for this month
                </td>
              </tr>
            ) : filteredRows.map((row, idx) => {
              const isEditing = editingRow === row.client_id;
              const vals = isEditing ? editValues : row;

              return (
                <tr
                  key={row.client_id}
                  className={`border-b hover:bg-accent/30 transition-colors group ${
                    idx % 2 === 0 ? 'bg-background' : 'bg-muted/30'
                  } ${isEditing ? '!bg-accent' : ''}`}
                >
                  {/* Client name */}
                  <td className={`sticky left-0 z-10 border-r px-3 py-1.5 font-medium min-w-52 ${isEditing ? "bg-accent" : idx % 2 === 0 ? "bg-background" : "bg-muted/30"}`}>
                    <div className="flex items-center gap-2">
                      <span className="truncate max-w-48" title={row.client_name}>
                        {row.client_name}
                      </span>
                      {row.client_id?.startsWith('UNRESOLVED:') && (
                        <span className="text-amber-500 text-xs">⚠</span>
                      )}
                    </div>
                  </td>

                  {/* Support type */}
                  <td className={`sticky left-52 z-10 border-r px-2 py-1.5 text-center min-w-28 ${isEditing ? "bg-accent" : idx % 2 === 0 ? "bg-background" : "bg-muted/30"}`}>
                    {isEditing ? (
                      <select
                        className="text-xs border rounded px-1 py-0.5 w-full"
                        value={editValues.support_type || ''}
                        onChange={e => setEditValues(v => ({ ...v, support_type: e.target.value }))}
                      >
                        <option value="">—</option>
                        {['Monthly', 'PAYG', 'Support Fund', 'Hosting'].map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    ) : (
                      row.support_type ? (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100">{row.support_type}</span>
                      ) : <span className="text-gray-300">—</span>
                    )}
                  </td>

                  {/* Product cells */}
                  {visibleProducts.map(p => (
                    <td key={p.id} className="border-r px-2 py-1.5 text-center">
                      {isEditing
                        ? renderEditCell(p, editValues, setEditValues)
                        : renderCellValue(p, row.products?.[p.name])
                      }
                    </td>
                  ))}

                  {/* Remarks */}
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">
                    {isEditing ? (
                      <input
                        className="w-full text-xs border rounded px-1 py-0.5"
                        value={editValues.remarks || ''}
                        onChange={e => setEditValues(v => ({ ...v, remarks: e.target.value }))}
                      />
                    ) : (
                      <span className="line-clamp-1">{row.remarks || ''}</span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {isEditing ? (
                      <div className="flex gap-1">
                        <Button size="sm" className="h-6 text-xs px-2" onClick={() => saveRow(row.client_id)} disabled={saving}>
                          <Save className="h-3 w-3 mr-1" />{saving ? '...' : 'Save'}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={cancelEdit}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-xs px-2 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => startEdit(row)}
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
