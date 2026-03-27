import React, { useState, useEffect } from 'react';
import { apiClient } from '../App';
import { toast } from 'sonner';
import { getErrorMessage } from '../lib/errorHandler';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Checkbox } from '../components/ui/checkbox';
import { Progress } from '../components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { 
  BarChart3, Download, RefreshCw, Server, Users, Ticket,
  AlertTriangle, Clock, CheckCircle, XCircle, FileText, PieChart,
  TrendingUp, Calendar, Building2, HardDrive
} from 'lucide-react';

export default function Reports() {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [stats, setStats] = useState(null);
  const [clients, setClients] = useState([]);
  
  // Report Builder State
  const [reportConfig, setReportConfig] = useState({
    client_id: 'all',
    date_range: '30',
    include_servers: true,
    include_tickets: true,
    include_incidents: true,
    include_maintenance: true,
    include_time: true,
    group_by: 'client'
  });
  
  // Generated Report Data
  const [reportData, setReportData] = useState(null);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      const [statsRes, clientsRes] = await Promise.all([
        apiClient.get('/dashboard/stats'),
        apiClient.get('/clients')
      ]);
      setStats(statsRes.data);
      setClients(clientsRes.data || []);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to load data'));
    } finally {
      setLoading(false);
    }
  };

  const generateReport = async () => {
    setGenerating(true);
    try {
      // Build report based on selected options
      const queries = [];
      
      if (reportConfig.include_servers) {
        queries.push(apiClient.get('/servers', {
          params: reportConfig.client_id !== 'all' ? { client_id: reportConfig.client_id } : {}
        }));
      }
      
      if (reportConfig.include_tickets) {
        // Zammad has been removed - tickets section returns empty
        queries.push(Promise.resolve({ data: [] }));
      }
      
      if (reportConfig.include_incidents) {
        queries.push(apiClient.get('/incidents').catch(() => ({ data: [] })));
      }
      
      if (reportConfig.include_maintenance) {
        queries.push(apiClient.get('/maintenance').catch(() => ({ data: [] })));
      }
      
      if (reportConfig.include_time) {
        queries.push(apiClient.get('/time-entries').catch(() => ({ data: [] })));
      }

      const results = await Promise.all(queries);
      let idx = 0;
      
      const report = {
        generated_at: new Date().toISOString(),
        config: { ...reportConfig },
        servers: reportConfig.include_servers ? results[idx++]?.data || [] : [],
        tickets: reportConfig.include_tickets ? results[idx++]?.data || [] : [],
        incidents: reportConfig.include_incidents ? results[idx++]?.data || [] : [],
        maintenance: reportConfig.include_maintenance ? results[idx++]?.data || [] : [],
        time_entries: reportConfig.include_time ? results[idx++]?.data || [] : []
      };

      // Calculate summaries
      report.summary = {
        total_servers: report.servers.length,
        servers_online: report.servers.filter(s => s.status === 'online').length,
        servers_offline: report.servers.filter(s => s.status === 'offline').length,
        total_tickets: report.tickets.length,
        open_tickets: report.tickets.filter(t => t.state !== 'closed').length,
        total_incidents: report.incidents.length,
        open_incidents: report.incidents.filter(i => i.status === 'open').length,
        pending_maintenance: report.maintenance.filter(m => m.status !== 'completed').length,
        total_hours: report.time_entries.reduce((sum, t) => sum + (t.hours || 0), 0)
      };

      // Group data if needed
      if (reportConfig.group_by === 'client') {
        report.by_client = {};
        report.servers.forEach(s => {
          const clientName = s.client_name || 'Unknown';
          if (!report.by_client[clientName]) {
            report.by_client[clientName] = { servers: 0, online: 0, offline: 0 };
          }
          report.by_client[clientName].servers++;
          if (s.status === 'online') report.by_client[clientName].online++;
          else report.by_client[clientName].offline++;
        });
      }

      setReportData(report);
      toast.success('Report generated');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to generate report'));
    } finally {
      setGenerating(false);
    }
  };

  const exportReport = () => {
    if (!reportData) return;
    
    // Create CSV content
    let csv = 'SynthOps Report\n';
    csv += `Generated: ${new Date(reportData.generated_at).toLocaleString()}\n\n`;
    
    csv += 'Summary\n';
    csv += `Total Servers,${reportData.summary.total_servers}\n`;
    csv += `Online,${reportData.summary.servers_online}\n`;
    csv += `Offline,${reportData.summary.servers_offline}\n`;
    csv += `Open Tickets,${reportData.summary.open_tickets}\n`;
    csv += `Open Incidents,${reportData.summary.open_incidents}\n`;
    csv += `Total Hours Logged,${reportData.summary.total_hours}\n\n`;
    
    if (reportData.by_client) {
      csv += 'By Client\n';
      csv += 'Client,Servers,Online,Offline\n';
      Object.entries(reportData.by_client).forEach(([client, data]) => {
        csv += `"${client}",${data.servers},${data.online},${data.offline}\n`;
      });
    }

    // Download
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `synthops_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  // OS breakdown from servers
  const getOSBreakdown = (servers) => {
    const os = {};
    servers.forEach(s => {
      const osName = s.os_name?.split(' ').slice(0, 3).join(' ') || 'Unknown';
      os[osName] = (os[osName] || 0) + 1;
    });
    return Object.entries(os).sort((a, b) => b[1] - a[1]).slice(0, 8);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="reports-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Barlow Condensed' }}>
            REPORTS
          </h1>
          <p className="text-muted-foreground">Generate custom reports and analytics</p>
        </div>
        <Button variant="outline" onClick={fetchInitialData}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <Building2 className="h-6 w-6 mx-auto mb-1 text-blue-400" />
            <p className="text-2xl font-bold">{stats?.total_clients || 0}</p>
            <p className="text-xs text-muted-foreground">Clients</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Server className="h-6 w-6 mx-auto mb-1 text-cyan-400" />
            <p className="text-2xl font-bold">{stats?.total_servers || 0}</p>
            <p className="text-xs text-muted-foreground">Servers</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <CheckCircle className="h-6 w-6 mx-auto mb-1 text-emerald-400" />
            <p className="text-2xl font-bold">{stats?.servers_online || 0}</p>
            <p className="text-xs text-muted-foreground">Online</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <XCircle className="h-6 w-6 mx-auto mb-1 text-red-400" />
            <p className="text-2xl font-bold">{(stats?.total_servers || 0) - (stats?.servers_online || 0)}</p>
            <p className="text-xs text-muted-foreground">Offline</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Ticket className="h-6 w-6 mx-auto mb-1 text-amber-400" />
            <p className="text-2xl font-bold">{stats?.open_tickets || 0}</p>
            <p className="text-xs text-muted-foreground">Open Tickets</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <AlertTriangle className="h-6 w-6 mx-auto mb-1 text-orange-400" />
            <p className="text-2xl font-bold">{stats?.open_incidents || 0}</p>
            <p className="text-xs text-muted-foreground">Incidents</p>
          </CardContent>
        </Card>
      </div>

      {/* Report Builder */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Report Builder
          </CardTitle>
          <CardDescription>Create custom reports with selected data</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Filters Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Client</Label>
              <Select 
                value={reportConfig.client_id} 
                onValueChange={(v) => setReportConfig({ ...reportConfig, client_id: v })}
              >
                <SelectTrigger data-testid="report-client">
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clients</SelectItem>
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date Range</Label>
              <Select 
                value={reportConfig.date_range} 
                onValueChange={(v) => setReportConfig({ ...reportConfig, date_range: v })}
              >
                <SelectTrigger data-testid="report-date">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                  <SelectItem value="365">Last year</SelectItem>
                  <SelectItem value="all">All time</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Group By</Label>
              <Select 
                value={reportConfig.group_by} 
                onValueChange={(v) => setReportConfig({ ...reportConfig, group_by: v })}
              >
                <SelectTrigger data-testid="report-group">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">Client</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
                  <SelectItem value="os">Operating System</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Include Checkboxes */}
          <div className="space-y-2">
            <Label>Include in Report</Label>
            <div className="flex flex-wrap gap-6 mt-2">
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="inc-servers" 
                  checked={reportConfig.include_servers}
                  onCheckedChange={(c) => setReportConfig({ ...reportConfig, include_servers: c })}
                />
                <label htmlFor="inc-servers" className="text-sm flex items-center gap-1">
                  <Server className="h-4 w-4" /> Servers
                </label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="inc-tickets" 
                  checked={reportConfig.include_tickets}
                  onCheckedChange={(c) => setReportConfig({ ...reportConfig, include_tickets: c })}
                />
                <label htmlFor="inc-tickets" className="text-sm flex items-center gap-1">
                  <Ticket className="h-4 w-4" /> Tickets
                </label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="inc-incidents" 
                  checked={reportConfig.include_incidents}
                  onCheckedChange={(c) => setReportConfig({ ...reportConfig, include_incidents: c })}
                />
                <label htmlFor="inc-incidents" className="text-sm flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4" /> Incidents
                </label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="inc-maintenance" 
                  checked={reportConfig.include_maintenance}
                  onCheckedChange={(c) => setReportConfig({ ...reportConfig, include_maintenance: c })}
                />
                <label htmlFor="inc-maintenance" className="text-sm flex items-center gap-1">
                  <Clock className="h-4 w-4" /> Maintenance
                </label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="inc-time" 
                  checked={reportConfig.include_time}
                  onCheckedChange={(c) => setReportConfig({ ...reportConfig, include_time: c })}
                />
                <label htmlFor="inc-time" className="text-sm flex items-center gap-1">
                  <Clock className="h-4 w-4" /> Time Tracking
                </label>
              </div>
            </div>
          </div>

          {/* Generate Button */}
          <div className="flex gap-2">
            <Button onClick={generateReport} disabled={generating} data-testid="generate-report">
              {generating ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <BarChart3 className="h-4 w-4 mr-2" />
              )}
              Generate Report
            </Button>
            {reportData && (
              <Button variant="outline" onClick={exportReport} data-testid="export-report">
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Report Results */}
      {reportData && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-blue-900/20 to-transparent border-blue-500/30">
              <CardContent className="p-4">
                <p className="text-3xl font-bold">{reportData.summary.total_servers}</p>
                <p className="text-sm text-muted-foreground">Total Servers</p>
                <div className="flex gap-2 mt-2 text-xs">
                  <span className="text-emerald-400">{reportData.summary.servers_online} online</span>
                  <span className="text-red-400">{reportData.summary.servers_offline} offline</span>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-amber-900/20 to-transparent border-amber-500/30">
              <CardContent className="p-4">
                <p className="text-3xl font-bold">{reportData.summary.open_tickets}</p>
                <p className="text-sm text-muted-foreground">Open Tickets</p>
                <p className="text-xs text-muted-foreground mt-2">{reportData.summary.total_tickets} total</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-red-900/20 to-transparent border-red-500/30">
              <CardContent className="p-4">
                <p className="text-3xl font-bold">{reportData.summary.open_incidents}</p>
                <p className="text-sm text-muted-foreground">Open Incidents</p>
                <p className="text-xs text-muted-foreground mt-2">{reportData.summary.total_incidents} total</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-cyan-900/20 to-transparent border-cyan-500/30">
              <CardContent className="p-4">
                <p className="text-3xl font-bold">{reportData.summary.total_hours.toFixed(1)}h</p>
                <p className="text-sm text-muted-foreground">Hours Logged</p>
                <p className="text-xs text-muted-foreground mt-2">{reportData.time_entries.length} entries</p>
              </CardContent>
            </Card>
          </div>

          {/* By Client Table */}
          {reportData.by_client && Object.keys(reportData.by_client).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Servers by Client
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="table-dense">
                      <TableHead>Client</TableHead>
                      <TableHead className="text-right">Servers</TableHead>
                      <TableHead className="text-right">Online</TableHead>
                      <TableHead className="text-right">Offline</TableHead>
                      <TableHead className="text-right">Health</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(reportData.by_client)
                      .sort((a, b) => b[1].servers - a[1].servers)
                      .slice(0, 20)
                      .map(([client, data]) => (
                        <TableRow key={client} className="table-dense">
                          <TableCell className="font-medium">{client}</TableCell>
                          <TableCell className="text-right">{data.servers}</TableCell>
                          <TableCell className="text-right text-emerald-400">{data.online}</TableCell>
                          <TableCell className="text-right text-red-400">{data.offline}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Progress 
                                value={data.servers > 0 ? (data.online / data.servers) * 100 : 0} 
                                className="w-16 h-2"
                              />
                              <span className="text-xs text-muted-foreground w-10">
                                {data.servers > 0 ? Math.round((data.online / data.servers) * 100) : 0}%
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* OS Breakdown */}
          {reportData.servers.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HardDrive className="h-5 w-5" />
                  Operating System Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {getOSBreakdown(reportData.servers).map(([os, count]) => (
                    <div key={os} className="flex items-center gap-3">
                      <div className="w-48 text-sm truncate">{os}</div>
                      <Progress value={(count / reportData.servers.length) * 100} className="flex-1 h-3" />
                      <div className="w-16 text-sm text-right text-muted-foreground">
                        {count} ({Math.round((count / reportData.servers.length) * 100)}%)
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
