import React, { useState, useEffect } from 'react';
import { apiClient, useAuth } from '../App';
import { toast } from 'sonner';
import { getErrorMessage } from '../lib/errorHandler';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Switch } from '../components/ui/switch';
import { ScrollArea } from '../components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { 
  ListTodo, Plus, Search, MoreVertical, Edit, Trash2,
  Calendar, User, ArrowRight, RefreshCw, MessageSquare,
  Clock, Building2, FolderKanban, Bell, Send, X, Eye
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { Textarea } from '../components/ui/textarea';

export default function Tasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [kanban, setKanban] = useState({ open: [], in_progress: [], completed: [], blocked: [] });
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  
  // Task detail view
  const [selectedTask, setSelectedTask] = useState(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [taskNotes, setTaskNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [loadingNotes, setLoadingNotes] = useState(false);

  const [form, setForm] = useState({
    title: '',
    description: '',
    client_id: '',
    project_id: '',
    priority: 'medium',
    status: 'open',
    due_date: '',
    assigned_to: '',
    is_recurring: false,
    recurrence_pattern: 'weekly',
    recurrence_interval: 1,
    recurrence_end_date: '',
    reminder_days: 1
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [tasksRes, kanbanRes, clientsRes, projectsRes, usersRes] = await Promise.all([
        apiClient.get('/tasks'),
        apiClient.get('/tasks/kanban'),
        apiClient.get('/clients'),
        apiClient.get('/projects'),
        apiClient.get('/users')
      ]);
      setTasks(tasksRes.data);
      setKanban(kanbanRes.data);
      setClients(clientsRes.data);
      setProjects(projectsRes.data);
      setUsers(usersRes.data);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to load tasks'));
    } finally {
      setLoading(false);
    }
  };

  const openTaskDetail = async (task) => {
    setSelectedTask(task);
    setDetailDialogOpen(true);
    setLoadingNotes(true);
    try {
      const [detailRes, notesRes] = await Promise.all([
        apiClient.get(`/tasks/${task.id}`),
        apiClient.get(`/tasks/${task.id}/notes`)
      ]);
      setSelectedTask(detailRes.data);
      setTaskNotes(notesRes.data);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to load task details'));
    } finally {
      setLoadingNotes(false);
    }
  };

  const addNote = async () => {
    if (!newNote.trim() || !selectedTask) return;
    try {
      const res = await apiClient.post(`/tasks/${selectedTask.id}/notes`, { content: newNote });
      setTaskNotes([res.data, ...taskNotes]);
      setNewNote('');
      toast.success('Note added');
      fetchData(); // Refresh to update notes count
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to add note'));
    }
  };

  const deleteNote = async (noteId) => {
    if (!confirm('Delete this note?')) return;
    try {
      await apiClient.delete(`/tasks/${selectedTask.id}/notes/${noteId}`);
      setTaskNotes(taskNotes.filter(n => n.id !== noteId));
      toast.success('Note deleted');
      fetchData();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to delete note'));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        client_id: form.client_id === 'none' ? null : (form.client_id || null),
        project_id: form.project_id === 'none' ? null : (form.project_id || null),
        assigned_to: form.assigned_to === 'unassigned' ? null : (form.assigned_to || null),
        due_date: form.due_date || null,
        recurrence_end_date: form.recurrence_end_date || null
      };

      if (editingTask) {
        await apiClient.put(`/tasks/${editingTask.id}`, payload);
        toast.success('Task updated');
      } else {
        await apiClient.post('/tasks', payload);
        toast.success('Task created');
      }
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to save task'));
    }
  };

  const handleDelete = async (taskId) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
      await apiClient.delete(`/tasks/${taskId}`);
      toast.success('Task deleted');
      fetchData();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to delete task'));
    }
  };

  const handleStatusChange = async (taskId, newStatus) => {
    try {
      await apiClient.put(`/tasks/${taskId}/status`, { status: newStatus });
      toast.success('Status updated');
      fetchData();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to update status'));
    }
  };

  const openEditDialog = (task) => {
    setEditingTask(task);
    setForm({
      title: task.title,
      description: task.description || '',
      client_id: task.client_id || '',
      project_id: task.project_id || '',
      priority: task.priority,
      status: task.status,
      due_date: task.due_date ? task.due_date.split('T')[0] : '',
      assigned_to: task.assigned_to || '',
      is_recurring: task.is_recurring || false,
      recurrence_pattern: task.recurrence_pattern || 'weekly',
      recurrence_interval: task.recurrence_interval || 1,
      recurrence_end_date: task.recurrence_end_date ? task.recurrence_end_date.split('T')[0] : '',
      reminder_days: task.reminder_days || 1
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setEditingTask(null);
    setForm({
      title: '',
      description: '',
      client_id: '',
      project_id: '',
      priority: 'medium',
      status: 'open',
      due_date: '',
      assigned_to: '',
      is_recurring: false,
      recurrence_pattern: 'weekly',
      recurrence_interval: 1,
      recurrence_end_date: '',
      reminder_days: 1
    });
  };

  const filteredTasks = tasks.filter(task => {
    const matchesSearch = task.title.toLowerCase().includes(search.toLowerCase()) ||
      (task.description && task.description.toLowerCase().includes(search.toLowerCase()));
    const matchesStatus = statusFilter === 'all' || task.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status) => {
    const styles = {
      open: 'bg-blue-500/20 text-blue-400',
      in_progress: 'bg-amber-500/20 text-amber-400',
      completed: 'bg-emerald-500/20 text-emerald-400',
      blocked: 'bg-red-500/20 text-red-400'
    };
    return <Badge className={styles[status] || ''}>{status.replace('_', ' ')}</Badge>;
  };

  const getPriorityBadge = (priority) => {
    const styles = {
      low: 'bg-gray-500/20 text-gray-400',
      medium: 'bg-blue-500/20 text-blue-400',
      high: 'bg-amber-500/20 text-amber-400',
      urgent: 'bg-red-500/20 text-red-400'
    };
    return <Badge variant="outline" className={styles[priority] || ''}>{priority}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="tasks-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2" style={{ fontFamily: 'Barlow Condensed' }}>
            <ListTodo className="h-8 w-8 text-primary" />
            TASKS
          </h1>
          <p className="text-muted-foreground">Manage and track your tasks</p>
        </div>
        <Button onClick={() => { resetForm(); setDialogOpen(true); }} data-testid="add-task-btn">
          <Plus className="h-4 w-4 mr-2" />
          New Task
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tasks..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="blocked">Blocked</SelectItem>
              </SelectContent>
            </Select>
            <Tabs value={view} onValueChange={setView}>
              <TabsList>
                <TabsTrigger value="list">List</TabsTrigger>
                <TabsTrigger value="kanban">Kanban</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardContent>
      </Card>

      {/* Task List View */}
      {view === 'list' && (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {filteredTasks.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <ListTodo className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No tasks found</p>
                </div>
              ) : (
                filteredTasks.map((task) => (
                  <div 
                    key={task.id} 
                    className="p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => openTaskDetail(task)}
                    data-testid={`task-row-${task.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3">
                          <h3 className="font-medium truncate">{task.title}</h3>
                          {task.is_recurring && (
                            <Badge variant="outline" className="bg-purple-500/20 text-purple-400">
                              <RefreshCw className="h-3 w-3 mr-1" />
                              {task.recurrence_pattern}
                            </Badge>
                          )}
                          {task.notes_count > 0 && (
                            <Badge variant="outline" className="text-muted-foreground">
                              <MessageSquare className="h-3 w-3 mr-1" />
                              {task.notes_count}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                          {task.client_name && (
                            <span className="flex items-center gap-1">
                              <Building2 className="h-3 w-3" />
                              {task.client_name}
                            </span>
                          )}
                          {task.project_name && (
                            <span className="flex items-center gap-1">
                              <FolderKanban className="h-3 w-3" />
                              {task.project_name}
                            </span>
                          )}
                          {task.due_date && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(task.due_date).toLocaleDateString()}
                            </span>
                          )}
                          {task.assigned_to_name && (
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {task.assigned_to_name}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                        {getPriorityBadge(task.priority)}
                        {getStatusBadge(task.status)}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openTaskDetail(task)}>
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEditDialog(task)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleStatusChange(task.id, 'in_progress')}>
                              <ArrowRight className="h-4 w-4 mr-2" />
                              Start
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleStatusChange(task.id, 'completed')}>
                              <ListTodo className="h-4 w-4 mr-2" />
                              Complete
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-red-400" onClick={() => handleDelete(task.id)}>
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Kanban View */}
      {view === 'kanban' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Object.entries(kanban).map(([status, statusTasks]) => (
            <Card key={status} className="bg-muted/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium capitalize flex items-center justify-between">
                  {status.replace('_', ' ')}
                  <Badge variant="outline">{statusTasks.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {statusTasks.map((task) => (
                  <Card 
                    key={task.id} 
                    className="cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => openTaskDetail(task)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{task.title}</p>
                          {task.client_name && (
                            <p className="text-xs text-muted-foreground mt-1">{task.client_name}</p>
                          )}
                        </div>
                        {getPriorityBadge(task.priority)}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        {task.is_recurring && (
                          <RefreshCw className="h-3 w-3 text-purple-400" />
                        )}
                        {task.notes_count > 0 && (
                          <span className="text-xs text-muted-foreground flex items-center">
                            <MessageSquare className="h-3 w-3 mr-1" />
                            {task.notes_count}
                          </span>
                        )}
                        {task.due_date && (
                          <span className="text-xs text-muted-foreground">
                            {new Date(task.due_date).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Task Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTask ? 'Edit Task' : 'Create Task'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Title *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Task title"
                required
                data-testid="task-title-input"
              />
            </div>

            <div>
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Task description..."
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Client</Label>
                <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                  <SelectTrigger>
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
              <div>
                <Label>Project</Label>
                <Select value={form.project_id} onValueChange={(v) => setForm({ ...form, project_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Assigned To</Label>
                <Select value={form.assigned_to} onValueChange={(v) => setForm({ ...form, assigned_to: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.username}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Due Date</Label>
                <Input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                />
              </div>
              <div>
                <Label>Remind Before (days)</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.reminder_days}
                  onChange={(e) => setForm({ ...form, reminder_days: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>

            {/* Recurring Task Section */}
            <div className="border rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">Recurring Task</Label>
                  <p className="text-sm text-muted-foreground">Make this task repeat automatically</p>
                </div>
                <Switch
                  checked={form.is_recurring}
                  onCheckedChange={(checked) => setForm({ ...form, is_recurring: checked })}
                />
              </div>

              {form.is_recurring && (
                <div className="grid grid-cols-3 gap-4 pt-2">
                  <div>
                    <Label>Repeat Every</Label>
                    <Input
                      type="number"
                      min="1"
                      value={form.recurrence_interval}
                      onChange={(e) => setForm({ ...form, recurrence_interval: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                  <div>
                    <Label>Pattern</Label>
                    <Select value={form.recurrence_pattern} onValueChange={(v) => setForm({ ...form, recurrence_pattern: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Days</SelectItem>
                        <SelectItem value="weekly">Weeks</SelectItem>
                        <SelectItem value="monthly">Months</SelectItem>
                        <SelectItem value="yearly">Years</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>End Date (optional)</Label>
                    <Input
                      type="date"
                      value={form.recurrence_end_date}
                      onChange={(e) => setForm({ ...form, recurrence_end_date: e.target.value })}
                    />
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" data-testid="save-task-btn">
                {editingTask ? 'Update Task' : 'Create Task'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Task Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <div className="flex items-center justify-between pr-8">
              <DialogTitle className="text-xl">{selectedTask?.title}</DialogTitle>
              <div className="flex items-center gap-2">
                {selectedTask && getPriorityBadge(selectedTask.priority)}
                {selectedTask && getStatusBadge(selectedTask.status)}
              </div>
            </div>
          </DialogHeader>
          
          {selectedTask && (
            <div className="flex-1 overflow-y-auto space-y-6">
              {/* Task Info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-2">
                  {selectedTask.client_name && (
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Client:</span>
                      <span>{selectedTask.client_name}</span>
                    </div>
                  )}
                  {selectedTask.project_name && (
                    <div className="flex items-center gap-2">
                      <FolderKanban className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Project:</span>
                      <span>{selectedTask.project_name}</span>
                    </div>
                  )}
                  {selectedTask.assigned_to_name && (
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Assigned to:</span>
                      <span>{selectedTask.assigned_to_name}</span>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  {selectedTask.due_date && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Due:</span>
                      <span>{new Date(selectedTask.due_date).toLocaleDateString()}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Created:</span>
                    <span>{new Date(selectedTask.created_at).toLocaleDateString()}</span>
                  </div>
                  {selectedTask.is_recurring && (
                    <div className="flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 text-purple-400" />
                      <span className="text-muted-foreground">Repeats:</span>
                      <span>Every {selectedTask.recurrence_interval} {selectedTask.recurrence_pattern}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Description */}
              {selectedTask.description && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Description</h4>
                  <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg whitespace-pre-wrap">
                    {selectedTask.description}
                  </p>
                </div>
              )}

              {/* Notes Section */}
              <div>
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Notes ({taskNotes.length})
                </h4>
                
                {/* Add Note */}
                <div className="flex gap-2 mb-4">
                  <Textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Add a note..."
                    rows={2}
                    className="flex-1"
                  />
                  <Button onClick={addNote} disabled={!newNote.trim()}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>

                {/* Notes List */}
                <ScrollArea className="h-[200px]">
                  {loadingNotes ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                    </div>
                  ) : taskNotes.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No notes yet</p>
                  ) : (
                    <div className="space-y-3">
                      {taskNotes.map((note) => (
                        <div key={note.id} className="bg-muted/50 p-3 rounded-lg">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                              <p className="text-xs text-muted-foreground mt-2">
                                {note.created_by_name} • {new Date(note.created_at).toLocaleString()}
                              </p>
                            </div>
                            {(note.created_by === user?.id || user?.role === 'admin') && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-red-400"
                                onClick={() => deleteNote(note.id)}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>
          )}

          <DialogFooter className="border-t pt-4">
            <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>
              Close
            </Button>
            <Button onClick={() => { setDetailDialogOpen(false); openEditDialog(selectedTask); }}>
              <Edit className="h-4 w-4 mr-2" />
              Edit Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
