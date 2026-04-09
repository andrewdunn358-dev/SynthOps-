"""
Test suite for Ahsay CBS Backup Integration
Tests the new AhsayCBS API integration endpoint and verifies data structure
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAhsayIntegration:
    """Tests for Ahsay CBS backup status endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for all tests"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@test.com",
            "password": "Test123!"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        self.token = login_resp.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_ahsay_status_endpoint_returns_200(self):
        """GET /api/backups/ahsay/status should return 200"""
        resp = requests.get(f"{BASE_URL}/api/backups/ahsay/status", headers=self.headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    
    def test_ahsay_status_has_users_array(self):
        """Response should contain users array"""
        resp = requests.get(f"{BASE_URL}/api/backups/ahsay/status", headers=self.headers)
        data = resp.json()
        assert "users" in data, "Response missing 'users' field"
        assert isinstance(data["users"], list), "users should be a list"
        assert len(data["users"]) > 0, "users array should not be empty"
    
    def test_ahsay_status_has_summary_object(self):
        """Response should contain summary object with expected fields"""
        resp = requests.get(f"{BASE_URL}/api/backups/ahsay/status", headers=self.headers)
        data = resp.json()
        assert "summary" in data, "Response missing 'summary' field"
        summary = data["summary"]
        
        # Verify all expected summary fields exist
        expected_fields = ["total_users", "successful", "warning", "stale", "health_rate", "total_data_gb"]
        for field in expected_fields:
            assert field in summary, f"Summary missing '{field}' field"
    
    def test_ahsay_summary_values_match_expected(self):
        """Summary should show total_users=16, successful=12, warning=1, stale=3, health_rate=75.0"""
        resp = requests.get(f"{BASE_URL}/api/backups/ahsay/status", headers=self.headers)
        data = resp.json()
        summary = data["summary"]
        
        # Verify expected values (may vary slightly based on live data)
        assert summary["total_users"] == 16, f"Expected 16 total_users, got {summary['total_users']}"
        assert summary["successful"] == 12, f"Expected 12 successful, got {summary['successful']}"
        assert summary["warning"] == 1, f"Expected 1 warning, got {summary['warning']}"
        assert summary["stale"] == 3, f"Expected 3 stale, got {summary['stale']}"
        assert summary["health_rate"] == 75.0, f"Expected 75.0 health_rate, got {summary['health_rate']}"
    
    def test_ahsay_status_has_stale_users_array(self):
        """Response should contain stale_users array"""
        resp = requests.get(f"{BASE_URL}/api/backups/ahsay/status", headers=self.headers)
        data = resp.json()
        assert "stale_users" in data, "Response missing 'stale_users' field"
        assert isinstance(data["stale_users"], list), "stale_users should be a list"
    
    def test_ahsay_stale_users_have_required_fields(self):
        """Stale users should have login_name, alias, last_backup, age_hours"""
        resp = requests.get(f"{BASE_URL}/api/backups/ahsay/status", headers=self.headers)
        data = resp.json()
        
        if len(data["stale_users"]) > 0:
            stale_user = data["stale_users"][0]
            assert "login_name" in stale_user, "Stale user missing 'login_name'"
            assert "alias" in stale_user, "Stale user missing 'alias'"
            assert "last_backup" in stale_user, "Stale user missing 'last_backup'"
            assert "age_hours" in stale_user, "Stale user missing 'age_hours'"
    
    def test_ahsay_user_has_required_fields(self):
        """Each user should have required fields: login_name, alias, status, client_type, backup_status, etc."""
        resp = requests.get(f"{BASE_URL}/api/backups/ahsay/status", headers=self.headers)
        data = resp.json()
        
        user = data["users"][0]
        required_fields = [
            "login_name", "alias", "status", "client_type", 
            "data_size_bytes", "data_size_gb", "quota_bytes", "quota_gb",
            "quota_used_pct", "last_backup", "backup_status", "online"
        ]
        for field in required_fields:
            assert field in user, f"User missing '{field}' field"
    
    def test_ahsay_backup_status_values_valid(self):
        """backup_status should be one of: success, warning, stale, never"""
        resp = requests.get(f"{BASE_URL}/api/backups/ahsay/status", headers=self.headers)
        data = resp.json()
        
        valid_statuses = ["success", "warning", "stale", "never"]
        for user in data["users"]:
            assert user["backup_status"] in valid_statuses, f"Invalid backup_status: {user['backup_status']}"
    
    def test_ahsay_response_has_fetched_at(self):
        """Response should have fetched_at timestamp"""
        resp = requests.get(f"{BASE_URL}/api/backups/ahsay/status", headers=self.headers)
        data = resp.json()
        assert "fetched_at" in data, "Response missing 'fetched_at' field"
    
    def test_ahsay_response_has_from_cache_flag(self):
        """Response should have from_cache boolean flag"""
        resp = requests.get(f"{BASE_URL}/api/backups/ahsay/status", headers=self.headers)
        data = resp.json()
        assert "from_cache" in data, "Response missing 'from_cache' field"
        assert isinstance(data["from_cache"], bool), "from_cache should be boolean"


class TestAltaroStillWorks:
    """Verify existing Altaro integration is not broken"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for all tests"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@test.com",
            "password": "Test123!"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        self.token = login_resp.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_altaro_status_endpoint_returns_200(self):
        """GET /api/backups/altaro/status should still return 200"""
        resp = requests.get(f"{BASE_URL}/api/backups/altaro/status", headers=self.headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    
    def test_altaro_status_has_summary(self):
        """Altaro response should have summary object"""
        resp = requests.get(f"{BASE_URL}/api/backups/altaro/status", headers=self.headers)
        data = resp.json()
        assert "summary" in data, "Altaro response missing 'summary' field"
        
        summary = data["summary"]
        assert "total_customers" in summary, "Summary missing 'total_customers'"
        assert "total_vms" in summary, "Summary missing 'total_vms'"
        assert "successful" in summary, "Summary missing 'successful'"
        assert "success_rate" in summary, "Summary missing 'success_rate'"
    
    def test_altaro_status_has_customers(self):
        """Altaro response should have customers array"""
        resp = requests.get(f"{BASE_URL}/api/backups/altaro/status", headers=self.headers)
        data = resp.json()
        assert "customers" in data, "Altaro response missing 'customers' field"
        assert isinstance(data["customers"], list), "customers should be a list"


class TestAuthRequired:
    """Verify endpoints require authentication"""
    
    def test_ahsay_requires_auth(self):
        """GET /api/backups/ahsay/status should require authentication"""
        resp = requests.get(f"{BASE_URL}/api/backups/ahsay/status")
        assert resp.status_code in [401, 403], f"Expected 401/403 without auth, got {resp.status_code}"
    
    def test_altaro_requires_auth(self):
        """GET /api/backups/altaro/status should require authentication"""
        resp = requests.get(f"{BASE_URL}/api/backups/altaro/status")
        assert resp.status_code in [401, 403], f"Expected 401/403 without auth, got {resp.status_code}"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
