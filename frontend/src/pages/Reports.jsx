import React, { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../App';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import {
  Download, RefreshCw, PoundSterling, Server, Clock, ShieldAlert,
  Globe, HardDrive, AlertTriangle, CheckCircle, XCircle, FileText,
  BarChart3, Scale, Activity, ClipboardCheck
} from 'lucide-react';

// ─── Helpers ───────────────────────────────────────────
function exportCSV(filename, rows, headers) {
  const csv = [headers, ...rows].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
}

function StatusBadge({ status }) {
  const map = {
    ok: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
    warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
    critical: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
    failed: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
    expired: 'bg-red-100 text-red-700 font-bold dark:bg-red-900/40 dark:text-red-400',
    overdue: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
    never: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
  };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[status] || map.ok}`}>{status}</span>;
}

function SummaryCard({ icon: Icon, label, value, colour }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className={`text-2xl font-bold mt-0.5 ${colour || ''}`}>{value}</p>
          </div>
          <Icon className="h-8 w-8 text-muted-foreground opacity-40" />
        </div>
      </CardContent>
    </Card>
  );
}

function ReportShell({ title, icon: Icon, colour, loading, onRefresh, onExport, children, filters }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Icon className={`h-5 w-5 ${colour}`} />
          <h2 className="text-lg font-semibold">{title}</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {filters}
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Loading...' : 'Refresh'}
          </Button>
          {onExport && (
            <Button variant="outline" size="sm" onClick={onExport}>
              <Download className="h-4 w-4 mr-1" /> Export CSV
            </Button>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

// ─── 1. Billing Overview ───────────────────────────────
function BillingOverviewReport() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await apiClient.get('/reports/billing-overview'); setData(r.data); }
    catch { toast.error('Failed to load billing report'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const doExport = () => {
    if (!data) return;
    const rows = data.rows.map(r => [r.client_name, r.client_type, r.giacom_customer, r.total_monthly,
      ...Object.entries(r.products).map(([p, v]) => `${p}: ${v.qty} (£${v.cost})`).join(' | ')]);
    exportCSV('billing-overview.csv', rows, ['Client', 'Type', 'Giacom Name', 'Monthly Total', 'Products']);
  };

  return (
    <ReportShell title="Billing Overview" icon={PoundSterling} colour="text-purple-500" loading={loading} onRefresh={load} onExport={doExport}>
      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryCard icon={PoundSterling} label="Total Monthly (Giacom)" value={`£${data.grand_total.toFixed(2)}`} colour="text-purple-600" />
            <SummaryCard icon={BarChart3} label="Billed Clients" value={data.rows.length} />
            <SummaryCard icon={BarChart3} label="Avg per Client" value={`£${data.rows.length ? (data.grand_total / data.rows.length).toFixed(2) : '0'}`} />
            <SummaryCard icon={PoundSterling} label="Annual Est." value={`£${(data.grand_total * 12).toFixed(0)}`} colour="text-green-600" />
          </div>
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Products</TableHead>
                  <TableHead className="text-right">Monthly</TableHead>
                  <TableHead className="text-right">Annual Est.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{r.client_name}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs capitalize">{r.client_type}</Badge></TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(r.products).map(([prod, v]) => (
                          <span key={prod} className="text-xs bg-muted px-1.5 py-0.5 rounded">{prod} ×{v.qty}</span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">£{r.total_monthly.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">£{(r.total_monthly * 12).toFixed(0)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-bold bg-muted/50">
                  <TableCell colSpan={3}>Total</TableCell>
                  <TableCell className="text-right">£{data.grand_total.toFixed(2)}</TableCell>
                  <TableCell className="text-right">£{(data.grand_total * 12).toFixed(0)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent></Card>
        </>
      )}
    </ReportShell>
  );
}

// ─── 2. Monthly Client Summary ─────────────────────────
function MonthlyClientSummaryReport() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await apiClient.get(`/reports/monthly-client-summary?month=${month}`); setData(r.data); }
    catch { toast.error('Failed to load report'); }
    finally { setLoading(false); }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const doExport = () => {
    if (!data) return;
    const rows = data.rows.map(r => [r.client_name, r.client_type, r.support_type || '', r.servers, r.workstations, r.domains, `£${r.giacom_monthly}`]);
    exportCSV(`monthly-summary-${month}.csv`, rows, ['Client', 'Type', 'Support Type', 'Servers', 'Workstations', 'Domains', 'Giacom Monthly']);
  };

  return (
    <ReportShell title="Monthly Client Summary" icon={BarChart3} colour="text-blue-500" loading={loading} onRefresh={load} onExport={doExport}
      filters={<Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="h-8 w-40" />}>
      {data && (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Support</TableHead>
                <TableHead className="text-center">Servers</TableHead>
                <TableHead className="text-center">Workstations</TableHead>
                <TableHead className="text-center">Domains</TableHead>
                <TableHead className="text-right">Giacom £/mo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{r.client_name}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs capitalize">{r.client_type}</Badge></TableCell>
                  <TableCell>{r.support_type ? <span className="text-xs px-1.5 py-0.5 bg-muted rounded">{r.support_type}</span> : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="text-center">{r.servers || '—'}</TableCell>
                  <TableCell className="text-center">{r.workstations || '—'}</TableCell>
                  <TableCell className="text-center">{r.domains || '—'}</TableCell>
                  <TableCell className="text-right">{r.giacom_monthly ? `£${r.giacom_monthly.toFixed(2)}` : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}
    </ReportShell>
  );
}

// ─── 3. Device Health ─────────────────────────────────
function DeviceHealthReport() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await apiClient.get('/reports/device-health'); setData(r.data); }
    catch { toast.error('Failed to load report'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const doExport = () => {
    if (!data) return;
    const rows = data.rows.map(r => [r.client_name, r.servers_total, r.servers_online, r.servers_offline, r.servers_maintenance, r.workstations_total, r.workstations_online, r.workstations_offline]);
    exportCSV('device-health.csv', rows, ['Client', 'Servers Total', 'Online', 'Offline', 'Maintenance', 'WS Total', 'WS Online', 'WS Offline']);
  };

  const totalOffline = data?.rows.reduce((s, r) => s + r.servers_offline + r.workstations_offline, 0) || 0;

  return (
    <ReportShell title="Device Health" icon={Server} colour="text-green-500" loading={loading} onRefresh={load} onExport={doExport}>
      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryCard icon={Server} label="Total Servers" value={data.rows.reduce((s, r) => s + r.servers_total, 0)} />
            <SummaryCard icon={CheckCircle} label="Online" value={data.rows.reduce((s, r) => s + r.servers_online, 0)} colour="text-green-600" />
            <SummaryCard icon={XCircle} label="Offline" value={totalOffline} colour={totalOffline > 0 ? 'text-red-600' : ''} />
            <SummaryCard icon={Activity} label="Workstations" value={data.rows.reduce((s, r) => s + r.workstations_total, 0)} />
          </div>
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-center">Servers</TableHead>
                  <TableHead className="text-center text-green-600">Online</TableHead>
                  <TableHead className="text-center text-red-600">Offline</TableHead>
                  <TableHead className="text-center text-amber-600">Maintenance</TableHead>
                  <TableHead className="text-center">Workstations</TableHead>
                  <TableHead className="text-center text-green-600">WS Online</TableHead>
                  <TableHead className="text-center text-red-600">WS Offline</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((r, i) => (
                  <TableRow key={i} className={r.servers_offline + r.workstations_offline > 0 ? 'bg-red-50 dark:bg-red-900/10' : ''}>
                    <TableCell className="font-medium">{r.client_name}</TableCell>
                    <TableCell className="text-center">{r.servers_total}</TableCell>
                    <TableCell className="text-center text-green-600 font-medium">{r.servers_online}</TableCell>
                    <TableCell className="text-center">{r.servers_offline > 0 ? <span className="text-red-600 font-bold">{r.servers_offline}</span> : '—'}</TableCell>
                    <TableCell className="text-center">{r.servers_maintenance > 0 ? <span className="text-amber-600">{r.servers_maintenance}</span> : '—'}</TableCell>
                    <TableCell className="text-center">{r.workstations_total}</TableCell>
                    <TableCell className="text-center text-green-600">{r.workstations_online}</TableCell>
                    <TableCell className="text-center">{r.workstations_offline > 0 ? <span className="text-red-600 font-bold">{r.workstations_offline}</span> : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </>
      )}
    </ReportShell>
  );
}

// ─── 4. Time Tracking ─────────────────────────────────
function TimeTrackingReport() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await apiClient.get(`/reports/time-tracking?month=${month}`); setData(r.data); }
    catch { toast.error('Failed to load report'); }
    finally { setLoading(false); }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const doExport = () => {
    if (!data) return;
    const rows = data.rows.map(r => [r.client_name, r.total_hours, r.entries, Object.entries(r.by_engineer).map(([e, h]) => `${e}: ${h}h`).join(' | ')]);
    exportCSV(`time-tracking-${month}.csv`, rows, ['Client', 'Total Hours', 'Entries', 'By Engineer']);
  };

  return (
    <ReportShell title="Time Tracking" icon={Clock} colour="text-blue-500" loading={loading} onRefresh={load} onExport={doExport}
      filters={<Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="h-8 w-40" />}>
      {data && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <SummaryCard icon={Clock} label="Total Hours" value={data.total_hours} colour="text-blue-600" />
            <SummaryCard icon={BarChart3} label="Clients Billed" value={data.rows.length} />
            <SummaryCard icon={Clock} label="Avg per Client" value={data.rows.length ? (data.total_hours / data.rows.length).toFixed(1) : 0} />
          </div>
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-center">Total Hours</TableHead>
                  <TableHead className="text-center">Entries</TableHead>
                  <TableHead>By Engineer</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{r.client_name}</TableCell>
                    <TableCell className="text-center font-bold">{r.total_hours}h</TableCell>
                    <TableCell className="text-center text-muted-foreground">{r.entries}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(r.by_engineer).map(([eng, hrs]) => (
                          <span key={eng} className="text-xs bg-muted px-1.5 py-0.5 rounded">{eng}: {hrs}h</span>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </>
      )}
    </ReportShell>
  );
}

// ─── 5. Licence Reconciliation ────────────────────────
function LicenceReconciliationReport() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await apiClient.get(`/reports/licence-reconciliation?month=${month}`); setData(r.data); }
    catch { toast.error('Failed to load report'); }
    finally { setLoading(false); }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const discrepancyCount = data?.rows.filter(r => r.has_discrepancy).length || 0;
  const filtered = data?.rows.filter(r => showAll || r.has_discrepancy) || [];

  return (
    <ReportShell title="Licence Reconciliation" icon={Scale} colour="text-amber-500" loading={loading} onRefresh={load}
      filters={<Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="h-8 w-40" />}>
      {data && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <SummaryCard icon={Scale} label="Clients Checked" value={data.rows.length} />
            <SummaryCard icon={AlertTriangle} label="Discrepancies" value={discrepancyCount} colour={discrepancyCount > 0 ? 'text-amber-600' : 'text-green-600'} />
            <SummaryCard icon={CheckCircle} label="In Sync" value={data.rows.length - discrepancyCount} colour="text-green-600" />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant={showAll ? 'default' : 'outline'} onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Show Discrepancies Only' : 'Show All Clients'}
            </Button>
            {discrepancyCount === 0 && <span className="text-sm text-green-600 font-medium">✓ All licences match</span>}
          </div>
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-center">Giacom</TableHead>
                  <TableHead className="text-center">Support Count</TableHead>
                  <TableHead className="text-center">Difference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No discrepancies found</TableCell></TableRow>
                ) : filtered.map((r, i) =>
                  r.discrepancies.length > 0 ? r.discrepancies.map((d, j) => (
                    <TableRow key={`${i}-${j}`} className="bg-amber-50 dark:bg-amber-900/10">
                      {j === 0 && <TableCell className="font-medium" rowSpan={r.discrepancies.length}>{r.client_name}</TableCell>}
                      <TableCell>{d.product}</TableCell>
                      <TableCell className="text-center">{d.giacom}</TableCell>
                      <TableCell className="text-center">{d.support_count ?? '—'}</TableCell>
                      <TableCell className="text-center"><span className={`font-bold ${d.diff > 0 ? 'text-green-600' : 'text-red-600'}`}>{d.diff > 0 ? `+${d.diff}` : d.diff}</span></TableCell>
                    </TableRow>
                  )) : (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{r.client_name}</TableCell>
                      <TableCell colSpan={4} className="text-muted-foreground text-center">✓ In sync</TableCell>
                    </TableRow>
                  )
                )}
              </TableBody>
            </Table>
          </CardContent></Card>
        </>
      )}
    </ReportShell>
  );
}

// ─── 6. SSL & Domain Expiry ───────────────────────────
function SSLDomainExpiryReport() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState('90');

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await apiClient.get(`/reports/ssl-domain-expiry?days=${days}`); setData(r.data); }
    catch { toast.error('Failed to load report'); }
    finally { setLoading(false); }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const doExport = () => {
    if (!data) return;
    const rows = data.rows.map(r => [r.client_name, r.domain, r.type, r.expiry_date, r.days_left, r.status]);
    exportCSV('ssl-domain-expiry.csv', rows, ['Client', 'Domain', 'Type', 'Expiry Date', 'Days Left', 'Status']);
  };

  return (
    <ReportShell title="SSL & Domain Expiry" icon={Globe} colour="text-teal-500" loading={loading} onRefresh={load} onExport={doExport}
      filters={
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="30">Next 30 days</SelectItem>
            <SelectItem value="60">Next 60 days</SelectItem>
            <SelectItem value="90">Next 90 days</SelectItem>
            <SelectItem value="365">Next 12 months</SelectItem>
          </SelectContent>
        </Select>
      }>
      {data && (
        <>
          <div className="grid grid-cols-4 gap-4">
            <SummaryCard icon={XCircle} label="Expired" value={data.rows.filter(r => r.status === 'expired').length} colour="text-red-600" />
            <SummaryCard icon={AlertTriangle} label="Critical (<14d)" value={data.rows.filter(r => r.status === 'critical').length} colour="text-red-500" />
            <SummaryCard icon={AlertTriangle} label="Warning (<30d)" value={data.rows.filter(r => r.status === 'warning').length} colour="text-amber-600" />
            <SummaryCard icon={CheckCircle} label="OK" value={data.rows.filter(r => r.status === 'ok').length} colour="text-green-600" />
          </div>
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead className="text-center">Days Left</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No expiring certificates in the next {days} days</TableCell></TableRow>
                ) : data.rows.map((r, i) => (
                  <TableRow key={i} className={r.status === 'expired' || r.status === 'critical' ? 'bg-red-50 dark:bg-red-900/10' : r.status === 'warning' ? 'bg-amber-50 dark:bg-amber-900/10' : ''}>
                    <TableCell className="font-medium">{r.client_name}</TableCell>
                    <TableCell className="font-mono text-sm">{r.domain}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{r.type}</Badge></TableCell>
                    <TableCell>{r.expiry_date}</TableCell>
                    <TableCell className="text-center font-bold">{r.days_left < 0 ? 'EXPIRED' : `${r.days_left}d`}</TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </>
      )}
    </ReportShell>
  );
}

// ─── 7. Backup Compliance ─────────────────────────────
function BackupComplianceReport() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await apiClient.get('/reports/backup-compliance'); setData(r.data); }
    catch { toast.error('Failed to load report'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const doExport = () => {
    if (!data) return;
    const rows = data.rows.map(r => [r.client_name, r.altaro_total, r.altaro_success, r.altaro_failed, r.altaro_warning, r.status]);
    exportCSV('backup-compliance.csv', rows, ['Client', 'Total VMs', 'Success', 'Failed', 'Warning', 'Status']);
  };

  return (
    <ReportShell title="Backup Compliance" icon={HardDrive} colour="text-orange-500" loading={loading} onRefresh={load} onExport={doExport}>
      {data && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <SummaryCard icon={CheckCircle} label="All OK" value={data.rows.filter(r => r.status === 'ok').length} colour="text-green-600" />
            <SummaryCard icon={XCircle} label="Failed" value={data.rows.filter(r => r.status === 'failed').length} colour="text-red-600" />
            <SummaryCard icon={AlertTriangle} label="No Data" value={data.rows.filter(r => r.status === 'warning').length} colour="text-amber-600" />
          </div>
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-center">Total VMs</TableHead>
                  <TableHead className="text-center text-green-600">Success</TableHead>
                  <TableHead className="text-center text-red-600">Failed</TableHead>
                  <TableHead className="text-center text-amber-600">Warning</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((r, i) => (
                  <TableRow key={i} className={r.altaro_failed > 0 ? 'bg-red-50 dark:bg-red-900/10' : ''}>
                    <TableCell className="font-medium">{r.client_name}</TableCell>
                    <TableCell className="text-center">{r.altaro_total || '—'}</TableCell>
                    <TableCell className="text-center text-green-600 font-medium">{r.altaro_success || '—'}</TableCell>
                    <TableCell className="text-center">{r.altaro_failed > 0 ? <span className="text-red-600 font-bold">{r.altaro_failed}</span> : '—'}</TableCell>
                    <TableCell className="text-center">{r.altaro_warning > 0 ? <span className="text-amber-600">{r.altaro_warning}</span> : '—'}</TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </>
      )}
    </ReportShell>
  );
}

// ─── 8. Incident Summary ──────────────────────────────
function IncidentSummaryReport() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [months, setMonths] = useState('3');

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await apiClient.get(`/reports/incident-summary?months=${months}`); setData(r.data); }
    catch { toast.error('Failed to load report'); }
    finally { setLoading(false); }
  }, [months]);

  useEffect(() => { load(); }, [load]);

  const doExport = () => {
    if (!data) return;
    const rows = data.rows.map(r => [r.client_name, r.total, r.open, r.closed, r.p1, r.p2, r.p3, r.p4]);
    exportCSV('incident-summary.csv', rows, ['Client', 'Total', 'Open', 'Closed', 'P1', 'P2', 'P3', 'P4']);
  };

  return (
    <ReportShell title="Incident Summary" icon={ShieldAlert} colour="text-red-500" loading={loading} onRefresh={load} onExport={doExport}
      filters={
        <Select value={months} onValueChange={setMonths}>
          <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Last month</SelectItem>
            <SelectItem value="3">Last 3 months</SelectItem>
            <SelectItem value="6">Last 6 months</SelectItem>
            <SelectItem value="12">Last 12 months</SelectItem>
          </SelectContent>
        </Select>
      }>
      {data && (
        <>
          <div className="grid grid-cols-4 gap-4">
            <SummaryCard icon={AlertTriangle} label="Total Incidents" value={data.total_incidents} />
            <SummaryCard icon={XCircle} label="Open" value={data.rows.reduce((s, r) => s + r.open, 0)} colour="text-red-600" />
            <SummaryCard icon={CheckCircle} label="Closed" value={data.rows.reduce((s, r) => s + r.closed, 0)} colour="text-green-600" />
            <SummaryCard icon={AlertTriangle} label="P1/P2" value={data.rows.reduce((s, r) => s + r.p1 + r.p2, 0)} colour="text-red-600" />
          </div>
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-center">Total</TableHead>
                  <TableHead className="text-center text-red-600">Open</TableHead>
                  <TableHead className="text-center">Closed</TableHead>
                  <TableHead className="text-center">P1</TableHead>
                  <TableHead className="text-center">P2</TableHead>
                  <TableHead className="text-center">P3</TableHead>
                  <TableHead className="text-center">P4</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{r.client_name}</TableCell>
                    <TableCell className="text-center font-bold">{r.total}</TableCell>
                    <TableCell className="text-center">{r.open > 0 ? <span className="text-red-600 font-bold">{r.open}</span> : '—'}</TableCell>
                    <TableCell className="text-center text-muted-foreground">{r.closed || '—'}</TableCell>
                    <TableCell className="text-center">{r.p1 > 0 ? <span className="text-red-600 font-bold">{r.p1}</span> : '—'}</TableCell>
                    <TableCell className="text-center">{r.p2 > 0 ? <span className="text-red-500">{r.p2}</span> : '—'}</TableCell>
                    <TableCell className="text-center">{r.p3 || '—'}</TableCell>
                    <TableCell className="text-center text-muted-foreground">{r.p4 || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </>
      )}
    </ReportShell>
  );
}

// ─── 9. Support Contract Overview ────────────────────
function SupportContractOverviewReport() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await apiClient.get(`/reports/support-contract-overview?month=${month}`); setData(r.data); }
    catch { toast.error('Failed to load report'); }
    finally { setLoading(false); }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const doExport = () => {
    if (!data) return;
    const rows = data.rows.map(r => [r.client_name, r.client_type, r.support_type, r.remarks]);
    exportCSV(`support-overview-${month}.csv`, rows, ['Client', 'Type', 'Support Type', 'Remarks']);
  };

  const typeColours = { Monthly: 'text-blue-600', PAYG: 'text-orange-600', 'Support Fund': 'text-purple-600', Hosting: 'text-teal-600' };

  return (
    <ReportShell title="Support Contract Overview" icon={FileText} colour="text-indigo-500" loading={loading} onRefresh={load} onExport={doExport}
      filters={<Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="h-8 w-40" />}>
      {data && (
        <>
          <div className="grid grid-cols-4 gap-4">
            {['Monthly', 'PAYG', 'Support Fund', 'Hosting'].map(type => (
              <SummaryCard key={type} icon={FileText} label={type} value={data.rows.filter(r => r.support_type === type).length} colour={typeColours[type]} />
            ))}
          </div>
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Client Type</TableHead>
                  <TableHead>Support Type</TableHead>
                  <TableHead>Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{r.client_name}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs capitalize">{r.client_type}</Badge></TableCell>
                    <TableCell>
                      <span className={`text-sm font-medium ${typeColours[r.support_type] || 'text-muted-foreground'}`}>
                        {r.support_type}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.remarks || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </>
      )}
    </ReportShell>
  );
}

// ─── 10. Health Check Compliance ─────────────────────
function HealthCheckComplianceReport() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await apiClient.get('/reports/health-check-compliance'); setData(r.data); }
    catch { toast.error('Failed to load report'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const doExport = () => {
    if (!data) return;
    const rows = data.rows.map(r => [r.client_name, r.last_health_check || 'Never', r.days_since ?? '—', r.status]);
    exportCSV('health-check-compliance.csv', rows, ['Client', 'Last Check', 'Days Since', 'Status']);
  };

  return (
    <ReportShell title="Health Check Compliance" icon={ClipboardCheck} colour="text-green-500" loading={loading} onRefresh={load} onExport={doExport}>
      {data && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <SummaryCard icon={CheckCircle} label="Up to Date" value={data.rows.filter(r => r.status === 'ok').length} colour="text-green-600" />
            <SummaryCard icon={AlertTriangle} label="Overdue" value={data.rows.filter(r => r.status === 'overdue').length} colour="text-amber-600" />
            <SummaryCard icon={XCircle} label="Never Done" value={data.rows.filter(r => r.status === 'never').length} colour="text-red-600" />
          </div>
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Last Health Check</TableHead>
                  <TableHead className="text-center">Days Since</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((r, i) => (
                  <TableRow key={i} className={r.status === 'never' || r.status === 'overdue' ? 'bg-amber-50 dark:bg-amber-900/10' : ''}>
                    <TableCell className="font-medium">{r.client_name}</TableCell>
                    <TableCell>{r.last_health_check || <span className="text-muted-foreground">Never</span>}</TableCell>
                    <TableCell className="text-center">{r.days_since != null ? `${r.days_since}d` : '—'}</TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </>
      )}
    </ReportShell>
  );
}

// ─── Main Page ────────────────────────────────────────
export default function Reports() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Operational and billing reports across all clients</p>
      </div>

      <Tabs defaultValue="billing">
        <TabsList className="flex flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="billing"><PoundSterling className="h-3.5 w-3.5 mr-1" />Billing</TabsTrigger>
          <TabsTrigger value="monthly"><BarChart3 className="h-3.5 w-3.5 mr-1" />Monthly Summary</TabsTrigger>
          <TabsTrigger value="devices"><Server className="h-3.5 w-3.5 mr-1" />Device Health</TabsTrigger>
          <TabsTrigger value="time"><Clock className="h-3.5 w-3.5 mr-1" />Time Tracking</TabsTrigger>
          <TabsTrigger value="licences"><Scale className="h-3.5 w-3.5 mr-1" />Licences</TabsTrigger>
          <TabsTrigger value="ssl"><Globe className="h-3.5 w-3.5 mr-1" />SSL & Domains</TabsTrigger>
          <TabsTrigger value="backups"><HardDrive className="h-3.5 w-3.5 mr-1" />Backups</TabsTrigger>
          <TabsTrigger value="incidents"><ShieldAlert className="h-3.5 w-3.5 mr-1" />Incidents</TabsTrigger>
          <TabsTrigger value="support"><FileText className="h-3.5 w-3.5 mr-1" />Support</TabsTrigger>
          <TabsTrigger value="healthchecks"><ClipboardCheck className="h-3.5 w-3.5 mr-1" />Health Checks</TabsTrigger>
        </TabsList>

        <div className="mt-4">
          <TabsContent value="billing"><BillingOverviewReport /></TabsContent>
          <TabsContent value="monthly"><MonthlyClientSummaryReport /></TabsContent>
          <TabsContent value="devices"><DeviceHealthReport /></TabsContent>
          <TabsContent value="time"><TimeTrackingReport /></TabsContent>
          <TabsContent value="licences"><LicenceReconciliationReport /></TabsContent>
          <TabsContent value="ssl"><SSLDomainExpiryReport /></TabsContent>
          <TabsContent value="backups"><BackupComplianceReport /></TabsContent>
          <TabsContent value="incidents"><IncidentSummaryReport /></TabsContent>
          <TabsContent value="support"><SupportContractOverviewReport /></TabsContent>
          <TabsContent value="healthchecks"><HealthCheckComplianceReport /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
