import React, { useState, useEffect, useCallback } from 'react';
import { apiClient, useAuth } from '../App';
import { toast } from 'sonner';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent } from '../components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import {
  Wifi, WifiOff, Router, Radio, Server, RefreshCw, Search,
  ChevronLeft, AlertTriangle, Users, Monitor, Network, Activity,
  Settings,
} from 'lucide-react';

// ── helpers ────────────────────────────────────────────────────────────────

function fmtUptime(d) {
  const t = d.startupTime || d.uptime;
  if (!t) return '—';
  if (typeof t === 'number') {
    const dy = Math.floor(t / 86400), h = Math.floor((t % 86400) / 3600), m = Math.floor((t % 3600) / 60);
    return dy > 0 ? `${dy}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  }
  const secs = Math.max(0, Math.floor((Date.now() - new Date(t).getTime()) / 1000));
  const dy = Math.floor(secs / 86400), h = Math.floor((secs % 86400) / 3600), m = Math.floor((secs % 3600) / 60);
  return dy > 0 ? `${dy}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function deviceType(d) {
  const s = (d.shortname || d.model || '').toLowerCase();
  if (s.startsWith('usw') || s.includes('switch')) return 'Switch';
  if (s.startsWith('uap') || s.startsWith('u6') || s.startsWith('u7') || /^u\d/.test(s) || s.includes('ap')) return 'Access Point';
  if (d.isConsole) return 'Gateway';
  return d.productLine || 'Device';
}

function DeviceIcon({ type, cls = 'w-4 h-4' }) {
  if (type === 'Switch')       return <Server className={`${cls} text-blue-400`} />;
  if (type === 'Access Point') return <Radio className={`${cls} text-purple-400`} />;
  return <Router className={`${cls} text-muted-foreground`} />;
}

function siteName(s, hostNames) {
  const raw = s.meta?.desc || s.meta?.name || s.siteId;
  // "Default" is the auto-created site name on every UDM Pro — not useful.
  // If the site is named "default" or "Default", use the host's name instead.
  if (raw.toLowerCase() === 'default' && hostNames) {
    const hostName = hostNames[s.hostId];
    if (hostName && hostName !== 'UniFi Network Server') return hostName;
  }
  return raw;
}
function siteWanIp(s) {
  const w = Object.values(s.statistics?.wans || {})[0];
  return w?.externalIp || '—';
}
function siteIsOnline(s) { return (s.statistics?.counts?.offlineGatewayDevice || 0) === 0; }

// ── Site card (grid view) ──────────────────────────────────────────────────

function SiteCard({ site, onClick, nameFn }) {
  const name    = nameFn(site);
  const online  = siteIsOnline(site);
  const counts  = site.statistics?.counts || {};
  const offDev  = counts.offlineDevice || 0;
  const hasIssue = offDev > 0;
  const wanIp   = siteWanIp(site);
  const isp     = site.statistics?.ispInfo?.name || '';
  const clients = (counts.wifiClient || 0) + (counts.wiredClient || 0);

  return (
    <div
      onClick={onClick}
      className={`
        rounded-xl border p-4 cursor-pointer transition-all duration-150
        hover:border-primary/60 hover:shadow-md hover:bg-accent/30
        ${!online   ? 'border-red-500/70 bg-red-500/5' :
          hasIssue  ? 'border-amber-500/60 bg-amber-500/5' :
                      'border-border bg-card'}
      `}
    >
      {/* Status dot + name */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-0.5
            ${!online ? 'bg-red-500 shadow-[0_0_6px_#ef4444]' :
              hasIssue ? 'bg-amber-400 shadow-[0_0_6px_#f59e0b]' :
                         'bg-green-500 shadow-[0_0_6px_#22c55e]'}`}
          />
          <span className="font-semibold text-sm truncate">{name}</span>
        </div>
        {hasIssue && (
          <Badge className="bg-amber-500/20 text-amber-400 text-[10px] flex-shrink-0">
            <AlertTriangle className="w-2.5 h-2.5 mr-1" />{offDev} offline
          </Badge>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-1 text-center">
        {[
          { label: 'Devices', value: counts.totalDevice || 0, warn: hasIssue },
          { label: 'APs',     value: counts.wifiDevice   || 0 },
          { label: 'Clients', value: clients },
          { label: 'Offline', value: offDev, warn: offDev > 0 },
        ].map(s => (
          <div key={s.label} className="bg-muted/50 rounded p-1.5">
            <p className={`text-base font-bold leading-none ${s.warn && s.value > 0 ? 'text-amber-400' : ''}`}>{s.value}</p>
            <p className="text-[9px] text-muted-foreground mt-0.5 uppercase tracking-wide">{s.label}</p>
          </div>
        ))}
      </div>

      {/* WAN / ISP */}
      {(wanIp !== '—' || isp) && (
        <p className="text-[10px] text-muted-foreground mt-2 truncate">
          {wanIp !== '—' ? wanIp : ''}{wanIp !== '—' && isp ? ' · ' : ''}{isp}
        </p>
      )}
    </div>
  );
}

// ── Site detail (drill-down) ───────────────────────────────────────────────

function SiteDetail({ site, devices, onBack, synthClients, isAdmin,
                      hostNames, directHostIds, onSaveMapping, nameFn }) {
  const name    = nameFn(site);
  const online  = siteIsOnline(site);
  const counts  = site.statistics?.counts || {};
  const offDev  = counts.offlineDevice || 0;
  const wanIp   = siteWanIp(site);
  const isp     = site.statistics?.ispInfo?.name || '';
  const clients = (counts.wifiClient || 0) + (counts.wiredClient || 0);
  const hasDevices = directHostIds.has(site.hostId) && devices.length > 0;
  const hostName   = hostNames[site.hostId] || site.hostId;
  const sortedDevs = hasDevices
    ? [...devices].sort((a, b) => (a.status === 'online' ? 1 : 0) - (b.status === 'online' ? 1 : 0))
    : [];

  const wans = site.statistics?.wans || {};
  const internetIssues = site.statistics?.internetIssues || [];
  const pct = site.statistics?.percentages || {};

  return (
    <div className="space-y-5">
      {/* Back + title */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ChevronLeft className="w-4 h-4 mr-1" /> All Sites
        </Button>
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full
            ${!online ? 'bg-red-500' : offDev > 0 ? 'bg-amber-400' : 'bg-green-500'}`}
          />
          <h2 className="text-xl font-bold">{name}</h2>
          {!online && <Badge variant="destructive">Gateway Offline</Badge>}
          {online && offDev > 0 &&
            <Badge className="bg-amber-500/20 text-amber-400">{offDev} device{offDev !== 1 ? 's' : ''} offline</Badge>}
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Total Devices', value: counts.totalDevice || 0, icon: <Monitor className="w-4 h-4" /> },
          { label: 'Offline',       value: offDev, icon: <WifiOff className="w-4 h-4" />, warn: offDev > 0 },
          { label: 'Access Points', value: counts.wifiDevice || 0, icon: <Radio className="w-4 h-4" /> },
          { label: 'Connected',     value: clients, icon: <Users className="w-4 h-4" /> },
          { label: 'WAN Uptime',    value: pct.wanUptime != null ? `${Math.round(pct.wanUptime)}%` : '—', icon: <Activity className="w-4 h-4" /> },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border p-4 ${s.warn && s.value > 0 ? 'border-amber-500/50 bg-amber-500/5' : 'bg-card'}`}>
            <div className={`mb-1 ${s.warn && s.value > 0 ? 'text-amber-400' : 'text-muted-foreground'}`}>{s.icon}</div>
            <p className={`text-2xl font-bold ${s.warn && s.value > 0 ? 'text-amber-400' : ''}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* WAN / ISP info */}
      {(wanIp !== '—' || isp || Object.keys(wans).length > 0) && (
        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Network className="w-4 h-4" /> WAN
          </h3>
          <div className="flex flex-wrap gap-4 text-sm">
            {Object.entries(wans).map(([key, w]) => (
              <div key={key}>
                <span className="text-muted-foreground text-xs uppercase tracking-wide">{key}</span>
                <p className="font-mono font-medium">{w.externalIp || '—'}</p>
                {w.ispInfo?.name && <p className="text-xs text-muted-foreground">{w.ispInfo.name}</p>}
              </div>
            ))}
            {Object.keys(wans).length === 0 && wanIp !== '—' && (
              <div>
                <span className="text-muted-foreground text-xs">WAN</span>
                <p className="font-mono font-medium">{wanIp}</p>
                {isp && <p className="text-xs text-muted-foreground">{isp}</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Device table — only for UDM Pro sites */}
      {hasDevices && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Monitor className="w-4 h-4" /> Devices ({sortedDevs.length})
            </h3>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Uptime</TableHead>
                <TableHead>Firmware</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedDevs.map((d, i) => {
                const dt = deviceType(d);
                const dOn = d.status === 'online';
                return (
                  <TableRow key={d.id || d.mac || i} className={!dOn ? 'bg-amber-500/5' : ''}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${dOn ? 'bg-green-500' : 'bg-amber-400'}`} />
                        <DeviceIcon type={dt} cls="w-3.5 h-3.5" />
                        {d.name || d.mac || '—'}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{dt}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{d.model || '—'}</TableCell>
                    <TableCell className="text-sm font-mono">{d.ip || '—'}</TableCell>
                    <TableCell>
                      {dOn
                        ? <Badge className="bg-green-600/20 text-green-400 text-xs">Online</Badge>
                        : <Badge className="bg-amber-500/20 text-amber-400 text-xs">Offline</Badge>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtUptime(d)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{d.version || '—'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {!hasDevices && (
        <div className="rounded-xl border bg-card p-6 text-center text-muted-foreground text-sm">
          <Monitor className="w-8 h-8 mx-auto mb-2 opacity-30" />
          Device-level detail is available for UDM Pro sites only.<br />
          This site is managed by the shared controller — use statistics above for status.
        </div>
      )}

      {/* Admin: client mapping for this site's host */}
      {isAdmin && (
        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Settings className="w-4 h-4" /> Gateway Settings
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            via {hostName} · Link this gateway to a SynthOps client to auto-assign incidents.
          </p>
          {onSaveMapping(site.hostId)}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function UniFiDashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [status, setStatus]         = useState(null);
  const [synthClients, setSynthClients] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [syncing, setSyncing]       = useState(false);
  const [search, setSearch]         = useState('');
  const [selectedSite, setSelectedSite] = useState(null);
  const [mapping, setMapping]       = useState({});

  const fetchStatus = useCallback(async () => {
    try {
      const res = await apiClient.get('/integrations/unifi/status');
      setStatus(res.data);
      const init = {};
      (res.data.hosts || []).forEach(h => {
        if (h.synthops_client_id) init[h.id] = h.synthops_client_id;
      });
      setMapping(m => ({ ...init, ...m }));
    } catch { toast.error('Failed to load UniFi status'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchStatus();
    apiClient.get('/clients').then(r => setSynthClients(r.data || [])).catch(() => {});
    const t = setInterval(fetchStatus, 60_000);
    return () => clearInterval(t);
  }, [fetchStatus]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await apiClient.post('/integrations/unifi/sync');
      toast.success('Sync complete');
      await fetchStatus();
    } catch { toast.error('Sync failed'); }
    finally { setSyncing(false); }
  };

  const saveMapping = async (hostId, clientId) => {
    if (!clientId || clientId === '__none__') return;
    try {
      await apiClient.post('/integrations/unifi/map', { host_id: hostId, client_id: clientId });
      toast.success('Mapping saved');
      await fetchStatus();
    } catch { toast.error('Failed to save mapping'); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-muted-foreground">
      <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading…
    </div>
  );

  const hosts   = status?.hosts   || [];
  const sites   = status?.sites   || [];
  const devices = status?.devices || [];

  // Build hostId cross-reference (short hex ↔ long composite)
  const hostNames = {};
  const shortToLong = {};
  hosts.forEach(h => {
    const short = (h.id || '').toLowerCase();
    const rs = h.reportedState || {};
    const isHex = /^[0-9a-f]{12}$/i.test(h.id || '');
    const name = rs.hostname || h.userData?.name || (isHex ? 'UniFi Network Server' : h.id);
    const match = sites.find(s => (s.hostId || '').toLowerCase().replace(/[^0-9a-f]/g, '').startsWith(short));
    if (match) {
      shortToLong[short] = match.hostId;
      hostNames[match.hostId] = name;
    }
    hostNames[h.id] = name;
  });

  // directHostIds: long hostIds with ≤3 sites (UDM Pros, not shared controller)
  const devicesByHost = {};
  devices.forEach(d => {
    if (!devicesByHost[d.hostId]) devicesByHost[d.hostId] = [];
    devicesByHost[d.hostId].push(d);
  });
  const directHostIds = new Set(
    Object.keys(devicesByHost).filter(hid => sites.filter(s => s.hostId === hid).length <= 3)
  );

  // Summary
  const totalDevices   = sites.reduce((n, s) => n + (s.statistics?.counts?.totalDevice || 0), 0);
  const offlineDevices = sites.reduce((n, s) => n + (s.statistics?.counts?.offlineDevice || 0), 0);
  const totalClients   = sites.reduce((n, s) =>
    n + (s.statistics?.counts?.wifiClient || 0) + (s.statistics?.counts?.wiredClient || 0), 0);

  // Filter + sort
  const filtered = sites
    .filter(s => siteName(s, hostNames).toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const aGw = a.statistics?.counts?.offlineGatewayDevice || 0;
      const bGw = b.statistics?.counts?.offlineGatewayDevice || 0;
      const aOff = a.statistics?.counts?.offlineDevice || 0;
      const bOff = b.statistics?.counts?.offlineDevice || 0;
      if (aGw !== bGw) return bGw - aGw;
      if (aOff !== bOff) return bOff - aOff;
      return siteName(a, hostNames).localeCompare(siteName(b, hostNames));
    });

  // Mapping UI renderer (used in detail view)
  const mappingUI = (longHostId) => {
    const host = hosts.find(h => shortToLong[(h.id || '').toLowerCase()] === longHostId || h.id === longHostId);
    if (!host) return null;
    const shortId = host.id;
    const current = mapping[shortId];
    const saved   = host.synthops_client_id;
    return (
      <div className="flex items-center gap-2">
        <Select
          value={current || '__none__'}
          onValueChange={v => setMapping(m => ({ ...m, [shortId]: v }))}
        >
          <SelectTrigger className="h-8 text-xs w-48">
            <SelectValue placeholder="Link to client…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— not linked —</SelectItem>
            {synthClients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {current && current !== '__none__' && current !== saved && (
          <Button size="sm" className="h-8 text-xs" onClick={() => saveMapping(shortId, current)}>Save</Button>
        )}
        {host.synthops_client_name && current === saved && (
          <span className="text-xs text-green-500">✓ {host.synthops_client_name}</span>
        )}
      </div>
    );
  };

  // If a site is selected, show the detail view
  if (selectedSite) {
    const siteDevices = devicesByHost[selectedSite.hostId] || [];
    return (
      <div className="p-6">
        <SiteDetail
          site={selectedSite}
          devices={siteDevices}
          onBack={() => setSelectedSite(null)}
          synthClients={synthClients}
          isAdmin={isAdmin}
          hostNames={hostNames}
          directHostIds={directHostIds}
          onSaveMapping={mappingUI}
          nameFn={s => siteName(s, hostNames)}
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wifi className="w-6 h-6" /> UniFi Network
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {fmtTime(status?.synced_at) !== '—' ? `Last sync: ${fmtTime(status?.synced_at)}` : 'Not synced yet'}
          </p>
        </div>
        {isAdmin && (
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing…' : 'Sync Now'}
          </Button>
        )}
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Sites',           value: sites.length },
          { label: 'Sites Offline',   value: sites.filter(s => !siteIsOnline(s)).length, warn: true },
          { label: 'Devices Offline', value: offlineDevices, warn: true },
          { label: 'Connected',       value: totalClients },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border p-4 bg-card ${s.warn && s.value > 0 ? 'border-amber-500/50' : ''}`}>
            <p className={`text-3xl font-bold ${s.warn && s.value > 0 ? 'text-amber-400' : ''}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search sites…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-8 h-9"
        />
      </div>

      {/* Site grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {filtered.map(site => (
          <SiteCard
            key={site.siteId}
            site={site}
            onClick={() => setSelectedSite(site)}
            nameFn={s => siteName(s, hostNames)}
          />
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full text-center text-muted-foreground py-12">
            No sites match "{search}"
          </div>
        )}
      </div>
    </div>
  );
}
