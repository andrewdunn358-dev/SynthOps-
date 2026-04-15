import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { 
  ArrowLeft, FolderKanban, Plus, Edit, Trash2, CheckCircle, Circle,
  Calendar, Clock, User, FileText, ListTodo, Briefcase, AlertCircle,
  MoreVertical, Play, Pause, Check
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [project, setProject] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [timeEntries, setTimeEntries] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Dialogs
  const [jobDialogOpen, setJobDialogOpen] = useState(false);
  const [worksheetDialogOpen, setWorksheetDialogOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [editingJob, setEditingJob] = useState(null);
  const [viewingWorkEntry, setViewingWorkEntry] = useState(null);
  const [workEntryDialogOpen, setWorkEntryDialogOpen] = useState(false);
  
  // Forms
  const [jobForm, setJobForm] = useState({
    title: '',
    description: '',
    status: 'pending',
    priority: 'medium',
    assigned_to: '',
    estimated_hours: '',
    due_date: ''
  });
  
  const [worksheetForm, setWorksheetForm] = useState({
    work_performed: '',
    hours_spent: '',
    notes: '',
    billable: true
  });

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    try {
      const [projectRes, jobsRes, tasksRes, timeRes, usersRes] = await Promise.all([
        apiClient.get(`/projects/${id}`),
        apiClient.get(`/projects/${id}/jobs`),
        apiClient.get(`/tasks?project_id=${id}`),
        apiClient.get(`/time-entries?project_id=${id}`),
        apiClient.get('/users')
      ]);
      setProject(projectRes.data);
      setJobs(jobsRes.data || []);
      setTasks(tasksRes.data || []);
      setTimeEntries(timeRes.data || []);
      setUsers(usersRes.data || []);
    } catch (error) {
      if (error.response?.status === 404) {
        // Jobs endpoint might not exist yet, continue
        try {
          const [projectRes, tasksRes, timeRes, usersRes] = await Promise.all([
            apiClient.get(`/projects/${id}`),
            apiClient.get(`/tasks?project_id=${id}`),
            apiClient.get(`/time-entries?project_id=${id}`),
            apiClient.get('/users')
          ]);
          setProject(projectRes.data);
          setTasks(tasksRes.data || []);
          setTimeEntries(timeRes.data || []);
          setUsers(usersRes.data || []);
        } catch (e) {
          toast.error(getErrorMessage(e, 'Failed to load project'));
        }
      } else {
        toast.error(getErrorMessage(error, 'Failed to load project'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreateJob = async (e) => {
    e.preventDefault();
    try {
      const data = {
        ...jobForm,
        project_id: id,
        estimated_hours: jobForm.estimated_hours ? parseFloat(jobForm.estimated_hours) : null,
        due_date: jobForm.due_date ? new Date(jobForm.due_date).toISOString() : null,
        assigned_to: jobForm.assigned_to && jobForm.assigned_to !== 'none' ? jobForm.assigned_to : null
      };
      
      if (editingJob) {
        await apiClient.put(`/projects/${id}/jobs/${editingJob.id}`, data);
        toast.success('Job updated');
      } else {
        await apiClient.post(`/projects/${id}/jobs`, data);
        toast.success('Job created');
      }
      setJobDialogOpen(false);
      resetJobForm();
      fetchData();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to save job'));
    }
  };

  const handleAddWorksheet = async (e) => {
    e.preventDefault();
    if (!selectedJob) return;
    
    try {
      await apiClient.post(`/projects/${id}/jobs/${selectedJob.id}/worksheets`, {
        ...worksheetForm,
        hours_spent: parseFloat(worksheetForm.hours_spent) || 0
      });
      toast.success('Worksheet entry added');
      setWorksheetDialogOpen(false);
      resetWorksheetForm();
      fetchData();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to add worksheet'));
    }
  };

  const toggleJobStatus = async (job) => {
    const newStatus = job.status === 'completed' ? 'in_progress' : 'completed';
    try {
      await apiClient.put(`/projects/${id}/jobs/${job.id}`, { ...job, status: newStatus });
      fetchData();
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  const handleDeleteJob = async (jobId) => {
    if (!confirm('Delete this job and all worksheets?')) return;
    try {
      await apiClient.delete(`/projects/${id}/jobs/${jobId}`);
      toast.success('Job deleted');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete job');
    }
  };

  const resetJobForm = () => {
    setEditingJob(null);
    setJobForm({
      title: '',
      description: '',
      status: 'pending',
      priority: 'medium',
      assigned_to: '',
      estimated_hours: '',
      due_date: ''
    });
  };

  const resetWorksheetForm = () => {
    setWorksheetForm({
      work_performed: '',
      hours_spent: '',
      notes: '',
      billable: true
    });
  };

  const openEditJob = (job) => {
    setEditingJob(job);
    setJobForm({
      title: job.title,
      description: job.description || '',
      status: job.status,
      priority: job.priority,
      assigned_to: job.assigned_to || '',
      estimated_hours: job.estimated_hours?.toString() || '',
      due_date: job.due_date ? job.due_date.split('T')[0] : ''
    });
    setJobDialogOpen(true);
  };

  const openWorksheet = (job) => {
    setSelectedJob(job);
    setWorksheetDialogOpen(true);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'bg-slate-500/20 text-slate-400';
      case 'in_progress': return 'bg-blue-500/20 text-blue-400';
      case 'completed': return 'bg-emerald-500/20 text-emerald-400';
      case 'blocked': return 'bg-red-500/20 text-red-400';
      default: return 'bg-muted';
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return 'bg-red-500/20 text-red-400';
      case 'medium': return 'bg-amber-500/20 text-amber-400';
      case 'low': return 'bg-blue-500/20 text-blue-400';
      default: return 'bg-muted';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <p>Project not found</p>
        <Button variant="outline" onClick={() => navigate('/projects')} className="mt-4">
          Back to Projects
        </Button>
      </div>
    );
  }

  const completedJobs = jobs.filter(j => j.status === 'completed').length;
  const totalHours = jobs.reduce((sum, j) => sum + (j.actual_hours || 0), 0);
  const estimatedHours = jobs.reduce((sum, j) => sum + (j.estimated_hours || 0), 0);

  return (
    <div className="space-y-6" data-testid="project-detail-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/projects')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Barlow Condensed' }}>
              {project.name}
            </h1>
            <p className="text-muted-foreground">
              {project.client_name || 'No client'} • {project.status.replace('_', ' ')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={getStatusColor(project.status)}>
            {project.status.replace('_', ' ')}
          </Badge>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold">{jobs.length}</p>
            <p className="text-sm text-muted-foreground">Jobs</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-emerald-400">{completedJobs}</p>
            <p className="text-sm text-muted-foreground">Completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-blue-400">{totalHours.toFixed(1)}h</p>
            <p className="text-sm text-muted-foreground">Hours Logged</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-amber-400">{estimatedHours.toFixed(1)}h</p>
            <p className="text-sm text-muted-foreground">Estimated</p>
          </CardContent>
        </Card>
      </div>

      {/* Progress */}
      {jobs.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Project Progress</span>
              <span className="font-mono text-sm">{completedJobs}/{jobs.length} jobs</span>
            </div>
            <Progress value={(completedJobs / jobs.length) * 100} className="h-3" />
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="jobs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="jobs">
            <Briefcase className="h-4 w-4 mr-2" />
            Jobs ({jobs.length})
          </TabsTrigger>
          <TabsTrigger value="tasks">
            <ListTodo className="h-4 w-4 mr-2" />
            Tasks ({tasks.length})
          </TabsTrigger>
          <TabsTrigger value="time">
            <Clock className="h-4 w-4 mr-2" />
            Time Entries ({timeEntries.length})
          </TabsTrigger>
          <TabsTrigger value="overview">
            <FileText className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
        </TabsList>

        {/* Jobs Tab */}
        <TabsContent value="jobs">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Project Jobs</CardTitle>
                <CardDescription>Manage work packages and worksheets</CardDescription>
              </div>
              <Button onClick={() => { resetJobForm(); setJobDialogOpen(true); }} data-testid="add-job">
                <Plus className="h-4 w-4 mr-2" />
                Add Job
              </Button>
            </CardHeader>
            <CardContent>
              {jobs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Briefcase className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No jobs created yet</p>
                  <p className="text-sm">Add a job to start tracking work</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {jobs.map(job => (
                    <div 
                      key={job.id} 
                      className={`p-4 border rounded-lg transition-colors ${
                        job.status === 'completed' ? 'bg-emerald-500/5 border-emerald-500/20' : 'hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1">
                          <button
                            onClick={() => toggleJobStatus(job)}
                            className="mt-1 text-muted-foreground hover:text-primary transition-colors"
                          >
                            {job.status === 'completed' ? (
                              <CheckCircle className="h-5 w-5 text-emerald-400" />
                            ) : (
                              <Circle className="h-5 w-5" />
                            )}
                          </button>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className={`font-medium ${job.status === 'completed' ? 'line-through text-muted-foreground' : ''}`}>
                                {job.title}
                              </h4>
                              <Badge className={getPriorityColor(job.priority)} variant="outline">
                                {job.priority}
                              </Badge>
                            </div>
                            {job.description && (
                              <p className="text-sm text-muted-foreground mt-1">{job.description}</p>
                            )}
                            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                              {job.assigned_to_name && (
                                <span className="flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  {job.assigned_to_name}
                                </span>
                              )}
                              {job.due_date && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {new Date(job.due_date).toLocaleDateString()}
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {job.actual_hours || 0}h / {job.estimated_hours || 0}h
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => openWorksheet(job)}
                            data-testid={`add-worksheet-${job.id}`}
                          >
                            <FileText className="h-4 w-4 mr-1" />
                            Log Work
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEditJob(job)}>
                                <Edit className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => handleDeleteJob(job.id)}
                                className="text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                      
                      {/* Worksheets */}
                      {job.worksheets && job.worksheets.length > 0 && (
                        <div className="mt-3 pl-8 border-l-2 border-muted">
                          <p className="text-xs font-medium text-muted-foreground mb-2">Work Log ({job.worksheets.length})</p>
                          {job.worksheets.map((ws, idx) => (
                            <div 
                              key={idx} 
                              className="text-sm py-2 px-2 -mx-2 rounded cursor-pointer hover:bg-muted/50 transition-colors"
                              onClick={() => {
                                setViewingWorkEntry({ ...ws, jobTitle: job.title });
                                setWorkEntryDialogOpen(true);
                              }}
                            >
                              <div className="flex justify-between items-start">
                                <div className="flex-1">
                                  <span className="font-medium">{ws.work_performed}</span>
                                  {ws.notes && (
                                    <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                                      📝 {ws.notes}
                                    </p>
                                  )}
                                </div>
                                <div className="text-right ml-4">
                                  <span className={`font-medium ${ws.is_billable !== false ? 'text-green-500' : 'text-muted-foreground'}`}>
                                    {ws.hours_spent}h
                                  </span>
                                  {ws.logged_by_name && (
                                    <p className="text-xs text-muted-foreground">{ws.logged_by_name}</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tasks Tab */}
        <TabsContent value="tasks">
          <Card>
            <CardHeader>
              <CardTitle>Linked Tasks</CardTitle>
              <CardDescription>Tasks associated with this project</CardDescription>
            </CardHeader>
            <CardContent>
              {tasks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <ListTodo className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No tasks linked to this project</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Assignee</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tasks.map(task => (
                      <TableRow key={task.id}>
                        <TableCell className="font-medium">{task.title}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">{task.status}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={getPriorityColor(task.priority)}>{task.priority}</Badge>
                        </TableCell>
                        <TableCell>{task.assigned_to_name || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Time Entries Tab */}
        <TabsContent value="time">
          <Card>
            <CardHeader>
              <CardTitle>Time Entries</CardTitle>
              <CardDescription>Time tracked for this project</CardDescription>
            </CardHeader>
            <CardContent>
              {timeEntries.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No time entries recorded</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Hours</TableHead>
                      <TableHead>Billable</TableHead>
                      <TableHead>User</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {timeEntries.map(entry => (
                      <TableRow key={entry.id}>
                        <TableCell>{new Date(entry.date).toLocaleDateString()}</TableCell>
                        <TableCell>{entry.description}</TableCell>
                        <TableCell className="font-mono">{entry.hours}h</TableCell>
                        <TableCell>
                          {entry.billable ? (
                            <Badge className="bg-emerald-500/20 text-emerald-400">Yes</Badge>
                          ) : (
                            <Badge variant="outline">No</Badge>
                          )}
                        </TableCell>
                        <TableCell>{entry.user_name || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle>Project Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Description</Label>
                  <p className="mt-1">{project.description || 'No description'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Client</Label>
                  <p className="mt-1">{project.client_name || 'No client assigned'}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Start Date</Label>
                  <p className="mt-1">
                    {project.start_date ? new Date(project.start_date).toLocaleDateString() : 'Not set'}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Target Date</Label>
                  <p className="mt-1">
                    {project.target_date ? new Date(project.target_date).toLocaleDateString() : 'Not set'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Job Dialog */}
      <Dialog open={jobDialogOpen} onOpenChange={(open) => { setJobDialogOpen(open); if (!open) resetJobForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingJob ? 'Edit Job' : 'Add New Job'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateJob} className="space-y-4">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input
                value={jobForm.title}
                onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })}
                placeholder="Server Migration"
                required
                data-testid="job-title"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={jobForm.description}
                onChange={(e) => setJobForm({ ...jobForm, description: e.target.value })}
                placeholder="Job description..."
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={jobForm.status} onValueChange={(v) => setJobForm({ ...jobForm, status: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={jobForm.priority} onValueChange={(v) => setJobForm({ ...jobForm, priority: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Assigned To</Label>
                <Select value={jobForm.assigned_to} onValueChange={(v) => setJobForm({ ...jobForm, assigned_to: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select user" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {users.map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.username}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Estimated Hours</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={jobForm.estimated_hours}
                  onChange={(e) => setJobForm({ ...jobForm, estimated_hours: e.target.value })}
                  placeholder="8"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Due Date</Label>
              <Input
                type="date"
                value={jobForm.due_date}
                onChange={(e) => setJobForm({ ...jobForm, due_date: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setJobDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" data-testid="save-job">
                {editingJob ? 'Update' : 'Create'} Job
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Worksheet Dialog */}
      <Dialog open={worksheetDialogOpen} onOpenChange={(open) => { setWorksheetDialogOpen(open); if (!open) resetWorksheetForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Log Work - {selectedJob?.title}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddWorksheet} className="space-y-4">
            <div className="space-y-2">
              <Label>Work Performed *</Label>
              <Textarea
                value={worksheetForm.work_performed}
                onChange={(e) => setWorksheetForm({ ...worksheetForm, work_performed: e.target.value })}
                placeholder="Describe the work done..."
                rows={3}
                required
                data-testid="worksheet-work"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Hours Spent *</Label>
                <Input
                  type="number"
                  step="0.25"
                  value={worksheetForm.hours_spent}
                  onChange={(e) => setWorksheetForm({ ...worksheetForm, hours_spent: e.target.value })}
                  placeholder="2.5"
                  required
                  data-testid="worksheet-hours"
                />
              </div>
              <div className="space-y-2 flex items-end">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="billable"
                    checked={worksheetForm.billable}
                    onCheckedChange={(checked) => setWorksheetForm({ ...worksheetForm, billable: checked })}
                  />
                  <Label htmlFor="billable">Billable</Label>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={worksheetForm.notes}
                onChange={(e) => setWorksheetForm({ ...worksheetForm, notes: e.target.value })}
                placeholder="Additional notes..."
                rows={2}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setWorksheetDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" data-testid="save-worksheet">
                Log Work
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Work Entry Detail Dialog */}
      <Dialog open={workEntryDialogOpen} onOpenChange={setWorkEntryDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Work Entry Details
            </DialogTitle>
          </DialogHeader>
          {viewingWorkEntry && (
            <div className="space-y-4">
              {viewingWorkEntry.jobTitle && (
                <div>
                  <Label className="text-muted-foreground text-xs">Job</Label>
                  <p className="font-medium">{viewingWorkEntry.jobTitle}</p>
                </div>
              )}
              
              <div>
                <Label className="text-muted-foreground text-xs">Work Performed</Label>
                <p className="font-medium">{viewingWorkEntry.work_performed}</p>
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-muted-foreground text-xs">Hours</Label>
                  <p className="font-medium text-lg">{viewingWorkEntry.hours_spent}h</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Billable</Label>
                  <p className={`font-medium ${viewingWorkEntry.is_billable !== false ? 'text-green-500' : 'text-muted-foreground'}`}>
                    {viewingWorkEntry.is_billable !== false ? 'Yes' : 'No'}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Logged By</Label>
                  <p className="font-medium">{viewingWorkEntry.logged_by_name || 'Unknown'}</p>
                </div>
              </div>
              
              {viewingWorkEntry.logged_at && (
                <div>
                  <Label className="text-muted-foreground text-xs">Date Logged</Label>
                  <p className="font-medium">
                    {new Date(viewingWorkEntry.logged_at).toLocaleString()}
                  </p>
                </div>
              )}
              
              {viewingWorkEntry.notes && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <Label className="text-muted-foreground text-xs">Notes</Label>
                  <p className="mt-1 whitespace-pre-wrap">{viewingWorkEntry.notes}</p>
                </div>
              )}
              
              {!viewingWorkEntry.notes && (
                <div className="p-3 bg-muted/30 rounded-lg text-center text-muted-foreground">
                  <p className="text-sm">No notes added for this entry</p>
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setWorkEntryDialogOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
