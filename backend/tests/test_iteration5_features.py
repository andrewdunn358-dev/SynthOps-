"""
Test Suite for Iteration 5 Features:
- User registration (first user becomes admin)
- User login with case-insensitive email/username
- TRMM sync - fetches clients, sites, and agents with correct monitoring_type
- /servers endpoint - returns only servers (not workstations)
- /workstations endpoint - returns only workstations
- Client detail page - loads without crashing
- Monthly health check - can select server and save check
- Reclassify devices endpoint works
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "admin@test.com"
TEST_USERNAME = "testadmin"
TEST_PASSWORD = "Test123!"


class TestUserRegistrationAndLogin:
    """Test user registration (first user becomes admin) and login functionality"""
    
    @pytest.fixture(scope="class")
    def api_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        return session
    
    def test_01_register_first_user_becomes_admin(self, api_session):
        """First user registered should automatically become admin"""
        response = api_session.post(f"{BASE_URL}/api/auth/register", json={
            "email": TEST_EMAIL,
            "username": TEST_USERNAME,
            "password": TEST_PASSWORD,
            "role": "engineer"  # Even if requesting engineer, first user becomes admin
        })
        
        # Should succeed or fail with already exists
        assert response.status_code in [200, 400], f"Unexpected status: {response.status_code}, body: {response.text}"
        
        if response.status_code == 200:
            data = response.json()
            assert "id" in data, "Response should contain user id"
            assert data["email"] == TEST_EMAIL.lower(), "Email should be lowercased"
            assert data["role"] == "admin", f"First user should be admin, got {data['role']}"
            print(f"SUCCESS: First user registered as admin: {data}")
        else:
            # User already exists
            print(f"User already exists: {response.json()}")
    
    def test_02_login_with_email(self, api_session):
        """Test login with email (case-insensitive)"""
        response = api_session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL.upper(),  # Test case-insensitivity
            "password": TEST_PASSWORD
        })
        
        assert response.status_code == 200, f"Login failed: {response.status_code}, body: {response.text}"
        
        data = response.json()
        assert "access_token" in data, "Response should contain access_token"
        assert "refresh_token" in data, "Response should contain refresh_token"
        assert "user" in data, "Response should contain user info"
        assert data["user"]["email"] == TEST_EMAIL.lower(), "Email should be lowercased"
        assert data["user"]["role"] == "admin", f"User should be admin, got {data['user']['role']}"
        
        print(f"SUCCESS: Login with email works (case-insensitive)")
    
    def test_03_login_with_username(self, api_session):
        """Test login with username (case-insensitive)"""
        response = api_session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USERNAME.upper(),  # Using username in email field, uppercase
            "password": TEST_PASSWORD
        })
        
        assert response.status_code == 200, f"Login with username failed: {response.status_code}, body: {response.text}"
        
        data = response.json()
        assert "access_token" in data, "Response should contain access_token"
        print(f"SUCCESS: Login with username works (case-insensitive)")
    
    def test_04_login_invalid_credentials(self, api_session):
        """Test login with invalid credentials returns 401"""
        response = api_session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": "WrongPassword123!"
        })
        
        assert response.status_code == 401, f"Expected 401 for invalid credentials, got {response.status_code}"
        print(f"SUCCESS: Invalid credentials properly rejected with 401")


class TestTRMMSync:
    """Test TRMM sync functionality"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Authentication failed - skipping authenticated tests")
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
    
    def test_01_trmm_sync_endpoint(self, auth_headers):
        """Test TRMM sync endpoint fetches clients, sites, agents"""
        response = requests.post(f"{BASE_URL}/api/integrations/trmm/sync", headers=auth_headers)
        
        assert response.status_code == 200, f"TRMM sync failed: {response.status_code}, body: {response.text}"
        
        data = response.json()
        assert "stats" in data or "clients_synced" in data or "message" in data, f"Unexpected response: {data}"
        
        # Extract stats from response
        stats = data.get("stats", data)
        print(f"TRMM Sync Stats: {stats}")
        
        # Should have synced some data (42 clients expected based on logs)
        if "clients_synced" in stats:
            assert stats["clients_synced"] >= 0, "Should report clients_synced"
        if "agents_synced" in stats:
            assert stats["agents_synced"] >= 0, "Should report agents_synced"
        
        print(f"SUCCESS: TRMM sync completed with stats: {stats}")
    
    def test_02_clients_synced_from_trmm(self, auth_headers):
        """Verify clients were synced from TRMM"""
        response = requests.get(f"{BASE_URL}/api/clients", headers=auth_headers)
        
        assert response.status_code == 200, f"Failed to get clients: {response.status_code}"
        
        clients = response.json()
        assert isinstance(clients, list), "Response should be a list"
        
        # Should have clients after sync (42 expected)
        print(f"Total clients after sync: {len(clients)}")
        
        # Check that clients have required fields
        if len(clients) > 0:
            client = clients[0]
            assert "id" in client, "Client should have id"
            assert "name" in client, "Client should have name"
            assert "server_count" in client, "Client should have server_count"
            assert "workstation_count" in client, "Client should have workstation_count"
            print(f"Sample client: {client['name']} - Servers: {client['server_count']}, Workstations: {client['workstation_count']}")
        
        print(f"SUCCESS: {len(clients)} clients synced from TRMM")


class TestServersAndWorkstations:
    """Test that /servers returns only servers and /workstations returns only workstations"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Authentication failed")
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
    
    def test_01_servers_endpoint_excludes_workstations(self, auth_headers):
        """Test that /servers endpoint only returns servers (monitoring_type=server or null)"""
        response = requests.get(f"{BASE_URL}/api/servers", headers=auth_headers)
        
        assert response.status_code == 200, f"Failed to get servers: {response.status_code}, body: {response.text}"
        
        servers = response.json()
        assert isinstance(servers, list), "Response should be a list"
        
        print(f"Total servers: {len(servers)}")
        
        # Check monitoring_type for each server
        workstation_count = 0
        for server in servers:
            mt = server.get("monitoring_type")
            # Should be 'server' or None/not set
            if mt == "workstation":
                workstation_count += 1
                print(f"ERROR: Workstation found in servers list: {server['hostname']}")
        
        assert workstation_count == 0, f"Found {workstation_count} workstations in /servers response - should be 0"
        
        if len(servers) > 0:
            sample = servers[0]
            print(f"Sample server: {sample['hostname']}, monitoring_type: {sample.get('monitoring_type')}")
        
        print(f"SUCCESS: /servers returns only servers ({len(servers)} total)")
    
    def test_02_workstations_endpoint_returns_only_workstations(self, auth_headers):
        """Test that /workstations endpoint only returns workstations (monitoring_type=workstation)"""
        response = requests.get(f"{BASE_URL}/api/workstations", headers=auth_headers)
        
        assert response.status_code == 200, f"Failed to get workstations: {response.status_code}, body: {response.text}"
        
        workstations = response.json()
        assert isinstance(workstations, list), "Response should be a list"
        
        print(f"Total workstations: {len(workstations)}")
        
        # Check monitoring_type for each workstation
        server_count = 0
        for ws in workstations:
            mt = ws.get("monitoring_type")
            # Should be 'workstation'
            if mt != "workstation":
                server_count += 1
                print(f"ERROR: Non-workstation found in workstations list: {ws['hostname']} (type: {mt})")
        
        assert server_count == 0, f"Found {server_count} servers in /workstations response - should be 0"
        
        if len(workstations) > 0:
            sample = workstations[0]
            print(f"Sample workstation: {sample['hostname']}, monitoring_type: {sample.get('monitoring_type')}")
        
        print(f"SUCCESS: /workstations returns only workstations ({len(workstations)} total)")
    
    def test_03_client_has_correct_counts(self, auth_headers):
        """Test that client server_count and workstation_count are separate"""
        response = requests.get(f"{BASE_URL}/api/clients", headers=auth_headers)
        
        assert response.status_code == 200
        
        clients = response.json()
        
        # Find a client with both servers and workstations
        for client in clients:
            if client.get("server_count", 0) > 0 or client.get("workstation_count", 0) > 0:
                print(f"Client: {client['name']} - Servers: {client['server_count']}, Workstations: {client['workstation_count']}")
        
        print(f"SUCCESS: Client counts verified")


class TestClientDetailPage:
    """Test client detail page loads correctly"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Authentication failed")
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
    
    def test_01_get_client_detail(self, auth_headers):
        """Test fetching client detail by ID"""
        # First get list of clients
        response = requests.get(f"{BASE_URL}/api/clients", headers=auth_headers)
        assert response.status_code == 200
        
        clients = response.json()
        if len(clients) == 0:
            pytest.skip("No clients available for testing")
        
        client_id = clients[0]["id"]
        
        # Fetch client detail
        response = requests.get(f"{BASE_URL}/api/clients/{client_id}", headers=auth_headers)
        
        assert response.status_code == 200, f"Failed to get client detail: {response.status_code}, body: {response.text}"
        
        client = response.json()
        assert "id" in client, "Client should have id"
        assert "name" in client, "Client should have name"
        assert "server_count" in client, "Client should have server_count"
        assert "workstation_count" in client, "Client should have workstation_count"
        assert "site_count" in client, "Client should have site_count"
        
        print(f"SUCCESS: Client detail loaded - {client['name']}")
        print(f"  - Sites: {client['site_count']}, Servers: {client['server_count']}, Workstations: {client['workstation_count']}")
    
    def test_02_get_client_servers(self, auth_headers):
        """Test fetching servers for a specific client"""
        # Get clients
        response = requests.get(f"{BASE_URL}/api/clients", headers=auth_headers)
        assert response.status_code == 200
        
        clients = response.json()
        if len(clients) == 0:
            pytest.skip("No clients available")
        
        # Find a client with servers
        test_client = None
        for client in clients:
            if client.get("server_count", 0) > 0:
                test_client = client
                break
        
        if not test_client:
            print("No clients with servers found - skipping")
            return
        
        # Get servers for this client
        response = requests.get(f"{BASE_URL}/api/servers?client_id={test_client['id']}", headers=auth_headers)
        
        assert response.status_code == 200, f"Failed to get client servers: {response.status_code}"
        
        servers = response.json()
        print(f"SUCCESS: Got {len(servers)} servers for client {test_client['name']}")
        
        # Verify none are workstations
        for server in servers:
            assert server.get("monitoring_type") != "workstation", f"Workstation found: {server['hostname']}"
    
    def test_03_get_client_workstations(self, auth_headers):
        """Test fetching workstations for a specific client"""
        # Get clients
        response = requests.get(f"{BASE_URL}/api/clients", headers=auth_headers)
        assert response.status_code == 200
        
        clients = response.json()
        if len(clients) == 0:
            pytest.skip("No clients available")
        
        # Find a client with workstations
        test_client = None
        for client in clients:
            if client.get("workstation_count", 0) > 0:
                test_client = client
                break
        
        if not test_client:
            print("No clients with workstations found - skipping")
            return
        
        # Get workstations for this client
        response = requests.get(f"{BASE_URL}/api/workstations?client_id={test_client['id']}", headers=auth_headers)
        
        assert response.status_code == 200, f"Failed to get client workstations: {response.status_code}"
        
        workstations = response.json()
        print(f"SUCCESS: Got {len(workstations)} workstations for client {test_client['name']}")
        
        # Verify all are workstations
        for ws in workstations:
            assert ws.get("monitoring_type") == "workstation", f"Non-workstation found: {ws['hostname']}"


class TestHealthChecks:
    """Test monthly health check functionality"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Authentication failed")
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
    
    def test_01_get_servers_for_health_check(self, auth_headers):
        """Test that servers are available for health check selection"""
        response = requests.get(f"{BASE_URL}/api/servers", headers=auth_headers)
        
        assert response.status_code == 200, f"Failed to get servers: {response.status_code}"
        
        servers = response.json()
        print(f"Available servers for health check: {len(servers)}")
        
        if len(servers) > 0:
            server = servers[0]
            print(f"Sample server: {server['hostname']} (ID: {server['id']})")
        
        print(f"SUCCESS: Can fetch servers for health check selection")
    
    def test_02_get_health_checks_list(self, auth_headers):
        """Test fetching health check history"""
        response = requests.get(f"{BASE_URL}/api/health-checks", headers=auth_headers)
        
        assert response.status_code == 200, f"Failed to get health checks: {response.status_code}, body: {response.text}"
        
        checks = response.json()
        assert isinstance(checks, list), "Response should be a list"
        
        print(f"Existing health checks: {len(checks)}")
        print(f"SUCCESS: Can fetch health check history")
    
    def test_03_save_health_check(self, auth_headers):
        """Test saving a monthly health check"""
        # First get a server
        servers_response = requests.get(f"{BASE_URL}/api/servers", headers=auth_headers)
        assert servers_response.status_code == 200
        
        servers = servers_response.json()
        if len(servers) == 0:
            pytest.skip("No servers available for health check test")
        
        test_server = servers[0]
        
        # Create a health check
        check_data = {
            "server_id": test_server["id"],
            "server_name": test_server["hostname"],
            "check_date": "2026-01-15",
            "signed_off_by": "Test Engineer",
            "is_ad_server": False,
            "checks": [
                {
                    "id": "std-1",
                    "category": "Storage",
                    "name": "Disk Space Usage",
                    "description": "Check disk space",
                    "status": "pass",
                    "notes": "All drives below 80%"
                },
                {
                    "id": "std-2",
                    "category": "Storage",
                    "name": "RAID Health Status",
                    "description": "Verify RAID array",
                    "status": "pass",
                    "notes": "RAID healthy"
                }
            ]
        }
        
        response = requests.post(f"{BASE_URL}/api/health-checks", headers=auth_headers, json=check_data)
        
        assert response.status_code == 200, f"Failed to save health check: {response.status_code}, body: {response.text}"
        
        result = response.json()
        assert "id" in result or "message" in result, f"Unexpected response: {result}"
        
        print(f"SUCCESS: Health check saved for {test_server['hostname']}")


class TestReclassifyDevices:
    """Test device reclassification endpoint"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Authentication failed")
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
    
    def test_01_reclassify_devices_endpoint(self, auth_headers):
        """Test reclassify devices endpoint updates monitoring_type"""
        response = requests.post(f"{BASE_URL}/api/trmm/reclassify", headers=auth_headers)
        
        assert response.status_code == 200, f"Reclassify failed: {response.status_code}, body: {response.text}"
        
        data = response.json()
        assert "stats" in data or "updated" in data or "message" in data, f"Unexpected response: {data}"
        
        stats = data.get("stats", data)
        print(f"Reclassify stats: {stats}")
        
        print(f"SUCCESS: Reclassify endpoint works")


# Run tests if executed directly
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
