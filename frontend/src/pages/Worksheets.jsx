import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../App';
import { toast } from 'sonner';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Plus, Search, FileText, Loader2 } from 'lucide-react';

// ---------------------------------------------------------------------------
// Worksheets — list page. Shows all worksheets newest-first, with a search
// box that filters server-side across job_no / project_title / customer /
// account_manager. New Worksheet button creates a draft and routes to the
// editor.
// ---------------------------------------------------------------------------

const formatDate = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '—';
  }
};

// FastAPI 422s come through as { detail: [{type, loc, msg, ...}] } — render
// directly as toast content and React will crash on the array of objects.
const errorText = (e, fallback = 'Request failed') => {
  const d = e?.response?.data?.detail;
  if (!d) return e?.message || fallback;
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) {
    return d
      .map(item => {
        if (typeof item === 'string') return item;
        if (item && item.msg && item.loc) return `${item.loc.slice(1).join('.') || '?'}: ${item.msg}`;
        return JSON.stringify(item);
      })
      .join('; ');
  }
  try { return JSON.stringify(d); } catch { return fallback; }
};

export default function Worksheets() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');

  // Debounce search → server
  useEffect(() => {
    const t = setTimeout(() => fetchRows(search), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const fetchRows = async (q = '') => {
    setLoading(true);
    try {
      const res = await apiClient.get('/worksheets', { params: q ? { search: q } : {} });
      setRows(res.data || []);
    } catch (e) {
      toast.error(errorText(e, 'Failed to load worksheets'));
    } finally {
      setLoading(false);
    }
  };

  const newWorksheet = async () => {
    // Just route to /worksheets/new — the editor itself POSTs the draft
    // and replaces the URL with the real id once it's back. Keeps the
    // 'create + load' flow in one place.
    setCreating(true);
    try {
      navigate('/worksheets/new');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl space-y-4">
      {/* Title bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileText className="h-4 w-4" />
            <span>Worksheets</span>
          </div>
          <h1 className="text-2xl font-bold">Worksheets</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Engineer Work Order / Job No. records — fill in, save, print for client signature.
          </p>
        </div>
        <Button onClick={newWorksheet} disabled={creating}>
          <Plus className="h-4 w-4 mr-1" /> New Worksheet
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          className="pl-9"
          placeholder="Search by job no, project, customer, or account manager…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* List */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                {search ? 'No worksheets match your search.' : 'No worksheets yet.'}
              </p>
              {!search && (
                <Button variant="outline" className="mt-3" onClick={newWorksheet} disabled={creating}>
                  <Plus className="h-4 w-4 mr-1" /> Create the first one
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Job No</th>
                    <th className="px-4 py-2 font-medium">Project</th>
                    <th className="px-4 py-2 font-medium">Customer</th>
                    <th className="px-4 py-2 font-medium">Account Mgr</th>
                    <th className="px-4 py-2 font-medium">Date Order</th>
                    <th className="px-4 py-2 font-medium">Date Completed</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr
                      key={r.id}
                      className="border-b hover:bg-accent/30 cursor-pointer transition-colors"
                      onClick={() => navigate(`/worksheets/${r.id}`)}
                    >
                      <td className="px-4 py-2 font-medium">{r.job_no || <span className="text-muted-foreground italic">untitled</span>}</td>
                      <td className="px-4 py-2">{r.project_title || '—'}</td>
                      <td className="px-4 py-2">{r.customer || '—'}</td>
                      <td className="px-4 py-2 text-muted-foreground">{r.account_manager || '—'}</td>
                      <td className="px-4 py-2 text-muted-foreground">{formatDate(r.date_order_placed)}</td>
                      <td className="px-4 py-2 text-muted-foreground">{formatDate(r.date_completed)}</td>
                      <td className="px-4 py-2">
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          r.status === 'completed'
                            ? 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200'
                            : 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200'
                        }`}>
                          {r.status || 'draft'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
