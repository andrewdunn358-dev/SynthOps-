from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Query, Body
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
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
from emergentintegrations.llm.chat import LlmChat, UserMessage

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

# ==================== MODELS ====================

class UserCreate(BaseModel):
    email: EmailStr
    username: str
    password: str
    role: str = "engineer"

class UserLogin(BaseModel):
    email: EmailStr
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
    existing = await db.users.find_one({"$or": [{"email": user_data.email}, {"username": user_data.username}]})
    if existing:
        raise HTTPException(status_code=400, detail="Email or username already exists")
    
    user_count = await db.users.count_documents({})
    role = "admin" if user_count == 0 else user_data.role
    
    user = {
        "id": str(uuid.uuid4()),
        "email": user_data.email,
        "username": user_data.username,
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
    user = await db.users.find_one({"email": credentials.email}, {"_id": 0})
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
    return {"message": "Project deleted"}

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

@api_router.put("/maintenance/{maintenance_id}/complete")
async def complete_maintenance(maintenance_id: str, notes: Optional[str] = Body(None),
                              user: dict = Depends(get_current_user)):
    update_data = {
        "status": "completed",
        "completed_date": datetime.now(timezone.utc).isoformat(),
        "notes": encrypt_field(notes) if notes else None
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
    {"id": "hc-1", "category": "Storage", "name": "Disk Space Usage", "description": "Check disk space (alert >80%)", "check_type": "manual", "server_roles": None, "frequency": "monthly", "is_active": True},
    {"id": "hc-2", "category": "Storage", "name": "RAID Health Status", "description": "Verify RAID array health", "check_type": "manual", "server_roles": ["physical"], "frequency": "monthly", "is_active": True},
    {"id": "hc-3", "category": "Active Directory", "name": "DC Replication Status", "description": "Check AD replication between DCs", "check_type": "manual", "server_roles": ["domain controller"], "frequency": "monthly", "is_active": True},
    {"id": "hc-4", "category": "Active Directory", "name": "FSMO Roles Verification", "description": "Verify FSMO role holders", "check_type": "manual", "server_roles": ["domain controller"], "frequency": "monthly", "is_active": True},
    {"id": "hc-5", "category": "Active Directory", "name": "DNS Health Check", "description": "Verify DNS resolution and zones", "check_type": "manual", "server_roles": ["domain controller"], "frequency": "monthly", "is_active": True},
    {"id": "hc-6", "category": "Active Directory", "name": "Group Policy Replication", "description": "Check GPO replication status", "check_type": "manual", "server_roles": ["domain controller"], "frequency": "monthly", "is_active": True},
    {"id": "hc-7", "category": "Active Directory", "name": "SYSVOL Replication", "description": "Verify SYSVOL is replicating", "check_type": "manual", "server_roles": ["domain controller"], "frequency": "monthly", "is_active": True},
    {"id": "hc-8", "category": "Backup", "name": "Backup Job Status", "description": "Verify backup jobs completing", "check_type": "manual", "server_roles": None, "frequency": "weekly", "is_active": True},
    {"id": "hc-9", "category": "Backup", "name": "Test Restore Verification", "description": "Perform test restore", "check_type": "manual", "server_roles": None, "frequency": "monthly", "is_active": True},
    {"id": "hc-10", "category": "Security", "name": "Windows Updates Status", "description": "Check pending Windows updates", "check_type": "manual", "server_roles": None, "frequency": "monthly", "is_active": True},
    {"id": "hc-11", "category": "Security", "name": "Certificate Expiry Check", "description": "Check SSL/TLS certificate expiry", "check_type": "manual", "server_roles": None, "frequency": "monthly", "is_active": True},
    {"id": "hc-12", "category": "Security", "name": "Antivirus Definitions", "description": "Verify AV definitions are current", "check_type": "manual", "server_roles": None, "frequency": "weekly", "is_active": True},
    {"id": "hc-13", "category": "Performance", "name": "CPU Usage Trends", "description": "Review CPU usage patterns", "check_type": "manual", "server_roles": None, "frequency": "monthly", "is_active": True},
    {"id": "hc-14", "category": "Performance", "name": "Memory Usage Trends", "description": "Review memory usage patterns", "check_type": "manual", "server_roles": None, "frequency": "monthly", "is_active": True},
    {"id": "hc-15", "category": "Performance", "name": "Event Log Errors Review", "description": "Review critical event log errors", "check_type": "manual", "server_roles": None, "frequency": "monthly", "is_active": True},
    {"id": "hc-16", "category": "Hyper-V", "name": "VM Snapshot Cleanup", "description": "Remove old VM snapshots", "check_type": "manual", "server_roles": ["hypervisor"], "frequency": "monthly", "is_active": True},
    {"id": "hc-17", "category": "Hyper-V", "name": "Hyper-V Replication Status", "description": "Check VM replication health", "check_type": "manual", "server_roles": ["hypervisor"], "frequency": "monthly", "is_active": True},
    {"id": "hc-18", "category": "Hardware", "name": "Firmware Version Check", "description": "Check for firmware updates", "check_type": "manual", "server_roles": ["physical"], "frequency": "quarterly", "is_active": True},
]

@api_router.get("/health-checks/templates", response_model=List[HealthCheckTemplateResponse])
async def get_health_check_templates(user: dict = Depends(get_current_user)):
    return [HealthCheckTemplateResponse(**t) for t in HEALTH_CHECK_TEMPLATES]

@api_router.get("/health-checks/server/{server_id}", response_model=List[HealthCheckResponse])
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
            # Fetch clients
            clients_resp = await http_client.get(f"{api_url}/clients/", headers=headers, timeout=30.0)
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
                else:
                    code = client_name[:10].upper().replace(" ", "")
                    existing_code = await db.clients.find_one({"code": code})
                    if existing_code:
                        code = f"{code}{client_id}"
                    
                    new_client = {
                        "id": str(uuid.uuid4()),
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
                sites_resp = await http_client.get(f"{api_url}/clients/{client_id}/sites/", headers=headers, timeout=30.0)
                if sites_resp.status_code == 200:
                    trmm_sites = sites_resp.json()
                    local_client = await db.clients.find_one({"tactical_rmm_client_id": client_id})
                    
                    for trmm_site in trmm_sites:
                        site_id = trmm_site.get("id")
                        site_name = trmm_site.get("name", "Default Site")
                        
                        existing_site = await db.sites.find_one({"tactical_rmm_site_id": site_id})
                        if existing_site:
                            await db.sites.update_one(
                                {"tactical_rmm_site_id": site_id},
                                {"$set": {"name": site_name}}
                            )
                        else:
                            new_site = {
                                "id": str(uuid.uuid4()),
                                "client_id": local_client["id"],
                                "name": site_name,
                                "tactical_rmm_site_id": site_id,
                                "is_active": True,
                                "created_at": datetime.now(timezone.utc).isoformat()
                            }
                            await db.sites.insert_one(new_site)
                        stats["sites_synced"] += 1
            
            # Fetch agents
            agents_resp = await http_client.get(f"{api_url}/agents/", headers=headers, timeout=30.0)
            if agents_resp.status_code == 200:
                trmm_agents = agents_resp.json()
                
                for agent in trmm_agents:
                    agent_id = agent.get("agent_id")
                    hostname = agent.get("hostname", "Unknown")
                    site_name = agent.get("site_name")
                    client_name = agent.get("client_name")
                    
                    local_client = await db.clients.find_one({"name": client_name})
                    if not local_client:
                        continue
                    
                    local_site = await db.sites.find_one({"client_id": local_client["id"], "name": site_name})
                    if not local_site:
                        local_site = await db.sites.find_one({"client_id": local_client["id"]})
                    if not local_site:
                        continue
                    
                    existing_server = await db.servers.find_one({"tactical_rmm_agent_id": agent_id})
                    server_data = {
                        "hostname": hostname,
                        "ip_address": agent.get("public_ip") or agent.get("local_ips", [None])[0] if agent.get("local_ips") else None,
                        "operating_system": agent.get("operating_system"),
                        "status": "online" if agent.get("status") == "online" else "offline",
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }
                    
                    if existing_server:
                        await db.servers.update_one({"tactical_rmm_agent_id": agent_id}, {"$set": server_data})
                    else:
                        server_data.update({
                            "id": str(uuid.uuid4()),
                            "site_id": local_site["id"],
                            "tactical_rmm_agent_id": agent_id,
                            "server_type": "virtual",
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

# ==================== SOPHIE AI ====================

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

# Include the router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
