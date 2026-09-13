import pytest
import pytest_asyncio
from datetime import datetime, timedelta
import mongomock_motor
from motor.motor_asyncio import AsyncIOMotorClient

from app.services.v2_cards.generation_service import recover_stale_jobs
import asyncio

@pytest_asyncio.fixture(scope="session")
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest_asyncio.fixture(scope="function")
async def mock_db():
    client = mongomock_motor.AsyncMongoMockClient()
    db = client["primeidpro_test"]
    yield db

@pytest.mark.asyncio
async def test_recovery_stale_job(mock_db):
    stale_time = datetime.utcnow() - timedelta(minutes=10)
    
    # 1. Stale job (PROCESSING, old heartbeat)
    await mock_db.v2_card_jobs.insert_one({
        "job_id": "job-stale",
        "status": "PROCESSING",
        "heartbeat_at": stale_time
    })
    
    # 2. Fresh job (PROCESSING, recent heartbeat)
    await mock_db.v2_card_jobs.insert_one({
        "job_id": "job-fresh",
        "status": "PROCESSING",
        "heartbeat_at": datetime.utcnow()
    })
    
    # 3. Missing heartbeat but old started_at
    await mock_db.v2_card_jobs.insert_one({
        "job_id": "job-missing-hb",
        "status": "PROCESSING",
        "started_at": stale_time
    })
    
    # 4. Completed job (Should be ignored even if old)
    await mock_db.v2_card_jobs.insert_one({
        "job_id": "job-completed",
        "status": "COMPLETED",
        "heartbeat_at": stale_time
    })

    # Run recovery
    await recover_stale_jobs(mock_db)
    
    stale = await mock_db.v2_card_jobs.find_one({"job_id": "job-stale"})
    assert stale["status"] == "FAILED"
    assert "error_summary" in stale
    
    missing = await mock_db.v2_card_jobs.find_one({"job_id": "job-missing-hb"})
    assert missing["status"] == "FAILED"
    
    fresh = await mock_db.v2_card_jobs.find_one({"job_id": "job-fresh"})
    assert fresh["status"] == "PROCESSING"
    
    completed = await mock_db.v2_card_jobs.find_one({"job_id": "job-completed"})
    assert completed["status"] == "COMPLETED"

@pytest.mark.asyncio
async def test_recovery_atomic(mock_db):
    stale_time = datetime.utcnow() - timedelta(minutes=10)
    
    await mock_db.v2_card_jobs.insert_one({
        "job_id": "job-atomic",
        "status": "PROCESSING",
        "heartbeat_at": stale_time
    })
    
    # Simulate worker completing job right before recovery
    await mock_db.v2_card_jobs.update_one(
        {"job_id": "job-atomic"},
        {"$set": {"status": "COMPLETED"}}
    )
    
    # Run recovery
    await recover_stale_jobs(mock_db)
    
    # Should STILL be COMPLETED, not FAILED
    job = await mock_db.v2_card_jobs.find_one({"job_id": "job-atomic"})
    assert job["status"] == "COMPLETED"
