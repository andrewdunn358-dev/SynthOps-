"""
Test suite for Export endpoints and TRMM integration
Tests: CSV exports (timesheet, clients, servers, incidents), TRMM agent details/software
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "admin@synthesis-it.co.uk"
TEST_PASSWORD = "Admin123!"

# Sample IDs from TRMM-synced data
SAMPLE_TRMM_AGENT_ID = "RYDbjhWrgoQANIdGdWVeKHYJpwZidUfNZdOBnGOM"
SAMPLE_SERVER_ID = "c12fa3fb-88f1-415f-ad9f-cd0296d05909"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for tests"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json()["access_token"]


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Returns headers with authorization"""
    return {"Authorization": f"Bearer {auth_token}"}


class TestTRMMIntegration:
    """Tests for TRMM (Tactical RMM) API integration"""

    def test_trmm_agent_details_endpoint(self, auth_headers):
        """Test TRMM agent details endpoint returns valid data"""
        response = requests.get(
            f"{BASE_URL}/api/integrations/trmm/agent/{SAMPLE_TRMM_AGENT_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"TRMM agent details failed: {response.text}"
        
        data = response.json()
        # Verify key fields from TRMM response
        assert "status" in data, "Missing 'status' field in TRMM response"
        assert "cpu_model" in data, "Missing 'cpu_model' field in TRMM response"
        assert "local_ips" in data, "Missing 'local_ips' field in TRMM response"
        assert "checks" in data, "Missing 'checks' field in TRMM response"
        
        # Verify checks summary structure
        checks = data.get("checks", {})
        assert "total" in checks, "Missing 'total' in checks"
        assert "passing" in checks, "Missing 'passing' in checks"
        assert "failing" in checks, "Missing 'failing' in checks"
        print(f"TRMM Agent Status: {data.get('status')}, CPU: {data.get('cpu_model', ['Unknown'])[0][:50]}")

    def test_trmm_agent_software_endpoint(self, auth_headers):
        """Test TRMM agent software endpoint returns software list"""
        response = requests.get(
            f"{BASE_URL}/api/integrations/trmm/agent/{SAMPLE_TRMM_AGENT_ID}/software",
            headers=auth_headers
        )
        assert response.status_code == 200, f"TRMM software failed: {response.text}"
        
        data = response.json()
        assert "software" in data, "Missing 'software' field in response"
        
        software_list = data.get("software", [])
        assert isinstance(software_list, list), "Software should be a list"
        
        if len(software_list) > 0:
            # Check first software item structure
            first_software = software_list[0]
            assert "name" in first_software, "Software item missing 'name'"
            print(f"Found {len(software_list)} installed software items")
            print(f"First software: {first_software.get('name', 'Unknown')[:60]}")
        else:
            print("No software installed on this agent")

    def test_trmm_agent_invalid_id(self, auth_headers):
        """Test TRMM endpoint with invalid agent ID returns appropriate error"""
        response = requests.get(
            f"{BASE_URL}/api/integrations/trmm/agent/INVALID_AGENT_ID_12345",
            headers=auth_headers
        )
        # Should return 404 or error status
        assert response.status_code in [404, 500], f"Expected 404/500 for invalid agent, got {response.status_code}"
        print(f"Invalid agent ID correctly handled with status {response.status_code}")


class TestServerWithTRMM:
    """Test server endpoints with TRMM integration"""

    def test_get_server_with_trmm_agent_id(self, auth_headers):
        """Test server detail includes TRMM agent ID"""
        response = requests.get(
            f"{BASE_URL}/api/servers/{SAMPLE_SERVER_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Get server failed: {response.text}"
        
        data = response.json()
        assert data.get("id") == SAMPLE_SERVER_ID, "Server ID mismatch"
        assert data.get("tactical_rmm_agent_id") == SAMPLE_TRMM_AGENT_ID, "TRMM agent ID not set correctly"
        
        print(f"Server: {data.get('hostname')}")
        print(f"TRMM Agent ID: {data.get('tactical_rmm_agent_id')}")
        print(f"Status: {data.get('status')}")


class TestExportEndpoints:
    """Tests for CSV export endpoints"""

    def test_export_timesheet_csv(self, auth_headers):
        """Test timesheet CSV export returns valid CSV data"""
        response = requests.get(
            f"{BASE_URL}/api/export/timesheet",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Export timesheet failed: {response.text}"
        
        # Check content type
        content_type = response.headers.get("content-type", "")
        assert "text/csv" in content_type, f"Expected text/csv, got {content_type}"
        
        # Verify Content-Disposition header for download
        content_disp = response.headers.get("content-disposition", "")
        assert "attachment" in content_disp, "Missing attachment header"
        assert "timesheet" in content_disp, "Filename should contain 'timesheet'"
        
        # Verify CSV structure
        csv_content = response.text
        lines = csv_content.strip().split("\n")
        assert len(lines) >= 1, "CSV should have at least header row"
        
        header = lines[0]
        assert "Date" in header, "Missing 'Date' column"
        assert "Duration" in header, "Missing 'Duration' column"
        assert "Billable" in header, "Missing 'Billable' column"
        
        print(f"Timesheet export: {len(lines)} rows")
        print(f"Header: {header}")

    def test_export_clients_csv(self, auth_headers):
        """Test clients CSV export returns valid CSV data"""
        response = requests.get(
            f"{BASE_URL}/api/export/clients",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Export clients failed: {response.text}"
        
        content_type = response.headers.get("content-type", "")
        assert "text/csv" in content_type, f"Expected text/csv, got {content_type}"
        
        csv_content = response.text
        lines = csv_content.strip().split("\n")
        assert len(lines) >= 1, "CSV should have at least header row"
        
        header = lines[0]
        assert "Name" in header, "Missing 'Name' column"
        assert "Code" in header, "Missing 'Code' column"
        assert "Contact" in header, "Missing 'Contact' column"
        
        print(f"Clients export: {len(lines)} rows (including header)")

    def test_export_servers_csv(self, auth_headers):
        """Test servers CSV export returns valid CSV data"""
        response = requests.get(
            f"{BASE_URL}/api/export/servers",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Export servers failed: {response.text}"
        
        content_type = response.headers.get("content-type", "")
        assert "text/csv" in content_type, f"Expected text/csv, got {content_type}"
        
        csv_content = response.text
        lines = csv_content.strip().split("\n")
        assert len(lines) >= 1, "CSV should have at least header row"
        
        header = lines[0]
        assert "Hostname" in header, "Missing 'Hostname' column"
        assert "Client" in header, "Missing 'Client' column"
        assert "Status" in header, "Missing 'Status' column"
        
        print(f"Servers export: {len(lines)} rows (including header)")

    def test_export_incidents_csv(self, auth_headers):
        """Test incidents CSV export returns valid CSV data"""
        response = requests.get(
            f"{BASE_URL}/api/export/incidents",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Export incidents failed: {response.text}"
        
        content_type = response.headers.get("content-type", "")
        assert "text/csv" in content_type, f"Expected text/csv, got {content_type}"
        
        csv_content = response.text
        lines = csv_content.strip().split("\n")
        assert len(lines) >= 1, "CSV should have at least header row"
        
        header = lines[0]
        assert "Title" in header, "Missing 'Title' column"
        assert "Severity" in header, "Missing 'Severity' column"
        assert "Status" in header, "Missing 'Status' column"
        
        print(f"Incidents export: {len(lines)} rows (including header)")

    def test_export_servers_with_client_filter(self, auth_headers):
        """Test servers export with client_id filter"""
        # First get a client ID
        clients_response = requests.get(
            f"{BASE_URL}/api/clients",
            headers=auth_headers
        )
        assert clients_response.status_code == 200
        
        clients = clients_response.json()
        if len(clients) > 0:
            client_id = clients[0]["id"]
            
            response = requests.get(
                f"{BASE_URL}/api/export/servers?client_id={client_id}",
                headers=auth_headers
            )
            assert response.status_code == 200, f"Filtered export failed: {response.text}"
            print(f"Filtered servers export by client_id={client_id}")
        else:
            pytest.skip("No clients available for filter test")


class TestExportAuthentication:
    """Test that export endpoints require authentication"""

    def test_export_timesheet_requires_auth(self):
        """Test timesheet export requires authentication"""
        response = requests.get(f"{BASE_URL}/api/export/timesheet")
        assert response.status_code in [401, 403], f"Expected auth error, got {response.status_code}"

    def test_export_clients_requires_auth(self):
        """Test clients export requires authentication"""
        response = requests.get(f"{BASE_URL}/api/export/clients")
        assert response.status_code in [401, 403], f"Expected auth error, got {response.status_code}"

    def test_export_servers_requires_auth(self):
        """Test servers export requires authentication"""
        response = requests.get(f"{BASE_URL}/api/export/servers")
        assert response.status_code in [401, 403], f"Expected auth error, got {response.status_code}"

    def test_export_incidents_requires_auth(self):
        """Test incidents export requires authentication"""
        response = requests.get(f"{BASE_URL}/api/export/incidents")
        assert response.status_code in [401, 403], f"Expected auth error, got {response.status_code}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
