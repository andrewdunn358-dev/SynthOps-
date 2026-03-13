import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth, useTheme, apiClient } from '../App';
import { 
  LayoutDashboard, Building2, Server, ListTodo, FolderKanban, 
  AlertTriangle, Wrench, FileText, Clock, Users, Settings, 
  Shield, LogOut, Menu, X, Sun, Moon, ChevronLeft,
  Ticket, BarChart3, KeyRound, ExternalLink, Monitor, ShieldCheck
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Avatar, AvatarFallback } from '../components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import SophieFloating from './SophieFloating';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard', exact: true },
  { path: '/clients', icon: Building2, label: 'Clients' },
  { path: '/servers', icon: Server, label: 'Servers' },
  { path: '/tasks', icon: ListTodo, label: 'Tasks' },
  { path: '/projects', icon: FolderKanban, label: 'Projects' },
  { path: '/incidents', icon: AlertTriangle, label: 'Incidents' },
  { path: '/tickets', icon: Ticket, label: 'Tickets' },
  { path: '/maintenance', icon: Wrench, label: 'Maintenance' },
  { path: '/dc-health-check', icon: ShieldCheck, label: 'DC Health Check' },
  { path: '/docs', icon: FileText, label: 'Documentation' },
  { path: '/time', icon: Clock, label: 'Time Tracking' },
  { path: '/staff', icon: Users, label: 'Staff' },
  { path: '/reports', icon: BarChart3, label: 'Reports' },
];

const adminItems = [
  { path: '/admin', icon: Shield, label: 'Admin' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [vaultUrl, setVaultUrl] = useState(null);

  useEffect(() => {
    // Fetch Vaultwarden URL from backend config
    const fetchVaultConfig = async () => {
      try {
        const res = await apiClient.get('/config/vaultwarden');
        if (res.data.configured) {
          setVaultUrl(res.data.url);
        }
      } catch (error) {
        console.log('Vaultwarden not configured');
      }
    };
    fetchVaultConfig();
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <aside className={`fixed left-0 top-0 h-screen bg-card border-r border-border flex flex-col z-40 transition-all duration-300 ${sidebarOpen ? 'w-64' : 'w-16'}`}>
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-border">
          {sidebarOpen && (
            <div className="flex items-center gap-2">
              <img 
                src="/synthesis-it-logo.png" 
                alt="Synthesis IT" 
                className="h-10 object-contain"
              />
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="h-8 w-8"
            data-testid="sidebar-toggle"
          >
            {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 overflow-y-auto">
          <div className="space-y-1 px-2">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.exact}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm transition-colors ${
                    isActive
                      ? 'bg-primary/10 text-primary border-l-2 border-primary ml-[-2px]'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                  }`
                }
                data-testid={`nav-${item.label.toLowerCase().replace(' ', '-')}`}
              >
                <item.icon className="h-5 w-5 flex-shrink-0" />
                {sidebarOpen && <span>{item.label}</span>}
              </NavLink>
            ))}
          </div>

          {/* Admin section */}
          {user?.role === 'admin' && (
            <>
              <div className="my-4 mx-4 border-t border-border" />
              <div className="space-y-1 px-2">
                {adminItems.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm transition-colors ${
                        isActive
                          ? 'bg-primary/10 text-primary border-l-2 border-primary ml-[-2px]'
                          : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                      }`
                    }
                    data-testid={`nav-${item.label.toLowerCase()}`}
                  >
                    <item.icon className="h-5 w-5 flex-shrink-0" />
                    {sidebarOpen && <span>{item.label}</span>}
                  </NavLink>
                ))}
              </div>
            </>
          )}
        </nav>

        {/* Sophie AI Button - Removed, now floating */}
        <div className="p-2 border-t border-border space-y-2">          
          {/* NOC Display Link */}
          <Button
            variant="outline"
            className={`w-full justify-start gap-3 bg-purple-500/10 border-purple-500/30 hover:bg-purple-500/20 text-purple-400 ${!sidebarOpen && 'justify-center px-0'}`}
            onClick={() => window.open('/display', '_blank')}
            data-testid="noc-display-button"
          >
            <Monitor className="h-5 w-5" />
            {sidebarOpen && (
              <>
                <span>NOC Display</span>
                <ExternalLink className="h-3 w-3 ml-auto" />
              </>
            )}
          </Button>
          
          {/* Vaultwarden Link */}
          {vaultUrl && (
            <Button
              variant="outline"
              className={`w-full justify-start gap-3 bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20 text-amber-400 ${!sidebarOpen && 'justify-center px-0'}`}
              onClick={() => window.open(vaultUrl, '_blank')}
              data-testid="vault-button"
            >
              <KeyRound className="h-5 w-5" />
              {sidebarOpen && (
                <>
                  <span>Password Vault</span>
                  <ExternalLink className="h-3 w-3 ml-auto" />
                </>
              )}
            </Button>
          )}
          
          {/* Theme Toggle */}
          <Button
            variant="outline"
            className={`w-full justify-start gap-3 ${!sidebarOpen && 'justify-center px-0'}`}
            onClick={toggleTheme}
            data-testid="theme-toggle"
          >
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            {sidebarOpen && <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>}
          </Button>
        </div>

        {/* User section */}
        <div className="p-4 border-t border-border">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className={`w-full justify-start gap-3 h-auto py-2 ${!sidebarOpen && 'justify-center px-0'}`} data-testid="user-menu">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary/20 text-primary text-xs">
                    {user?.username?.slice(0, 2).toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                {sidebarOpen && (
                  <div className="text-left">
                    <p className="text-sm font-medium">{user?.username}</p>
                    <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
                  </div>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => navigate('/settings')} data-testid="menu-settings">
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={toggleTheme} data-testid="menu-theme">
                {theme === 'dark' ? <Sun className="h-4 w-4 mr-2" /> : <Moon className="h-4 w-4 mr-2" />}
                {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive" data-testid="menu-logout">
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main content */}
      <main className={`min-h-screen transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-16'}`}>
        <div className="p-6">
          <Outlet />
        </div>
      </main>

      {/* Sophie AI Floating Chat */}
      <SophieFloating />
    </div>
  );
}
