import React, { useState } from 'react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Plus, Trash2, Printer, Save, FileText } from 'lucide-react';

// ---------------------------------------------------------------------------
// Worksheets — Phase 1
//
// Engineer's worksheet. Layout mirrors the paper Synthesis IT Work Order /
// Job No. form so that staff used to the paper version can find the same
// fields in the same order.
//
// Phase 1 scope: form layout + fully interactive client-side state. No save
// to backend yet, no PDF generation, no list of past worksheets, no client
// picker integration. Save and Print buttons render but do nothing — they're
// here to confirm the right buttons exist before the next phase wires them.
//
// Coming in later phases:
//   - Backend: schema + create/list/get/update endpoints
//   - PDF export styled to match the paper original (signature blocks etc.)
//   - List view with search/filter
//   - Optional Stock & Assets integration on the equipment Description fields
//   - Possibly: link worksheet → client (auto-populate Customer / Account Manager)
// ---------------------------------------------------------------------------

const blankRow = () => ({ description: '', qty_alloc: '', qty_used: '' });
const blankAddRow = () => ({ description: '', qty: '', unit_cost: '' });

const blankForm = () => ({
  // Header / job metadata
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
  // Equipment tables
  equipment_expected: [blankRow()],
  equipment_added: [blankAddRow()],
});

export default function Worksheets() {
  const [form, setForm] = useState(blankForm());

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
      [table]: f[table].length === 1 ? [table === 'equipment_expected' ? blankRow() : blankAddRow()] : f[table].filter((_, i) => i !== idx),
    }));
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl space-y-6">
      {/* Title bar */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileText className="h-4 w-4" />
            <span>Worksheets</span>
          </div>
          <h1 className="text-2xl font-bold">Work Order / Job No.</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Engineer worksheet — fill in, save, then print for client signature.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled title="Coming next phase">
            <Save className="h-4 w-4 mr-1" /> Save Draft
          </Button>
          <Button disabled title="Coming next phase">
            <Printer className="h-4 w-4 mr-1" /> Save &amp; Print
          </Button>
        </div>
      </div>

      {/* Phase notice — remove once backend is wired */}
      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
        <strong>Phase 1 preview:</strong> form layout only. Typing works, adding rows works, but Save and Print are not yet hooked up. Backend + PDF coming next.
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
