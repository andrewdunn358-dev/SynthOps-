import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient, useAuth } from '../App';
import { toast } from 'sonner';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { Plus, Search, FileText, Loader2, Trash2 } from 'lucide-react';
import { getErrorMessage } from '../lib/errorHandler';

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

export default function Worksheets() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null); // {id, label} when confirming
  const [deleting, setDeleting] = useState(false);

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
      toast.error(getErrorMessage(e, 'Failed to load worksheets'));
    } finally {
      setLoading(false);
    }
  };

  const newWorksheet = async () => {
    // Belt-and-braces guard against double-fire (rapid double-click,
    // StrictMode wouldn't double-call this since it's an event handler
    // not an effect, but cheap to be safe).
    if (creating) return;
    setCreating(true);
    try {
      // POST the draft directly from the click handler so the editor
      // never has to create-on-mount (which under React 18 StrictMode
      // would fire twice and produce orphan drafts). All Worksheet model
      // fields are Optional with sensible defaults, so an empty body
      // validates cleanly.
      const res = await apiClient.post('/worksheets', {});
      navigate(`/worksheets/${res.data.id}`);
    } catch (e) {
      toast.error(getErrorMessage(e, 'Failed to create worksheet'));
      // Only reset on error — on success we navigate away so the unmount
      // would handle it anyway.
      setCreating(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/worksheets/${deleteTarget.id}`);
      toast.success('Worksheet deleted');
      // Optimistically remove from list — refetch would also work but
      // this avoids a flash of the deleted row.
      setRows(rs => rs.filter(r => r.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (e) {
      toast.error(getErrorMessage(e, 'Failed to delete worksheet'));
    } finally {
      setDeleting(false);
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
                    {isAdmin && <th className="px-4 py-2 w-10"></th>}
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
                      {isAdmin && (
                        <td className="px-2 py-2 text-right" onClick={e => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
                            title="Delete worksheet"
                            onClick={() => setDeleteTarget({
                              id: r.id,
                              label: r.job_no || r.project_title || 'this worksheet',
                            })}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      {/* Delete confirmation (admin-only — but rendered unconditionally
          and gated by deleteTarget so non-admins can never trigger it
          since they don't see the per-row delete button). */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete worksheet?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes <span className="font-semibold">{deleteTarget?.label}</span>.
              Use this for test drafts or worksheets created in error. This action can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmDelete(); }}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
              {deleting ? 'Deleting…' : 'Delete worksheet'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
