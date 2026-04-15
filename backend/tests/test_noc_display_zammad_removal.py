"""
Test NOC Display features and Zammad removal
- NOC Display shows all clients including TRMM-imported ones
- NOC Display shows Bitdefender agent count in security panel
- NOC Display shows all devices (servers + workstations)
- Zammad endpoints removed (should return 404)
- /api/sync/status works and does NOT contain zammad key
- /api/sync/trigger/trmm works
- /api/sync/trigger/zammad returns 400 error
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuth:
    """Get auth token for testing"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Login and get JWT token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@test.com",
            "password": "Test123!"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Return headers with auth token"""
        return {"Authorization": f"Bearer {auth_token}"}


class TestNOCDisplayData(TestAuth):
    """Test NOC Display data endpoints"""
    
    def test_clients_endpoint_returns_all_clients(self, auth_headers):
        """Test /api/clients returns all clients including TRMM-imported ones"""
        response = requests.get(f"{BASE_URL}/api/clients", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get clients: {response.text}"
        
        clients = response.json()
        assert isinstance(clients, list), "Clients should be a list"
        
        # Should have 42 clients as per requirements
        print(f"Total clients: {len(clients)}")
        assert len(clients) >= 40, f"Expected at least 40 clients, got {len(clients)}"
        
        # Verify client structure
        if clients:
            client = clients[0]
            assert "id" in client, "Client should have id"
            assert "name" in client, "Client should have name"
            assert "server_count" in client, "Client should have server_count"
            assert "workstation_count" in client, "Client should have workstation_count"
    
    def test_servers_endpoint_with_workstations(self, auth_headers):
        """Test /api/servers?include_workstations=true returns all devices"""
        response = requests.get(
            f"{BASE_URL}/api/servers", 
            params={"include_workstations": "true"},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to get servers: {response.text}"
        
        servers = response.json()
        assert isinstance(servers, list), "Servers should be a list"
        
        # Should have 528 devices as per requirements
        print(f"Total devices (servers + workstations): {len(servers)}")
        assert len(servers) >= 500, f"Expected at least 500 devices, got {len(servers)}"
        
        # Count servers vs workstations
        actual_servers = [s for s in servers if s.get("monitoring_type") != "workstation"]
        workstations = [s for s in servers if s.get("monitoring_type") == "workstation"]
        print(f"Servers: {len(actual_servers)}, Workstations: {len(workstations)}")
    
    def test_bitdefender_alerts_endpoint(self, auth_headers):
        """Test /api/bitdefender/alerts returns endpoint count and company count"""
        response = requests.get(f"{BASE_URL}/api/bitdefender/alerts", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get Bitdefender alerts: {response.text}"
        
        data = response.json()
        
        # Verify structure
        assert "endpoint_count" in data, "Should have endpoint_count"
        assert "company_count" in data, "Should have company_count"
        assert "total" in data, "Should have total alerts count"
        assert "alerts" in data, "Should have alerts list"
        
        print(f"Bitdefender - Endpoints: {data['endpoint_count']}, Companies: {data['company_count']}")
        
        # Should have 398 endpoints and 44 companies as per requirements
        assert data["endpoint_count"] >= 300, f"Expected at least 300 endpoints, got {data['endpoint_count']}"
        assert data["company_count"] >= 40, f"Expected at least 40 companies, got {data['company_count']}"
        
        # Check companies array if present
        if "companies" in data:
            assert isinstance(data["companies"], list), "Companies should be a list"
            print(f"Companies list has {len(data['companies'])} entries")
    
    def test_dashboard_stats_endpoint(self, auth_headers):
        """Test /api/dashboard/stats returns correct counts"""
        response = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get dashboard stats: {response.text}"
        
        stats = response.json()
        
        # Verify structure
        assert "total_clients" in stats, "Should have total_clients"
        assert "total_servers" in stats, "Should have total_servers"
        
        print(f"Dashboard stats - Clients: {stats['total_clients']}, Servers: {stats['total_servers']}")
        
        # Should have 42 clients
        assert stats["total_clients"] >= 40, f"Expected at least 40 clients, got {stats['total_clients']}"
    
    def test_incidents_endpoint(self, auth_headers):
        """Test /api/incidents?status=open for NOC display"""
        response = requests.get(
            f"{BASE_URL}/api/incidents",
            params={"status": "open"},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to get incidents: {response.text}"
        
        incidents = response.json()
        assert isinstance(incidents, list), "Incidents should be a list"
        print(f"Open incidents: {len(incidents)}")


class TestZammadRemoval(TestAuth):
    """Test that Zammad endpoints have been removed"""
    
    def test_zammad_test_endpoint_removed(self, auth_headers):
        """Test /api/zammad/test returns 404 (endpoint removed)"""
        response = requests.get(f"{BASE_URL}/api/zammad/test", headers=auth_headers)
        # Should return 404 since endpoint is removed
        assert response.status_code == 404, f"Expected 404 for removed Zammad endpoint, got {response.status_code}"
        print("✓ /api/zammad/test correctly returns 404")
    
    def test_zammad_tickets_endpoint_removed(self, auth_headers):
        """Test /api/zammad/tickets returns 404 (endpoint removed)"""
        response = requests.get(f"{BASE_URL}/api/zammad/tickets", headers=auth_headers)
        # Should return 404 since endpoint is removed
        assert response.status_code == 404, f"Expected 404 for removed Zammad endpoint, got {response.status_code}"
        print("✓ /api/zammad/tickets correctly returns 404")
    
    def test_zammad_stats_endpoint_removed(self, auth_headers):
        """Test /api/zammad/stats returns 404 (endpoint removed)"""
        response = requests.get(f"{BASE_URL}/api/zammad/stats", headers=auth_headers)
        # Should return 404 since endpoint is removed
        assert response.status_code == 404, f"Expected 404 for removed Zammad endpoint, got {response.status_code}"
        print("✓ /api/zammad/stats correctly returns 404")


class TestSyncEndpoints(TestAuth):
    """Test sync status and trigger endpoints"""
    
    def test_sync_status_no_zammad(self, auth_headers):
        """Test /api/sync/status works and does NOT contain zammad key"""
        response = requests.get(f"{BASE_URL}/api/sync/status", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get sync status: {response.text}"
        
        data = response.json()
        
        # Should have trmm key
        assert "trmm" in data, "Sync status should have trmm key"
        
        # Should NOT have zammad key
        assert "zammad" not in data, "Sync status should NOT have zammad key (removed)"
        
        print(f"Sync status keys: {list(data.keys())}")
        print("✓ /api/sync/status does not contain zammad key")
    
    def test_sync_trigger_trmm_works(self, auth_headers):
        """Test /api/sync/trigger/trmm works"""
        response = requests.post(f"{BASE_URL}/api/sync/trigger/trmm", headers=auth_headers)
        assert response.status_code == 200, f"Failed to trigger TRMM sync: {response.text}"
        
        data = response.json()
        assert "message" in data, "Should have message"
        print(f"TRMM sync trigger response: {data['message']}")
    
    def test_sync_trigger_zammad_returns_400(self, auth_headers):
        """Test /api/sync/trigger/zammad returns 400 error"""
        response = requests.post(f"{BASE_URL}/api/sync/trigger/zammad", headers=auth_headers)
        # Should return 400 since zammad is not a valid sync type anymore
        assert response.status_code == 400, f"Expected 400 for invalid sync type, got {response.status_code}"
        
        data = response.json()
        assert "detail" in data, "Should have error detail"
        print(f"✓ /api/sync/trigger/zammad correctly returns 400: {data.get('detail')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
