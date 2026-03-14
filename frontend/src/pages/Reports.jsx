import React, { useState, useEffect } from 'react';
import { apiClient } from '../App';
import { toast } from 'sonner';
import { getErrorMessage } from '../lib/errorHandler';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
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
  AlertTriangle, Clock, CheckCircle, XCircle, FileText, 
  TrendingUp, Calendar, Building2, HardDrive, Shield, Activity,
  Wifi, WifiOff, Timer, UserCheck, FileDown
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar
} from 'recharts';

export default function Reports() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');
  
  // Trend data states
  const [incidentTrendData, setIncidentTrendData] = useState([]);
  const [taskTrendData, setTaskTrendData] = useState([]);
  const [timeTrendData, setTimeTrendData] = useState([]);
  
  // Report data states
  const [weeklyStatus, setWeeklyStatus] = useState(null);
  const [allClientsSummary, setAllClientsSummary] = useState(null);
  const [ticketAging, setTicketAging] = useState(null);
  const [incidentTrends, setIncidentTrends] = useState(null);
  const [timeTracking, setTimeTracking] = useState(null);
  const [workload, setWorkload] = useState(null);
  const [infraUptime, setInfraUptime] = useState(null);
  const [clientHealth, setClientHealth] = useState(null);
  const [clientAssets, setClientAssets] = useState(null);
  const [offlineHistory, setOfflineHistory] = useState(null);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const [clientsRes, weeklyRes, allClientsRes, incidentTrendsRes, taskTrendsRes, timeTrendsRes] = await Promise.all([
        apiClient.get('/clients'),
        apiClient.get('/reports/weekly-status').catch(() => ({ data: null })),
        apiClient.get('/reports/all-clients-summary').catch(() => ({ data: null })),
        apiClient.get('/reports/trends/incidents?days=30').catch(() => ({ data: { data: [] } })),
        apiClient.get('/reports/trends/tasks?days=30').catch(() => ({ data: { data: [] } })),
        apiClient.get('/reports/trends/time-logged?days=30').catch(() => ({ data: { data: [] } }))
      ]);
      setClients(clientsRes.data || []);
      setWeeklyStatus(weeklyRes.data);
      setAllClientsSummary(allClientsRes.data);
      setIncidentTrendData(incidentTrendsRes.data?.data || []);
      setTaskTrendData(taskTrendsRes.data?.data || []);
      setTimeTrendData(timeTrendsRes.data?.data || []);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to load data'));
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = async (endpoint, filename) => {
    try {
      const response = await apiClient.get(endpoint, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('PDF downloaded');
    } catch (error) {
      toast.error('PDF export failed');
    }
  };

  const loadReport = async (reportType) => {
    try {
      let res;
      switch (reportType) {
        case 'ticket-aging':
          res = await apiClient.get('/reports/ticket-aging');
          setTicketAging(res.data);
          break;
        case 'incident-trends':
          res = await apiClient.get('/reports/incident-trends?days=90');
          setIncidentTrends(res.data);
          break;
        case 'time-tracking':
          res = await apiClient.get('/reports/time-tracking-summary');
          setTimeTracking(res.data);
          break;
        case 'workload':
          res = await apiClient.get('/reports/workload-distribution');
          setWorkload(res.data);
          break;
        case 'infra-uptime':
          res = await apiClient.get('/reports/infrastructure-uptime');
          setInfraUptime(res.data);
          break;
        case 'offline-history':
          res = await apiClient.get('/reports/offline-history?days=30');
          setOfflineHistory(res.data);
          break;
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to load report'));
    }
  };

  const loadClientReport = async (clientId, reportType) => {
    if (!clientId) return;
    try {
      let res;
      if (reportType === 'health') {
        res = await apiClient.get(`/reports/client-health/${clientId}`);
        setClientHealth(res.data);
      } else if (reportType === 'assets') {
        res = await apiClient.get(`/reports/client-assets/${clientId}`);
        setClientAssets(res.data);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to load client report'));
    }
  };

  const exportToCSV = async (endpoint, filename) => {
    try {
      const response = await apiClient.get(endpoint, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Report exported');
    } catch (error) {
      toast.error('Export failed');
    }
  };

  const getHealthColor = (score) => {
    if (score >= 80) return 'text-emerald-400';
    if (score >= 60) return 'text-yellow-400';
    if (score >= 40) return 'text-orange-400';
    return 'text-red-400';
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
          <p className="text-muted-foreground">Comprehensive analytics and reporting</p>
        </div>
        <Button variant="outline" onClick={fetchInitialData}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid grid-cols-5 w-full max-w-3xl">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="clients">Clients</TabsTrigger>
          <TabsTrigger value="operations">Operations</TabsTrigger>
          <TabsTrigger value="staff">Staff</TabsTrigger>
          <TabsTrigger value="infrastructure">Infrastructure</TabsTrigger>
        </TabsList>

        {/* OVERVIEW TAB */}
        <TabsContent value="overview" className="space-y-4">
          {/* Weekly Status Summary */}
          {weeklyStatus && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Weekly Status Report
                  </CardTitle>
                  <CardDescription>
                    {weeklyStatus.period?.start} to {weeklyStatus.period?.end}
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => downloadPDF('/reports/pdf/weekly-status', 'weekly_status.pdf')}>
                  <FileDown className="h-4 w-4 mr-2" />
                  PDF
                </Button>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-muted rounded-lg text-center">
                    <p className="text-3xl font-bold text-emerald-400">{weeklyStatus.tasks?.completed_this_week || 0}</p>
                    <p className="text-sm text-muted-foreground">Tasks Completed</p>
                  </div>
                  <div className="p-4 bg-muted rounded-lg text-center">
                    <p className="text-3xl font-bold text-amber-400">{weeklyStatus.incidents?.opened_this_week || 0}</p>
                    <p className="text-sm text-muted-foreground">Incidents Opened</p>
                  </div>
                  <div className="p-4 bg-muted rounded-lg text-center">
                    <p className="text-3xl font-bold text-blue-400">{weeklyStatus.servers?.uptime_percentage || 100}%</p>
                    <p className="text-sm text-muted-foreground">Server Uptime</p>
                  </div>
                  <div className="p-4 bg-muted rounded-lg text-center">
                    <p className="text-3xl font-bold text-cyan-400">{weeklyStatus.time_tracking?.hours_logged || 0}h</p>
                    <p className="text-sm text-muted-foreground">Hours Logged</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Trend Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Incidents Trend Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Incidents (Last 30 Days)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {incidentTrendData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={incidentTrendData.slice(-30)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis 
                        dataKey="date" 
                        tick={{ fontSize: 10 }} 
                        tickFormatter={(v) => v.slice(5)}
                        stroke="#888"
                      />
                      <YAxis tick={{ fontSize: 10 }} stroke="#888" />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #333' }}
                        labelStyle={{ color: '#fff' }}
                      />
                      <Legend />
                      <Area type="monotone" dataKey="critical" stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={0.6} name="Critical" />
                      <Area type="monotone" dataKey="high" stackId="1" stroke="#f97316" fill="#f97316" fillOpacity={0.6} name="High" />
                      <Area type="monotone" dataKey="medium" stackId="1" stroke="#eab308" fill="#eab308" fillOpacity={0.6} name="Medium" />
                      <Area type="monotone" dataKey="low" stackId="1" stroke="#22c55e" fill="#22c55e" fillOpacity={0.6} name="Low" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-muted-foreground text-center py-8">No incident data available</p>
                )}
              </CardContent>
            </Card>

            {/* Tasks Trend Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <CheckCircle className="h-5 w-5" />
                  Tasks (Last 30 Days)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {taskTrendData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={taskTrendData.slice(-30)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis 
                        dataKey="date" 
                        tick={{ fontSize: 10 }} 
                        tickFormatter={(v) => v.slice(5)}
                        stroke="#888"
                      />
                      <YAxis tick={{ fontSize: 10 }} stroke="#888" />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #333' }}
                        labelStyle={{ color: '#fff' }}
                      />
                      <Legend />
                      <Bar dataKey="created" fill="#3b82f6" name="Created" />
                      <Bar dataKey="completed" fill="#22c55e" name="Completed" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-muted-foreground text-center py-8">No task data available</p>
                )}
              </CardContent>
            </Card>

            {/* Time Logged Trend Chart */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Timer className="h-5 w-5" />
                  Hours Logged (Last 30 Days)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {timeTrendData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={timeTrendData.slice(-30)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis 
                        dataKey="date" 
                        tick={{ fontSize: 10 }} 
                        tickFormatter={(v) => v.slice(5)}
                        stroke="#888"
                      />
                      <YAxis tick={{ fontSize: 10 }} stroke="#888" />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #333' }}
                        labelStyle={{ color: '#fff' }}
                        formatter={(value) => [`${value}h`, 'Hours']}
                      />
                      <Line type="monotone" dataKey="hours" stroke="#06b6d4" strokeWidth={2} dot={false} name="Hours" />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-muted-foreground text-center py-8">No time tracking data available</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* All Clients Health Overview */}
          {allClientsSummary && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    All Clients Health Summary
                  </CardTitle>
                  <CardDescription>{allClientsSummary.total_clients} active clients</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => downloadPDF('/reports/pdf/all-clients', 'clients_summary.pdf')}>
                    <FileDown className="h-4 w-4 mr-2" />
                    PDF
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => exportToCSV('/export/clients', 'clients_report.csv')}>
                    <Download className="h-4 w-4 mr-2" />
                    CSV
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client</TableHead>
                      <TableHead className="text-center">Servers</TableHead>
                      <TableHead className="text-center">Online</TableHead>
                      <TableHead className="text-center">Incidents</TableHead>
                      <TableHead className="text-center">Tasks</TableHead>
                      <TableHead className="text-center">Health</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allClientsSummary.clients?.slice(0, 15).map((client) => (
                      <TableRow key={client.id}>
                        <TableCell className="font-medium">{client.name}</TableCell>
                        <TableCell className="text-center">{client.servers}</TableCell>
                        <TableCell className="text-center">
                          <span className="text-emerald-400">{client.online}</span>
                          {client.offline > 0 && <span className="text-red-400 ml-1">/ {client.offline}</span>}
                        </TableCell>
                        <TableCell className="text-center">
                          {client.open_incidents > 0 ? (
                            <Badge variant="destructive">{client.open_incidents}</Badge>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">{client.open_tasks}</TableCell>
                        <TableCell className="text-center">
                          <span className={`font-bold ${getHealthColor(client.health_score)}`}>
                            {client.health_score}%
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* CLIENTS TAB */}
        <TabsContent value="clients" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Client Reports</CardTitle>
              <CardDescription>Select a client to view detailed reports</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-4">
                <Select value={selectedClient} onValueChange={setSelectedClient}>
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="Select client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={() => loadClientReport(selectedClient, 'health')} disabled={!selectedClient}>
                  Load Health Report
                </Button>
                <Button variant="outline" onClick={() => loadClientReport(selectedClient, 'assets')} disabled={!selectedClient}>
                  Load Assets
                </Button>
                {selectedClient && (
                  <>
                    <Button variant="outline" onClick={() => downloadPDF(`/reports/pdf/client/${selectedClient}`, 'client_report.pdf')}>
                      <FileDown className="h-4 w-4 mr-2" />
                      PDF Report
                    </Button>
                    <Button variant="outline" onClick={() => exportToCSV(`/export/client-report/${selectedClient}`, 'client_report.csv')}>
                      <Download className="h-4 w-4 mr-2" />
                      CSV Export
                    </Button>
                  </>
                )}
              </div>

              {/* Client Health Report */}
              {clientHealth && (
                <Card className="mt-4">
                  <CardHeader>
                    <CardTitle>{clientHealth.client?.name} - Health Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div className="p-4 bg-muted rounded-lg text-center">
                        <p className="text-3xl font-bold">{clientHealth.servers?.total || 0}</p>
                        <p className="text-sm text-muted-foreground">Total Servers</p>
                      </div>
                      <div className="p-4 bg-muted rounded-lg text-center">
                        <p className="text-3xl font-bold text-emerald-400">{clientHealth.servers?.online || 0}</p>
                        <p className="text-sm text-muted-foreground">Online</p>
                      </div>
                      <div className="p-4 bg-muted rounded-lg text-center">
                        <p className="text-3xl font-bold text-amber-400">{clientHealth.open_incidents || 0}</p>
                        <p className="text-sm text-muted-foreground">Open Incidents</p>
                      </div>
                      <div className="p-4 bg-muted rounded-lg text-center">
                        <p className={`text-3xl font-bold ${getHealthColor(clientHealth.health_score)}`}>
                          {clientHealth.health_score}%
                        </p>
                        <p className="text-sm text-muted-foreground">Health Score</p>
                      </div>
                    </div>
                    {clientHealth.recent_incidents?.length > 0 && (
                      <>
                        <h4 className="font-semibold mb-2">Recent Incidents</h4>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Title</TableHead>
                              <TableHead>Severity</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {clientHealth.recent_incidents.map((i, idx) => (
                              <TableRow key={idx}>
                                <TableCell>{i.title}</TableCell>
                                <TableCell>
                                  <Badge variant={i.severity === 'critical' ? 'destructive' : 'secondary'}>
                                    {i.severity}
                                  </Badge>
                                </TableCell>
                                <TableCell>{i.status}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Client Assets Report */}
              {clientAssets && (
                <Card className="mt-4">
                  <CardHeader>
                    <CardTitle>{clientAssets.client?.name} - Asset Inventory</CardTitle>
                    <CardDescription>
                      {clientAssets.totals?.total_devices} total devices
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div className="p-3 bg-muted rounded-lg text-center">
                        <Server className="h-5 w-5 mx-auto mb-1" />
                        <p className="text-xl font-bold">{clientAssets.totals?.servers || 0}</p>
                        <p className="text-xs text-muted-foreground">Servers</p>
                      </div>
                      <div className="p-3 bg-muted rounded-lg text-center">
                        <HardDrive className="h-5 w-5 mx-auto mb-1" />
                        <p className="text-xl font-bold">{clientAssets.totals?.workstations || 0}</p>
                        <p className="text-xs text-muted-foreground">Workstations</p>
                      </div>
                      <div className="p-3 bg-muted rounded-lg text-center">
                        <Activity className="h-5 w-5 mx-auto mb-1" />
                        <p className="text-xl font-bold">{clientAssets.totals?.total_devices || 0}</p>
                        <p className="text-xs text-muted-foreground">Total</p>
                      </div>
                    </div>
                    {clientAssets.servers?.length > 0 && (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Hostname</TableHead>
                            <TableHead>IP</TableHead>
                            <TableHead>OS</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {clientAssets.servers.map((s, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="font-medium">{s.hostname}</TableCell>
                              <TableCell className="font-mono text-sm">{s.ip_address}</TableCell>
                              <TableCell className="text-sm">{s.os?.slice(0, 30)}</TableCell>
                              <TableCell>
                                {s.status === 'online' ? (
                                  <Badge className="bg-emerald-500/20 text-emerald-400">Online</Badge>
                                ) : (
                                  <Badge className="bg-red-500/20 text-red-400">Offline</Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* OPERATIONS TAB */}
        <TabsContent value="operations" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Ticket Aging */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Ticket Aging
                </CardTitle>
                <Button size="sm" onClick={() => loadReport('ticket-aging')}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent>
                {ticketAging ? (
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span>&lt; 24 hours</span>
                      <span className="font-bold text-emerald-400">{ticketAging.summary?.['24h'] || 0}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>24-48 hours</span>
                      <span className="font-bold text-yellow-400">{ticketAging.summary?.['48h'] || 0}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>2-7 days</span>
                      <span className="font-bold text-orange-400">{ticketAging.summary?.['7d'] || 0}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>7-30 days</span>
                      <span className="font-bold text-red-400">{ticketAging.summary?.['30d'] || 0}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>&gt; 30 days</span>
                      <span className="font-bold text-red-600">{ticketAging.summary?.older || 0}</span>
                    </div>
                    <div className="pt-2 border-t">
                      <p className="text-sm text-muted-foreground">Total open: {ticketAging.total_open}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-4">Click refresh to load</p>
                )}
              </CardContent>
            </Card>

            {/* Incident Trends */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Incident Trends (90 days)
                </CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => loadReport('incident-trends')}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => downloadPDF('/reports/pdf/incident-trends', 'incident_trends.pdf')}>
                    <FileDown className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {incidentTrends ? (
                  <div className="space-y-4">
                    <p className="text-2xl font-bold">{incidentTrends.total_incidents} incidents</p>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">By Severity:</p>
                      {Object.entries(incidentTrends.by_severity || {}).map(([sev, count]) => (
                        <div key={sev} className="flex items-center gap-2">
                          <span className="w-16 text-xs capitalize">{sev}</span>
                          <Progress value={(count / incidentTrends.total_incidents) * 100} className="flex-1 h-2" />
                          <span className="w-8 text-xs text-right">{count}</span>
                        </div>
                      ))}
                    </div>
                    {incidentTrends.by_client && Object.keys(incidentTrends.by_client).length > 0 && (
                      <div className="pt-2 border-t">
                        <p className="text-sm font-medium mb-2">Top Clients:</p>
                        {Object.entries(incidentTrends.by_client).slice(0, 5).map(([client, count]) => (
                          <div key={client} className="flex justify-between text-sm">
                            <span className="truncate">{client}</span>
                            <span>{count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-4">Click refresh to load</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Offline History */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <WifiOff className="h-5 w-5 text-red-400" />
                Offline Server History
              </CardTitle>
              <Button size="sm" onClick={() => loadReport('offline-history')}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              {offlineHistory ? (
                offlineHistory.offline_servers?.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Server</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Last Seen</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {offlineHistory.offline_servers.map((s, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">{s.hostname}</TableCell>
                          <TableCell>{s.client}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {s.last_seen ? new Date(s.last_seen).toLocaleString() : 'Unknown'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-emerald-400 text-center py-4">All servers online!</p>
                )
              ) : (
                <p className="text-muted-foreground text-center py-4">Click refresh to load</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* STAFF TAB */}
        <TabsContent value="staff" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Time Tracking Summary */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Timer className="h-5 w-5" />
                  Time Tracking Summary
                </CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => loadReport('time-tracking')}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => exportToCSV('/export/timesheet', 'timesheet.csv')}>
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {timeTracking ? (
                  <div className="space-y-4">
                    <div className="text-center p-4 bg-muted rounded-lg">
                      <p className="text-3xl font-bold text-cyan-400">{timeTracking.total_hours}h</p>
                      <p className="text-sm text-muted-foreground">{timeTracking.total_entries} entries</p>
                    </div>
                    {timeTracking.by_engineer?.length > 0 && (
                      <div>
                        <p className="text-sm font-medium mb-2">By Engineer:</p>
                        {timeTracking.by_engineer.slice(0, 5).map((e, idx) => (
                          <div key={idx} className="flex justify-between text-sm py-1">
                            <span>{e.name}</span>
                            <span className="font-mono">{e.hours}h</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {timeTracking.by_client?.length > 0 && (
                      <div className="pt-2 border-t">
                        <p className="text-sm font-medium mb-2">By Client:</p>
                        {timeTracking.by_client.slice(0, 5).map((c, idx) => (
                          <div key={idx} className="flex justify-between text-sm py-1">
                            <span className="truncate">{c.name}</span>
                            <span className="font-mono">{c.hours}h</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-4">Click refresh to load</p>
                )}
              </CardContent>
            </Card>

            {/* Workload Distribution */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <UserCheck className="h-5 w-5" />
                  Workload Distribution
                </CardTitle>
                <Button size="sm" onClick={() => loadReport('workload')}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent>
                {workload ? (
                  <div className="space-y-3">
                    {workload.workload?.map((w, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 bg-muted rounded">
                        <div>
                          <p className="font-medium">{w.username}</p>
                          <p className="text-xs text-muted-foreground">{w.hours_today}h logged today</p>
                        </div>
                        <div className="text-right">
                          <Badge variant={w.open_tasks > 5 ? 'destructive' : w.open_tasks > 2 ? 'secondary' : 'outline'}>
                            {w.open_tasks} tasks
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-4">Click refresh to load</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* INFRASTRUCTURE TAB */}
        <TabsContent value="infrastructure" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Infrastructure Uptime Report
              </CardTitle>
              <Button size="sm" onClick={() => loadReport('infra-uptime')}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              {infraUptime ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Servers */}
                  <div className="p-4 bg-muted rounded-lg">
                    <h4 className="font-semibold flex items-center gap-2 mb-3">
                      <Server className="h-4 w-4" />
                      Servers (TRMM)
                    </h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>Total</span>
                        <span className="font-bold">{infraUptime.servers?.total || 0}</span>
                      </div>
                      <div className="flex justify-between text-emerald-400">
                        <span>Online</span>
                        <span className="font-bold">{infraUptime.servers?.online || 0}</span>
                      </div>
                      <div className="flex justify-between text-red-400">
                        <span>Offline</span>
                        <span className="font-bold">{infraUptime.servers?.offline || 0}</span>
                      </div>
                      <div className="pt-2 border-t">
                        <div className="flex justify-between">
                          <span>Uptime</span>
                          <span className="font-bold text-lg">{infraUptime.servers?.uptime_percentage || 100}%</span>
                        </div>
                        <Progress value={infraUptime.servers?.uptime_percentage || 100} className="mt-2 h-3" />
                      </div>
                    </div>
                  </div>

                  {/* Infrastructure Devices */}
                  <div className="p-4 bg-muted rounded-lg">
                    <h4 className="font-semibold flex items-center gap-2 mb-3">
                      <Wifi className="h-4 w-4" />
                      Infrastructure Devices
                    </h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>Total</span>
                        <span className="font-bold">{infraUptime.infrastructure_devices?.total || 0}</span>
                      </div>
                      <div className="flex justify-between text-emerald-400">
                        <span>Online</span>
                        <span className="font-bold">{infraUptime.infrastructure_devices?.online || 0}</span>
                      </div>
                      <div className="flex justify-between text-red-400">
                        <span>Offline</span>
                        <span className="font-bold">{infraUptime.infrastructure_devices?.offline || 0}</span>
                      </div>
                      <div className="flex justify-between text-yellow-400">
                        <span>Unknown</span>
                        <span className="font-bold">{infraUptime.infrastructure_devices?.unknown || 0}</span>
                      </div>
                      <div className="pt-2 border-t">
                        <div className="flex justify-between">
                          <span>Uptime</span>
                          <span className="font-bold text-lg">{infraUptime.infrastructure_devices?.uptime_percentage || 100}%</span>
                        </div>
                        <Progress value={infraUptime.infrastructure_devices?.uptime_percentage || 100} className="mt-2 h-3" />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">Click refresh to load infrastructure uptime data</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
