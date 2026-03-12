import React, { useState, useEffect } from 'react';
import { apiClient } from '../App';
import { toast } from 'sonner';
import { getErrorMessage } from '../lib/errorHandler';
import { Card, CardContent } from '../components/ui/card';
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
import { Wrench, Plus, Search, CheckCircle, Clock, Calendar } from 'lucide-react';
import { Textarea } from '../components/ui/textarea';

const MAINTENANCE_TYPES = [
  'Firmware Update',
  'OS Patching',
  'Security Update',
  'Backup Verification',
  'Hardware Check',
  'Performance Tuning',
  'Certificate Renewal',
  'Database Maintenance',
  'Log Cleanup',
  'General Maintenance',
  'Other'
];

export default function Maintenance() {
  const [maintenance, setMaintenance] = useState([]);
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);

  const [form, setForm] = useState({
    server_id: '',
    maintenance_type: '',
    scheduled_date: '',
    notes: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [maintenanceRes, serversRes] = await Promise.all([
        apiClient.get('/maintenance'),
        apiClient.get('/servers')
      ]);
      setMaintenance(maintenanceRes.data);
      setServers(serversRes.data);
    } catch (error) {
      toast.error('Failed to load maintenance records');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = {
        ...form,
        scheduled_date: form.scheduled_date ? new Date(form.scheduled_date).toISOString() : null
      };
      await apiClient.post('/maintenance', data);
      toast.success('Maintenance scheduled');
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to schedule maintenance'));
    }
  };

  const handleComplete = async (id) => {
    try {
      await apiClient.put(`/maintenance/${id}/complete`, { notes: 'Completed' });
      toast.success('Maintenance marked as complete');
      fetchData();
    } catch (error) {
      toast.error('Failed to complete maintenance');
    }
  };

  const resetForm = () => {
    setForm({
      server_id: '',
      maintenance_type: '',
      scheduled_date: '',
      notes: ''
    });
  };

  const filteredMaintenance = maintenance.filter(m => {
    const matchesSearch = m.maintenance_type.toLowerCase().includes(search.toLowerCase()) ||
                          m.server_name?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || m.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6" data-testid="maintenance-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Barlow Condensed' }}>
            MAINTENANCE
          </h1>
          <p className="text-muted-foreground">Schedule and track maintenance work</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button data-testid="add-maintenance">
              <Plus className="h-4 w-4 mr-2" />
              Schedule Maintenance
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Schedule Maintenance</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Server *</Label>
                <Select value={form.server_id} onValueChange={(v) => setForm({ ...form, server_id: v })}>
                  <SelectTrigger data-testid="maintenance-server">
                    <SelectValue placeholder="Select server" />
                  </SelectTrigger>
                  <SelectContent>
                    {servers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.hostname} ({s.client_name})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Maintenance Type *</Label>
                <Select value={form.maintenance_type} onValueChange={(v) => setForm({ ...form, maintenance_type: v })}>
                  <SelectTrigger data-testid="maintenance-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {MAINTENANCE_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Scheduled Date</Label>
                <Input
                  type="datetime-local"
                  value={form.scheduled_date}
                  onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })}
                  data-testid="maintenance-date"
                />
              </div>
              
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Additional notes..."
                  rows={3}
                  data-testid="maintenance-notes"
                />
              </div>
              
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" data-testid="save-maintenance">
                  Schedule
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search maintenance..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="search-maintenance"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40" data-testid="filter-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Maintenance Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
            </div>
          ) : filteredMaintenance.length === 0 ? (
            <div className="empty-state py-12">
              <Wrench className="h-16 w-16" />
              <p className="text-lg font-medium">No maintenance records</p>
              <p className="text-muted-foreground">Schedule maintenance to keep track</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="table-dense">
                  <TableHead>Status</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Server</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Scheduled</TableHead>
                  <TableHead>Engineer</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMaintenance.map((m) => (
                  <TableRow key={m.id} className="table-dense">
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {m.status === 'completed' ? (
                          <CheckCircle className="h-3 w-3 mr-1 text-emerald-400" />
                        ) : (
                          <Clock className="h-3 w-3 mr-1" />
                        )}
                        {m.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{m.maintenance_type}</TableCell>
                    <TableCell className="font-mono">{m.server_name}</TableCell>
                    <TableCell>{m.client_name || '-'}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {m.scheduled_date ? (
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(m.scheduled_date).toLocaleString()}
                        </div>
                      ) : '-'}
                    </TableCell>
                    <TableCell>{m.engineer_name || '-'}</TableCell>
                    <TableCell>
                      {m.status !== 'completed' && (
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleComplete(m.id)}
                        >
                          Complete
                        </Button>
                      )}
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
