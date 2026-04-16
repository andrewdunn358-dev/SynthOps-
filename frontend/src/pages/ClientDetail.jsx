import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiClient } from '../App';
import { toast } from 'sonner';
import SupportTab from '../components/SupportTab';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { 
  Building2, Server, MapPin, Phone, Mail, ArrowLeft, Plus,
  Edit, AlertTriangle, ListTodo, Clock, Monitor, Laptop,
  ExternalLink, MessageSquare, Save, X, User, Globe, FileText
} from 'lucide-react';

function ContactTab({ client, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    contact_name: '', contact_email: '', contact_phone: '',
    address: '', website: '', account_manager: '', notes: '',
  });

  useEffect(() => {
    if (client) {
      setForm({
        contact_name: client.contact_name || '',
        contact_email: client.contact_email || '',
        contact_phone: client.contact_phone || '',
        address: client.address || '',
        website: client.website || '',
        account_manager: client.account_manager || '',
        notes: client.notes || '',
      });
    }
  }, [client]);

  const save = async () => {
    setSaving(true);
    try {
      await apiClient.put(`/clients/${client.id}`, {
        name: client.name,
        code: client.code,
        client_type: client.client_type,
        service_category: client.service_category,
        contract_type: client.contract_type,
        ...form,
      });
      toast.success('Contact details saved');
      setEditing(false);
      onSaved();
    } catch (e) {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const fields = [
    { key: 'contact_name', label: 'Contact Name', icon: User, type: 'text', placeholder: 'Primary contact' },
    { key: 'contact_email', label: 'Email', icon: Mail, type: 'email', placeholder: 'email@company.com' },
    { key: 'contact_phone', label: 'Phone', icon: Phone, type: 'text', placeholder: '0191 000 0000' },
    { key: 'website', label: 'Website', icon: Globe, type: 'text', placeholder: 'https://company.com' },
    { key: 'account_manager', label: 'Account Manager', icon: User, type: 'text', placeholder: 'Engineer name' },
    { key: 'address', label: 'Address', icon: MapPin, type: 'text', placeholder: 'Full address' },
  ];

  return (
    <div className="space-y-4 mt-2">
      <div className="flex justify-end">
        {editing ? (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(false)}><X className="h-4 w-4 mr-1" />Cancel</Button>
            <Button size="sm" onClick={save} disabled={saving}><Save className="h-4 w-4 mr-1" />{saving ? 'Saving...' : 'Save'}</Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}><Edit className="h-4 w-4 mr-1" />Edit</Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {fields.map(({ key, label, icon: Icon, type, placeholder }) => (
          <div key={key}>
            <Label className="flex items-center gap-1.5 mb-1.5 text-sm font-medium">
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />{label}
            </Label>
            {editing ? (
              <Input type={type} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} placeholder={placeholder} />
            ) : (
              <p className="text-sm py-2 px-3 rounded bg-muted/40 min-h-9">
                {form[key] ? (
                  key === 'website' ? <a href={form[key]} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">{form[key]}</a>
                  : key === 'contact_email' ? <a href={`mailto:${form[key]}`} className="text-blue-500 hover:underline">{form[key]}</a>
                  : form[key]
                ) : <span className="text-muted-foreground">—</span>}
              </p>
            )}
          </div>
        ))}
      </div>

      <div>
        <Label className="flex items-center gap-1.5 mb-1.5 text-sm font-medium">
          <FileText className="h-3.5 w-3.5 text-muted-foreground" />Notes
        </Label>
        {editing ? (
          <textarea
            className="w-full border rounded px-3 py-2 text-sm bg-background min-h-24 resize-y"
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Internal notes about this client..."
          />
        ) : (
          <p className="text-sm py-2 px-3 rounded bg-muted/40 min-h-16 whitespace-pre-wrap">
            {form.notes || <span className="text-muted-foreground">No notes</span>}
          </p>
        )}
      </div>
    </div>
  );
}

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState(null);
  const [sites, setSites] = useState([]);
  const [servers, setServers] = useState([]);
  const [workstations, setWorkstations] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    try {
      const [clientRes, sitesRes, serversRes, tasksRes, incidentsRes] = await Promise.all([
        apiClient.get(`/clients/${id}`),
        apiClient.get(`/sites?client_id=${id}`),
        apiClient.get(`/servers?client_id=${id}`),
        apiClient.get(`/tasks?client_id=${id}`),
        apiClient.get(`/incidents?client_id=${id}`)
      ]);
      setClient(clientRes.data);
      setSites(sitesRes.data);
      setServers(serversRes.data);
      setTasks(tasksRes.data);
      setIncidents(incidentsRes.data);
      
      // Try to fetch workstations (endpoint may not exist on older backends)
      try {
        const wsRes = await apiClient.get(`/workstations?client_id=${id}`);
        setWorkstations(wsRes.data || []);
      } catch (e) {
        // Workstations endpoint not available, set empty
        setWorkstations([]);
      }
    } catch (error) {
      toast.error('Failed to load client details');
      navigate('/clients');
    } finally {
      setLoading(false);
    }
  };

  // Servers from the API are now filtered by the backend (only actual servers)
  // Workstations come from the separate /workstations endpoint
  const actualServers = servers;

  const getStatusClass = (status) => {
    switch (status) {
      case 'online': return 'status-online';
      case 'maintenance': return 'status-maintenance';
      default: return 'status-offline';
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-64 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  if (!client) return null;

  const openTasks = tasks.filter(t => t.status !== 'completed').length;
  const openIncidents = incidents.filter(i => i.status !== 'resolved').length;

  return (
    <div className="space-y-6" data-testid="client-detail">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/clients')} data-testid="back-button">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-primary/10 rounded flex items-center justify-center">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Barlow Condensed' }}>
                {client.name}
              </h1>
              <p className="text-muted-foreground font-mono">{client.code}</p>
            </div>
          </div>
        </div>
        <Badge variant="outline" className="capitalize">{client.contract_type}</Badge>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <MapPin className="h-4 w-4" />
              <span className="text-sm">Sites</span>
            </div>
            <p className="text-2xl font-bold font-mono">{sites.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Server className="h-4 w-4" />
              <span className="text-sm">Servers</span>
            </div>
            <p className="text-2xl font-bold font-mono">{actualServers.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Laptop className="h-4 w-4" />
              <span className="text-sm">Workstations</span>
            </div>
            <p className="text-2xl font-bold font-mono">{workstations.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <ListTodo className="h-4 w-4" />
              <span className="text-sm">Open Tasks</span>
            </div>
            <p className="text-2xl font-bold font-mono">{openTasks}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm">Open Incidents</span>
            </div>
            <p className="text-2xl font-bold font-mono">{openIncidents}</p>
          </CardContent>
        </Card>
      </div>

      {/* Contact Info */}
      {(client.contact_name || client.contact_email || client.contact_phone) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Contact Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {client.contact_name && (
                <div>
                  <p className="text-sm text-muted-foreground">Contact Name</p>
                  <p className="font-medium">{client.contact_name}</p>
                </div>
              )}
              {client.contact_email && (
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <a href={`mailto:${client.contact_email}`} className="font-medium text-primary hover:underline">
                    {client.contact_email}
                  </a>
                </div>
              )}
              {client.contact_phone && (
                <div>
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <a href={`tel:${client.contact_phone}`} className="font-medium text-primary hover:underline">
                    {client.contact_phone}
                  </a>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs - Servers, Workstations, Tasks, Incidents */}
      <Tabs defaultValue="servers">
        <TabsList>
          <TabsTrigger value="sites">Sites ({sites.length})</TabsTrigger>
          <TabsTrigger value="servers">
            <Server className="h-4 w-4 mr-1" />
            Servers ({actualServers.length})
          </TabsTrigger>
          <TabsTrigger value="workstations">
            <Laptop className="h-4 w-4 mr-1" />
            Workstations ({workstations.length})
          </TabsTrigger>
          <TabsTrigger value="tasks">Tasks ({tasks.length})</TabsTrigger>
          <TabsTrigger value="incidents">Incidents ({incidents.length})</TabsTrigger>
          <TabsTrigger value="support">Support Contract</TabsTrigger>
          <TabsTrigger value="contact">Contact & Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="sites" className="mt-4">
          <Card>
            <CardContent className="p-4">
              {sites.length === 0 ? (
                <div className="empty-state py-8">
                  <MapPin className="h-12 w-12" />
                  <p>No sites found</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {sites.map((site) => (
                    <div key={site.id} className="flex items-center justify-between p-3 rounded-sm bg-muted/50 hover:bg-muted">
                      <div>
                        <p className="font-medium">{site.name}</p>
                        {site.address && <p className="text-sm text-muted-foreground">{site.address}</p>}
                      </div>
                      <Badge variant="outline">{site.server_count || 0} devices</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="servers" className="mt-4">
          <Card>
            <CardContent className="p-4">
              {actualServers.length === 0 ? (
                <div className="empty-state py-8">
                  <Server className="h-12 w-12" />
                  <p>No servers found</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {actualServers.map((server) => (
                    <div 
                      key={server.id} 
                      className="flex items-center justify-between p-3 rounded-sm bg-muted/50 hover:bg-muted cursor-pointer"
                      onClick={() => navigate(`/servers/${server.id}`)}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`status-dot ${getStatusClass(server.status)}`} />
                        <div>
                          <p className="font-medium font-mono">{server.hostname}</p>
                          <p className="text-sm text-muted-foreground">
                            {server.role || 'Server'} • {server.ip_address || 'No IP'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{server.operating_system?.split(',')[0] || 'Unknown OS'}</Badge>
                        <Badge variant="outline" className="capitalize">{server.environment}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="workstations" className="mt-4">
          <Card>
            <CardContent className="p-4">
              {workstations.length === 0 ? (
                <div className="empty-state py-8">
                  <Laptop className="h-12 w-12" />
                  <p>No workstations found</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {workstations.map((ws) => (
                    <div 
                      key={ws.id} 
                      className="flex items-center justify-between p-3 rounded-sm bg-muted/50 hover:bg-muted cursor-pointer"
                      onClick={() => navigate(`/servers/${ws.id}`)}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`status-dot ${getStatusClass(ws.status)}`} />
                        <div>
                          <p className="font-medium font-mono">{ws.hostname}</p>
                          <p className="text-sm text-muted-foreground">
                            {ws.ip_address || 'No IP'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{ws.operating_system?.split(',')[0] || 'Unknown OS'}</Badge>
                        <Badge variant="outline" className={ws.status === 'online' ? 'bg-emerald-500/20 text-emerald-400' : ''}>
                          {ws.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tasks" className="mt-4">
          <Card>
            <CardContent className="p-4">
              {tasks.length === 0 ? (
                <div className="empty-state py-8">
                  <ListTodo className="h-12 w-12" />
                  <p>No tasks found</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {tasks.map((task) => (
                    <div key={task.id} className="flex items-center justify-between p-3 rounded-sm bg-muted/50 hover:bg-muted">
                      <div>
                        <p className="font-medium">{task.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {task.assigned_to_name && `Assigned to ${task.assigned_to_name}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={`priority-${task.priority}`}>{task.priority}</Badge>
                        <Badge variant="outline" className="capitalize">{task.status.replace('_', ' ')}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="incidents" className="mt-4">
          <Card>
            <CardContent className="p-4">
              {incidents.length === 0 ? (
                <div className="empty-state py-8">
                  <AlertTriangle className="h-12 w-12" />
                  <p>No incidents found</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {incidents.map((incident) => (
                    <div key={incident.id} className="flex items-center justify-between p-3 rounded-sm bg-muted/50 hover:bg-muted">
                      <div>
                        <p className="font-medium">{incident.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(incident.date_opened).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={`severity-${incident.severity}`}>{incident.severity}</Badge>
                        <Badge variant="outline" className="capitalize">{incident.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="support">
          <SupportTab clientId={id} clientName={client?.name} />
        </TabsContent>
        <TabsContent value="contact">
          <ContactTab client={client} onSaved={fetchData} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
