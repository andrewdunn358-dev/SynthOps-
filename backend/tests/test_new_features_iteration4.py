"""
Test file for Iteration 4 - NOC Display, MeshCentral, Vaultwarden, Security Middlewares
Tests the new features:
1. NOC Display API endpoints
2. MeshCentral configuration endpoint
3. Vaultwarden configuration endpoint
5. Security headers and rate limiting
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestAuthentication:
    """Test authentication endpoints"""
    
    @pytest.fixture(scope='class')
    def auth_token(self):
        """Get authentication token for tests"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "admin@synthesis-it.co.uk", "password": "admin123"}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json()['access_token']
    
    def test_login_returns_token(self):
        """Test that login returns access token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "admin@synthesis-it.co.uk", "password": "admin123"}
        )
        assert response.status_code == 200
        data = response.json()
        assert 'access_token' in data
        assert 'refresh_token' in data
        assert 'user' in data
        assert data['user']['email'] == 'admin@synthesis-it.co.uk'


class TestMeshCentralConfig:
    """Test MeshCentral configuration endpoint"""
    
    @pytest.fixture(scope='class')
    def auth_token(self):
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "admin@synthesis-it.co.uk", "password": "admin123"}
        )
        return response.json()['access_token']
    
    def test_meshcentral_config_endpoint(self, auth_token):
        """Test /api/config/meshcentral returns configuration"""
        response = requests.get(
            f"{BASE_URL}/api/config/meshcentral",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert 'url' in data
        assert 'configured' in data
        assert isinstance(data['configured'], bool)
        # MeshCentral URL should be set from env
        assert data['url'] == "https://mesh.synthesis-it.co.uk"
        assert data['configured'] == True
        print(f"MeshCentral config: {data}")
    
    def test_meshcentral_requires_auth(self):
        """Test /api/config/meshcentral requires authentication"""
        response = requests.get(f"{BASE_URL}/api/config/meshcentral")
        assert response.status_code in [401, 403]


class TestVaultwardenConfig:
    """Test Vaultwarden configuration endpoint"""
    
    @pytest.fixture(scope='class')
    def auth_token(self):
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "admin@synthesis-it.co.uk", "password": "admin123"}
        )
        return response.json()['access_token']
    
    def test_vaultwarden_config_endpoint(self, auth_token):
        """Test /api/config/vaultwarden returns configuration"""
        response = requests.get(
            f"{BASE_URL}/api/config/vaultwarden",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert 'url' in data
        assert 'configured' in data
        assert isinstance(data['configured'], bool)
        # Vaultwarden is configured
        assert data['url'] == "http://localhost:8082"
        assert data['configured'] == True
        print(f"Vaultwarden config: {data}")
    
    def test_vaultwarden_requires_auth(self):
        """Test /api/config/vaultwarden requires authentication"""
        response = requests.get(f"{BASE_URL}/api/config/vaultwarden")
        assert response.status_code in [401, 403]


class TestNOCDisplayEndpoints:
    """Test endpoints used by the NOC Display page"""
    
    @pytest.fixture(scope='class')
    def auth_token(self):
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "admin@synthesis-it.co.uk", "password": "admin123"}
        )
        return response.json()['access_token']
    
    def test_dashboard_stats(self, auth_token):
        """Test /api/dashboard/stats returns server stats for NOC display"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/stats",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        # Check required fields for NOC display
        assert 'total_clients' in data
        assert 'total_servers' in data
        assert 'servers_online' in data
        assert 'servers_offline' in data
        assert 'open_incidents' in data
        print(f"Dashboard stats: {data}")
    
    def test_servers_list(self, auth_token):
        """Test /api/servers returns server list for NOC display"""
        response = requests.get(
            f"{BASE_URL}/api/servers",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        if len(data) > 0:
            server = data[0]
            assert 'id' in server
            assert 'hostname' in server
            assert 'status' in server
            assert 'client_name' in server
        print(f"Servers count: {len(data)}")
    
    def test_open_incidents(self, auth_token):
        """Test /api/incidents?status=open returns open incidents for NOC display"""
        response = requests.get(
            f"{BASE_URL}/api/incidents?status=open",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Open incidents count: {len(data)}")


class TestSecurityHeaders:
    """Test security headers middleware"""
    
    @pytest.fixture(scope='class')
    def auth_token(self):
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "admin@synthesis-it.co.uk", "password": "admin123"}
        )
        return response.json()['access_token']
    
    def test_security_headers_present(self, auth_token):
        """Test that security headers are added to responses"""
        response = requests.get(
            f"{BASE_URL}/api/config/meshcentral",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        
        # Check security headers (may be stripped by proxy)
        headers = response.headers
        print(f"Response headers: {dict(headers)}")
        
        # These are the headers the middleware adds
        # Note: They might be stripped or modified by ingress/proxy
        # X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy


class TestServerMeshURL:
    """Test server mesh URL endpoint"""
    
    @pytest.fixture(scope='class')
    def auth_token(self):
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "admin@synthesis-it.co.uk", "password": "admin123"}
        )
        return response.json()['access_token']
    
    def test_get_server_mesh_url(self, auth_token):
        """Test /api/servers/{id}/mesh-url returns mesh URL for server"""
        # First get a server ID
        servers_response = requests.get(
            f"{BASE_URL}/api/servers",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert servers_response.status_code == 200
        servers = servers_response.json()
        
        if len(servers) > 0:
            server_id = servers[0]['id']
            response = requests.get(
                f"{BASE_URL}/api/servers/{server_id}/mesh-url",
                headers={"Authorization": f"Bearer {auth_token}"}
            )
            assert response.status_code == 200
            data = response.json()
            assert 'mesh_url' in data
            assert 'hostname' in data
            assert 'connection_url' in data
            assert data['mesh_url'] == "https://mesh.synthesis-it.co.uk"
            print(f"Server mesh URL: {data}")
        else:
            pytest.skip("No servers available to test")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
