import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiClient } from '../App';
import { toast } from 'sonner';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Plus, Trash2, Printer, Save, FileText, ArrowLeft, Loader2 } from 'lucide-react';

// ---------------------------------------------------------------------------
// Worksheet editor — loads /worksheets/:id (or :id == 'new' for a fresh draft).
//
// On 'new', a blank worksheet is created via POST as soon as the page mounts,
// then the URL is updated to /worksheets/<real_id> so subsequent saves are
// PUT updates and a refresh doesn't re-create another draft. Every worksheet
// has a real id from the moment the engineer starts typing.
//
// Layout mirrors the paper Synthesis IT Work Order / Job No. form so staff
// used to the paper version can find the same fields in the same logical
// groupings. Save & Print stays disabled until Phase 3 wires up the PDF.
// ---------------------------------------------------------------------------

const blankRow = () => ({ description: '', qty_alloc: '', qty_used: '' });
const blankAddRow = () => ({ description: '', qty: '', unit_cost: '' });

const blankForm = () => ({
  job_no: '',
  project_title: '',
  opps_no: '',
  customer: '',
  project_delivery_address: '',
  account_manager: '',
  customer_contact: '',
  job_assigned_to: '',
  delivered_fulfilled_by: '',
  date_order_placed: '',
  date_delivery_expected: '',
  date_completed: '',
  time_arrived: '',
  time_finished: '',
  overview_of_job: '',
  equipment_expected: [blankRow()],
  equipment_added: [blankAddRow()],
  status: 'draft',
});

// Convert API → form: fills missing fields, coerces null → '' for inputs,
// and ensures at least one empty equipment row in each table so the form
// always has something to render.
const apiToForm = (ws) => {
  const f = { ...blankForm(), ...ws };
  for (const k of Object.keys(blankForm())) {
    if (f[k] === null || f[k] === undefined) f[k] = blankForm()[k];
  }
  if (!Array.isArray(f.equipment_expected) || f.equipment_expected.length === 0) {
    f.equipment_expected = [blankRow()];
  }
  if (!Array.isArray(f.equipment_added) || f.equipment_added.length === 0) {
    f.equipment_added = [blankAddRow()];
  }
  f.equipment_expected = f.equipment_expected.map(r => ({
    description: r.description || '',
    qty_alloc: r.qty_alloc == null ? '' : String(r.qty_alloc),
    qty_used: r.qty_used == null ? '' : String(r.qty_used),
  }));
  f.equipment_added = f.equipment_added.map(r => ({
    description: r.description || '',
    qty: r.qty == null ? '' : String(r.qty),
    unit_cost: r.unit_cost == null ? '' : String(r.unit_cost),
  }));
  return f;
};

// Convert form → API payload: empty equipment rows dropped, numeric strings
// coerced (or null for blanks).
const formToApi = (f) => {
  const num = v => {
    const s = String(v ?? '').trim();
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };
  return {
    ...f,
    equipment_expected: (f.equipment_expected || [])
      .filter(r => (r.description || '').trim() || r.qty_alloc !== '' || r.qty_used !== '')
      .map(r => ({ description: r.description || '', qty_alloc: num(r.qty_alloc), qty_used: num(r.qty_used) })),
    equipment_added: (f.equipment_added || [])
      .filter(r => (r.description || '').trim() || r.qty !== '' || r.unit_cost !== '')
      .map(r => ({ description: r.description || '', qty: num(r.qty), unit_cost: num(r.unit_cost) })),
  };
};

export default function WorksheetEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(blankForm());
  const [worksheetId, setWorksheetId] = useState(id === 'new' ? null : id);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        if (id === 'new') {
          const res = await apiClient.post('/worksheets', blankForm());
          if (cancelled) return;
          setWorksheetId(res.data.id);
          setForm(apiToForm(res.data));
          navigate(`/worksheets/${res.data.id}`, { replace: true });
        } else {
          const res = await apiClient.get(`/worksheets/${id}`);
          if (cancelled) return;
          setWorksheetId(res.data.id);
          setForm(apiToForm(res.data));
        }
      } catch (e) {
        toast.error(e.response?.data?.detail || 'Failed to load worksheet');
        navigate('/worksheets', { replace: true });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const setField = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const updateRow = (table, idx, key, value) => {
    setForm(f => ({
      ...f,
      [table]: f[table].map((r, i) => i === idx ? { ...r, [key]: value } : r),
    }));
  };

  const addRow = (table, blank) => () => {
    setForm(f => ({ ...f, [table]: [...f[table], blank()] }));
  };

  const removeRow = (table) => (idx) => () => {
    setForm(f => ({
      ...f,
      [table]: f[table].length === 1
        ? [table === 'equipment_expected' ? blankRow() : blankAddRow()]
        : f[table].filter((_, i) => i !== idx),
    }));
  };

  const save = useCallback(async () => {
    if (!worksheetId) return;
    setSaving(true);
    try {
      const payload = formToApi(form);
      await apiClient.put(`/worksheets/${worksheetId}`, payload);
      toast.success('Saved');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [form, worksheetId]);

  const saveAndPrint = useCallback(async () => {
    if (!worksheetId) return;
    setSaving(true);
    try {
      const payload = formToApi(form);
      await apiClient.put(`/worksheets/${worksheetId}`, payload);
      // Auth uses a Bearer token via axios interceptor — a raw window.open
      // wouldn't send it. Fetch the PDF as a blob through axios (token
      // attached), then open via a blob URL.
      const res = await apiClient.get(`/worksheets/${worksheetId}/pdf`, { responseType: 'blob' });
      const blobUrl = window.URL.createObjectURL(res.data);
      window.open(blobUrl, '_blank', 'noopener,noreferrer');
      // Free the blob URL after a generous delay — the new tab needs it
      // alive long enough to render and let the user print.
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60000);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save and print');
    } finally {
      setSaving(false);
    }
  }, [form, worksheetId]);

  if (loading) {
    return (
      <div className="container mx-auto p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading worksheet…
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl space-y-6">
      {/* Title bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <button
            type="button"
            onClick={() => navigate('/worksheets')}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1"
          >
            <ArrowLeft className="h-3 w-3" /> Back to worksheets
          </button>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileText className="h-4 w-4" />
            <span>Worksheet</span>
          </div>
          <h1 className="text-2xl font-bold">
            Work Order / Job No.{form.job_no ? ` ${form.job_no}` : ''}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Engineer worksheet — fill in, save, then print for client signature.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            {saving ? 'Saving…' : 'Save Draft'}
          </Button>
          <Button onClick={saveAndPrint} disabled={saving}>
            <Printer className="h-4 w-4 mr-1" /> Save &amp; Print
          </Button>
        </div>
      </div>

      {/* Header — job metadata */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="job_no">Job No.</Label>
              <Input id="job_no" value={form.job_no} onChange={setField('job_no')} placeholder="e.g. WO-2026-001" />
            </div>
            <div>
              <Label htmlFor="project_title">Project Title</Label>
              <Input id="project_title" value={form.project_title} onChange={setField('project_title')} />
            </div>
            <div>
              <Label htmlFor="opps_no">Opps No</Label>
              <Input id="opps_no" value={form.opps_no} onChange={setField('opps_no')} />
            </div>
            <div>
              <Label htmlFor="account_manager">Account Manager</Label>
              <Input id="account_manager" value={form.account_manager} onChange={setField('account_manager')} />
            </div>

            <div className="lg:col-span-2">
              <Label htmlFor="customer">Customer</Label>
              <Input id="customer" value={form.customer} onChange={setField('customer')} />
            </div>
            <div className="lg:col-span-2">
              <Label htmlFor="customer_contact">Customer Contact</Label>
              <Input id="customer_contact" value={form.customer_contact} onChange={setField('customer_contact')} />
            </div>

            <div className="lg:col-span-4">
              <Label htmlFor="project_delivery_address">Project Delivery Address</Label>
              <Textarea id="project_delivery_address" rows={2} value={form.project_delivery_address} onChange={setField('project_delivery_address')} />
            </div>

            <div>
              <Label htmlFor="job_assigned_to">Job Assigned To</Label>
              <Input id="job_assigned_to" value={form.job_assigned_to} onChange={setField('job_assigned_to')} />
            </div>
            <div>
              <Label htmlFor="delivered_fulfilled_by">Delivered / Fulfilled By</Label>
              <Input id="delivered_fulfilled_by" value={form.delivered_fulfilled_by} onChange={setField('delivered_fulfilled_by')} />
            </div>
            <div>
              <Label htmlFor="date_order_placed">Date Order Placed</Label>
              <Input id="date_order_placed" type="date" value={form.date_order_placed} onChange={setField('date_order_placed')} />
            </div>
            <div>
              <Label htmlFor="date_delivery_expected">Date Delivery Expected</Label>
              <Input id="date_delivery_expected" type="date" value={form.date_delivery_expected} onChange={setField('date_delivery_expected')} />
            </div>

            <div>
              <Label htmlFor="date_completed">Date Completed</Label>
              <Input id="date_completed" type="date" value={form.date_completed} onChange={setField('date_completed')} />
            </div>
            <div>
              <Label htmlFor="time_arrived">Time Arrived</Label>
              <Input id="time_arrived" type="time" value={form.time_arrived} onChange={setField('time_arrived')} />
            </div>
            <div>
              <Label htmlFor="time_finished">Time Finished</Label>
              <Input id="time_finished" type="time" value={form.time_finished} onChange={setField('time_finished')} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Overview of Job */}
      <Card>
        <CardContent className="pt-6">
          <Label htmlFor="overview_of_job">Overview Of Job</Label>
          <Textarea id="overview_of_job" rows={4} value={form.overview_of_job} onChange={setField('overview_of_job')} />
        </CardContent>
      </Card>

      {/* Equipment Expected / Ordered */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">List of Equipment Expected / Ordered</h2>
            <Button variant="outline" size="sm" onClick={addRow('equipment_expected', blankRow)}>
              <Plus className="h-4 w-4 mr-1" /> Add row
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-2 font-medium" style={{ width: '60%' }}>Description</th>
                  <th className="p-2 font-medium">Qty Alloc</th>
                  <th className="p-2 font-medium">Qty Used</th>
                  <th className="p-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {form.equipment_expected.map((row, idx) => (
                  <tr key={idx} className="border-b">
                    <td className="p-1">
                      <Input value={row.description} onChange={e => updateRow('equipment_expected', idx, 'description', e.target.value)} placeholder="Item description" />
                    </td>
                    <td className="p-1">
                      <Input type="number" min="0" value={row.qty_alloc} onChange={e => updateRow('equipment_expected', idx, 'qty_alloc', e.target.value)} />
                    </td>
                    <td className="p-1">
                      <Input type="number" min="0" value={row.qty_used} onChange={e => updateRow('equipment_expected', idx, 'qty_used', e.target.value)} />
                    </td>
                    <td className="p-1 text-center">
                      <Button variant="ghost" size="sm" onClick={removeRow('equipment_expected')(idx)} title="Remove row" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Additional Equipment Added By Installation Team */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Additional Equipment Added By Installation Team</h2>
            <Button variant="outline" size="sm" onClick={addRow('equipment_added', blankAddRow)}>
              <Plus className="h-4 w-4 mr-1" /> Add row
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-2 font-medium" style={{ width: '60%' }}>Description</th>
                  <th className="p-2 font-medium">Qty</th>
                  <th className="p-2 font-medium">Unit Cost</th>
                  <th className="p-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {form.equipment_added.map((row, idx) => (
                  <tr key={idx} className="border-b">
                    <td className="p-1">
                      <Input value={row.description} onChange={e => updateRow('equipment_added', idx, 'description', e.target.value)} placeholder="Item description" />
                    </td>
                    <td className="p-1">
                      <Input type="number" min="0" value={row.qty} onChange={e => updateRow('equipment_added', idx, 'qty', e.target.value)} />
                    </td>
                    <td className="p-1">
                      <Input type="number" min="0" step="0.01" value={row.unit_cost} onChange={e => updateRow('equipment_added', idx, 'unit_cost', e.target.value)} placeholder="0.00" />
                    </td>
                    <td className="p-1 text-center">
                      <Button variant="ghost" size="sm" onClick={removeRow('equipment_added')(idx)} title="Remove row" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Sign-off footer */}
      <Card>
        <CardContent className="pt-6">
          <h2 className="font-semibold mb-2">Completed To Client's Satisfaction</h2>
          <p className="text-sm text-muted-foreground italic">
            Signature and printed name are captured on paper. The PDF generated by Save &amp; Print will include signature and Print Name blocks for the client to sign on completion.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
