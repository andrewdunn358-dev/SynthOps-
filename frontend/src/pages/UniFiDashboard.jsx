import React, { useState, useEffect, useCallback } from 'react';
import { apiClient, useAuth } from '../App';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Wifi, WifiOff, Router, Radio, Server, RefreshCw, ChevronDown, ChevronRight,
} from 'lucide-react';

// ── helpers ──────────────────────────────────────────────────────────────────

function OnlineBadge({ online }) {
  return online
    ? <Badge className="bg-green-600 text-white gap-1"><Wifi className="w-3 h-3" />Online</Badge>
    : <Badge variant="destructive" className="gap-1"><WifiOff className="w-3 h-3" />Offline</Badge>;
}

function DeviceIcon({ type }) {
  const t = (type || '').toLowerCase();
  if (t.includes('switch')) return <Server className="w-4 h-4 text-blue-400" />;
  if (t.includes('ap') || t.includes('access')) return <Radio className="w-4 h-4 text-purple-400" />;
  return <Router className="w-4 h-4 text-muted-foreground" />;
}

function deviceType(d) {
  const m = (d.model || d.productLine || '').toLowerCase();
  if (m.includes('switch') || m.includes('usw')) return 'Switch';
  if (m.includes('ap') || m.includes('uap') || m.includes('u6') || m.includes('wifi')) return 'Access Point';
  return d.productLine || 'Device';
}

function fmtUptime(seconds) {
  if (!seconds) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

// ── component ─────────────────────────────────────────────────────────────────

export default function UniFiDashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [status, setStatus]       = useState(null);   // { hosts, sites, devices, synced_at }
  const [clients, setClients]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [syncing, setSyncing]     = useState(false);
  const [expanded, setExpanded]   = useState({});       // host_id -> bool
  const [mapping, setMapping]     = useState({});       // host_id -> client_id (pending save)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await apiClient.get('/integrations/unifi/status');
      setStatus(res.data);
      // Pre-populate mapping state from current saved mappings
      const init = {};
      (res.data.hosts || []).forEach(h => {
        if (h.synthops_client_id) init[h.id] = h.synthops_client_id;
      });
      setMapping(m => ({ ...init, ...m }));
    } catch (e) {
      toast.error('Failed to load UniFi status');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchClients = useCallback(async () => {
    try {
      const res = await apiClient.get('/clients');
      setClients(res.data || []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchClients();
    const t = setInterval(fetchStatus, 60_000);  // refresh every minute
    return () => clearInterval(t);
  }, [fetchStatus, fetchClients]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await apiClient.post('/integrations/unifi/sync');
      toast.success('UniFi sync complete');
      await fetchStatus();
    } catch {
      toast.error('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const saveMapping = async (host_id) => {
    const client_id = mapping[host_id];
    if (!client_id || client_id === '__none__') return;
    try {
      await apiClient.post('/integrations/unifi/map', { host_id, client_id });
      toast.success('Mapping saved — incidents will now be linked to this client');
      await fetchStatus();
    } catch {
      toast.error('Failed to save mapping');
    }
  };

  const toggleExpand = (id) => setExpanded(e => ({ ...e, [id]: !e[id] }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading UniFi status…
      </div>
    );
  }

  const hosts   = status?.hosts   || [];
  const devices = status?.devices || [];

  // Determine overall health for the summary card
  const totalHosts   = hosts.length;
  const offlineHosts = hosts.filter(h => !h.is_online).length;

  return (
    <div className="space-y-6 p-6">

      {/* ── header ─────────────────────────────────────────────────── */}
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

      {/* ── summary cards ───────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Gateways</p>
            <p className="text-3xl font-bold mt-1">{totalHosts}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Devices</p>
            <p className="text-3xl font-bold mt-1">{devices.length}</p>
          </CardContent>
        </Card>
        <Card className={offlineHosts > 0 ? 'border-red-500' : ''}>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Offline Gateways</p>
            <p className={`text-3xl font-bold mt-1 ${offlineHosts > 0 ? 'text-red-500' : 'text-green-500'}`}>
              {offlineHosts}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── no data state ───────────────────────────────────────────── */}
      {!status?.synced_at && (
        <Card>
          <CardContent className="pt-8 pb-8 text-center text-muted-foreground">
            <Wifi className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No UniFi data yet</p>
            <p className="text-sm mt-1">
              {isAdmin
                ? 'Add UNIFI_API_KEY to your .env and hit Sync Now to pull data.'
                : 'Waiting for first sync — check back shortly.'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── per-host cards ──────────────────────────────────────────── */}
      {hosts.map(host => {
        const hostId   = host.id;
        // UniFi API returns hostname in reportedState.hostname for most devices.
        // Some devices (especially older or factory-reset units) leave that field
        // empty, so fall back through userData.name → hardwareId short form → id.
        const reportedState = host.reportedState || {};
        const hostName =
          reportedState.hostname ||
          host.userData?.name ||
          (host.hardwareId ? host.hardwareId.split('-')[0] : null) ||
          host.id;
        // WAN IP: the API puts this in reportedState.wan.ip, but the exact
        // sub-field varies by firmware. Try the known paths in order.
        const wan    = reportedState.wan || reportedState.wanIp || {};
        const wanIp  = (typeof wan === 'string' ? wan : wan?.ip || wan?.extIp || wan?.ipAddress) ||
                       host.ipAddress || '—';
        const fwVer  = reportedState.version || reportedState.firmwareVersion || '';
        const isExpanded = expanded[hostId];

        // Devices that belong to this host (UniFi links devices to a hostId)
        const hostDevices = devices.filter(d =>
          d.hostId === hostId || d.host_id === hostId
        );

        // Split by type for counts
        const switches = hostDevices.filter(d => deviceType(d) === 'Switch');
        const aps      = hostDevices.filter(d => deviceType(d) === 'Access Point');

        return (
          <Card key={hostId} className={!host.is_online ? 'border-red-500/60' : ''}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Router className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <CardTitle className="text-base">{hostName}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      WAN: {wanIp}
                      {fwVer ? ` · FW ${fwVer}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <OnlineBadge online={host.is_online} />
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => toggleExpand(hostId)}
                    className="text-xs text-muted-foreground"
                  >
                    {isExpanded
                      ? <><ChevronDown className="w-4 h-4 mr-1" />Hide devices</>
                      : <><ChevronRight className="w-4 h-4 mr-1" />
                          {hostDevices.length} device{hostDevices.length !== 1 ? 's' : ''}
                          {switches.length > 0 ? ` · ${switches.length} switch${switches.length !== 1 ? 'es' : ''}` : ''}
                          {aps.length > 0 ? ` · ${aps.length} AP${aps.length !== 1 ? 's' : ''}` : ''}
                        </>
                    }
                  </Button>
                </div>
              </div>

              {/* Client mapping — admin only */}
              {isAdmin && (
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    Linked client:
                  </span>
                  <Select
                    value={mapping[hostId] || '__none__'}
                    onValueChange={v => setMapping(m => ({ ...m, [hostId]: v }))}
                  >
                    <SelectTrigger className="h-7 text-xs w-52">
                      <SelectValue placeholder="Link to client…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— not linked —</SelectItem>
                      {clients.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {mapping[hostId] && mapping[hostId] !== '__none__' &&
                    mapping[hostId] !== host.synthops_client_id && (
                    <Button size="sm" className="h-7 text-xs" onClick={() => saveMapping(hostId)}>
                      Save
                    </Button>
                  )}
                  {host.synthops_client_name && mapping[hostId] === host.synthops_client_id && (
                    <span className="text-xs text-green-500">✓ {host.synthops_client_name}</span>
                  )}
                </div>
              )}
              {/* Non-admin: just show linked name */}
              {!isAdmin && host.synthops_client_name && (
                <p className="text-xs text-muted-foreground mt-2">
                  Client: <span className="text-foreground">{host.synthops_client_name}</span>
                </p>
              )}
            </CardHeader>

            {/* ── device list (expanded) ──────────────────────────── */}
            {isExpanded && (
              <CardContent className="pt-0">
                {hostDevices.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No devices found for this gateway in the current sync.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Device</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Model</TableHead>
                        <TableHead>IP</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Uptime</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {hostDevices.map((d, idx) => {
                        const dOnline = d.state === 1 || d.status === 'online' ||
                                        d.isOnline === true;
                        return (
                          <TableRow key={d.id || d.mac || idx}>
                            <TableCell className="font-medium flex items-center gap-2">
                              <DeviceIcon type={deviceType(d)} />
                              {d.name || d.hostname || d.mac || '—'}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {deviceType(d)}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {d.model || '—'}
                            </TableCell>
                            <TableCell className="text-sm font-mono">
                              {d.ip || d.ipAddress || '—'}
                            </TableCell>
                            <TableCell>
                              <OnlineBadge online={dOnline} />
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {fmtUptime(d.uptime)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
