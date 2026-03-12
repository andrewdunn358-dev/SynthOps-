import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiClient } from '../App';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { 
  Building2, Server, MapPin, Phone, Mail, ArrowLeft, Plus,
  Edit, AlertTriangle, ListTodo, Clock
} from 'lucide-react';

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState(null);
  const [sites, setSites] = useState([]);
  const [servers, setServers] = useState([]);
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
    } catch (error) {
      toast.error('Failed to load client details');
      navigate('/clients');
    } finally {
      setLoading(false);
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
            <p className="text-2xl font-bold font-mono">{servers.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <ListTodo className="h-4 w-4" />
              <span className="text-sm">Open Tasks</span>
            </div>
            <p className="text-2xl font-bold font-mono">{tasks.filter(t => t.status !== 'completed').length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm">Open Incidents</span>
            </div>
            <p className="text-2xl font-bold font-mono">{incidents.filter(i => i.status !== 'resolved').length}</p>
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

      {/* Tabs */}
      <Tabs defaultValue="sites">
        <TabsList>
          <TabsTrigger value="sites">Sites ({sites.length})</TabsTrigger>
          <TabsTrigger value="servers">Servers ({servers.length})</TabsTrigger>
          <TabsTrigger value="tasks">Tasks ({tasks.length})</TabsTrigger>
          <TabsTrigger value="incidents">Incidents ({incidents.length})</TabsTrigger>
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
                      <Badge variant="outline">{site.server_count} servers</Badge>
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
              {servers.length === 0 ? (
                <div className="empty-state py-8">
                  <Server className="h-12 w-12" />
                  <p>No servers found</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {servers.map((server) => (
                    <div 
                      key={server.id} 
                      className="flex items-center justify-between p-3 rounded-sm bg-muted/50 hover:bg-muted cursor-pointer"
                      onClick={() => navigate(`/servers/${server.id}`)}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`status-dot ${server.status === 'online' ? 'status-online' : server.status === 'maintenance' ? 'status-maintenance' : 'status-offline'}`} />
                        <div>
                          <p className="font-medium font-mono">{server.hostname}</p>
                          <p className="text-sm text-muted-foreground">{server.role || 'Server'} • {server.ip_address}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="capitalize">{server.environment}</Badge>
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
      </Tabs>
    </div>
  );
}
