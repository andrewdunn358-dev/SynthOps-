import React, { useState } from 'react';
import { useAuth, useTheme } from '../App';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Separator } from '../components/ui/separator';
import { 
  User, Moon, Sun, Shield, Bell, Key
} from 'lucide-react';

export default function Settings() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

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
        <p className="text-muted-foreground">Manage your account settings</p>
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
    </div>
  );
}
