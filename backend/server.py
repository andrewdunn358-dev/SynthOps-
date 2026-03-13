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
from emergentintegrations.llm.chat import LlmChat, UserMessage
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

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
    """Simple in-memory rate limiter"""
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

rate_limiter = RateLimiter(requests_per_minute=120)

class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Skip rate limiting for health checks
        if request.url.path == "/api/" or request.url.path == "/api/health":
            return await call_next(request)
        
        client_ip = request.client.host if request.client else "unknown"
        
        if not rate_limiter.is_allowed(client_ip):
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please try again later."}
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
    site_count: int = 0

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
async def list_users(user: dict = Depends(require_admin)):
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
        sites = await db.sites.find({"client_id": c["id"]}, {"id": 1}).to_list(1000)
        for site in sites:
            server_count += await db.servers.count_documents({"site_id": site["id"]})
        
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
            server_count=server_count, site_count=site_count
        ))
    return result

@api_router.get("/clients/{client_id}", response_model=ClientResponse)
async def get_client(client_id: str, user: dict = Depends(get_current_user)):
    c = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    site_count = await db.sites.count_documents({"client_id": client_id, "is_active": True})
    server_count = 0
    sites = await db.sites.find({"client_id": client_id}, {"id": 1}).to_list(1000)
    for site in sites:
        server_count += await db.servers.count_documents({"site_id": site["id"]})
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
        server_count=server_count, site_count=site_count
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
        server_count=0, site_count=0
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
            ip_address=s.get("ip_address"), operating_system=s.get("operating_system"),
            os_version=s.get("os_version"), cpu_cores=s.get("cpu_cores"),
            ram_gb=s.get("ram_gb"), storage_gb=s.get("storage_gb"),
            environment=s.get("environment", "production"),
            criticality=s.get("criticality", "medium"),
            notes=decrypt_field(s.get("notes")) if s.get("notes") else None,
            status=s.get("status", "online"),
            last_health_check=datetime.fromisoformat(s["last_health_check"]) if s.get("last_health_check") else None,
            tactical_rmm_agent_id=s.get("tactical_rmm_agent_id"),
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
        ip_address=s.get("ip_address"), operating_system=s.get("operating_system"),
        os_version=s.get("os_version"), cpu_cores=s.get("cpu_cores"),
        ram_gb=s.get("ram_gb"), storage_gb=s.get("storage_gb"),
        environment=s.get("environment", "production"),
        criticality=s.get("criticality", "medium"),
        notes=decrypt_field(s.get("notes")) if s.get("notes") else None,
        status=s.get("status", "online"),
        last_health_check=datetime.fromisoformat(s["last_health_check"]) if s.get("last_health_check") else None,
        tactical_rmm_agent_id=s.get("tactical_rmm_agent_id"),
        created_at=datetime.fromisoformat(s["created_at"])
    )

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
            updated_at=datetime.fromisoformat(t["updated_at"]) if t.get("updated_at") else None
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
    return {"message": "Task deleted"}

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
        
        # Get worksheets
        worksheets = await db.job_worksheets.find({"job_id": job["id"]}, {"_id": 0}).to_list(100)
        
        # Calculate actual hours
        actual_hours = sum(ws.get("hours_spent", 0) for ws in worksheets)
        
        result.append({
            **job,
            "assigned_to_name": assigned_to_name,
            "actual_hours": actual_hours,
            "worksheets": worksheets
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
                           start_date: Optional[str] = None, end_date: Optional[str] = None,
                           user: dict = Depends(get_current_user)):
    query = {}
    if user_id:
        query["user_id"] = user_id
    elif user["role"] != "admin":
        query["user_id"] = user["id"]
    if client_id:
        query["client_id"] = client_id
    
    entries = await db.time_entries.find(query, {"_id": 0}).to_list(1000)
    result = []
    for e in entries:
        user_obj = await db.users.find_one({"id": e["user_id"]}, {"username": 1})
        client_name = None
        if e.get("client_id"):
            client = await db.clients.find_one({"id": e["client_id"]}, {"name": 1})
            client_name = client["name"] if client else None
        
        result.append(TimeEntryResponse(
            id=e["id"], user_id=e["user_id"],
            user_name=user_obj["username"] if user_obj else None,
            client_id=e.get("client_id"), client_name=client_name,
            task_id=e.get("task_id"), project_id=e.get("project_id"),
            incident_id=e.get("incident_id"),
            entry_date=datetime.fromisoformat(e["entry_date"]),
            duration_minutes=e["duration_minutes"],
            description=e.get("description"), is_billable=e.get("is_billable", True),
            status=e.get("status", "draft"),
            created_at=datetime.fromisoformat(e["created_at"])
        ))
    return result

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
async def update_health_check(check_id: str, status: str = Body(...), 
                             notes: Optional[str] = Body(None),
                             value_recorded: Optional[str] = Body(None),
                             user: dict = Depends(get_current_user)):
    if status not in ["pending", "passed", "warning", "failed", "skipped"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    update_data = {
        "status": status,
        "performed_by": user["id"],
        "check_date": datetime.now(timezone.utc).isoformat(),
        "notes": encrypt_field(notes) if notes else None,
        "value_recorded": value_recorded
    }
    result = await db.health_checks.update_one({"id": check_id}, {"$set": update_data})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Health check not found")
    return {"message": "Health check updated"}

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
                return {"status": "connected", "message": "Successfully connected to Tactical RMM"}
            else:
                return {"status": "error", "message": f"API returned status {response.status_code}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

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
                    
                    # Extract hardware info
                    local_ips = agent.get("local_ips", [])
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
                        "logged_in_username": agent.get("logged_in_username"),
                        "last_logged_in_user": agent.get("last_logged_in_user"),
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
                        "agent_version": agent.get("agent_version"),
                        "antivirus": agent.get("antivirus"),
                        "needs_reboot": agent.get("needs_reboot", False),
                        "pending_actions_count": agent.get("pending_actions_count", 0),
                        "has_patches_pending": agent.get("has_patches_pending", False),
                        "patches_pending_count": agent.get("patches_pending_count", 0),
                        # Sync metadata
                        "tactical_rmm_agent_id": agent_id,
                        "monitoring_type": monitoring_type,
                        "is_server": is_server,
                        "synced_at": datetime.now(timezone.utc).isoformat(),
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }
                    
                    if is_server:
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
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="AI not configured")
    
    session_id = message.session_id or f"sophie-{user['id']}-{datetime.now().strftime('%Y%m%d')}"
    
    # Get documentation for context
    docs = await db.documentation.find({"is_published": True}, {"title": 1, "content": 1}).to_list(50)
    doc_context = "\n".join([f"- {d['title']}" for d in docs]) if docs else "No documentation available yet."
    
    # Get recent incidents for context
    recent_incidents = await db.incidents.find({"status": {"$ne": "resolved"}}, {"title": 1, "severity": 1}).to_list(5)
    incident_context = "\n".join([f"- {i['title']} ({i['severity']})" for i in recent_incidents]) if recent_incidents else "No open incidents."
    
    system_message = f"""You are Sophie, the AI assistant for SynthOps - an IT Operations Portal for Synthesis IT Ltd.

Your role is to help IT engineers with:
1. PC and server troubleshooting advice
2. IT best practices and procedures
3. Answering questions about documentation and runbooks
4. General IT support guidance

Available Documentation:
{doc_context}

Current Open Incidents:
{incident_context}

Be concise, technical, and helpful. If you don't know something specific to this organization, provide general IT best practices.
Always maintain a professional but friendly tone. You can use technical terms as the users are IT professionals."""

    try:
        chat = LlmChat(
            api_key=api_key,
            session_id=session_id,
            system_message=system_message
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        
        user_message = UserMessage(text=message.message)
        response = await chat.send_message(user_message)
        
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
    total_servers = await db.servers.count_documents({})
    servers_online = await db.servers.count_documents({"status": "online"})
    servers_offline = await db.servers.count_documents({"status": "offline"})
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


# ==================== ZAMMAD INTEGRATION ====================

@api_router.get("/zammad/test")
async def test_zammad_connection(user: dict = Depends(get_current_user)):
    """Test Zammad API connection"""
    api_url = os.environ.get("ZAMMAD_API_URL", "").rstrip("/")
    api_token = os.environ.get("ZAMMAD_API_TOKEN", "")
    
    if not api_url or not api_token:
        raise HTTPException(status_code=400, detail="Zammad not configured")
    
    headers = {"Authorization": f"Token token={api_token}"}
    
    try:
        async with httpx.AsyncClient() as http_client:
            resp = await http_client.get(f"{api_url}/api/v1/users/me", headers=headers, timeout=10.0)
            if resp.status_code == 200:
                user_data = resp.json()
                return {"status": "connected", "message": f"Connected as {user_data.get('email', 'Unknown')}"}
            else:
                raise HTTPException(status_code=500, detail=f"Zammad API error: {resp.status_code}")
    except httpx.RequestError as e:
        raise HTTPException(status_code=500, detail=f"Connection error: {str(e)}")

@api_router.get("/zammad/tickets")
async def get_zammad_tickets(
    organization: Optional[str] = None,
    state: Optional[str] = None,
    limit: int = 100,
    user: dict = Depends(get_current_user)
):
    """Get tickets from Zammad, optionally filtered by organization"""
    api_url = os.environ.get("ZAMMAD_API_URL", "").rstrip("/")
    api_token = os.environ.get("ZAMMAD_API_TOKEN", "")
    
    if not api_url or not api_token:
        raise HTTPException(status_code=400, detail="Zammad not configured")
    
    headers = {"Authorization": f"Token token={api_token}"}
    
    try:
        async with httpx.AsyncClient() as http_client:
            # Get tickets
            resp = await http_client.get(
                f"{api_url}/api/v1/tickets?per_page={limit}&expand=true",
                headers=headers,
                timeout=30.0
            )
            if resp.status_code != 200:
                raise HTTPException(status_code=500, detail="Failed to fetch tickets")
            
            tickets = resp.json()
            
            # Get states for mapping
            states_resp = await http_client.get(f"{api_url}/api/v1/ticket_states", headers=headers, timeout=10.0)
            states = {s["id"]: s["name"] for s in states_resp.json()} if states_resp.status_code == 200 else {}
            
            # Get priorities for mapping
            priorities_resp = await http_client.get(f"{api_url}/api/v1/ticket_priorities", headers=headers, timeout=10.0)
            priorities = {p["id"]: p["name"] for p in priorities_resp.json()} if priorities_resp.status_code == 200 else {}
            
            # Get organizations for mapping
            orgs_resp = await http_client.get(f"{api_url}/api/v1/organizations", headers=headers, timeout=10.0)
            orgs = {o["id"]: o["name"] for o in orgs_resp.json()} if orgs_resp.status_code == 200 else {}
            
            # Get groups for mapping
            groups_resp = await http_client.get(f"{api_url}/api/v1/groups", headers=headers, timeout=10.0)
            groups = {g["id"]: g["name"] for g in groups_resp.json()} if groups_resp.status_code == 200 else {}
            
            # Enrich tickets
            result = []
            for t in tickets:
                org_name = orgs.get(t.get("organization_id"), "")
                
                # Filter by organization if specified
                if organization and org_name.lower() != organization.lower():
                    continue
                
                # Filter by state if specified
                state_name = states.get(t.get("state_id"), "unknown")
                if state and state_name.lower() != state.lower():
                    continue
                
                result.append({
                    "id": t.get("id"),
                    "number": t.get("number"),
                    "title": t.get("title"),
                    "state": state_name,
                    "priority": priorities.get(t.get("priority_id"), "normal"),
                    "organization": org_name,
                    "group": groups.get(t.get("group_id"), ""),
                    "customer_id": t.get("customer_id"),
                    "owner_id": t.get("owner_id"),
                    "article_count": t.get("article_count", 0),
                    "created_at": t.get("created_at"),
                    "updated_at": t.get("updated_at"),
                    "first_response_at": t.get("first_response_at"),
                    "close_at": t.get("close_at"),
                    "last_contact_at": t.get("last_contact_at")
                })
            
            return result
    except httpx.RequestError as e:
        raise HTTPException(status_code=500, detail=f"Connection error: {str(e)}")

@api_router.get("/zammad/tickets/{ticket_id}")
async def get_zammad_ticket_detail(ticket_id: int, user: dict = Depends(get_current_user)):
    """Get detailed ticket information including articles"""
    api_url = os.environ.get("ZAMMAD_API_URL", "").rstrip("/")
    api_token = os.environ.get("ZAMMAD_API_TOKEN", "")
    
    if not api_url or not api_token:
        raise HTTPException(status_code=400, detail="Zammad not configured")
    
    headers = {"Authorization": f"Token token={api_token}"}
    
    try:
        async with httpx.AsyncClient() as http_client:
            # Get ticket
            ticket_resp = await http_client.get(
                f"{api_url}/api/v1/tickets/{ticket_id}?expand=true",
                headers=headers,
                timeout=10.0
            )
            if ticket_resp.status_code != 200:
                raise HTTPException(status_code=404, detail="Ticket not found")
            
            ticket = ticket_resp.json()
            
            # Get articles for this ticket
            articles_resp = await http_client.get(
                f"{api_url}/api/v1/ticket_articles/by_ticket/{ticket_id}",
                headers=headers,
                timeout=10.0
            )
            articles = articles_resp.json() if articles_resp.status_code == 200 else []
            
            # Get users for mapping
            users_resp = await http_client.get(f"{api_url}/api/v1/users", headers=headers, timeout=10.0)
            users = {u["id"]: f"{u.get('firstname', '')} {u.get('lastname', '')}".strip() or u.get("email", "Unknown") 
                     for u in users_resp.json()} if users_resp.status_code == 200 else {}
            
            return {
                "ticket": ticket,
                "articles": [{
                    "id": a.get("id"),
                    "from": a.get("from"),
                    "to": a.get("to"),
                    "subject": a.get("subject"),
                    "body": a.get("body"),
                    "internal": a.get("internal", False),
                    "created_by": users.get(a.get("created_by_id"), "Unknown"),
                    "created_at": a.get("created_at")
                } for a in articles]
            }
    except httpx.RequestError as e:
        raise HTTPException(status_code=500, detail=f"Connection error: {str(e)}")

@api_router.get("/zammad/organizations")
async def get_zammad_organizations(user: dict = Depends(get_current_user)):
    """Get all organizations from Zammad"""
    api_url = os.environ.get("ZAMMAD_API_URL", "").rstrip("/")
    api_token = os.environ.get("ZAMMAD_API_TOKEN", "")
    
    if not api_url or not api_token:
        raise HTTPException(status_code=400, detail="Zammad not configured")
    
    headers = {"Authorization": f"Token token={api_token}"}
    
    try:
        async with httpx.AsyncClient() as http_client:
            resp = await http_client.get(f"{api_url}/api/v1/organizations", headers=headers, timeout=10.0)
            if resp.status_code != 200:
                raise HTTPException(status_code=500, detail="Failed to fetch organizations")
            
            return resp.json()
    except httpx.RequestError as e:
        raise HTTPException(status_code=500, detail=f"Connection error: {str(e)}")

@api_router.get("/zammad/stats")
async def get_zammad_stats(user: dict = Depends(get_current_user)):
    """Get Zammad ticket statistics"""
    api_url = os.environ.get("ZAMMAD_API_URL", "").rstrip("/")
    api_token = os.environ.get("ZAMMAD_API_TOKEN", "")
    
    if not api_url or not api_token:
        raise HTTPException(status_code=400, detail="Zammad not configured")
    
    headers = {"Authorization": f"Token token={api_token}"}
    
    try:
        async with httpx.AsyncClient() as http_client:
            # Get tickets
            resp = await http_client.get(f"{api_url}/api/v1/tickets?per_page=500", headers=headers, timeout=30.0)
            if resp.status_code != 200:
                raise HTTPException(status_code=500, detail="Failed to fetch tickets")
            
            tickets = resp.json()
            
            # Get states for mapping
            states_resp = await http_client.get(f"{api_url}/api/v1/ticket_states", headers=headers, timeout=10.0)
            states = {s["id"]: s["name"] for s in states_resp.json()} if states_resp.status_code == 200 else {}
            
            # Count by state
            state_counts = {}
            for t in tickets:
                state_name = states.get(t.get("state_id"), "unknown")
                state_counts[state_name] = state_counts.get(state_name, 0) + 1
            
            return {
                "total": len(tickets),
                "by_state": state_counts,
                "open": state_counts.get("open", 0) + state_counts.get("new", 0),
                "pending": state_counts.get("pending reminder", 0) + state_counts.get("pending close", 0),
                "closed": state_counts.get("closed", 0)
            }
    except httpx.RequestError as e:
        raise HTTPException(status_code=500, detail=f"Connection error: {str(e)}")


@api_router.post("/zammad/tickets/{ticket_id}/reply")
async def reply_to_zammad_ticket(ticket_id: int, data: dict, user: dict = Depends(get_current_user)):
    """Send a reply to a Zammad ticket"""
    api_url = os.environ.get("ZAMMAD_API_URL", "").rstrip("/")
    api_token = os.environ.get("ZAMMAD_API_TOKEN", "")
    
    if not api_url or not api_token:
        raise HTTPException(status_code=400, detail="Zammad not configured")
    
    headers = {"Authorization": f"Token token={api_token}", "Content-Type": "application/json"}
    
    try:
        async with httpx.AsyncClient() as http_client:
            # Create article (reply) on the ticket
            article_data = {
                "ticket_id": ticket_id,
                "body": data.get("body", ""),
                "type": "note",
                "internal": data.get("internal", False),
                "sender": "Agent"
            }
            
            resp = await http_client.post(
                f"{api_url}/api/v1/ticket_articles",
                json=article_data,
                headers=headers,
                timeout=10.0
            )
            
            if resp.status_code not in [200, 201]:
                raise HTTPException(status_code=500, detail=f"Failed to create reply: {resp.text}")
            
            return {"message": "Reply sent", "article": resp.json()}
    except httpx.RequestError as e:
        raise HTTPException(status_code=500, detail=f"Connection error: {str(e)}")

@api_router.post("/zammad/ticket-to-task")
async def create_task_from_ticket(data: dict, user: dict = Depends(get_current_user)):
    """Create a SynthOps task from a Zammad ticket"""
    ticket_id = data.get("ticket_id")
    title = data.get("title", "Task from ticket")
    organization = data.get("organization")
    
    # Find client by organization name
    client = await db.clients.find_one({"name": organization}) if organization else None
    
    # Check if task already exists for this ticket
    existing = await db.tasks.find_one({"zammad_ticket_id": ticket_id})
    if existing:
        return {"message": "Task already exists for this ticket", "task_id": existing["id"]}
    
    # Create task
    task = {
        "id": str(uuid.uuid4()),
        "title": f"[Ticket #{ticket_id}] {title}",
        "description": f"Created from Zammad ticket #{ticket_id}",
        "status": "open",
        "priority": "medium",
        "client_id": client["id"] if client else None,
        "zammad_ticket_id": ticket_id,
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.tasks.insert_one(task)
    
    return {"message": "Task created", "task_id": task["id"]}

@api_router.post("/zammad/sync-to-tasks")
async def sync_zammad_tickets_to_tasks(user: dict = Depends(get_current_user)):
    """Sync all open Zammad tickets to SynthOps tasks"""
    api_url = os.environ.get("ZAMMAD_API_URL", "").rstrip("/")
    api_token = os.environ.get("ZAMMAD_API_TOKEN", "")
    
    if not api_url or not api_token:
        raise HTTPException(status_code=400, detail="Zammad not configured")
    
    headers = {"Authorization": f"Token token={api_token}"}
    stats = {"synced": 0, "skipped": 0, "errors": 0}
    
    try:
        async with httpx.AsyncClient() as http_client:
            # Get all non-closed tickets
            resp = await http_client.get(f"{api_url}/api/v1/tickets?per_page=500", headers=headers, timeout=30.0)
            if resp.status_code != 200:
                raise HTTPException(status_code=500, detail="Failed to fetch tickets")
            
            tickets = resp.json()
            
            # Get states for filtering
            states_resp = await http_client.get(f"{api_url}/api/v1/ticket_states", headers=headers, timeout=10.0)
            states = {s["id"]: s["name"] for s in states_resp.json()} if states_resp.status_code == 200 else {}
            
            # Get organizations for mapping
            orgs_resp = await http_client.get(f"{api_url}/api/v1/organizations", headers=headers, timeout=10.0)
            orgs = {o["id"]: o["name"] for o in orgs_resp.json()} if orgs_resp.status_code == 200 else {}
            
            for ticket in tickets:
                state_name = states.get(ticket.get("state_id"), "unknown")
                
                # Skip closed tickets
                if state_name == "closed":
                    stats["skipped"] += 1
                    continue
                
                ticket_id = ticket.get("id")
                
                # Check if task already exists
                existing = await db.tasks.find_one({"zammad_ticket_id": ticket_id})
                if existing:
                    stats["skipped"] += 1
                    continue
                
                # Find client by organization
                org_name = orgs.get(ticket.get("organization_id"))
                client = await db.clients.find_one({"name": org_name}) if org_name else None
                
                # Create task
                task = {
                    "id": str(uuid.uuid4()),
                    "title": f"[Ticket #{ticket.get('number')}] {ticket.get('title', 'Untitled')}",
                    "description": f"Auto-created from Zammad ticket #{ticket.get('number')}\nOrganization: {org_name or 'Unknown'}\nState: {state_name}",
                    "status": "open",
                    "priority": "medium",
                    "client_id": client["id"] if client else None,
                    "zammad_ticket_id": ticket_id,
                    "created_by": user["id"],
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                
                try:
                    await db.tasks.insert_one(task)
                    stats["synced"] += 1
                except Exception:
                    stats["errors"] += 1
            
            return {"message": f"Synced {stats['synced']} tickets to tasks", "stats": stats}
    except httpx.RequestError as e:
        raise HTTPException(status_code=500, detail=f"Connection error: {str(e)}")

@api_router.get("/sync/status")
async def get_sync_status(user: dict = Depends(get_current_user)):
    """Get sync status and recent sync logs"""
    sync_interval = int(os.environ.get("SYNC_INTERVAL_MINUTES", "15"))
    
    # Get recent sync logs
    trmm_logs = await db.sync_logs.find({"sync_type": "trmm"}, {"_id": 0}).sort("created_at", -1).to_list(5)
    zammad_logs = await db.sync_logs.find({"sync_type": "zammad"}, {"_id": 0}).sort("created_at", -1).to_list(5)
    
    # Get next scheduled run times
    trmm_job = scheduler.get_job("trmm_sync")
    zammad_job = scheduler.get_job("zammad_sync")
    
    return {
        "sync_interval_minutes": sync_interval,
        "trmm": {
            "configured": bool(os.environ.get("TACTICAL_RMM_API_KEY")),
            "next_run": trmm_job.next_run_time.isoformat() if trmm_job and trmm_job.next_run_time else None,
            "recent_logs": trmm_logs
        },
        "zammad": {
            "configured": bool(os.environ.get("ZAMMAD_API_TOKEN")),
            "next_run": zammad_job.next_run_time.isoformat() if zammad_job and zammad_job.next_run_time else None,
            "recent_logs": zammad_logs
        }
    }

@api_router.post("/sync/trigger/{sync_type}")
async def trigger_manual_sync(sync_type: str, user: dict = Depends(get_current_user)):
    """Manually trigger a sync"""
    if sync_type == "trmm":
        asyncio.create_task(scheduled_trmm_sync())
        return {"message": "TRMM sync triggered"}
    elif sync_type == "zammad":
        asyncio.create_task(scheduled_zammad_sync())
        return {"message": "Zammad sync triggered"}
    else:
        raise HTTPException(status_code=400, detail="Invalid sync type. Use 'trmm' or 'zammad'")

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


# Include the router
app.include_router(api_router)

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

async def scheduled_zammad_sync():
    """Background task to sync Zammad tickets to tasks"""
    api_url = os.environ.get("ZAMMAD_API_URL", "").rstrip("/")
    api_token = os.environ.get("ZAMMAD_API_TOKEN", "")
    
    if not api_url or not api_token:
        return
    
    logger.info("Starting scheduled Zammad sync...")
    headers = {"Authorization": f"Token token={api_token}"}
    stats = {"synced": 0, "skipped": 0}
    
    try:
        async with httpx.AsyncClient() as http_client:
            resp = await http_client.get(f"{api_url}/api/v1/tickets?per_page=100", headers=headers, timeout=30.0)
            if resp.status_code != 200:
                logger.error("Failed to fetch tickets from Zammad")
                return
            
            tickets = resp.json()
            
            states_resp = await http_client.get(f"{api_url}/api/v1/ticket_states", headers=headers, timeout=10.0)
            states = {s["id"]: s["name"] for s in states_resp.json()} if states_resp.status_code == 200 else {}
            
            orgs_resp = await http_client.get(f"{api_url}/api/v1/organizations", headers=headers, timeout=10.0)
            orgs = {o["id"]: o["name"] for o in orgs_resp.json()} if orgs_resp.status_code == 200 else {}
            
            system_user = await db.users.find_one({"username": "system"})
            if not system_user:
                system_user = {"id": "system"}
            
            for ticket in tickets:
                state_name = states.get(ticket.get("state_id"), "unknown")
                if state_name == "closed":
                    stats["skipped"] += 1
                    continue
                
                ticket_id = ticket.get("id")
                existing = await db.tasks.find_one({"zammad_ticket_id": ticket_id})
                if existing:
                    stats["skipped"] += 1
                    continue
                
                org_name = orgs.get(ticket.get("organization_id"))
                client = await db.clients.find_one({"name": org_name}) if org_name else None
                
                task = {
                    "id": str(uuid.uuid4()),
                    "title": f"[Ticket #{ticket.get('number')}] {ticket.get('title', 'Untitled')}",
                    "description": f"Auto-synced from Zammad\nOrganization: {org_name or 'Unknown'}\nState: {state_name}",
                    "status": "open",
                    "priority": "medium",
                    "client_id": client["id"] if client else None,
                    "zammad_ticket_id": ticket_id,
                    "created_by": system_user["id"],
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                
                await db.tasks.insert_one(task)
                stats["synced"] += 1
        
        logger.info(f"Zammad sync completed: {stats}")
        
        await db.sync_logs.insert_one({
            "id": str(uuid.uuid4()),
            "sync_type": "zammad",
            "stats": stats,
            "status": "success",
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        
    except Exception as e:
        logger.error(f"Zammad sync error: {str(e)}")

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
    
    # Add Zammad sync job
    scheduler.add_job(
        scheduled_zammad_sync,
        IntervalTrigger(minutes=sync_interval),
        id="zammad_sync",
        replace_existing=True,
        max_instances=1
    )
    
    scheduler.start()
    logger.info("Scheduler started successfully")

@app.on_event("shutdown")
async def shutdown_db_client():
    scheduler.shutdown()
    client.close()
