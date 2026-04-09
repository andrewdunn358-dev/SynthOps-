import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../App';
import { Server, AlertTriangle, CheckCircle, Activity, Clock, Users, RefreshCw, ShieldAlert, Shield, Play, Pause, ChevronLeft, ChevronRight, ListTodo, HardDrive, XCircle, Bell } from 'lucide-react';

const VIEWS = ['security', 'clients', 'servers', 'reminders', 'alerts'];
const VIEW_LABELS = { security: 'Security', clients: 'Clients', servers: 'Servers', reminders: 'Reminders', alerts: 'Alerts' };
const CYCLE_INTERVAL = 15000; // 15 seconds

export default function NOCDisplay() {
  const [stats, setStats] = useState(null);
  const [servers, setServers] = useState([]);
  const [clients, setClients] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [securityAlerts, setSecurityAlerts] = useState(null);
  const [recurringTasks, setRecurringTasks] = useState([]);
  const [backupStats, setBackupStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [error, setError] = useState(null);
  const [currentView, setCurrentView] = useState(0);
  const [paused, setPaused] = useState(false);
  const [fading, setFading] = useState(false);
  const cycleRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      // Attempt to get auth token from localStorage
      const token = localStorage.getItem('token');
      if (token) {
        apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }
      
      const [statsRes, serversRes, clientsRes, incidentsRes] = await Promise.all([
        apiClient.get('/dashboard/stats'),
        apiClient.get('/servers'),
        apiClient.get('/clients'),
        apiClient.get('/incidents?status=open')
      ]);
      
      setStats(statsRes.data);
      setServers(serversRes.data || []);
      setClients(clientsRes.data || []);
      setIncidents(incidentsRes.data || []);
      setLastRefresh(new Date());
      setError(null);
      
      // Try to get Bitdefender security alerts
      try {
        const securityRes = await apiClient.get('/bitdefender/alerts');
        setSecurityAlerts(securityRes.data);
      } catch (e) {
        // Bitdefender not configured, ignore
      }

      // Get recurring tasks
      try {
        const tasksRes = await apiClient.get('/tasks');
        const recurring = (tasksRes.data || []).filter(t => t.is_recurring && t.status !== 'completed');
        setRecurringTasks(recurring);
      } catch (e) {
        // Tasks not available
      }

      // Get backup stats
      try {
        const backupRes = await apiClient.get('/backups/stats');
        setBackupStats(backupRes.data);
      } catch (e) {
        // Backups not available
      }
    } catch (err) {
      console.error('NOC fetch error:', err);
      setError(err.response?.status === 401 ? 'Authentication required' : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Auto-cycle views
  const changeView = useCallback((direction = 1) => {
    setFading(true);
    setTimeout(() => {
      setCurrentView(prev => (prev + direction + VIEWS.length) % VIEWS.length);
      setFading(false);
    }, 300);
  }, []);

  useEffect(() => {
    if (paused || loading) return;
    cycleRef.current = setInterval(() => changeView(1), CYCLE_INTERVAL);
    return () => clearInterval(cycleRef.current);
  }, [paused, loading, changeView]);

  // Get offline servers
  const offlineServers = servers.filter(s => s.status === 'offline');
  const onlineServers = servers.filter(s => s.status === 'online');
  const maintenanceServers = servers.filter(s => s.status === 'maintenance');

  if (loading) {
    return (
      <div className="noc-display loading">
        <div className="noc-loading">
          <RefreshCw className="animate-spin h-16 w-16" />
          <p>Loading NOC Display...</p>
        </div>
      </div>
    );
  }

  if (error === 'Authentication required') {
    return (
      <div className="noc-display error">
        <div className="noc-error">
          <AlertTriangle className="h-16 w-16" />
          <p>Authentication Required</p>
          <p className="noc-error-hint">Please log in to SynthOps first, then refresh this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="noc-display" data-testid="noc-display">
      {/* Header */}
      <header className="noc-header">
        <div className="noc-logo">
          <img 
            src="/synthesis-it-logo.png" 
            alt="Synthesis IT" 
            className="h-12 object-contain"
          />
          <span className="noc-logo-divider">|</span>
          <span>NOC</span>
        </div>
        <div className="noc-time">
          <Clock className="h-6 w-6" />
          <span>{new Date().toLocaleString()}</span>
          <span className="noc-refresh-indicator">
            <RefreshCw className="h-4 w-4" />
            Updated: {lastRefresh.toLocaleTimeString()}
          </span>
        </div>
      </header>

      {/* Alert Banner - Shows when there are offline servers */}
      {offlineServers.length > 0 && (
        <div className="noc-alert-banner critical">
          <AlertTriangle className="h-8 w-8 animate-pulse" />
          <span>{offlineServers.length} SERVER{offlineServers.length > 1 ? 'S' : ''} OFFLINE</span>
        </div>
      )}

      {/* Main Stats Row */}
      <div className="noc-stats-row">
        <div className="noc-stat online">
          <div className="noc-stat-icon">
            <CheckCircle className="h-12 w-12" />
          </div>
          <div className="noc-stat-content">
            <span className="noc-stat-number">{onlineServers.length}</span>
            <span className="noc-stat-label">Online</span>
          </div>
        </div>
        
        <div className={`noc-stat ${offlineServers.length > 0 ? 'offline' : 'ok'}`}>
          <div className="noc-stat-icon">
            <AlertTriangle className="h-12 w-12" />
          </div>
          <div className="noc-stat-content">
            <span className="noc-stat-number">{offlineServers.length}</span>
            <span className="noc-stat-label">Offline</span>
          </div>
        </div>
        
        <div className="noc-stat maintenance">
          <div className="noc-stat-icon">
            <Activity className="h-12 w-12" />
          </div>
          <div className="noc-stat-content">
            <span className="noc-stat-number">{maintenanceServers.length}</span>
            <span className="noc-stat-label">Maintenance</span>
          </div>
        </div>
        
        <div className={`noc-stat ${securityAlerts?.has_critical ? 'offline' : securityAlerts?.has_high ? 'warning' : 'ok'}`}>
          <div className="noc-stat-icon">
            <ShieldAlert className="h-12 w-12" />
          </div>
          <div className="noc-stat-content">
            <span className="noc-stat-number">{securityAlerts?.endpoint_count || 0}</span>
            <span className="noc-stat-label">Protected Endpoints</span>
          </div>
        </div>
        
        <div className={`noc-stat ${incidents.length > 0 ? 'warning' : 'ok'}`}>
          <div className="noc-stat-icon">
            <AlertTriangle className="h-12 w-12" />
          </div>
          <div className="noc-stat-content">
            <span className="noc-stat-number">{incidents.length}</span>
            <span className="noc-stat-label">Incidents</span>
          </div>
        </div>
        
        <div className="noc-stat clients">
          <div className="noc-stat-icon">
            <Users className="h-12 w-12" />
          </div>
          <div className="noc-stat-content">
            <span className="noc-stat-number">{clients.length}</span>
            <span className="noc-stat-label">Clients</span>
          </div>
        </div>
      </div>

      {/* Cycling Content Area */}
      <div className={`noc-cycle-content ${fading ? 'fade-out' : 'fade-in'}`} data-testid="noc-cycle-content">

        {/* VIEW: Security */}
        {VIEWS[currentView] === 'security' && (
          <div className={`noc-alert-panel ${
            securityAlerts?.has_critical ? 'critical' : 
            securityAlerts?.has_high ? 'high' : 
            securityAlerts?.total > 0 ? 'warning' : 'ok'
          }`}>
            <h3 className="noc-alert-title">
              <Shield className="h-6 w-6" />
              Bitdefender Security Status
              <span className={`ml-auto text-sm font-normal ${
                securityAlerts?.total > 0 ? '' : 'text-emerald-400'
              }`}>
                {securityAlerts?.total > 0 
                  ? `${securityAlerts.total} Alert${securityAlerts.total > 1 ? 's' : ''}`
                  : 'All Systems Protected'
                }
              </span>
            </h3>
            {securityAlerts?.alerts && securityAlerts.alerts.length > 0 ? (
              <div className="noc-alert-list">
                {securityAlerts.alerts.slice(0, 8).map((alert, idx) => (
                  <div key={alert.id || idx} className={`noc-alert-item ${alert.severity}`}>
                    <span className="noc-alert-type">{alert.type}</span>
                    <span className="noc-alert-title-text">{alert.title}</span>
                    <span className="noc-alert-endpoint">{alert.endpoint}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="noc-status-ok">
                <CheckCircle className="h-8 w-8 text-emerald-400" />
                <span>No active threats detected</span>
              </div>
            )}
            {securityAlerts?.endpoint_count > 0 && (
              <div className="noc-bd-stats" data-testid="noc-bitdefender-stats">
                <div className="noc-bd-stats-row">
                  <div className="noc-bd-stat">
                    <span className="noc-bd-stat-value">{securityAlerts.endpoint_count}</span>
                    <span className="noc-bd-stat-label">Agents Installed</span>
                  </div>
                  <div className="noc-bd-stat">
                    <span className="noc-bd-stat-value">{securityAlerts.company_count || 0}</span>
                    <span className="noc-bd-stat-label">Companies</span>
                  </div>
                  <div className="noc-bd-stat">
                    <span className="noc-bd-stat-value">{securityAlerts.total || 0}</span>
                    <span className="noc-bd-stat-label">Active Alerts</span>
                  </div>
                </div>
                {securityAlerts.companies && securityAlerts.companies.length > 0 && (
                  <div className="noc-bd-companies">
                    {securityAlerts.companies.map((company, idx) => (
                      <div key={company.id || idx} className="noc-bd-company">
                        <div className={`noc-bd-company-dot ${company.is_suspended ? 'suspended' : 'active'}`} />
                        <span className="noc-bd-company-name">{company.name}</span>
                        <span className="noc-bd-company-count">{company.endpoints} endpoints</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* VIEW: Clients */}
        {VIEWS[currentView] === 'clients' && (
          <div className="noc-grid-container" data-testid="noc-clients-grid">
            <h2 className="noc-section-title">
              <Users className="h-6 w-6" />
              Clients ({clients.length})
            </h2>
            <div className="noc-client-grid">
              {clients.map(client => (
                <div 
                  key={client.id} 
                  className="noc-client-tile"
                  title={`${client.name} - ${client.server_count || 0} servers, ${client.workstation_count || 0} workstations`}
                  data-testid={`noc-client-${client.id}`}
                >
                  <span className="noc-client-name">{client.name}</span>
                  <div className="noc-client-counts">
                    <span className="noc-client-count-item">
                      <Server className="h-3 w-3" />
                      {client.server_count || 0}
                    </span>
                    <span className="noc-client-count-item">
                      <Users className="h-3 w-3" />
                      {client.workstation_count || 0}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VIEW: Servers */}
        {VIEWS[currentView] === 'servers' && (
          <div className="noc-grid-container">
            <h2 className="noc-section-title">
              <Server className="h-6 w-6" />
              Server Status ({servers.length} servers)
            </h2>
            <div className="noc-server-grid">
              {servers.map(server => (
                <div 
                  key={server.id} 
                  className={`noc-server-tile ${server.status}`}
                  title={`${server.hostname} - ${server.client_name || 'Unknown'}`}
                >
                  <div className="noc-server-status-indicator" />
                  <span className="noc-server-name">{server.hostname}</span>
                  <span className="noc-server-client">{server.client_name?.substring(0, 20) || '-'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VIEW: Reminders - Recurring Tasks & Backup Status */}
        {VIEWS[currentView] === 'reminders' && (
          <div className="noc-reminders-view" data-testid="noc-reminders-view">
            <div className="noc-reminders-grid">
              {/* Recurring Tasks */}
              <div className="noc-reminder-panel">
                <h3 className="noc-panel-title">
                  <ListTodo className="h-5 w-5" />
                  Recurring Tasks ({recurringTasks.length})
                </h3>
                <div className="noc-panel-content">
                  {recurringTasks.length === 0 ? (
                    <div className="noc-status-ok">
                      <CheckCircle className="h-6 w-6 text-emerald-400" />
                      <span>No recurring tasks pending</span>
                    </div>
                  ) : (
                    recurringTasks.slice(0, 12).map(task => (
                      <div key={task.id} className={`noc-reminder-item priority-${task.priority}`}>
                        <div className="noc-reminder-priority" />
                        <div className="noc-reminder-content">
                          <span className="noc-reminder-title">{task.title}</span>
                          <span className="noc-reminder-meta">
                            {task.recurrence_pattern} &middot; {task.status}
                            {task.client_name ? ` &middot; ${task.client_name}` : ''}
                          </span>
                        </div>
                        <span className={`noc-reminder-badge ${task.status === 'overdue' ? 'overdue' : ''}`}>
                          {task.recurrence_pattern}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Backup Status */}
              <div className="noc-reminder-panel">
                <h3 className="noc-panel-title">
                  <HardDrive className="h-5 w-5" />
                  Backup Status (This Month)
                </h3>
                <div className="noc-panel-content">
                  {backupStats ? (
                    <>
                      <div className="noc-backup-stats-grid">
                        <div className="noc-backup-stat success">
                          <CheckCircle className="h-5 w-5" />
                          <span className="noc-backup-stat-num">{backupStats.successful}</span>
                          <span className="noc-backup-stat-label">Successful</span>
                        </div>
                        <div className={`noc-backup-stat ${backupStats.failed > 0 ? 'failed' : 'ok'}`}>
                          <XCircle className="h-5 w-5" />
                          <span className="noc-backup-stat-num">{backupStats.failed}</span>
                          <span className="noc-backup-stat-label">Failed</span>
                        </div>
                        <div className="noc-backup-stat info">
                          <HardDrive className="h-5 w-5" />
                          <span className="noc-backup-stat-num">{backupStats.total_storage_gb} GB</span>
                          <span className="noc-backup-stat-label">Total Size</span>
                        </div>
                        <div className="noc-backup-stat info">
                          <Bell className="h-5 w-5" />
                          <span className="noc-backup-stat-num">{backupStats.success_rate}%</span>
                          <span className="noc-backup-stat-label">Success Rate</span>
                        </div>
                      </div>
                      {backupStats.recent_failures?.length > 0 && (
                        <div className="noc-backup-failures">
                          <h4 className="noc-backup-failures-title">Recent Failures</h4>
                          {backupStats.recent_failures.map((f, idx) => (
                            <div key={f.id || idx} className="noc-backup-failure-item">
                              <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                              <span className="noc-backup-failure-client">{f.client_name}</span>
                              <span className="noc-backup-failure-date">{f.backup_date}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {backupStats.clients_without_backups?.length > 0 && (
                        <div className="noc-backup-missing">
                          <h4 className="noc-backup-failures-title">No Backups This Month ({backupStats.clients_without_backups.length} clients)</h4>
                          <div className="noc-backup-missing-list">
                            {backupStats.clients_without_backups.slice(0, 8).map(c => (
                              <span key={c.id} className="noc-backup-missing-client">{c.name}</span>
                            ))}
                            {backupStats.clients_without_backups.length > 8 && (
                              <span className="noc-backup-missing-more">+{backupStats.clients_without_backups.length - 8} more</span>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="noc-status-ok">
                      <HardDrive className="h-6 w-6 text-muted-foreground" />
                      <span>No backup data yet</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW: Alerts */}
        {VIEWS[currentView] === 'alerts' && (
          <div className="noc-bottom-row">
            {offlineServers.length > 0 && (
              <div className="noc-panel offline-panel">
                <h3 className="noc-panel-title critical">
                  <AlertTriangle className="h-5 w-5" />
                  Offline Servers ({offlineServers.length})
                </h3>
                <div className="noc-panel-content">
                  {offlineServers.map(server => (
                    <div key={server.id} className="noc-alert-item">
                      <Server className="h-4 w-4" />
                      <span className="noc-alert-hostname">{server.hostname}</span>
                      <span className="noc-alert-client">{server.client_name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {incidents.length > 0 && (
              <div className="noc-panel incidents-panel">
                <h3 className="noc-panel-title warning">
                  <AlertTriangle className="h-5 w-5" />
                  Active Incidents ({incidents.length})
                </h3>
                <div className="noc-panel-content">
                  {incidents.slice(0, 10).map(incident => (
                    <div key={incident.id} className={`noc-incident-item severity-${incident.severity}`}>
                      <span className="noc-incident-badge">{incident.severity?.toUpperCase()}</span>
                      <span className="noc-incident-title">{incident.title}</span>
                      <span className="noc-incident-client">{incident.client_name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {offlineServers.length === 0 && incidents.length === 0 && (
              <div className="noc-all-clear">
                <CheckCircle className="h-24 w-24" />
                <span>All Systems Operational</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* View Cycle Controls */}
      <div className="noc-cycle-controls" data-testid="noc-cycle-controls">
        <button
          className="noc-cycle-btn"
          onClick={() => changeView(-1)}
          data-testid="noc-prev-view"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="noc-cycle-dots">
          {VIEWS.map((view, idx) => (
            <button
              key={view}
              className={`noc-cycle-dot ${idx === currentView ? 'active' : ''}`}
              onClick={() => { setFading(true); setTimeout(() => { setCurrentView(idx); setFading(false); }, 300); }}
              data-testid={`noc-dot-${view}`}
            >
              <span className="noc-dot-label">{VIEW_LABELS[view]}</span>
            </button>
          ))}
        </div>
        <button
          className="noc-cycle-btn"
          onClick={() => changeView(1)}
          data-testid="noc-next-view"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
        <button
          className={`noc-cycle-btn pause ${paused ? 'is-paused' : ''}`}
          onClick={() => setPaused(p => !p)}
          data-testid="noc-pause-btn"
        >
          {paused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
        </button>
        {/* Progress bar */}
        {!paused && <div className="noc-cycle-progress" key={currentView}><div className="noc-cycle-progress-bar" /></div>}
      </div>

      {/* Footer */}
      <footer className="noc-footer">
        <span>SynthOps NOC Display • Synthesis IT Ltd</span>
        <span>Auto-cycle: {paused ? 'Paused' : '15s'} • Data refresh: 30s</span>
      </footer>

      <style>{`
        .noc-display {
          min-height: 100vh;
          background: #0a0a0f;
          color: #e0e0e0;
          font-family: 'Inter', 'Segoe UI', sans-serif;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .noc-display.loading, .noc-display.error {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .noc-loading, .noc-error {
          text-align: center;
          color: #888;
        }

        .noc-loading p, .noc-error p {
          margin-top: 20px;
          font-size: 1.5rem;
        }

        .noc-error-hint {
          font-size: 1rem !important;
          color: #666;
        }

        .noc-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 15px;
          border-bottom: 1px solid #222;
        }

        .noc-logo {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 2rem;
          font-weight: 700;
          letter-spacing: 2px;
        }

        .noc-logo img {
          height: 48px;
        }

        .noc-logo-divider {
          color: #444;
          font-weight: 300;
        }

        .noc-time {
          display: flex;
          align-items: center;
          gap: 15px;
          font-size: 1.25rem;
          color: #888;
        }

        .noc-refresh-indicator {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 0.875rem;
          color: #666;
        }

        .noc-alert-banner {
          padding: 15px 30px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 15px;
          font-size: 1.5rem;
          font-weight: 700;
          letter-spacing: 1px;
          animation: pulse-bg 2s infinite;
        }

        .noc-alert-banner.critical {
          background: linear-gradient(90deg, #7f1d1d, #991b1b);
          color: #fecaca;
        }

        @keyframes pulse-bg {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }

        .noc-stats-row {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 15px;
        }

        @media (max-width: 1400px) {
          .noc-stats-row {
            grid-template-columns: repeat(3, 1fr);
          }
        }

        .noc-stat {
          background: #111118;
          border: 1px solid #222;
          border-radius: 12px;
          padding: 20px;
          display: flex;
          align-items: center;
          gap: 15px;
          transition: all 0.3s ease;
        }

        .noc-stat.online {
          border-color: #065f46;
          background: linear-gradient(135deg, #064e3b20, #11111800);
        }

        .noc-stat.online .noc-stat-icon {
          color: #10b981;
        }

        .noc-stat.offline, .noc-stat.critical {
          border-color: #7f1d1d;
          background: linear-gradient(135deg, #7f1d1d30, #11111800);
        }

        .noc-stat.offline .noc-stat-icon {
          color: #ef4444;
        }

        .noc-stat.ok {
          border-color: #065f46;
        }

        .noc-stat.ok .noc-stat-icon {
          color: #10b981;
        }

        .noc-stat.warning {
          border-color: #92400e;
          background: linear-gradient(135deg, #92400e20, #11111800);
        }

        .noc-stat.warning .noc-stat-icon {
          color: #f59e0b;
        }

        .noc-stat.maintenance .noc-stat-icon {
          color: #3b82f6;
        }

        .noc-stat.clients .noc-stat-icon {
          color: #8b5cf6;
        }

        .noc-stat-content {
          display: flex;
          flex-direction: column;
        }

        .noc-stat-number {
          font-size: 2.5rem;
          font-weight: 700;
          line-height: 1;
          font-family: 'JetBrains Mono', monospace;
        }

        .noc-stat-label {
          font-size: 0.875rem;
          color: #888;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .noc-grid-container {
          flex: 1;
          min-height: 300px;
        }

        .noc-section-title {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 1.125rem;
          margin-bottom: 15px;
          color: #aaa;
        }

        .noc-server-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
          gap: 10px;
        }

        .noc-server-tile {
          background: #111118;
          border: 1px solid #222;
          border-radius: 6px;
          padding: 10px;
          display: flex;
          flex-direction: column;
          position: relative;
          overflow: hidden;
        }

        .noc-server-tile.online {
          border-left: 3px solid #10b981;
        }

        .noc-server-tile.offline {
          border-left: 3px solid #ef4444;
          background: #1a0a0a;
          animation: offline-pulse 2s infinite;
        }

        .noc-server-tile.maintenance {
          border-left: 3px solid #3b82f6;
        }

        @keyframes offline-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }

        .noc-server-status-indicator {
          position: absolute;
          top: 5px;
          right: 5px;
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .noc-server-tile.online .noc-server-status-indicator {
          background: #10b981;
          box-shadow: 0 0 10px #10b981;
        }

        .noc-server-tile.offline .noc-server-status-indicator {
          background: #ef4444;
          box-shadow: 0 0 10px #ef4444;
          animation: blink 1s infinite;
        }

        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }

        .noc-server-name {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.8rem;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .noc-server-client {
          font-size: 0.7rem;
          color: #666;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .noc-bottom-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 15px;
          min-height: 200px;
        }

        .noc-panel {
          background: #111118;
          border: 1px solid #222;
          border-radius: 8px;
          overflow: hidden;
        }

        .noc-panel-title {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 15px;
          font-size: 1rem;
          border-bottom: 1px solid #222;
          background: #0a0a0f;
        }

        .noc-panel-title.critical {
          background: #7f1d1d;
          color: #fecaca;
        }

        .noc-panel-title.warning {
          background: #78350f;
          color: #fde68a;
        }

        .noc-panel-content {
          padding: 10px;
          max-height: 200px;
          overflow-y: auto;
        }

        .noc-alert-item, .noc-incident-item, .noc-ticket-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 10px;
          border-radius: 4px;
          margin-bottom: 5px;
          background: #0a0a0f;
        }

        .noc-alert-hostname, .noc-incident-title, .noc-ticket-title {
          flex: 1;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.85rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .noc-alert-client, .noc-incident-client, .noc-ticket-org {
          font-size: 0.75rem;
          color: #666;
        }

        .noc-incident-badge {
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 0.7rem;
          font-weight: 600;
        }

        .noc-incident-item.severity-critical .noc-incident-badge {
          background: #7f1d1d;
          color: #fecaca;
        }

        .noc-incident-item.severity-high .noc-incident-badge {
          background: #9a3412;
          color: #fed7aa;
        }

        .noc-incident-item.severity-medium .noc-incident-badge {
          background: #78350f;
          color: #fde68a;
        }

        .noc-incident-item.severity-low .noc-incident-badge {
          background: #1e3a5f;
          color: #93c5fd;
        }

        .noc-ticket-number {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.8rem;
          color: #3b82f6;
        }

        .noc-all-clear {
          grid-column: 1 / -1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 15px;
          padding: 40px;
          color: #10b981;
          font-size: 1.5rem;
          font-weight: 600;
        }

        .noc-footer {
          display: flex;
          justify-content: space-between;
          padding-top: 15px;
          border-top: 1px solid #222;
          font-size: 0.875rem;
          color: #555;
        }

        /* Cycle Content Area */
        .noc-cycle-content {
          flex: 1;
          min-height: 350px;
          transition: opacity 0.3s ease;
        }

        .noc-cycle-content.fade-out {
          opacity: 0;
        }

        .noc-cycle-content.fade-in {
          opacity: 1;
        }

        /* Cycle Controls */
        .noc-cycle-controls {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 10px 0;
          position: relative;
        }

        .noc-cycle-btn {
          background: #1a1a24;
          border: 1px solid #333;
          border-radius: 8px;
          padding: 8px;
          color: #888;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .noc-cycle-btn:hover {
          background: #252530;
          color: #ccc;
          border-color: #555;
        }

        .noc-cycle-btn.pause {
          margin-left: 8px;
        }

        .noc-cycle-btn.pause.is-paused {
          border-color: #10b981;
          color: #10b981;
        }

        .noc-cycle-dots {
          display: flex;
          gap: 6px;
        }

        .noc-cycle-dot {
          background: #1a1a24;
          border: 1px solid #333;
          border-radius: 20px;
          padding: 6px 16px;
          color: #666;
          cursor: pointer;
          transition: all 0.2s;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .noc-cycle-dot:hover {
          background: #252530;
          color: #aaa;
        }

        .noc-cycle-dot.active {
          background: #10b98120;
          border-color: #10b981;
          color: #10b981;
        }

        .noc-dot-label {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.7rem;
          font-weight: 600;
        }

        /* Progress bar */
        .noc-cycle-progress {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: #1a1a24;
          overflow: hidden;
        }

        .noc-cycle-progress-bar {
          height: 100%;
          background: linear-gradient(90deg, #10b981, #3b82f6);
          animation: progress-fill 15s linear;
        }

        @keyframes progress-fill {
          from { width: 0%; }
          to { width: 100%; }
        }

        /* Security Alerts Panel */
        .noc-alert-panel {
          background: #0d0d12;
          border: 2px solid #333;
          border-radius: 8px;
          padding: 15px;
          margin-bottom: 20px;
        }

        .noc-alert-panel.critical {
          border-color: #dc2626;
          background: linear-gradient(180deg, #1a0505 0%, #0d0d12 100%);
        }

        .noc-alert-panel.high {
          border-color: #ea580c;
          background: linear-gradient(180deg, #1a0f05 0%, #0d0d12 100%);
        }

        .noc-alert-panel.warning {
          border-color: #ca8a04;
          background: linear-gradient(180deg, #1a1505 0%, #0d0d12 100%);
        }

        .noc-alert-title {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 1.1rem;
          font-weight: 600;
          margin-bottom: 15px;
          color: #f87171;
        }

        .noc-alert-list {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
          gap: 10px;
        }

        .noc-alert-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 15px;
          background: #0a0a0f;
          border-radius: 6px;
          border-left: 3px solid #666;
        }

        .noc-alert-item.critical {
          border-left-color: #dc2626;
        }

        .noc-alert-item.high {
          border-left-color: #ea580c;
        }

        .noc-alert-item.medium {
          border-left-color: #ca8a04;
        }

        .noc-alert-type {
          font-size: 0.7rem;
          font-weight: 600;
          padding: 2px 6px;
          border-radius: 3px;
          background: #333;
          color: #999;
          text-transform: uppercase;
        }

        .noc-alert-title-text {
          flex: 1;
          font-size: 0.9rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .noc-alert-endpoint {
          font-size: 0.8rem;
          color: #666;
          font-family: 'JetBrains Mono', monospace;
        }

        .noc-alert-panel.ok {
          border-color: #10b981;
          background: linear-gradient(180deg, #051a10 0%, #0d0d12 100%);
        }

        .noc-alert-panel.ok .noc-alert-title {
          color: #10b981;
        }

        .noc-status-ok {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 20px;
          color: #10b981;
          font-size: 1.1rem;
        }

        /* Bitdefender Agent Stats */
        .noc-bd-stats {
          margin-top: 15px;
          padding-top: 15px;
          border-top: 1px solid #222;
        }

        .noc-bd-stats-row {
          display: flex;
          gap: 30px;
          margin-bottom: 12px;
        }

        .noc-bd-stat {
          display: flex;
          flex-direction: column;
        }

        .noc-bd-stat-value {
          font-size: 1.5rem;
          font-weight: 700;
          font-family: 'JetBrains Mono', monospace;
          color: #10b981;
        }

        .noc-bd-stat-label {
          font-size: 0.75rem;
          color: #888;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .noc-bd-companies {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 6px;
        }

        .noc-bd-company {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 4px 8px;
          font-size: 0.8rem;
          color: #aaa;
          background: #0a0a0f;
          border-radius: 4px;
        }

        .noc-bd-company-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .noc-bd-company-dot.active {
          background: #10b981;
        }

        .noc-bd-company-dot.suspended {
          background: #f59e0b;
        }

        .noc-bd-company-name {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .noc-bd-company-count {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.7rem;
          color: #666;
          flex-shrink: 0;
        }

        /* Client Grid */
        .noc-client-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 8px;
        }

        .noc-client-tile {
          background: #111118;
          border: 1px solid #222;
          border-radius: 6px;
          padding: 10px 12px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          border-left: 3px solid #8b5cf6;
        }

        .noc-client-name {
          font-size: 0.85rem;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .noc-client-counts {
          display: flex;
          gap: 12px;
        }

        .noc-client-count-item {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 0.7rem;
          color: #888;
          font-family: 'JetBrains Mono', monospace;
        }

        /* Workstation tile differentiation - removed, servers only on NOC */

        /* Reminders View */
        .noc-reminders-view {
          height: 100%;
        }

        .noc-reminders-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          height: 100%;
        }

        @media (max-width: 1200px) {
          .noc-reminders-grid {
            grid-template-columns: 1fr;
          }
        }

        .noc-reminder-panel {
          background: #0a0a10;
          border: 1px solid #222;
          border-radius: 8px;
          overflow: hidden;
        }

        .noc-reminder-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 12px;
          border-bottom: 1px solid #1a1a24;
        }

        .noc-reminder-priority {
          width: 4px;
          height: 28px;
          border-radius: 2px;
          flex-shrink: 0;
        }

        .noc-reminder-item.priority-high .noc-reminder-priority,
        .noc-reminder-item.priority-critical .noc-reminder-priority {
          background: #ef4444;
        }

        .noc-reminder-item.priority-medium .noc-reminder-priority {
          background: #f59e0b;
        }

        .noc-reminder-item.priority-low .noc-reminder-priority {
          background: #3b82f6;
        }

        .noc-reminder-content {
          flex: 1;
          min-width: 0;
        }

        .noc-reminder-title {
          display: block;
          font-size: 0.85rem;
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .noc-reminder-meta {
          display: block;
          font-size: 0.7rem;
          color: #666;
        }

        .noc-reminder-badge {
          font-size: 0.65rem;
          padding: 2px 8px;
          border-radius: 10px;
          background: #1a1a24;
          color: #888;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          flex-shrink: 0;
          font-family: 'JetBrains Mono', monospace;
        }

        .noc-reminder-badge.overdue {
          background: #ef444420;
          color: #ef4444;
        }

        /* Backup Stats on NOC */
        .noc-backup-stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
          padding: 12px;
        }

        .noc-backup-stat {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          padding: 12px 8px;
          background: #111118;
          border-radius: 6px;
        }

        .noc-backup-stat.success { color: #10b981; }
        .noc-backup-stat.failed { color: #ef4444; }
        .noc-backup-stat.ok { color: #666; }
        .noc-backup-stat.info { color: #3b82f6; }

        .noc-backup-stat-num {
          font-size: 1.3rem;
          font-weight: 700;
          font-family: 'JetBrains Mono', monospace;
        }

        .noc-backup-stat-label {
          font-size: 0.65rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #888;
        }

        .noc-backup-failures {
          padding: 8px 12px;
          border-top: 1px solid #222;
        }

        .noc-backup-failures-title {
          font-size: 0.75rem;
          color: #888;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 6px;
        }

        .noc-backup-failure-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 4px 0;
          font-size: 0.8rem;
        }

        .noc-backup-failure-client {
          flex: 1;
        }

        .noc-backup-failure-date {
          color: #666;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.7rem;
        }

        .noc-backup-missing {
          padding: 8px 12px;
          border-top: 1px solid #222;
        }

        .noc-backup-missing-list {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
        }

        .noc-backup-missing-client {
          font-size: 0.7rem;
          padding: 2px 8px;
          background: #f59e0b15;
          border: 1px solid #f59e0b30;
          border-radius: 4px;
          color: #f59e0b;
        }

        .noc-backup-missing-more {
          font-size: 0.7rem;
          padding: 2px 8px;
          color: #666;
        }
      `}</style>
    </div>
  );
}
