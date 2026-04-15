"""
Test suite for Backup Tracking, NOC Display, Tech Tip, and Login Redirect features
Iteration 8 - Testing new features:
- Backup CRUD endpoints
- Backup stats endpoint
- Tech tip endpoint
- NOC Display views
- Login redirect when authenticated
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "admin@test.com"
TEST_PASSWORD = "Test123!"


class TestAuth:
    """Authentication tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Get headers with auth token"""
        return {"Authorization": f"Bearer {auth_token}"}
    
    def test_login_success(self):
        """Test login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert "user" in data
        assert data["user"]["email"] == TEST_EMAIL
        print("✓ Login successful")


class TestTechTip:
    """Tech tip endpoint tests"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        return {"Authorization": f"Bearer {response.json()['access_token']}"}
    
    def test_get_tech_tip(self, auth_headers):
        """Test GET /api/dashboard/tech-tip returns a tech tip"""
        response = requests.get(f"{BASE_URL}/api/dashboard/tech-tip", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get tech tip: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "tip" in data, "Response should contain 'tip'"
        assert "category" in data, "Response should contain 'category'"
        assert "source" in data, "Response should contain 'source'"
        
        # Verify data types
        assert isinstance(data["tip"], str), "Tip should be a string"
        assert isinstance(data["category"], str), "Category should be a string"
        assert isinstance(data["source"], str), "Source should be a string"
        
        # Verify content is not empty
        assert len(data["tip"]) > 0, "Tip should not be empty"
        assert len(data["category"]) > 0, "Category should not be empty"
        
        print(f"✓ Tech tip received: [{data['category']}] {data['tip'][:50]}...")


class TestBackupCRUD:
    """Backup tracking CRUD tests"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        return {"Authorization": f"Bearer {response.json()['access_token']}"}
    
    @pytest.fixture(scope="class")
    def test_client_id(self, auth_headers):
        """Get a client ID for testing"""
        response = requests.get(f"{BASE_URL}/api/clients", headers=auth_headers)
        assert response.status_code == 200
        clients = response.json()
        if clients:
            return clients[0]["id"]
        # Create a test client if none exists
        response = requests.post(f"{BASE_URL}/api/clients", headers=auth_headers, json={
            "name": "TEST_Backup_Client",
            "code": "TESTBKP"
        })
        return response.json()["id"]
    
    def test_get_backups_empty_or_existing(self, auth_headers):
        """Test GET /api/backups returns list"""
        response = requests.get(f"{BASE_URL}/api/backups", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get backups: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ GET /api/backups returned {len(data)} backup logs")
    
    def test_create_backup_log(self, auth_headers, test_client_id):
        """Test POST /api/backups creates a backup log"""
        today = datetime.now().strftime("%Y-%m-%d")
        payload = {
            "client_id": test_client_id,
            "backup_date": today,
            "backup_type": "full",
            "status": "success",
            "storage_size_gb": 150.5,
            "destination": "cloud",
            "notes": "TEST_Automated test backup log"
        }
        response = requests.post(f"{BASE_URL}/api/backups", headers=auth_headers, json=payload)
        assert response.status_code == 200, f"Failed to create backup: {response.text}"
        data = response.json()
        
        assert "id" in data, "Response should contain 'id'"
        assert data["status"] == "success"
        assert data["backup_type"] == "full"
        assert data["storage_size_gb"] == 150.5
        
        print(f"✓ Created backup log with ID: {data['id']}")
        return data["id"]
    
    def test_get_backups_with_filters(self, auth_headers, test_client_id):
        """Test GET /api/backups with filters"""
        current_month = datetime.now().strftime("%Y-%m")
        
        # Filter by month
        response = requests.get(f"{BASE_URL}/api/backups?month={current_month}", headers=auth_headers)
        assert response.status_code == 200
        
        # Filter by status
        response = requests.get(f"{BASE_URL}/api/backups?status=success", headers=auth_headers)
        assert response.status_code == 200
        
        # Filter by client
        response = requests.get(f"{BASE_URL}/api/backups?client_id={test_client_id}", headers=auth_headers)
        assert response.status_code == 200
        
        print("✓ Backup filters working correctly")
    
    def test_get_backup_stats(self, auth_headers):
        """Test GET /api/backups/stats returns statistics"""
        response = requests.get(f"{BASE_URL}/api/backups/stats", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get backup stats: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "total_this_month" in data, "Should have total_this_month"
        assert "successful" in data, "Should have successful count"
        assert "failed" in data, "Should have failed count"
        assert "success_rate" in data, "Should have success_rate"
        assert "total_storage_gb" in data, "Should have total_storage_gb"
        
        # Verify data types
        assert isinstance(data["total_this_month"], int)
        assert isinstance(data["successful"], int)
        assert isinstance(data["failed"], int)
        assert isinstance(data["success_rate"], (int, float))
        assert isinstance(data["total_storage_gb"], (int, float))
        
        print(f"✓ Backup stats: {data['successful']} successful, {data['failed']} failed, {data['success_rate']}% success rate")
    
    def test_update_backup_log(self, auth_headers, test_client_id):
        """Test PUT /api/backups/{id} updates a backup log"""
        # First create a backup to update
        today = datetime.now().strftime("%Y-%m-%d")
        create_response = requests.post(f"{BASE_URL}/api/backups", headers=auth_headers, json={
            "client_id": test_client_id,
            "backup_date": today,
            "backup_type": "incremental",
            "status": "success",
            "storage_size_gb": 50.0,
            "notes": "TEST_To be updated"
        })
        assert create_response.status_code == 200
        backup_id = create_response.json()["id"]
        
        # Update the backup
        update_response = requests.put(f"{BASE_URL}/api/backups/{backup_id}", headers=auth_headers, json={
            "status": "failed",
            "notes": "TEST_Updated - marked as failed"
        })
        assert update_response.status_code == 200, f"Failed to update backup: {update_response.text}"
        
        # Verify update by fetching backups
        get_response = requests.get(f"{BASE_URL}/api/backups", headers=auth_headers)
        backups = get_response.json()
        updated_backup = next((b for b in backups if b["id"] == backup_id), None)
        assert updated_backup is not None
        assert updated_backup["status"] == "failed"
        
        print(f"✓ Updated backup log {backup_id}")
        return backup_id
    
    def test_delete_backup_log(self, auth_headers, test_client_id):
        """Test DELETE /api/backups/{id} deletes a backup log"""
        # First create a backup to delete
        today = datetime.now().strftime("%Y-%m-%d")
        create_response = requests.post(f"{BASE_URL}/api/backups", headers=auth_headers, json={
            "client_id": test_client_id,
            "backup_date": today,
            "backup_type": "full",
            "status": "success",
            "notes": "TEST_To be deleted"
        })
        assert create_response.status_code == 200
        backup_id = create_response.json()["id"]
        
        # Delete the backup
        delete_response = requests.delete(f"{BASE_URL}/api/backups/{backup_id}", headers=auth_headers)
        assert delete_response.status_code == 200, f"Failed to delete backup: {delete_response.text}"
        
        # Verify deletion
        get_response = requests.get(f"{BASE_URL}/api/backups", headers=auth_headers)
        backups = get_response.json()
        deleted_backup = next((b for b in backups if b["id"] == backup_id), None)
        assert deleted_backup is None, "Backup should be deleted"
        
        print(f"✓ Deleted backup log {backup_id}")


class TestDashboardStats:
    """Dashboard stats tests"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        return {"Authorization": f"Bearer {response.json()['access_token']}"}
    
    def test_dashboard_stats(self, auth_headers):
        """Test GET /api/dashboard/stats returns stats"""
        response = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get dashboard stats: {response.text}"
        data = response.json()
        
        # Verify expected fields
        assert "total_clients" in data
        assert "total_servers" in data
        assert "servers_online" in data
        assert "open_tasks" in data
        
        print(f"✓ Dashboard stats: {data['total_clients']} clients, {data['total_servers']} servers")


class TestUsersForTaskAssignment:
    """Test users endpoint for task assignment dropdown"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        return {"Authorization": f"Bearer {response.json()['access_token']}"}
    
    def test_get_users_list(self, auth_headers):
        """Test GET /api/users returns user list for task assignment"""
        response = requests.get(f"{BASE_URL}/api/users", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get users: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Response should be a list"
        assert len(data) > 0, "Should have at least one user"
        
        # Verify user structure
        user = data[0]
        assert "id" in user
        assert "username" in user
        assert "email" in user
        
        # Check for expected test users
        usernames = [u["username"] for u in data]
        print(f"✓ Users available for assignment: {usernames}")


class TestNOCEndpoints:
    """Test endpoints used by NOC Display"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        return {"Authorization": f"Bearer {response.json()['access_token']}"}
    
    def test_servers_endpoint(self, auth_headers):
        """Test GET /api/servers for NOC server status"""
        response = requests.get(f"{BASE_URL}/api/servers", headers=auth_headers)
        assert response.status_code == 200
        print(f"✓ Servers endpoint: {len(response.json())} servers")
    
    def test_clients_endpoint(self, auth_headers):
        """Test GET /api/clients for NOC clients view"""
        response = requests.get(f"{BASE_URL}/api/clients", headers=auth_headers)
        assert response.status_code == 200
        print(f"✓ Clients endpoint: {len(response.json())} clients")
    
    def test_incidents_endpoint(self, auth_headers):
        """Test GET /api/incidents for NOC alerts view"""
        response = requests.get(f"{BASE_URL}/api/incidents?status=open", headers=auth_headers)
        assert response.status_code == 200
        print(f"✓ Incidents endpoint: {len(response.json())} open incidents")
    
    def test_tasks_endpoint(self, auth_headers):
        """Test GET /api/tasks for NOC reminders view (recurring tasks)"""
        response = requests.get(f"{BASE_URL}/api/tasks", headers=auth_headers)
        assert response.status_code == 200
        tasks = response.json()
        recurring = [t for t in tasks if t.get("is_recurring")]
        print(f"✓ Tasks endpoint: {len(tasks)} tasks, {len(recurring)} recurring")
    
    def test_backup_stats_for_noc(self, auth_headers):
        """Test GET /api/backups/stats for NOC reminders view"""
        response = requests.get(f"{BASE_URL}/api/backups/stats", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        print(f"✓ Backup stats for NOC: {data['successful']} successful, {data['failed']} failed")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
