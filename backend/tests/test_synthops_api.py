"""
SynthOps IT Operations Portal - Backend API Tests
Tests for authentication, clients, tasks, projects, incidents, maintenance, documentation, and time tracking
"""

import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "admin@synthesis-it.co.uk"
TEST_PASSWORD = "Admin123!"


class TestAuthentication:
    """Authentication endpoint tests"""
    
    def test_login_success(self):
        """Test successful login"""
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
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "wrong@example.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        print("✓ Invalid credentials rejected correctly")
    
    def test_auth_me_endpoint(self):
        """Test /auth/me endpoint with valid token"""
        # First login
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        token = login_response.json()["access_token"]
        
        # Test /auth/me
        response = requests.get(f"{BASE_URL}/api/auth/me", headers={
            "Authorization": f"Bearer {token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == TEST_EMAIL
        print("✓ /auth/me endpoint works")


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for all tests"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    if response.status_code == 200:
        return response.json()["access_token"]
    pytest.skip("Authentication failed")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Headers with auth token"""
    return {"Authorization": f"Bearer {auth_token}"}


class TestDashboard:
    """Dashboard statistics tests"""
    
    def test_dashboard_stats(self, auth_headers):
        """Test dashboard stats endpoint"""
        response = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        # Verify all expected fields are present
        assert "total_clients" in data
        assert "total_servers" in data
        assert "servers_online" in data
        assert "servers_offline" in data
        assert "open_incidents" in data
        assert "open_tasks" in data
        assert "active_projects" in data
        print(f"✓ Dashboard stats: {data['total_clients']} clients, {data['open_tasks']} open tasks")


class TestClients:
    """Client CRUD tests"""
    
    def test_list_clients(self, auth_headers):
        """Test listing clients"""
        response = requests.get(f"{BASE_URL}/api/clients", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Listed {len(data)} clients")
    
    def test_create_client(self, auth_headers):
        """Test creating a new client"""
        client_data = {
            "name": f"TEST_PyTestClient_{datetime.now().strftime('%H%M%S')}",
            "code": f"PYT{datetime.now().strftime('%H%M%S')}",
            "contact_name": "Test Contact",
            "contact_email": "pytest@test.com",
            "contract_type": "monthly",
            "contract_hours_monthly": 20
        }
        response = requests.post(f"{BASE_URL}/api/clients", json=client_data, headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == client_data["name"]
        assert data["code"] == client_data["code"].upper()
        assert "id" in data
        print(f"✓ Created client: {data['name']}")
        return data["id"]
    
    def test_duplicate_client_code_rejected(self, auth_headers):
        """Test that duplicate client codes are rejected"""
        # First create a client
        unique_code = f"DUP{datetime.now().strftime('%H%M%S')}"
        client_data = {"name": "First Client", "code": unique_code}
        requests.post(f"{BASE_URL}/api/clients", json=client_data, headers=auth_headers)
        
        # Try to create another with same code
        response = requests.post(f"{BASE_URL}/api/clients", json={
            "name": "Second Client",
            "code": unique_code
        }, headers=auth_headers)
        assert response.status_code == 400
        assert "already exists" in response.json().get("detail", "").lower()
        print("✓ Duplicate client code rejected correctly")


class TestTasks:
    """Task management tests"""
    
    def test_list_tasks(self, auth_headers):
        """Test listing tasks"""
        response = requests.get(f"{BASE_URL}/api/tasks", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Listed {len(data)} tasks")
    
    def test_kanban_view(self, auth_headers):
        """Test kanban view endpoint"""
        response = requests.get(f"{BASE_URL}/api/tasks/kanban", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "open" in data
        assert "in_progress" in data
        assert "completed" in data
        assert "blocked" in data
        print("✓ Kanban view works correctly")
    
    def test_create_and_update_task(self, auth_headers):
        """Test creating and updating a task"""
        # Create task
        task_data = {
            "title": f"TEST_PyTestTask_{datetime.now().strftime('%H%M%S')}",
            "description": "Created by pytest",
            "priority": "high",
            "status": "open"
        }
        create_response = requests.post(f"{BASE_URL}/api/tasks", json=task_data, headers=auth_headers)
        assert create_response.status_code == 200
        created_task = create_response.json()
        task_id = created_task["id"]
        print(f"✓ Created task: {created_task['title']}")
        
        # Update task status
        status_response = requests.put(
            f"{BASE_URL}/api/tasks/{task_id}/status", 
            json={"status": "in_progress"},
            headers=auth_headers
        )
        assert status_response.status_code == 200
        print("✓ Task status updated")
        
        # Cleanup - delete task
        delete_response = requests.delete(f"{BASE_URL}/api/tasks/{task_id}", headers=auth_headers)
        assert delete_response.status_code == 200
        print("✓ Task deleted")


class TestProjects:
    """Project management tests"""
    
    def test_list_projects(self, auth_headers):
        """Test listing projects"""
        response = requests.get(f"{BASE_URL}/api/projects", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Listed {len(data)} projects")
    
    def test_create_project(self, auth_headers):
        """Test creating a project"""
        project_data = {
            "name": f"TEST_PyTestProject_{datetime.now().strftime('%H%M%S')}",
            "description": "Created by pytest",
            "status": "planning"
        }
        response = requests.post(f"{BASE_URL}/api/projects", json=project_data, headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == project_data["name"]
        print(f"✓ Created project: {data['name']}")


class TestIncidents:
    """Incident management tests"""
    
    def test_list_incidents(self, auth_headers):
        """Test listing incidents"""
        response = requests.get(f"{BASE_URL}/api/incidents", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Listed {len(data)} incidents")
    
    def test_create_incident(self, auth_headers):
        """Test creating an incident"""
        incident_data = {
            "title": f"TEST_PyTestIncident_{datetime.now().strftime('%H%M%S')}",
            "severity": "medium",
            "description": "Created by pytest"
        }
        response = requests.post(f"{BASE_URL}/api/incidents", json=incident_data, headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == incident_data["title"]
        assert data["status"] == "open"
        print(f"✓ Created incident: {data['title']}")


class TestMaintenance:
    """Maintenance scheduling tests"""
    
    def test_list_maintenance(self, auth_headers):
        """Test listing maintenance records"""
        response = requests.get(f"{BASE_URL}/api/maintenance", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Listed {len(data)} maintenance records")


class TestDocumentation:
    """Documentation management tests"""
    
    def test_list_documents(self, auth_headers):
        """Test listing documents"""
        response = requests.get(f"{BASE_URL}/api/docs", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Listed {len(data)} documents")
    
    def test_create_document(self, auth_headers):
        """Test creating a document"""
        doc_data = {
            "title": f"TEST_PyTestDoc_{datetime.now().strftime('%H%M%S')}",
            "content": "# Test Document\n\nCreated by pytest",
            "category": "procedures",
            "is_published": True
        }
        response = requests.post(f"{BASE_URL}/api/docs", json=doc_data, headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == doc_data["title"]
        print(f"✓ Created document: {data['title']}")


class TestTimeTracking:
    """Time tracking tests"""
    
    def test_list_time_entries(self, auth_headers):
        """Test listing time entries"""
        response = requests.get(f"{BASE_URL}/api/time-entries", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Listed {len(data)} time entries")
    
    def test_create_time_entry(self, auth_headers):
        """Test creating a time entry"""
        entry_data = {
            "entry_date": datetime.now().isoformat(),
            "duration_minutes": 60,
            "description": "TEST_PyTest time entry",
            "is_billable": True
        }
        response = requests.post(f"{BASE_URL}/api/time-entries", json=entry_data, headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["duration_minutes"] == 60
        print(f"✓ Created time entry: {data['id']}")


class TestServers:
    """Server management tests"""
    
    def test_list_servers(self, auth_headers):
        """Test listing servers"""
        response = requests.get(f"{BASE_URL}/api/servers", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Listed {len(data)} servers")


class TestHealthChecks:
    """Health check tests"""
    
    def test_list_health_check_templates(self, auth_headers):
        """Test listing health check templates"""
        response = requests.get(f"{BASE_URL}/api/health-checks/templates", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0
        print(f"✓ Listed {len(data)} health check templates")


class TestUserManagement:
    """User management tests (admin only)"""
    
    def test_list_users(self, auth_headers):
        """Test listing users (admin only)"""
        response = requests.get(f"{BASE_URL}/api/users", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Listed {len(data)} users")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
