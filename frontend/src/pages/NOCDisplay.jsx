import React, { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../App';
import { Server, Ticket, AlertTriangle, CheckCircle, Activity, Clock, Users, RefreshCw } from 'lucide-react';

export default function NOCDisplay() {
  const [stats, setStats] = useState(null);
  const [servers, setServers] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      // Attempt to get auth token from localStorage
      const token = localStorage.getItem('token');
      if (token) {
        apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }
      
      const [statsRes, serversRes, incidentsRes] = await Promise.all([
        apiClient.get('/dashboard/stats'),
        apiClient.get('/servers'),
        apiClient.get('/incidents?status=open')
      ]);
      
      setStats(statsRes.data);
      setServers(serversRes.data || []);
      setIncidents(incidentsRes.data || []);
      setLastRefresh(new Date());
      setError(null);
      
      // Try to get Zammad tickets (may fail if not configured)
      try {
        const ticketsRes = await apiClient.get('/zammad/tickets?limit=50');
        setTickets(ticketsRes.data?.filter(t => t.state !== 'closed') || []);
      } catch (e) {
        // Zammad not configured, ignore
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

  // Get offline servers
  const offlineServers = servers.filter(s => s.status === 'offline');
  const onlineServers = servers.filter(s => s.status === 'online');
  const maintenanceServers = servers.filter(s => s.status === 'maintenance');

  // Open tickets count
  const openTickets = tickets.filter(t => 
    t.state === 'new' || t.state === 'open' || t.state?.includes('pending')
  );

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
          <div className="noc-logo-icon">S</div>
          <span>SYNTHOPS NOC</span>
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
        
        <div className={`noc-stat ${openTickets.length > 10 ? 'warning' : 'ok'}`}>
          <div className="noc-stat-icon">
            <Ticket className="h-12 w-12" />
          </div>
          <div className="noc-stat-content">
            <span className="noc-stat-number">{openTickets.length}</span>
            <span className="noc-stat-label">Open Tickets</span>
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
            <span className="noc-stat-number">{stats?.total_clients || 0}</span>
            <span className="noc-stat-label">Clients</span>
          </div>
        </div>
      </div>

      {/* Server Grid */}
      <div className="noc-grid-container">
        <h2 className="noc-section-title">
          <Server className="h-6 w-6" />
          Server Status ({servers.length} devices)
        </h2>
        <div className="noc-server-grid">
          {servers.slice(0, 50).map(server => (
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

      {/* Alerts & Tickets Row */}
      <div className="noc-bottom-row">
        {/* Offline Servers List */}
        {offlineServers.length > 0 && (
          <div className="noc-panel offline-panel">
            <h3 className="noc-panel-title critical">
              <AlertTriangle className="h-5 w-5" />
              Offline Servers
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

        {/* Active Incidents */}
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

        {/* Recent Tickets */}
        {openTickets.length > 0 && (
          <div className="noc-panel tickets-panel">
            <h3 className="noc-panel-title">
              <Ticket className="h-5 w-5" />
              Open Tickets ({openTickets.length})
            </h3>
            <div className="noc-panel-content">
              {openTickets.slice(0, 10).map(ticket => (
                <div key={ticket.id} className="noc-ticket-item">
                  <span className="noc-ticket-number">#{ticket.number}</span>
                  <span className="noc-ticket-title">{ticket.title?.substring(0, 40)}</span>
                  <span className="noc-ticket-org">{ticket.organization?.substring(0, 20)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* All Clear Message */}
        {offlineServers.length === 0 && incidents.length === 0 && (
          <div className="noc-all-clear">
            <CheckCircle className="h-24 w-24" />
            <span>All Systems Operational</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="noc-footer">
        <span>SynthOps NOC Display • Synthesis IT Ltd</span>
        <span>Auto-refresh: 30 seconds</span>
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

        .noc-logo-icon {
          width: 50px;
          height: 50px;
          background: linear-gradient(135deg, #3b82f6, #1d4ed8);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          color: white;
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

        @media (max-width: 1200px) {
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
      `}</style>
    </div>
  );
}
