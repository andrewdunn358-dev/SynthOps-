import React, { useState, useEffect } from 'react';
import { apiClient } from '../App';
import { toast } from 'sonner';
import { getErrorMessage } from '../lib/errorHandler';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Checkbox } from '../components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../components/ui/accordion';
import { 
  Shield, Server, CheckCircle, XCircle, Clock, Play, 
  FileText, Download, Search, RefreshCw, AlertTriangle
} from 'lucide-react';

export default function DCHealthCheck() {
  const [servers, setServers] = useState([]);
  const [clients, setClients] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Run check dialog
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [selectedServer, setSelectedServer] = useState(null);
  const [checkResults, setCheckResults] = useState({});
  const [checkNotes, setCheckNotes] = useState({});
  const [saving, setSaving] = useState(false);
  
  // History
  const [history, setHistory] = useState([]);
  const [historyFilter, setHistoryFilter] = useState({ client: 'all', month: 'all' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [serversRes, clientsRes, templatesRes, historyRes] = await Promise.all([
        apiClient.get('/servers'),
        apiClient.get('/clients'),
        apiClient.get('/health-checks/templates'),
        apiClient.get('/health-checks')
      ]);
      setServers(serversRes.data || []);
      setClients(clientsRes.data || []);
      setTemplates(templatesRes.data || []);
      setHistory(historyRes.data || []);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to load data'));
    } finally {
      setLoading(false);
    }
  };

  // Get DC templates (Active Directory checks)
  const dcTemplates = templates.filter(t => 
    t.category?.toLowerCase().includes('active directory') || 
    t.server_roles?.includes('domain controller')
  );

  // Group templates by category
  const templatesByCategory = dcTemplates.reduce((acc, t) => {
    const cat = t.category || 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(t);
    return acc;
  }, {});

  const openRunDialog = (server) => {
    setSelectedServer(server);
    setCheckResults({});
    setCheckNotes({});
    setRunDialogOpen(true);
  };

  const toggleCheckResult = (templateId, result) => {
    setCheckResults(prev => ({
      ...prev,
      [templateId]: prev[templateId] === result ? null : result
    }));
  };

  const saveHealthCheck = async () => {
    if (!selectedServer) return;
    
    setSaving(true);
    try {
      const results = dcTemplates.map(t => ({
        template_id: t.id,
        template_name: t.name,
        category: t.category,
        result: checkResults[t.id] || 'not_checked',
        notes: checkNotes[t.id] || ''
      }));

      await apiClient.post('/health-checks', {
        server_id: selectedServer.id,
        check_type: 'dc_health_check',
        results: results,
        summary: {
          passed: Object.values(checkResults).filter(r => r === 'pass').length,
          failed: Object.values(checkResults).filter(r => r === 'fail').length,
          not_checked: dcTemplates.length - Object.values(checkResults).filter(r => r).length
        }
      });

      toast.success('Health check saved');
      setRunDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to save health check'));
    } finally {
      setSaving(false);
    }
  };

  const exportToCSV = async () => {
    try {
      const res = await apiClient.get('/health-checks/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `health_checks_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      toast.error('Export failed');
    }
  };

  // Filter servers (only show potential DCs - Windows servers)
  const dcServers = servers.filter(s => 
    s.os_name?.toLowerCase().includes('windows') && 
    s.os_name?.toLowerCase().includes('server')
  );

  const filteredServers = dcServers.filter(s =>
    s.hostname?.toLowerCase().includes(search.toLowerCase()) ||
    s.client_name?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredHistory = history.filter(h => {
    const matchesClient = historyFilter.client === 'all' || h.client_id === historyFilter.client;
    const matchesMonth = historyFilter.month === 'all' || 
      new Date(h.created_at).toISOString().slice(0,7) === historyFilter.month;
    return matchesClient && matchesMonth;
  });

  // Get unique months from history
  const months = [...new Set(history.map(h => new Date(h.created_at).toISOString().slice(0,7)))].sort().reverse();

  return (
    <div className="space-y-6" data-testid="dc-health-check-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Barlow Condensed' }}>
            DC HEALTH CHECK
          </h1>
          <p className="text-muted-foreground">
            Run Domain Controller health checks against your servers
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" onClick={exportToCSV}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold">{dcServers.length}</p>
            <p className="text-sm text-muted-foreground">Windows Servers</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-blue-400">{dcTemplates.length}</p>
            <p className="text-sm text-muted-foreground">DC Checks</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-emerald-400">
              {history.filter(h => h.check_type === 'dc_health_check').length}
            </p>
            <p className="text-sm text-muted-foreground">Checks Run</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-amber-400">
              {Object.keys(templatesByCategory).length}
            </p>
            <p className="text-sm text-muted-foreground">Categories</p>
          </CardContent>
        </Card>
      </div>

      {/* Server Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Select Server to Check
          </CardTitle>
          <CardDescription>
            Choose a Windows Server to run the DC health check against
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search servers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
            </div>
          ) : filteredServers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Server className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No Windows Servers found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredServers.slice(0, 12).map(server => (
                <div
                  key={server.id}
                  className="p-4 border rounded-lg hover:border-primary/50 hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => openRunDialog(server)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono font-medium">{server.hostname}</span>
                    <Badge variant="outline" className={
                      server.status === 'online' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                    }>
                      {server.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{server.client_name}</p>
                  <p className="text-xs text-muted-foreground mt-1">{server.os_name}</p>
                  <Button 
                    size="sm" 
                    className="mt-3 w-full"
                    onClick={(e) => { e.stopPropagation(); openRunDialog(server); }}
                    data-testid={`run-check-${server.id}`}
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Run DC Check
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Check History
          </CardTitle>
          <div className="flex gap-2 mt-2">
            <Select value={historyFilter.client} onValueChange={(v) => setHistoryFilter(prev => ({ ...prev, client: v }))}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Client" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Clients</SelectItem>
                {clients.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={historyFilter.month} onValueChange={(v) => setHistoryFilter(prev => ({ ...prev, month: v }))}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                {months.map(m => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filteredHistory.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No health checks recorded yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredHistory.slice(0, 10).map(check => (
                <div key={check.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Shield className="h-5 w-5 text-blue-400" />
                    <div>
                      <p className="font-medium">{check.server_name}</p>
                      <p className="text-sm text-muted-foreground">{check.client_name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-emerald-500/20 text-emerald-400">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          {check.summary?.passed || 0}
                        </Badge>
                        <Badge className="bg-red-500/20 text-red-400">
                          <XCircle className="h-3 w-3 mr-1" />
                          {check.summary?.failed || 0}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(check.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Run Check Dialog */}
      <Dialog open={runDialogOpen} onOpenChange={setRunDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-400" />
              DC Health Check - {selectedServer?.hostname}
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-auto py-4">
            <div className="mb-4 p-3 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">
                <strong>Server:</strong> {selectedServer?.hostname} | 
                <strong> Client:</strong> {selectedServer?.client_name} | 
                <strong> OS:</strong> {selectedServer?.os_name}
              </p>
            </div>

            <Accordion type="multiple" defaultValue={Object.keys(templatesByCategory)} className="space-y-2">
              {Object.entries(templatesByCategory).map(([category, checks]) => (
                <AccordionItem key={category} value={category} className="border rounded-lg px-4">
                  <AccordionTrigger className="text-sm font-medium">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-blue-400" />
                      {category}
                      <Badge variant="outline" className="ml-2">
                        {checks.length} checks
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3 py-2">
                      {checks.map(check => (
                        <div key={check.id} className="p-3 border rounded-lg bg-card">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <p className="font-medium text-sm">{check.name}</p>
                              <p className="text-xs text-muted-foreground mt-1">{check.description}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant={checkResults[check.id] === 'pass' ? 'default' : 'outline'}
                                className={checkResults[check.id] === 'pass' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
                                onClick={() => toggleCheckResult(check.id, 'pass')}
                              >
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant={checkResults[check.id] === 'fail' ? 'default' : 'outline'}
                                className={checkResults[check.id] === 'fail' ? 'bg-red-600 hover:bg-red-700' : ''}
                                onClick={() => toggleCheckResult(check.id, 'fail')}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          {checkResults[check.id] === 'fail' && (
                            <Textarea
                              placeholder="Add notes about the failure..."
                              value={checkNotes[check.id] || ''}
                              onChange={(e) => setCheckNotes(prev => ({ ...prev, [check.id]: e.target.value }))}
                              className="mt-2"
                              rows={2}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>

          <div className="border-t pt-4 flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1 text-emerald-400">
                <CheckCircle className="h-4 w-4" />
                {Object.values(checkResults).filter(r => r === 'pass').length} Passed
              </span>
              <span className="flex items-center gap-1 text-red-400">
                <XCircle className="h-4 w-4" />
                {Object.values(checkResults).filter(r => r === 'fail').length} Failed
              </span>
              <span className="flex items-center gap-1 text-muted-foreground">
                <Clock className="h-4 w-4" />
                {dcTemplates.length - Object.values(checkResults).filter(r => r).length} Not Checked
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setRunDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={saveHealthCheck} disabled={saving} data-testid="save-health-check">
                {saving ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4 mr-2" />
                )}
                Save Health Check
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
