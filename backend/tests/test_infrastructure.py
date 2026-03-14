"""
Infrastructure Management API Tests
Tests the CRUD operations for infrastructure devices (Proxmox, SNMP, ping monitors)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestInfrastructure:
    """Infrastructure CRUD tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Get auth token"""
        # Login to get token
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "admin@test.com", "password": "admin123"}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.token = login_response.json()["access_token"]
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
        self.created_device_ids = []
        yield
        # Cleanup: Delete any test devices created
        for device_id in self.created_device_ids:
            try:
                requests.delete(
                    f"{BASE_URL}/api/infrastructure/devices/{device_id}",
                    headers=self.headers
                )
            except:
                pass
    
    def test_login_works(self):
        """Test that login with admin@test.com / admin123 works"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "admin@test.com", "password": "admin123"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "admin"
        print("SUCCESS: Login with admin@test.com / admin123 works")
    
    def test_get_infrastructure_devices_empty(self):
        """Test GET /api/infrastructure/devices returns list"""
        response = requests.get(
            f"{BASE_URL}/api/infrastructure/devices",
            headers=self.headers
        )
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print(f"SUCCESS: GET /api/infrastructure/devices - returned {len(response.json())} devices")
    
    def test_create_ping_device(self):
        """Test POST /api/infrastructure/devices for ping device"""
        device_data = {
            "name": "TEST_Ping_Device",
            "device_type": "ping",
            "ip_address": "8.8.8.8",
            "location": "Test Location",
            "description": "Test ping device for automated testing"
        }
        response = requests.post(
            f"{BASE_URL}/api/infrastructure/devices",
            headers=self.headers,
            json=device_data
        )
        assert response.status_code == 200, f"Create failed: {response.text}"
        data = response.json()
        assert "id" in data
        assert data["message"] == "Device added"
        self.created_device_ids.append(data["id"])
        print(f"SUCCESS: Created ping device with ID: {data['id']}")
        
        # Verify device was created by fetching it
        get_response = requests.get(
            f"{BASE_URL}/api/infrastructure/devices",
            headers=self.headers
        )
        devices = get_response.json()
        device = next((d for d in devices if d["id"] == data["id"]), None)
        assert device is not None, "Device not found after creation"
        assert device["name"] == "TEST_Ping_Device"
        assert device["device_type"] == "ping"
        assert device["ip_address"] == "8.8.8.8"
        print("SUCCESS: Device verified after creation")
    
    def test_create_proxmox_device(self):
        """Test POST /api/infrastructure/devices for Proxmox server"""
        device_data = {
            "name": "TEST_Proxmox_Server",
            "device_type": "proxmox",
            "ip_address": "192.168.1.100",
            "port": 8006,
            "location": "Test Datacenter",
            "description": "Test Proxmox server",
            "api_token_id": "test@pam!testtoken",
            "api_token_secret": "test-secret-token"
        }
        response = requests.post(
            f"{BASE_URL}/api/infrastructure/devices",
            headers=self.headers,
            json=device_data
        )
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        self.created_device_ids.append(data["id"])
        print(f"SUCCESS: Created Proxmox device with ID: {data['id']}")
    
    def test_create_snmp_device(self):
        """Test POST /api/infrastructure/devices for SNMP device"""
        device_data = {
            "name": "TEST_SNMP_Router",
            "device_type": "snmp",
            "ip_address": "192.168.1.1",
            "port": 161,
            "location": "Network Closet",
            "description": "Test SNMP router",
            "snmp_community": "public",
            "snmp_version": "2c"
        }
        response = requests.post(
            f"{BASE_URL}/api/infrastructure/devices",
            headers=self.headers,
            json=device_data
        )
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        self.created_device_ids.append(data["id"])
        print(f"SUCCESS: Created SNMP device with ID: {data['id']}")
    
    def test_delete_infrastructure_device(self):
        """Test DELETE /api/infrastructure/devices/{id}"""
        # First create a device
        device_data = {
            "name": "TEST_Delete_Device",
            "device_type": "ping",
            "ip_address": "1.1.1.1"
        }
        create_response = requests.post(
            f"{BASE_URL}/api/infrastructure/devices",
            headers=self.headers,
            json=device_data
        )
        assert create_response.status_code == 200
        device_id = create_response.json()["id"]
        
        # Delete the device
        delete_response = requests.delete(
            f"{BASE_URL}/api/infrastructure/devices/{device_id}",
            headers=self.headers
        )
        assert delete_response.status_code == 200
        assert delete_response.json()["message"] == "Device deleted"
        print(f"SUCCESS: Deleted device {device_id}")
        
        # Verify device was deleted
        get_response = requests.get(
            f"{BASE_URL}/api/infrastructure/devices",
            headers=self.headers
        )
        devices = get_response.json()
        device = next((d for d in devices if d["id"] == device_id), None)
        assert device is None, "Device still exists after deletion"
        print("SUCCESS: Device verified as deleted")
    
    def test_get_single_device(self):
        """Test GET /api/infrastructure/devices/{id}"""
        # First create a device
        device_data = {
            "name": "TEST_Single_Device",
            "device_type": "ping",
            "ip_address": "9.9.9.9",
            "location": "Test"
        }
        create_response = requests.post(
            f"{BASE_URL}/api/infrastructure/devices",
            headers=self.headers,
            json=device_data
        )
        assert create_response.status_code == 200
        device_id = create_response.json()["id"]
        self.created_device_ids.append(device_id)
        
        # Get single device
        get_response = requests.get(
            f"{BASE_URL}/api/infrastructure/devices/{device_id}",
            headers=self.headers
        )
        assert get_response.status_code == 200
        device = get_response.json()
        assert device["id"] == device_id
        assert device["name"] == "TEST_Single_Device"
        print(f"SUCCESS: GET single device {device_id}")
    
    def test_update_device(self):
        """Test PUT /api/infrastructure/devices/{id}"""
        # First create a device
        device_data = {
            "name": "TEST_Update_Device_Before",
            "device_type": "ping",
            "ip_address": "7.7.7.7"
        }
        create_response = requests.post(
            f"{BASE_URL}/api/infrastructure/devices",
            headers=self.headers,
            json=device_data
        )
        assert create_response.status_code == 200
        device_id = create_response.json()["id"]
        self.created_device_ids.append(device_id)
        
        # Update the device
        update_data = {
            "name": "TEST_Update_Device_After",
            "device_type": "ping",
            "ip_address": "8.8.4.4",
            "location": "Updated Location"
        }
        update_response = requests.put(
            f"{BASE_URL}/api/infrastructure/devices/{device_id}",
            headers=self.headers,
            json=update_data
        )
        assert update_response.status_code == 200
        print(f"SUCCESS: Updated device {device_id}")
        
        # Verify update
        get_response = requests.get(
            f"{BASE_URL}/api/infrastructure/devices/{device_id}",
            headers=self.headers
        )
        device = get_response.json()
        assert device["name"] == "TEST_Update_Device_After"
        assert device["ip_address"] == "8.8.4.4"
        assert device["location"] == "Updated Location"
        print("SUCCESS: Device update verified")
    
    def test_infrastructure_status(self):
        """Test GET /api/infrastructure/status"""
        response = requests.get(
            f"{BASE_URL}/api/infrastructure/status",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "total" in data
        assert "online" in data
        assert "offline" in data
        assert "unknown" in data
        print(f"SUCCESS: Infrastructure status - total: {data['total']}, online: {data['online']}, offline: {data['offline']}")


class TestZammadStats:
    """Test Zammad integration (note: external service may not be available)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Get auth token"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "admin@test.com", "password": "admin123"}
        )
        assert login_response.status_code == 200
        self.token = login_response.json()["access_token"]
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
    
    def test_zammad_stats_endpoint_exists(self):
        """Test that /api/zammad/stats endpoint exists and responds"""
        response = requests.get(
            f"{BASE_URL}/api/zammad/stats",
            headers=self.headers
        )
        # Endpoint should exist (might return error if Zammad not configured)
        assert response.status_code in [200, 500, 503], f"Unexpected status: {response.status_code}"
        print(f"SUCCESS: Zammad stats endpoint exists - status: {response.status_code}")
    
    def test_zammad_test_endpoint(self):
        """Test that /api/zammad/test endpoint exists"""
        response = requests.get(
            f"{BASE_URL}/api/zammad/test",
            headers=self.headers
        )
        assert response.status_code in [200, 500, 503]
        print(f"SUCCESS: Zammad test endpoint exists - status: {response.status_code}")


class TestSidebarNavigation:
    """Verify admin items are properly configured"""
    
    def test_admin_login_role(self):
        """Test that admin@test.com has admin role"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "admin@test.com", "password": "admin123"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["user"]["role"] == "admin"
        print("SUCCESS: admin@test.com has admin role - will see Infrastructure, Admin, Settings in sidebar")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
