import React, { useState, useEffect } from 'react';
import { apiClient, useAuth } from '../App';
import { toast } from 'sonner';
import { getErrorMessage } from '../lib/errorHandler';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog';
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
import { Clock, Plus, Calendar, Trash2, Download } from 'lucide-react';
import { Textarea } from '../components/ui/textarea';

export default function TimeTracking() {
  const { user } = useAuth();
  const [entries, setEntries] = useState([]);
  const [clients, setClients] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [form, setForm] = useState({
    client_id: '',
    task_id: '',
    project_id: '',
    entry_date: new Date().toISOString().split('T')[0],
    duration_minutes: '',
    description: '',
    is_billable: true
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [entriesRes, clientsRes, tasksRes, projectsRes] = await Promise.all([
        apiClient.get('/time-entries'),
        apiClient.get('/clients'),
        apiClient.get('/tasks'),
        apiClient.get('/projects')
      ]);
      setEntries(entriesRes.data);
      setClients(clientsRes.data);
      setTasks(tasksRes.data);
      setProjects(projectsRes.data);
    } catch (error) {
      toast.error('Failed to load time entries');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = {
        ...form,
        entry_date: new Date(form.entry_date).toISOString(),
        duration_minutes: parseInt(form.duration_minutes),
        client_id: form.client_id && form.client_id !== 'none' ? form.client_id : null,
        task_id: form.task_id && form.task_id !== 'none' ? form.task_id : null,
        project_id: form.project_id && form.project_id !== 'none' ? form.project_id : null
      };
      await apiClient.post('/time-entries', data);
      toast.success('Time entry added');
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to add time entry'));
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this entry?')) return;
    try {
      await apiClient.delete(`/time-entries/${id}`);
      toast.success('Time entry deleted');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete entry');
    }
  };

  const resetForm = () => {
    setForm({
      client_id: '',
      task_id: '',
      project_id: '',
      entry_date: new Date().toISOString().split('T')[0],
      duration_minutes: '',
      description: '',
      is_billable: true
    });
  };

  const formatDuration = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const totalMinutes = entries.reduce((sum, e) => sum + e.duration_minutes, 0);
  const billableMinutes = entries.filter(e => e.is_billable).reduce((sum, e) => sum + e.duration_minutes, 0);

  // Group entries by date
  const entriesByDate = entries.reduce((acc, entry) => {
    const date = new Date(entry.entry_date).toLocaleDateString();
    if (!acc[date]) acc[date] = [];
    acc[date].push(entry);
    return acc;
  }, {});

  return (
    <div className="space-y-6" data-testid="time-tracking-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Barlow Condensed' }}>
            TIME TRACKING
          </h1>
          <p className="text-muted-foreground">Log and track your work hours</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" data-testid="export-time">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button data-testid="add-time-entry">
                <Plus className="h-4 w-4 mr-2" />
                Log Time
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Log Time Entry</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Date *</Label>
                    <Input
                      type="date"
                      value={form.entry_date}
                      onChange={(e) => setForm({ ...form, entry_date: e.target.value })}
                      required
                      data-testid="time-date"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Duration (minutes) *</Label>
                    <Input
                      type="number"
                      value={form.duration_minutes}
                      onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}
                      placeholder="60"
                      required
                      data-testid="time-duration"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label>Client</Label>
                  <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                    <SelectTrigger data-testid="time-client">
                      <SelectValue placeholder="Select client" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Task</Label>
                  <Select value={form.task_id} onValueChange={(v) => setForm({ ...form, task_id: v })}>
                    <SelectTrigger data-testid="time-task">
                      <SelectValue placeholder="Select task" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {tasks.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="What did you work on?"
                    rows={3}
                    data-testid="time-description"
                  />
                </div>
                
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="billable"
                    checked={form.is_billable}
                    onChange={(e) => setForm({ ...form, is_billable: e.target.checked })}
                    className="rounded"
                  />
                  <Label htmlFor="billable">Billable</Label>
                </div>
                
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" data-testid="save-time-entry">
                    Log Time
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Clock className="h-4 w-4" />
              <span className="text-sm">Total Time</span>
            </div>
            <p className="text-2xl font-bold font-mono">{formatDuration(totalMinutes)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Clock className="h-4 w-4 text-emerald-400" />
              <span className="text-sm">Billable Time</span>
            </div>
            <p className="text-2xl font-bold font-mono text-emerald-400">{formatDuration(billableMinutes)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Calendar className="h-4 w-4" />
              <span className="text-sm">Entries</span>
            </div>
            <p className="text-2xl font-bold font-mono">{entries.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Time Entries */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Time Entries</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
            </div>
          ) : entries.length === 0 ? (
            <div className="empty-state py-12">
              <Clock className="h-16 w-16" />
              <p className="text-lg font-medium">No time entries</p>
              <p className="text-muted-foreground">Log your first time entry to get started</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="table-dense">
                  <TableHead>Date</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Billable</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id} className="table-dense">
                    <TableCell className="text-muted-foreground">
                      {new Date(entry.entry_date).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="font-mono font-medium">
                      {formatDuration(entry.duration_minutes)}
                    </TableCell>
                    <TableCell>{entry.client_name || '-'}</TableCell>
                    <TableCell className="max-w-xs truncate">{entry.description || '-'}</TableCell>
                    <TableCell>
                      {entry.is_billable ? (
                        <Badge className="bg-emerald-500/20 text-emerald-400">Yes</Badge>
                      ) : (
                        <Badge variant="outline">No</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-destructive"
                        onClick={() => handleDelete(entry.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
