import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth, useTheme, apiClient } from '../App';
import { 
  LayoutDashboard, Building2, Server, ListTodo, FolderKanban, 
  AlertTriangle, Wrench, FileText, Clock, Users, Settings, 
  Shield, LogOut, Menu, X, Sun, Moon, ChevronLeft,
  BarChart3, KeyRound, ExternalLink, Monitor, ShieldCheck, Network,
  Package, HardDrive, ClipboardList, Table2, Link2, ClipboardCheck
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
  { path: '/infrastructure', icon: Network, label: 'Infrastructure' },
  { path: '/stock', icon: Package, label: 'Stock & Assets' },
  // Hidden 2026-05-01 — focus pass. Worksheets (coming) will cover the
  // billable-job workflow that Tasks was attempting. Projects kept hidden
  // for now — may come back as a worksheet-grouping concept. Time Tracking
  // overlapped with Tasks and wasn't being used.
  // Pages, routes, and data are intact — un-comment any of these to restore.
  // { path: '/tasks', icon: ListTodo, label: 'Tasks' },
  // { path: '/projects', icon: FolderKanban, label: 'Projects' },
  { path: '/incidents', icon: AlertTriangle, label: 'Incidents' },
  { path: '/worksheets', icon: ClipboardCheck, label: 'Worksheets' },
  // Hidden 2026-05-01 — see commit message. Page and route still exist;
  // maintenance-style work is being absorbed into Tasks instead.
  // { path: '/maintenance', icon: Wrench, label: 'Maintenance' },
  { path: '/dc-health-check', icon: ShieldCheck, label: 'Monthly Health Check' },
  { path: '/backups', icon: HardDrive, label: 'Backup Tracking' },
  { path: '/support/changes', icon: ClipboardList, label: 'Support Changes' },
  { path: '/support/count', icon: Table2, label: 'Support Count' },
  { path: '/support/mappings', icon: Link2, label: 'Support Mappings' },
  { path: '/docs', icon: FileText, label: 'Documentation' },
  // { path: '/time', icon: Clock, label: 'Time Tracking' },
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
  // Per-nav-item badge counts. Keyed by path so future nav items can
  // attach badges without restructuring (e.g. could surface unread DC
  // health checks on /dc-health-check). Currently only /incidents uses it.
  const [navBadges, setNavBadges] = useState({});

  useEffect(() => {
    // Fetch Vaultwarden URL from backend config
    const fetchVaultConfig = async () => {
      try {
        const res = await apiClient.get('/config/vaultwarden');
        if (res.data.configured) {
          setVaultUrl(res.data.url);
        }
      } catch (error) {
        console.error('Vaultwarden config fetch failed', error);
      }
    };
    fetchVaultConfig();
  }, []);

  // Active-incident sidebar badge.
  // Strategy: poll every 30 seconds, plus refetch when the user tabs
  // back to the window (otherwise a tab open all day shows stale data
  // until the next 30s tick). Failure is silent — a flaky network
  // shouldn't make the sidebar flicker.
  useEffect(() => {
    let cancelled = false;

    const fetchIncidentCount = async () => {
      try {
        const res = await apiClient.get('/incidents/active-count');
        if (cancelled) return;
        setNavBadges(prev => ({
          ...prev,
          '/incidents': {
            count: res.data.active || 0,
            // critical lets us style differently if we ever want a
            // pulse / brighter red — currently both render the same.
            critical: (res.data.critical || 0) > 0,
          },
        }));
      } catch {
        // Silent — don't disturb the user with sidebar fetch errors
      }
    };

    fetchIncidentCount();
    const intervalId = setInterval(fetchIncidentCount, 30000);

    const onFocus = () => fetchIncidentCount();
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
    };
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
            {navItems.map((item) => {
              const badge = navBadges[item.path];
              const showBadge = badge && badge.count > 0;
              return (
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
                <div className="relative flex-shrink-0">
                  <item.icon className="h-5 w-5" />
                  {/* Collapsed sidebar: small dot in the corner of the icon.
                      Expanded sidebar: full numeric badge sits at the end
                      of the row instead, so we hide this corner one. */}
                  {showBadge && !sidebarOpen && (
                    <span
                      className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center"
                      title={`${badge.count} active incident${badge.count === 1 ? '' : 's'}`}
                    >
                      {badge.count > 9 ? '9+' : badge.count}
                    </span>
                  )}
                </div>
                {sidebarOpen && (
                  <>
                    <span>{item.label}</span>
                    {showBadge && (
                      <span
                        className="ml-auto px-2 py-0.5 rounded-full bg-red-500 text-white text-xs font-bold min-w-[20px] text-center"
                        title={`${badge.count} active incident${badge.count === 1 ? '' : 's'}`}
                      >
                        {badge.count}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
              );
            })}
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
