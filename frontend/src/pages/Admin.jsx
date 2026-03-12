import React, { useState, useEffect } from 'react';
import { apiClient, useAuth } from '../App';
import { toast } from 'sonner';
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
  Shield, Users, RefreshCw, Database, Link2, CheckCircle, XCircle
} from 'lucide-react';

export default function Admin() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [trmmStatus, setTrmmStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [testingTrmm, setTestingTrmm] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [usersRes, trmmRes] = await Promise.all([
        apiClient.get('/users'),
        apiClient.get('/integrations/trmm/test')
      ]);
      setUsers(usersRes.data);
      setTrmmStatus(trmmRes.data);
    } catch (error) {
      console.error('Admin fetch error:', error);
    } finally {
      setLoading(false);
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
      toast.success(`Synced: ${response.data.stats.clients_synced} clients, ${response.data.stats.sites_synced} sites, ${response.data.stats.agents_synced} agents`);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

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

  return (
    <div className="space-y-6" data-testid="admin-page">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Barlow Condensed' }}>
          ADMIN
        </h1>
        <p className="text-muted-foreground">System administration and settings</p>
      </div>

      {/* Tactical RMM Integration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Tactical RMM Integration
          </CardTitle>
          <CardDescription>Sync clients, sites, and agents from Tactical RMM</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
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
          </div>
          
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={testTrmmConnection} 
              disabled={testingTrmm}
              data-testid="test-trmm"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${testingTrmm ? 'animate-spin' : ''}`} />
              Test Connection
            </Button>
            <Button 
              onClick={syncFromTrmm} 
              disabled={syncing || trmmStatus?.status !== 'connected'}
              data-testid="sync-trmm"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
              Sync Now
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* User Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            User Management
          </CardTitle>
          <CardDescription>Manage user accounts and permissions</CardDescription>
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
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleStatusToggle(u.id, u.is_active)}
                        disabled={u.id === user?.id}
                      >
                        {u.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Database Admin
            </CardTitle>
            <CardDescription>Access phpMyAdmin for database management</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" asChild>
              <a href="#" target="_blank" rel="noopener noreferrer">
                Open phpMyAdmin
              </a>
            </Button>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Password Manager
            </CardTitle>
            <CardDescription>Access Vaultwarden for credential management</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" asChild>
              <a href="#" target="_blank" rel="noopener noreferrer">
                Open Vaultwarden
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
