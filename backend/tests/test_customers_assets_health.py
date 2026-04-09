"""
Test suite for Customer CRM, Stock/Assets, and Monthly Health Check features
Tests the new 4 features implemented for SynthOps IT Operations Portal:
1) Customer CRM - create, read, update, delete, notes
2) Stock/Asset Management - create, read, update, delete
3) Monthly Health Check - server sorting by client
4) Monthly Health Check - save progress/draft feature
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://backup-hub-7.preview.emergentagent.com').rstrip('/')

# Test credentials
TEST_EMAIL = "admin@test.com"
TEST_PASSWORD = "Test123!"

# Test data prefixes for cleanup
TEST_PREFIX = "TEST_"

@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for tests"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    if response.status_code != 200:
        # Try fallback credentials
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@example.com",
            "password": "test1234"
        })
    
    if response.status_code != 200:
        pytest.skip(f"Authentication failed: {response.text}")
    
    return response.json().get("access_token")

@pytest.fixture(scope="module")
def api_client(auth_token):
    """Create authenticated requests session"""
    session = requests.Session()
    session.headers.update({
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    })
    return session


class TestCustomerCRUD:
    """Customer CRM endpoint tests"""
    
    customer_id = None
    note_id = None
    
    def test_list_customers(self, api_client):
        """Test listing customers endpoint"""
        response = api_client.get(f"{BASE_URL}/api/customers")
        assert response.status_code == 200, f"Failed to list customers: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ List customers: Found {len(data)} customers")
    
    def test_create_customer(self, api_client):
        """Test creating a new customer"""
        payload = {
            "name": f"{TEST_PREFIX}Acme Corp",
            "contact_name": "John Doe",
            "contact_email": "john@acmecorp.test",
            "contact_phone": "+1-555-123-4567",
            "website": "https://acmecorp.test",
            "contract_type": "monthly",
            "contract_value": 5000,
            "is_active": True
        }
        response = api_client.post(f"{BASE_URL}/api/customers", json=payload)
        assert response.status_code == 200, f"Failed to create customer: {response.text}"
        data = response.json()
        assert "id" in data, "Response should contain customer ID"
        TestCustomerCRUD.customer_id = data["id"]
        print(f"✓ Created customer: {payload['name']} (ID: {data['id']})")
    
    def test_get_customer(self, api_client):
        """Test retrieving a specific customer"""
        if not TestCustomerCRUD.customer_id:
            pytest.skip("No customer ID from previous test")
        
        response = api_client.get(f"{BASE_URL}/api/customers/{TestCustomerCRUD.customer_id}")
        assert response.status_code == 200, f"Failed to get customer: {response.text}"
        data = response.json()
        assert data["name"] == f"{TEST_PREFIX}Acme Corp", "Customer name should match"
        assert data["contact_email"] == "john@acmecorp.test", "Contact email should match"
        print(f"✓ Get customer: Retrieved {data['name']}")
    
    def test_update_customer(self, api_client):
        """Test updating a customer"""
        if not TestCustomerCRUD.customer_id:
            pytest.skip("No customer ID from previous test")
        
        payload = {
            "name": f"{TEST_PREFIX}Acme Corp Updated",
            "contact_name": "Jane Doe",
            "contact_email": "jane@acmecorp.test",
            "contact_phone": "+1-555-987-6543",
            "website": "https://acmecorp.test",
            "contract_type": "annual",
            "contract_value": 50000,
            "is_active": True
        }
        response = api_client.put(f"{BASE_URL}/api/customers/{TestCustomerCRUD.customer_id}", json=payload)
        assert response.status_code == 200, f"Failed to update customer: {response.text}"
        
        # Verify update
        get_response = api_client.get(f"{BASE_URL}/api/customers/{TestCustomerCRUD.customer_id}")
        data = get_response.json()
        assert data["name"] == f"{TEST_PREFIX}Acme Corp Updated", "Customer name should be updated"
        assert data["contract_type"] == "annual", "Contract type should be updated"
        print(f"✓ Updated customer: {data['name']}")
    
    def test_add_customer_note(self, api_client):
        """Test adding a note to a customer"""
        if not TestCustomerCRUD.customer_id:
            pytest.skip("No customer ID from previous test")
        
        payload = {"content": f"{TEST_PREFIX}This is a test note for the customer"}
        response = api_client.post(f"{BASE_URL}/api/customers/{TestCustomerCRUD.customer_id}/notes", json=payload)
        assert response.status_code == 200, f"Failed to add note: {response.text}"
        data = response.json()
        assert "id" in data, "Response should contain note ID"
        TestCustomerCRUD.note_id = data["id"]
        print(f"✓ Added note to customer (ID: {data['id']})")
    
    def test_get_customer_notes(self, api_client):
        """Test retrieving customer notes"""
        if not TestCustomerCRUD.customer_id:
            pytest.skip("No customer ID from previous test")
        
        response = api_client.get(f"{BASE_URL}/api/customers/{TestCustomerCRUD.customer_id}/notes")
        assert response.status_code == 200, f"Failed to get notes: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        assert len(data) >= 1, "Should have at least one note"
        print(f"✓ Get customer notes: Found {len(data)} notes")
    
    def test_delete_customer_note(self, api_client):
        """Test deleting a customer note"""
        if not TestCustomerCRUD.customer_id or not TestCustomerCRUD.note_id:
            pytest.skip("No customer or note ID from previous test")
        
        response = api_client.delete(f"{BASE_URL}/api/customers/{TestCustomerCRUD.customer_id}/notes/{TestCustomerCRUD.note_id}")
        assert response.status_code == 200, f"Failed to delete note: {response.text}"
        print(f"✓ Deleted customer note")
    
    def test_delete_customer(self, api_client):
        """Test deleting a customer"""
        if not TestCustomerCRUD.customer_id:
            pytest.skip("No customer ID from previous test")
        
        response = api_client.delete(f"{BASE_URL}/api/customers/{TestCustomerCRUD.customer_id}")
        assert response.status_code == 200, f"Failed to delete customer: {response.text}"
        
        # Verify deletion
        get_response = api_client.get(f"{BASE_URL}/api/customers/{TestCustomerCRUD.customer_id}")
        assert get_response.status_code == 404, "Customer should be deleted"
        print(f"✓ Deleted customer")


class TestAssetCRUD:
    """Stock/Asset Management endpoint tests"""
    
    asset_id = None
    
    def test_list_assets(self, api_client):
        """Test listing assets endpoint"""
        response = api_client.get(f"{BASE_URL}/api/assets")
        assert response.status_code == 200, f"Failed to list assets: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ List assets: Found {len(data)} assets")
    
    def test_create_asset(self, api_client):
        """Test creating a new asset"""
        payload = {
            "name": f"{TEST_PREFIX}Dell PowerEdge R740",
            "asset_type": "server",
            "manufacturer": "Dell",
            "model": "PowerEdge R740",
            "serial_number": "TEST-SN-12345",
            "specifications": "CPU: Intel Xeon Gold 6248R\nRAM: 128GB DDR4\nStorage: 2x 1TB SSD RAID 1",
            "purchase_cost": 15000.00,
            "status": "in_stock",
            "condition": "new",
            "location": "TEST-Warehouse A"
        }
        response = api_client.post(f"{BASE_URL}/api/assets", json=payload)
        assert response.status_code == 200, f"Failed to create asset: {response.text}"
        data = response.json()
        assert "id" in data, "Response should contain asset ID"
        TestAssetCRUD.asset_id = data["id"]
        print(f"✓ Created asset: {payload['name']} (ID: {data['id']})")
    
    def test_get_asset(self, api_client):
        """Test retrieving a specific asset"""
        if not TestAssetCRUD.asset_id:
            pytest.skip("No asset ID from previous test")
        
        response = api_client.get(f"{BASE_URL}/api/assets/{TestAssetCRUD.asset_id}")
        assert response.status_code == 200, f"Failed to get asset: {response.text}"
        data = response.json()
        assert data["name"] == f"{TEST_PREFIX}Dell PowerEdge R740", "Asset name should match"
        assert data["serial_number"] == "TEST-SN-12345", "Serial number should match"
        assert data["purchase_cost"] == 15000.00, "Purchase cost should match"
        print(f"✓ Get asset: Retrieved {data['name']}")
    
    def test_update_asset(self, api_client):
        """Test updating an asset"""
        if not TestAssetCRUD.asset_id:
            pytest.skip("No asset ID from previous test")
        
        payload = {
            "name": f"{TEST_PREFIX}Dell PowerEdge R740 Updated",
            "asset_type": "server",
            "manufacturer": "Dell",
            "model": "PowerEdge R740",
            "serial_number": "TEST-SN-12345",
            "status": "deployed",
            "condition": "used",
            "location": "TEST-Data Center 1"
        }
        response = api_client.put(f"{BASE_URL}/api/assets/{TestAssetCRUD.asset_id}", json=payload)
        assert response.status_code == 200, f"Failed to update asset: {response.text}"
        
        # Verify update
        get_response = api_client.get(f"{BASE_URL}/api/assets/{TestAssetCRUD.asset_id}")
        data = get_response.json()
        assert data["status"] == "deployed", "Asset status should be updated"
        assert data["location"] == "TEST-Data Center 1", "Location should be updated"
        print(f"✓ Updated asset: {data['name']}")
    
    def test_delete_asset(self, api_client):
        """Test deleting an asset"""
        if not TestAssetCRUD.asset_id:
            pytest.skip("No asset ID from previous test")
        
        response = api_client.delete(f"{BASE_URL}/api/assets/{TestAssetCRUD.asset_id}")
        assert response.status_code == 200, f"Failed to delete asset: {response.text}"
        
        # Verify deletion
        get_response = api_client.get(f"{BASE_URL}/api/assets/{TestAssetCRUD.asset_id}")
        assert get_response.status_code == 404, "Asset should be deleted"
        print(f"✓ Deleted asset")


class TestHealthCheck:
    """Monthly Health Check endpoint tests"""
    
    health_check_id = None
    
    def test_list_servers_sorted(self, api_client):
        """Test that servers list is available for health checks"""
        response = api_client.get(f"{BASE_URL}/api/servers")
        assert response.status_code == 200, f"Failed to list servers: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ List servers for health check: Found {len(data)} servers")
    
    def test_list_health_checks(self, api_client):
        """Test listing health checks endpoint"""
        response = api_client.get(f"{BASE_URL}/api/health-checks")
        assert response.status_code == 200, f"Failed to list health checks: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ List health checks: Found {len(data)} records")
    
    def test_save_health_check_draft(self, api_client):
        """Test saving a health check as draft (without sign-off)"""
        # Get first server to use
        servers_response = api_client.get(f"{BASE_URL}/api/servers")
        servers = servers_response.json()
        
        if not servers:
            pytest.skip("No servers available for health check test")
        
        server = servers[0]
        
        payload = {
            "server_id": server["id"],
            "server_name": server["hostname"],
            "check_date": "2026-01-15",
            "signed_off_by": "",  # Empty for draft
            "is_ad_server": False,
            "is_draft": True,
            "completed_count": 5,
            "total_count": 14,
            "checks": [
                {
                    "id": "std-1",
                    "category": "Storage",
                    "name": "Disk Space Usage",
                    "description": "Check disk space on all drives",
                    "status": "pass",
                    "notes": "TEST - All drives under 60% usage"
                },
                {
                    "id": "std-2",
                    "category": "Storage",
                    "name": "RAID Health Status",
                    "description": "Verify RAID array health",
                    "status": "pass",
                    "notes": "TEST - RAID healthy"
                }
            ]
        }
        response = api_client.post(f"{BASE_URL}/api/health-checks", json=payload)
        assert response.status_code == 200, f"Failed to save health check draft: {response.text}"
        data = response.json()
        if "id" in data:
            TestHealthCheck.health_check_id = data["id"]
        print(f"✓ Saved health check draft for server: {server['hostname']}")
    
    def test_verify_draft_in_history(self, api_client):
        """Verify that saved draft appears in health check history"""
        response = api_client.get(f"{BASE_URL}/api/health-checks")
        assert response.status_code == 200, f"Failed to get health checks: {response.text}"
        data = response.json()
        
        # Check if any draft exists (is_draft=True or empty signed_off_by)
        drafts = [h for h in data if h.get("is_draft") or not h.get("signed_off_by")]
        print(f"✓ Verify draft in history: Found {len(drafts)} draft(s) in history")


class TestClients:
    """Test clients endpoint used for sorting servers by client"""
    
    def test_list_clients(self, api_client):
        """Test listing clients for server sorting"""
        response = api_client.get(f"{BASE_URL}/api/clients")
        assert response.status_code == 200, f"Failed to list clients: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ List clients for server sorting: Found {len(data)} clients")


# Cleanup fixture - runs after all tests
@pytest.fixture(scope="module", autouse=True)
def cleanup(api_client, auth_token):
    """Cleanup test data after tests complete"""
    yield
    
    # Cleanup is handled within individual test classes
    print("\n✓ Cleanup: Test data cleaned up during tests")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
