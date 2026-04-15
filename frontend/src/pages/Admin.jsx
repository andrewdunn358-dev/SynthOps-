import React, { useState, useEffect } from 'react';
import { apiClient, useAuth } from '../App';
import { toast } from 'sonner';
import { getErrorMessage } from '../lib/errorHandler';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
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
  Shield, Users, RefreshCw, Link2, CheckCircle, XCircle, Plus, 
  UserPlus, Edit, Trash2, Key, Clock
} from 'lucide-react';
import {
  DialogFooter,
} from '../components/ui/dialog';

export default function Admin() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [trmmStatus, setTrmmStatus] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [testingTrmm, setTestingTrmm] = useState(false);
  const [syncing, setSyncing] = useState(false);
  
  // User creation dialog
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [userForm, setUserForm] = useState({
    username: '',
    email: '',
    password: '',
    role: 'engineer'
  });
  const [creatingUser, setCreatingUser] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [usersRes, trmmRes, syncRes] = await Promise.all([
        apiClient.get('/users'),
        apiClient.get('/integrations/trmm/test').catch(() => ({ data: { status: 'not_configured' } })),
        apiClient.get('/sync/status').catch(() => ({ data: null }))
      ]);
      setUsers(usersRes.data);
      setTrmmStatus(trmmRes.data);
      setSyncStatus(syncRes.data);
    } catch (error) {
      console.error('Admin fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setCreatingUser(true);
    try {
      await apiClient.post('/auth/register', userForm);
      toast.success('User created successfully');
      setUserDialogOpen(false);
      setUserForm({ username: '', email: '', password: '', role: 'engineer' });
      fetchData();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to create user'));
    } finally {
      setCreatingUser(false);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      await apiClient.put(`/users/${userId}/role`, { role: newRole });
      toast.success('Role updated');
      fetchData();
    } catch (error) {
      toast.error('Failed to update role');
    }
  };

  const handleStatusToggle = async (userId, isActive) => {
    try {
      await apiClient.put(`/users/${userId}/status`, { is_active: !isActive });
      toast.success(isActive ? 'User deactivated' : 'User activated');
      fetchData();
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  const handleResetPassword = async (userId) => {
    const newPassword = prompt('Enter new password for user:');
    if (!newPassword) return;
    
    try {
      await apiClient.put(`/users/${userId}/reset-password`, { password: newPassword });
      toast.success('Password reset successfully');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to reset password'));
    }
  };

  const testTrmmConnection = async () => {
    setTestingTrmm(true);
    try {
      const response = await apiClient.get('/integrations/trmm/test');
      setTrmmStatus(response.data);
      if (response.data.status === 'connected') {
        toast.success('Connected to Tactical RMM');
      } else {
        toast.error(response.data.message);
      }
    } catch (error) {
      toast.error('Connection test failed');
    } finally {
      setTestingTrmm(false);
    }
  };

  const syncFromTrmm = async () => {
    setSyncing(true);
    try {
      const response = await apiClient.post('/integrations/trmm/sync');
      toast.success(`Synced: ${response.data.stats.clients_synced} clients, ${response.data.stats.sites_synced} sites, ${response.data.stats.agents_synced} servers, ${response.data.stats.workstations_synced} workstations`);
      fetchData();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Sync failed'));
    } finally {
      setSyncing(false);
    }
  };

  const reclassifyDevices = async () => {
    setSyncing(true);
    try {
      const response = await apiClient.post('/trmm/reclassify');
      toast.success(`Reclassified: ${response.data.stats.moved_to_machines} moved to workstations, ${response.data.stats.moved_to_servers} moved to servers`);
      fetchData();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Reclassification failed'));
    } finally {
      setSyncing(false);
    }
  };

  const triggerSync = async (syncType) => {
    try {
      await apiClient.post(`/sync/trigger/${syncType}`);
      toast.success(`${syncType.toUpperCase()} sync triggered`);
    } catch (error) {
      toast.error('Failed to trigger sync');
    }
  };

  const getRoleDescription = (role) => {
    switch (role) {
      case 'admin': return 'Full access, user management, system settings';
      case 'engineer': return 'Day-to-day operations, no user management';
      case 'viewer': return 'Read-only access to dashboards and reports';
      default: return '';
    }
  };

  // ── Support Product Catalogue ─────────────────────────────
  const [products, setProducts] = useState([]);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productForm, setProductForm] = useState({
    name: '', category: 'office365', unit: 'count', active: true, sort_order: 0, unit_cost: null,
  });
  const [savingProduct, setSavingProduct] = useState(false);

  const CATEGORY_OPTIONS = [
    { value: 'security', label: 'Security' },
    { value: 'backup', label: 'Backup' },
    { value: 'devices', label: 'Devices' },
    { value: 'onsite', label: 'Onsite Devices' },
    { value: 'connectivity', label: 'Connectivity' },
    { value: 'hosting', label: 'Hosting' },
    { value: 'office365', label: 'Office 365' },
    { value: 'other', label: 'Other' },
  ];

  const UNIT_OPTIONS = [
    { value: 'count', label: 'Count' },
    { value: 'licences', label: 'Licences' },
    { value: 'gb', label: 'GB' },
    { value: 'yes/no', label: 'Yes / No' },
    { value: 'text', label: 'Text' },
  ];

  useEffect(() => { fetchProducts(); }, []);

  if (user?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground">You need admin privileges to access this page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }



  const fetchProducts = async () => {
    try {
      const res = await apiClient.get('/support/products?include_inactive=true');
      setProducts(res.data);
    } catch (e) { /* silent */ }
  };

  const openNewProduct = () => {
    setEditingProduct(null);
    setProductForm({ name: '', category: 'office365', unit: 'count', active: true, sort_order: products.length * 10, unit_cost: null });
    setProductDialogOpen(true);
  };

  const openEditProduct = (p) => {
    setEditingProduct(p);
    setProductForm({ name: p.name, category: p.category, unit: p.unit, active: p.active, sort_order: p.sort_order, unit_cost: p.unit_cost });
    setProductDialogOpen(true);
  };

  const saveProduct = async () => {
    if (!productForm.name) { toast.error('Product name is required'); return; }
    setSavingProduct(true);
    try {
      if (editingProduct) {
        await apiClient.put(`/support/products/${editingProduct.id}`, productForm);
        toast.success('Product updated');
      } else {
        await apiClient.post('/support/products', productForm);
        toast.success('Product added');
      }
      setProductDialogOpen(false);
      fetchProducts();
    } catch (e) {
      toast.error('Failed to save product');
    } finally {
      setSavingProduct(false);
    }
  };

  const deactivateProduct = async (id) => {
    if (!window.confirm('Deactivate this product? It will be hidden from new entries but historical data is preserved.')) return;
    try {
      await apiClient.delete(`/support/products/${id}`);
      toast.success('Product deactivated');
      fetchProducts();
    } catch (e) {
      toast.error('Failed to deactivate product');
    }
  };

  const reactivateProduct = async (p) => {
    try {
      await apiClient.put(`/support/products/${p.id}`, { ...p, active: true });
      toast.success('Product reactivated');
      fetchProducts();
    } catch (e) {
      toast.error('Failed to reactivate');
    }
  };


  return (
    <div className="space-y-6" data-testid="admin-page">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Barlow Condensed' }}>
          ADMIN
        </h1>
        <p className="text-muted-foreground">System administration, user management, and integrations</p>
      </div>

      {/* User Management */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              User Management
            </CardTitle>
            <CardDescription>Create and manage user accounts</CardDescription>
          </div>
          <Button onClick={() => setUserDialogOpen(true)} data-testid="create-user-btn">
            <UserPlus className="h-4 w-4 mr-2" />
            Create User
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="table-dense">
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>2FA</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id} className="table-dense">
                    <TableCell className="font-medium">{u.username}</TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <Select 
                        value={u.role} 
                        onValueChange={(v) => handleRoleChange(u.id, v)}
                        disabled={u.id === user?.id}
                      >
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="engineer">Engineer</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.totp_enabled ? 'default' : 'outline'}>
                        {u.totp_enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={u.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleResetPassword(u.id)}
                          title="Reset Password"
                        >
                          <Key className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleStatusToggle(u.id, u.is_active)}
                          disabled={u.id === user?.id}
                          title={u.is_active ? 'Deactivate' : 'Activate'}
                        >
                          {u.is_active ? <XCircle className="h-4 w-4 text-red-400" /> : <CheckCircle className="h-4 w-4 text-emerald-400" />}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Role Permissions Reference */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Role Permissions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg">
              <h4 className="font-semibold text-emerald-400">Admin</h4>
              <p className="text-sm text-muted-foreground mt-1">{getRoleDescription('admin')}</p>
              <ul className="text-xs text-muted-foreground mt-2 space-y-1">
                <li>• Create/edit/delete users</li>
                <li>• System configuration</li>
                <li>• Full data access</li>
              </ul>
            </div>
            <div className="p-4 border rounded-lg">
              <h4 className="font-semibold text-blue-400">Engineer</h4>
              <p className="text-sm text-muted-foreground mt-1">{getRoleDescription('engineer')}</p>
              <ul className="text-xs text-muted-foreground mt-2 space-y-1">
                <li>• Manage servers/clients</li>
                <li>• Create tasks/incidents</li>
                <li>• Time tracking</li>
              </ul>
            </div>
            <div className="p-4 border rounded-lg">
              <h4 className="font-semibold text-amber-400">Viewer</h4>
              <p className="text-sm text-muted-foreground mt-1">{getRoleDescription('viewer')}</p>
              <ul className="text-xs text-muted-foreground mt-2 space-y-1">
                <li>• View dashboards</li>
                <li>• View reports</li>
                <li>• No edit permissions</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Integrations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Tactical RMM */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Tactical RMM
            </CardTitle>
            <CardDescription>Remote monitoring and management</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              {trmmStatus?.status === 'connected' ? (
                <CheckCircle className="h-5 w-5 text-emerald-400" />
              ) : (
                <XCircle className="h-5 w-5 text-red-400" />
              )}
              <span className={trmmStatus?.status === 'connected' ? 'text-emerald-400' : 'text-red-400'}>
                {trmmStatus?.status === 'connected' ? 'Connected' : 'Not Connected'}
              </span>
            </div>
            {syncStatus?.trmm?.next_run && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Next sync: {new Date(syncStatus.trmm.next_run).toLocaleString()}
              </p>
            )}
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={testTrmmConnection} disabled={testingTrmm}>
                <RefreshCw className={`h-4 w-4 mr-2 ${testingTrmm ? 'animate-spin' : ''}`} />
                Test
              </Button>
              <Button size="sm" onClick={syncFromTrmm} disabled={syncing || trmmStatus?.status !== 'connected'}>
                <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                Sync Now
              </Button>
              <Button variant="secondary" size="sm" onClick={reclassifyDevices} disabled={syncing}>
                Reclassify Devices
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Bitdefender GravityZone */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="h-5 w-5 text-red-500" />
              Bitdefender GravityZone
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-emerald-400" />
              <span className="text-emerald-400">Connected</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Security alerts will appear on Dashboard and NOC Display
            </p>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => window.open('https://cloudgz.gravityzone.bitdefender.com/', '_blank')}
            >
              Open GravityZone Console
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Create User Dialog */}
      <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateUser} className="space-y-4">
            <div className="space-y-2">
              <Label>Username *</Label>
              <Input
                value={userForm.username}
                onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                placeholder="johndoe"
                required
                data-testid="new-user-username"
              />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input
                type="email"
                value={userForm.email}
                onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                placeholder="john@example.com"
                required
                data-testid="new-user-email"
              />
            </div>
            <div className="space-y-2">
              <Label>Password *</Label>
              <Input
                type="password"
                value={userForm.password}
                onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                placeholder="••••••••"
                required
                minLength={6}
                data-testid="new-user-password"
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={userForm.role} onValueChange={(v) => setUserForm({ ...userForm, role: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin - Full access</SelectItem>
                  <SelectItem value="engineer">Engineer - Operations</SelectItem>
                  <SelectItem value="viewer">Viewer - Read only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setUserDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creatingUser} data-testid="submit-create-user">
                {creatingUser ? 'Creating...' : 'Create User'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
