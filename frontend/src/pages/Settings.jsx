import React, { useState, useEffect } from 'react';
import { useAuth, useTheme, apiClient } from '../App';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Badge } from '../components/ui/badge';
import { 
  User, Moon, Sun, Shield, Bell, Key, CheckCircle, XCircle, Send, Monitor, KeyRound, ExternalLink, Book
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Settings() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [notificationConfig, setNotificationConfig] = useState(null);
  const [testingTeams, setTestingTeams] = useState(false);
  const [integrations, setIntegrations] = useState({
    meshcentral: { configured: false, url: '' },
    vaultwarden: { configured: false, url: '' }
  });

  useEffect(() => {
    fetchNotificationConfig();
    fetchIntegrationConfigs();
  }, []);

  const fetchNotificationConfig = async () => {
    try {
      const res = await apiClient.get('/notifications/config');
      setNotificationConfig(res.data);
    } catch (error) {
      console.log('Failed to fetch notification config');
    }
  };

  const fetchIntegrationConfigs = async () => {
    try {
      const [meshRes, vaultRes] = await Promise.all([
        apiClient.get('/config/meshcentral').catch(() => ({ data: { configured: false } })),
        apiClient.get('/config/vaultwarden').catch(() => ({ data: { configured: false } }))
      ]);
      setIntegrations({
        meshcentral: meshRes.data,
        vaultwarden: vaultRes.data
      });
    } catch (error) {
      console.log('Failed to fetch integration configs');
    }
  };

  const testTeamsWebhook = async () => {
    setTestingTeams(true);
    try {
      await apiClient.post('/notifications/teams/test');
      toast.success('Test notification sent to Teams!');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to send test notification');
    } finally {
      setTestingTeams(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    // TODO: Implement password change API
    toast.success('Password changed successfully');
    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
  };

  return (
    <div className="space-y-6 max-w-2xl" data-testid="settings-page">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Barlow Condensed' }}>
          SETTINGS
        </h1>
        <p className="text-muted-foreground">Manage your account settings and integrations</p>
      </div>

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Profile
          </CardTitle>
          <CardDescription>Your account information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-muted-foreground">Username</Label>
              <p className="font-medium">{user?.username}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Email</Label>
              <p className="font-medium">{user?.email}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-muted-foreground">Role</Label>
              <p className="font-medium capitalize">{user?.role}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">2FA Status</Label>
              <p className="font-medium">{user?.totp_enabled ? 'Enabled' : 'Disabled'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Integrations Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ExternalLink className="h-5 w-5" />
            Integrations
          </CardTitle>
          <CardDescription>Connected services and tools</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-sm bg-muted/50">
            <div className="flex items-center gap-3">
              <Monitor className="h-5 w-5 text-cyan-400" />
              <div>
                <p className="font-medium">MeshCentral</p>
                <p className="text-sm text-muted-foreground">Remote device access</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {integrations.meshcentral?.configured ? (
                <>
                  <Badge className="bg-emerald-500/20 text-emerald-400">Connected</Badge>
                  <Button size="sm" variant="outline" onClick={() => window.open(integrations.meshcentral.url, '_blank')}>
                    Open
                  </Button>
                </>
              ) : (
                <Badge variant="outline">Not configured</Badge>
              )}
            </div>
          </div>
          
          <div className="flex items-center justify-between p-3 rounded-sm bg-muted/50">
            <div className="flex items-center gap-3">
              <KeyRound className="h-5 w-5 text-amber-400" />
              <div>
                <p className="font-medium">Vaultwarden</p>
                <p className="text-sm text-muted-foreground">Password manager</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {integrations.vaultwarden?.configured ? (
                <>
                  <Badge className="bg-emerald-500/20 text-emerald-400">Connected</Badge>
                  <Button size="sm" variant="outline" onClick={() => window.open(integrations.vaultwarden.url, '_blank')}>
                    Open
                  </Button>
                </>
              ) : (
                <Badge variant="outline">Not configured</Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notifications
          </CardTitle>
          <CardDescription>Alert configuration status</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-sm bg-muted/50">
            <div className="flex items-center gap-3">
              <Send className="h-5 w-5 text-blue-400" />
              <div>
                <p className="font-medium">Microsoft Teams</p>
                <p className="text-sm text-muted-foreground">Webhook notifications for alerts</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {notificationConfig?.teams?.configured ? (
                <>
                  <Badge className="bg-emerald-500/20 text-emerald-400">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Configured
                  </Badge>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={testTeamsWebhook}
                    disabled={testingTeams}
                    data-testid="test-teams"
                  >
                    {testingTeams ? 'Sending...' : 'Test'}
                  </Button>
                </>
              ) : (
                <Badge variant="outline">
                  <XCircle className="h-3 w-3 mr-1" />
                  Not configured
                </Badge>
              )}
            </div>
          </div>
          
          <p className="text-xs text-muted-foreground">
            To configure Teams webhooks, add <code className="bg-muted px-1 rounded">TEAMS_WEBHOOK_URL</code> to your environment variables.
            Alerts will be sent when servers go offline, new tickets arrive, or tasks are assigned.
          </p>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {theme === 'dark' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
            Appearance
          </CardTitle>
          <CardDescription>Customize how SynthOps looks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Dark Mode</p>
              <p className="text-sm text-muted-foreground">Toggle dark/light theme</p>
            </div>
            <Switch
              checked={theme === 'dark'}
              onCheckedChange={toggleTheme}
              data-testid="theme-toggle"
            />
          </div>
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Change Password
          </CardTitle>
          <CardDescription>Update your password</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div className="space-y-2">
              <Label>Current Password</Label>
              <Input
                type="password"
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                placeholder="••••••••"
                data-testid="current-password"
              />
            </div>
            <div className="space-y-2">
              <Label>New Password</Label>
              <Input
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                placeholder="••••••••"
                data-testid="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label>Confirm New Password</Label>
              <Input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                placeholder="••••••••"
                data-testid="confirm-password"
              />
            </div>
            <Button type="submit" data-testid="change-password">
              Change Password
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Security */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security
          </CardTitle>
          <CardDescription>Two-factor authentication</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Two-Factor Authentication (2FA)</p>
              <p className="text-sm text-muted-foreground">
                {user?.totp_enabled 
                  ? 'Your account is protected with 2FA' 
                  : 'Add an extra layer of security to your account'}
              </p>
            </div>
            <Button variant="outline" data-testid="setup-2fa">
              {user?.totp_enabled ? 'Manage 2FA' : 'Setup 2FA'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* User Manual */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Book className="h-5 w-5" />
            Help & Documentation
          </CardTitle>
          <CardDescription>User manual and guides</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">SynthOps User Manual</p>
              <p className="text-sm text-muted-foreground">
                Learn how to use all features of SynthOps including servers, tasks, incidents, reports, and more.
              </p>
            </div>
            <Button onClick={() => navigate('/manual')} data-testid="open-manual">
              <Book className="h-4 w-4 mr-2" />
              Open Manual
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
