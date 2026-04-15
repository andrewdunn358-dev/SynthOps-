#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime
import uuid

class SynthOpsAPITester:
    def __init__(self, base_url="https://backup-hub-7.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.user_id = None
        
        # Test data IDs for cleanup
        self.created_client_id = None
        self.created_server_id = None
        self.created_task_id = None
        self.created_project_id = None
        
    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        request_headers = {'Content-Type': 'application/json'}
        
        if self.token:
            request_headers['Authorization'] = f'Bearer {self.token}'
        if headers:
            request_headers.update(headers)

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   → {method} {endpoint}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=request_headers)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=request_headers)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=request_headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=request_headers)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"   ✅ PASSED - Status: {response.status_code}")
                try:
                    return success, response.json() if response.text else {}
                except:
                    return success, {}
            else:
                print(f"   ❌ FAILED - Expected {expected_status}, got {response.status_code}")
                if response.text:
                    print(f"   Response: {response.text[:200]}...")
                return False, {}

        except Exception as e:
            print(f"   ❌ FAILED - Error: {str(e)}")
            return False, {}

    def test_login(self):
        """Test login with admin credentials"""
        print("\n" + "="*60)
        print("TESTING AUTHENTICATION")
        print("="*60)
        
        success, response = self.run_test(
            "Admin Login",
            "POST",
            "auth/login",
            200,
            data={"email": "admin@synthesis-it.co.uk", "password": "Admin123!"}
        )
        
        if success and 'access_token' in response:
            self.token = response['access_token']
            self.user_id = response['user']['id']
            print(f"   🎯 Token acquired for user: {response['user']['username']} ({response['user']['role']})")
            return True
        
        print("   💥 CRITICAL: Cannot proceed without authentication")
        return False

    def test_user_profile(self):
        """Test getting current user profile"""
        success, response = self.run_test(
            "Get User Profile",
            "GET",
            "auth/me",
            200
        )
        return success and 'email' in response

    def test_dashboard_stats(self):
        """Test dashboard statistics endpoint"""
        print("\n" + "="*60)
        print("TESTING DASHBOARD")
        print("="*60)
        
        success, response = self.run_test(
            "Dashboard Stats",
            "GET",
            "dashboard/stats", 
            200
        )
        
        if success:
            expected_fields = ['total_clients', 'total_servers', 'servers_online', 'open_incidents', 'open_tasks']
            missing_fields = [f for f in expected_fields if f not in response]
            if missing_fields:
                print(f"   ⚠️  Missing dashboard fields: {missing_fields}")
                return False
            else:
                print(f"   📊 Stats: {response.get('total_clients', 0)} clients, {response.get('total_servers', 0)} servers")
        
        return success

    def test_clients_crud(self):
        """Test complete client CRUD operations"""
        print("\n" + "="*60)
        print("TESTING CLIENT MANAGEMENT")
        print("="*60)
        
        # List clients
        success, clients = self.run_test("List Clients", "GET", "clients", 200)
        if not success:
            return False
            
        # Create client
        client_data = {
            "name": f"Test Client {datetime.now().strftime('%H%M%S')}",
            "code": f"TC{datetime.now().strftime('%H%M%S')}",
            "contact_name": "John Tester",
            "contact_email": "john@testclient.com",
            "contact_phone": "+44 123 456 7890",
            "address": "123 Test Street, London",
            "contract_type": "monthly",
            "contract_hours_monthly": 40,
            "notes": "Test client for API validation"
        }
        
        success, response = self.run_test("Create Client", "POST", "clients", 200, data=client_data)
        if success and 'id' in response:
            self.created_client_id = response['id']
            print(f"   🆕 Created client: {response['name']} ({response['code']})")
        
        # Get specific client
        if self.created_client_id:
            success, _ = self.run_test("Get Client", "GET", f"clients/{self.created_client_id}", 200)
            
        return success

    def test_sites_crud(self):
        """Test site management"""
        if not self.created_client_id:
            print("⚠️  Skipping site tests - no client available")
            return True
            
        print("\n📍 Testing Site Management")
        
        # Create site
        site_data = {
            "client_id": self.created_client_id,
            "name": "Test Site HQ",
            "address": "456 Site Road, Manchester", 
            "contact_name": "Site Manager",
            "contact_phone": "+44 987 654 3210"
        }
        
        success, response = self.run_test("Create Site", "POST", "sites", 200, data=site_data)
        site_id = response.get('id') if success else None
        
        # List sites
        success, _ = self.run_test("List Sites", "GET", "sites", 200)
        
        return success

    def test_servers_crud(self):
        """Test server management"""
        print("\n" + "="*60)
        print("TESTING SERVER MANAGEMENT")  
        print("="*60)
        
        # List servers first
        success, servers = self.run_test("List Servers", "GET", "servers", 200)
        if not success:
            return False
            
        print(f"   📊 Found {len(servers)} existing servers")
        
        # We need a site to create a server, let's get sites
        success, sites = self.run_test("List Sites", "GET", "sites", 200)
        if not success or len(sites) == 0:
            print("   ⚠️  No sites available for server creation")
            return True
            
        site_id = sites[0]['id']
        
        # Create server
        server_data = {
            "site_id": site_id,
            "hostname": f"test-srv-{datetime.now().strftime('%H%M%S')}",
            "role": "domain controller",
            "server_type": "virtual",
            "ip_address": "192.168.1.100",
            "operating_system": "Windows Server 2022", 
            "os_version": "21H2",
            "cpu_cores": 4,
            "ram_gb": 16,
            "storage_gb": 500,
            "environment": "production",
            "criticality": "high",
            "notes": "Test server for API validation",
            "status": "online"
        }
        
        success, response = self.run_test("Create Server", "POST", "servers", 200, data=server_data)
        if success and 'id' in response:
            self.created_server_id = response['id'] 
            print(f"   🖥️  Created server: {response['hostname']}")
        
        return success

    def test_tasks_crud(self):
        """Test task management"""
        print("\n" + "="*60)
        print("TESTING TASK MANAGEMENT")
        print("="*60)
        
        # List tasks
        success, tasks = self.run_test("List Tasks", "GET", "tasks", 200)
        if not success:
            return False
            
        # Create task
        task_data = {
            "title": f"Test Task {datetime.now().strftime('%H%M%S')}",
            "description": "This is a test task for API validation",
            "client_id": self.created_client_id,
            "priority": "high",
            "status": "open",
            "due_date": "2024-12-31T23:59:59Z"
        }
        
        success, response = self.run_test("Create Task", "POST", "tasks", 200, data=task_data)
        if success and 'id' in response:
            self.created_task_id = response['id']
            print(f"   📋 Created task: {response['title']}")
            
            # Test task status update
            success, _ = self.run_test("Update Task Status", "PUT", f"tasks/{self.created_task_id}/status", 200, 
                                     data={"status": "in_progress"})
        
        # Test Kanban view
        success, _ = self.run_test("Get Kanban Tasks", "GET", "tasks/kanban", 200)
        
        return success

    def test_projects_crud(self):
        """Test project management"""
        print("\n📁 Testing Project Management")
        
        # List projects
        success, _ = self.run_test("List Projects", "GET", "projects", 200)
        if not success:
            return False
            
        # Create project
        project_data = {
            "name": f"Test Project {datetime.now().strftime('%H%M%S')}",
            "description": "Test project for API validation",
            "client_id": self.created_client_id,
            "status": "planning",
            "start_date": "2024-01-01T00:00:00Z",
            "target_date": "2024-06-01T00:00:00Z"
        }
        
        success, response = self.run_test("Create Project", "POST", "projects", 200, data=project_data)
        if success and 'id' in response:
            self.created_project_id = response['id']
            print(f"   📁 Created project: {response['name']}")
        
        return success

    def test_incidents_crud(self):
        """Test incident management"""
        print("\n🚨 Testing Incident Management")
        
        # List incidents
        success, _ = self.run_test("List Incidents", "GET", "incidents", 200)
        if not success:
            return False
            
        # Create incident
        incident_data = {
            "title": f"Test Incident {datetime.now().strftime('%H%M%S')}",
            "server_id": self.created_server_id,
            "client_id": self.created_client_id,
            "severity": "high",
            "description": "Test incident for API validation"
        }
        
        success, response = self.run_test("Create Incident", "POST", "incidents", 200, data=incident_data)
        if success and 'id' in response:
            incident_id = response['id']
            print(f"   🚨 Created incident: {response['title']}")
            
            # Test resolve incident
            success, _ = self.run_test("Resolve Incident", "PUT", f"incidents/{incident_id}/resolve", 200,
                                     data={"root_cause": "Test resolution", "resolution_notes": "Resolved for testing"})
        
        return success

    def test_maintenance_crud(self):
        """Test maintenance scheduling"""
        print("\n🔧 Testing Maintenance Management")
        
        if not self.created_server_id:
            print("   ⚠️  Skipping maintenance tests - no server available")
            return True
            
        # List maintenance
        success, _ = self.run_test("List Maintenance", "GET", "maintenance", 200)
        if not success:
            return False
            
        # Schedule maintenance
        maintenance_data = {
            "server_id": self.created_server_id,
            "maintenance_type": "security_updates",
            "scheduled_date": "2024-02-01T02:00:00Z",
            "notes": "Test maintenance for API validation"
        }
        
        success, response = self.run_test("Schedule Maintenance", "POST", "maintenance", 200, data=maintenance_data)
        if success and 'id' in response:
            maintenance_id = response['id']
            print(f"   🔧 Scheduled maintenance: {response['maintenance_type']}")
            
            # Complete maintenance
            success, _ = self.run_test("Complete Maintenance", "PUT", f"maintenance/{maintenance_id}/complete", 200,
                                     data={"notes": "Completed for testing"})
        
        return success

    def test_documentation_crud(self):
        """Test documentation management"""
        print("\n📚 Testing Documentation Management")
        
        # List documents
        success, _ = self.run_test("List Documents", "GET", "docs", 200)
        if not success:
            return False
            
        # Create document
        doc_data = {
            "title": f"Test Document {datetime.now().strftime('%H%M%S')}",
            "slug": f"test-doc-{datetime.now().strftime('%H%M%S')}",
            "category": "procedures",
            "content": "# Test Document\n\nThis is a test document for API validation.",
            "is_published": True
        }
        
        success, response = self.run_test("Create Document", "POST", "docs", 200, data=doc_data)
        if success and 'id' in response:
            print(f"   📄 Created document: {response['title']}")
            
            # Get document by slug
            success, _ = self.run_test("Get Document by Slug", "GET", f"docs/{response['slug']}", 200)
        
        return success

    def test_time_tracking(self):
        """Test time tracking functionality"""
        print("\n⏱️ Testing Time Tracking")
        
        # List time entries
        success, _ = self.run_test("List Time Entries", "GET", "time-entries", 200)
        if not success:
            return False
            
        # Create time entry
        time_data = {
            "client_id": self.created_client_id,
            "task_id": self.created_task_id,
            "entry_date": "2024-01-15T10:00:00Z",
            "duration_minutes": 120,
            "description": "Test time entry for API validation",
            "is_billable": True
        }
        
        success, response = self.run_test("Create Time Entry", "POST", "time-entries", 200, data=time_data)
        if success and 'id' in response:
            print(f"   ⏱️  Created time entry: {response['duration_minutes']} minutes")
        
        return success

    def test_health_checks(self):
        """Test health check functionality"""
        print("\n🩺 Testing Health Checks")
        
        # Get health check templates
        success, templates = self.run_test("Get Health Check Templates", "GET", "health-checks/templates", 200)
        if not success:
            return False
            
        print(f"   📋 Found {len(templates)} health check templates")
        
        if self.created_server_id:
            # Generate health checks for server
            success, response = self.run_test("Generate Server Health Checks", "POST", 
                                            f"health-checks/server/{self.created_server_id}/generate", 200)
            if success:
                print(f"   🩺 Generated {response.get('count', 0)} health checks")
                
                # Get server health checks
                success, checks = self.run_test("Get Server Health Checks", "GET", 
                                               f"health-checks/server/{self.created_server_id}", 200)
                if success and len(checks) > 0:
                    # Update a health check
                    check_id = checks[0]['id']
                    success, _ = self.run_test("Update Health Check", "PUT", f"health-checks/{check_id}", 200,
                                             data={"status": "passed", "notes": "Test passed", "value_recorded": "OK"})
        
        return success

    def test_sophie_ai(self):
        """Test Sophie AI chat functionality"""
        print("\n🤖 Testing Sophie AI")
        
        # Test Sophie chat
        sophie_data = {
            "message": "Hello Sophie, this is a test message",
            "session_id": str(uuid.uuid4()),
            "context": {"test": True}
        }
        
        success, response = self.run_test("Sophie Chat", "POST", "sophie/chat", 200, data=sophie_data)
        if success and 'content' in response:
            print(f"   🤖 Sophie responded: {response['content'][:50]}...")
        
        return success

    def test_admin_functions(self):
        """Test admin-only functionality"""
        print("\n👑 Testing Admin Functions")
        
        # List users (admin only)
        success, users = self.run_test("List Users (Admin)", "GET", "users", 200)
        if success:
            print(f"   👥 Found {len(users)} users in system")
        
        return success

    def test_tactical_rmm_integration(self):
        """Test Tactical RMM integration"""
        print("\n🔗 Testing Tactical RMM Integration")
        
        # Test connection (might fail if not configured)
        success, response = self.run_test("Test TRMM Connection", "GET", "integrations/trmm/test", 200)
        if not success:
            # Try sync endpoint
            success, response = self.run_test("TRMM Sync", "POST", "integrations/trmm/sync", 200)
            if not success:
                print("   ⚠️  TRMM integration not configured or unavailable")
                return True  # Not critical for core functionality
        
        if success:
            print("   🔗 TRMM integration working")
        
        return True  # Always pass since TRMM might not be configured

    def cleanup_test_data(self):
        """Clean up test data"""
        print("\n🧹 Cleaning up test data...")
        
        # Delete created resources in reverse order
        cleanup_items = [
            (self.created_task_id, "tasks", "Task"),
            (self.created_project_id, "projects", "Project"), 
            (self.created_server_id, "servers", "Server"),
            (self.created_client_id, "clients", "Client")
        ]
        
        for item_id, endpoint, item_type in cleanup_items:
            if item_id:
                success, _ = self.run_test(f"Delete {item_type}", "DELETE", f"{endpoint}/{item_id}", 200)
                if success:
                    print(f"   🗑️  Deleted {item_type.lower()}")

    def run_full_test_suite(self):
        """Run the complete test suite"""
        print("🚀 STARTING SYNTHOPS API TEST SUITE")
        print(f"🎯 Target: {self.base_url}")
        print("=" * 80)
        
        start_time = datetime.now()
        
        # Authentication is required for all other tests
        if not self.test_login():
            return False
            
        # Core functionality tests
        test_methods = [
            self.test_user_profile,
            self.test_dashboard_stats,
            self.test_clients_crud,
            self.test_sites_crud,
            self.test_servers_crud,
            self.test_tasks_crud,
            self.test_projects_crud,
            self.test_incidents_crud,
            self.test_maintenance_crud,
            self.test_documentation_crud,
            self.test_time_tracking,
            self.test_health_checks,
            self.test_sophie_ai,
            self.test_admin_functions,
            self.test_tactical_rmm_integration
        ]
        
        for test_method in test_methods:
            try:
                test_method()
            except Exception as e:
                print(f"   💥 Test {test_method.__name__} crashed: {str(e)}")
        
        # Clean up
        self.cleanup_test_data()
        
        # Results
        end_time = datetime.now()
        duration = (end_time - start_time).total_seconds()
        
        print("\n" + "=" * 80)
        print("🏁 TEST SUITE COMPLETED")
        print("=" * 80)
        print(f"⏱️  Duration: {duration:.1f} seconds")
        print(f"📊 Results: {self.tests_passed}/{self.tests_run} tests passed")
        
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        print(f"📈 Success Rate: {success_rate:.1f}%")
        
        if success_rate >= 80:
            print("✅ OVERALL: PASS")
            return True
        else:
            print("❌ OVERALL: FAIL") 
            return False

def main():
    """Main entry point"""
    tester = SynthOpsAPITester()
    success = tester.run_full_test_suite()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())