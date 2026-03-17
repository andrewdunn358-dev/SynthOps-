import React, { useState, useEffect } from 'react';
import { apiClient, useAuth } from '../App';
import { toast } from 'sonner';
import { getErrorMessage } from '../lib/errorHandler';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { 
  Users, Plus, Search, MoreVertical, Edit, Trash2,
  Building2, Phone, Mail, Globe, FileText, Calendar,
  DollarSign, User, Tag, Server, MessageSquare, Send, X
} from 'lucide-react';

export default function Customers() {
  const { user } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  
  // Customer detail view
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [customerNotes, setCustomerNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [loadingNotes, setLoadingNotes] = useState(false);

  const [form, setForm] = useState({
    name: '',
    trmm_client_id: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    address: '',
    website: '',
    contract_type: '',
    contract_value: '',
    contract_start: '',
    contract_end: '',
    account_manager: '',
    technical_contact: '',
    notes: '',
    tags: [],
    is_active: true
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [customersRes, clientsRes, usersRes] = await Promise.all([
        apiClient.get('/customers'),
        apiClient.get('/clients'),
        apiClient.get('/users')
      ]);
      setCustomers(customersRes.data);
      setClients(clientsRes.data);
      setUsers(usersRes.data);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to load customers'));
    } finally {
      setLoading(false);
    }
  };

  const openCustomerDetail = async (customer) => {
    setSelectedCustomer(customer);
    setDetailDialogOpen(true);
    setLoadingNotes(true);
    try {
      const [detailRes, notesRes] = await Promise.all([
        apiClient.get(`/customers/${customer.id}`),
        apiClient.get(`/customers/${customer.id}/notes`)
      ]);
      setSelectedCustomer(detailRes.data);
      setCustomerNotes(notesRes.data);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to load customer details'));
    } finally {
      setLoadingNotes(false);
    }
  };

  const addNote = async () => {
    if (!newNote.trim() || !selectedCustomer) return;
    try {
      const res = await apiClient.post(`/customers/${selectedCustomer.id}/notes`, { content: newNote });
      setCustomerNotes([res.data, ...customerNotes]);
      setNewNote('');
      toast.success('Note added');
      fetchData();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to add note'));
    }
  };

  const deleteNote = async (noteId) => {
    if (!confirm('Delete this note?')) return;
    try {
      await apiClient.delete(`/customers/${selectedCustomer.id}/notes/${noteId}`);
      setCustomerNotes(customerNotes.filter(n => n.id !== noteId));
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
        trmm_client_id: form.trmm_client_id || null,
        contract_value: form.contract_value ? parseFloat(form.contract_value) : null,
        contract_start: form.contract_start || null,
        contract_end: form.contract_end || null,
        account_manager: form.account_manager || null,
        technical_contact: form.technical_contact || null
      };

      if (editingCustomer) {
        await apiClient.put(`/customers/${editingCustomer.id}`, payload);
        toast.success('Customer updated');
      } else {
        await apiClient.post('/customers', payload);
        toast.success('Customer created');
      }
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to save customer'));
    }
  };

  const handleDelete = async (customerId) => {
    if (!confirm('Are you sure you want to delete this customer?')) return;
    try {
      await apiClient.delete(`/customers/${customerId}`);
      toast.success('Customer deleted');
      fetchData();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to delete customer'));
    }
  };

  const openEditDialog = (customer) => {
    setEditingCustomer(customer);
    setForm({
      name: customer.name || '',
      trmm_client_id: customer.trmm_client_id || '',
      contact_name: customer.contact_name || '',
      contact_email: customer.contact_email || '',
      contact_phone: customer.contact_phone || '',
      address: customer.address || '',
      website: customer.website || '',
      contract_type: customer.contract_type || '',
      contract_value: customer.contract_value?.toString() || '',
      contract_start: customer.contract_start ? customer.contract_start.split('T')[0] : '',
      contract_end: customer.contract_end ? customer.contract_end.split('T')[0] : '',
      account_manager: customer.account_manager || '',
      technical_contact: customer.technical_contact || '',
      notes: customer.notes || '',
      tags: customer.tags || [],
      is_active: customer.is_active !== false
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setEditingCustomer(null);
    setForm({
      name: '',
      trmm_client_id: '',
      contact_name: '',
      contact_email: '',
      contact_phone: '',
      address: '',
      website: '',
      contract_type: '',
      contract_value: '',
      contract_start: '',
      contract_end: '',
      account_manager: '',
      technical_contact: '',
      notes: '',
      tags: [],
      is_active: true
    });
  };

  const filteredCustomers = customers.filter(c => {
    const matchesSearch = !search || 
      c.name?.toLowerCase().includes(search.toLowerCase()) ||
      c.contact_name?.toLowerCase().includes(search.toLowerCase()) ||
      c.contact_email?.toLowerCase().includes(search.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || 
      (statusFilter === 'active' && c.is_active) ||
      (statusFilter === 'inactive' && !c.is_active);
    
    return matchesSearch && matchesStatus;
  });

  const getContractTypeBadge = (type) => {
    const types = {
      monthly: { label: 'Monthly', className: 'bg-blue-500/20 text-blue-400' },
      annual: { label: 'Annual', className: 'bg-green-500/20 text-green-400' },
      project: { label: 'Project', className: 'bg-purple-500/20 text-purple-400' },
      adhoc: { label: 'Ad-hoc', className: 'bg-orange-500/20 text-orange-400' }
    };
    return types[type] || { label: type || 'N/A', className: 'bg-gray-500/20 text-gray-400' };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="customers-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Users className="h-8 w-8 text-primary" />
            Customer CRM
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage customer information, contracts, and notes
          </p>
        </div>
        <Button onClick={() => { resetForm(); setDialogOpen(true); }} data-testid="add-customer-btn">
          <Plus className="h-4 w-4 mr-2" />
          Add Customer
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Customers</p>
                <p className="text-2xl font-bold">{customers.length}</p>
              </div>
              <Users className="h-8 w-8 text-primary opacity-70" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active</p>
                <p className="text-2xl font-bold text-green-500">
                  {customers.filter(c => c.is_active).length}
                </p>
              </div>
              <Building2 className="h-8 w-8 text-green-500 opacity-70" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Contract Value</p>
                <p className="text-2xl font-bold">
                  ${customers.reduce((sum, c) => sum + (c.contract_value || 0), 0).toLocaleString()}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-amber-500 opacity-70" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">With Notes</p>
                <p className="text-2xl font-bold">
                  {customers.filter(c => c.notes_count > 0).length}
                </p>
              </div>
              <MessageSquare className="h-8 w-8 text-blue-500 opacity-70" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search customers..."
                className="pl-10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="search-input"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]" data-testid="status-filter">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Customers Table */}
      <Card>
        <CardHeader>
          <CardTitle>Customers ({filteredCustomers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredCustomers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No customers found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Contract</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Servers</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers.map((customer) => {
                  const contractBadge = getContractTypeBadge(customer.contract_type);
                  return (
                    <TableRow 
                      key={customer.id} 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => openCustomerDetail(customer)}
                      data-testid={`customer-row-${customer.id}`}
                    >
                      <TableCell>
                        <div>
                          <p className="font-medium">{customer.name}</p>
                          {customer.website && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Globe className="h-3 w-3" />
                              {customer.website}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {customer.contact_name && (
                            <p className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {customer.contact_name}
                            </p>
                          )}
                          {customer.contact_email && (
                            <p className="flex items-center gap-1 text-muted-foreground">
                              <Mail className="h-3 w-3" />
                              {customer.contact_email}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={contractBadge.className}>
                          {contractBadge.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {customer.contract_value ? (
                          <span className="font-medium">${customer.contract_value.toLocaleString()}</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Server className="h-3 w-3 text-muted-foreground" />
                          <span>{customer.servers_count || 0}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <MessageSquare className="h-3 w-3 text-muted-foreground" />
                          <span>{customer.notes_count || 0}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={customer.is_active ? 'default' : 'secondary'}>
                          {customer.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" data-testid={`customer-actions-${customer.id}`}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEditDialog(customer); }}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={(e) => { e.stopPropagation(); handleDelete(customer.id); }}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Customer Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCustomer ? 'Edit Customer' : 'Add New Customer'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <Tabs defaultValue="basic" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="basic">Basic Info</TabsTrigger>
                <TabsTrigger value="contract">Contract</TabsTrigger>
                <TabsTrigger value="other">Other</TabsTrigger>
              </TabsList>
              
              <TabsContent value="basic" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label>Customer Name *</Label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Company name"
                      required
                      data-testid="customer-name-input"
                    />
                  </div>
                  <div>
                    <Label>Contact Name</Label>
                    <Input
                      value={form.contact_name}
                      onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                      placeholder="Primary contact"
                    />
                  </div>
                  <div>
                    <Label>Contact Email</Label>
                    <Input
                      type="email"
                      value={form.contact_email}
                      onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                      placeholder="email@company.com"
                    />
                  </div>
                  <div>
                    <Label>Contact Phone</Label>
                    <Input
                      value={form.contact_phone}
                      onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                      placeholder="+1 234 567 890"
                    />
                  </div>
                  <div>
                    <Label>Website</Label>
                    <Input
                      value={form.website}
                      onChange={(e) => setForm({ ...form, website: e.target.value })}
                      placeholder="https://company.com"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>Address</Label>
                    <Textarea
                      value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                      placeholder="Full address"
                      rows={2}
                    />
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="contract" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Contract Type</Label>
                    <Select value={form.contract_type} onValueChange={(v) => setForm({ ...form, contract_type: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="annual">Annual</SelectItem>
                        <SelectItem value="project">Project</SelectItem>
                        <SelectItem value="adhoc">Ad-hoc</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Contract Value ($)</Label>
                    <Input
                      type="number"
                      value={form.contract_value}
                      onChange={(e) => setForm({ ...form, contract_value: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <Label>Contract Start</Label>
                    <Input
                      type="date"
                      value={form.contract_start}
                      onChange={(e) => setForm({ ...form, contract_start: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Contract End</Label>
                    <Input
                      type="date"
                      value={form.contract_end}
                      onChange={(e) => setForm({ ...form, contract_end: e.target.value })}
                    />
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="other" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Link to TRMM Client</Label>
                    <Select value={form.trmm_client_id || "none"} onValueChange={(v) => setForm({ ...form, trmm_client_id: v === "none" ? "" : v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select client (optional)" />
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
                    <Label>Account Manager</Label>
                    <Select value={form.account_manager || "none"} onValueChange={(v) => setForm({ ...form, account_manager: v === "none" ? "" : v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select user" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {users.map((u) => (
                          <SelectItem key={u.id} value={u.id}>{u.username}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Label>Notes</Label>
                    <Textarea
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      placeholder="Internal notes about this customer..."
                      rows={3}
                    />
                  </div>
                  <div className="col-span-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="isActive"
                      checked={form.is_active}
                      onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                      className="rounded"
                    />
                    <Label htmlFor="isActive" className="cursor-pointer">Active Customer</Label>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
            
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" data-testid="save-customer-btn">
                {editingCustomer ? 'Update' : 'Create'} Customer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Customer Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {selectedCustomer?.name}
            </DialogTitle>
          </DialogHeader>
          
          {selectedCustomer && (
            <div className="space-y-6">
              {/* Customer Info */}
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Contact Information</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-2">
                    {selectedCustomer.contact_name && (
                      <p className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        {selectedCustomer.contact_name}
                      </p>
                    )}
                    {selectedCustomer.contact_email && (
                      <p className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        {selectedCustomer.contact_email}
                      </p>
                    )}
                    {selectedCustomer.contact_phone && (
                      <p className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        {selectedCustomer.contact_phone}
                      </p>
                    )}
                    {selectedCustomer.website && (
                      <p className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        <a href={selectedCustomer.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          {selectedCustomer.website}
                        </a>
                      </p>
                    )}
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Contract Details</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-2">
                    <p className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      Type: <Badge className={getContractTypeBadge(selectedCustomer.contract_type).className}>
                        {getContractTypeBadge(selectedCustomer.contract_type).label}
                      </Badge>
                    </p>
                    {selectedCustomer.contract_value && (
                      <p className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                        Value: ${selectedCustomer.contract_value.toLocaleString()}
                      </p>
                    )}
                    {selectedCustomer.contract_start && (
                      <p className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        Start: {new Date(selectedCustomer.contract_start).toLocaleDateString()}
                      </p>
                    )}
                    {selectedCustomer.contract_end && (
                      <p className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        End: {new Date(selectedCustomer.contract_end).toLocaleDateString()}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* General Notes from Customer Record */}
              {selectedCustomer.notes && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">General Notes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm whitespace-pre-wrap">{selectedCustomer.notes}</p>
                  </CardContent>
                </Card>
              )}

              {/* Notes Section */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Activity Notes ({customerNotes.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {/* Add Note */}
                  <div className="flex gap-2 mb-4">
                    <Input
                      placeholder="Add a note..."
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && addNote()}
                      data-testid="new-note-input"
                    />
                    <Button onClick={addNote} size="icon" data-testid="add-note-btn">
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Notes List */}
                  {loadingNotes ? (
                    <div className="text-center py-4">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                    </div>
                  ) : customerNotes.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4">No notes yet</p>
                  ) : (
                    <ScrollArea className="h-[200px]">
                      <div className="space-y-3">
                        {customerNotes.map((note) => (
                          <div key={note.id} className="bg-muted/50 rounded-lg p-3 group">
                            <div className="flex justify-between items-start">
                              <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => deleteNote(note.id)}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {note.created_by_name} - {new Date(note.created_at).toLocaleString()}
                            </p>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>
              Close
            </Button>
            <Button onClick={() => { setDetailDialogOpen(false); openEditDialog(selectedCustomer); }}>
              <Edit className="h-4 w-4 mr-2" />
              Edit Customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
