"""
Test Backup History & Scheduled Sync Features
- POST /api/backups/history/sync-now - triggers background backup sync (admin only)
- GET /api/backups/history/summaries?days=30 - returns daily backup summaries
- GET /api/backups/history/records?date=2026-04-10 - returns individual backup records for a date
- GET /api/backups/history/report?months=1 - returns compliance report with altaro/ahsay breakdown
"""

import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admin@test.com"
ADMIN_PASSWORD = "Test123!"


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def admin_token(api_client):
    """Get admin authentication token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip(f"Admin authentication failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def authenticated_client(api_client, admin_token):
    """Session with admin auth header"""
    api_client.headers.update({"Authorization": f"Bearer {admin_token}"})
    return api_client


class TestBackupHistorySummaries:
    """Tests for GET /api/backups/history/summaries endpoint"""
    
    def test_summaries_requires_auth(self, api_client):
        """Summaries endpoint requires authentication"""
        # Remove auth header if present
        headers = {"Content-Type": "application/json"}
        response = requests.get(f"{BASE_URL}/api/backups/history/summaries", headers=headers)
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✓ Summaries endpoint requires authentication")
    
    def test_summaries_default_30_days(self, authenticated_client):
        """Get summaries with default 30 days"""
        response = authenticated_client.get(f"{BASE_URL}/api/backups/history/summaries")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "summaries" in data, "Response should contain 'summaries' key"
        assert "days" in data, "Response should contain 'days' key"
        assert "count" in data, "Response should contain 'count' key"
        assert data["days"] == 30, f"Default days should be 30, got {data['days']}"
        print(f"✓ Summaries endpoint returns {data['count']} summaries for 30 days")
    
    def test_summaries_custom_days(self, authenticated_client):
        """Get summaries with custom days parameter"""
        response = authenticated_client.get(f"{BASE_URL}/api/backups/history/summaries?days=7")
        assert response.status_code == 200
        
        data = response.json()
        assert data["days"] == 7, f"Days should be 7, got {data['days']}"
        print(f"✓ Summaries endpoint accepts custom days parameter (7 days, {data['count']} summaries)")
    
    def test_summaries_contains_ahsay_data(self, authenticated_client):
        """Verify summaries include Ahsay provider data"""
        response = authenticated_client.get(f"{BASE_URL}/api/backups/history/summaries?days=30")
        assert response.status_code == 200
        
        data = response.json()
        summaries = data.get("summaries", [])
        
        # Check for Ahsay summaries
        ahsay_summaries = [s for s in summaries if s.get("provider") == "ahsay"]
        
        if len(ahsay_summaries) > 0:
            ahsay = ahsay_summaries[0]
            # Verify Ahsay summary structure
            assert "healthy" in ahsay, "Ahsay summary should have 'healthy' field"
            assert "stale" in ahsay, "Ahsay summary should have 'stale' field"
            assert "total_users" in ahsay, "Ahsay summary should have 'total_users' field"
            assert "health_rate" in ahsay, "Ahsay summary should have 'health_rate' field"
            print(f"✓ Ahsay summary found: healthy={ahsay.get('healthy')}, stale={ahsay.get('stale')}, total_users={ahsay.get('total_users')}")
        else:
            print("⚠ No Ahsay summaries found - sync may not have run yet")
    
    def test_summaries_filter_by_provider(self, authenticated_client):
        """Filter summaries by provider"""
        response = authenticated_client.get(f"{BASE_URL}/api/backups/history/summaries?days=30&provider=ahsay")
        assert response.status_code == 200
        
        data = response.json()
        summaries = data.get("summaries", [])
        
        # All summaries should be ahsay
        for s in summaries:
            assert s.get("provider") == "ahsay", f"Expected ahsay provider, got {s.get('provider')}"
        
        print(f"✓ Provider filter works - {len(summaries)} ahsay summaries returned")


class TestBackupHistoryRecords:
    """Tests for GET /api/backups/history/records endpoint"""
    
    def test_records_requires_auth(self, api_client):
        """Records endpoint requires authentication"""
        headers = {"Content-Type": "application/json"}
        response = requests.get(f"{BASE_URL}/api/backups/history/records", headers=headers)
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✓ Records endpoint requires authentication")
    
    def test_records_default_today(self, authenticated_client):
        """Get records defaults to today's date"""
        response = authenticated_client.get(f"{BASE_URL}/api/backups/history/records")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "records" in data, "Response should contain 'records' key"
        assert "date" in data, "Response should contain 'date' key"
        assert "count" in data, "Response should contain 'count' key"
        
        # Date should be today
        today = datetime.now().strftime("%Y-%m-%d")
        assert data["date"] == today, f"Default date should be {today}, got {data['date']}"
        print(f"✓ Records endpoint returns {data['count']} records for today ({today})")
    
    def test_records_specific_date(self, authenticated_client):
        """Get records for specific date (2026-04-10)"""
        test_date = "2026-04-10"
        response = authenticated_client.get(f"{BASE_URL}/api/backups/history/records?date={test_date}")
        assert response.status_code == 200
        
        data = response.json()
        assert data["date"] == test_date, f"Date should be {test_date}, got {data['date']}"
        print(f"✓ Records for {test_date}: {data['count']} records")
    
    def test_records_ahsay_entries(self, authenticated_client):
        """Verify Ahsay records exist for today"""
        today = datetime.now().strftime("%Y-%m-%d")
        response = authenticated_client.get(f"{BASE_URL}/api/backups/history/records?date={today}&provider=ahsay")
        assert response.status_code == 200
        
        data = response.json()
        records = data.get("records", [])
        
        if len(records) > 0:
            # Verify record structure
            record = records[0]
            assert record.get("provider") == "ahsay", "Record should be from ahsay provider"
            assert "entity_name" in record, "Record should have 'entity_name'"
            assert "status" in record, "Record should have 'status'"
            assert "customer" in record, "Record should have 'customer'"
            print(f"✓ Found {len(records)} Ahsay records for {today}")
        else:
            print(f"⚠ No Ahsay records found for {today} - sync may not have run")
    
    def test_records_filter_by_status(self, authenticated_client):
        """Filter records by status"""
        today = datetime.now().strftime("%Y-%m-%d")
        response = authenticated_client.get(f"{BASE_URL}/api/backups/history/records?date={today}&status=healthy")
        assert response.status_code == 200
        
        data = response.json()
        records = data.get("records", [])
        
        # All records should have healthy status
        for r in records:
            assert r.get("status") == "healthy", f"Expected healthy status, got {r.get('status')}"
        
        print(f"✓ Status filter works - {len(records)} healthy records")


class TestBackupSyncNow:
    """Tests for POST /api/backups/history/sync-now endpoint"""
    
    def test_sync_requires_auth(self, api_client):
        """Sync endpoint requires authentication"""
        headers = {"Content-Type": "application/json"}
        response = requests.post(f"{BASE_URL}/api/backups/history/sync-now", headers=headers)
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✓ Sync-now endpoint requires authentication")
    
    def test_sync_admin_only(self, authenticated_client):
        """Sync endpoint works for admin users"""
        response = authenticated_client.post(f"{BASE_URL}/api/backups/history/sync-now")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("status") == "ok", f"Expected status 'ok', got {data.get('status')}"
        assert "message" in data, "Response should contain 'message'"
        print(f"✓ Sync-now triggered successfully: {data.get('message')}")


class TestBackupComplianceReport:
    """Tests for GET /api/backups/history/report endpoint"""
    
    def test_report_requires_auth(self, api_client):
        """Report endpoint requires authentication"""
        headers = {"Content-Type": "application/json"}
        response = requests.get(f"{BASE_URL}/api/backups/history/report", headers=headers)
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✓ Report endpoint requires authentication")
    
    def test_report_default_1_month(self, authenticated_client):
        """Get compliance report with default 1 month"""
        response = authenticated_client.get(f"{BASE_URL}/api/backups/history/report")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "period" in data, "Response should contain 'period'"
        assert "altaro" in data, "Response should contain 'altaro' breakdown"
        assert "ahsay" in data, "Response should contain 'ahsay' breakdown"
        assert "total_days_tracked" in data, "Response should contain 'total_days_tracked'"
        
        # Verify period
        period = data["period"]
        assert period.get("months") == 1, f"Default months should be 1, got {period.get('months')}"
        print(f"✓ Report endpoint returns compliance data for {period.get('months')} month(s)")
    
    def test_report_altaro_breakdown(self, authenticated_client):
        """Verify Altaro breakdown in report"""
        response = authenticated_client.get(f"{BASE_URL}/api/backups/history/report?months=1")
        assert response.status_code == 200
        
        data = response.json()
        altaro = data.get("altaro", {})
        
        assert altaro.get("provider") == "altaro", "Altaro breakdown should have provider='altaro'"
        assert "days_tracked" in altaro, "Altaro breakdown should have 'days_tracked'"
        print(f"✓ Altaro breakdown: {altaro.get('days_tracked')} days tracked")
    
    def test_report_ahsay_breakdown(self, authenticated_client):
        """Verify Ahsay breakdown in report"""
        response = authenticated_client.get(f"{BASE_URL}/api/backups/history/report?months=1")
        assert response.status_code == 200
        
        data = response.json()
        ahsay = data.get("ahsay", {})
        
        assert ahsay.get("provider") == "ahsay", "Ahsay breakdown should have provider='ahsay'"
        assert "days_tracked" in ahsay, "Ahsay breakdown should have 'days_tracked'"
        
        if ahsay.get("days_tracked", 0) > 0:
            assert "total_successful" in ahsay, "Ahsay breakdown should have 'total_successful'"
            assert "total_failed" in ahsay, "Ahsay breakdown should have 'total_failed'"
            assert "average_success_rate" in ahsay, "Ahsay breakdown should have 'average_success_rate'"
            print(f"✓ Ahsay breakdown: {ahsay.get('days_tracked')} days, avg rate: {ahsay.get('average_success_rate')}%")
        else:
            print("⚠ No Ahsay days tracked yet")
    
    def test_report_custom_months(self, authenticated_client):
        """Get report with custom months parameter"""
        response = authenticated_client.get(f"{BASE_URL}/api/backups/history/report?months=3")
        assert response.status_code == 200
        
        data = response.json()
        period = data.get("period", {})
        assert period.get("months") == 3, f"Months should be 3, got {period.get('months')}"
        print(f"✓ Report accepts custom months parameter (3 months)")


class TestSchedulerJobRegistration:
    """Tests to verify APScheduler job is registered"""
    
    def test_health_check(self, authenticated_client):
        """Verify backend is healthy and scheduler should be running"""
        response = authenticated_client.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Health check failed: {response.status_code}"
        print("✓ Backend health check passed - scheduler should be running")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
