import re

with open('tests/test_v2_cards.py', 'r', encoding='utf-8') as f:
    content = f.read()

idx = content.find('@pytest.mark.asyncio\nasync def test_v2_generation_job_creation')
if idx != -1:
    content = content[:idx]

new_test = """
@pytest.mark.asyncio
async def test_v2_generation_job_creation(async_client: AsyncClient):
    ORG_A_TOKEN = "Bearer org_a_user"
    ORG_B_TOKEN = "Bearer org_b_user"
    
    # Setup test project and records
    db = mock_db_client["primeidpro_test"]
    
    # 1. Project for Org A
    await db.v2_card_projects.insert_one({
        "id": "proj-gen-1",
        "organization_id": "orga",
        "name": "Generation Project",
        "template_snapshot": {
            "width": 85.6,
            "height": 53.98,
            "elements": [{"type": "text", "bind": "name"}]
        }
    })
    
    # 2. Records for Org A
    await db.v2_card_records.insert_many([
        {"id": "rec-gen-1", "organization_id": "orga", "project_id": "proj-gen-1", "status": "ready", "data": {"name": "Test 1"}},
        {"id": "rec-gen-2", "organization_id": "orga", "project_id": "proj-gen-1", "status": "ready", "data": {"name": "Test 2"}},
        {"id": "rec-gen-draft", "organization_id": "orga", "project_id": "proj-gen-1", "status": "draft", "data": {"name": "Draft"}}
    ])
    
    # 3. Request Job
    payload = {
        "record_ids": ["rec-gen-1", "rec-gen-2", "rec-gen-draft"],
        "layout": {
            "paper": "A4",
            "orientation": "portrait",
            "margin_top_mm": 5,
            "margin_right_mm": 5,
            "margin_bottom_mm": 5,
            "margin_left_mm": 5,
            "gap_x_mm": 2,
            "gap_y_mm": 2
        }
    }
    
    # Unauthenticated -> 401
    res_unauth = await async_client.post("/api/v2/cards/projects/proj-gen-1/generation-jobs", json=payload)
    assert res_unauth.status_code == 401
    
    # Org B trying to generate Org A project -> 404
    res_b = await async_client.post("/api/v2/cards/projects/proj-gen-1/generation-jobs", headers={"Authorization": ORG_B_TOKEN}, json=payload)
    assert res_b.status_code == 404
    
    # Org A success
    res_a = await async_client.post("/api/v2/cards/projects/proj-gen-1/generation-jobs", headers={"Authorization": ORG_A_TOKEN}, json=payload)
    assert res_a.status_code == 200
    job_id = res_a.json()["job_id"]
    
    # 4. Check Job progress
    res_job = await async_client.get(f"/api/v2/cards/generation-jobs/{job_id}", headers={"Authorization": ORG_A_TOKEN})
    assert res_job.status_code == 200
    assert res_job.json()["total"] == 3
"""

with open('tests/test_v2_cards.py', 'w', encoding='utf-8') as f:
    f.write(content + new_test)
