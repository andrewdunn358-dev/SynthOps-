from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Query, Body, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse, JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Any, Dict
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt
from cryptography.fernet import Fernet
import base64
import hashlib
import httpx
import asyncio
from collections import defaultdict
import time
# LLM imports - using OpenAI or Google Gemini directly
import openai
import google.generativeai as genai
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'change-me-in-production')
JWT_ALGORITHM = os.environ.get('JWT_ALGORITHM', 'HS256')
ACCESS_TOKEN_EXPIRE = int(os.environ.get('ACCESS_TOKEN_EXPIRE_MINUTES', 30))
REFRESH_TOKEN_EXPIRE = int(os.environ.get('REFRESH_TOKEN_EXPIRE_DAYS', 7))

# 20i API config
TWENTY_I_API_KEY = os.environ.get('TWENTY_I_API_KEY', '')

# Encryption key for sensitive fields
def get_encryption_key():
    key = os.environ.get('ENCRYPTION_KEY', 'default-key-change-me-32bytes!')
    key_bytes = hashlib.sha256(key.encode()).digest()
    return base64.urlsafe_b64encode(key_bytes)

fernet = Fernet(get_encryption_key())

def encrypt_field(value: str) -> str:
    if not value:
        return value
    return fernet.encrypt(value.encode()).decode()

def decrypt_field(value: str) -> str:
    if not value:
        return value
    try:
        return fernet.decrypt(value.encode()).decode()
    except:
        return value

# Create the main app
app = FastAPI(title="SynthOps API", version="1.0.0")
api_router = APIRouter(prefix="/api")
security = HTTPBearer()

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ==================== RATE LIMITING ====================

class RateLimiter:
    """Simple in-memory rate limiter - only for unauthenticated requests"""
    def __init__(self, requests_per_minute: int = 60):
        self.requests_per_minute = requests_per_minute
        self.requests: Dict[str, List[float]] = defaultdict(list)
    
    def is_allowed(self, client_ip: str) -> bool:
        now = time.time()
        minute_ago = now - 60
        
        # Clean old requests
        self.requests[client_ip] = [t for t in self.requests[client_ip] if t > minute_ago]
        
        if len(self.requests[client_ip]) >= self.requests_per_minute:
            return False
        
        self.requests[client_ip].append(now)
        return True

# Rate limiter only applies to unauthenticated login attempts
rate_limiter = RateLimiter(requests_per_minute=30)

class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        
        # ONLY rate limit login/register endpoints to prevent brute force
        # All other endpoints are unrestricted for normal app usage
        auth_endpoints = ["/api/auth/login", "/api/auth/register"]
        
        if path not in auth_endpoints:
            return await call_next(request)
        
        client_ip = request.client.host if request.client else "unknown"
        
        if not rate_limiter.is_allowed(client_ip):
            logger.warning(f"Rate limit exceeded for {client_ip} on {path}")
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many login attempts. Please try again later."}
            )
        
        return await call_next(request)

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        
        # Security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        
        return response

# ==================== MODELS ====================

class UserCreate(BaseModel):
    email: EmailStr
    username: str
    password: str
    role: str = "engineer"

class UserLogin(BaseModel):
    email: str  # Can be email or username
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    username: str
    role: str
    is_active: bool
    totp_enabled: bool = False
    created_at: datetime

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse

class ClientCreate(BaseModel):
    name: str
    code: str
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    address: Optional[str] = None
    contract_type: str = "monthly"
    contract_hours_monthly: Optional[int] = None
    notes: Optional[str] = None
    client_type: str = "managed"  # managed | unmanaged | web_services
    service_category: Optional[str] = None  # web_hosting | email_only | domain_only | broadband | mixed_services

class ClientResponse(BaseModel):
    id: str
    name: str
    code: str
    contact_name: Optional[str]
    contact_email: Optional[str]
    contact_phone: Optional[str]
    address: Optional[str]
    contract_type: str
    contract_hours_monthly: Optional[int]
    notes: Optional[str]
    is_active: bool
    tactical_rmm_client_id: Optional[int]
    created_at: datetime
    server_count: int = 0
    workstation_count: int = 0
    site_count: int = 0
    client_type: str = "managed"
    service_category: Optional[str] = None

class SiteCreate(BaseModel):
    client_id: str
    name: str
    address: Optional[str] = None
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None

class SiteResponse(BaseModel):
    id: str
    client_id: str
    client_name: Optional[str] = None
    name: str
    address: Optional[str]
    contact_name: Optional[str]
    contact_phone: Optional[str]
    tactical_rmm_site_id: Optional[int]
    is_active: bool
    created_at: datetime
    server_count: int = 0

class ServerCreate(BaseModel):
    site_id: str
    hostname: str
    role: Optional[str] = None
    server_type: str = "virtual"
    ip_address: Optional[str] = None
    operating_system: Optional[str] = None
    os_version: Optional[str] = None
    cpu_cores: Optional[int] = None
    ram_gb: Optional[int] = None
    storage_gb: Optional[int] = None
    environment: str = "production"
    criticality: str = "medium"
    notes: Optional[str] = None
    status: str = "online"

class ServerResponse(BaseModel):
    id: str
    site_id: str
    site_name: Optional[str] = None
    client_id: Optional[str] = None
    client_name: Optional[str] = None
    hostname: str
    role: Optional[str]
    server_type: str
    ip_address: Optional[str]
    public_ip: Optional[str] = None
    local_ips: Optional[list] = None
    operating_system: Optional[str]
    os_version: Optional[str]
    cpu_cores: Optional[int]
    ram_gb: Optional[int]
    storage_gb: Optional[int]
    environment: str
    criticality: str
    notes: Optional[str]
    status: str
    last_health_check: Optional[datetime]
    tactical_rmm_agent_id: Optional[str]
    mesh_node_id: Optional[str] = None
    monitoring_type: Optional[str] = None
    created_at: datetime

class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    server_id: Optional[str] = None
    project_id: Optional[str] = None
    client_id: Optional[str] = None
    priority: str = "medium"
    status: str = "open"
    due_date: Optional[datetime] = None
    assigned_to: Optional[str] = None
    # Recurring task fields
    is_recurring: bool = False
    recurrence_pattern: Optional[str] = None  # daily, weekly, monthly, yearly
    recurrence_interval: int = 1  # every X days/weeks/months
    recurrence_end_date: Optional[datetime] = None
    reminder_days: int = 0  # remind X days before due date

class TaskNoteCreate(BaseModel):
    content: str

class TaskNoteResponse(BaseModel):
    id: str
    task_id: str
    content: str
    created_by: str
    created_by_name: Optional[str] = None
    created_at: datetime

class TaskResponse(BaseModel):
    id: str
    title: str
    description: Optional[str]
    server_id: Optional[str]
    server_name: Optional[str] = None
    project_id: Optional[str]
    project_name: Optional[str] = None
    client_id: Optional[str]
    client_name: Optional[str] = None
    priority: str
    status: str
    due_date: Optional[datetime]
    assigned_to: Optional[str]
    assigned_to_name: Optional[str] = None
    created_by: str
    created_at: datetime
    updated_at: Optional[datetime]
    # Recurring task fields
    is_recurring: bool = False
    recurrence_pattern: Optional[str] = None
    recurrence_interval: int = 1
    recurrence_end_date: Optional[datetime] = None
    reminder_days: int = 0
    next_due_date: Optional[datetime] = None
    notes_count: int = 0

class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    client_id: Optional[str] = None
    status: str = "planning"
    start_date: Optional[datetime] = None
    target_date: Optional[datetime] = None

class ProjectResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    client_id: Optional[str]
    client_name: Optional[str] = None
    status: str
    start_date: Optional[datetime]
    target_date: Optional[datetime]
    created_by: str
    created_at: datetime
    task_count: int = 0
    completed_tasks: int = 0

class IncidentCreate(BaseModel):
    title: str
    server_id: Optional[str] = None
    client_id: Optional[str] = None
    severity: str = "medium"
    description: Optional[str] = None

class IncidentResponse(BaseModel):
    id: str
    title: str
    server_id: Optional[str]
    server_name: Optional[str] = None
    client_id: Optional[str]
    client_name: Optional[str] = None
    severity: str
    status: str
    date_opened: datetime
    date_resolved: Optional[datetime]
    description: Optional[str]
    root_cause: Optional[str]
    resolution_notes: Optional[str]
    created_by: str
    resolved_by: Optional[str]

class MaintenanceCreate(BaseModel):
    server_id: str
    maintenance_type: str
    scheduled_date: Optional[datetime] = None
    notes: Optional[str] = None

class MaintenanceResponse(BaseModel):
    id: str
    server_id: str
    server_name: Optional[str] = None
    client_name: Optional[str] = None
    maintenance_type: str
    scheduled_date: Optional[datetime]
    completed_date: Optional[datetime]
    engineer_id: Optional[str]
    engineer_name: Optional[str] = None
    notes: Optional[str]
    status: str
    created_at: datetime

class DocumentCreate(BaseModel):
    title: str
    slug: Optional[str] = None
    category: Optional[str] = None
    content: str
    is_published: bool = True

class DocumentResponse(BaseModel):
    id: str
    title: str
    slug: str
    category: Optional[str]
    content: str
    is_published: bool
    created_by: str
    created_at: datetime
    updated_at: Optional[datetime]

class TimeEntryCreate(BaseModel):
    client_id: Optional[str] = None
    task_id: Optional[str] = None
    project_id: Optional[str] = None
    incident_id: Optional[str] = None
    entry_date: datetime
    duration_minutes: int
    description: Optional[str] = None
    is_billable: bool = True

class TimeEntryResponse(BaseModel):
    id: str
    user_id: str
    user_name: Optional[str] = None
    client_id: Optional[str]
    client_name: Optional[str] = None
    task_id: Optional[str]
    project_id: Optional[str]
    incident_id: Optional[str]
    entry_date: datetime
    duration_minutes: int
    description: Optional[str]
    is_billable: bool
    status: str
    created_at: datetime

class HealthCheckTemplateResponse(BaseModel):
    id: str
    category: str
    name: str
    description: Optional[str]
    check_type: str
    server_roles: Optional[List[str]]
    frequency: str
    is_active: bool

class HealthCheckCreate(BaseModel):
    server_id: str
    template_id: str
    status: str = "pending"
    notes: Optional[str] = None
    value_recorded: Optional[str] = None

class HealthCheckResponse(BaseModel):
    id: str
    server_id: str
    server_name: Optional[str] = None
    template_id: str
    template_name: Optional[str] = None
    category: Optional[str] = None
    check_date: datetime
    period_month: int
    period_year: int
    performed_by: Optional[str]
    performer_name: Optional[str] = None
    status: str
    notes: Optional[str]
    value_recorded: Optional[str]

class SophieMessage(BaseModel):
    message: str
    session_id: Optional[str] = None
    context: Optional[Dict[str, Any]] = None

class DashboardStats(BaseModel):
    total_clients: int
    total_servers: int
    servers_online: int
    servers_offline: int
    open_incidents: int
    open_tasks: int
    active_projects: int
    pending_health_checks: int

# Infrastructure monitoring models
class InfraDeviceCreate(BaseModel):
    name: str
    device_type: str  # proxmox, snmp, ping
    ip_address: str
    port: Optional[int] = None
    location: Optional[str] = None
    description: Optional[str] = None
    # Proxmox specific
    api_token_id: Optional[str] = None
    api_token_secret: Optional[str] = None
    # SNMP specific
    snmp_community: Optional[str] = None
    snmp_version: Optional[str] = "2c"
    # General
    check_interval: int = 60  # seconds
    is_active: bool = True

class InfraDeviceResponse(BaseModel):
    id: str
    name: str
    device_type: str
    ip_address: str
    port: Optional[int]
    location: Optional[str]
    description: Optional[str]
    status: str  # online, offline, unknown
    last_check: Optional[datetime]
    last_seen: Optional[datetime]
    response_time_ms: Optional[int]
    check_interval: int
    is_active: bool
    created_at: datetime
    # Extra data from monitoring
    extra_data: Optional[Dict[str, Any]] = None

# Customer CRM models
class CustomerNoteCreate(BaseModel):
    content: str

class CustomerNoteResponse(BaseModel):
    id: str
    customer_id: str
    content: str
    created_by: str
    created_by_name: Optional[str] = None
    created_at: datetime

class CustomerCreate(BaseModel):
    name: str
    trmm_client_id: Optional[str] = None  # Link to TRMM client if exists
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    address: Optional[str] = None
    website: Optional[str] = None
    contract_type: Optional[str] = None
    contract_value: Optional[float] = None
    contract_start: Optional[datetime] = None
    contract_end: Optional[datetime] = None
    account_manager: Optional[str] = None
    technical_contact: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = []
    is_active: bool = True

class CustomerResponse(BaseModel):
    id: str
    name: str
    trmm_client_id: Optional[str]
    trmm_client_name: Optional[str] = None
    contact_name: Optional[str]
    contact_email: Optional[str]
    contact_phone: Optional[str]
    address: Optional[str]
    website: Optional[str]
    contract_type: Optional[str]
    contract_value: Optional[float]
    contract_start: Optional[datetime]
    contract_end: Optional[datetime]
    account_manager: Optional[str]
    account_manager_name: Optional[str] = None
    technical_contact: Optional[str]
    notes: Optional[str]
    tags: Optional[List[str]]
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime]
    notes_count: int = 0
    servers_count: int = 0
    workstations_count: int = 0

# Stock/Asset tracking models
class AssetCreate(BaseModel):
    name: str
    asset_type: str  # server, laptop, desktop, network, storage, other
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    specifications: Optional[str] = None  # CPU, RAM, Storage etc
    purchase_date: Optional[datetime] = None
    purchase_cost: Optional[float] = None
    warranty_end: Optional[datetime] = None
    supplier: Optional[str] = None
    status: str = "in_stock"  # in_stock, in_refurb, deployed, disposed, sold
    condition: str = "new"  # new, refurbished, used
    assigned_customer_id: Optional[str] = None
    location: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = []

class AssetResponse(BaseModel):
    id: str
    name: str
    asset_type: str
    manufacturer: Optional[str]
    model: Optional[str]
    serial_number: Optional[str]
    specifications: Optional[str]
    purchase_date: Optional[datetime]
    purchase_cost: Optional[float]
    warranty_end: Optional[datetime]
    supplier: Optional[str]
    status: str
    condition: str
    assigned_customer_id: Optional[str]
    assigned_customer_name: Optional[str] = None
    location: Optional[str]
    notes: Optional[str]
    tags: Optional[List[str]]
    created_by: str
    created_at: datetime
    updated_at: Optional[datetime]

# ==================== AUTH HELPERS ====================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def create_access_token(user_id: str, email: str, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE)
    payload = {"sub": user_id, "email": email, "role": role, "exp": expire, "type": "access"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE)
    payload = {"sub": user_id, "exp": expire, "type": "refresh"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user_id = payload.get("sub")
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        if not user.get("is_active", True):
            raise HTTPException(status_code=401, detail="User is deactivated")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def require_admin(user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

# ==================== AUTH ROUTES ====================

@api_router.post("/auth/register", response_model=UserResponse)
async def register(user_data: UserCreate):
    # Normalize email and username to lowercase for case-insensitive matching
    email_lower = user_data.email.lower()
    username_lower = user_data.username.lower()
    
    existing = await db.users.find_one({"$or": [{"email": email_lower}, {"username": username_lower}]})
    if existing:
        raise HTTPException(status_code=400, detail="Email or username already exists")
    
    user_count = await db.users.count_documents({})
    role = "admin" if user_count == 0 else user_data.role
    
    user = {
        "id": str(uuid.uuid4()),
        "email": email_lower,
        "username": username_lower,
        "password_hash": hash_password(user_data.password),
        "role": role,
        "is_active": True,
        "totp_enabled": False,
        "totp_secret": None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user)
    return UserResponse(id=user["id"], email=user["email"], username=user["username"], 
                       role=user["role"], is_active=user["is_active"], totp_enabled=False,
                       created_at=datetime.fromisoformat(user["created_at"]))


@api_router.get("/health")
async def health_check():
    """Simple health check endpoint for Docker"""
    return {"status": "healthy"}

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    # Case-insensitive lookup - allow login with email or username
    identifier = credentials.email.lower()
    user = await db.users.find_one({
        "$or": [{"email": identifier}, {"username": identifier}]
    }, {"_id": 0})
    if not user or not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.get("is_active", True):
        raise HTTPException(status_code=401, detail="Account is deactivated")
    
    access_token = create_access_token(user["id"], user["email"], user["role"])
    refresh_token = create_refresh_token(user["id"])
    
    await db.users.update_one({"id": user["id"]}, {"$set": {"last_login": datetime.now(timezone.utc).isoformat()}})
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse(
            id=user["id"], email=user["email"], username=user["username"],
            role=user["role"], is_active=user["is_active"], 
            totp_enabled=user.get("totp_enabled", False),
            created_at=datetime.fromisoformat(user["created_at"])
        )
    )

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(user: dict = Depends(get_current_user)):
    return UserResponse(
        id=user["id"], email=user["email"], username=user["username"],
        role=user["role"], is_active=user["is_active"],
        totp_enabled=user.get("totp_enabled", False),
        created_at=datetime.fromisoformat(user["created_at"])
    )

@api_router.post("/auth/refresh")
async def refresh_token(refresh_token: str = Body(..., embed=True)):
    try:
        payload = jwt.decode(refresh_token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        access_token = create_access_token(user["id"], user["email"], user["role"])
        return {"access_token": access_token, "token_type": "bearer"}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

# ==================== USER MANAGEMENT ====================

@api_router.get("/users", response_model=List[UserResponse])
async def list_users(user: dict = Depends(get_current_user)):
    """List all users - any authenticated user can view for task assignment"""
    users = await db.users.find({}, {"_id": 0, "password_hash": 0, "totp_secret": 0}).to_list(1000)
    return [UserResponse(
        id=u["id"], email=u["email"], username=u["username"],
        role=u["role"], is_active=u.get("is_active", True),
        totp_enabled=u.get("totp_enabled", False),
        created_at=datetime.fromisoformat(u["created_at"])
    ) for u in users]

@api_router.put("/users/{user_id}/role")
async def update_user_role(user_id: str, role: str = Body(..., embed=True), admin: dict = Depends(require_admin)):
    if role not in ["admin", "engineer", "viewer"]:
        raise HTTPException(status_code=400, detail="Invalid role")
    result = await db.users.update_one({"id": user_id}, {"$set": {"role": role}})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "Role updated"}

@api_router.put("/users/{user_id}/status")
async def toggle_user_status(user_id: str, is_active: bool = Body(..., embed=True), admin: dict = Depends(require_admin)):
    result = await db.users.update_one({"id": user_id}, {"$set": {"is_active": is_active}})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "Status updated"}

@api_router.put("/users/{user_id}/reset-password")
async def reset_user_password(user_id: str, password: str = Body(..., embed=True), admin: dict = Depends(require_admin)):
    """Reset a user's password (admin only)"""
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    
    password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    result = await db.users.update_one({"id": user_id}, {"$set": {"password_hash": password_hash}})
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"message": "Password reset successfully"}

# ==================== CLIENTS ====================

@api_router.get("/clients", response_model=List[ClientResponse])
async def list_clients(user: dict = Depends(get_current_user)):
    clients = await db.clients.find({"is_active": True}, {"_id": 0}).to_list(1000)
    result = []
    for c in clients:
        site_count = await db.sites.count_documents({"client_id": c["id"], "is_active": True})
        server_count = 0
        workstation_count = 0
        sites = await db.sites.find({"client_id": c["id"]}, {"id": 1}).to_list(1000)
        for site in sites:
            # Count only actual servers
            server_count += await db.servers.count_documents({
                "site_id": site["id"],
                "$or": [{"monitoring_type": "server"}, {"monitoring_type": {"$exists": False}}]
            })
            # Count workstations from both machines collection AND servers with workstation monitoring_type
            workstation_count += await db.machines.count_documents({"site_id": site["id"]})
            workstation_count += await db.servers.count_documents({"site_id": site["id"], "monitoring_type": "workstation"})
        
        result.append(ClientResponse(
            id=c["id"], name=c["name"], code=c["code"],
            contact_name=c.get("contact_name"), contact_email=c.get("contact_email"),
            contact_phone=c.get("contact_phone"), address=c.get("address"),
            contract_type=c.get("contract_type", "monthly"),
            contract_hours_monthly=c.get("contract_hours_monthly"),
            notes=decrypt_field(c.get("notes")) if c.get("notes") else None,
            is_active=c.get("is_active", True),
            tactical_rmm_client_id=c.get("tactical_rmm_client_id"),
            created_at=datetime.fromisoformat(c["created_at"]),
            server_count=server_count, workstation_count=workstation_count, site_count=site_count,
            client_type=c.get("client_type", "managed"),
            service_category=c.get("service_category"),
        ))
    return result

@api_router.get("/clients/{client_id}", response_model=ClientResponse)
async def get_client(client_id: str, user: dict = Depends(get_current_user)):
    c = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    site_count = await db.sites.count_documents({"client_id": client_id, "is_active": True})
    server_count = 0
    workstation_count = 0
    sites = await db.sites.find({"client_id": client_id}, {"id": 1}).to_list(1000)
    for site in sites:
        # Count only actual servers
        server_count += await db.servers.count_documents({
            "site_id": site["id"],
            "$or": [{"monitoring_type": "server"}, {"monitoring_type": {"$exists": False}}]
        })
        # Count workstations from both machines collection AND servers with workstation monitoring_type
        workstation_count += await db.machines.count_documents({"site_id": site["id"]})
        workstation_count += await db.servers.count_documents({"site_id": site["id"], "monitoring_type": "workstation"})
    return ClientResponse(
        id=c["id"], name=c["name"], code=c["code"],
        contact_name=c.get("contact_name"), contact_email=c.get("contact_email"),
        contact_phone=c.get("contact_phone"), address=c.get("address"),
        contract_type=c.get("contract_type", "monthly"),
        contract_hours_monthly=c.get("contract_hours_monthly"),
        notes=decrypt_field(c.get("notes")) if c.get("notes") else None,
        is_active=c.get("is_active", True),
        tactical_rmm_client_id=c.get("tactical_rmm_client_id"),
        created_at=datetime.fromisoformat(c["created_at"]),
        server_count=server_count, workstation_count=workstation_count, site_count=site_count,
        client_type=c.get("client_type", "managed"),
        service_category=c.get("service_category"),
    )

@api_router.post("/clients", response_model=ClientResponse)
async def create_client(client_data: ClientCreate, user: dict = Depends(get_current_user)):
    existing = await db.clients.find_one({"code": client_data.code})
    if existing:
        raise HTTPException(status_code=400, detail="Client code already exists")
    
    client = {
        "id": str(uuid.uuid4()),
        "name": client_data.name,
        "code": client_data.code.upper(),
        "contact_name": client_data.contact_name,
        "contact_email": client_data.contact_email,
        "contact_phone": client_data.contact_phone,
        "address": client_data.address,
        "contract_type": client_data.contract_type,
        "contract_hours_monthly": client_data.contract_hours_monthly,
        "notes": encrypt_field(client_data.notes) if client_data.notes else None,
        "is_active": True,
        "tactical_rmm_client_id": None,
        "client_type": client_data.client_type,
        "service_category": client_data.service_category,
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.clients.insert_one(client)
    return ClientResponse(
        id=client["id"], name=client["name"], code=client["code"],
        contact_name=client["contact_name"], contact_email=client["contact_email"],
        contact_phone=client["contact_phone"], address=client["address"],
        contract_type=client["contract_type"],
        contract_hours_monthly=client["contract_hours_monthly"],
        notes=client_data.notes, is_active=True, tactical_rmm_client_id=None,
        created_at=datetime.fromisoformat(client["created_at"]),
        server_count=0, site_count=0,
        client_type=client["client_type"],
        service_category=client["service_category"],
    )

@api_router.put("/clients/{client_id}", response_model=ClientResponse)
async def update_client(client_id: str, client_data: ClientCreate, user: dict = Depends(get_current_user)):
    update_data = {
        "name": client_data.name,
        "code": client_data.code.upper(),
        "contact_name": client_data.contact_name,
        "contact_email": client_data.contact_email,
        "contact_phone": client_data.contact_phone,
        "address": client_data.address,
        "contract_type": client_data.contract_type,
        "contract_hours_monthly": client_data.contract_hours_monthly,
        "notes": encrypt_field(client_data.notes) if client_data.notes else None,
        "client_type": client_data.client_type,
        "service_category": client_data.service_category,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.clients.update_one({"id": client_id}, {"$set": update_data})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Client not found")
    return await get_client(client_id, user)

@api_router.delete("/clients/{client_id}")
async def delete_client(client_id: str, user: dict = Depends(get_current_user)):
    result = await db.clients.update_one({"id": client_id}, {"$set": {"is_active": False}})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Client not found")
    return {"message": "Client deactivated"}

# ==================== SITES ====================

@api_router.get("/sites", response_model=List[SiteResponse])
async def list_sites(client_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = {"is_active": True}
    if client_id:
        query["client_id"] = client_id
    sites = await db.sites.find(query, {"_id": 0}).to_list(1000)
    result = []
    for s in sites:
        client = await db.clients.find_one({"id": s["client_id"]}, {"name": 1})
        server_count = await db.servers.count_documents({"site_id": s["id"]})
        result.append(SiteResponse(
            id=s["id"], client_id=s["client_id"],
            client_name=client["name"] if client else None,
            name=s["name"], address=s.get("address"),
            contact_name=s.get("contact_name"), contact_phone=s.get("contact_phone"),
            tactical_rmm_site_id=s.get("tactical_rmm_site_id"),
            is_active=s.get("is_active", True),
            created_at=datetime.fromisoformat(s["created_at"]),
            server_count=server_count
        ))
    return result

@api_router.post("/sites", response_model=SiteResponse)
async def create_site(site_data: SiteCreate, user: dict = Depends(get_current_user)):
    client = await db.clients.find_one({"id": site_data.client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    site = {
        "id": str(uuid.uuid4()),
        "client_id": site_data.client_id,
        "name": site_data.name,
        "address": site_data.address,
        "contact_name": site_data.contact_name,
        "contact_phone": site_data.contact_phone,
        "tactical_rmm_site_id": None,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.sites.insert_one(site)
    return SiteResponse(
        id=site["id"], client_id=site["client_id"], client_name=client["name"],
        name=site["name"], address=site["address"],
        contact_name=site["contact_name"], contact_phone=site["contact_phone"],
        tactical_rmm_site_id=None, is_active=True,
        created_at=datetime.fromisoformat(site["created_at"]), server_count=0
    )

@api_router.delete("/sites/{site_id}")
async def delete_site(site_id: str, user: dict = Depends(get_current_user)):
    result = await db.sites.update_one({"id": site_id}, {"$set": {"is_active": False}})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Site not found")
    return {"message": "Site deactivated"}

# ==================== SERVERS ====================

@api_router.get("/servers", response_model=List[ServerResponse])
async def list_servers(client_id: Optional[str] = None, site_id: Optional[str] = None, 
                       status: Optional[str] = None, include_workstations: bool = False,
                       user: dict = Depends(get_current_user)):
    query = {}
    
    # By default, only return actual servers (not workstations that may be in the collection)
    if not include_workstations:
        query["$or"] = [
            {"monitoring_type": "server"},
            {"monitoring_type": {"$exists": False}}  # Include manually added servers without monitoring_type
        ]
    
    if site_id:
        query["site_id"] = site_id
    if status:
        query["status"] = status
    
    if client_id:
        sites = await db.sites.find({"client_id": client_id}, {"id": 1}).to_list(1000)
        site_ids = [s["id"] for s in sites]
        query["site_id"] = {"$in": site_ids}
    
    servers = await db.servers.find(query, {"_id": 0}).to_list(1000)
    result = []
    for s in servers:
        site = await db.sites.find_one({"id": s["site_id"]}, {"name": 1, "client_id": 1})
        client_name = None
        client_id_val = None
        if site:
            client = await db.clients.find_one({"id": site["client_id"]}, {"name": 1})
            client_name = client["name"] if client else None
            client_id_val = site["client_id"]
        
        result.append(ServerResponse(
            id=s["id"], site_id=s["site_id"], site_name=site["name"] if site else None,
            client_id=client_id_val, client_name=client_name,
            hostname=s["hostname"], role=s.get("role"), server_type=s.get("server_type", "virtual"),
            ip_address=s.get("ip_address"), 
            public_ip=s.get("public_ip"),
            local_ips=s.get("local_ips"),
            operating_system=s.get("operating_system"),
            os_version=s.get("os_version"), cpu_cores=s.get("cpu_cores"),
            ram_gb=s.get("ram_gb"), storage_gb=s.get("storage_gb"),
            environment=s.get("environment", "production"),
            criticality=s.get("criticality", "medium"),
            notes=decrypt_field(s.get("notes")) if s.get("notes") else None,
            status=s.get("status", "online"),
            last_health_check=datetime.fromisoformat(s["last_health_check"]) if s.get("last_health_check") else None,
            tactical_rmm_agent_id=s.get("tactical_rmm_agent_id"),
            mesh_node_id=s.get("mesh_node_id"),
            monitoring_type=s.get("monitoring_type"),
            created_at=datetime.fromisoformat(s["created_at"])
        ))
    return result

@api_router.get("/servers/{server_id}", response_model=ServerResponse)
async def get_server(server_id: str, user: dict = Depends(get_current_user)):
    s = await db.servers.find_one({"id": server_id}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Server not found")
    
    site = await db.sites.find_one({"id": s["site_id"]}, {"name": 1, "client_id": 1})
    client_name = None
    client_id_val = None
    if site:
        client = await db.clients.find_one({"id": site["client_id"]}, {"name": 1})
        client_name = client["name"] if client else None
        client_id_val = site["client_id"]
    
    return ServerResponse(
        id=s["id"], site_id=s["site_id"], site_name=site["name"] if site else None,
        client_id=client_id_val, client_name=client_name,
        hostname=s["hostname"], role=s.get("role"), server_type=s.get("server_type", "virtual"),
        ip_address=s.get("ip_address"),
        public_ip=s.get("public_ip"),
        local_ips=s.get("local_ips"),
        operating_system=s.get("operating_system"),
        os_version=s.get("os_version"), cpu_cores=s.get("cpu_cores"),
        ram_gb=s.get("ram_gb"), storage_gb=s.get("storage_gb"),
        environment=s.get("environment", "production"),
        criticality=s.get("criticality", "medium"),
        notes=decrypt_field(s.get("notes")) if s.get("notes") else None,
        status=s.get("status", "online"),
        last_health_check=datetime.fromisoformat(s["last_health_check"]) if s.get("last_health_check") else None,
        tactical_rmm_agent_id=s.get("tactical_rmm_agent_id"),
        mesh_node_id=s.get("mesh_node_id"),
        monitoring_type=s.get("monitoring_type"),
        created_at=datetime.fromisoformat(s["created_at"])
    )

# Workstations endpoint - returns items from servers collection with monitoring_type=workstation
@api_router.get("/workstations")
async def list_workstations(client_id: Optional[str] = None, site_id: Optional[str] = None, 
                           status: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = {"monitoring_type": "workstation"}
    
    if site_id:
        query["site_id"] = site_id
    if status:
        query["status"] = status
    
    if client_id:
        sites = await db.sites.find({"client_id": client_id}, {"id": 1}).to_list(1000)
        site_ids = [s["id"] for s in sites]
        query["site_id"] = {"$in": site_ids}
    
    workstations = await db.servers.find(query, {"_id": 0}).sort("hostname", 1).to_list(1000)
    
    result = []
    for w in workstations:
        site = await db.sites.find_one({"id": w.get("site_id")}, {"name": 1, "client_id": 1})
        client_name = None
        if site:
            client = await db.clients.find_one({"id": site["client_id"]}, {"name": 1})
            client_name = client["name"] if client else None
        
        result.append({
            "id": w["id"],
            "hostname": w["hostname"],
            "site_id": w.get("site_id"),
            "site_name": site["name"] if site else None,
            "client_name": client_name,
            "ip_address": w.get("ip_address"),
            "public_ip": w.get("public_ip"),
            "local_ips": w.get("local_ips"),
            "operating_system": w.get("operating_system"),
            "status": w.get("status", "online"),
            "last_seen": w.get("last_seen"),
            "logged_in_username": w.get("logged_in_username"),
            "mesh_node_id": w.get("mesh_node_id"),
            "monitoring_type": w.get("monitoring_type"),
            "make_model": w.get("make_model"),
            "cpu_model": w.get("cpu_model"),
            "total_ram": w.get("total_ram"),
            "tactical_rmm_agent_id": w.get("tactical_rmm_agent_id"),
            "created_at": w.get("created_at")
        })
    return result

@api_router.post("/servers", response_model=ServerResponse)
async def create_server(server_data: ServerCreate, user: dict = Depends(get_current_user)):
    site = await db.sites.find_one({"id": server_data.site_id})
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    
    server = {
        "id": str(uuid.uuid4()),
        "site_id": server_data.site_id,
        "hostname": server_data.hostname,
        "role": server_data.role,
        "server_type": server_data.server_type,
        "ip_address": server_data.ip_address,
        "operating_system": server_data.operating_system,
        "os_version": server_data.os_version,
        "cpu_cores": server_data.cpu_cores,
        "ram_gb": server_data.ram_gb,
        "storage_gb": server_data.storage_gb,
        "environment": server_data.environment,
        "criticality": server_data.criticality,
        "notes": encrypt_field(server_data.notes) if server_data.notes else None,
        "status": server_data.status,
        "last_health_check": None,
        "tactical_rmm_agent_id": None,
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.servers.insert_one(server)
    return await get_server(server["id"], user)

@api_router.put("/servers/{server_id}", response_model=ServerResponse)
async def update_server(server_id: str, server_data: ServerCreate, user: dict = Depends(get_current_user)):
    update_data = {
        "hostname": server_data.hostname,
        "role": server_data.role,
        "server_type": server_data.server_type,
        "ip_address": server_data.ip_address,
        "operating_system": server_data.operating_system,
        "os_version": server_data.os_version,
        "cpu_cores": server_data.cpu_cores,
        "ram_gb": server_data.ram_gb,
        "storage_gb": server_data.storage_gb,
        "environment": server_data.environment,
        "criticality": server_data.criticality,
        "notes": encrypt_field(server_data.notes) if server_data.notes else None,
        "status": server_data.status,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.servers.update_one({"id": server_id}, {"$set": update_data})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Server not found")
    return await get_server(server_id, user)

@api_router.delete("/servers/{server_id}")
async def delete_server(server_id: str, user: dict = Depends(get_current_user)):
    result = await db.servers.delete_one({"id": server_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Server not found")
    return {"message": "Server deleted"}

# ==================== TASKS ====================

@api_router.get("/tasks", response_model=List[TaskResponse])
async def list_tasks(status: Optional[str] = None, client_id: Optional[str] = None,
                    project_id: Optional[str] = None, assigned_to: Optional[str] = None,
                    user: dict = Depends(get_current_user)):
    query = {}
    if status:
        query["status"] = status
    if client_id:
        query["client_id"] = client_id
    if project_id:
        query["project_id"] = project_id
    if assigned_to:
        query["assigned_to"] = assigned_to
    
    tasks = await db.tasks.find(query, {"_id": 0}).to_list(1000)
    result = []
    for t in tasks:
        server_name = None
        if t.get("server_id"):
            server = await db.servers.find_one({"id": t["server_id"]}, {"hostname": 1})
            server_name = server["hostname"] if server else None
        
        project_name = None
        if t.get("project_id"):
            project = await db.projects.find_one({"id": t["project_id"]}, {"name": 1})
            project_name = project["name"] if project else None
        
        client_name = None
        if t.get("client_id"):
            client = await db.clients.find_one({"id": t["client_id"]}, {"name": 1})
            client_name = client["name"] if client else None
        
        assigned_name = None
        if t.get("assigned_to"):
            assigned_user = await db.users.find_one({"id": t["assigned_to"]}, {"username": 1})
            assigned_name = assigned_user["username"] if assigned_user else None
        
        notes_count = await db.task_notes.count_documents({"task_id": t["id"]})
        
        result.append(TaskResponse(
            id=t["id"], title=t["title"],
            description=decrypt_field(t.get("description")) if t.get("description") else None,
            server_id=t.get("server_id"), server_name=server_name,
            project_id=t.get("project_id"), project_name=project_name,
            client_id=t.get("client_id"), client_name=client_name,
            priority=t.get("priority", "medium"), status=t.get("status", "open"),
            due_date=datetime.fromisoformat(t["due_date"]) if t.get("due_date") else None,
            assigned_to=t.get("assigned_to"), assigned_to_name=assigned_name,
            created_by=t["created_by"],
            created_at=datetime.fromisoformat(t["created_at"]),
            updated_at=datetime.fromisoformat(t["updated_at"]) if t.get("updated_at") else None,
            is_recurring=t.get("is_recurring", False),
            recurrence_pattern=t.get("recurrence_pattern"),
            recurrence_interval=t.get("recurrence_interval", 1),
            recurrence_end_date=datetime.fromisoformat(t["recurrence_end_date"]) if t.get("recurrence_end_date") else None,
            reminder_days=t.get("reminder_days", 0),
            notes_count=notes_count
        ))
    return result

@api_router.get("/tasks/kanban")
async def get_kanban_tasks(client_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = {}
    if client_id:
        query["client_id"] = client_id
    
    tasks = await list_tasks(client_id=client_id, user=user)
    kanban = {"open": [], "in_progress": [], "completed": [], "blocked": []}
    for task in tasks:
        status = task.status if task.status in kanban else "open"
        kanban[status].append(task)
    return kanban

# Upcoming tasks endpoint for dashboard - MUST be before /tasks/{task_id}
@api_router.get("/tasks/upcoming")
async def get_upcoming_tasks(days: int = 2, user: dict = Depends(get_current_user)):
    """Get tasks due within the next X days (including recurring tasks)"""
    now = datetime.now(timezone.utc)
    future_date = now + timedelta(days=days)
    
    # Find tasks with due dates in the range
    tasks = await db.tasks.find({
        "status": {"$ne": "completed"},
        "due_date": {
            "$gte": now.isoformat(),
            "$lte": future_date.isoformat()
        }
    }, {"_id": 0}).to_list(100)
    
    # Also find recurring tasks that need attention
    recurring_tasks = await db.tasks.find({
        "status": {"$ne": "completed"},
        "is_recurring": True,
        "due_date": {"$lte": future_date.isoformat()}
    }, {"_id": 0}).to_list(100)
    
    # Combine and enrich
    all_tasks = tasks + [t for t in recurring_tasks if t not in tasks]
    result = []
    
    for t in all_tasks:
        client_name = None
        if t.get("client_id"):
            client = await db.clients.find_one({"id": t["client_id"]}, {"name": 1})
            client_name = client["name"] if client else None
        
        assigned_name = None
        if t.get("assigned_to"):
            assigned_user = await db.users.find_one({"id": t["assigned_to"]}, {"username": 1})
            assigned_name = assigned_user["username"] if assigned_user else None
        
        result.append({
            "id": t["id"],
            "title": t["title"],
            "due_date": t.get("due_date"),
            "priority": t.get("priority", "medium"),
            "is_recurring": t.get("is_recurring", False),
            "recurrence_pattern": t.get("recurrence_pattern"),
            "client_name": client_name,
            "assigned_to_name": assigned_name
        })
    
    # Sort by due date
    result.sort(key=lambda x: x.get("due_date") or "9999")
    
    return result

@api_router.post("/tasks", response_model=TaskResponse)
async def create_task(task_data: TaskCreate, user: dict = Depends(get_current_user)):
    task = {
        "id": str(uuid.uuid4()),
        "title": task_data.title,
        "description": encrypt_field(task_data.description) if task_data.description else None,
        "server_id": task_data.server_id,
        "project_id": task_data.project_id,
        "client_id": task_data.client_id,
        "priority": task_data.priority,
        "status": task_data.status,
        "due_date": task_data.due_date.isoformat() if task_data.due_date else None,
        "assigned_to": task_data.assigned_to,
        "is_recurring": task_data.is_recurring,
        "recurrence_pattern": task_data.recurrence_pattern,
        "recurrence_interval": task_data.recurrence_interval,
        "recurrence_end_date": task_data.recurrence_end_date.isoformat() if task_data.recurrence_end_date else None,
        "reminder_days": task_data.reminder_days,
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.tasks.insert_one(task)
    tasks = await list_tasks(user=user)
    return next(t for t in tasks if t.id == task["id"])

@api_router.put("/tasks/{task_id}", response_model=TaskResponse)
async def update_task(task_id: str, task_data: TaskCreate, user: dict = Depends(get_current_user)):
    update_data = {
        "title": task_data.title,
        "description": encrypt_field(task_data.description) if task_data.description else None,
        "server_id": task_data.server_id,
        "project_id": task_data.project_id,
        "client_id": task_data.client_id,
        "priority": task_data.priority,
        "status": task_data.status,
        "due_date": task_data.due_date.isoformat() if task_data.due_date else None,
        "assigned_to": task_data.assigned_to,
        "is_recurring": task_data.is_recurring,
        "recurrence_pattern": task_data.recurrence_pattern,
        "recurrence_interval": task_data.recurrence_interval,
        "recurrence_end_date": task_data.recurrence_end_date.isoformat() if task_data.recurrence_end_date else None,
        "reminder_days": task_data.reminder_days,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.tasks.update_one({"id": task_id}, {"$set": update_data})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    tasks = await list_tasks(user=user)
    return next(t for t in tasks if t.id == task_id)

@api_router.put("/tasks/{task_id}/status")
async def update_task_status(task_id: str, status: str = Body(..., embed=True), user: dict = Depends(get_current_user)):
    if status not in ["open", "in_progress", "completed", "blocked"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    result = await db.tasks.update_one({"id": task_id}, {"$set": {"status": status, "updated_at": datetime.now(timezone.utc).isoformat()}})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"message": "Status updated"}

@api_router.delete("/tasks/{task_id}")
async def delete_task(task_id: str, user: dict = Depends(get_current_user)):
    result = await db.tasks.delete_one({"id": task_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    # Also delete associated notes
    await db.task_notes.delete_many({"task_id": task_id})
    return {"message": "Task deleted"}

# Task detail endpoint
@api_router.get("/tasks/{task_id}")
async def get_task_detail(task_id: str, user: dict = Depends(get_current_user)):
    """Get a single task with full details"""
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Enrich with related names
    server_name = None
    if task.get("server_id"):
        server = await db.servers.find_one({"id": task["server_id"]}, {"hostname": 1})
        server_name = server["hostname"] if server else None
    
    project_name = None
    if task.get("project_id"):
        project = await db.projects.find_one({"id": task["project_id"]}, {"name": 1})
        project_name = project["name"] if project else None
    
    client_name = None
    if task.get("client_id"):
        client = await db.clients.find_one({"id": task["client_id"]}, {"name": 1})
        client_name = client["name"] if client else None
    
    assigned_name = None
    if task.get("assigned_to"):
        assigned_user = await db.users.find_one({"id": task["assigned_to"]}, {"username": 1})
        assigned_name = assigned_user["username"] if assigned_user else None
    
    created_by_name = None
    created_user = await db.users.find_one({"id": task["created_by"]}, {"username": 1})
    created_by_name = created_user["username"] if created_user else None
    
    notes_count = await db.task_notes.count_documents({"task_id": task_id})
    
    return {
        **task,
        "description": decrypt_field(task.get("description")) if task.get("description") else None,
        "server_name": server_name,
        "project_name": project_name,
        "client_name": client_name,
        "assigned_to_name": assigned_name,
        "created_by_name": created_by_name,
        "notes_count": notes_count
    }

# Task Notes endpoints
@api_router.get("/tasks/{task_id}/notes")
async def get_task_notes(task_id: str, user: dict = Depends(get_current_user)):
    """Get all notes for a task"""
    task = await db.tasks.find_one({"id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    notes = await db.task_notes.find({"task_id": task_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    
    # Enrich with user names
    result = []
    for note in notes:
        created_by_name = None
        user_doc = await db.users.find_one({"id": note["created_by"]}, {"username": 1})
        created_by_name = user_doc["username"] if user_doc else None
        result.append({
            **note,
            "content": decrypt_field(note.get("content")) if note.get("content") else "",
            "created_by_name": created_by_name
        })
    
    return result

@api_router.post("/tasks/{task_id}/notes")
async def add_task_note(task_id: str, note_data: TaskNoteCreate, user: dict = Depends(get_current_user)):
    """Add a note to a task - available to all authenticated users"""
    task = await db.tasks.find_one({"id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    note = {
        "id": str(uuid.uuid4()),
        "task_id": task_id,
        "content": encrypt_field(note_data.content),
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.task_notes.insert_one(note)
    
    # Get the created note with user name
    user_doc = await db.users.find_one({"id": user["id"]}, {"username": 1})
    
    return {
        "id": note["id"],
        "task_id": task_id,
        "content": note_data.content,
        "created_by": user["id"],
        "created_by_name": user_doc["username"] if user_doc else None,
        "created_at": note["created_at"]
    }

@api_router.delete("/tasks/{task_id}/notes/{note_id}")
async def delete_task_note(task_id: str, note_id: str, user: dict = Depends(get_current_user)):
    """Delete a note - only the creator or admin can delete"""
    note = await db.task_notes.find_one({"id": note_id, "task_id": task_id})
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    # Check permission
    if note["created_by"] != user["id"] and user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to delete this note")
    
    await db.task_notes.delete_one({"id": note_id})
    return {"message": "Note deleted"}

# ==================== PROJECTS ====================

@api_router.get("/projects", response_model=List[ProjectResponse])
async def list_projects(client_id: Optional[str] = None, status: Optional[str] = None,
                       user: dict = Depends(get_current_user)):
    query = {}
    if client_id:
        query["client_id"] = client_id
    if status:
        query["status"] = status
    
    projects = await db.projects.find(query, {"_id": 0}).to_list(1000)
    result = []
    for p in projects:
        client_name = None
        if p.get("client_id"):
            client = await db.clients.find_one({"id": p["client_id"]}, {"name": 1})
            client_name = client["name"] if client else None
        
        task_count = await db.tasks.count_documents({"project_id": p["id"]})
        completed_tasks = await db.tasks.count_documents({"project_id": p["id"], "status": "completed"})
        
        result.append(ProjectResponse(
            id=p["id"], name=p["name"], description=p.get("description"),
            client_id=p.get("client_id"), client_name=client_name,
            status=p.get("status", "planning"),
            start_date=datetime.fromisoformat(p["start_date"]) if p.get("start_date") else None,
            target_date=datetime.fromisoformat(p["target_date"]) if p.get("target_date") else None,
            created_by=p["created_by"],
            created_at=datetime.fromisoformat(p["created_at"]),
            task_count=task_count, completed_tasks=completed_tasks
        ))
    return result

@api_router.post("/projects", response_model=ProjectResponse)
async def create_project(project_data: ProjectCreate, user: dict = Depends(get_current_user)):
    project = {
        "id": str(uuid.uuid4()),
        "name": project_data.name,
        "description": project_data.description,
        "client_id": project_data.client_id,
        "status": project_data.status,
        "start_date": project_data.start_date.isoformat() if project_data.start_date else None,
        "target_date": project_data.target_date.isoformat() if project_data.target_date else None,
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.projects.insert_one(project)
    projects = await list_projects(user=user)
    return next(p for p in projects if p.id == project["id"])

@api_router.get("/projects/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: str, user: dict = Depends(get_current_user)):
    """Get a single project by ID"""
    project = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Get client name
    client_name = None
    if project.get("client_id"):
        client = await db.clients.find_one({"id": project["client_id"]}, {"name": 1})
        client_name = client["name"] if client else None
    
    # Count tasks
    task_count = await db.tasks.count_documents({"project_id": project_id})
    completed_tasks = await db.tasks.count_documents({"project_id": project_id, "status": "done"})
    
    return ProjectResponse(
        id=project["id"],
        name=project["name"],
        description=project.get("description"),
        client_id=project.get("client_id"),
        client_name=client_name,
        status=project.get("status", "planning"),
        start_date=datetime.fromisoformat(project["start_date"]) if project.get("start_date") else None,
        target_date=datetime.fromisoformat(project["target_date"]) if project.get("target_date") else None,
        created_by=project["created_by"],
        created_at=datetime.fromisoformat(project["created_at"]),
        task_count=task_count,
        completed_tasks=completed_tasks
    )

@api_router.put("/projects/{project_id}", response_model=ProjectResponse)
async def update_project(project_id: str, project_data: ProjectCreate, user: dict = Depends(get_current_user)):
    update_data = {
        "name": project_data.name,
        "description": project_data.description,
        "client_id": project_data.client_id,
        "status": project_data.status,
        "start_date": project_data.start_date.isoformat() if project_data.start_date else None,
        "target_date": project_data.target_date.isoformat() if project_data.target_date else None,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.projects.update_one({"id": project_id}, {"$set": update_data})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    projects = await list_projects(user=user)
    return next(p for p in projects if p.id == project_id)

@api_router.delete("/projects/{project_id}")
async def delete_project(project_id: str, user: dict = Depends(get_current_user)):
    result = await db.projects.delete_one({"id": project_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    # Also delete associated jobs
    await db.project_jobs.delete_many({"project_id": project_id})
    return {"message": "Project deleted"}

# ==================== PROJECT JOBS & WORKSHEETS ====================

class JobCreate(BaseModel):
    title: str
    description: Optional[str] = None
    status: str = "pending"
    priority: str = "medium"
    assigned_to: Optional[str] = None
    estimated_hours: Optional[float] = None
    due_date: Optional[datetime] = None

class WorksheetCreate(BaseModel):
    work_performed: str
    hours_spent: float
    notes: Optional[str] = None
    billable: bool = True

@api_router.get("/projects/{project_id}/jobs")
async def get_project_jobs(project_id: str, user: dict = Depends(get_current_user)):
    """Get all jobs for a project"""
    jobs = await db.project_jobs.find({"project_id": project_id}, {"_id": 0}).to_list(100)
    
    result = []
    for job in jobs:
        # Get assignee name
        assigned_to_name = None
        if job.get("assigned_to"):
            assignee = await db.users.find_one({"id": job["assigned_to"]}, {"username": 1})
            assigned_to_name = assignee["username"] if assignee else None
        
        # Get worksheets with user names
        worksheets = await db.job_worksheets.find({"job_id": job["id"]}, {"_id": 0}).to_list(100)
        
        # Add logged_by_name and format logged_at for each worksheet
        enriched_worksheets = []
        for ws in worksheets:
            logged_by_name = None
            if ws.get("user_id"):
                ws_user = await db.users.find_one({"id": ws["user_id"]}, {"username": 1})
                logged_by_name = ws_user["username"] if ws_user else None
            enriched_worksheets.append({
                **ws,
                "logged_by_name": logged_by_name,
                "logged_at": ws.get("created_at"),
                "is_billable": ws.get("billable", True)
            })
        
        # Calculate actual hours
        actual_hours = sum(ws.get("hours_spent", 0) for ws in worksheets)
        
        result.append({
            **job,
            "assigned_to_name": assigned_to_name,
            "actual_hours": actual_hours,
            "worksheets": enriched_worksheets
        })
    
    return result

@api_router.post("/projects/{project_id}/jobs")
async def create_project_job(project_id: str, job_data: JobCreate, user: dict = Depends(get_current_user)):
    """Create a new job for a project"""
    # Verify project exists
    project = await db.projects.find_one({"id": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    job = {
        "id": str(uuid.uuid4()),
        "project_id": project_id,
        "title": job_data.title,
        "description": job_data.description,
        "status": job_data.status,
        "priority": job_data.priority,
        "assigned_to": job_data.assigned_to,
        "estimated_hours": job_data.estimated_hours,
        "due_date": job_data.due_date.isoformat() if job_data.due_date else None,
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.project_jobs.insert_one(job)
    return {"id": job["id"], "message": "Job created"}

@api_router.put("/projects/{project_id}/jobs/{job_id}")
async def update_project_job(project_id: str, job_id: str, job_data: JobCreate, user: dict = Depends(get_current_user)):
    """Update a project job"""
    update_data = {
        "title": job_data.title,
        "description": job_data.description,
        "status": job_data.status,
        "priority": job_data.priority,
        "assigned_to": job_data.assigned_to,
        "estimated_hours": job_data.estimated_hours,
        "due_date": job_data.due_date.isoformat() if job_data.due_date else None,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    result = await db.project_jobs.update_one(
        {"id": job_id, "project_id": project_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return {"message": "Job updated"}

@api_router.delete("/projects/{project_id}/jobs/{job_id}")
async def delete_project_job(project_id: str, job_id: str, user: dict = Depends(get_current_user)):
    """Delete a project job and its worksheets"""
    result = await db.project_jobs.delete_one({"id": job_id, "project_id": project_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Delete associated worksheets
    await db.job_worksheets.delete_many({"job_id": job_id})
    
    return {"message": "Job deleted"}

@api_router.post("/projects/{project_id}/jobs/{job_id}/worksheets")
async def add_job_worksheet(project_id: str, job_id: str, worksheet_data: WorksheetCreate, user: dict = Depends(get_current_user)):
    """Add a worksheet entry to a job"""
    # Verify job exists
    job = await db.project_jobs.find_one({"id": job_id, "project_id": project_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    worksheet = {
        "id": str(uuid.uuid4()),
        "job_id": job_id,
        "project_id": project_id,
        "work_performed": worksheet_data.work_performed,
        "hours_spent": worksheet_data.hours_spent,
        "notes": worksheet_data.notes,
        "billable": worksheet_data.billable,
        "user_id": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.job_worksheets.insert_one(worksheet)
    
    # Also create a time entry
    await db.time_entries.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "project_id": project_id,
        "task_id": None,
        "date": datetime.now(timezone.utc).isoformat(),
        "hours": worksheet_data.hours_spent,
        "description": f"[Job: {job['title']}] {worksheet_data.work_performed}",
        "billable": worksheet_data.billable,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {"id": worksheet["id"], "message": "Worksheet added"}

@api_router.get("/projects/{project_id}/jobs/{job_id}/worksheets")
async def get_job_worksheets(project_id: str, job_id: str, user: dict = Depends(get_current_user)):
    """Get all worksheets for a job"""
    worksheets = await db.job_worksheets.find(
        {"job_id": job_id, "project_id": project_id}, 
        {"_id": 0}
    ).to_list(100)
    
    for ws in worksheets:
        if ws.get("user_id"):
            u = await db.users.find_one({"id": ws["user_id"]}, {"username": 1})
            ws["user_name"] = u["username"] if u else None
    
    return worksheets

# ==================== INCIDENTS ====================

@api_router.get("/incidents", response_model=List[IncidentResponse])
async def list_incidents(status: Optional[str] = None, client_id: Optional[str] = None,
                        severity: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = {}
    if status:
        query["status"] = status
    if client_id:
        query["client_id"] = client_id
    if severity:
        query["severity"] = severity
    
    incidents = await db.incidents.find(query, {"_id": 0}).to_list(1000)
    result = []
    for i in incidents:
        server_name = None
        if i.get("server_id"):
            server = await db.servers.find_one({"id": i["server_id"]}, {"hostname": 1})
            server_name = server["hostname"] if server else None
        
        client_name = None
        if i.get("client_id"):
            client = await db.clients.find_one({"id": i["client_id"]}, {"name": 1})
            client_name = client["name"] if client else None
        
        result.append(IncidentResponse(
            id=i["id"], title=i["title"],
            server_id=i.get("server_id"), server_name=server_name,
            client_id=i.get("client_id"), client_name=client_name,
            severity=i.get("severity", "medium"), status=i.get("status", "open"),
            date_opened=datetime.fromisoformat(i["date_opened"]),
            date_resolved=datetime.fromisoformat(i["date_resolved"]) if i.get("date_resolved") else None,
            description=decrypt_field(i.get("description")) if i.get("description") else None,
            root_cause=decrypt_field(i.get("root_cause")) if i.get("root_cause") else None,
            resolution_notes=decrypt_field(i.get("resolution_notes")) if i.get("resolution_notes") else None,
            created_by=i["created_by"], resolved_by=i.get("resolved_by")
        ))
    return result

@api_router.post("/incidents", response_model=IncidentResponse)
async def create_incident(incident_data: IncidentCreate, user: dict = Depends(get_current_user)):
    incident = {
        "id": str(uuid.uuid4()),
        "title": incident_data.title,
        "server_id": incident_data.server_id,
        "client_id": incident_data.client_id,
        "severity": incident_data.severity,
        "status": "open",
        "date_opened": datetime.now(timezone.utc).isoformat(),
        "date_resolved": None,
        "description": encrypt_field(incident_data.description) if incident_data.description else None,
        "root_cause": None,
        "resolution_notes": None,
        "created_by": user["id"],
        "resolved_by": None
    }
    await db.incidents.insert_one(incident)
    incidents = await list_incidents(user=user)
    return next(i for i in incidents if i.id == incident["id"])

@api_router.put("/incidents/{incident_id}/resolve")
async def resolve_incident(incident_id: str, root_cause: Optional[str] = Body(None),
                          resolution_notes: Optional[str] = Body(None),
                          user: dict = Depends(get_current_user)):
    update_data = {
        "status": "resolved",
        "date_resolved": datetime.now(timezone.utc).isoformat(),
        "root_cause": encrypt_field(root_cause) if root_cause else None,
        "resolution_notes": encrypt_field(resolution_notes) if resolution_notes else None,
        "resolved_by": user["id"]
    }
    result = await db.incidents.update_one({"id": incident_id}, {"$set": update_data})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Incident not found")
    return {"message": "Incident resolved"}

@api_router.delete("/incidents/{incident_id}")
async def delete_incident(incident_id: str, user: dict = Depends(get_current_user)):
    result = await db.incidents.delete_one({"id": incident_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Incident not found")
    return {"message": "Incident deleted"}

# ==================== MAINTENANCE ====================

@api_router.get("/maintenance", response_model=List[MaintenanceResponse])
async def list_maintenance(server_id: Optional[str] = None, status: Optional[str] = None,
                          user: dict = Depends(get_current_user)):
    query = {}
    if server_id:
        query["server_id"] = server_id
    if status:
        query["status"] = status
    
    maintenance = await db.maintenance.find(query, {"_id": 0}).to_list(1000)
    result = []
    for m in maintenance:
        server = await db.servers.find_one({"id": m["server_id"]}, {"hostname": 1, "site_id": 1})
        server_name = server["hostname"] if server else None
        client_name = None
        if server:
            site = await db.sites.find_one({"id": server["site_id"]}, {"client_id": 1})
            if site:
                client = await db.clients.find_one({"id": site["client_id"]}, {"name": 1})
                client_name = client["name"] if client else None
        
        engineer_name = None
        if m.get("engineer_id"):
            engineer = await db.users.find_one({"id": m["engineer_id"]}, {"username": 1})
            engineer_name = engineer["username"] if engineer else None
        
        result.append(MaintenanceResponse(
            id=m["id"], server_id=m["server_id"], server_name=server_name,
            client_name=client_name, maintenance_type=m["maintenance_type"],
            scheduled_date=datetime.fromisoformat(m["scheduled_date"]) if m.get("scheduled_date") else None,
            completed_date=datetime.fromisoformat(m["completed_date"]) if m.get("completed_date") else None,
            engineer_id=m.get("engineer_id"), engineer_name=engineer_name,
            notes=decrypt_field(m.get("notes")) if m.get("notes") else None,
            status=m.get("status", "scheduled"),
            created_at=datetime.fromisoformat(m["created_at"])
        ))
    return result

@api_router.post("/maintenance", response_model=MaintenanceResponse)
async def create_maintenance(maintenance_data: MaintenanceCreate, user: dict = Depends(get_current_user)):
    maintenance = {
        "id": str(uuid.uuid4()),
        "server_id": maintenance_data.server_id,
        "maintenance_type": maintenance_data.maintenance_type,
        "scheduled_date": maintenance_data.scheduled_date.isoformat() if maintenance_data.scheduled_date else None,
        "completed_date": None,
        "engineer_id": user["id"],
        "notes": encrypt_field(maintenance_data.notes) if maintenance_data.notes else None,
        "status": "scheduled",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.maintenance.insert_one(maintenance)
    maint_list = await list_maintenance(user=user)
    return next(m for m in maint_list if m.id == maintenance["id"])

class MaintenanceCompleteRequest(BaseModel):
    notes: Optional[str] = None

@api_router.put("/maintenance/{maintenance_id}/complete")
async def complete_maintenance(maintenance_id: str, request: MaintenanceCompleteRequest = Body(default=MaintenanceCompleteRequest()),
                              user: dict = Depends(get_current_user)):
    update_data = {
        "status": "completed",
        "completed_date": datetime.now(timezone.utc).isoformat(),
        "notes": encrypt_field(request.notes) if request.notes else None
    }
    result = await db.maintenance.update_one({"id": maintenance_id}, {"$set": update_data})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Maintenance not found")
    return {"message": "Maintenance completed"}

# ==================== DOCUMENTATION ====================

@api_router.get("/docs", response_model=List[DocumentResponse])
async def list_documents(category: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = {"is_published": True}
    if category:
        query["category"] = category
    
    docs = await db.documentation.find(query, {"_id": 0}).to_list(1000)
    return [DocumentResponse(
        id=d["id"], title=d["title"], slug=d["slug"],
        category=d.get("category"),
        content=decrypt_field(d["content"]) if d.get("content") else "",
        is_published=d.get("is_published", True),
        created_by=d["created_by"],
        created_at=datetime.fromisoformat(d["created_at"]),
        updated_at=datetime.fromisoformat(d["updated_at"]) if d.get("updated_at") else None
    ) for d in docs]

@api_router.get("/docs/{slug}", response_model=DocumentResponse)
async def get_document(slug: str, user: dict = Depends(get_current_user)):
    doc = await db.documentation.find_one({"slug": slug}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return DocumentResponse(
        id=doc["id"], title=doc["title"], slug=doc["slug"],
        category=doc.get("category"),
        content=decrypt_field(doc["content"]) if doc.get("content") else "",
        is_published=doc.get("is_published", True),
        created_by=doc["created_by"],
        created_at=datetime.fromisoformat(doc["created_at"]),
        updated_at=datetime.fromisoformat(doc["updated_at"]) if doc.get("updated_at") else None
    )

@api_router.post("/docs", response_model=DocumentResponse)
async def create_document(doc_data: DocumentCreate, user: dict = Depends(get_current_user)):
    slug = doc_data.slug or doc_data.title.lower().replace(" ", "-")
    existing = await db.documentation.find_one({"slug": slug})
    if existing:
        slug = f"{slug}-{str(uuid.uuid4())[:8]}"
    
    doc = {
        "id": str(uuid.uuid4()),
        "title": doc_data.title,
        "slug": slug,
        "category": doc_data.category,
        "content": encrypt_field(doc_data.content),
        "is_published": doc_data.is_published,
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.documentation.insert_one(doc)
    return DocumentResponse(
        id=doc["id"], title=doc["title"], slug=doc["slug"],
        category=doc["category"], content=doc_data.content,
        is_published=doc["is_published"], created_by=doc["created_by"],
        created_at=datetime.fromisoformat(doc["created_at"]), updated_at=None
    )

@api_router.put("/docs/{doc_id}", response_model=DocumentResponse)
async def update_document(doc_id: str, doc_data: DocumentCreate, user: dict = Depends(get_current_user)):
    update_data = {
        "title": doc_data.title,
        "category": doc_data.category,
        "content": encrypt_field(doc_data.content),
        "is_published": doc_data.is_published,
        "updated_by": user["id"],
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.documentation.update_one({"id": doc_id}, {"$set": update_data})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Document not found")
    doc = await db.documentation.find_one({"id": doc_id}, {"_id": 0})
    return DocumentResponse(
        id=doc["id"], title=doc["title"], slug=doc["slug"],
        category=doc.get("category"), content=doc_data.content,
        is_published=doc.get("is_published", True), created_by=doc["created_by"],
        created_at=datetime.fromisoformat(doc["created_at"]),
        updated_at=datetime.fromisoformat(doc["updated_at"]) if doc.get("updated_at") else None
    )

@api_router.delete("/docs/{doc_id}")
async def delete_document(doc_id: str, user: dict = Depends(get_current_user)):
    result = await db.documentation.delete_one({"id": doc_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"message": "Document deleted"}

# ==================== TIME TRACKING ====================

@api_router.get("/time-entries", response_model=List[TimeEntryResponse])
async def list_time_entries(user_id: Optional[str] = None, client_id: Optional[str] = None,
                           project_id: Optional[str] = None,
                           start_date: Optional[str] = None, end_date: Optional[str] = None,
                           user: dict = Depends(get_current_user)):
    try:
        query = {}
        if user_id:
            query["user_id"] = user_id
        elif user["role"] != "admin":
            query["user_id"] = user["id"]
        if client_id:
            query["client_id"] = client_id
        if project_id:
            query["project_id"] = project_id
        
        entries = await db.time_entries.find(query, {"_id": 0}).to_list(1000)
        result = []
        for e in entries:
            try:
                user_obj = await db.users.find_one({"id": e.get("user_id")}, {"username": 1})
                client_name = None
                if e.get("client_id"):
                    client = await db.clients.find_one({"id": e["client_id"]}, {"name": 1})
                    client_name = client["name"] if client else None
                
                # Safely parse dates
                entry_date = None
                if e.get("entry_date"):
                    try:
                        entry_date = datetime.fromisoformat(e["entry_date"].replace('Z', '+00:00'))
                    except:
                        entry_date = datetime.now(timezone.utc)
                
                created_at = None
                if e.get("created_at"):
                    try:
                        created_at = datetime.fromisoformat(e["created_at"].replace('Z', '+00:00'))
                    except:
                        created_at = datetime.now(timezone.utc)
                
                result.append(TimeEntryResponse(
                    id=e["id"], user_id=e.get("user_id"),
                    user_name=user_obj["username"] if user_obj else None,
                    client_id=e.get("client_id"), client_name=client_name,
                    task_id=e.get("task_id"), project_id=e.get("project_id"),
                    incident_id=e.get("incident_id"),
                    entry_date=entry_date,
                    duration_minutes=e.get("duration_minutes", 0),
                    description=e.get("description"), is_billable=e.get("is_billable", True),
                    status=e.get("status", "draft"),
                    created_at=created_at
                ))
            except Exception as entry_error:
                logger.error(f"Error processing time entry {e.get('id')}: {str(entry_error)}")
                continue
        return result
    except Exception as e:
        logger.error(f"Error listing time entries: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching time entries: {str(e)}")

@api_router.post("/time-entries", response_model=TimeEntryResponse)
async def create_time_entry(entry_data: TimeEntryCreate, user: dict = Depends(get_current_user)):
    entry = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "client_id": entry_data.client_id,
        "task_id": entry_data.task_id,
        "project_id": entry_data.project_id,
        "incident_id": entry_data.incident_id,
        "entry_date": entry_data.entry_date.isoformat(),
        "duration_minutes": entry_data.duration_minutes,
        "description": entry_data.description,
        "is_billable": entry_data.is_billable,
        "status": "draft",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.time_entries.insert_one(entry)
    entries = await list_time_entries(user=user)
    return next(e for e in entries if e.id == entry["id"])

@api_router.delete("/time-entries/{entry_id}")
async def delete_time_entry(entry_id: str, user: dict = Depends(get_current_user)):
    result = await db.time_entries.delete_one({"id": entry_id, "user_id": user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Time entry not found")
    return {"message": "Time entry deleted"}

# ==================== HEALTH CHECKS ====================

HEALTH_CHECK_TEMPLATES = [
    # Storage Checks
    {"id": "hc-1", "category": "Storage", "name": "Disk Space Usage", "description": "Check disk space (alert >80%) - Run: Get-PSDrive -PSProvider FileSystem", "check_type": "manual", "server_roles": None, "frequency": "monthly", "is_active": True},
    {"id": "hc-2", "category": "Storage", "name": "RAID Health Status", "description": "Verify RAID array health", "check_type": "manual", "server_roles": ["physical"], "frequency": "monthly", "is_active": True},
    
    # AD Replication Checks
    {"id": "hc-3", "category": "Active Directory - Replication", "name": "Replication Summary", "description": "Run: repadmin /replsummary - Confirm no replication failures", "check_type": "manual", "server_roles": ["domain controller"], "frequency": "monthly", "is_active": True},
    {"id": "hc-4", "category": "Active Directory - Replication", "name": "Replication Status Detail", "description": "Run: repadmin /showrepl - Check largest delta times are reasonable", "check_type": "manual", "server_roles": ["domain controller"], "frequency": "monthly", "is_active": True},
    
    # DC Diagnostics
    {"id": "hc-5", "category": "Active Directory - Diagnostics", "name": "DC Diagnostics Full", "description": "Run: dcdiag /v - Confirm all tests pass: Advertising, Replications, NetLogons, Services, DFSREvent, SysVolCheck", "check_type": "manual", "server_roles": ["domain controller"], "frequency": "monthly", "is_active": True},
    {"id": "hc-6", "category": "Active Directory - FSMO", "name": "FSMO Roles Verification", "description": "Run: netdom query fsmo - Confirm FSMO role holders are online and healthy", "check_type": "manual", "server_roles": ["domain controller"], "frequency": "monthly", "is_active": True},
    
    # SYSVOL/NETLOGON
    {"id": "hc-7", "category": "Active Directory - SYSVOL", "name": "SYSVOL Check", "description": "Run: dcdiag /test:sysvolcheck - Confirm SYSVOL share exists", "check_type": "manual", "server_roles": ["domain controller"], "frequency": "monthly", "is_active": True},
    {"id": "hc-8", "category": "Active Directory - SYSVOL", "name": "DFS Replication Event Check", "description": "Run: dcdiag /test:dfsrevent - Check for DFS replication issues", "check_type": "manual", "server_roles": ["domain controller"], "frequency": "monthly", "is_active": True},
    {"id": "hc-9", "category": "Active Directory - SYSVOL", "name": "Network Shares Verification", "description": "Run: net share - Confirm SYSVOL and NETLOGON shares exist", "check_type": "manual", "server_roles": ["domain controller"], "frequency": "monthly", "is_active": True},
    
    # DNS Health
    {"id": "hc-10", "category": "Active Directory - DNS", "name": "DNS Health Check", "description": "Run: dcdiag /test:dns - Confirm zones replicate correctly", "check_type": "manual", "server_roles": ["domain controller"], "frequency": "monthly", "is_active": True},
    {"id": "hc-11", "category": "Active Directory - DNS", "name": "DNS Forwarders Check", "description": "Verify DNS forwarders are configured and responding", "check_type": "manual", "server_roles": ["domain controller"], "frequency": "monthly", "is_active": True},
    {"id": "hc-12", "category": "Active Directory - DNS", "name": "DNS Event Log Review", "description": "Check DNS Server event log for errors", "check_type": "manual", "server_roles": ["domain controller"], "frequency": "monthly", "is_active": True},
    
    # Time Synchronisation
    {"id": "hc-13", "category": "Active Directory - Time", "name": "NTP Source Check", "description": "Run: w32tm /query /source - Verify time source", "check_type": "manual", "server_roles": ["domain controller"], "frequency": "monthly", "is_active": True},
    {"id": "hc-14", "category": "Active Directory - Time", "name": "Time Sync Status", "description": "Run: w32tm /query /status - Confirm PDC emulator uses external NTP, other DCs sync from domain hierarchy", "check_type": "manual", "server_roles": ["domain controller"], "frequency": "monthly", "is_active": True},
    
    # Event Log Review
    {"id": "hc-15", "category": "Active Directory - Events", "name": "Directory Service Event Log", "description": "Check Directory Service event log for NTDS errors, replication failures", "check_type": "manual", "server_roles": ["domain controller"], "frequency": "monthly", "is_active": True},
    {"id": "hc-16", "category": "Active Directory - Events", "name": "Kerberos Issues Check", "description": "Check event logs for Kerberos authentication issues", "check_type": "manual", "server_roles": ["domain controller"], "frequency": "monthly", "is_active": True},
    {"id": "hc-17", "category": "Active Directory - Events", "name": "System Event Log Review", "description": "Review System event log for critical errors", "check_type": "manual", "server_roles": ["domain controller"], "frequency": "monthly", "is_active": True},
    
    # NTDS Service
    {"id": "hc-18", "category": "Active Directory - Services", "name": "NTDS Service Status", "description": "Run: Get-Service NTDS - Confirm NTDS service is running", "check_type": "manual", "server_roles": ["domain controller"], "frequency": "monthly", "is_active": True},
    {"id": "hc-19", "category": "Active Directory - Services", "name": "Critical Services Check", "description": "Run: Get-Service *dns*,ntds,dfsr,netlogon,kdc - Confirm DNS, NTDS, DFSR, Netlogon, KDC are running", "check_type": "manual", "server_roles": ["domain controller"], "frequency": "monthly", "is_active": True},
    
    # Account Management
    {"id": "hc-20", "category": "Active Directory - Accounts", "name": "Stale Computer Accounts", "description": "Run: Get-ADComputer -Filter * -Properties LastLogonDate | Where {$_.LastLogonDate -lt (Get-Date).AddDays(-90)} - Review old computer objects", "check_type": "manual", "server_roles": ["domain controller"], "frequency": "monthly", "is_active": True},
    {"id": "hc-21", "category": "Active Directory - Accounts", "name": "Disabled Accounts Review", "description": "Run: Search-ADAccount -AccountDisabled -UsersOnly - Review for expected accounts", "check_type": "manual", "server_roles": ["domain controller"], "frequency": "monthly", "is_active": True},
    {"id": "hc-22", "category": "Active Directory - Accounts", "name": "Locked Accounts Check", "description": "Run: Search-ADAccount -LockedOut - Investigate unusual lockouts", "check_type": "manual", "server_roles": ["domain controller"], "frequency": "monthly", "is_active": True},
    
    # Group Policy
    {"id": "hc-23", "category": "Active Directory - GPO", "name": "Group Policy Processing", "description": "Run: gpresult /r - Confirm GPO processing works", "check_type": "manual", "server_roles": ["domain controller"], "frequency": "monthly", "is_active": True},
    {"id": "hc-24", "category": "Active Directory - GPO", "name": "GPO Report Export", "description": "Optional: Get-GPOReport -All -ReportType HTML -Path C:\\gpo_report.html - Review GPO configuration", "check_type": "manual", "server_roles": ["domain controller"], "frequency": "monthly", "is_active": True},
    
    # Backup Verification
    {"id": "hc-25", "category": "Backup", "name": "DC Backup Status", "description": "Confirm domain controller backups exist and System State backup is current", "check_type": "manual", "server_roles": ["domain controller"], "frequency": "monthly", "is_active": True},
    {"id": "hc-26", "category": "Backup", "name": "Backup Job Status", "description": "Verify all backup jobs completing successfully", "check_type": "manual", "server_roles": None, "frequency": "weekly", "is_active": True},
    {"id": "hc-27", "category": "Backup", "name": "Test Restore Verification", "description": "Perform test restore to verify backup integrity", "check_type": "manual", "server_roles": None, "frequency": "monthly", "is_active": True},
    
    # Security
    {"id": "hc-28", "category": "Security", "name": "Windows Updates Status", "description": "Check pending Windows updates", "check_type": "manual", "server_roles": None, "frequency": "monthly", "is_active": True},
    {"id": "hc-29", "category": "Security", "name": "Certificate Expiry Check", "description": "Check SSL/TLS certificate expiry dates", "check_type": "manual", "server_roles": None, "frequency": "monthly", "is_active": True},
    {"id": "hc-30", "category": "Security", "name": "Antivirus Definitions", "description": "Verify AV definitions are current", "check_type": "manual", "server_roles": None, "frequency": "weekly", "is_active": True},
    
    # Performance
    {"id": "hc-31", "category": "Performance", "name": "CPU Usage Trends", "description": "Review CPU usage patterns for anomalies", "check_type": "manual", "server_roles": None, "frequency": "monthly", "is_active": True},
    {"id": "hc-32", "category": "Performance", "name": "Memory Usage Trends", "description": "Review memory usage patterns", "check_type": "manual", "server_roles": None, "frequency": "monthly", "is_active": True},
    {"id": "hc-33", "category": "Performance", "name": "Event Log Errors Review", "description": "Review critical event log errors", "check_type": "manual", "server_roles": None, "frequency": "monthly", "is_active": True},
    
    # Hyper-V
    {"id": "hc-34", "category": "Hyper-V", "name": "VM Snapshot Cleanup", "description": "Remove old VM snapshots", "check_type": "manual", "server_roles": ["hypervisor"], "frequency": "monthly", "is_active": True},
    {"id": "hc-35", "category": "Hyper-V", "name": "Hyper-V Replication Status", "description": "Check VM replication health", "check_type": "manual", "server_roles": ["hypervisor"], "frequency": "monthly", "is_active": True},
    
    # Hardware
    {"id": "hc-36", "category": "Hardware", "name": "Firmware Version Check", "description": "Check for firmware updates", "check_type": "manual", "server_roles": ["physical"], "frequency": "quarterly", "is_active": True},
]

@api_router.get("/health-checks/templates", response_model=List[HealthCheckTemplateResponse])
async def get_health_check_templates(user: dict = Depends(get_current_user)):
    return [HealthCheckTemplateResponse(**t) for t in HEALTH_CHECK_TEMPLATES]

# New health check system - monthly server health checks
class HealthCheckItemCreate(BaseModel):
    id: str
    category: str
    name: str
    description: str
    status: str  # pass, fail, na
    notes: Optional[str] = ""

class MonthlyHealthCheckCreate(BaseModel):
    server_id: str
    server_name: str
    check_date: str
    signed_off_by: str
    is_ad_server: bool
    checks: List[HealthCheckItemCreate]

@api_router.get("/health-checks")
async def get_all_health_checks(user: dict = Depends(get_current_user)):
    """Get all monthly health check records"""
    checks = await db.monthly_health_checks.find({}, {"_id": 0}).sort("check_date", -1).to_list(500)
    return checks

@api_router.post("/health-checks")
async def create_monthly_health_check(data: MonthlyHealthCheckCreate, user: dict = Depends(get_current_user)):
    """Save a complete monthly health check"""
    record = {
        "id": str(uuid.uuid4()),
        "server_id": data.server_id,
        "server_name": data.server_name,
        "check_date": data.check_date,
        "signed_off_by": data.signed_off_by,
        "is_ad_server": data.is_ad_server,
        "checks": [c.dict() for c in data.checks],
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.monthly_health_checks.insert_one(record)
    return {"message": "Health check saved", "id": record["id"]}

@api_router.get("/health-checks/{check_id}")
async def get_health_check(check_id: str, user: dict = Depends(get_current_user)):
    """Get a specific health check record"""
    check = await db.monthly_health_checks.find_one({"id": check_id}, {"_id": 0})
    if not check:
        raise HTTPException(status_code=404, detail="Health check not found")
    return check

@api_router.delete("/health-checks/{check_id}")
async def delete_health_check(check_id: str, user: dict = Depends(get_current_user)):
    """Delete a health check record"""
    result = await db.monthly_health_checks.delete_one({"id": check_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Health check not found")
    return {"message": "Health check deleted"}

@api_router.get("/health-checks/server/{server_id}")
async def get_server_health_checks(server_id: str, month: Optional[int] = None, year: Optional[int] = None,
                                   user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    query_month = month or now.month
    query_year = year or now.year
    
    checks = await db.health_checks.find({
        "server_id": server_id,
        "period_month": query_month,
        "period_year": query_year
    }, {"_id": 0}).to_list(1000)
    
    result = []
    server = await db.servers.find_one({"id": server_id}, {"hostname": 1})
    
    for c in checks:
        template = next((t for t in HEALTH_CHECK_TEMPLATES if t["id"] == c["template_id"]), None)
        performer_name = None
        if c.get("performed_by"):
            performer = await db.users.find_one({"id": c["performed_by"]}, {"username": 1})
            performer_name = performer["username"] if performer else None
        
        result.append(HealthCheckResponse(
            id=c["id"], server_id=c["server_id"],
            server_name=server["hostname"] if server else None,
            template_id=c["template_id"],
            template_name=template["name"] if template else None,
            category=template["category"] if template else None,
            check_date=datetime.fromisoformat(c["check_date"]),
            period_month=c["period_month"], period_year=c["period_year"],
            performed_by=c.get("performed_by"), performer_name=performer_name,
            status=c["status"],
            notes=decrypt_field(c.get("notes")) if c.get("notes") else None,
            value_recorded=c.get("value_recorded")
        ))
    return result

@api_router.post("/health-checks/server/{server_id}/generate")
async def generate_health_checks(server_id: str, user: dict = Depends(get_current_user)):
    server = await db.servers.find_one({"id": server_id}, {"_id": 0})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    now = datetime.now(timezone.utc)
    month = now.month
    year = now.year
    
    existing = await db.health_checks.count_documents({
        "server_id": server_id, "period_month": month, "period_year": year
    })
    if existing > 0:
        return {"message": "Health checks already generated for this month", "count": existing}
    
    server_role = (server.get("role") or "").lower()
    checks_created = 0
    
    for template in HEALTH_CHECK_TEMPLATES:
        if not template["is_active"]:
            continue
        
        roles = template.get("server_roles")
        if roles and server_role not in [r.lower() for r in roles]:
            continue
        
        check = {
            "id": str(uuid.uuid4()),
            "server_id": server_id,
            "template_id": template["id"],
            "check_date": now.isoformat(),
            "period_month": month,
            "period_year": year,
            "performed_by": None,
            "status": "pending",
            "notes": None,
            "value_recorded": None,
            "created_at": now.isoformat()
        }
        await db.health_checks.insert_one(check)
        checks_created += 1
    
    await db.servers.update_one({"id": server_id}, {"$set": {"last_health_check": now.isoformat()}})
    return {"message": f"Generated {checks_created} health checks", "count": checks_created}

@api_router.put("/health-checks/{check_id}")
async def update_monthly_health_check(check_id: str, check_data: dict = Body(...),
                                     user: dict = Depends(get_current_user)):
    """Update a monthly health check (used for continuing drafts)"""
    # Check if this is a monthly health check
    existing = await db.monthly_health_checks.find_one({"id": check_id})
    if existing:
        # Update the monthly health check
        update_data = {
            "server_id": check_data.get("server_id"),
            "server_name": check_data.get("server_name"),
            "check_date": check_data.get("check_date"),
            "signed_off_by": check_data.get("signed_off_by"),
            "is_ad_server": check_data.get("is_ad_server", False),
            "is_draft": check_data.get("is_draft", False),
            "completed_count": check_data.get("completed_count", 0),
            "total_count": check_data.get("total_count", 0),
            "checks": check_data.get("checks", []),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        # Encrypt sensitive notes in checks
        for check in update_data.get("checks", []):
            if check.get("notes"):
                check["notes"] = encrypt_field(check["notes"])
        
        result = await db.monthly_health_checks.update_one(
            {"id": check_id}, 
            {"$set": update_data}
        )
        if result.modified_count == 0 and result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Health check not found")
        return {"message": "Health check updated"}
    
    # Fall back to old health check system
    status = check_data.get("status")
    if status and status not in ["pending", "passed", "warning", "failed", "skipped"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    update_data = {
        "status": status,
        "performed_by": user["id"],
        "check_date": datetime.now(timezone.utc).isoformat(),
        "notes": encrypt_field(check_data.get("notes")) if check_data.get("notes") else None,
        "value_recorded": check_data.get("value_recorded")
    }
    result = await db.health_checks.update_one({"id": check_id}, {"$set": update_data})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Health check not found")
    return {"message": "Health check updated"}

# ==================== CUSTOMER CRM ====================

@api_router.get("/customers")
async def list_customers(user: dict = Depends(get_current_user)):
    """List all customers (linked to TRMM clients or manual)"""
    customers = await db.customers.find({}, {"_id": 0}).sort("name", 1).to_list(500)
    result = []
    
    for c in customers:
        # Get TRMM client name if linked
        trmm_name = None
        if c.get("trmm_client_id"):
            trmm_client = await db.clients.find_one({"id": c["trmm_client_id"]}, {"name": 1})
            trmm_name = trmm_client["name"] if trmm_client else None
        
        # Get account manager name
        manager_name = None
        if c.get("account_manager"):
            manager = await db.users.find_one({"id": c["account_manager"]}, {"username": 1})
            manager_name = manager["username"] if manager else None
        
        # Get counts
        notes_count = await db.customer_notes.count_documents({"customer_id": c["id"]})
        
        # Count servers/workstations if linked to TRMM
        servers_count = 0
        workstations_count = 0
        if c.get("trmm_client_id"):
            servers_count = await db.servers.count_documents({"client_id": c["trmm_client_id"], "monitoring_type": "server"})
            workstations_count = await db.servers.count_documents({"client_id": c["trmm_client_id"], "monitoring_type": "workstation"})
        
        result.append(CustomerResponse(
            id=c["id"],
            name=c["name"],
            trmm_client_id=c.get("trmm_client_id"),
            trmm_client_name=trmm_name,
            contact_name=c.get("contact_name"),
            contact_email=c.get("contact_email"),
            contact_phone=c.get("contact_phone"),
            address=c.get("address"),
            website=c.get("website"),
            contract_type=c.get("contract_type"),
            contract_value=c.get("contract_value"),
            contract_start=datetime.fromisoformat(c["contract_start"]) if c.get("contract_start") else None,
            contract_end=datetime.fromisoformat(c["contract_end"]) if c.get("contract_end") else None,
            account_manager=c.get("account_manager"),
            account_manager_name=manager_name,
            technical_contact=c.get("technical_contact"),
            notes=decrypt_field(c.get("notes")) if c.get("notes") else None,
            tags=c.get("tags", []),
            is_active=c.get("is_active", True),
            created_at=datetime.fromisoformat(c["created_at"]),
            updated_at=datetime.fromisoformat(c["updated_at"]) if c.get("updated_at") else None,
            notes_count=notes_count,
            servers_count=servers_count,
            workstations_count=workstations_count
        ))
    
    return result

@api_router.post("/customers")
async def create_customer(customer: CustomerCreate, user: dict = Depends(get_current_user)):
    """Create a new customer record"""
    customer_data = {
        "id": str(uuid.uuid4()),
        "name": customer.name,
        "trmm_client_id": customer.trmm_client_id,
        "contact_name": customer.contact_name,
        "contact_email": customer.contact_email,
        "contact_phone": customer.contact_phone,
        "address": customer.address,
        "website": customer.website,
        "contract_type": customer.contract_type,
        "contract_value": customer.contract_value,
        "contract_start": customer.contract_start.isoformat() if customer.contract_start else None,
        "contract_end": customer.contract_end.isoformat() if customer.contract_end else None,
        "account_manager": customer.account_manager,
        "technical_contact": customer.technical_contact,
        "notes": encrypt_field(customer.notes) if customer.notes else None,
        "tags": customer.tags or [],
        "is_active": customer.is_active,
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.customers.insert_one(customer_data)
    return {"message": "Customer created", "id": customer_data["id"]}

@api_router.get("/customers/{customer_id}")
async def get_customer(customer_id: str, user: dict = Depends(get_current_user)):
    """Get a specific customer"""
    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    # Decrypt notes
    if customer.get("notes"):
        customer["notes"] = decrypt_field(customer["notes"])
    
    return customer

@api_router.put("/customers/{customer_id}")
async def update_customer(customer_id: str, customer: CustomerCreate, user: dict = Depends(get_current_user)):
    """Update a customer"""
    update_data = {
        "name": customer.name,
        "trmm_client_id": customer.trmm_client_id,
        "contact_name": customer.contact_name,
        "contact_email": customer.contact_email,
        "contact_phone": customer.contact_phone,
        "address": customer.address,
        "website": customer.website,
        "contract_type": customer.contract_type,
        "contract_value": customer.contract_value,
        "contract_start": customer.contract_start.isoformat() if customer.contract_start else None,
        "contract_end": customer.contract_end.isoformat() if customer.contract_end else None,
        "account_manager": customer.account_manager,
        "technical_contact": customer.technical_contact,
        "notes": encrypt_field(customer.notes) if customer.notes else None,
        "tags": customer.tags or [],
        "is_active": customer.is_active,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    result = await db.customers.update_one({"id": customer_id}, {"$set": update_data})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Customer not found")
    return {"message": "Customer updated"}

@api_router.delete("/customers/{customer_id}")
async def delete_customer(customer_id: str, user: dict = Depends(get_current_user)):
    """Delete a customer"""
    result = await db.customers.delete_one({"id": customer_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Customer not found")
    # Also delete associated notes
    await db.customer_notes.delete_many({"customer_id": customer_id})
    return {"message": "Customer deleted"}

# Customer Notes
@api_router.get("/customers/{customer_id}/notes")
async def get_customer_notes(customer_id: str, user: dict = Depends(get_current_user)):
    """Get all notes for a customer"""
    notes = await db.customer_notes.find({"customer_id": customer_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    result = []
    for note in notes:
        user_doc = await db.users.find_one({"id": note["created_by"]}, {"username": 1})
        result.append({
            **note,
            "content": decrypt_field(note.get("content")) if note.get("content") else "",
            "created_by_name": user_doc["username"] if user_doc else None
        })
    return result

@api_router.post("/customers/{customer_id}/notes")
async def add_customer_note(customer_id: str, note_data: CustomerNoteCreate, user: dict = Depends(get_current_user)):
    """Add a note to a customer"""
    customer = await db.customers.find_one({"id": customer_id})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    note = {
        "id": str(uuid.uuid4()),
        "customer_id": customer_id,
        "content": encrypt_field(note_data.content),
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.customer_notes.insert_one(note)
    
    user_doc = await db.users.find_one({"id": user["id"]}, {"username": 1})
    return {
        "id": note["id"],
        "customer_id": customer_id,
        "content": note_data.content,
        "created_by": user["id"],
        "created_by_name": user_doc["username"] if user_doc else None,
        "created_at": note["created_at"]
    }

@api_router.delete("/customers/{customer_id}/notes/{note_id}")
async def delete_customer_note(customer_id: str, note_id: str, user: dict = Depends(get_current_user)):
    """Delete a customer note"""
    note = await db.customer_notes.find_one({"id": note_id, "customer_id": customer_id})
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    if note["created_by"] != user["id"] and user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to delete this note")
    
    await db.customer_notes.delete_one({"id": note_id})
    return {"message": "Note deleted"}

# ==================== STOCK/ASSET TRACKING ====================

@api_router.get("/assets")
async def list_assets(
    status: Optional[str] = None,
    asset_type: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    """List all assets/stock items"""
    query = {}
    if status:
        query["status"] = status
    if asset_type:
        query["asset_type"] = asset_type
    
    assets = await db.assets.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    result = []
    
    for a in assets:
        customer_name = None
        if a.get("assigned_customer_id"):
            customer = await db.customers.find_one({"id": a["assigned_customer_id"]}, {"name": 1})
            customer_name = customer["name"] if customer else None
        
        result.append(AssetResponse(
            id=a["id"],
            name=a["name"],
            asset_type=a["asset_type"],
            manufacturer=a.get("manufacturer"),
            model=a.get("model"),
            serial_number=a.get("serial_number"),
            specifications=decrypt_field(a.get("specifications")) if a.get("specifications") else None,
            purchase_date=datetime.fromisoformat(a["purchase_date"]) if a.get("purchase_date") else None,
            purchase_cost=a.get("purchase_cost"),
            warranty_end=datetime.fromisoformat(a["warranty_end"]) if a.get("warranty_end") else None,
            supplier=a.get("supplier"),
            status=a.get("status", "in_stock"),
            condition=a.get("condition", "new"),
            assigned_customer_id=a.get("assigned_customer_id"),
            assigned_customer_name=customer_name,
            location=a.get("location"),
            notes=decrypt_field(a.get("notes")) if a.get("notes") else None,
            tags=a.get("tags", []),
            created_by=a["created_by"],
            created_at=datetime.fromisoformat(a["created_at"]),
            updated_at=datetime.fromisoformat(a["updated_at"]) if a.get("updated_at") else None
        ))
    
    return result

@api_router.post("/assets")
async def create_asset(asset: AssetCreate, user: dict = Depends(get_current_user)):
    """Create a new asset record"""
    asset_data = {
        "id": str(uuid.uuid4()),
        "name": asset.name,
        "asset_type": asset.asset_type,
        "manufacturer": asset.manufacturer,
        "model": asset.model,
        "serial_number": asset.serial_number,
        "specifications": encrypt_field(asset.specifications) if asset.specifications else None,
        "purchase_date": asset.purchase_date.isoformat() if asset.purchase_date else None,
        "purchase_cost": asset.purchase_cost,
        "warranty_end": asset.warranty_end.isoformat() if asset.warranty_end else None,
        "supplier": asset.supplier,
        "status": asset.status,
        "condition": asset.condition,
        "assigned_customer_id": asset.assigned_customer_id,
        "location": asset.location,
        "notes": encrypt_field(asset.notes) if asset.notes else None,
        "tags": asset.tags or [],
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.assets.insert_one(asset_data)
    return {"message": "Asset created", "id": asset_data["id"]}

@api_router.get("/assets/{asset_id}")
async def get_asset(asset_id: str, user: dict = Depends(get_current_user)):
    """Get a specific asset"""
    asset = await db.assets.find_one({"id": asset_id}, {"_id": 0})
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    
    if asset.get("specifications"):
        asset["specifications"] = decrypt_field(asset["specifications"])
    if asset.get("notes"):
        asset["notes"] = decrypt_field(asset["notes"])
    
    return asset

@api_router.put("/assets/{asset_id}")
async def update_asset(asset_id: str, asset: AssetCreate, user: dict = Depends(get_current_user)):
    """Update an asset"""
    update_data = {
        "name": asset.name,
        "asset_type": asset.asset_type,
        "manufacturer": asset.manufacturer,
        "model": asset.model,
        "serial_number": asset.serial_number,
        "specifications": encrypt_field(asset.specifications) if asset.specifications else None,
        "purchase_date": asset.purchase_date.isoformat() if asset.purchase_date else None,
        "purchase_cost": asset.purchase_cost,
        "warranty_end": asset.warranty_end.isoformat() if asset.warranty_end else None,
        "supplier": asset.supplier,
        "status": asset.status,
        "condition": asset.condition,
        "assigned_customer_id": asset.assigned_customer_id,
        "location": asset.location,
        "notes": encrypt_field(asset.notes) if asset.notes else None,
        "tags": asset.tags or [],
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    result = await db.assets.update_one({"id": asset_id}, {"$set": update_data})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Asset not found")
    return {"message": "Asset updated"}

@api_router.delete("/assets/{asset_id}")
async def delete_asset(asset_id: str, user: dict = Depends(get_current_user)):
    """Delete an asset"""
    result = await db.assets.delete_one({"id": asset_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Asset not found")
    return {"message": "Asset deleted"}

@api_router.get("/assets/stats/summary")
async def get_asset_stats(user: dict = Depends(get_current_user)):
    """Get asset statistics"""
    total = await db.assets.count_documents({})
    in_stock = await db.assets.count_documents({"status": "in_stock"})
    in_refurb = await db.assets.count_documents({"status": "in_refurb"})
    deployed = await db.assets.count_documents({"status": "deployed"})
    
    # Get total value
    pipeline = [{"$group": {"_id": None, "total_value": {"$sum": "$purchase_cost"}}}]
    value_result = await db.assets.aggregate(pipeline).to_list(1)
    total_value = value_result[0]["total_value"] if value_result else 0
    
    return {
        "total": total,
        "in_stock": in_stock,
        "in_refurb": in_refurb,
        "deployed": deployed,
        "total_value": total_value or 0
    }

# ==================== TACTICAL RMM INTEGRATION ====================

@api_router.get("/integrations/trmm/test")
async def test_trmm_connection(user: dict = Depends(get_current_user)):
    api_url = os.environ.get("TACTICAL_RMM_API_URL", "").rstrip("/")
    api_key = os.environ.get("TACTICAL_RMM_API_KEY", "")
    
    if not api_url or not api_key:
        raise HTTPException(status_code=400, detail="Tactical RMM not configured")
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{api_url}/clients/",
                headers={"X-API-KEY": api_key, "Content-Type": "application/json"},
                timeout=10.0
            )
            if response.status_code == 200:
                return {"status": "connected", "message": "Successfully connected to Tactical RMM", "url": api_url}
            else:
                return {"status": "error", "message": f"API returned status {response.status_code}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@api_router.get("/integrations/trmm/status")
async def get_trmm_status(user: dict = Depends(get_current_user)):
    """Get TRMM connection status and URL for frontend"""
    api_url = os.environ.get("TACTICAL_RMM_API_URL", "").rstrip("/")
    api_key = os.environ.get("TACTICAL_RMM_API_KEY", "")
    
    if not api_url or not api_key:
        return {"status": "not_configured", "url": None}
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{api_url}/clients/",
                headers={"X-API-KEY": api_key},
                timeout=5.0
            )
            if response.status_code == 200:
                # Convert API URL to web interface URL
                # api.synthesis-it.co.uk -> rmm.synthesis-it.co.uk
                base_url = api_url.replace("://api.", "://rmm.").replace("/api", "").rstrip("/")
                return {"status": "connected", "url": base_url}
            else:
                return {"status": "error", "url": None}
    except:
        return {"status": "error", "url": None}

@api_router.post("/integrations/trmm/sync")
async def sync_from_trmm(user: dict = Depends(get_current_user)):
    api_url = os.environ.get("TACTICAL_RMM_API_URL", "").rstrip("/")
    api_key = os.environ.get("TACTICAL_RMM_API_KEY", "")
    
    if not api_url or not api_key:
        raise HTTPException(status_code=400, detail="Tactical RMM not configured")
    
    headers = {"X-API-KEY": api_key, "Content-Type": "application/json"}
    stats = {"clients_synced": 0, "sites_synced": 0, "agents_synced": 0}
    
    try:
        async with httpx.AsyncClient() as http_client:
            # Fetch clients (sites are embedded in the response)
            clients_resp = await http_client.get(f"{api_url}/clients/", headers=headers, timeout=30.0)
            if clients_resp.status_code != 200:
                raise HTTPException(status_code=500, detail="Failed to fetch clients from TRMM")
            
            trmm_clients = clients_resp.json()
            
            for trmm_client in trmm_clients:
                client_trmm_id = trmm_client.get("id")
                client_name = trmm_client.get("name", "Unknown")
                
                # Sync client
                existing = await db.clients.find_one({"tactical_rmm_client_id": client_trmm_id})
                if existing:
                    await db.clients.update_one(
                        {"tactical_rmm_client_id": client_trmm_id},
                        {"$set": {"name": client_name, "updated_at": datetime.now(timezone.utc).isoformat()}}
                    )
                    local_client_id = existing["id"]
                else:
                    code = client_name[:10].upper().replace(" ", "")
                    existing_code = await db.clients.find_one({"code": code})
                    if existing_code:
                        code = f"{code}{client_trmm_id}"
                    
                    local_client_id = str(uuid.uuid4())
                    new_client = {
                        "id": local_client_id,
                        "name": client_name,
                        "code": code,
                        "tactical_rmm_client_id": client_trmm_id,
                        "is_active": True,
                        "created_by": user["id"],
                        "created_at": datetime.now(timezone.utc).isoformat()
                    }
                    await db.clients.insert_one(new_client)
                stats["clients_synced"] += 1
                
                # Sync sites (embedded in client response)
                trmm_sites = trmm_client.get("sites", [])
                for trmm_site in trmm_sites:
                    site_trmm_id = trmm_site.get("id")
                    site_name = trmm_site.get("name", "Default Site")
                    
                    existing_site = await db.sites.find_one({"tactical_rmm_site_id": site_trmm_id})
                    if existing_site:
                        await db.sites.update_one(
                            {"tactical_rmm_site_id": site_trmm_id},
                            {"$set": {"name": site_name, "client_id": local_client_id}}
                        )
                    else:
                        new_site = {
                            "id": str(uuid.uuid4()),
                            "client_id": local_client_id,
                            "name": site_name,
                            "tactical_rmm_site_id": site_trmm_id,
                            "is_active": True,
                            "created_at": datetime.now(timezone.utc).isoformat()
                        }
                        await db.sites.insert_one(new_site)
                    stats["sites_synced"] += 1
            
            # Fetch agents separately (they have their own endpoint)
            agents_resp = await http_client.get(f"{api_url}/agents/", headers=headers, timeout=60.0)
            if agents_resp.status_code == 200:
                trmm_agents = agents_resp.json()
                
                for agent in trmm_agents:
                    agent_id = agent.get("agent_id")
                    hostname = agent.get("hostname", "Unknown")
                    site_name = agent.get("site_name")
                    client_name = agent.get("client_name")
                    
                    # Find local client by name
                    local_client = await db.clients.find_one({"name": client_name})
                    if not local_client:
                        continue
                    
                    # Find local site by name and client
                    local_site = await db.sites.find_one({"client_id": local_client["id"], "name": site_name})
                    if not local_site:
                        # Try any site for this client
                        local_site = await db.sites.find_one({"client_id": local_client["id"]})
                    if not local_site:
                        # Create a default site if none exists
                        local_site = {
                            "id": str(uuid.uuid4()),
                            "client_id": local_client["id"],
                            "name": site_name or "Default Site",
                            "is_active": True,
                            "created_at": datetime.now(timezone.utc).isoformat()
                        }
                        await db.sites.insert_one(local_site)
                    
                    # Get local IPs - handle both string and list
                    local_ips = agent.get("local_ips", "")
                    if isinstance(local_ips, list):
                        ip_address = local_ips[0] if local_ips else None
                    else:
                        ip_address = local_ips or None
                    
                    # Sync server/agent
                    existing_server = await db.servers.find_one({"tactical_rmm_agent_id": agent_id})
                    server_data = {
                        "hostname": hostname,
                        "ip_address": agent.get("public_ip") or ip_address,
                        "operating_system": agent.get("operating_system"),
                        "os_version": agent.get("version"),
                        "status": "online" if agent.get("status") == "online" else "offline",
                        "server_type": "workstation" if agent.get("monitoring_type") == "workstation" else "server",
                        "cpu_cores": len(agent.get("cpu_model", [])) if agent.get("cpu_model") else None,
                        "notes": agent.get("description"),
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }
                    
                    if existing_server:
                        await db.servers.update_one({"tactical_rmm_agent_id": agent_id}, {"$set": server_data})
                    else:
                        server_data.update({
                            "id": str(uuid.uuid4()),
                            "site_id": local_site["id"],
                            "tactical_rmm_agent_id": agent_id,
                            "environment": "production",
                            "criticality": "medium",
                            "created_by": user["id"],
                            "created_at": datetime.now(timezone.utc).isoformat()
                        })
                        await db.servers.insert_one(server_data)
                    stats["agents_synced"] += 1
            
            return {"message": "Sync completed", "stats": stats}
    
    except httpx.RequestError as e:
        raise HTTPException(status_code=500, detail=f"Connection error: {str(e)}")

# ==================== TRMM DETAILED AGENT INFO ====================

@api_router.get("/integrations/trmm/agent/{agent_id}")
async def get_trmm_agent_details(agent_id: str, user: dict = Depends(get_current_user)):
    """Get detailed agent info directly from TRMM"""
    api_url = os.environ.get("TACTICAL_RMM_API_URL", "").rstrip("/")
    api_key = os.environ.get("TACTICAL_RMM_API_KEY", "")
    
    if not api_url or not api_key:
        raise HTTPException(status_code=400, detail="Tactical RMM not configured")
    
    headers = {"X-API-KEY": api_key, "Content-Type": "application/json"}
    
    try:
        async with httpx.AsyncClient() as http_client:
            response = await http_client.get(
                f"{api_url}/agents/{agent_id}/",
                headers=headers,
                timeout=30.0
            )
            if response.status_code == 200:
                return response.json()
            else:
                raise HTTPException(status_code=response.status_code, detail="Failed to fetch agent from TRMM")
    except httpx.RequestError as e:
        raise HTTPException(status_code=500, detail=f"Connection error: {str(e)}")

@api_router.get("/integrations/trmm/agent/{agent_id}/software")
async def get_trmm_agent_software(agent_id: str, user: dict = Depends(get_current_user)):
    """Get installed software from TRMM agent"""
    api_url = os.environ.get("TACTICAL_RMM_API_URL", "").rstrip("/")
    api_key = os.environ.get("TACTICAL_RMM_API_KEY", "")
    
    if not api_url or not api_key:
        raise HTTPException(status_code=400, detail="Tactical RMM not configured")
    
    headers = {"X-API-KEY": api_key, "Content-Type": "application/json"}
    
    try:
        async with httpx.AsyncClient() as http_client:
            response = await http_client.get(
                f"{api_url}/software/{agent_id}/",
                headers=headers,
                timeout=30.0
            )
            if response.status_code == 200:
                return response.json()
            else:
                return []
    except httpx.RequestError as e:
        return []

@api_router.get("/integrations/trmm/agent/{agent_id}/patches")
async def get_trmm_agent_patches(agent_id: str, user: dict = Depends(get_current_user)):
    """Get Windows updates/patches from TRMM agent"""
    api_url = os.environ.get("TACTICAL_RMM_API_URL", "").rstrip("/")
    api_key = os.environ.get("TACTICAL_RMM_API_KEY", "")
    
    if not api_url or not api_key:
        raise HTTPException(status_code=400, detail="Tactical RMM not configured")
    
    headers = {"X-API-KEY": api_key, "Content-Type": "application/json"}
    
    try:
        async with httpx.AsyncClient() as http_client:
            response = await http_client.get(
                f"{api_url}/winupdate/{agent_id}/",
                headers=headers,
                timeout=30.0
            )
            if response.status_code == 200:
                return response.json()
            else:
                return []
    except httpx.RequestError as e:
        return []

@api_router.post("/integrations/trmm/sync/full")
async def full_sync_from_trmm(user: dict = Depends(get_current_user)):
    """Full sync including detailed agent info - hardware, software, etc."""
    api_url = os.environ.get("TACTICAL_RMM_API_URL", "").rstrip("/")
    api_key = os.environ.get("TACTICAL_RMM_API_KEY", "")
    
    if not api_url or not api_key:
        raise HTTPException(status_code=400, detail="Tactical RMM not configured")
    
    headers = {"X-API-KEY": api_key, "Content-Type": "application/json"}
    stats = {"clients_synced": 0, "sites_synced": 0, "agents_synced": 0, "workstations_synced": 0}
    
    try:
        async with httpx.AsyncClient(timeout=60.0) as http_client:
            # Fetch clients
            clients_resp = await http_client.get(f"{api_url}/clients/", headers=headers)
            if clients_resp.status_code != 200:
                raise HTTPException(status_code=500, detail="Failed to fetch clients from TRMM")
            
            trmm_clients = clients_resp.json()
            
            for trmm_client in trmm_clients:
                client_id = trmm_client.get("id")
                client_name = trmm_client.get("name", "Unknown")
                
                existing = await db.clients.find_one({"tactical_rmm_client_id": client_id})
                if existing:
                    await db.clients.update_one(
                        {"tactical_rmm_client_id": client_id},
                        {"$set": {"name": client_name, "updated_at": datetime.now(timezone.utc).isoformat()}}
                    )
                    local_client_id = existing["id"]
                else:
                    code = client_name[:10].upper().replace(" ", "").replace("-", "")
                    existing_code = await db.clients.find_one({"code": code})
                    if existing_code:
                        code = f"{code}{client_id}"
                    
                    local_client_id = str(uuid.uuid4())
                    new_client = {
                        "id": local_client_id,
                        "name": client_name,
                        "code": code,
                        "tactical_rmm_client_id": client_id,
                        "is_active": True,
                        "created_by": user["id"],
                        "created_at": datetime.now(timezone.utc).isoformat()
                    }
                    await db.clients.insert_one(new_client)
                stats["clients_synced"] += 1
                
                # Fetch sites for this client
                sites_resp = await http_client.get(f"{api_url}/clients/{client_id}/sites/", headers=headers)
                if sites_resp.status_code == 200:
                    trmm_sites = sites_resp.json()
                    
                    for trmm_site in trmm_sites:
                        site_trmm_id = trmm_site.get("id")
                        site_name = trmm_site.get("name", "Default Site")
                        
                        existing_site = await db.sites.find_one({"tactical_rmm_site_id": site_trmm_id})
                        if existing_site:
                            await db.sites.update_one(
                                {"tactical_rmm_site_id": site_trmm_id},
                                {"$set": {"name": site_name, "updated_at": datetime.now(timezone.utc).isoformat()}}
                            )
                        else:
                            local_client = await db.clients.find_one({"tactical_rmm_client_id": client_id})
                            new_site = {
                                "id": str(uuid.uuid4()),
                                "client_id": local_client["id"] if local_client else local_client_id,
                                "name": site_name,
                                "tactical_rmm_site_id": site_trmm_id,
                                "is_active": True,
                                "created_at": datetime.now(timezone.utc).isoformat()
                            }
                            await db.sites.insert_one(new_site)
                        stats["sites_synced"] += 1
            
            # Fetch ALL agents with detail=true for full info
            agents_resp = await http_client.get(f"{api_url}/agents/?detail=true", headers=headers)
            if agents_resp.status_code == 200:
                trmm_agents = agents_resp.json()
                
                for agent in trmm_agents:
                    agent_id = agent.get("agent_id")
                    hostname = agent.get("hostname", "Unknown")
                    site_name = agent.get("site_name")
                    client_name = agent.get("client_name")
                    monitoring_type = agent.get("monitoring_type", "server")  # server or workstation
                    
                    local_client = await db.clients.find_one({"name": client_name})
                    if not local_client:
                        continue
                    
                    local_site = await db.sites.find_one({"client_id": local_client["id"], "name": site_name})
                    if not local_site:
                        local_site = await db.sites.find_one({"client_id": local_client["id"]})
                    if not local_site:
                        continue
                    
                    # Determine if this is a server or workstation
                    is_server = monitoring_type == "server"
                    
                    # Extract hardware info - local_ips can be string or list
                    local_ips = agent.get("local_ips", "")
                    if isinstance(local_ips, str):
                        local_ips = [local_ips] if local_ips else []
                    ip_address = local_ips[0] if local_ips else agent.get("public_ip")
                    
                    # Build comprehensive machine data
                    machine_data = {
                        "hostname": hostname,
                        "ip_address": ip_address,
                        "public_ip": agent.get("public_ip"),
                        "operating_system": agent.get("operating_system"),
                        "os_version": agent.get("version"),
                        "plat": agent.get("plat"),  # windows, linux, darwin
                        "status": "online" if agent.get("status") == "online" else "offline",
                        "last_seen": agent.get("last_seen"),
                        "boot_time": agent.get("boot_time"),
                        "logged_in_username": agent.get("logged_username"),
                        "last_logged_in_user": agent.get("logged_username"),
                        # Hardware info
                        "cpu_model": agent.get("cpu_model"),
                        "cpu_cores": agent.get("cpu_count"),
                        "total_ram": agent.get("total_ram"),  # in GB
                        "ram_gb": agent.get("total_ram"),
                        "used_ram": agent.get("used_ram"),
                        "physical_disks": agent.get("physical_disks", []),
                        "disks": agent.get("disks", []),
                        "graphics": agent.get("graphics"),
                        "make_model": agent.get("make_model"),
                        # Network
                        "local_ips": local_ips,
                        "mac_addresses": agent.get("mac_addresses", []),
                        # Agent info
                        "agent_version": agent.get("version"),
                        "antivirus": agent.get("antivirus"),
                        "needs_reboot": agent.get("needs_reboot", False),
                        "pending_actions_count": agent.get("pending_actions_count", 0),
                        "has_patches_pending": agent.get("has_patches_pending", False),
                        "patches_pending_count": agent.get("patches_pending_count", 0),
                        # Sync metadata
                        "tactical_rmm_agent_id": agent_id,
                        "monitoring_type": monitoring_type,
                        "is_server": is_server,
                        "mesh_node_id": None,  # Will be fetched in detailed sync
                        "synced_at": datetime.now(timezone.utc).isoformat(),
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }
                    
                    # Fetch detailed agent info to get mesh_node_id for remote connect
                    try:
                        detail_response = await client.get(
                            f"{trmm_url.rstrip('/')}/agents/{agent_id}/",
                            headers={"X-API-KEY": api_key}
                        )
                        if detail_response.status_code == 200:
                            detail_data = detail_response.json()
                            machine_data["mesh_node_id"] = detail_data.get("mesh_node_id")
                    except:
                        pass  # Continue without mesh_node_id if detail fetch fails
                    
                    if is_server:
                        # Check if wrongly stored as workstation, move it
                        existing_as_machine = await db.machines.find_one({"tactical_rmm_agent_id": agent_id})
                        if existing_as_machine:
                            await db.machines.delete_one({"tactical_rmm_agent_id": agent_id})
                        
                        # Store as server
                        existing_server = await db.servers.find_one({"tactical_rmm_agent_id": agent_id})
                        if existing_server:
                            await db.servers.update_one({"tactical_rmm_agent_id": agent_id}, {"$set": machine_data})
                        else:
                            machine_data.update({
                                "id": str(uuid.uuid4()),
                                "site_id": local_site["id"],
                                "server_type": "physical" if agent.get("make_model") else "virtual",
                                "environment": "production",
                                "criticality": "medium",
                                "created_by": user["id"],
                                "created_at": datetime.now(timezone.utc).isoformat()
                            })
                            await db.servers.insert_one(machine_data)
                        stats["agents_synced"] += 1
                    else:
                        # Check if wrongly stored as server, move it
                        existing_as_server = await db.servers.find_one({"tactical_rmm_agent_id": agent_id})
                        if existing_as_server:
                            await db.servers.delete_one({"tactical_rmm_agent_id": agent_id})
                        
                        # Store as workstation/machine
                        existing_machine = await db.machines.find_one({"tactical_rmm_agent_id": agent_id})
                        if existing_machine:
                            await db.machines.update_one({"tactical_rmm_agent_id": agent_id}, {"$set": machine_data})
                        else:
                            machine_data.update({
                                "id": str(uuid.uuid4()),
                                "site_id": local_site["id"],
                                "machine_type": "desktop" if "Desktop" in agent.get("operating_system", "") else "laptop",
                                "created_by": user["id"],
                                "created_at": datetime.now(timezone.utc).isoformat()
                            })
                            await db.machines.insert_one(machine_data)
                        stats["workstations_synced"] += 1
            
            return {"message": "Full sync completed", "stats": stats}
    
    except httpx.RequestError as e:
        raise HTTPException(status_code=500, detail=f"Connection error: {str(e)}")

@api_router.post("/trmm/reclassify")
async def reclassify_devices(user: dict = Depends(get_current_user)):
    """Reclassify devices based on their monitoring_type from TRMM"""
    stats = {"moved_to_machines": 0, "moved_to_servers": 0, "updated": 0, "errors": 0}
    
    trmm_url = os.environ.get("TACTICAL_RMM_API_URL", "").rstrip("/")
    api_key = os.environ.get("TACTICAL_RMM_API_KEY", "")
    
    if not trmm_url or not api_key:
        raise HTTPException(status_code=400, detail="TRMM not configured")
    
    async with httpx.AsyncClient(timeout=60.0, verify=False) as client:
        # Fetch all agents from TRMM to get their monitoring_type
        try:
            response = await client.get(
                f"{trmm_url}/agents/",
                headers={"X-API-KEY": api_key}
            )
            if response.status_code != 200:
                raise HTTPException(status_code=500, detail="Failed to fetch agents from TRMM")
            
            trmm_agents = response.json()
            
            # Build a map of agent_id to monitoring_type
            agent_types = {agent["agent_id"]: agent.get("monitoring_type", "server") for agent in trmm_agents}
            
            # Update all servers with their correct monitoring_type and move workstations
            all_servers = await db.servers.find({}, {"_id": 0}).to_list(2000)
            
            for server in all_servers:
                trmm_id = server.get("tactical_rmm_agent_id")
                if not trmm_id:
                    continue
                    
                monitoring_type = agent_types.get(trmm_id, "server")
                
                # Update the monitoring_type field
                await db.servers.update_one(
                    {"id": server["id"]},
                    {"$set": {"monitoring_type": monitoring_type}}
                )
                stats["updated"] += 1
                
                # If it's a workstation, it shouldn't be in servers collection
                if monitoring_type == "workstation":
                    # Move to machines collection would happen here but let's keep them in servers
                    # with correct monitoring_type so the filtering works
                    stats["moved_to_machines"] += 1
            
            return {"message": "Reclassification complete", "stats": stats}
            
        except httpx.RequestError as e:
            raise HTTPException(status_code=500, detail=f"TRMM connection error: {str(e)}")

# ==================== MACHINES (WORKSTATIONS) ====================

class MachineResponse(BaseModel):
    id: str
    site_id: str
    site_name: Optional[str] = None
    client_id: Optional[str] = None
    client_name: Optional[str] = None
    hostname: str
    ip_address: Optional[str]
    public_ip: Optional[str]
    operating_system: Optional[str]
    status: str
    logged_in_username: Optional[str]
    last_logged_in_user: Optional[str]
    cpu_model: Optional[str]
    cpu_cores: Optional[int]
    total_ram: Optional[float]
    make_model: Optional[str]
    needs_reboot: bool = False
    has_patches_pending: bool = False
    patches_pending_count: int = 0
    tactical_rmm_agent_id: Optional[str]
    synced_at: Optional[datetime]

@api_router.get("/machines", response_model=List[MachineResponse])
async def list_machines(client_id: Optional[str] = None, site_id: Optional[str] = None, 
                       status: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = {}
    if site_id:
        query["site_id"] = site_id
    if status:
        query["status"] = status
    
    if client_id:
        sites = await db.sites.find({"client_id": client_id}, {"id": 1}).to_list(1000)
        site_ids = [s["id"] for s in sites]
        query["site_id"] = {"$in": site_ids}
    
    machines = await db.machines.find(query, {"_id": 0}).to_list(1000)
    result = []
    for m in machines:
        site = await db.sites.find_one({"id": m.get("site_id")}, {"name": 1, "client_id": 1})
        client_name = None
        client_id_val = None
        if site:
            client = await db.clients.find_one({"id": site.get("client_id")}, {"name": 1})
            client_name = client["name"] if client else None
            client_id_val = site.get("client_id")
        
        result.append(MachineResponse(
            id=m["id"],
            site_id=m.get("site_id", ""),
            site_name=site["name"] if site else None,
            client_id=client_id_val,
            client_name=client_name,
            hostname=m.get("hostname", "Unknown"),
            ip_address=m.get("ip_address"),
            public_ip=m.get("public_ip"),
            operating_system=m.get("operating_system"),
            status=m.get("status", "unknown"),
            logged_in_username=m.get("logged_in_username"),
            last_logged_in_user=m.get("last_logged_in_user"),
            cpu_model=m.get("cpu_model"),
            cpu_cores=m.get("cpu_cores"),
            total_ram=m.get("total_ram"),
            make_model=m.get("make_model"),
            needs_reboot=m.get("needs_reboot", False),
            has_patches_pending=m.get("has_patches_pending", False),
            patches_pending_count=m.get("patches_pending_count", 0),
            tactical_rmm_agent_id=m.get("tactical_rmm_agent_id"),
            synced_at=datetime.fromisoformat(m["synced_at"]) if m.get("synced_at") else None
        ))
    return result

@api_router.get("/machines/{machine_id}")
async def get_machine(machine_id: str, user: dict = Depends(get_current_user)):
    m = await db.machines.find_one({"id": machine_id}, {"_id": 0})
    if not m:
        raise HTTPException(status_code=404, detail="Machine not found")
    
    site = await db.sites.find_one({"id": m.get("site_id")}, {"name": 1, "client_id": 1})
    client_name = None
    if site:
        client = await db.clients.find_one({"id": site.get("client_id")}, {"name": 1})
        client_name = client["name"] if client else None
    
    m["site_name"] = site["name"] if site else None
    m["client_name"] = client_name
    return m

# ==================== SERVER LIVE INFO FROM TRMM ====================

@api_router.get("/servers/{server_id}/live")
async def get_server_live_info(server_id: str, user: dict = Depends(get_current_user)):
    """Get live info for a server from TRMM"""
    server = await db.servers.find_one({"id": server_id}, {"_id": 0})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    agent_id = server.get("tactical_rmm_agent_id")
    if not agent_id:
        return {"error": "Server not synced from TRMM", "stored_data": server}
    
    api_url = os.environ.get("TACTICAL_RMM_API_URL", "").rstrip("/")
    api_key = os.environ.get("TACTICAL_RMM_API_KEY", "")
    
    if not api_url or not api_key:
        return {"error": "TRMM not configured", "stored_data": server}
    
    headers = {"X-API-KEY": api_key, "Content-Type": "application/json"}
    
    live_data = {
        "agent": None,
        "software": [],
        "patches": [],
        "error": None
    }
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as http_client:
            # Get agent details
            agent_resp = await http_client.get(f"{api_url}/agents/{agent_id}/", headers=headers)
            if agent_resp.status_code == 200:
                live_data["agent"] = agent_resp.json()
            
            # Get software
            software_resp = await http_client.get(f"{api_url}/software/{agent_id}/", headers=headers)
            if software_resp.status_code == 200:
                live_data["software"] = software_resp.json()
            
            # Get patches/updates
            patches_resp = await http_client.get(f"{api_url}/winupdate/{agent_id}/", headers=headers)
            if patches_resp.status_code == 200:
                live_data["patches"] = patches_resp.json()
    except Exception as e:
        live_data["error"] = str(e)
    
    return live_data

# ==================== MONTHLY TASK TEMPLATES ====================

MONTHLY_SERVER_TASKS = [
    {"title": "Monthly Server Health Check", "description": "Complete monthly health check for server", "priority": "medium"},
    {"title": "Review Event Logs", "description": "Check Windows Event logs for errors and warnings", "priority": "medium"},
    {"title": "Verify Backup Status", "description": "Confirm backups are running and test restore if needed", "priority": "high"},
    {"title": "Check Disk Space", "description": "Review disk usage and clean up if necessary", "priority": "medium"},
    {"title": "Review Pending Updates", "description": "Check for and schedule Windows updates", "priority": "medium"},
    {"title": "Security Audit", "description": "Review security settings, local admin accounts", "priority": "high"},
    {"title": "Performance Review", "description": "Check CPU, RAM, and resource usage trends", "priority": "low"},
]

@api_router.post("/tasks/generate-monthly")
async def generate_monthly_tasks(client_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    """Generate monthly server tasks for all servers or specific client"""
    now = datetime.now(timezone.utc)
    month = now.month
    year = now.year
    
    query = {}
    if client_id:
        sites = await db.sites.find({"client_id": client_id}, {"id": 1}).to_list(1000)
        site_ids = [s["id"] for s in sites]
        query["site_id"] = {"$in": site_ids}
    
    servers = await db.servers.find(query, {"_id": 0}).to_list(1000)
    tasks_created = 0
    
    for server in servers:
        # Get client info for task
        site = await db.sites.find_one({"id": server.get("site_id")}, {"client_id": 1})
        client_id_for_task = site.get("client_id") if site else None
        
        for task_template in MONTHLY_SERVER_TASKS:
            # Check if task already exists for this server/month
            existing = await db.tasks.find_one({
                "server_id": server["id"],
                "title": f"{task_template['title']} - {server['hostname']}",
                "created_at": {"$regex": f"^{year}-{month:02d}"}
            })
            
            if not existing:
                task = {
                    "id": str(uuid.uuid4()),
                    "title": f"{task_template['title']} - {server['hostname']}",
                    "description": encrypt_field(f"{task_template['description']}\n\nServer: {server['hostname']}\nMonth: {now.strftime('%B %Y')}"),
                    "server_id": server["id"],
                    "client_id": client_id_for_task,
                    "priority": task_template["priority"],
                    "status": "open",
                    "due_date": (now.replace(day=28)).isoformat(),  # Due end of month
                    "assigned_to": None,
                    "created_by": user["id"],
                    "created_at": now.isoformat(),
                    "is_monthly_task": True,
                    "month": month,
                    "year": year
                }
                await db.tasks.insert_one(task)
                tasks_created += 1
    
    return {"message": f"Generated {tasks_created} monthly tasks for {len(servers)} servers"}

@api_router.post("/sophie/chat")
async def sophie_chat(message: SophieMessage, user: dict = Depends(get_current_user)):
    # Check for available API keys (prefer OpenAI, fallback to Gemini)
    openai_key = os.environ.get("OPENAI_API_KEY")
    gemini_key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")
    
    if not openai_key and not gemini_key:
        raise HTTPException(status_code=500, detail="AI not configured. Set OPENAI_API_KEY or GOOGLE_API_KEY in .env")
    
    session_id = message.session_id or f"sophie-{user['id']}-{datetime.now().strftime('%Y%m%d')}"
    
    # Get documentation for context
    docs = await db.documentation.find({"is_published": True}, {"title": 1, "content": 1}).to_list(50)
    doc_context = "\n".join([f"- {d['title']}" for d in docs]) if docs else "No documentation available yet."
    
    # Get recent incidents for context
    recent_incidents = await db.incidents.find({"status": {"$ne": "resolved"}}, {"title": 1, "severity": 1}).to_list(5)
    incident_context = "\n".join([f"- {i['title']} ({i['severity']})" for i in recent_incidents]) if recent_incidents else "No open incidents."
    
    system_message = f"""You are Sophie, the expert AI assistant for SynthOps - an IT Operations Portal for Synthesis IT Ltd, a Managed Service Provider (MSP).

You are an expert in ALL aspects of IT including:
- Windows Server administration (Active Directory, DNS, DHCP, Group Policy, File Services, Print Services)
- Microsoft 365 / Azure AD / Entra ID administration
- Networking (TCP/IP, VLANs, firewalls, VPNs, routing, switching)
- Virtualization (Hyper-V, VMware, Proxmox)
- Backup solutions (Veeam, Windows Server Backup, cloud backup)
- Security (antivirus, EDR, firewalls, security best practices, incident response)
- PowerShell scripting and automation
- Hardware troubleshooting (servers, workstations, printers, network equipment)
- Linux administration
- Cloud services (Azure, AWS basics)
- Remote Monitoring and Management (RMM) tools like Tactical RMM
- Help desk and ticketing best practices
- UPS and power management (APC PowerChute)
- Disaster recovery and business continuity planning

Your role is to help IT engineers with:
1. PC and server troubleshooting - provide step-by-step diagnostic procedures
2. IT best practices and procedures - explain the 'why' not just the 'how'
3. PowerShell scripts and commands - provide working code examples
4. Security recommendations and incident response guidance
5. Network troubleshooting and configuration
6. Documentation and runbook guidance

Available Documentation in SynthOps:
{doc_context}

Current Open Incidents:
{incident_context}

Guidelines:
- Be technical and detailed - users are IT professionals
- Provide PowerShell commands, CLI examples, and specific steps where applicable
- If troubleshooting, ask clarifying questions to narrow down the issue
- Reference industry best practices (Microsoft, NIST, CIS benchmarks)
- If you don't know something specific to this organization, provide general IT best practices
- Be concise but thorough - don't skip important details
- Use formatting (bullet points, numbered steps) for clarity
- When discussing security, always emphasize best practices"""

    try:
        if openai_key:
            # Use OpenAI
            import openai
            client = openai.AsyncOpenAI(api_key=openai_key)
            
            # Get chat history for context
            history = await db.sophie_chats.find(
                {"session_id": session_id},
                {"user_message": 1, "assistant_response": 1, "_id": 0}
            ).sort("created_at", -1).limit(10).to_list(10)
            
            messages = [{"role": "system", "content": system_message}]
            # Add history in chronological order
            for h in reversed(history):
                messages.append({"role": "user", "content": h["user_message"]})
                messages.append({"role": "assistant", "content": h["assistant_response"]})
            messages.append({"role": "user", "content": message.message})
            
            completion = await client.chat.completions.create(
                model="gpt-4o",
                messages=messages,
                max_tokens=2000
            )
            response = completion.choices[0].message.content
            
        else:
            # Use Gemini
            import google.generativeai as genai
            genai.configure(api_key=gemini_key)
            
            # Use Gemini 2.5 Flash - fast and capable
            model = genai.GenerativeModel('gemini-2.5-flash')
            
            # Get chat history for context
            history = await db.sophie_chats.find(
                {"session_id": session_id},
                {"user_message": 1, "assistant_response": 1, "_id": 0}
            ).sort("created_at", -1).limit(10).to_list(10)
            
            # Build conversation
            conversation = f"{system_message}\n\n"
            for h in reversed(history):
                conversation += f"User: {h['user_message']}\nAssistant: {h['assistant_response']}\n\n"
            conversation += f"User: {message.message}\nAssistant:"
            
            result = model.generate_content(conversation)
            response = result.text
        
        # Store in chat history
        await db.sophie_chats.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "session_id": session_id,
            "user_message": message.message,
            "assistant_response": response,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        
        return {"response": response, "session_id": session_id}
    
    except Exception as e:
        logger.error(f"Sophie AI error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"AI error: {str(e)}")

@api_router.get("/sophie/history")
async def get_sophie_history(session_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = {"user_id": user["id"]}
    if session_id:
        query["session_id"] = session_id
    
    history = await db.sophie_chats.find(query, {"_id": 0}).sort("created_at", -1).to_list(50)
    return history

# ==================== DASHBOARD ====================

@api_router.get("/dashboard/stats", response_model=DashboardStats)
async def get_dashboard_stats(user: dict = Depends(get_current_user)):
    total_clients = await db.clients.count_documents({"is_active": True})
    # Only count actual servers (not workstations that may be in the collection)
    server_filter = {"$or": [{"monitoring_type": "server"}, {"monitoring_type": {"$exists": False}}]}
    total_servers = await db.servers.count_documents(server_filter)
    servers_online = await db.servers.count_documents({**server_filter, "status": "online"})
    servers_offline = await db.servers.count_documents({**server_filter, "status": "offline"})
    open_incidents = await db.incidents.count_documents({"status": {"$in": ["open", "investigating"]}})
    open_tasks = await db.tasks.count_documents({"status": {"$in": ["open", "in_progress"]}})
    active_projects = await db.projects.count_documents({"status": {"$in": ["planning", "active"]}})
    pending_health_checks = await db.health_checks.count_documents({"status": "pending"})
    
    return DashboardStats(
        total_clients=total_clients,
        total_servers=total_servers,
        servers_online=servers_online,
        servers_offline=servers_offline,
        open_incidents=open_incidents,
        open_tasks=open_tasks,
        active_projects=active_projects,
        pending_health_checks=pending_health_checks
    )

@api_router.get("/dashboard/activity")
async def get_recent_activity(limit: int = 20, user: dict = Depends(get_current_user)):
    activities = []
    
    # Recent tasks
    tasks = await db.tasks.find({}, {"_id": 0}).sort("created_at", -1).limit(5).to_list(5)
    for t in tasks:
        activities.append({
            "type": "task",
            "title": f"Task: {t['title']}",
            "status": t.get("status"),
            "timestamp": t["created_at"]
        })
    
    # Recent incidents
    incidents = await db.incidents.find({}, {"_id": 0}).sort("date_opened", -1).limit(5).to_list(5)
    for i in incidents:
        activities.append({
            "type": "incident",
            "title": f"Incident: {i['title']}",
            "status": i.get("status"),
            "severity": i.get("severity"),
            "timestamp": i["date_opened"]
        })
    
    # Recent maintenance
    maintenance = await db.maintenance.find({}, {"_id": 0}).sort("created_at", -1).limit(5).to_list(5)
    for m in maintenance:
        server = await db.servers.find_one({"id": m["server_id"]}, {"hostname": 1})
        activities.append({
            "type": "maintenance",
            "title": f"Maintenance: {m['maintenance_type']} on {server['hostname'] if server else 'Unknown'}",
            "status": m.get("status"),
            "timestamp": m["created_at"]
        })
    
    # Sort by timestamp
    activities.sort(key=lambda x: x["timestamp"], reverse=True)
    return activities[:limit]

@api_router.get("/dashboard/tech-tip")
async def get_daily_tech_tip(user: dict = Depends(get_current_user)):
    """Get a daily tech tip - rotates through curated MSP/IT tips"""
    tips = [
        {"category": "Security", "tip": "Enable MFA on all admin accounts. It blocks 99.9% of automated attacks and is the single most effective security measure you can implement.", "source": "NIST SP 800-63B"},
        {"category": "Backup", "tip": "Follow the 3-2-1 backup rule: 3 copies of data, on 2 different media types, with 1 copy offsite. Test restores monthly.", "source": "US-CERT"},
        {"category": "Networking", "tip": "Segment your network with VLANs. If ransomware hits one subnet, proper segmentation prevents lateral movement across the entire network.", "source": "CIS Controls v8"},
        {"category": "Windows", "tip": "Use Group Policy to disable SMBv1 across all endpoints. It's the protocol exploited by WannaCry and EternalBlue.", "source": "Microsoft Security Advisory"},
        {"category": "Monitoring", "tip": "Set up SNMP traps for disk space alerts at 80% and 90%. Most server outages are caused by full disks that could have been caught early.", "source": "Best Practice"},
        {"category": "PowerShell", "tip": "Use 'Get-EventLog -LogName System -EntryType Error -Newest 20' to quickly check recent system errors on a Windows server without opening Event Viewer.", "source": "SysAdmin Tip"},
        {"category": "Active Directory", "tip": "Run 'dcdiag /v' monthly on all domain controllers. It catches replication issues, DNS problems, and trust relationship failures before they cascade.", "source": "Microsoft TechNet"},
        {"category": "Security", "tip": "Audit local admin accounts quarterly. Disable any that aren't needed. Every local admin account is a potential lateral movement path for attackers.", "source": "CIS Benchmark"},
        {"category": "Patching", "tip": "Patch critical vulnerabilities within 14 days of release. Automate where possible, but always test on a pilot group first.", "source": "CISA BOD 22-01"},
        {"category": "DNS", "tip": "Implement DNS filtering (e.g., Quad9, OpenDNS) as an easy first layer of defence. It blocks known malicious domains before they even resolve.", "source": "NCSC Guidance"},
        {"category": "Email", "tip": "Configure SPF, DKIM, and DMARC for all client domains. It dramatically reduces email spoofing and improves deliverability.", "source": "Google/Microsoft Best Practice"},
        {"category": "RMM", "tip": "Create automated maintenance tasks in your RMM for disk cleanup, temp file removal, and Windows Update checks. Proactive beats reactive every time.", "source": "MSP Best Practice"},
        {"category": "Documentation", "tip": "Document every network change with date, who, what, and why. Future you (or the next tech) will thank present you during an outage at 2am.", "source": "ITIL v4"},
        {"category": "Virtualization", "tip": "Never allocate more than 80% of host RAM to VMs. Leave headroom for the hypervisor and unexpected memory spikes.", "source": "VMware/Proxmox Best Practice"},
        {"category": "SSL", "tip": "Set calendar reminders 30 days before SSL certificate expiry. Better yet, use Let's Encrypt with auto-renewal and never worry about it again.", "source": "Best Practice"},
        {"category": "Firewall", "tip": "Review firewall rules quarterly. Remove any 'temporary' rules that are older than 90 days. Temporary rules have a habit of becoming permanent vulnerabilities.", "source": "CIS Controls"},
        {"category": "Password", "tip": "Use a password manager for all client credentials. Never store passwords in spreadsheets, sticky notes, or email. Vaultwarden is a great self-hosted option.", "source": "NIST SP 800-63B"},
        {"category": "Endpoint", "tip": "Enable BitLocker (or equivalent) on all laptops. If a device is lost or stolen, full-disk encryption is the difference between a minor incident and a data breach.", "source": "ICO Guidance"},
        {"category": "Linux", "tip": "Use 'fail2ban' on all internet-facing Linux servers. It automatically blocks IPs after repeated failed login attempts.", "source": "SysAdmin Tip"},
        {"category": "Cloud", "tip": "Enable audit logging in M365/Google Workspace for all client tenants. When an incident happens, logs are the first thing you need and the last thing people configure.", "source": "Microsoft 365 Security"},
        {"category": "Disaster Recovery", "tip": "Run a tabletop DR exercise with your team once a year. Walk through a scenario: 'Client X's server is encrypted with ransomware. What do we do first?'", "source": "NIST CSF"},
        {"category": "Performance", "tip": "Check server uptime regularly with 'systeminfo | find \"Boot Time\"' on Windows or 'uptime' on Linux. Servers that haven't rebooted in months are probably missing critical patches.", "source": "Best Practice"},
        {"category": "Networking", "tip": "Label every network cable and port. Document switch port assignments. During an outage, you don't want to be tracing cables with a torch.", "source": "Structured Cabling Standard"},
        {"category": "Security", "tip": "Implement application whitelisting on critical servers. If an executable isn't on the approved list, it doesn't run. Simple and devastatingly effective against malware.", "source": "ASD Essential Eight"},
        {"category": "Automation", "tip": "If you do something more than 3 times, script it. PowerShell, Python, or bash - pick one and invest time in automation. Your future self will have more time for complex problems.", "source": "DevOps Principle"},
        {"category": "Client Management", "tip": "Send monthly reports to clients showing uptime, patches applied, and threats blocked. It demonstrates value and justifies your managed service fees.", "source": "MSP Growth Strategy"},
        {"category": "Hardware", "tip": "Check server RAID array health weekly. A degraded RAID with no alert is one drive failure away from total data loss.", "source": "Storage Best Practice"},
        {"category": "Windows", "tip": "Use 'sfc /scannow' and 'DISM /Online /Cleanup-Image /RestoreHealth' when Windows starts behaving oddly. Corrupted system files cause more issues than people realise.", "source": "Microsoft Support"},
        {"category": "Backup", "tip": "Test a bare-metal restore at least once a quarter. A backup that can't be restored is not a backup - it's a false sense of security.", "source": "ISO 27001"},
        {"category": "Remote Access", "tip": "Never expose RDP directly to the internet. Use a VPN or RDP Gateway. Open port 3389 is the #1 target for brute-force attacks and ransomware.", "source": "CISA Alert AA20-073A"},
    ]
    
    # Use day of year to rotate tips (one per day, cycles through all)
    day_of_year = datetime.now(timezone.utc).timetuple().tm_yday
    tip_index = day_of_year % len(tips)
    tip = tips[tip_index]
    tip["day"] = day_of_year
    tip["total_tips"] = len(tips)
    return tip

@api_router.get("/staff/activity")
async def get_staff_activity(user: dict = Depends(get_current_user)):
    users = await db.users.find({"is_active": True}, {"_id": 0, "password_hash": 0, "totp_secret": 0}).to_list(100)
    
    result = []
    today = datetime.now(timezone.utc).date().isoformat()
    
    for u in users:
        # Get today's time entries
        time_entries = await db.time_entries.find({
            "user_id": u["id"],
            "entry_date": {"$regex": f"^{today}"}
        }, {"_id": 0}).to_list(100)
        
        total_minutes = sum(e.get("duration_minutes", 0) for e in time_entries)
        
        # Get current/recent task
        current_task = await db.tasks.find_one(
            {"assigned_to": u["id"], "status": "in_progress"},
            {"title": 1, "client_id": 1}
        )
        
        client_name = None
        if current_task and current_task.get("client_id"):
            client = await db.clients.find_one({"id": current_task["client_id"]}, {"name": 1})
            client_name = client["name"] if client else None
        
        result.append({
            "user_id": u["id"],
            "username": u["username"],
            "role": u["role"],
            "current_task": current_task["title"] if current_task else None,
            "current_client": client_name,
            "hours_today": round(total_minutes / 60, 1),
            "status": "active" if current_task else "available"
        })
    
    return result

# ==================== EXPORT ENDPOINTS ====================

import io
import csv

@api_router.get("/export/timesheet")
async def export_timesheet(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user_id: Optional[str] = None,
    client_id: Optional[str] = None,
    format: str = "csv",
    user: dict = Depends(get_current_user)
):
    """Export timesheet data as CSV"""
    query = {}
    
    if start_date:
        query["entry_date"] = {"$gte": start_date}
    if end_date:
        if "entry_date" in query:
            query["entry_date"]["$lte"] = end_date
        else:
            query["entry_date"] = {"$lte": end_date}
    if user_id:
        query["user_id"] = user_id
    if client_id:
        query["client_id"] = client_id
    
    entries = await db.time_entries.find(query, {"_id": 0}).sort("entry_date", -1).to_list(10000)
    
    # Enrich with names
    for entry in entries:
        if entry.get("user_id"):
            u = await db.users.find_one({"id": entry["user_id"]}, {"username": 1})
            entry["username"] = u["username"] if u else "Unknown"
        if entry.get("client_id"):
            c = await db.clients.find_one({"id": entry["client_id"]}, {"name": 1})
            entry["client_name"] = c["name"] if c else "Unknown"
        if entry.get("task_id"):
            t = await db.tasks.find_one({"id": entry["task_id"]}, {"title": 1})
            entry["task_title"] = t["title"] if t else "Unknown"
        if entry.get("project_id"):
            p = await db.projects.find_one({"id": entry["project_id"]}, {"name": 1})
            entry["project_name"] = p["name"] if p else "Unknown"
    
    # Generate CSV
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Header
    writer.writerow([
        "Date", "User", "Client", "Project", "Task", "Description",
        "Duration (min)", "Hours", "Billable"
    ])
    
    total_minutes = 0
    total_billable = 0
    
    for e in entries:
        hours = round(e.get("duration_minutes", 0) / 60, 2)
        writer.writerow([
            e.get("entry_date", ""),
            e.get("username", ""),
            e.get("client_name", ""),
            e.get("project_name", ""),
            e.get("task_title", ""),
            e.get("description", ""),
            e.get("duration_minutes", 0),
            hours,
            "Yes" if e.get("is_billable") else "No"
        ])
        total_minutes += e.get("duration_minutes", 0)
        if e.get("is_billable"):
            total_billable += e.get("duration_minutes", 0)
    
    # Summary row
    writer.writerow([])
    writer.writerow(["TOTALS", "", "", "", "", "", total_minutes, round(total_minutes/60, 2), ""])
    writer.writerow(["BILLABLE", "", "", "", "", "", total_billable, round(total_billable/60, 2), ""])
    
    output.seek(0)
    filename = f"timesheet_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@api_router.get("/export/clients")
async def export_clients(format: str = "csv", user: dict = Depends(get_current_user)):
    """Export clients list as CSV"""
    clients = await db.clients.find({}, {"_id": 0}).sort("name", 1).to_list(1000)
    
    # Enrich with server/site counts
    for c in clients:
        c["site_count"] = await db.sites.count_documents({"client_id": c["id"]})
        c["server_count"] = await db.servers.count_documents({"client_id": c["id"]})
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    writer.writerow([
        "Name", "Code", "Contact Name", "Email", "Phone", "Address",
        "Contract Type", "Monthly Hours", "Sites", "Servers", "Active", "Created"
    ])
    
    for c in clients:
        writer.writerow([
            c.get("name", ""),
            c.get("code", ""),
            c.get("contact_name", ""),
            c.get("contact_email", ""),
            c.get("contact_phone", ""),
            c.get("address", ""),
            c.get("contract_type", ""),
            c.get("contract_hours_monthly", ""),
            c.get("site_count", 0),
            c.get("server_count", 0),
            "Yes" if c.get("is_active") else "No",
            c.get("created_at", "")[:10] if c.get("created_at") else ""
        ])
    
    output.seek(0)
    filename = f"clients_{datetime.now().strftime('%Y%m%d')}.csv"
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@api_router.get("/export/servers")
async def export_servers(client_id: Optional[str] = None, format: str = "csv", user: dict = Depends(get_current_user)):
    """Export servers list as CSV"""
    query = {}
    if client_id:
        query["client_id"] = client_id
    
    servers = await db.servers.find(query, {"_id": 0}).sort("hostname", 1).to_list(10000)
    
    # Enrich with client/site names
    for s in servers:
        if s.get("site_id"):
            site = await db.sites.find_one({"id": s["site_id"]}, {"name": 1, "client_id": 1})
            s["site_name"] = site["name"] if site else ""
            if site and site.get("client_id"):
                client = await db.clients.find_one({"id": site["client_id"]}, {"name": 1})
                s["client_name"] = client["name"] if client else ""
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    writer.writerow([
        "Hostname", "Client", "Site", "Role", "IP Address", "Operating System",
        "Type", "CPU Cores", "RAM (GB)", "Storage (GB)", "Environment",
        "Criticality", "Status", "Created"
    ])
    
    for s in servers:
        writer.writerow([
            s.get("hostname", ""),
            s.get("client_name", ""),
            s.get("site_name", ""),
            s.get("role", ""),
            s.get("ip_address", ""),
            s.get("operating_system", ""),
            s.get("server_type", ""),
            s.get("cpu_cores", ""),
            s.get("ram_gb", ""),
            s.get("storage_gb", ""),
            s.get("environment", ""),
            s.get("criticality", ""),
            s.get("status", ""),
            s.get("created_at", "")[:10] if s.get("created_at") else ""
        ])
    
    output.seek(0)
    filename = f"servers_{datetime.now().strftime('%Y%m%d')}.csv"
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@api_router.get("/export/incidents")
async def export_incidents(
    client_id: Optional[str] = None,
    status: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    format: str = "csv",
    user: dict = Depends(get_current_user)
):
    """Export incidents as CSV"""
    query = {}
    if client_id:
        query["client_id"] = client_id
    if status:
        query["status"] = status
    if start_date:
        query["date_opened"] = {"$gte": start_date}
    if end_date:
        if "date_opened" in query:
            query["date_opened"]["$lte"] = end_date
        else:
            query["date_opened"] = {"$lte": end_date}
    
    incidents = await db.incidents.find(query, {"_id": 0}).sort("date_opened", -1).to_list(10000)
    
    # Enrich with names
    for i in incidents:
        if i.get("client_id"):
            c = await db.clients.find_one({"id": i["client_id"]}, {"name": 1})
            i["client_name"] = c["name"] if c else ""
        if i.get("server_id"):
            s = await db.servers.find_one({"id": i["server_id"]}, {"hostname": 1})
            i["server_name"] = s["hostname"] if s else ""
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    writer.writerow([
        "Title", "Client", "Server", "Severity", "Status", "Description",
        "Resolution", "Opened", "Resolved"
    ])
    
    for i in incidents:
        writer.writerow([
            i.get("title", ""),
            i.get("client_name", ""),
            i.get("server_name", ""),
            i.get("severity", ""),
            i.get("status", ""),
            i.get("description", ""),
            i.get("resolution", ""),
            i.get("date_opened", "")[:10] if i.get("date_opened") else "",
            i.get("date_closed", "")[:10] if i.get("date_closed") else ""
        ])
    
    output.seek(0)
    filename = f"incidents_{datetime.now().strftime('%Y%m%d')}.csv"
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@api_router.get("/export/health-checks")
async def export_health_checks(
    server_id: Optional[str] = None,
    client_id: Optional[str] = None,
    month: Optional[str] = None,
    format: str = "csv",
    user: dict = Depends(get_current_user)
):
    """Export health checks as CSV"""
    query = {}
    if server_id:
        query["server_id"] = server_id
    if month:
        query["check_month"] = month
    
    # If client_id, get all servers for that client first
    if client_id and not server_id:
        servers = await db.servers.find({"client_id": client_id}, {"id": 1}).to_list(1000)
        server_ids = [s["id"] for s in servers]
        if server_ids:
            query["server_id"] = {"$in": server_ids}
    
    checks = await db.health_checks.find(query, {"_id": 0}).sort("created_at", -1).to_list(10000)
    
    # Enrich
    for c in checks:
        if c.get("server_id"):
            s = await db.servers.find_one({"id": c["server_id"]}, {"hostname": 1, "site_id": 1})
            c["server_name"] = s["hostname"] if s else ""
            if s and s.get("site_id"):
                site = await db.sites.find_one({"id": s["site_id"]}, {"client_id": 1})
                if site and site.get("client_id"):
                    client = await db.clients.find_one({"id": site["client_id"]}, {"name": 1})
                    c["client_name"] = client["name"] if client else ""
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    writer.writerow([
        "Client", "Server", "Category", "Check Name", "Status", "Value",
        "Notes", "Month", "Completed By", "Completed At"
    ])
    
    for c in checks:
        writer.writerow([
            c.get("client_name", ""),
            c.get("server_name", ""),
            c.get("category", ""),
            c.get("template_name", ""),
            c.get("status", ""),
            c.get("value_recorded", ""),
            c.get("notes", ""),
            c.get("check_month", ""),
            c.get("completed_by_name", ""),
            c.get("completed_at", "")[:16] if c.get("completed_at") else ""
        ])
    
    output.seek(0)
    filename = f"health_checks_{datetime.now().strftime('%Y%m%d')}.csv"
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@api_router.get("/export/client-report/{client_id}")
async def export_client_report(client_id: str, user: dict = Depends(get_current_user)):
    """Generate a comprehensive client report"""
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Gather all data
    sites = await db.sites.find({"client_id": client_id}, {"_id": 0}).to_list(100)
    servers = await db.servers.find({"client_id": client_id}, {"_id": 0}).to_list(1000)
    
    # Get server IDs for further queries
    server_ids = [s["id"] for s in servers]
    
    incidents = await db.incidents.find({"client_id": client_id}, {"_id": 0}).sort("date_opened", -1).to_list(100)
    tasks = await db.tasks.find({"client_id": client_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    projects = await db.projects.find({"client_id": client_id}, {"_id": 0}).to_list(100)
    
    # Time entries for this month
    this_month = datetime.now(timezone.utc).strftime("%Y-%m")
    time_entries = await db.time_entries.find({
        "client_id": client_id,
        "entry_date": {"$regex": f"^{this_month}"}
    }, {"_id": 0}).to_list(1000)
    
    total_hours = sum(e.get("duration_minutes", 0) for e in time_entries) / 60
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Client Info
    writer.writerow(["CLIENT REPORT"])
    writer.writerow(["Generated", datetime.now().strftime("%Y-%m-%d %H:%M")])
    writer.writerow([])
    writer.writerow(["CLIENT INFORMATION"])
    writer.writerow(["Name", client.get("name", "")])
    writer.writerow(["Code", client.get("code", "")])
    writer.writerow(["Contact", client.get("contact_name", "")])
    writer.writerow(["Email", client.get("contact_email", "")])
    writer.writerow(["Phone", client.get("contact_phone", "")])
    writer.writerow(["Contract Type", client.get("contract_type", "")])
    writer.writerow(["Monthly Hours", client.get("contract_hours_monthly", "")])
    writer.writerow([])
    
    # Summary
    writer.writerow(["SUMMARY"])
    writer.writerow(["Total Sites", len(sites)])
    writer.writerow(["Total Servers", len(servers)])
    online_servers = len([s for s in servers if s.get("status") == "online"])
    writer.writerow(["Servers Online", online_servers])
    writer.writerow(["Open Incidents", len([i for i in incidents if i.get("status") != "resolved"])])
    writer.writerow(["Open Tasks", len([t for t in tasks if t.get("status") not in ["completed", "blocked"]])])
    writer.writerow(["Active Projects", len([p for p in projects if p.get("status") == "active"])])
    writer.writerow(["Hours This Month", round(total_hours, 1)])
    writer.writerow([])
    
    # Servers
    writer.writerow(["SERVERS"])
    writer.writerow(["Hostname", "Role", "IP", "OS", "Status"])
    for s in servers:
        writer.writerow([
            s.get("hostname", ""),
            s.get("role", ""),
            s.get("ip_address", ""),
            s.get("operating_system", "")[:40] if s.get("operating_system") else "",
            s.get("status", "")
        ])
    writer.writerow([])
    
    # Recent Incidents
    writer.writerow(["RECENT INCIDENTS (Last 10)"])
    writer.writerow(["Title", "Severity", "Status", "Opened"])
    for i in incidents[:10]:
        writer.writerow([
            i.get("title", ""),
            i.get("severity", ""),
            i.get("status", ""),
            i.get("date_opened", "")[:10] if i.get("date_opened") else ""
        ])
    
    output.seek(0)
    filename = f"client_report_{client.get('code', 'UNKNOWN')}_{datetime.now().strftime('%Y%m%d')}.csv"
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# ==================== BACKUP TRACKING ====================

class BackupLogCreate(BaseModel):
    client_id: str
    backup_date: str
    backup_type: str = "full"  # full, incremental, differential
    status: str = "success"  # success, failed, partial
    storage_size_gb: Optional[float] = None
    destination: Optional[str] = None  # local, cloud, offsite
    notes: Optional[str] = None

class BackupLogUpdate(BaseModel):
    backup_date: Optional[str] = None
    backup_type: Optional[str] = None
    status: Optional[str] = None
    storage_size_gb: Optional[float] = None
    destination: Optional[str] = None
    notes: Optional[str] = None

@api_router.get("/backups")
async def get_backup_logs(
    client_id: Optional[str] = None,
    status: Optional[str] = None,
    month: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    """Get backup logs with optional filters"""
    query = {}
    if client_id:
        query["client_id"] = client_id
    if status:
        query["status"] = status
    if month:
        query["backup_date"] = {"$regex": f"^{month}"}
    
    logs = await db.backup_logs.find(query, {"_id": 0}).sort("backup_date", -1).to_list(500)
    
    # Enrich with client names
    for log in logs:
        client = await db.clients.find_one({"id": log["client_id"]}, {"_id": 0, "name": 1})
        log["client_name"] = client["name"] if client else "Unknown"
    
    return logs

@api_router.post("/backups")
async def create_backup_log(data: BackupLogCreate, user: dict = Depends(get_current_user)):
    """Create a new backup log entry"""
    log = {
        "id": str(uuid.uuid4()),
        "client_id": data.client_id,
        "backup_date": data.backup_date,
        "backup_type": data.backup_type,
        "status": data.status,
        "storage_size_gb": data.storage_size_gb,
        "destination": data.destination,
        "notes": data.notes,
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.backup_logs.insert_one(log)
    log.pop("_id", None)
    return log

@api_router.put("/backups/{log_id}")
async def update_backup_log(log_id: str, data: BackupLogUpdate, user: dict = Depends(get_current_user)):
    """Update a backup log entry"""
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.backup_logs.update_one({"id": log_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Backup log not found")
    return {"message": "Updated"}

@api_router.delete("/backups/{log_id}")
async def delete_backup_log(log_id: str, user: dict = Depends(get_current_user)):
    """Delete a backup log entry"""
    result = await db.backup_logs.delete_one({"id": log_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Backup log not found")
    return {"message": "Deleted"}

@api_router.get("/backups/stats")
async def get_backup_stats(user: dict = Depends(get_current_user)):
    """Get backup statistics summary"""
    now = datetime.now(timezone.utc)
    current_month = now.strftime("%Y-%m")
    
    # This month's stats
    month_logs = await db.backup_logs.find(
        {"backup_date": {"$regex": f"^{current_month}"}}, {"_id": 0}
    ).to_list(5000)
    
    total_this_month = len(month_logs)
    successful = len([l for l in month_logs if l["status"] == "success"])
    failed = len([l for l in month_logs if l["status"] == "failed"])
    partial = len([l for l in month_logs if l["status"] == "partial"])
    total_storage = sum(l.get("storage_size_gb", 0) or 0 for l in month_logs)
    
    # Get clients with no backups this month
    all_clients = await db.clients.find({"is_active": {"$ne": False}}, {"_id": 0, "id": 1, "name": 1}).to_list(500)
    clients_with_backups = set(l["client_id"] for l in month_logs)
    clients_without_backups = [c for c in all_clients if c["id"] not in clients_with_backups]
    
    # Recent failures
    recent_failures = await db.backup_logs.find(
        {"status": "failed"}, {"_id": 0}
    ).sort("backup_date", -1).to_list(10)
    for f in recent_failures:
        client = await db.clients.find_one({"id": f["client_id"]}, {"_id": 0, "name": 1})
        f["client_name"] = client["name"] if client else "Unknown"
    
    return {
        "current_month": current_month,
        "total_this_month": total_this_month,
        "successful": successful,
        "failed": failed,
        "partial": partial,
        "success_rate": round((successful / total_this_month * 100), 1) if total_this_month > 0 else 0,
        "total_storage_gb": round(total_storage, 2),
        "clients_without_backups": clients_without_backups[:20],
        "recent_failures": recent_failures[:5]
    }


# ==================== ALTARO BACKUP INTEGRATION ====================

@api_router.get("/backups/altaro/status")
async def get_altaro_backup_status(user: dict = Depends(get_current_user)):
    """Fetch live backup status from Altaro/Hornetsecurity API"""
    api_url = os.environ.get("ALTARO_API_URL", "")
    api_key = os.environ.get("ALTARO_API_KEY", "")
    
    if not api_url or not api_key:
        raise HTTPException(status_code=400, detail="Altaro API not configured")
    
    try:
        async with httpx.AsyncClient() as http_client:
            resp = await http_client.get(
                api_url,
                headers={"X-API-KEY": api_key},
                timeout=30.0
            )
            if resp.status_code == 403:
                # Rate limited - return cached data
                cached = await db.altaro_cache.find_one({"type": "latest"}, {"_id": 0})
                if cached:
                    cached["from_cache"] = True
                    return cached
                raise HTTPException(status_code=429, detail="Altaro API rate limited (max 1 request per 5 min). No cached data available.")
            
            if resp.status_code != 200:
                raise HTTPException(status_code=resp.status_code, detail=f"Altaro API error: {resp.status_code}")
            
            raw_data = resp.json()
            
            # Parse the Altaro response into a clean format
            customers = []
            total_vms = 0
            total_success = 0
            total_failed = 0
            total_unknown = 0
            total_size_bytes = 0
            failed_vms = []
            
            for customer in raw_data:
                customer_name = customer.get("customerName", "Unknown")
                customer_vms = []
                
                for installation in customer.get("installationStatusReports", []):
                    for host in installation.get("hostStatusReports", []):
                        host_name = host.get("name", "")
                        host_type = host.get("hostTypeName", "")
                        
                        for vm in host.get("virtualMachinesStatus", []):
                            total_vms += 1
                            result = vm.get("lastOnsiteBackupResult", 0)
                            result_name = vm.get("lastOnsiteBackupResultName", "Unknown")
                            size_bytes = vm.get("lastOnsiteBackupProcessedTransferSize", 0) or 0
                            total_size_bytes += size_bytes
                            
                            if result == 1:
                                total_success += 1
                                status = "success"
                            elif result == 2:
                                total_failed += 1
                                status = "failed"
                            else:
                                total_unknown += 1
                                status = "unknown"
                            
                            vm_info = {
                                "name": vm.get("name", ""),
                                "status": status,
                                "result_name": result_name,
                                "last_backup_time": vm.get("lastOnsiteBackupTime"),
                                "duration_seconds": vm.get("lastOnsiteBackupDuration", 0),
                                "size_bytes": size_bytes,
                                "size_gb": round(size_bytes / (1024**3), 2) if size_bytes > 0 else 0,
                                "offsite_status": vm.get("lastOffsiteCopyResultName", "Unknown"),
                                "offsite_time": vm.get("lastOffsiteCopyTime"),
                                "cdp_enabled": vm.get("cdpEnabled", False),
                                "host": host_name,
                                "host_type": host_type,
                            }
                            customer_vms.append(vm_info)
                            
                            if status == "failed":
                                failed_vms.append({
                                    "customer": customer_name,
                                    "vm": vm.get("name", ""),
                                    "last_backup": vm.get("lastOnsiteBackupTime"),
                                    "host": host_name,
                                })
                
                if customer_vms:
                    customer_success = len([v for v in customer_vms if v["status"] == "success"])
                    customer_failed = len([v for v in customer_vms if v["status"] == "failed"])
                    customer_total_size = sum(v["size_bytes"] for v in customer_vms)
                    
                    customers.append({
                        "name": customer_name,
                        "vms": customer_vms,
                        "total_vms": len(customer_vms),
                        "successful": customer_success,
                        "failed": customer_failed,
                        "unknown": len(customer_vms) - customer_success - customer_failed,
                        "total_size_gb": round(customer_total_size / (1024**3), 2) if customer_total_size > 0 else 0,
                        "status": "failed" if customer_failed > 0 else ("success" if customer_success > 0 else "unknown"),
                    })
            
            result = {
                "customers": customers,
                "summary": {
                    "total_customers": len(customers),
                    "total_vms": total_vms,
                    "successful": total_success,
                    "failed": total_failed,
                    "unknown": total_unknown,
                    "total_size_gb": round(total_size_bytes / (1024**3), 2),
                    "success_rate": round((total_success / total_vms * 100), 1) if total_vms > 0 else 0,
                },
                "failed_vms": failed_vms,
                "fetched_at": datetime.now(timezone.utc).isoformat(),
                "from_cache": False,
            }
            
            # Cache the result
            await db.altaro_cache.update_one(
                {"type": "latest"},
                {"$set": {**result, "type": "latest"}},
                upsert=True
            )
            
            return result
    except httpx.RequestError as e:
        # Try cached data on network error
        cached = await db.altaro_cache.find_one({"type": "latest"}, {"_id": 0})
        if cached:
            cached["from_cache"] = True
            return cached
        raise HTTPException(status_code=500, detail=f"Altaro API connection error: {str(e)}")


# ==================== AHSAY CBS BACKUP INTEGRATION ====================

@api_router.get("/backups/ahsay/status")
async def get_ahsay_backup_status(user: dict = Depends(get_current_user)):
    """Fetch live backup user status from AhsayCBS API"""
    cbs_url = os.environ.get("AHSAY_CBS_URL", "").rstrip("/")
    sys_user = os.environ.get("AHSAY_SYS_USER", "")
    sys_pwd = os.environ.get("AHSAY_SYS_PWD", "")

    if not cbs_url or not sys_user or not sys_pwd:
        raise HTTPException(status_code=400, detail="AhsayCBS API not configured")

    try:
        async with httpx.AsyncClient(verify=False) as http_client:
            resp = await http_client.post(
                f"{cbs_url}/obs/api/json/2/ListUsers.do",
                json={"SysUser": sys_user, "SysPwd": sys_pwd},
                headers={"Content-Type": "application/json"},
                timeout=30.0,
            )

            if resp.status_code != 200:
                cached = await db.ahsay_cache.find_one({"type": "latest"}, {"_id": 0})
                if cached:
                    cached["from_cache"] = True
                    return cached
                raise HTTPException(status_code=resp.status_code, detail=f"AhsayCBS API error: {resp.status_code}")

            data = resp.json()
            if data.get("Status") != "OK":
                raise HTTPException(status_code=500, detail=data.get("Message", "AhsayCBS API error"))

            users_raw = data.get("User", [])
            now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
            users = []
            total_data_bytes = 0
            total_quota_bytes = 0
            stale_users = []
            active_count = 0

            for u in users_raw:
                login = u.get("LoginName", "")
                alias = u.get("Alias", "") or login
                status = u.get("Status", "UNKNOWN")
                client_type = u.get("ClientType", "")
                data_size = u.get("DataSize", 0) or 0
                last_backup_ms = u.get("LastBackupDate", 0) or 0
                online = u.get("Online", False)
                total_data_bytes += data_size

                # Get quota from DestinationQuotaList or Quota field
                quota = 0
                dq_list = u.get("DestinationQuotaList") or u.get("QuotaList") or []
                for dq in dq_list:
                    if dq.get("Enabled"):
                        quota = dq.get("Quota", 0) or 0
                        break
                if quota == 0:
                    quota = u.get("Quota", 0) or 0
                total_quota_bytes += quota

                # Calculate last backup age
                if last_backup_ms > 0:
                    age_hours = (now_ms - last_backup_ms) / (1000 * 60 * 60)
                    last_backup_iso = datetime.fromtimestamp(last_backup_ms / 1000, tz=timezone.utc).isoformat()
                else:
                    age_hours = -1
                    last_backup_iso = None

                # Determine backup health
                if age_hours < 0:
                    backup_status = "never"
                elif age_hours <= 26:
                    backup_status = "success"
                    active_count += 1
                elif age_hours <= 72:
                    backup_status = "warning"
                    active_count += 1
                else:
                    backup_status = "stale"

                user_info = {
                    "login_name": login,
                    "alias": alias,
                    "status": status,
                    "client_type": client_type,
                    "data_size_bytes": data_size,
                    "data_size_gb": round(data_size / (1024**3), 2) if data_size > 0 else 0,
                    "quota_bytes": quota,
                    "quota_gb": round(quota / (1024**3), 2) if quota > 0 else 0,
                    "quota_used_pct": round((data_size / quota * 100), 1) if quota > 0 else 0,
                    "last_backup": last_backup_iso,
                    "last_backup_age_hours": round(age_hours, 1) if age_hours >= 0 else None,
                    "backup_status": backup_status,
                    "online": online,
                }
                users.append(user_info)

                if backup_status == "stale":
                    stale_users.append({
                        "login_name": login,
                        "alias": alias,
                        "last_backup": last_backup_iso,
                        "age_hours": round(age_hours, 1),
                    })

            # Sort: stale first, then warning, then success, then never
            status_order = {"stale": 0, "warning": 1, "never": 2, "success": 3}
            users.sort(key=lambda x: status_order.get(x["backup_status"], 4))

            success_count = len([u for u in users if u["backup_status"] == "success"])
            warning_count = len([u for u in users if u["backup_status"] == "warning"])
            stale_count = len([u for u in users if u["backup_status"] == "stale"])
            never_count = len([u for u in users if u["backup_status"] == "never"])

            result = {
                "users": users,
                "summary": {
                    "total_users": len(users),
                    "active": active_count,
                    "successful": success_count,
                    "warning": warning_count,
                    "stale": stale_count,
                    "never": never_count,
                    "total_data_gb": round(total_data_bytes / (1024**3), 2),
                    "total_quota_gb": round(total_quota_bytes / (1024**3), 2),
                    "health_rate": round((success_count / len(users) * 100), 1) if len(users) > 0 else 0,
                },
                "stale_users": stale_users,
                "fetched_at": datetime.now(timezone.utc).isoformat(),
                "from_cache": False,
            }

            # Cache the result
            await db.ahsay_cache.update_one(
                {"type": "latest"},
                {"$set": {**result, "type": "latest"}},
                upsert=True,
            )

            return result

    except httpx.RequestError as e:
        cached = await db.ahsay_cache.find_one({"type": "latest"}, {"_id": 0})
        if cached:
            cached["from_cache"] = True
            return cached
        raise HTTPException(status_code=500, detail=f"AhsayCBS API connection error: {str(e)}")


# ==================== BITDEFENDER GRAVITYZONE INTEGRATION ====================

async def bitdefender_api_call(method: str, endpoint: str, params: dict = None):
    """Make a JSON-RPC call to Bitdefender GravityZone API"""
    api_url = os.environ.get("BITDEFENDER_API_URL", "").rstrip("/")
    api_key = os.environ.get("BITDEFENDER_API_KEY", "")
    
    if not api_url or not api_key:
        return None
    
    auth = base64.b64encode(f"{api_key}:".encode()).decode()
    
    payload = {
        "jsonrpc": "2.0",
        "method": method,
        "params": params or {},
        "id": str(uuid.uuid4())
    }
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{api_url}/v1.0/jsonrpc/{endpoint}",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Basic {auth}"
                },
                json=payload
            )
            if response.status_code == 200:
                data = response.json()
                if "result" in data:
                    return data["result"]
                elif "error" in data:
                    logging.error(f"Bitdefender API error: {data['error']}")
                    return None
            return None
    except Exception as e:
        logging.error(f"Bitdefender API call failed: {str(e)}")
        return None

@api_router.get("/bitdefender/test")
async def test_bitdefender_connection(user: dict = Depends(get_current_user)):
    """Test Bitdefender GravityZone API connection"""
    api_url = os.environ.get("BITDEFENDER_API_URL", "")
    api_key = os.environ.get("BITDEFENDER_API_KEY", "")
    
    if not api_url or not api_key:
        return {"status": "not_configured", "message": "Bitdefender not configured"}
    
    # Test with reports endpoint (usually available)
    result = await bitdefender_api_call("getReportsList", "reports", {})
    
    if result is not None:
        return {"status": "connected", "message": "Successfully connected to Bitdefender GravityZone"}
    else:
        return {"status": "error", "message": "Failed to connect to Bitdefender API"}

@api_router.get("/bitdefender/status")
async def get_bitdefender_status(user: dict = Depends(get_current_user)):
    """Get Bitdefender connection status"""
    api_url = os.environ.get("BITDEFENDER_API_URL", "")
    api_key = os.environ.get("BITDEFENDER_API_KEY", "")
    
    if not api_url or not api_key:
        return {"configured": False}
    
    result = await bitdefender_api_call("getReportsList", "reports", {})
    return {
        "configured": True,
        "connected": result is not None,
        "url": "https://cloudgz.gravityzone.bitdefender.com"
    }

@api_router.get("/bitdefender/incidents")
async def get_bitdefender_incidents(
    page: int = 1,
    per_page: int = 50,
    user: dict = Depends(get_current_user)
):
    """Get security incidents from Bitdefender"""
    # Try to get incidents - requires Network permission on API key
    result = await bitdefender_api_call("getIncidentsList", "incidents", {
        "page": page,
        "perPage": per_page
    })
    
    if result:
        return {
            "total": result.get("total", 0),
            "items": result.get("items", [])
        }
    
    # Fallback: return cached/stored incidents
    incidents = await db.bitdefender_incidents.find({}, {"_id": 0}).sort("created_at", -1).limit(per_page).to_list(per_page)
    return {"total": len(incidents), "items": incidents, "cached": True}

@api_router.get("/bitdefender/quarantine")
async def get_bitdefender_quarantine(
    page: int = 1,
    per_page: int = 50,
    user: dict = Depends(get_current_user)
):
    """Get quarantined items from Bitdefender"""
    result = await bitdefender_api_call("getQuarantineItemsList", "quarantine", {
        "page": page,
        "perPage": per_page
    })
    
    if result:
        return {
            "total": result.get("total", 0),
            "items": result.get("items", [])
        }
    return {"total": 0, "items": []}

@api_router.get("/bitdefender/alerts")
async def get_bitdefender_alerts(user: dict = Depends(get_current_user)):
    """Get recent security alerts for dashboard/NOC display"""
    alerts = []
    
    # Try quarantine API - this works reliably
    quarantine = await bitdefender_api_call("getQuarantineItemsList", "quarantine", {
        "page": 1,
        "perPage": 50
    })
    if quarantine and quarantine.get("items"):
        for item in quarantine["items"]:
            alerts.append({
                "id": item.get("quarantineItemId"),
                "type": "malware",
                "severity": "high",
                "title": f"Malware: {item.get('threatName', 'Unknown Threat')}",
                "description": item.get("filePath", ""),
                "endpoint": item.get("endpointName", "Unknown"),
                "created_at": item.get("quarantinedOn"),
                "source": "bitdefender"
            })
    
    # Get network inventory to count endpoints
    total_endpoints = 0
    company_list = []
    
    # Get network inventory root
    network = await bitdefender_api_call("getNetworkInventoryItems", "network", {
        "page": 1,
        "perPage": 100
    })
    
    if network and network.get("items"):
        # Find the "Companies" folder and get company list
        for item in network["items"]:
            if item.get("name") == "Companies" and item.get("type") == 2:
                # Get all companies in this folder (paginated)
                page = 1
                while True:
                    companies_result = await bitdefender_api_call("getNetworkInventoryItems", "network", {
                        "parentId": item.get("id"),
                        "page": page,
                        "perPage": 100
                    })
                    
                    if not companies_result or not companies_result.get("items"):
                        break
                    
                    for company in companies_result["items"]:
                        # Type 1 in this context = Company (MSP customer)
                        details = company.get("details", {})
                        license_info = details.get("licenseInfo", {})
                        used_slots = license_info.get("usedSlots", 0) or 0
                        
                        company_list.append({
                            "id": company.get("id"),
                            "name": company.get("name"),
                            "endpoints": used_slots,
                            "is_suspended": details.get("isSuspended", False)
                        })
                        total_endpoints += used_slots
                    
                    # Check if there are more pages
                    if page >= companies_result.get("pagesCount", 1):
                        break
                    page += 1
                break
    
    # Sort companies by endpoint count (descending)
    company_list.sort(key=lambda x: x.get("endpoints", 0), reverse=True)
    
    # Sort alerts by date, newest first
    alerts.sort(key=lambda x: x.get("created_at", "") or "", reverse=True)
    
    return {
        "total": len(alerts),
        "alerts": alerts[:20],
        "has_critical": any(a.get("severity") == "critical" for a in alerts),
        "has_high": any(a.get("severity") == "high" for a in alerts),
        "endpoint_count": total_endpoints,
        "company_count": len(company_list),
        "companies": company_list[:10]  # Return top 10 companies by endpoint count
    }

@api_router.get("/bitdefender/endpoints")
async def get_bitdefender_endpoints(
    page: int = 1,
    per_page: int = 50,
    user: dict = Depends(get_current_user)
):
    """Get list of endpoints from Bitdefender"""
    all_endpoints = []
    
    # Get network inventory root
    network = await bitdefender_api_call("getNetworkInventoryItems", "network", {
        "page": 1,
        "perPage": 100
    })
    
    if network and network.get("items"):
        # Recursively get endpoints from network groups
        async def get_endpoints_from_group(parent_id, depth=0):
            if depth > 3:
                return []
            
            endpoints = []
            items = await bitdefender_api_call("getNetworkInventoryItems", "network", {
                "parentId": parent_id,
                "page": 1,
                "perPage": 100
            })
            
            if items and items.get("items"):
                for item in items["items"]:
                    item_type = item.get("type")
                    if item_type == 1:  # Endpoint
                        endpoints.append({
                            "id": item.get("id"),
                            "name": item.get("name"),
                            "ip": item.get("ip"),
                            "machine_type": item.get("machineType"),
                            "os": item.get("operatingSystem"),
                            "is_managed": item.get("isManaged", True),
                            "fqdn": item.get("fqdn"),
                            "label": item.get("label")
                        })
                    elif item_type == 2:  # Group
                        sub_endpoints = await get_endpoints_from_group(item["id"], depth + 1)
                        endpoints.extend(sub_endpoints)
            
            return endpoints
        
        # Search in each root group
        for item in network["items"]:
            if item.get("type") == 2 and item.get("id"):
                found_endpoints = await get_endpoints_from_group(item["id"])
                all_endpoints.extend(found_endpoints)
    
    # Paginate results
    start = (page - 1) * per_page
    end = start + per_page
    paginated = all_endpoints[start:end]
    
    return {
        "total": len(all_endpoints),
        "page": page,
        "per_page": per_page,
        "items": paginated
    }

@api_router.get("/bitdefender/debug")
async def debug_bitdefender(user: dict = Depends(get_current_user)):
    """Debug endpoint to see raw Bitdefender API responses"""
    debug_data = {}
    
    # Test companies API
    companies = await bitdefender_api_call("getCompaniesList", "companies", {})
    debug_data["companies"] = companies
    
    # Test network inventory root
    network = await bitdefender_api_call("getNetworkInventoryItems", "network", {
        "page": 1,
        "perPage": 10
    })
    debug_data["network_inventory_root"] = network
    
    # If we have network items (groups), explore them
    if network and network.get("items"):
        debug_data["network_subgroups"] = {}
        for item in network.get("items", []):
            group_id = item.get("id")
            group_name = item.get("name")
            if group_id and item.get("type") == 2:  # Type 2 = Group
                sub_items = await bitdefender_api_call("getNetworkInventoryItems", "network", {
                    "parentId": group_id,
                    "page": 1,
                    "perPage": 20
                })
                debug_data["network_subgroups"][group_name] = sub_items
    
    return debug_data

@api_router.get("/sync/status")
async def get_sync_status(user: dict = Depends(get_current_user)):
    """Get sync status and recent sync logs"""
    sync_interval = int(os.environ.get("SYNC_INTERVAL_MINUTES", "15"))
    
    # Get recent sync logs
    trmm_logs = await db.sync_logs.find({"sync_type": "trmm"}, {"_id": 0}).sort("created_at", -1).to_list(5)
    
    # Get next scheduled run times
    trmm_job = scheduler.get_job("trmm_sync")
    
    return {
        "sync_interval_minutes": sync_interval,
        "trmm": {
            "configured": bool(os.environ.get("TACTICAL_RMM_API_KEY")),
            "next_run": trmm_job.next_run_time.isoformat() if trmm_job and trmm_job.next_run_time else None,
            "recent_logs": trmm_logs
        }
    }

@api_router.post("/sync/trigger/{sync_type}")
async def trigger_manual_sync(sync_type: str, user: dict = Depends(get_current_user)):
    """Manually trigger a sync"""
    if sync_type == "trmm":
        asyncio.create_task(scheduled_trmm_sync())
        return {"message": "TRMM sync triggered"}
    else:
        raise HTTPException(status_code=400, detail="Invalid sync type. Use 'trmm'")


# ==================== INFRASTRUCTURE MONITORING ====================

@api_router.get("/infrastructure/devices")
async def list_infrastructure_devices(user: dict = Depends(get_current_user)):
    """List all infrastructure devices"""
    devices = await db.infrastructure_devices.find({}, {"_id": 0}).sort("name", 1).to_list(500)
    return [InfraDeviceResponse(
        id=d["id"],
        name=d["name"],
        device_type=d["device_type"],
        ip_address=d["ip_address"],
        port=d.get("port"),
        location=d.get("location"),
        description=d.get("description"),
        status=d.get("status", "unknown"),
        last_check=datetime.fromisoformat(d["last_check"]) if d.get("last_check") else None,
        last_seen=datetime.fromisoformat(d["last_seen"]) if d.get("last_seen") else None,
        response_time_ms=d.get("response_time_ms"),
        check_interval=d.get("check_interval", 60),
        is_active=d.get("is_active", True),
        created_at=datetime.fromisoformat(d["created_at"]),
        extra_data=d.get("extra_data")
    ) for d in devices]

@api_router.post("/infrastructure/devices")
async def create_infrastructure_device(device: InfraDeviceCreate, user: dict = Depends(get_current_user)):
    """Add a new infrastructure device to monitor"""
    device_data = {
        "id": str(uuid.uuid4()),
        "name": device.name,
        "device_type": device.device_type,
        "ip_address": device.ip_address,
        "port": device.port or (8006 if device.device_type == "proxmox" else 161 if device.device_type == "snmp" else None),
        "location": device.location,
        "description": device.description,
        "check_interval": device.check_interval,
        "is_active": device.is_active,
        "status": "unknown",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user["id"]
    }
    
    # Store credentials securely (encrypted)
    if device.device_type == "proxmox":
        device_data["api_token_id"] = encrypt_field(device.api_token_id) if device.api_token_id else None
        device_data["api_token_secret"] = encrypt_field(device.api_token_secret) if device.api_token_secret else None
    elif device.device_type == "snmp":
        device_data["snmp_community"] = encrypt_field(device.snmp_community) if device.snmp_community else None
        device_data["snmp_version"] = device.snmp_version
    
    await db.infrastructure_devices.insert_one(device_data)
    
    return {"message": "Device added", "id": device_data["id"]}

@api_router.get("/infrastructure/devices/{device_id}")
async def get_infrastructure_device(device_id: str, user: dict = Depends(get_current_user)):
    """Get a specific infrastructure device"""
    device = await db.infrastructure_devices.find_one({"id": device_id}, {"_id": 0})
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device

@api_router.put("/infrastructure/devices/{device_id}")
async def update_infrastructure_device(device_id: str, device: InfraDeviceCreate, user: dict = Depends(get_current_user)):
    """Update an infrastructure device"""
    existing = await db.infrastructure_devices.find_one({"id": device_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Device not found")
    
    update_data = {
        "name": device.name,
        "device_type": device.device_type,
        "ip_address": device.ip_address,
        "port": device.port,
        "location": device.location,
        "description": device.description,
        "check_interval": device.check_interval,
        "is_active": device.is_active,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    if device.device_type == "proxmox" and device.api_token_secret:
        update_data["api_token_id"] = encrypt_field(device.api_token_id) if device.api_token_id else None
        update_data["api_token_secret"] = encrypt_field(device.api_token_secret) if device.api_token_secret else None
    elif device.device_type == "snmp" and device.snmp_community:
        update_data["snmp_community"] = encrypt_field(device.snmp_community)
        update_data["snmp_version"] = device.snmp_version
    
    await db.infrastructure_devices.update_one({"id": device_id}, {"$set": update_data})
    return {"message": "Device updated"}

@api_router.delete("/infrastructure/devices/{device_id}")
async def delete_infrastructure_device(device_id: str, user: dict = Depends(get_current_user)):
    """Delete an infrastructure device"""
    result = await db.infrastructure_devices.delete_one({"id": device_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Device not found")
    return {"message": "Device deleted"}

@api_router.post("/infrastructure/devices/{device_id}/check")
async def check_infrastructure_device(device_id: str, user: dict = Depends(get_current_user)):
    """Manually trigger a check for a device"""
    device = await db.infrastructure_devices.find_one({"id": device_id}, {"_id": 0})
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    result = await check_device_status(device)
    return result

async def check_device_status(device: dict) -> dict:
    """Check the status of an infrastructure device"""
    import subprocess
    import time
    
    device_type = device.get("device_type")
    ip_address = device.get("ip_address")
    port = device.get("port")
    
    result = {
        "device_id": device["id"],
        "status": "offline",
        "response_time_ms": None,
        "extra_data": {}
    }
    
    try:
        if device_type == "ping":
            # Simple ping check
            start = time.time()
            proc = subprocess.run(
                ["ping", "-c", "1", "-W", "3", ip_address],
                capture_output=True, timeout=5
            )
            elapsed = int((time.time() - start) * 1000)
            
            if proc.returncode == 0:
                result["status"] = "online"
                result["response_time_ms"] = elapsed
        
        elif device_type == "proxmox":
            # Proxmox API check
            token_id = decrypt_field(device.get("api_token_id")) if device.get("api_token_id") else None
            token_secret = decrypt_field(device.get("api_token_secret")) if device.get("api_token_secret") else None
            
            if token_id and token_secret:
                start = time.time()
                async with httpx.AsyncClient(verify=False, timeout=30.0) as client:
                    base_url = f"https://{ip_address}:{port or 8006}/api2/json"
                    headers = {"Authorization": f"PVEAPIToken={token_id}={token_secret}"}
                    
                    logger.info(f"Proxmox check for {ip_address} - Token ID: {token_id[:20]}...")
                    
                    # Get version
                    resp = await client.get(f"{base_url}/version", headers=headers)
                    elapsed = int((time.time() - start) * 1000)
                    
                    if resp.status_code == 200:
                        result["status"] = "online"
                        result["response_time_ms"] = elapsed
                        result["extra_data"]["version"] = resp.json().get("data", {})
                        result["extra_data"]["errors"] = []
                        
                        # Get nodes info
                        nodes_resp = await client.get(f"{base_url}/nodes", headers=headers)
                        logger.info(f"Proxmox nodes response: {nodes_resp.status_code}")
                        
                        if nodes_resp.status_code == 200:
                            nodes_data = nodes_resp.json().get("data", [])
                            logger.info(f"Proxmox found {len(nodes_data)} nodes")
                            result["extra_data"]["nodes"] = []
                            
                            for node in nodes_data:
                                node_name = node.get("node")
                                logger.info(f"Processing node: {node_name}, raw data: {node}")
                                
                                node_info = {
                                    "name": node_name,
                                    "status": node.get("status"),
                                    "cpu": round(node.get("cpu", 0) * 100, 1),
                                    "maxcpu": node.get("maxcpu", 0),
                                    "mem": node.get("mem", 0),
                                    "maxmem": node.get("maxmem", 0),
                                    "mem_percent": round((node.get("mem", 0) / node.get("maxmem", 1)) * 100, 1) if node.get("maxmem") else 0,
                                    "disk": node.get("disk", 0),
                                    "maxdisk": node.get("maxdisk", 0),
                                    "uptime": node.get("uptime", 0),
                                    "vms": [],
                                    "containers": []
                                }
                                
                                # Get detailed node status for more accurate resource info
                                try:
                                    node_status_resp = await client.get(f"{base_url}/nodes/{node_name}/status", headers=headers)
                                    if node_status_resp.status_code == 200:
                                        node_status = node_status_resp.json().get("data", {})
                                        logger.info(f"Node {node_name} status: CPU={node_status.get('cpu')}, mem={node_status.get('memory', {})}")
                                        # Update with more detailed info
                                        if node_status.get("cpu"):
                                            node_info["cpu"] = round(node_status.get("cpu", 0) * 100, 1)
                                        if node_status.get("cpuinfo"):
                                            node_info["maxcpu"] = node_status.get("cpuinfo", {}).get("cpus", node_info["maxcpu"])
                                        if node_status.get("memory"):
                                            mem_info = node_status.get("memory", {})
                                            node_info["mem"] = mem_info.get("used", node_info["mem"])
                                            node_info["maxmem"] = mem_info.get("total", node_info["maxmem"])
                                            if node_info["maxmem"]:
                                                node_info["mem_percent"] = round((node_info["mem"] / node_info["maxmem"]) * 100, 1)
                                        if node_status.get("rootfs"):
                                            rootfs = node_status.get("rootfs", {})
                                            node_info["disk"] = rootfs.get("used", node_info["disk"])
                                            node_info["maxdisk"] = rootfs.get("total", node_info["maxdisk"])
                                        if node_status.get("uptime"):
                                            node_info["uptime"] = node_status.get("uptime")
                                    else:
                                        logger.warning(f"Node status failed: {node_status_resp.status_code} - {node_status_resp.text}")
                                except Exception as e:
                                    logger.error(f"Error getting node status for {node_name}: {e}")
                                
                                # Get VMs for this node
                                try:
                                    vms_resp = await client.get(f"{base_url}/nodes/{node_name}/qemu", headers=headers)
                                    logger.info(f"VMs response for {node_name}: {vms_resp.status_code}")
                                    if vms_resp.status_code == 200:
                                        vms = vms_resp.json().get("data", [])
                                        logger.info(f"Found {len(vms)} VMs on {node_name}")
                                        node_info["vms"] = [{
                                            "vmid": vm.get("vmid"),
                                            "name": vm.get("name"),
                                            "status": vm.get("status"),
                                            "cpu": round(vm.get("cpu", 0) * 100, 1) if vm.get("cpu") else 0,
                                            "mem": vm.get("mem", 0),
                                            "maxmem": vm.get("maxmem", 0),
                                            "uptime": vm.get("uptime", 0)
                                        } for vm in vms]
                                    else:
                                        error_msg = f"VMs API returned {vms_resp.status_code}: {vms_resp.text[:200]}"
                                        logger.warning(error_msg)
                                        result["extra_data"]["errors"].append(error_msg)
                                except Exception as e:
                                    error_msg = f"Error fetching VMs for {node_name}: {str(e)}"
                                    logger.error(error_msg)
                                    result["extra_data"]["errors"].append(error_msg)
                                
                                # Get containers for this node
                                try:
                                    lxc_resp = await client.get(f"{base_url}/nodes/{node_name}/lxc", headers=headers)
                                    logger.info(f"LXC response for {node_name}: {lxc_resp.status_code}")
                                    if lxc_resp.status_code == 200:
                                        containers = lxc_resp.json().get("data", [])
                                        logger.info(f"Found {len(containers)} containers on {node_name}")
                                        node_info["containers"] = [{
                                            "vmid": ct.get("vmid"),
                                            "name": ct.get("name"),
                                            "status": ct.get("status"),
                                            "cpu": round(ct.get("cpu", 0) * 100, 1) if ct.get("cpu") else 0,
                                            "mem": ct.get("mem", 0),
                                            "maxmem": ct.get("maxmem", 0)
                                        } for ct in containers]
                                    else:
                                        error_msg = f"LXC API returned {lxc_resp.status_code}: {lxc_resp.text[:200]}"
                                        logger.warning(error_msg)
                                        result["extra_data"]["errors"].append(error_msg)
                                except Exception as e:
                                    error_msg = f"Error fetching containers for {node_name}: {str(e)}"
                                    logger.error(error_msg)
                                    result["extra_data"]["errors"].append(error_msg)
                                
                                result["extra_data"]["nodes"].append(node_info)
                            
                            # Summary counts
                            total_vms = sum(len(n.get("vms", [])) for n in result["extra_data"]["nodes"])
                            total_cts = sum(len(n.get("containers", [])) for n in result["extra_data"]["nodes"])
                            running_vms = sum(1 for n in result["extra_data"]["nodes"] for vm in n.get("vms", []) if vm.get("status") == "running")
                            running_cts = sum(1 for n in result["extra_data"]["nodes"] for ct in n.get("containers", []) if ct.get("status") == "running")
                            
                            result["extra_data"]["summary"] = {
                                "total_vms": total_vms,
                                "running_vms": running_vms,
                                "total_containers": total_cts,
                                "running_containers": running_cts,
                                "total_nodes": len(nodes_data)
                            }
                            logger.info(f"Proxmox summary: {result['extra_data']['summary']}")
                        else:
                            error_msg = f"Nodes API returned {nodes_resp.status_code}: {nodes_resp.text[:200]}"
                            logger.warning(error_msg)
                            result["extra_data"]["errors"] = [error_msg]
                    else:
                        logger.warning(f"Proxmox version check failed: {resp.status_code} - {resp.text}")
            else:
                # Just ping check if no credentials
                proc = subprocess.run(
                    ["ping", "-c", "1", "-W", "3", ip_address],
                    capture_output=True, timeout=5
                )
                if proc.returncode == 0:
                    result["status"] = "online"
        
        elif device_type == "snmp":
            # For SNMP, we'll do a simple port check for now
            # Full SNMP requires additional libraries
            import socket
            start = time.time()
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.settimeout(3)
            try:
                sock.connect((ip_address, port or 161))
                elapsed = int((time.time() - start) * 1000)
                result["status"] = "online"
                result["response_time_ms"] = elapsed
            except:
                pass
            finally:
                sock.close()
    
    except Exception as e:
        logging.error(f"Device check failed for {ip_address}: {str(e)}")
    
    # Update device status in database
    await db.infrastructure_devices.update_one(
        {"id": device["id"]},
        {"$set": {
            "status": result["status"],
            "response_time_ms": result["response_time_ms"],
            "last_check": datetime.now(timezone.utc).isoformat(),
            "last_seen": datetime.now(timezone.utc).isoformat() if result["status"] == "online" else device.get("last_seen"),
            "extra_data": result["extra_data"] if result["extra_data"] else device.get("extra_data")
        }}
    )
    
    return result

@api_router.get("/infrastructure/status")
async def get_infrastructure_status(user: dict = Depends(get_current_user)):
    """Get summary status of all infrastructure devices"""
    devices = await db.infrastructure_devices.find({"is_active": True}, {"_id": 0}).to_list(500)
    
    total = len(devices)
    online = sum(1 for d in devices if d.get("status") == "online")
    offline = sum(1 for d in devices if d.get("status") == "offline")
    unknown = total - online - offline
    
    by_type = {}
    for d in devices:
        dtype = d.get("device_type", "unknown")
        if dtype not in by_type:
            by_type[dtype] = {"total": 0, "online": 0, "offline": 0}
        by_type[dtype]["total"] += 1
        if d.get("status") == "online":
            by_type[dtype]["online"] += 1
        elif d.get("status") == "offline":
            by_type[dtype]["offline"] += 1
    
    return {
        "total": total,
        "online": online,
        "offline": offline,
        "unknown": unknown,
        "by_type": by_type,
        "devices": devices
    }

@api_router.post("/infrastructure/check-all")
async def check_all_infrastructure(user: dict = Depends(get_current_user)):
    """Trigger checks for all active infrastructure devices"""
    devices = await db.infrastructure_devices.find({"is_active": True}, {"_id": 0}).to_list(500)
    
    results = []
    for device in devices:
        result = await check_device_status(device)
        results.append(result)
    
    online = sum(1 for r in results if r["status"] == "online")
    offline = sum(1 for r in results if r["status"] == "offline")
    
    return {
        "message": f"Checked {len(results)} devices",
        "online": online,
        "offline": offline,
        "results": results
    }

@api_router.get("/infrastructure/devices/{device_id}/debug")
async def debug_infrastructure_device(device_id: str, user: dict = Depends(get_current_user)):
    """Debug endpoint to see raw Proxmox API responses"""
    device = await db.infrastructure_devices.find_one({"id": device_id}, {"_id": 0})
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    if device.get("device_type") != "proxmox":
        raise HTTPException(status_code=400, detail="Debug only available for Proxmox devices")
    
    token_id = decrypt_field(device.get("api_token_id")) if device.get("api_token_id") else None
    token_secret = decrypt_field(device.get("api_token_secret")) if device.get("api_token_secret") else None
    
    if not token_id or not token_secret:
        return {"error": "No API credentials configured"}
    
    ip_address = device.get("ip_address")
    port = device.get("port") or 8006
    
    debug_info = {
        "device_name": device.get("name"),
        "ip_address": ip_address,
        "port": port,
        "token_id": token_id,
        "api_calls": []
    }
    
    try:
        async with httpx.AsyncClient(verify=False, timeout=30.0) as client:
            base_url = f"https://{ip_address}:{port}/api2/json"
            headers = {"Authorization": f"PVEAPIToken={token_id}={token_secret}"}
            
            # Test version endpoint
            try:
                resp = await client.get(f"{base_url}/version", headers=headers)
                debug_info["api_calls"].append({
                    "endpoint": "/version",
                    "status_code": resp.status_code,
                    "response": resp.json() if resp.status_code == 200 else resp.text[:500]
                })
            except Exception as e:
                debug_info["api_calls"].append({
                    "endpoint": "/version",
                    "error": str(e)
                })
            
            # Test nodes endpoint
            try:
                resp = await client.get(f"{base_url}/nodes", headers=headers)
                debug_info["api_calls"].append({
                    "endpoint": "/nodes",
                    "status_code": resp.status_code,
                    "response": resp.json() if resp.status_code == 200 else resp.text[:500]
                })
                
                if resp.status_code == 200:
                    nodes = resp.json().get("data", [])
                    for node in nodes[:1]:  # Test first node only
                        node_name = node.get("node")
                        
                        # Test node status
                        try:
                            status_resp = await client.get(f"{base_url}/nodes/{node_name}/status", headers=headers)
                            debug_info["api_calls"].append({
                                "endpoint": f"/nodes/{node_name}/status",
                                "status_code": status_resp.status_code,
                                "response": status_resp.json() if status_resp.status_code == 200 else status_resp.text[:500]
                            })
                        except Exception as e:
                            debug_info["api_calls"].append({
                                "endpoint": f"/nodes/{node_name}/status",
                                "error": str(e)
                            })
                        
                        # Test VMs endpoint
                        try:
                            vms_resp = await client.get(f"{base_url}/nodes/{node_name}/qemu", headers=headers)
                            debug_info["api_calls"].append({
                                "endpoint": f"/nodes/{node_name}/qemu",
                                "status_code": vms_resp.status_code,
                                "response": vms_resp.json() if vms_resp.status_code == 200 else vms_resp.text[:500]
                            })
                        except Exception as e:
                            debug_info["api_calls"].append({
                                "endpoint": f"/nodes/{node_name}/qemu",
                                "error": str(e)
                            })
                        
                        # Test LXC endpoint
                        try:
                            lxc_resp = await client.get(f"{base_url}/nodes/{node_name}/lxc", headers=headers)
                            debug_info["api_calls"].append({
                                "endpoint": f"/nodes/{node_name}/lxc",
                                "status_code": lxc_resp.status_code,
                                "response": lxc_resp.json() if lxc_resp.status_code == 200 else lxc_resp.text[:500]
                            })
                        except Exception as e:
                            debug_info["api_calls"].append({
                                "endpoint": f"/nodes/{node_name}/lxc",
                                "error": str(e)
                            })
            except Exception as e:
                debug_info["api_calls"].append({
                    "endpoint": "/nodes",
                    "error": str(e)
                })
    except Exception as e:
        debug_info["connection_error"] = str(e)
    
    return debug_info


# ==================== MESHCENTRAL INTEGRATION ====================

@api_router.get("/config/meshcentral")
async def get_meshcentral_config(user: dict = Depends(get_current_user)):
    """Get MeshCentral configuration for frontend"""
    mesh_url = os.environ.get("MESHCENTRAL_URL", "").rstrip("/")
    return {
        "url": mesh_url,
        "configured": bool(mesh_url)
    }

@api_router.get("/servers/{server_id}/mesh-url")
async def get_server_mesh_url(server_id: str, user: dict = Depends(get_current_user)):
    """Get MeshCentral connection URL for a specific server"""
    server = await db.servers.find_one({"id": server_id}, {"_id": 0})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    mesh_url = os.environ.get("MESHCENTRAL_URL", "").rstrip("/")
    agent_id = server.get("tactical_rmm_agent_id")
    
    if not mesh_url:
        raise HTTPException(status_code=400, detail="MeshCentral not configured")
    
    # The MeshCentral URL - user will navigate to mesh and find the device
    return {
        "mesh_url": mesh_url,
        "hostname": server.get("hostname"),
        "agent_id": agent_id,
        "connection_url": f"{mesh_url}/#nodes"
    }

# ==================== VAULTWARDEN CONFIG ====================

@api_router.get("/config/vaultwarden")
async def get_vaultwarden_config(user: dict = Depends(get_current_user)):
    """Get Vaultwarden configuration for frontend"""
    vault_url = os.environ.get("VAULTWARDEN_URL", "").rstrip("/")
    return {
        "url": vault_url,
        "configured": bool(vault_url)
    }

# ==================== MICROSOFT TEAMS WEBHOOKS ====================

class TeamsWebhookMessage(BaseModel):
    title: str
    message: str
    color: str = "0076D7"  # Default blue
    facts: Optional[List[Dict[str, str]]] = None

async def send_teams_notification(title: str, message: str, color: str = "0076D7", facts: List[Dict[str, str]] = None):
    """Send notification to Microsoft Teams via webhook"""
    webhook_url = os.environ.get("TEAMS_WEBHOOK_URL", "")
    
    if not webhook_url:
        logger.debug("Teams webhook not configured, skipping notification")
        return False
    
    # Build Teams Adaptive Card / Message Card
    card = {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        "themeColor": color,
        "summary": title,
        "sections": [{
            "activityTitle": f"🔔 {title}",
            "activitySubtitle": f"SynthOps Alert - {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
            "text": message,
            "markdown": True
        }]
    }
    
    if facts:
        card["sections"][0]["facts"] = facts
    
    try:
        async with httpx.AsyncClient() as http_client:
            resp = await http_client.post(webhook_url, json=card, timeout=10.0)
            if resp.status_code == 200:
                logger.info(f"Teams notification sent: {title}")
                return True
            else:
                logger.error(f"Teams webhook failed: {resp.status_code} - {resp.text}")
                return False
    except Exception as e:
        logger.error(f"Teams webhook error: {str(e)}")
        return False

@api_router.post("/notifications/teams/test")
async def test_teams_webhook(user: dict = Depends(get_current_user)):
    """Test Teams webhook configuration"""
    webhook_url = os.environ.get("TEAMS_WEBHOOK_URL", "")
    
    if not webhook_url:
        raise HTTPException(status_code=400, detail="Teams webhook URL not configured")
    
    success = await send_teams_notification(
        title="SynthOps Test Notification",
        message="This is a test notification from SynthOps. If you can see this, Teams webhooks are working correctly!",
        color="00FF00",
        facts=[
            {"name": "Environment", "value": "Production"},
            {"name": "Test Time", "value": datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}
        ]
    )
    
    if success:
        return {"message": "Test notification sent successfully"}
    else:
        raise HTTPException(status_code=500, detail="Failed to send test notification")

@api_router.get("/notifications/config")
async def get_notification_config(user: dict = Depends(get_current_user)):
    """Get notification configuration status"""
    return {
        "teams": {
            "configured": bool(os.environ.get("TEAMS_WEBHOOK_URL")),
            "webhook_set": bool(os.environ.get("TEAMS_WEBHOOK_URL"))
        },
        "email": {
            "configured": bool(os.environ.get("SENDGRID_API_KEY")),
            "from_email": os.environ.get("SENDGRID_FROM_EMAIL", "")
        }
    }

@api_router.post("/notifications/server-offline")
async def notify_server_offline(server_id: str = Body(..., embed=True), user: dict = Depends(get_current_user)):
    """Manually trigger offline notification for a server"""
    server = await db.servers.find_one({"id": server_id}, {"_id": 0})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    # Get client info
    site = await db.sites.find_one({"id": server.get("site_id")}, {"client_id": 1})
    client = None
    if site:
        client = await db.clients.find_one({"id": site.get("client_id")}, {"name": 1})
    
    success = await send_teams_notification(
        title="🚨 Server Offline Alert",
        message=f"Server **{server.get('hostname')}** is currently offline and requires attention.",
        color="FF0000",
        facts=[
            {"name": "Server", "value": server.get("hostname", "Unknown")},
            {"name": "Client", "value": client.get("name") if client else "Unknown"},
            {"name": "IP Address", "value": server.get("ip_address", "Unknown")},
            {"name": "Last Status", "value": server.get("status", "Unknown")},
            {"name": "Detected", "value": datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}
        ]
    )
    
    # Log the notification
    await db.notification_log.insert_one({
        "id": str(uuid.uuid4()),
        "type": "server_offline",
        "entity_type": "server",
        "entity_id": server_id,
        "title": f"Server Offline: {server.get('hostname')}",
        "sent_teams": success,
        "sent_email": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {"message": "Notification sent" if success else "Notification failed (check configuration)", "success": success}

# ==================== AUDIT LOGGING ====================

@api_router.get("/audit-log")
async def get_audit_log(
    entity_type: Optional[str] = None,
    action: Optional[str] = None,
    limit: int = 100,
    user: dict = Depends(require_admin)
):
    """Get audit log entries (admin only)"""
    query = {}
    if entity_type:
        query["entity_type"] = entity_type
    if action:
        query["action"] = action
    
    logs = await db.audit_log.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return logs

async def log_audit_event(
    user_id: str,
    action: str,
    entity_type: str,
    entity_id: str,
    details: str = None,
    ip_address: str = None
):
    """Log an audit event"""
    try:
        await db.audit_log.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "action": action,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "details": details,
            "ip_address": ip_address,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    except Exception as e:
        logger.error(f"Failed to log audit event: {str(e)}")

@api_router.get("/activity-log")
async def get_activity_log(
    entity_type: Optional[str] = None,
    limit: int = 50,
    user: dict = Depends(get_current_user)
):
    """Get activity log entries"""
    query = {}
    if entity_type:
        query["entity_type"] = entity_type
    
    logs = await db.activity_log.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return logs


# Include the router - moved to end of file after all routes defined
# app.include_router(api_router)

# Add security middlewares
app.add_middleware(RateLimitMiddleware)
app.add_middleware(SecurityHeadersMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== SCHEDULED SYNC ====================

scheduler = AsyncIOScheduler()

async def scheduled_trmm_sync():
    """Background task to sync TRMM data"""
    api_url = os.environ.get("TACTICAL_RMM_API_URL", "").rstrip("/")
    api_key = os.environ.get("TACTICAL_RMM_API_KEY", "")
    
    if not api_url or not api_key:
        return
    
    logger.info("Starting scheduled TRMM sync...")
    headers = {"X-API-KEY": api_key, "Content-Type": "application/json"}
    stats = {"clients_synced": 0, "sites_synced": 0, "agents_synced": 0, "status_changes": 0}
    
    try:
        async with httpx.AsyncClient() as http_client:
            # Fetch clients with embedded sites
            clients_resp = await http_client.get(f"{api_url}/clients/", headers=headers, timeout=30.0)
            if clients_resp.status_code != 200:
                logger.error("Failed to fetch clients from TRMM")
                return
            
            trmm_clients = clients_resp.json()
            
            # Get or create system user for automated tasks
            system_user = await db.users.find_one({"username": "system"})
            if not system_user:
                system_user = {"id": "system", "username": "system"}
            
            for trmm_client in trmm_clients:
                client_trmm_id = trmm_client.get("id")
                client_name = trmm_client.get("name", "Unknown")
                
                existing = await db.clients.find_one({"tactical_rmm_client_id": client_trmm_id})
                if existing:
                    await db.clients.update_one(
                        {"tactical_rmm_client_id": client_trmm_id},
                        {"$set": {"name": client_name, "updated_at": datetime.now(timezone.utc).isoformat()}}
                    )
                    local_client_id = existing["id"]
                else:
                    code = client_name[:10].upper().replace(" ", "")
                    existing_code = await db.clients.find_one({"code": code})
                    if existing_code:
                        code = f"{code}{client_trmm_id}"
                    
                    local_client_id = str(uuid.uuid4())
                    new_client = {
                        "id": local_client_id,
                        "name": client_name,
                        "code": code,
                        "tactical_rmm_client_id": client_trmm_id,
                        "is_active": True,
                        "created_by": system_user["id"],
                        "created_at": datetime.now(timezone.utc).isoformat()
                    }
                    await db.clients.insert_one(new_client)
                stats["clients_synced"] += 1
                
                # Sync sites
                for trmm_site in trmm_client.get("sites", []):
                    site_trmm_id = trmm_site.get("id")
                    site_name = trmm_site.get("name", "Default Site")
                    
                    existing_site = await db.sites.find_one({"tactical_rmm_site_id": site_trmm_id})
                    if not existing_site:
                        new_site = {
                            "id": str(uuid.uuid4()),
                            "client_id": local_client_id,
                            "name": site_name,
                            "tactical_rmm_site_id": site_trmm_id,
                            "is_active": True,
                            "created_at": datetime.now(timezone.utc).isoformat()
                        }
                        await db.sites.insert_one(new_site)
                        stats["sites_synced"] += 1
            
            # Fetch agents and update status
            agents_resp = await http_client.get(f"{api_url}/agents/", headers=headers, timeout=60.0)
            if agents_resp.status_code == 200:
                trmm_agents = agents_resp.json()
                
                for agent in trmm_agents:
                    agent_id = agent.get("agent_id")
                    hostname = agent.get("hostname", "Unknown")
                    new_status = "online" if agent.get("status") == "online" else "offline"
                    
                    existing_server = await db.servers.find_one({"tactical_rmm_agent_id": agent_id})
                    
                    if existing_server:
                        # Track status changes
                        old_status = existing_server.get("status")
                        if old_status != new_status:
                            stats["status_changes"] += 1
                            # Log the status change
                            await db.activity_log.insert_one({
                                "id": str(uuid.uuid4()),
                                "type": "status_change",
                                "entity_type": "server",
                                "entity_id": existing_server["id"],
                                "message": f"Server {hostname} changed from {old_status} to {new_status}",
                                "old_value": old_status,
                                "new_value": new_status,
                                "created_at": datetime.now(timezone.utc).isoformat()
                            })
                            
                            # Send Teams notification if server went offline
                            if new_status == "offline" and old_status == "online":
                                # Get client info for notification
                                site = await db.sites.find_one({"id": existing_server.get("site_id")}, {"client_id": 1})
                                client_name = "Unknown"
                                if site:
                                    client = await db.clients.find_one({"id": site.get("client_id")}, {"name": 1})
                                    client_name = client.get("name") if client else "Unknown"
                                
                                asyncio.create_task(send_teams_notification(
                                    title="🚨 Server Offline Alert",
                                    message=f"Server **{hostname}** has gone offline.",
                                    color="FF0000",
                                    facts=[
                                        {"name": "Server", "value": hostname},
                                        {"name": "Client", "value": client_name},
                                        {"name": "IP Address", "value": existing_server.get("ip_address", "Unknown")},
                                        {"name": "Detected", "value": datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}
                                    ]
                                ))
                        
                        # Update server
                        await db.servers.update_one(
                            {"tactical_rmm_agent_id": agent_id},
                            {"$set": {
                                "status": new_status,
                                "hostname": hostname,
                                "operating_system": agent.get("operating_system"),
                                "updated_at": datetime.now(timezone.utc).isoformat()
                            }}
                        )
                    else:
                        # Find client and site
                        local_client = await db.clients.find_one({"name": agent.get("client_name")})
                        if not local_client:
                            continue
                        
                        local_site = await db.sites.find_one({"client_id": local_client["id"], "name": agent.get("site_name")})
                        if not local_site:
                            local_site = {"id": str(uuid.uuid4()), "client_id": local_client["id"], "name": agent.get("site_name") or "Default", "is_active": True, "created_at": datetime.now(timezone.utc).isoformat()}
                            await db.sites.insert_one(local_site)
                        
                        # Get IP
                        local_ips = agent.get("local_ips", "")
                        ip_address = local_ips[0] if isinstance(local_ips, list) and local_ips else local_ips or None
                        
                        # Create server
                        new_server = {
                            "id": str(uuid.uuid4()),
                            "site_id": local_site["id"],
                            "hostname": hostname,
                            "ip_address": agent.get("public_ip") or ip_address,
                            "operating_system": agent.get("operating_system"),
                            "status": new_status,
                            "server_type": "workstation" if agent.get("monitoring_type") == "workstation" else "server",
                            "tactical_rmm_agent_id": agent_id,
                            "environment": "production",
                            "criticality": "medium",
                            "created_by": system_user["id"],
                            "created_at": datetime.now(timezone.utc).isoformat()
                        }
                        await db.servers.insert_one(new_server)
                    stats["agents_synced"] += 1
            
            # === CLEANUP: Remove servers/clients no longer in TRMM ===
            
            # Collect all TRMM agent IDs from the sync
            trmm_agent_ids = set()
            if agents_resp.status_code == 200:
                for agent in trmm_agents:
                    aid = agent.get("agent_id")
                    if aid:
                        trmm_agent_ids.add(aid)
            
            # Find local servers with TRMM agent IDs that are no longer in TRMM
            if trmm_agent_ids:
                stale_servers = await db.servers.find(
                    {"tactical_rmm_agent_id": {"$exists": True, "$ne": None, "$nin": list(trmm_agent_ids)}},
                    {"_id": 0, "id": 1, "hostname": 1, "site_id": 1, "tactical_rmm_agent_id": 1}
                ).to_list(1000)
                
                if stale_servers:
                    stale_ids = [s["id"] for s in stale_servers]
                    stale_hostnames = [s["hostname"] for s in stale_servers]
                    logger.info(f"Removing {len(stale_servers)} stale TRMM servers: {stale_hostnames}")
                    
                    await db.servers.delete_many({"id": {"$in": stale_ids}})
                    stats["servers_removed"] = len(stale_servers)
            
            # Collect all TRMM client IDs from the sync
            trmm_client_ids = set()
            for tc in trmm_clients:
                cid = tc.get("id")
                if cid:
                    trmm_client_ids.add(cid)
            
            # Mark clients removed from TRMM as inactive
            if trmm_client_ids:
                stale_clients = await db.clients.find(
                    {"tactical_rmm_client_id": {"$exists": True, "$ne": None, "$nin": list(trmm_client_ids)}, "is_active": True},
                    {"_id": 0, "id": 1, "name": 1}
                ).to_list(1000)
                
                if stale_clients:
                    stale_client_ids = [c["id"] for c in stale_clients]
                    stale_client_names = [c["name"] for c in stale_clients]
                    logger.info(f"Deactivating {len(stale_clients)} stale TRMM clients: {stale_client_names}")
                    
                    await db.clients.update_many(
                        {"id": {"$in": stale_client_ids}},
                        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
                    )
                    
                    # Also deactivate their sites
                    await db.sites.update_many(
                        {"client_id": {"$in": stale_client_ids}},
                        {"$set": {"is_active": False}}
                    )
                    stats["clients_deactivated"] = len(stale_clients)
        
        logger.info(f"TRMM sync completed: {stats}")
        
        # Store sync log
        await db.sync_logs.insert_one({
            "id": str(uuid.uuid4()),
            "sync_type": "trmm",
            "stats": stats,
            "status": "success",
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        
    except Exception as e:
        logger.error(f"TRMM sync error: {str(e)}")
        await db.sync_logs.insert_one({
            "id": str(uuid.uuid4()),
            "sync_type": "trmm",
            "error": str(e),
            "status": "error",
            "created_at": datetime.now(timezone.utc).isoformat()
        })


# ==================== SCHEDULED BACKUP SYNC ====================

async def scheduled_backup_sync():
    """Daily sync: fetch Altaro + Ahsay backup data, store individual records + summary"""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    logger.info(f"Starting daily backup sync for {today}...")

    # ---- ALTARO SYNC ----
    altaro_records = []
    altaro_summary = {"provider": "altaro", "date": today, "successful": 0, "failed": 0, "total_vms": 0, "total_size_gb": 0, "customers": 0}
    try:
        altaro_url = os.environ.get("ALTARO_API_URL", "")
        altaro_key = os.environ.get("ALTARO_API_KEY", "")
        if altaro_url and altaro_key:
            async with httpx.AsyncClient(verify=False) as http_client:
                resp = await http_client.get(altaro_url, headers={"accept": "application/json"}, params={"code": altaro_key}, timeout=30.0)
                if resp.status_code == 200:
                    data = resp.json()
                    customers = {}
                    for entry in data if isinstance(data, list) else data.get("data", []):
                        cust = entry.get("CustomerName", "Unknown")
                        vm = entry.get("ComputerName", "Unknown")
                        status = entry.get("LastBackupStatus", "Unknown")
                        size = entry.get("LastBackupSizeInGB", 0) or 0
                        last_session = entry.get("LastBackupSessionDate", "")
                        is_success = status.lower() in ["completed", "success"] if status else False

                        altaro_records.append({
                            "provider": "altaro",
                            "date": today,
                            "customer": cust,
                            "entity_name": vm,
                            "entity_type": "vm",
                            "status": "success" if is_success else "failed",
                            "raw_status": status,
                            "size_gb": round(size, 2),
                            "last_session": last_session,
                            "logged_at": datetime.now(timezone.utc).isoformat(),
                        })
                        customers[cust] = True
                        altaro_summary["total_vms"] += 1
                        altaro_summary["total_size_gb"] += size
                        if is_success:
                            altaro_summary["successful"] += 1
                        else:
                            altaro_summary["failed"] += 1

                    altaro_summary["customers"] = len(customers)
                    altaro_summary["total_size_gb"] = round(altaro_summary["total_size_gb"], 2)
                    altaro_summary["success_rate"] = round((altaro_summary["successful"] / altaro_summary["total_vms"] * 100), 1) if altaro_summary["total_vms"] > 0 else 0
                    logger.info(f"Altaro sync: {altaro_summary['total_vms']} VMs, {altaro_summary['successful']} success, {altaro_summary['failed']} failed")
    except Exception as e:
        logger.error(f"Altaro daily sync error: {e}")
        altaro_summary["error"] = str(e)

    # ---- AHSAY SYNC ----
    ahsay_records = []
    ahsay_summary = {"provider": "ahsay", "date": today, "healthy": 0, "warning": 0, "stale": 0, "never": 0, "total_users": 0, "total_data_gb": 0}
    try:
        cbs_url = os.environ.get("AHSAY_CBS_URL", "").rstrip("/")
        sys_user = os.environ.get("AHSAY_SYS_USER", "")
        sys_pwd = os.environ.get("AHSAY_SYS_PWD", "")
        if cbs_url and sys_user and sys_pwd:
            async with httpx.AsyncClient(verify=False) as http_client:
                resp = await http_client.post(
                    f"{cbs_url}/obs/api/json/2/ListUsers.do",
                    json={"SysUser": sys_user, "SysPwd": sys_pwd},
                    headers={"Content-Type": "application/json"},
                    timeout=30.0,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    if data.get("Status") == "OK":
                        now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
                        for u in data.get("User", []):
                            login = u.get("LoginName", "")
                            alias = u.get("Alias", "") or login
                            data_size = u.get("DataSize", 0) or 0
                            last_backup_ms = u.get("LastBackupDate", 0) or 0

                            if last_backup_ms > 0:
                                age_hours = (now_ms - last_backup_ms) / (1000 * 60 * 60)
                                last_iso = datetime.fromtimestamp(last_backup_ms / 1000, tz=timezone.utc).isoformat()
                            else:
                                age_hours = -1
                                last_iso = None

                            if age_hours < 0:
                                bstatus = "never"
                            elif age_hours <= 26:
                                bstatus = "healthy"
                            elif age_hours <= 72:
                                bstatus = "warning"
                            else:
                                bstatus = "stale"

                            ahsay_records.append({
                                "provider": "ahsay",
                                "date": today,
                                "customer": alias,
                                "entity_name": login,
                                "entity_type": u.get("ClientType", ""),
                                "status": bstatus,
                                "size_gb": round(data_size / (1024**3), 2) if data_size > 0 else 0,
                                "last_session": last_iso,
                                "age_hours": round(age_hours, 1) if age_hours >= 0 else None,
                                "logged_at": datetime.now(timezone.utc).isoformat(),
                            })
                            ahsay_summary["total_users"] += 1
                            ahsay_summary["total_data_gb"] += data_size
                            ahsay_summary[bstatus] = ahsay_summary.get(bstatus, 0) + 1

                        ahsay_summary["total_data_gb"] = round(ahsay_summary["total_data_gb"] / (1024**3), 2)
                        ahsay_summary["health_rate"] = round((ahsay_summary["healthy"] / ahsay_summary["total_users"] * 100), 1) if ahsay_summary["total_users"] > 0 else 0
                        logger.info(f"Ahsay sync: {ahsay_summary['total_users']} users, {ahsay_summary['healthy']} healthy, {ahsay_summary['stale']} stale")
    except Exception as e:
        logger.error(f"Ahsay daily sync error: {e}")
        ahsay_summary["error"] = str(e)

    # ---- STORE RECORDS ----
    all_records = altaro_records + ahsay_records
    if all_records:
        # Remove existing records for today to avoid duplicates on re-run
        await db.backup_daily_records.delete_many({"date": today})
        await db.backup_daily_records.insert_many(all_records)

    # Store summaries
    for summary in [altaro_summary, ahsay_summary]:
        await db.backup_daily_summaries.update_one(
            {"provider": summary["provider"], "date": today},
            {"$set": {**summary, "updated_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True,
        )

    # ---- RETENTION CLEANUP (12 months) ----
    cutoff = (datetime.now(timezone.utc) - timedelta(days=365)).strftime("%Y-%m-%d")
    del_records = await db.backup_daily_records.delete_many({"date": {"$lt": cutoff}})
    del_summaries = await db.backup_daily_summaries.delete_many({"date": {"$lt": cutoff}})
    if del_records.deleted_count or del_summaries.deleted_count:
        logger.info(f"Backup retention cleanup: removed {del_records.deleted_count} records and {del_summaries.deleted_count} summaries older than {cutoff}")

    # Log the sync
    await db.sync_logs.insert_one({
        "id": str(uuid.uuid4()),
        "sync_type": "backup_daily",
        "date": today,
        "altaro_vms": altaro_summary.get("total_vms", 0),
        "ahsay_users": ahsay_summary.get("total_users", 0),
        "status": "success",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    logger.info(f"Daily backup sync complete for {today}")


# ---- Backup History API ----

@api_router.get("/backups/history/summaries")
async def get_backup_history_summaries(days: int = 30, provider: str = None, user: dict = Depends(get_current_user)):
    """Get daily backup summaries for the last N days"""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
    query = {"date": {"$gte": cutoff}}
    if provider:
        query["provider"] = provider
    summaries = await db.backup_daily_summaries.find(query, {"_id": 0}).sort("date", -1).to_list(length=365)
    return {"summaries": summaries, "days": days, "count": len(summaries)}


@api_router.get("/backups/history/records")
async def get_backup_history_records(date: str = None, provider: str = None, status: str = None, user: dict = Depends(get_current_user)):
    """Get individual backup records for a specific date"""
    if not date:
        date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    query = {"date": date}
    if provider:
        query["provider"] = provider
    if status:
        query["status"] = status
    records = await db.backup_daily_records.find(query, {"_id": 0}).to_list(length=500)
    return {"records": records, "date": date, "count": len(records)}


@api_router.post("/backups/history/sync-now")
async def trigger_backup_sync(user: dict = Depends(get_current_user)):
    """Manually trigger a backup sync"""
    if user.get("role") not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Only admins can trigger manual sync")
    asyncio.create_task(scheduled_backup_sync())
    return {"status": "ok", "message": "Backup sync started in background"}


@api_router.get("/backups/history/report")
async def get_backup_compliance_report(months: int = 1, user: dict = Depends(get_current_user)):
    """Generate a monthly backup compliance report"""
    now = datetime.now(timezone.utc)
    start = (now - timedelta(days=months * 30)).strftime("%Y-%m-%d")
    end = now.strftime("%Y-%m-%d")

    summaries = await db.backup_daily_summaries.find(
        {"date": {"$gte": start, "$lte": end}},
        {"_id": 0}
    ).sort("date", 1).to_list(length=1000)

    altaro_days = [s for s in summaries if s.get("provider") == "altaro"]
    ahsay_days = [s for s in summaries if s.get("provider") == "ahsay"]

    def calc_report(days, provider):
        if not days:
            return {"provider": provider, "days_tracked": 0}
        total_success = sum(d.get("successful", d.get("healthy", 0)) for d in days)
        total_fail = sum(d.get("failed", d.get("stale", 0)) for d in days)
        total_entities = total_success + total_fail
        avg_rate = round(sum(d.get("success_rate", d.get("health_rate", 0)) for d in days) / len(days), 1) if days else 0
        return {
            "provider": provider,
            "days_tracked": len(days),
            "total_backups_checked": total_entities,
            "total_successful": total_success,
            "total_failed": total_fail,
            "average_success_rate": avg_rate,
            "best_day": max(days, key=lambda d: d.get("success_rate", d.get("health_rate", 0))).get("date") if days else None,
            "worst_day": min(days, key=lambda d: d.get("success_rate", d.get("health_rate", 0))).get("date") if days else None,
        }

    return {
        "period": {"start": start, "end": end, "months": months},
        "altaro": calc_report(altaro_days, "altaro"),
        "ahsay": calc_report(ahsay_days, "ahsay"),
        "total_days_tracked": len(set(s["date"] for s in summaries)),
    }

# ==================== SUPPORT CONTRACTS ====================
# Product catalogue, client support profiles, change log, monthly snapshots

# --- Pydantic Models ---

class SupportProduct(BaseModel):
    name: str
    category: str  # security, backup, devices, onsite, connectivity, hosting, office365, other
    unit: str = "count"  # count, licences, gb, yes/no
    active: bool = True
    sort_order: int = 0
    unit_cost: Optional[float] = None  # £ per unit per month - for future pricing

class SupportProductResponse(SupportProduct):
    id: str
    created_at: datetime
    updated_at: datetime

class ClientSupportProfile(BaseModel):
    client_id: str
    support_type: Optional[str] = None  # Monthly, PAYG, Support Fund, Hosting
    remarks: Optional[str] = None
    products: Dict[str, Any] = {}  # product_id -> quantity/value

class ClientSupportProfileResponse(ClientSupportProfile):
    id: str
    updated_at: datetime
    updated_by: Optional[str] = None

class SupportChange(BaseModel):
    client_id: str
    product_id: Optional[str] = None
    product_name: Optional[str] = None  # free text if not a catalogue product
    change_description: str
    date: Optional[datetime] = None
    requested_by: Optional[str] = None
    completed_by: Optional[str] = None
    accounts_informed: bool = False
    worksheet_submitted: bool = False
    profile_updated: bool = False

class SupportChangeResponse(SupportChange):
    id: str
    created_at: datetime
    created_by: Optional[str] = None

# --- Support Products (admin-managed catalogue) ---

@api_router.get("/support/products", response_model=List[SupportProductResponse])
async def list_support_products(
    include_inactive: bool = False,
    current_user: dict = Depends(get_current_user)
):
    """List all support products in the catalogue"""
    query = {} if include_inactive else {"active": True}
    products = await db.support_products.find(query, {"_id": 0}).sort("sort_order", 1).to_list(500)
    return products

@api_router.post("/support/products", response_model=SupportProductResponse)
async def create_support_product(
    product: SupportProduct,
    admin: dict = Depends(require_admin)
):
    """Create a new product in the catalogue (admin only)"""
    now = datetime.now(timezone.utc)
    doc = {
        "id": str(uuid.uuid4()),
        **product.dict(),
        "created_at": now,
        "updated_at": now,
    }
    await db.support_products.insert_one(doc)
    return {**doc, "_id": None}

@api_router.put("/support/products/{product_id}", response_model=SupportProductResponse)
async def update_support_product(
    product_id: str,
    product: SupportProduct,
    admin: dict = Depends(require_admin)
):
    """Update a product in the catalogue (admin only)"""
    now = datetime.now(timezone.utc)
    update_data = {**product.dict(), "updated_at": now}
    result = await db.support_products.update_one(
        {"id": product_id}, {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    updated = await db.support_products.find_one({"id": product_id}, {"_id": 0})
    return updated

@api_router.delete("/support/products/{product_id}")
async def delete_support_product(
    product_id: str,
    admin: dict = Depends(require_admin)
):
    """Soft-delete a product (sets active=False to preserve history)"""
    result = await db.support_products.update_one(
        {"id": product_id},
        {"$set": {"active": False, "updated_at": datetime.now(timezone.utc)}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"message": "Product deactivated"}

@api_router.put("/support/products/reorder", response_model=List[SupportProductResponse])
async def reorder_support_products(
    order: List[dict] = Body(...),  # [{"id": "...", "sort_order": 0}, ...]
    admin: dict = Depends(require_admin)
):
    """Bulk update sort order for products (admin only)"""
    for item in order:
        await db.support_products.update_one(
            {"id": item["id"]},
            {"$set": {"sort_order": item["sort_order"], "updated_at": datetime.now(timezone.utc)}}
        )
    products = await db.support_products.find({}, {"_id": 0}).sort("sort_order", 1).to_list(500)
    return products

# --- Client Support Profiles ---

@api_router.get("/support/profile/{client_id}", response_model=ClientSupportProfileResponse)
async def get_client_support_profile(
    client_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get the current support profile for a client"""
    profile = await db.client_support_profiles.find_one({"client_id": client_id}, {"_id": 0})
    if not profile:
        # Return empty profile rather than 404
        return {
            "id": str(uuid.uuid4()),
            "client_id": client_id,
            "support_type": None,
            "remarks": None,
            "products": {},
            "updated_at": datetime.now(timezone.utc),
            "updated_by": None,
        }
    return profile

@api_router.put("/support/profile/{client_id}", response_model=ClientSupportProfileResponse)
async def upsert_client_support_profile(
    client_id: str,
    profile: ClientSupportProfile,
    current_user: dict = Depends(get_current_user)
):
    """Create or update a client's support profile"""
    now = datetime.now(timezone.utc)
    existing = await db.client_support_profiles.find_one({"client_id": client_id})
    
    doc = {
        "client_id": client_id,
        "support_type": profile.support_type,
        "remarks": profile.remarks,
        "products": profile.products,
        "updated_at": now,
        "updated_by": current_user.get("username") or current_user.get("email"),
    }

    if existing:
        # Auto-generate change log entries by diffing old vs new values
        now_str = now
        old_products = existing.get("products", {}) or {}
        new_products = profile.products or {}
        all_product_keys = set(list(old_products.keys()) + list(new_products.keys()))
        auto_changes = []

        for key in all_product_keys:
            old_val = old_products.get(key)
            new_val = new_products.get(key)
            if old_val != new_val:
                if old_val is None:
                    desc = f"Added: {key} = {new_val}"
                elif new_val is None:
                    desc = f"Removed: {key} (was {old_val})"
                else:
                    desc = f"{key}: {old_val} → {new_val}"
                auto_changes.append(desc)

        # Also check support_type change
        old_type = existing.get("support_type")
        new_type = profile.support_type
        if old_type != new_type:
            auto_changes.append(f"Support Type: {old_type or 'None'} → {new_type or 'None'}")

        if auto_changes:
            change_doc = {
                "id": str(uuid.uuid4()),
                "client_id": client_id,
                "product_name": None,
                "change_description": "; ".join(auto_changes),
                "date": now,
                "requested_by": None,
                "completed_by": current_user.get("username") or current_user.get("email"),
                "accounts_informed": False,
                "worksheet_submitted": False,
                "profile_updated": True,  # Profile was just saved so count is in sync
                "auto_logged": True,
                "created_at": now,
                "created_by": current_user.get("username") or current_user.get("email"),
            }
            await db.support_changes.insert_one(change_doc)
            # Clear needs_review since profile and count are now in sync
            await db.client_support_profiles.update_one(
                {"client_id": client_id}, {"$set": {"needs_review": False}}
            )

        # Save a snapshot of the NEW state for the current month
        snapshot_month = now.strftime("%Y-%m")
        # Check month isn't locked before updating snapshot
        lock = await db.support_month_locks.find_one({"month": snapshot_month, "locked": True})
        if not lock:
            await db.client_support_snapshots.update_one(
                {"client_id": client_id, "month": snapshot_month},
                {"$set": {
                    "client_id": client_id,
                    "month": snapshot_month,
                    "support_type": profile.support_type,
                    "remarks": profile.remarks,
                    "products": profile.products or {},
                    "snapshot_date": now,
                    "updated_by": current_user.get("username") or current_user.get("email"),
                }},
                upsert=True
            )
        await db.client_support_profiles.update_one(
            {"client_id": client_id}, {"$set": doc}
        )
    else:
        doc["id"] = str(uuid.uuid4())
        await db.client_support_profiles.insert_one(doc)

    result = await db.client_support_profiles.find_one({"client_id": client_id}, {"_id": 0})
    return result

@api_router.get("/support/profile/{client_id}/history")
async def get_client_support_history(
    client_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get monthly snapshot history for a client"""
    snapshots = await db.client_support_snapshots.find(
        {"client_id": client_id}, {"_id": 0}
    ).sort("month", -1).to_list(60)  # up to 5 years
    return snapshots

# --- Change Log ---

@api_router.get("/support/changes")
async def list_support_changes(
    client_id: Optional[str] = None,
    month: Optional[str] = None,  # YYYY-MM format
    current_user: dict = Depends(get_current_user)
):
    """List change log entries, optionally filtered by client or month"""
    query = {}
    if client_id:
        query["client_id"] = client_id
    if month:
        try:
            start = datetime.strptime(month, "%Y-%m").replace(tzinfo=timezone.utc)
            end = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
            query["date"] = {"$gte": start, "$lt": end}
        except ValueError:
            raise HTTPException(status_code=400, detail="Month must be YYYY-MM format")
    
    changes = await db.support_changes.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    return changes

@api_router.post("/support/changes", response_model=SupportChangeResponse)
async def create_support_change(
    change: SupportChange,
    current_user: dict = Depends(get_current_user)
):
    """Log a new change"""
    now = datetime.now(timezone.utc)
    doc = {
        "id": str(uuid.uuid4()),
        **change.dict(),
        "date": change.date or now,
        "created_at": now,
        "created_by": current_user.get("username") or current_user.get("email"),
    }
    await db.support_changes.insert_one(doc)
    # If profile_updated is False, flag the client profile as needing update
    if not change.profile_updated:
        await db.client_support_profiles.update_one(
            {"client_id": change.client_id},
            {"$set": {"needs_review": True}},
        )
    return {**doc, "_id": None}

@api_router.put("/support/changes/{change_id}", response_model=SupportChangeResponse)
async def update_support_change(
    change_id: str,
    change: SupportChange,
    current_user: dict = Depends(get_current_user)
):
    """Update a change log entry (e.g. tick off accounts informed)"""
    update_data = {**change.dict(), "updated_at": datetime.now(timezone.utc)}
    result = await db.support_changes.update_one({"id": change_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Change not found")
    # If profile is now marked as updated, clear the needs_review flag
    if change.profile_updated:
        await db.client_support_profiles.update_one(
            {"client_id": change.client_id},
            {"$set": {"needs_review": False}},
        )
    updated = await db.support_changes.find_one({"id": change_id}, {"_id": 0})
    return updated

@api_router.delete("/support/changes/{change_id}")
async def delete_support_change(
    change_id: str,
    admin: dict = Depends(require_admin)
):
    """Delete a change log entry (admin only)"""
    result = await db.support_changes.delete_one({"id": change_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Change not found")
    return {"message": "Change deleted"}

# --- Import endpoint for historical data ---

@api_router.post("/support/import")
async def import_support_data(
    data: dict = Body(...),
    admin: dict = Depends(require_admin)
):
    """
    Bulk import historical support data from migration script.
    Expects: { profiles: [...], snapshots: [...], changes: [...], products: [...] }
    """
    results = {"products": 0, "profiles": 0, "snapshots": 0, "changes": 0, "errors": []}
    
    # Import products
    for p in data.get("products", []):
        try:
            await db.support_products.update_one(
                {"name": p["name"]}, {"$setOnInsert": p}, upsert=True
            )
            results["products"] += 1
        except Exception as e:
            results["errors"].append(f"Product {p.get('name')}: {str(e)}")

    # Import profiles (current state)
    for p in data.get("profiles", []):
        try:
            await db.client_support_profiles.update_one(
                {"client_id": p["client_id"]}, {"$set": p}, upsert=True
            )
            results["profiles"] += 1
        except Exception as e:
            results["errors"].append(f"Profile {p.get('client_id')}: {str(e)}")

    # Import snapshots (historical)
    for s in data.get("snapshots", []):
        try:
            await db.client_support_snapshots.update_one(
                {"client_id": s["client_id"], "month": s["month"]},
                {"$set": s}, upsert=True
            )
            results["snapshots"] += 1
        except Exception as e:
            results["errors"].append(f"Snapshot {s.get('client_id')} {s.get('month')}: {str(e)}")

    # Import changes
    for c in data.get("changes", []):
        try:
            await db.support_changes.update_one(
                {"id": c["id"]}, {"$set": c}, upsert=True
            )
            results["changes"] += 1
        except Exception as e:
            results["errors"].append(f"Change {c.get('id')}: {str(e)}")

    return results

# ── Monthly Support Count view ──────────────────────────────

@api_router.get("/support/monthly-count")
async def get_monthly_support_count(
    month: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Returns all client support data for a given month (YYYY-MM).
    Falls back to current profiles if no snapshot exists for that month.
    Defaults to current month if no month specified.
    """
    if not month:
        month = datetime.now(timezone.utc).strftime("%Y-%m")

    # Get all products for column definitions
    products = await db.support_products.find(
        {"active": True}, {"_id": 0}
    ).sort("sort_order", 1).to_list(500)

    # Get all clients for name lookup
    clients_list = await db.clients.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(1000)
    client_map = {c["id"]: c["name"] for c in clients_list}

    # Also build a site map so site rows show the site name + parent client
    sites_list = await db.sites.find({}, {"_id": 0, "id": 1, "name": 1, "client_id": 1}).to_list(1000)
    site_map = {s["id"]: s for s in sites_list}  # site_id → {id, name, client_id}

    # Get snapshots for this month
    snapshots = await db.client_support_snapshots.find(
        {"month": month}, {"_id": 0}
    ).to_list(500)

    snapshot_map = {s["client_id"]: s for s in snapshots}

    # Also get current profiles for clients with no snapshot this month
    profiles = await db.client_support_profiles.find(
        {}, {"_id": 0}
    ).to_list(500)

    def resolve_row_name(client_id, snap_or_profile=None):
        """Returns (display_name, parent_client_name, is_site)"""
        # Use site_name/display_name baked into the snapshot from historical import
        if snap_or_profile:
            site_name = snap_or_profile.get("site_name") or snap_or_profile.get("display_name")
            if site_name and site_name != client_map.get(client_id, ""):
                parent_name = client_map.get(client_id, "")
                return site_name, parent_name, True
        # Fall back to site_map for live-created site rows
        if client_id in site_map:
            site = site_map[client_id]
            parent_name = client_map.get(site["client_id"], "")
            return site["name"], parent_name, True
        if client_id in client_map:
            return client_map[client_id], "", False
        return client_id.replace("UNRESOLVED:", ""), "", False

    # Build rows - prefer snapshot, fall back to current profile
    rows = []
    seen_clients = set()

    for snap in snapshots:
        if snap.get("removed"):
            seen_clients.add(snap["client_id"])
            continue
        client_id = snap["client_id"]
        # Use client_id + site_id as unique key so multi-site clients all appear
        unique_key = client_id + (snap.get("site_id") or "")
        if unique_key in seen_clients:
            continue
        seen_clients.add(unique_key)
        seen_clients.add(client_id)  # still track client_id for profile fallback
        display_name, parent_name, is_site = resolve_row_name(client_id, snap)
        rows.append({
            "client_id": client_id,
            "site_id": snap.get("site_id"),
            "client_name": display_name,
            "parent_client_name": parent_name,
            "is_site": is_site,
            "support_type": snap.get("support_type"),
            "products": snap.get("products", {}),
            "remarks": snap.get("remarks"),
            "source": "snapshot",
        })

    # Add current profiles for clients not in snapshot
    current_month = datetime.now(timezone.utc).strftime("%Y-%m")
    if month == current_month:
        for profile in profiles:
            client_id = profile["client_id"]
            if client_id not in seen_clients:
                seen_clients.add(client_id)
                display_name, parent_name, is_site = resolve_row_name(client_id, profile)
                rows.append({
                    "client_id": client_id,
                    "client_name": display_name,
                    "parent_client_name": parent_name,
                    "is_site": is_site,
                    "support_type": profile.get("support_type"),
                    "products": profile.get("products", {}),
                    "remarks": profile.get("remarks"),
                    "source": "current",
                })

    # Sort rows by client name
    rows.sort(key=lambda r: (r.get("client_name") or "").lower())

    # Re-sort: parent clients first, then their sites grouped under them
    def sort_key(r):
        if r.get("is_site"):
            parent = (r.get("parent_client_name") or r.get("client_name") or "").lower()
            return (parent, "1", (r.get("client_name") or "").lower())
        return ((r.get("client_name") or "").lower(), "0", "")

    rows.sort(key=sort_key)

    # Attach hosting domains — build a map of client_id → list of primary domains
    hosting_accounts = await db.hosting_accounts.find(
        {"client_id": {"$ne": None}, "ignored": {"$ne": True}},
        {"_id": 0, "primary_domain": 1, "client_id": 1}
    ).to_list(1000)
    hosting_by_client = {}
    for ha in hosting_accounts:
        cid = ha["client_id"]
        if cid not in hosting_by_client:
            hosting_by_client[cid] = []
        hosting_by_client[cid].append(ha["primary_domain"])

    for row in rows:
        row["hosting_domains"] = hosting_by_client.get(row["client_id"], [])

    # Get available months list
    pipeline = [
        {"$group": {"_id": "$month"}},
        {"$sort": {"_id": -1}},
        {"$limit": 36}
    ]
    available_months = [doc["_id"] async for doc in db.client_support_snapshots.aggregate(pipeline)]

    return {
        "month": month,
        "products": products,
        "rows": rows,
        "available_months": sorted(available_months, reverse=True),
    }

@api_router.post("/support/monthly-count/copy-from-previous")
async def copy_support_count_from_previous(
    data: dict = Body(...),
    current_user: dict = Depends(get_current_user)
):
    """Copy all snapshots from source_month into target_month, skipping clients that already have data in target_month."""
    target_month = data.get("target_month")
    source_month = data.get("source_month")
    if not target_month or not source_month:
        raise HTTPException(status_code=400, detail="target_month and source_month are required")

    lock = await db.support_month_locks.find_one({"month": target_month, "locked": True})
    if lock:
        raise HTTPException(status_code=403, detail="Target month is locked and cannot be edited")

    # Get existing snapshots in target month so we don't overwrite them
    existing = await db.client_support_snapshots.find(
        {"month": target_month}, {"client_id": 1}
    ).to_list(500)
    existing_ids = {e["client_id"] for e in existing}

    # Get all snapshots from source month
    source_snaps = await db.client_support_snapshots.find(
        {"month": source_month}, {"_id": 0}
    ).to_list(500)

    now = datetime.now(timezone.utc)
    copied = 0
    for snap in source_snaps:
        if snap.get("removed"):
            continue
        client_id = snap["client_id"]
        if client_id in existing_ids:
            continue  # Don't overwrite existing data
        new_snap = {
            "client_id": client_id,
            "month": target_month,
            "support_type": snap.get("support_type"),
            "products": snap.get("products", {}),
            "remarks": snap.get("remarks"),
            "snapshot_date": now,
            "updated_by": current_user.get("username") or current_user.get("email"),
        }
        await db.client_support_snapshots.update_one(
            {"client_id": client_id, "month": target_month},
            {"$set": new_snap},
            upsert=True
        )
        copied += 1

    return {"message": f"Copied {copied} clients from {source_month} to {target_month}", "copied": copied}


@api_router.put("/support/monthly-count/{client_id}")
async def update_monthly_support_count(
    client_id: str,
    data: dict = Body(...),
    current_user: dict = Depends(get_current_user)
):
    """Update a client's support data for a specific month"""
    month = data.get("month")
    if not month:
        raise HTTPException(status_code=400, detail="Month is required")

    lock = await db.support_month_locks.find_one({"month": month, "locked": True})
    if lock:
        raise HTTPException(status_code=403, detail="This month is locked and cannot be edited")

    now = datetime.now(timezone.utc)
    snap = {
        "client_id": client_id,
        "month": month,
        "support_type": data.get("support_type"),
        "products": data.get("products", {}),
        "remarks": data.get("remarks"),
        "snapshot_date": now,
        "updated_by": current_user.get("username") or current_user.get("email"),
    }

    await db.client_support_snapshots.update_one(
        {"client_id": client_id, "month": month},
        {"$set": snap},
        upsert=True
    )

    # If it's the current month, also update the live profile
    current_month = now.strftime("%Y-%m")
    if month == current_month:
        await db.client_support_profiles.update_one(
            {"client_id": client_id},
            {"$set": {
                "support_type": data.get("support_type"),
                "products": data.get("products", {}),
                "remarks": data.get("remarks"),
                "updated_at": now,
                "updated_by": current_user.get("username") or current_user.get("email"),
            }},
            upsert=True
        )

    return {"message": "Updated"}


@api_router.delete("/support/monthly-count/{client_id}")
async def remove_client_from_month(
    client_id: str,
    month: str = Query(...),
    current_user: dict = Depends(get_current_user)
):
    """Remove a client's snapshot from a specific month"""
    lock = await db.support_month_locks.find_one({"month": month, "locked": True})
    if lock:
        raise HTTPException(status_code=403, detail="This month is locked and cannot be edited")

    # Try to delete an existing snapshot first
    result = await db.client_support_snapshots.delete_one({"client_id": client_id, "month": month})

    if result.deleted_count == 0:
        # No snapshot existed — row was showing from the live profile fallback.
        # Insert a tombstone so the GET endpoint knows to exclude this client for this month.
        await db.client_support_snapshots.update_one(
            {"client_id": client_id, "month": month},
            {"$set": {
                "client_id": client_id,
                "month": month,
                "removed": True,
                "snapshot_date": datetime.now(timezone.utc),
                "updated_by": current_user.get("username") or current_user.get("email"),
            }},
            upsert=True
        )

    return {"message": "Removed"}


@api_router.get("/support/monthly-count/locks")
async def get_month_locks(current_user: dict = Depends(get_current_user)):
    """Get lock status for all months"""
    locks = await db.support_month_locks.find({}, {"_id": 0}).to_list(100)
    return {l["month"]: l for l in locks}


@api_router.post("/support/monthly-count/{month}/lock")
async def lock_month(
    month: str,
    current_user: dict = Depends(require_admin)
):
    """Lock a month so it cannot be edited (admin only)"""
    now = datetime.now(timezone.utc)
    await db.support_month_locks.update_one(
        {"month": month},
        {"$set": {
            "month": month,
            "locked": True,
            "locked_by": current_user.get("email"),
            "locked_at": now,
        }},
        upsert=True
    )
    return {"message": f"{month} locked"}


@api_router.post("/support/monthly-count/{month}/unlock")
async def unlock_month(
    month: str,
    current_user: dict = Depends(require_admin)
):
    """Unlock a month (admin only)"""
    await db.support_month_locks.update_one(
        {"month": month},
        {"$set": {"locked": False, "unlocked_by": current_user.get("email"), "unlocked_at": datetime.now(timezone.utc)}},
        upsert=True
    )
    return {"message": f"{month} unlocked"}


# ── Support Name Mappings ──────────────────────────────────
# Links spreadsheet names to SynthOps clients or sites

@api_router.get("/support/mappings")
async def list_support_mappings(current_user: dict = Depends(get_current_user)):
    """List all name mappings (resolved and unresolved)"""
    # Get all unique client_ids from snapshots that start with UNRESOLVED:
    pipeline = [
        {"$match": {"client_id": {"$regex": "^UNRESOLVED:"}}},
        {"$group": {"_id": "$client_id", "raw_name": {"$first": "$client_id"}}},
        {"$sort": {"_id": 1}},
    ]
    unresolved = [doc["_id"] async for doc in db.client_support_snapshots.aggregate(pipeline)]

    # Also get from profiles
    profile_unresolved = await db.client_support_profiles.distinct(
        "client_id", {"client_id": {"$regex": "^UNRESOLVED:"}}
    )

    all_unresolved = sorted(set(unresolved + profile_unresolved))

    # Get existing mappings
    mappings = await db.support_mappings.find({}, {"_id": 0}).to_list(500)
    mapping_lookup = {m["raw_name"]: m for m in mappings}

    result = []
    for raw_id in all_unresolved:
        raw_name = raw_id.replace("UNRESOLVED:", "")
        existing = mapping_lookup.get(raw_id, {})
        result.append({
            "raw_id": raw_id,
            "raw_name": raw_name,
            "mapped_type": existing.get("mapped_type"),   # "client" or "site"
            "mapped_id": existing.get("mapped_id"),
            "mapped_name": existing.get("mapped_name"),
            "parent_client_id": existing.get("parent_client_id"),
            "parent_client_name": existing.get("parent_client_name"),
        })

    return result

@api_router.post("/support/mappings")
async def save_support_mapping(
    mapping: dict = Body(...),
    admin: dict = Depends(require_admin)
):
    """
    Save a name mapping and update all snapshot/profile records.
    mapping: { raw_id, mapped_type, mapped_id, mapped_name, parent_client_id, parent_client_name }
    """
    raw_id = mapping.get("raw_id")
    if not raw_id:
        raise HTTPException(status_code=400, detail="raw_id is required")

    mapped_id = mapping.get("mapped_id")
    mapped_type = mapping.get("mapped_type")  # "client" or "site"

    # Save the mapping
    await db.support_mappings.update_one(
        {"raw_id": raw_id},
        {"$set": {
            **mapping,
            "updated_at": datetime.now(timezone.utc),
            "updated_by": admin.get("username") or admin.get("email"),
        }},
        upsert=True
    )

    # Update all snapshots with this raw_id to use the real ID
    # We store both the real client_id and the site_id for site mappings
    if mapped_id:
        # For sites, use parent_client_id as client_id and add site_id
        if mapped_type == "site":
            client_id = mapping.get("parent_client_id", mapped_id)
            update_fields = {
                "client_id": client_id,
                "site_id": mapped_id,
                "site_name": mapping.get("mapped_name"),
                "display_name": mapping.get("raw_name"),
            }
        else:
            client_id = mapped_id
            update_fields = {
                "client_id": client_id,
                "display_name": mapping.get("mapped_name"),
            }

        snap_result = await db.client_support_snapshots.update_many(
            {"client_id": raw_id},
            {"$set": update_fields}
        )
        prof_result = await db.client_support_profiles.update_many(
            {"client_id": raw_id},
            {"$set": update_fields}
        )
        changes_result = await db.support_changes.update_many(
            {"client_id": raw_id},
            {"$set": {"client_id": client_id}}
        )

        return {
            "message": "Mapping saved and records updated",
            "snapshots_updated": snap_result.modified_count,
            "profiles_updated": prof_result.modified_count,
            "changes_updated": changes_result.modified_count,
        }

    return {"message": "Mapping saved (no records updated — no mapped_id provided)"}

@api_router.delete("/support/mappings/{raw_id:path}")
async def delete_support_mapping(
    raw_id: str,
    admin: dict = Depends(require_admin)
):
    """Delete a mapping"""
    await db.support_mappings.delete_one({"raw_id": raw_id})
    return {"message": "Mapping deleted"}

# ── Hosting Accounts ──────────────────────────────────────
# Stores live hosting data imported from cPanel/WHM CSV export

@api_router.get("/hosting/accounts")
async def list_hosting_accounts(current_user: dict = Depends(get_current_user)):
    """List all hosting accounts"""
    accounts = await db.hosting_accounts.find({}, {"_id": 0}).sort("primary_domain", 1).to_list(1000)
    return accounts

@api_router.put("/hosting/accounts/{primary_domain}/map")
async def map_hosting_account(
    primary_domain: str,
    data: dict = Body(...),
    current_user: dict = Depends(get_current_user)
):
    """Map a hosting account to a SynthOps client and add to current month's support count"""
    client_id = data.get("client_id")  # None to unmap
    now = datetime.now(timezone.utc)
    await db.hosting_accounts.update_one(
        {"primary_domain": primary_domain},
        {"$set": {
            "client_id": client_id,
            "mapped_at": now,
            "mapped_by": current_user.get("username") or current_user.get("email"),
        }}
    )

    if client_id:
        await _add_hosting_client_to_month(client_id, primary_domain, now, current_user)

    return {"message": "Updated"}


async def _add_hosting_client_to_month(client_id, primary_domain, now, current_user):
    """Add a hosting client to the current month's support count with domain name populated."""
    current_month = now.strftime("%Y-%m")
    lock = await db.support_month_locks.find_one({"month": current_month, "locked": True})
    if lock:
        return
    existing_snap = await db.client_support_snapshots.find_one(
        {"client_id": client_id, "month": current_month, "removed": {"$ne": True}}
    )
    if not existing_snap:
        # Get all domains mapped to this client to populate Domain Name
        all_accounts = await db.hosting_accounts.find(
            {"client_id": client_id}, {"_id": 0, "primary_domain": 1}
        ).to_list(50)
        domain_names = ", ".join(a["primary_domain"] for a in all_accounts)
        await db.client_support_snapshots.insert_one({
            "client_id": client_id,
            "month": current_month,
            "support_type": "Hosting",
            "products": {"Domain Name": domain_names} if domain_names else {},
            "remarks": None,
            "snapshot_date": now,
            "updated_by": current_user.get("username") or current_user.get("email"),
        })


@api_router.put("/hosting/accounts/{primary_domain}/ignore")
async def ignore_hosting_account(
    primary_domain: str,
    data: dict = Body(...),
    current_user: dict = Depends(get_current_user)
):
    """Mark a hosting account as ignored (hidden from support count and default view)"""
    ignored = data.get("ignored", True)
    await db.hosting_accounts.update_one(
        {"primary_domain": primary_domain},
        {"$set": {
            "ignored": ignored,
            "ignored_by": current_user.get("username") or current_user.get("email"),
            "ignored_at": datetime.now(timezone.utc),
        }}
    )
    return {"message": "Updated"}



async def sync_hosting_to_support_count(
    current_user: dict = Depends(get_current_user)
):
    """Add ALL mapped hosting accounts to the current month's support count."""
    now = datetime.now(timezone.utc)
    current_month = now.strftime("%Y-%m")
    lock = await db.support_month_locks.find_one({"month": current_month, "locked": True})
    if lock:
        raise HTTPException(status_code=403, detail="Current month is locked")

    # Get all mapped hosting accounts grouped by client
    accounts = await db.hosting_accounts.find(
        {"client_id": {"$ne": None}, "ignored": {"$ne": True}},
        {"_id": 0, "primary_domain": 1, "client_id": 1}
    ).to_list(1000)

    # Group by client_id
    by_client = {}
    for acc in accounts:
        cid = acc["client_id"]
        if cid not in by_client:
            by_client[cid] = []
        by_client[cid].append(acc["primary_domain"])

    added = 0
    skipped = 0
    for client_id, domains in by_client.items():
        existing = await db.client_support_snapshots.find_one(
            {"client_id": client_id, "month": current_month, "removed": {"$ne": True}}
        )
        if existing:
            skipped += 1
            continue
        domain_names = ", ".join(domains)
        await db.client_support_snapshots.insert_one({
            "client_id": client_id,
            "month": current_month,
            "support_type": "Hosting",
            "products": {"Domain Name": domain_names} if domain_names else {},
            "remarks": None,
            "snapshot_date": now,
            "updated_by": current_user.get("username") or current_user.get("email"),
        })
        added += 1

    return {"message": f"Added {added} hosting clients to {current_month}. {skipped} already present.", "added": added, "skipped": skipped}



@api_router.delete("/support/monthly-count/wipe-month")
async def wipe_month(
    month: str = Query(...),
    admin: dict = Depends(require_admin)
):
    """Delete ALL snapshots for a given month (admin only). Used to clean up bad imports."""
    result = await db.client_support_snapshots.delete_many({"month": month})
    return {"message": f"Deleted {result.deleted_count} snapshots for {month}", "deleted": result.deleted_count}

@api_router.post("/hosting/import")
async def import_hosting_accounts(
    data: dict = Body(...),
    current_user: dict = Depends(require_admin)
):
    """Bulk import hosting accounts (upsert by primary_domain)"""
    accounts = data.get("accounts", [])
    imported = 0
    for acc in accounts:
        await db.hosting_accounts.update_one(
            {"primary_domain": acc["primary_domain"]},
            {"$set": acc},
            upsert=True
        )
        imported += 1
    return {"message": f"Imported {imported} accounts", "imported": imported}


# ── 20i Hosting Integration ───────────────────────────────

async def sync_20i_packages():
    """Sync hosting packages from 20i API into hosting_accounts collection."""
    api_key = os.environ.get('TWENTY_I_API_KEY', '')
    if not api_key:
        logger.warning("20i sync skipped — TWENTY_I_API_KEY not set")
        return {"synced": 0, "error": "API key not configured"}

    token = base64.b64encode(api_key.encode()).decode()
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    try:
        async with httpx.AsyncClient(timeout=30) as client_http:
            resp = await client_http.get("https://api.20i.com/package", headers=headers)
            resp.raise_for_status()
            packages = resp.json()
    except Exception as e:
        logger.error(f"20i API error: {e}")
        return {"synced": 0, "error": str(e)}

    synced = 0
    for pkg in packages:
        primary_domain = pkg.get("name", "").strip()
        if not primary_domain:
            continue
        all_domains = [d.strip() for d in pkg.get("names", [primary_domain]) if d.strip()]
        # Get existing to preserve client_id mapping
        existing = await db.hosting_accounts.find_one({"primary_domain": primary_domain})
        doc = {
            "primary_domain": primary_domain,
            "all_domains": all_domains,
            "package": pkg.get("packageTypeName", ""),
            "package_id": pkg.get("id"),
            "enabled": pkg.get("enabled", True),
            "created": pkg.get("created"),
            "has_ssl": None,  # fetched separately below if needed
            "source": "20i",
            "last_synced": datetime.now(timezone.utc),
        }
        if existing:
            # Preserve existing client mapping
            if existing.get("client_id"):
                doc["client_id"] = existing["client_id"]
                doc["mapped_at"] = existing.get("mapped_at")
                doc["mapped_by"] = existing.get("mapped_by")
        await db.hosting_accounts.update_one(
            {"primary_domain": primary_domain},
            {"$set": doc},
            upsert=True
        )
        synced += 1

    logger.info(f"20i sync complete: {synced} packages")
    return {"synced": synced}


@api_router.post("/integrations/20i/sync")
async def trigger_20i_sync(current_user: dict = Depends(require_admin)):
    """Manually trigger a 20i hosting sync"""
    result = await sync_20i_packages()
    return result


@api_router.get("/integrations/20i/status")
async def get_20i_status(current_user: dict = Depends(get_current_user)):
    """Check 20i integration status"""
    api_key = os.environ.get('TWENTY_I_API_KEY', '')
    count = await db.hosting_accounts.count_documents({"source": "20i"})
    last = await db.hosting_accounts.find_one({"source": "20i"}, sort=[("last_synced", -1)])
    return {
        "configured": bool(api_key),
        "package_count": count,
        "last_synced": last.get("last_synced") if last else None,
    }


# Include the router after all routes are defined
app.include_router(api_router)

@app.on_event("startup")
async def migrate_client_types():
    """One-time migration: rename service_only → web_services"""
    result = await db.clients.update_many(
        {"client_type": "service_only"},
        {"$set": {"client_type": "web_services"}}
    )
    if result.modified_count:
        logger.info(f"Migrated {result.modified_count} clients from service_only → web_services")

@app.on_event("startup")
async def start_scheduler():
    """Start the background scheduler on app startup"""
    sync_interval = int(os.environ.get("SYNC_INTERVAL_MINUTES", "15"))
    
    logger.info(f"Starting scheduler with {sync_interval} minute interval")
    
    # Add TRMM sync job
    scheduler.add_job(
        scheduled_trmm_sync,
        IntervalTrigger(minutes=sync_interval),
        id="trmm_sync",
        replace_existing=True,
        max_instances=1
    )

    # Add daily backup sync job - 7:00 AM GMT
    scheduler.add_job(
        scheduled_backup_sync,
        CronTrigger(hour=7, minute=0, timezone="Europe/London"),
        id="backup_daily_sync",
        replace_existing=True,
        max_instances=1
    )

    # Add 20i hosting sync job
    if os.environ.get('TWENTY_I_API_KEY'):
        scheduler.add_job(
            sync_20i_packages,
            IntervalTrigger(minutes=sync_interval),
            id="twenty_i_sync",
            replace_existing=True,
            max_instances=1
        )
        logger.info("20i sync job scheduled")
        # Run immediately on startup
        asyncio.create_task(sync_20i_packages())

    scheduler.start()
    logger.info("Scheduler started successfully")

@app.on_event("shutdown")
async def shutdown_db_client():
    scheduler.shutdown()
    client.close()
