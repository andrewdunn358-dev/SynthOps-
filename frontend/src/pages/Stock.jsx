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
  Package, Plus, Search, MoreVertical, Edit, Trash2,
  Server, Laptop, Monitor, HardDrive, Cpu, DollarSign,
  Calendar, Building2, MapPin, Tag, AlertTriangle, CheckCircle
} from 'lucide-react';

const ASSET_TYPES = [
  { value: 'server', label: 'Server', icon: Server },
  { value: 'laptop', label: 'Laptop', icon: Laptop },
  { value: 'desktop', label: 'Desktop', icon: Monitor },
  { value: 'network', label: 'Network Equipment', icon: HardDrive },
  { value: 'storage', label: 'Storage', icon: HardDrive },
  { value: 'other', label: 'Other', icon: Package }
];

const ASSET_STATUSES = [
  { value: 'in_stock', label: 'In Stock', color: 'bg-green-500/20 text-green-400' },
  { value: 'in_refurb', label: 'In Refurb', color: 'bg-yellow-500/20 text-yellow-400' },
  { value: 'deployed', label: 'Deployed', color: 'bg-blue-500/20 text-blue-400' },
  { value: 'disposed', label: 'Disposed', color: 'bg-gray-500/20 text-gray-400' },
  { value: 'sold', label: 'Sold', color: 'bg-purple-500/20 text-purple-400' }
];

const ASSET_CONDITIONS = [
  { value: 'new', label: 'New' },
  { value: 'refurbished', label: 'Refurbished' },
  { value: 'used', label: 'Used' }
];

export default function Stock() {
  const { user } = useAuth();
  const [assets, setAssets] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);
  const [viewAsset, setViewAsset] = useState(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);

  const [form, setForm] = useState({
    name: '',
    asset_type: 'server',
    manufacturer: '',
    model: '',
    serial_number: '',
    specifications: '',
    purchase_date: '',
    purchase_cost: '',
    warranty_end: '',
    supplier: '',
    status: 'in_stock',
    condition: 'new',
    assigned_customer_id: '',
    location: '',
    notes: '',
    tags: []
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [assetsRes, customersRes] = await Promise.all([
        apiClient.get('/assets'),
        apiClient.get('/customers')
      ]);
      setAssets(assetsRes.data);
      setCustomers(customersRes.data);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to load assets'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        purchase_cost: form.purchase_cost ? parseFloat(form.purchase_cost) : null,
        purchase_date: form.purchase_date || null,
        warranty_end: form.warranty_end || null,
        assigned_customer_id: form.assigned_customer_id || null
      };

      if (editingAsset) {
        await apiClient.put(`/assets/${editingAsset.id}`, payload);
        toast.success('Asset updated');
      } else {
        await apiClient.post('/assets', payload);
        toast.success('Asset created');
      }
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to save asset'));
    }
  };

  const handleDelete = async (assetId) => {
    if (!confirm('Are you sure you want to delete this asset?')) return;
    try {
      await apiClient.delete(`/assets/${assetId}`);
      toast.success('Asset deleted');
      fetchData();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to delete asset'));
    }
  };

  const openEditDialog = (asset) => {
    setEditingAsset(asset);
    setForm({
      name: asset.name || '',
      asset_type: asset.asset_type || 'server',
      manufacturer: asset.manufacturer || '',
      model: asset.model || '',
      serial_number: asset.serial_number || '',
      specifications: asset.specifications || '',
      purchase_date: asset.purchase_date ? asset.purchase_date.split('T')[0] : '',
      purchase_cost: asset.purchase_cost?.toString() || '',
      warranty_end: asset.warranty_end ? asset.warranty_end.split('T')[0] : '',
      supplier: asset.supplier || '',
      status: asset.status || 'in_stock',
      condition: asset.condition || 'new',
      assigned_customer_id: asset.assigned_customer_id || '',
      location: asset.location || '',
      notes: asset.notes || '',
      tags: asset.tags || []
    });
    setDialogOpen(true);
  };

  const openViewDialog = async (asset) => {
    try {
      const res = await apiClient.get(`/assets/${asset.id}`);
      setViewAsset(res.data);
      setViewDialogOpen(true);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to load asset details'));
    }
  };

  const resetForm = () => {
    setEditingAsset(null);
    setForm({
      name: '',
      asset_type: 'server',
      manufacturer: '',
      model: '',
      serial_number: '',
      specifications: '',
      purchase_date: '',
      purchase_cost: '',
      warranty_end: '',
      supplier: '',
      status: 'in_stock',
      condition: 'new',
      assigned_customer_id: '',
      location: '',
      notes: '',
      tags: []
    });
  };

  const filteredAssets = assets.filter(a => {
    const matchesSearch = !search || 
      a.name?.toLowerCase().includes(search.toLowerCase()) ||
      a.serial_number?.toLowerCase().includes(search.toLowerCase()) ||
      a.manufacturer?.toLowerCase().includes(search.toLowerCase()) ||
      a.model?.toLowerCase().includes(search.toLowerCase());
    
    const matchesType = typeFilter === 'all' || a.asset_type === typeFilter;
    const matchesStatus = statusFilter === 'all' || a.status === statusFilter;
    
    return matchesSearch && matchesType && matchesStatus;
  });

  const getAssetTypeIcon = (type) => {
    const assetType = ASSET_TYPES.find(t => t.value === type);
    return assetType?.icon || Package;
  };

  const getStatusBadge = (status) => {
    const statusInfo = ASSET_STATUSES.find(s => s.value === status) || ASSET_STATUSES[0];
    return statusInfo;
  };

  const getWarrantyStatus = (warrantyEnd) => {
    if (!warrantyEnd) return null;
    const endDate = new Date(warrantyEnd);
    const now = new Date();
    const daysUntilExpiry = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
    
    if (daysUntilExpiry < 0) return { status: 'expired', label: 'Expired', color: 'text-red-500' };
    if (daysUntilExpiry < 30) return { status: 'expiring', label: `${daysUntilExpiry} days left`, color: 'text-yellow-500' };
    return { status: 'valid', label: 'Valid', color: 'text-green-500' };
  };

  // Calculate stats
  const totalValue = assets.reduce((sum, a) => sum + (a.purchase_cost || 0), 0);
  const inStockCount = assets.filter(a => a.status === 'in_stock').length;
  const deployedCount = assets.filter(a => a.status === 'deployed').length;
  const expiringWarranty = assets.filter(a => {
    const warranty = getWarrantyStatus(a.warranty_end);
    return warranty && (warranty.status === 'expiring' || warranty.status === 'expired');
  }).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="stock-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Package className="h-8 w-8 text-primary" />
            Stock & Asset Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Track hardware inventory, costs, and deployments
          </p>
        </div>
        <Button onClick={() => { resetForm(); setDialogOpen(true); }} data-testid="add-asset-btn">
          <Plus className="h-4 w-4 mr-2" />
          Add Asset
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Assets</p>
                <p className="text-2xl font-bold">{assets.length}</p>
              </div>
              <Package className="h-8 w-8 text-primary opacity-70" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">In Stock</p>
                <p className="text-2xl font-bold text-green-500">{inStockCount}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500 opacity-70" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Deployed</p>
                <p className="text-2xl font-bold text-blue-500">{deployedCount}</p>
              </div>
              <Building2 className="h-8 w-8 text-blue-500 opacity-70" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Value</p>
                <p className="text-2xl font-bold">${totalValue.toLocaleString()}</p>
              </div>
              <DollarSign className="h-8 w-8 text-amber-500 opacity-70" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Warranty Alert */}
      {expiringWarranty > 0 && (
        <Card className="border-yellow-500/50 bg-yellow-500/10">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              <p className="text-sm">
                <span className="font-medium">{expiringWarranty} asset(s)</span> have expired or expiring warranties
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search assets by name, serial, manufacturer..."
                className="pl-10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="search-input"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[150px]" data-testid="type-filter">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {ASSET_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]" data-testid="status-filter">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {ASSET_STATUSES.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Assets Table */}
      <Card>
        <CardHeader>
          <CardTitle>Assets ({filteredAssets.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredAssets.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No assets found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset</TableHead>
                  <TableHead>Serial Number</TableHead>
                  <TableHead>Specs</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Warranty</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Location / Customer</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAssets.map((asset) => {
                  const TypeIcon = getAssetTypeIcon(asset.asset_type);
                  const statusBadge = getStatusBadge(asset.status);
                  const warranty = getWarrantyStatus(asset.warranty_end);
                  
                  return (
                    <TableRow 
                      key={asset.id} 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => openViewDialog(asset)}
                      data-testid={`asset-row-${asset.id}`}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <TypeIcon className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{asset.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {asset.manufacturer} {asset.model}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-1 py-0.5 rounded">
                          {asset.serial_number || '-'}
                        </code>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm text-muted-foreground truncate max-w-[150px]" title={asset.specifications}>
                          {asset.specifications || '-'}
                        </p>
                      </TableCell>
                      <TableCell>
                        {asset.purchase_cost ? (
                          <span className="font-medium">${asset.purchase_cost.toLocaleString()}</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {warranty ? (
                          <span className={`text-sm ${warranty.color}`}>
                            {warranty.label}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={statusBadge.color}>
                          {statusBadge.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {asset.assigned_customer_name && (
                            <p className="flex items-center gap-1">
                              <Building2 className="h-3 w-3" />
                              {asset.assigned_customer_name}
                            </p>
                          )}
                          {asset.location && (
                            <p className="flex items-center gap-1 text-muted-foreground">
                              <MapPin className="h-3 w-3" />
                              {asset.location}
                            </p>
                          )}
                          {!asset.assigned_customer_name && !asset.location && (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" data-testid={`asset-actions-${asset.id}`}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEditDialog(asset); }}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={(e) => { e.stopPropagation(); handleDelete(asset.id); }}
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

      {/* Add/Edit Asset Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingAsset ? 'Edit Asset' : 'Add New Asset'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <Tabs defaultValue="basic" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="basic">Basic Info</TabsTrigger>
                <TabsTrigger value="purchase">Purchase & Warranty</TabsTrigger>
                <TabsTrigger value="assignment">Assignment</TabsTrigger>
              </TabsList>
              
              <TabsContent value="basic" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label>Asset Name *</Label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="e.g., Dell PowerEdge R740"
                      required
                      data-testid="asset-name-input"
                    />
                  </div>
                  <div>
                    <Label>Asset Type *</Label>
                    <Select value={form.asset_type} onValueChange={(v) => setForm({ ...form, asset_type: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ASSET_TYPES.map(t => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Condition</Label>
                    <Select value={form.condition} onValueChange={(v) => setForm({ ...form, condition: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ASSET_CONDITIONS.map(c => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Manufacturer</Label>
                    <Input
                      value={form.manufacturer}
                      onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
                      placeholder="e.g., Dell, HP, Lenovo"
                    />
                  </div>
                  <div>
                    <Label>Model</Label>
                    <Input
                      value={form.model}
                      onChange={(e) => setForm({ ...form, model: e.target.value })}
                      placeholder="e.g., PowerEdge R740"
                    />
                  </div>
                  <div>
                    <Label>Serial Number</Label>
                    <Input
                      value={form.serial_number}
                      onChange={(e) => setForm({ ...form, serial_number: e.target.value })}
                      placeholder="S/N"
                    />
                  </div>
                  <div>
                    <Label>Status</Label>
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ASSET_STATUSES.map(s => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Label>Specifications</Label>
                    <Textarea
                      value={form.specifications}
                      onChange={(e) => setForm({ ...form, specifications: e.target.value })}
                      placeholder="CPU: Intel Xeon Gold 6248R&#10;RAM: 128GB DDR4&#10;Storage: 2x 1TB SSD RAID 1"
                      rows={3}
                    />
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="purchase" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Purchase Date</Label>
                    <Input
                      type="date"
                      value={form.purchase_date}
                      onChange={(e) => setForm({ ...form, purchase_date: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Purchase Cost ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.purchase_cost}
                      onChange={(e) => setForm({ ...form, purchase_cost: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <Label>Warranty End Date</Label>
                    <Input
                      type="date"
                      value={form.warranty_end}
                      onChange={(e) => setForm({ ...form, warranty_end: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Supplier</Label>
                    <Input
                      value={form.supplier}
                      onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                      placeholder="Supplier name"
                    />
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="assignment" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Assigned to Customer</Label>
                    <Select value={form.assigned_customer_id || "none"} onValueChange={(v) => setForm({ ...form, assigned_customer_id: v === "none" ? "" : v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select customer (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {customers.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Location</Label>
                    <Input
                      value={form.location}
                      onChange={(e) => setForm({ ...form, location: e.target.value })}
                      placeholder="e.g., Warehouse, DC1 Rack A3"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>Notes</Label>
                    <Textarea
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      placeholder="Additional notes about this asset..."
                      rows={3}
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>
            
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" data-testid="save-asset-btn">
                {editingAsset ? 'Update' : 'Create'} Asset
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* View Asset Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {viewAsset && React.createElement(getAssetTypeIcon(viewAsset.asset_type), { className: "h-5 w-5" })}
              {viewAsset?.name}
            </DialogTitle>
          </DialogHeader>
          
          {viewAsset && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Hardware Details</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-2">
                    <p><span className="text-muted-foreground">Type:</span> {ASSET_TYPES.find(t => t.value === viewAsset.asset_type)?.label}</p>
                    <p><span className="text-muted-foreground">Manufacturer:</span> {viewAsset.manufacturer || '-'}</p>
                    <p><span className="text-muted-foreground">Model:</span> {viewAsset.model || '-'}</p>
                    <p><span className="text-muted-foreground">Serial:</span> <code className="bg-muted px-1 rounded">{viewAsset.serial_number || '-'}</code></p>
                    <p><span className="text-muted-foreground">Condition:</span> {ASSET_CONDITIONS.find(c => c.value === viewAsset.condition)?.label}</p>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Purchase & Warranty</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-2">
                    <p><span className="text-muted-foreground">Purchase Date:</span> {viewAsset.purchase_date ? new Date(viewAsset.purchase_date).toLocaleDateString() : '-'}</p>
                    <p><span className="text-muted-foreground">Cost:</span> {viewAsset.purchase_cost ? `$${viewAsset.purchase_cost.toLocaleString()}` : '-'}</p>
                    <p><span className="text-muted-foreground">Supplier:</span> {viewAsset.supplier || '-'}</p>
                    <p>
                      <span className="text-muted-foreground">Warranty:</span>{' '}
                      {viewAsset.warranty_end ? (
                        <span className={getWarrantyStatus(viewAsset.warranty_end)?.color}>
                          {new Date(viewAsset.warranty_end).toLocaleDateString()} ({getWarrantyStatus(viewAsset.warranty_end)?.label})
                        </span>
                      ) : '-'}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {viewAsset.specifications && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Specifications</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="text-sm whitespace-pre-wrap bg-muted p-3 rounded">{viewAsset.specifications}</pre>
                  </CardContent>
                </Card>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <div className="mt-1">
                    <Badge className={getStatusBadge(viewAsset.status).color}>
                      {getStatusBadge(viewAsset.status).label}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Location</Label>
                  <p className="mt-1">{viewAsset.location || '-'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Assigned Customer</Label>
                  <p className="mt-1">{viewAsset.assigned_customer_name || '-'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Created</Label>
                  <p className="mt-1">{new Date(viewAsset.created_at).toLocaleDateString()}</p>
                </div>
              </div>

              {viewAsset.notes && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Notes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm whitespace-pre-wrap">{viewAsset.notes}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
              Close
            </Button>
            <Button onClick={() => { setViewDialogOpen(false); openEditDialog(viewAsset); }}>
              <Edit className="h-4 w-4 mr-2" />
              Edit Asset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
