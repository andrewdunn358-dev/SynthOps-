import React, { useState, useEffect, useCallback } from 'react';
import { apiClient, useAuth } from '../App';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Wifi, WifiOff, Router, Radio, Server, RefreshCw,
  ChevronDown, ChevronRight, Search, Monitor, Network,
} from 'lucide-react';

function OnlineBadge({ online }) {
  return online
    ? <Badge className="bg-green-600 text-white gap-1 text-xs"><Wifi className="w-3 h-3" />Online</Badge>
    : <Badge variant="destructive" className="gap-1 text-xs"><WifiOff className="w-3 h-3" />Offline</Badge>;
}

function StatPill({ label, value, warn }) {
  return (
    <div className="text-center px-3 py-1.5 bg-muted rounded-md">
      <p className={`text-lg font-bold leading-none ${warn ? 'text-red-400' : ''}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wide">{label}</p>
    </div>
  );
}

function fmtUptime(d) {
  const t = d.startupTime || d.uptime;
  if (!t) return '—';
  if (typeof t === 'number') {
    const days = Math.floor(t / 86400), h = Math.floor((t % 86400) / 3600), m = Math.floor((t % 3600) / 60);
    if (days > 0) return `${days}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }
  const secs = Math.floor((Date.now() - new Date(t).getTime()) / 1000);
  if (secs < 0) return '—';
  const days = Math.floor(secs / 86400), h = Math.floor((secs % 86400) / 3600), m = Math.floor((secs % 3600) / 60);
  if (days > 0) return `${days}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
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

function DeviceIcon({ type }) {
  if (type === 'Switch') return <Server className="w-4 h-4 text-blue-400" />;
  if (type === 'Access Point') return <Radio className="w-4 h-4 text-purple-400" />;
  return <Router className="w-4 h-4 text-muted-foreground" />;
}

// Derive a display name + WAN IP from a site object
function siteName(site) {
  return site.meta?.desc || site.meta?.name || site.siteId;
}

function siteWanIp(site) {
  const wans = site.statistics?.wans || {};
  const first = Object.values(wans)[0];
  return first?.externalIp || '—';
}

function siteIsOnline(site) {
  const counts = site.statistics?.counts || {};
  // A site is "offline" only if its gateway is offline
  return (counts.offlineGatewayDevice || 0) === 0;
}

// ── component ─────────────────────────────────────────────────────────────────

export default function UniFiDashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [status, setStatus]     = useState(null);
  const [synthClients, setSynthClients] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [syncing, setSyncing]   = useState(false);
  const [expanded, setExpanded] = useState({});
  const [search, setSearch]     = useState('');
  const [mapping, setMapping]   = useState({});   // hostId -> client_id pending save

  const fetchStatus = useCallback(async () => {
    try {
      const res = await apiClient.get('/integrations/unifi/status');
      setStatus(res.data);
      const init = {};
      (res.data.hosts || []).forEach(h => {
        if (h.synthops_client_id) init[h.id] = h.synthops_client_id;
      });
      setMapping(m => ({ ...init, ...m }));
    } catch {
      toast.error('Failed to load UniFi status');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchClients = useCallback(async () => {
    try {
      const res = await apiClient.get('/clients');
      setSynthClients(res.data || []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchClients();
    const t = setInterval(fetchStatus, 60_000);
    return () => clearInterval(t);
  }, [fetchStatus, fetchClients]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await apiClient.post('/integrations/unifi/sync');
      toast.success('UniFi sync complete');
      await fetchStatus();
    } catch { toast.error('Sync failed'); }
    finally { setSyncing(false); }
  };

  const saveMapping = async (host_id) => {
    const client_id = mapping[host_id];
    if (!client_id || client_id === '__none__') return;
    try {
      await apiClient.post('/integrations/unifi/map', { host_id, client_id });
      toast.success('Mapping saved');
      await fetchStatus();
    } catch { toast.error('Failed to save mapping'); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading UniFi status…
      </div>
    );
  }

  const hosts   = status?.hosts   || [];
  const sites   = status?.sites   || [];
  const devices = status?.devices || [];

  // Build a hostId -> hostName lookup
  const hostNames = {};
  hosts.forEach(h => {
    const rs = h.reportedState || {};
    hostNames[h.id] = rs.hostname || h.userData?.name || h.id;
  });

  // Summary totals from site statistics
  const totalSites    = sites.length;
  const offlineSites  = sites.filter(s => !siteIsOnline(s)).length;
  const totalDevices  = sites.reduce((n, s) => n + (s.statistics?.counts?.totalDevice || 0), 0);
  const offlineDevices = sites.reduce((n, s) => n + (s.statistics?.counts?.offlineDevice || 0), 0);
  const totalClients  = sites.reduce((n, s) => n + (s.statistics?.counts?.wifiClient || 0) + (s.statistics?.counts?.wiredClient || 0), 0);

  // Filter + sort: sites with issues float to the top
  const filteredSites = sites
    .filter(s => siteName(s).toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const aOff = a.statistics?.counts?.offlineDevice || 0;
      const bOff = b.statistics?.counts?.offlineDevice || 0;
      const aGw  = a.statistics?.counts?.offlineGatewayDevice || 0;
      const bGw  = b.statistics?.counts?.offlineGatewayDevice || 0;
      // Gateway offline > device offline > all clear
      if (aGw !== bGw) return bGw - aGw;
      if (aOff !== bOff) return bOff - aOff;
      return siteName(a).localeCompare(siteName(b));
    });

  // Group devices by hostId for the expanded device table
  const devicesByHost = {};
  devices.forEach(d => {
    const hid = d.hostId || 'unknown';
    if (!devicesByHost[hid]) devicesByHost[hid] = [];
    devicesByHost[hid].push(d);
  });

  return (
    <div className="space-y-6 p-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wifi className="w-6 h-6" /> UniFi Network
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Via UniFi Site Manager · Last sync: {fmtTime(status?.synced_at)}
          </p>
        </div>
        {isAdmin && (
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing…' : 'Sync Now'}
          </Button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card><CardContent className="pt-5 pb-4">
          <p className="text-sm text-muted-foreground">Sites</p>
          <p className="text-3xl font-bold mt-1">{totalSites}</p>
        </CardContent></Card>
        <Card className={offlineSites > 0 ? 'border-red-500' : ''}>
          <CardContent className="pt-5 pb-4">
            <p className="text-sm text-muted-foreground">Sites Offline</p>
            <p className={`text-3xl font-bold mt-1 ${offlineSites > 0 ? 'text-red-500' : 'text-green-500'}`}>{offlineSites}</p>
          </CardContent>
        </Card>
        <Card><CardContent className="pt-5 pb-4">
          <p className="text-sm text-muted-foreground">Devices</p>
          <p className="text-3xl font-bold mt-1">{totalDevices}</p>
        </CardContent></Card>
        <Card className={offlineDevices > 0 ? 'border-amber-500' : ''}>
          <CardContent className="pt-5 pb-4">
            <p className="text-sm text-muted-foreground">Devices Offline</p>
            <p className={`text-3xl font-bold mt-1 ${offlineDevices > 0 ? 'text-amber-400' : 'text-green-500'}`}>{offlineDevices}</p>
          </CardContent>
        </Card>
        <Card><CardContent className="pt-5 pb-4">
          <p className="text-sm text-muted-foreground">Connected Clients</p>
          <p className="text-3xl font-bold mt-1">{totalClients}</p>
        </CardContent></Card>
      </div>

      {/* No data */}
      {!status?.synced_at && (
        <Card>
          <CardContent className="pt-8 pb-8 text-center text-muted-foreground">
            <Wifi className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No UniFi data yet</p>
            <p className="text-sm mt-1">
              {isAdmin ? 'Add UNIFI_API_KEY to your .env and hit Sync Now.' : 'Waiting for first sync.'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* UDM Pro gateways — admin mapping */}
      {isAdmin && hosts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Router className="w-4 h-4" /> Gateways (UDM Pros)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {hosts.map(host => {
              const rs = host.reportedState || {};
              const name = rs.hostname || host.userData?.name || host.id;
              const fw   = rs.version || rs.firmwareVersion || '';
              const wanRaw = rs.wan || {};
              const wanIp  = (typeof wanRaw === 'string' ? wanRaw : wanRaw?.ip || wanRaw?.extIp || '') || host.ipAddress || '—';
              const hDevices = devicesByHost[host.id] || [];
              return (
                <div key={host.id} className="flex flex-wrap items-center gap-3 p-3 bg-muted rounded-lg">
                  <OnlineBadge online={host.is_online !== false} />
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-sm">{name}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      WAN: {wanIp}{fw ? ` · FW ${fw}` : ''}
                      {hDevices.length > 0 && ` · ${hDevices.length} devices cached`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={mapping[host.id] || '__none__'}
                      onValueChange={v => setMapping(m => ({ ...m, [host.id]: v }))}
                    >
                      <SelectTrigger className="h-7 text-xs w-44">
                        <SelectValue placeholder="Link to client…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— not linked —</SelectItem>
                        {synthClients.map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {mapping[host.id] && mapping[host.id] !== '__none__' &&
                     mapping[host.id] !== host.synthops_client_id && (
                      <Button size="sm" className="h-7 text-xs" onClick={() => saveMapping(host.id)}>Save</Button>
                    )}
                    {host.synthops_client_name && mapping[host.id] === host.synthops_client_id && (
                      <span className="text-xs text-green-500">✓ {host.synthops_client_name}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Site list */}
      {sites.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Network className="w-5 h-5" /> All Sites ({filteredSites.length}{search ? ` of ${totalSites}` : ''})
            </h2>
            <div className="relative w-56">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search sites…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
          </div>

          {filteredSites.map(site => {
            const name      = siteName(site);
            const wanIp     = siteWanIp(site);
            const online    = siteIsOnline(site);
            const counts    = site.statistics?.counts || {};
            const isp       = site.statistics?.ispInfo?.name || '';
            const offDev    = counts.offlineDevice || 0;
            const hasIssue  = offDev > 0;
            // Auto-expand sites with offline devices; user can still toggle
            const hostName  = hostNames[site.hostId] || site.hostId || '—';
            const siteDevices = devicesByHost[site.hostId] || [];
            // Only show the device table if this host has exactly one site —
            // i.e. UDM Pros (Linskill, Tilia). The self-hosted controller hosts
            // all 28 sites so its device list is not per-site — showing the
            // same 24 devices under every site would be misleading.
            const sitesOnThisHost = sites.filter(s => s.hostId === site.hostId).length;
            const showDevices = sitesOnThisHost === 1 && siteDevices.length > 0;
            const isExp = expanded[site.siteId] !== undefined
              ? expanded[site.siteId]
              : (hasIssue && showDevices);
            const sortedDevices = showDevices && hasIssue
              ? [...siteDevices].sort((a, b) => (a.status === 'online' ? 1 : 0) - (b.status === 'online' ? 1 : 0))
              : siteDevices;

            return (
              <Card key={site.siteId} className={
                !online ? 'border-red-500/60' :
                hasIssue ? 'border-amber-500/60 bg-amber-500/5' : ''
              }>
                <CardHeader className="pb-2 pt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <OnlineBadge online={online} />
                      {hasIssue && (
                        <Badge className="bg-amber-500/20 text-amber-400 gap-1">
                          <WifiOff className="w-3 h-3" />{offDev} offline
                        </Badge>
                      )}
                      <div>
                        <span className="font-semibold text-base">{name}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {wanIp !== '—' ? `WAN: ${wanIp}` : ''}
                          {isp ? ` · ${isp}` : ''}
                          {` · via ${hostName}`}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="hidden md:flex items-center gap-3">
                        <StatPill label="Devices" value={counts.totalDevice || 0} />
                        <StatPill label="Offline" value={counts.offlineDevice || 0} warn={(counts.offlineDevice || 0) > 0} />
                        <StatPill label="Clients" value={(counts.wifiClient || 0) + (counts.wiredClient || 0)} />
                        <StatPill label="APs" value={counts.wifiDevice || 0} />
                      </div>
                      {showDevices && (
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => setExpanded(e => ({ ...e, [site.siteId]: !isExp }))}
                          className="text-xs text-muted-foreground"
                        >
                          {isExp
                            ? <><ChevronDown className="w-4 h-4 mr-1" />Hide</>
                            : <><ChevronRight className="w-4 h-4 mr-1" />{siteDevices.length} device{siteDevices.length !== 1 ? 's' : ''}</>
                          }
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>

                {isExp && showDevices && (
                  <CardContent className="pt-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Device</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Model</TableHead>
                          <TableHead>IP</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Uptime</TableHead>
                          <TableHead>Firmware</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedDevices.map((d, idx) => {
                          const dt = deviceType(d);
                          const dOnline = d.status === 'online';
                          return (
                            <TableRow key={d.id || d.mac || idx} className={!dOnline ? 'bg-amber-500/5' : ''}>
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  <DeviceIcon type={dt} />
                                  {d.name || d.hostname || d.mac || '—'}
                                </div>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">{dt}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{d.model || '—'}</TableCell>
                              <TableCell className="text-sm font-mono">{d.ip || d.ipAddress || '—'}</TableCell>
                              <TableCell><OnlineBadge online={dOnline} /></TableCell>
                              <TableCell className="text-sm text-muted-foreground">{fmtUptime(d)}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{d.version || d.firmwareVersion || '—'}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
