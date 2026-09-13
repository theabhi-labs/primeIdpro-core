import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
import sys
import os
from mongomock_motor import AsyncMongoMockClient

# Ensure app is in path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.main import app
from app.core.dependencies import get_db_instance
from app.core.config import settings

ORG_A_TOKEN = "Bearer usera:orga"
ORG_B_TOKEN = "Bearer userb:orgb"

mock_db_client = AsyncMongoMockClient()
def override_get_db_instance():
    return mock_db_client["primeidpro_test"]

app.dependency_overrides[get_db_instance] = override_get_db_instance

@pytest_asyncio.fixture(scope="function")
async def async_client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac

# --- AUTHENTICATION ---
@pytest.mark.asyncio
async def test_no_auth_header(async_client: AsyncClient):
    response = await async_client.get("/api/v2/cards/templates")
    assert response.status_code == 401

@pytest.mark.asyncio
async def test_invalid_auth_header(async_client: AsyncClient):
    response = await async_client.get("/api/v2/cards/templates", headers={"Authorization": "Bearer invalidtoken"})
    assert response.status_code == 401

@pytest.mark.asyncio
async def test_production_auth_rejection(async_client: AsyncClient):
    old_env = settings.environment
    settings.environment = "production"
    try:
        response = await async_client.get("/api/v2/cards/templates", headers={"Authorization": ORG_A_TOKEN})
        assert response.status_code == 401
    finally:
        settings.environment = old_env

# --- TEMPLATES & VALIDATION ---
@pytest.mark.asyncio
async def test_template_invalid_bind(async_client: AsyncClient):
    template_data = {
        "name": "Invalid Bind Template",
        "elements": [{"type": "text", "x": 0, "y": 0, "width": 10, "height": 10, "bind": "missing_field"}],
        "field_schema": []
    }
    response = await async_client.post("/api/v2/cards/templates", json=template_data, headers={"Authorization": ORG_A_TOKEN})
    assert response.status_code == 422
    assert "does not match" in response.json()["detail"]

@pytest.mark.asyncio
async def test_template_valid(async_client: AsyncClient):
    template_data = {
        "name": "Valid Template",
        "elements": [{"type": "text", "x": 0, "y": 0, "width": 10, "height": 10, "bind": "name"}],
        "field_schema": [
            {"key": "name", "label": "Name", "data_type": "text", "required": True},
            {"key": "email", "label": "Email", "data_type": "email", "required": False}
        ]
    }
    response = await async_client.post("/api/v2/cards/templates", json=template_data, headers={"Authorization": ORG_A_TOKEN})
    assert response.status_code == 200
    return response.json()["id"]

# --- TENANT ISOLATION ---
@pytest.mark.asyncio
async def test_tenant_isolation_all(async_client: AsyncClient):
    template_id = await test_template_valid(async_client)
    
    # 1. Template
    res = await async_client.get(f"/api/v2/cards/templates/{template_id}", headers={"Authorization": ORG_B_TOKEN})
    assert res.status_code == 404
    
    # 2. Project
    proj_data = {"name": "Proj A", "template_id": template_id}
    res = await async_client.post("/api/v2/cards/projects", json=proj_data, headers={"Authorization": ORG_A_TOKEN})
    assert res.status_code == 200
    proj_id = res.json()["id"]
    
    res = await async_client.get(f"/api/v2/cards/projects/{proj_id}", headers={"Authorization": ORG_B_TOKEN})
    assert res.status_code == 404
    
    # 3. Record
    rec_data = {"project_id": proj_id, "data": {"name": "test"}}
    res = await async_client.post(f"/api/v2/cards/projects/{proj_id}/records", json=rec_data, headers={"Authorization": ORG_A_TOKEN})
    assert res.status_code == 200
    rec_id = res.json()["id"]
    
    res = await async_client.get(f"/api/v2/cards/projects/{proj_id}/records", headers={"Authorization": ORG_B_TOKEN})
    assert res.status_code == 404 # Project not found
    
    # 4. Collection Link
    res = await async_client.post(f"/api/v2/cards/projects/{proj_id}/collection-links", json={"max_submissions": 5}, headers={"Authorization": ORG_A_TOKEN})
    assert res.status_code == 200
    link_id = res.json()["id"]
    
    res = await async_client.post(f"/api/v2/cards/collection-links/{link_id}/revoke", headers={"Authorization": ORG_B_TOKEN})
    assert res.status_code == 404

# --- PROJECT SNAPSHOT MUTATION ---
@pytest.mark.asyncio
async def test_project_snapshot_mutation(async_client: AsyncClient):
    template_id = await test_template_valid(async_client)
    proj_data = {"name": "Proj Snap", "template_id": template_id}
    res = await async_client.post("/api/v2/cards/projects", json=proj_data, headers={"Authorization": ORG_A_TOKEN})
    proj_id = res.json()["id"]
    
    # Ensure snapshot copied it
    assert len(res.json()["field_schema"]) == 2

# --- RECORDS VALIDATION ---
@pytest.mark.asyncio
async def test_record_validation(async_client: AsyncClient):
    template_id = await test_template_valid(async_client)
    res = await async_client.post("/api/v2/cards/projects", json={"name": "Proj V", "template_id": template_id}, headers={"Authorization": ORG_A_TOKEN})
    proj_id = res.json()["id"]
    
    # Missing required
    res = await async_client.post(f"/api/v2/cards/projects/{proj_id}/records", json={"data": {}, "status": "ready"}, headers={"Authorization": ORG_A_TOKEN})
    assert res.status_code == 422
    assert "missing" in res.json()["detail"].lower()
    
    # Unknown field
    res = await async_client.post(f"/api/v2/cards/projects/{proj_id}/records", json={"data": {"name": "Test", "unknown": "x"}, "status": "ready"}, headers={"Authorization": ORG_A_TOKEN})
    assert res.status_code == 422
    assert "unknown" in res.json()["detail"].lower()
    
    # Wrong Data Type
    res = await async_client.post(f"/api/v2/cards/projects/{proj_id}/records", json={"data": {"name": 123}, "status": "ready"}, headers={"Authorization": ORG_A_TOKEN})
    assert res.status_code == 422
    assert "must be text" in res.json()["detail"].lower()
    
    # Invalid Email
    res = await async_client.post(f"/api/v2/cards/projects/{proj_id}/records", json={"data": {"name": "T", "email": "invalid"}, "status": "ready"}, headers={"Authorization": ORG_A_TOKEN})
    assert res.status_code == 422
    assert "valid email" in res.json()["detail"].lower()

@pytest.mark.asyncio
async def test_record_pagination(async_client: AsyncClient):
    template_id = await test_template_valid(async_client)
    res = await async_client.post("/api/v2/cards/projects", json={"name": "Proj P", "template_id": template_id}, headers={"Authorization": ORG_A_TOKEN})
    proj_id = res.json()["id"]
    
    for i in range(5):
        await async_client.post(f"/api/v2/cards/projects/{proj_id}/records", json={"data": {"name": f"Test {i}"}}, headers={"Authorization": ORG_A_TOKEN})
        
    res = await async_client.get(f"/api/v2/cards/projects/{proj_id}/records?limit=2&skip=1", headers={"Authorization": ORG_A_TOKEN})
    assert res.status_code == 200
    assert len(res.json()["records"]) == 2
    
    # Pagination max
    res = await async_client.get(f"/api/v2/cards/projects/{proj_id}/records?limit=200", headers={"Authorization": ORG_A_TOKEN})
    assert res.status_code == 422 # limit le=100

# --- COLLECTION LINKS ---
@pytest.mark.asyncio
async def test_collection_link_public(async_client: AsyncClient):
    template_id = await test_template_valid(async_client)
    res = await async_client.post("/api/v2/cards/projects", json={"name": "Proj C", "template_id": template_id}, headers={"Authorization": ORG_A_TOKEN})
    proj_id = res.json()["id"]
    
    res = await async_client.post(f"/api/v2/cards/projects/{proj_id}/collection-links", json={"max_submissions": 2}, headers={"Authorization": ORG_A_TOKEN})
    token = res.json()["token"]
    link_id = res.json()["id"]
    
    # Can read schema (Phase 3B introduced GET for schema)
    res = await async_client.get(f"/api/v2/cards/collection/{token}")
    assert res.status_code == 200
    assert "fields" in res.json()
    
    # Valid token submission
    res = await async_client.post(f"/api/v2/cards/collection/{token}", json={"name": "Sub 1"})
    assert res.status_code == 200
    assert "reference" in res.json()
    assert "record_id" not in res.json()
    
    # Valid token submission 2
    res = await async_client.post(f"/api/v2/cards/collection/{token}", json={"name": "Sub 2"})
    assert res.status_code == 200
    
    # Max submissions
    res = await async_client.post(f"/api/v2/cards/collection/{token}", json={"name": "Sub 3"})
    assert res.status_code == 403
    
    # Invalid token
    res = await async_client.post("/api/v2/cards/collection/invalid", json={"name": "Sub"})
    assert res.status_code == 404
    
    # Revoke token
    res = await async_client.post(f"/api/v2/cards/projects/{proj_id}/collection-links", json={}, headers={"Authorization": ORG_A_TOKEN})
    token2 = res.json()["token"]
    link_id2 = res.json()["id"]
    await async_client.post(f"/api/v2/cards/projects/{proj_id}/collection-links/{link_id2}/revoke", headers={"Authorization": ORG_A_TOKEN})
    
    res = await async_client.post(f"/api/v2/cards/collection/{token2}", json={"name": "Sub"})
    assert res.status_code == 403
    assert "revoked" in res.json()["detail"].lower()
