import logging
from typing import Optional, Any
from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings

logger = logging.getLogger("primeidpro.database")


class Database:
    client: Optional[AsyncIOMotorClient] = None
    db_name: str = settings.mongodb_db_name

    async def connect(self):
        try:
            logger.info(f"Connecting to MongoDB at {settings.mongodb_url}...")
            self.client = AsyncIOMotorClient(
                settings.mongodb_url,
                serverSelectionTimeoutMS=2000,
                connectTimeoutMS=2000,
            )
            await self.client.admin.command("ping")
            logger.info(f"✅ Connected to MongoDB ({self.db_name})")
            db_inst = self.get_database()
            from beanie import init_beanie
            from app.models.user import User
            from app.models.subscription import Subscription
            await init_beanie(database=db_inst, document_models=[User, Subscription])
            logger.info("✅ Beanie ODM initialized with User & Subscription document models")
            await self._create_indexes(db_inst)
            return db_inst
        except Exception as e:
            logger.error(f"❌ MongoDB connection failed: {e}")
            logger.warning("⚠️ Save/Project endpoints will return 503 until MongoDB is reachable")
            self.client = None
            return None

    async def disconnect(self):
        if self.client:
            self.client.close()
            logger.info("Disconnected from MongoDB")
            self.client = None

    def get_database(self):
        if self.client:
            return self.client[self.db_name]
        return None

    async def _create_indexes(self, db):
        try:
            import pymongo
            await db.v2_card_templates.create_index([("organization_id", pymongo.ASCENDING)])
            await db.v2_card_projects.create_index([("id", pymongo.ASCENDING), ("organization_id", pymongo.ASCENDING)])
            await db.v2_card_records.create_index([("project_id", pymongo.ASCENDING), ("organization_id", pymongo.ASCENDING)])
            await db.v2_collection_links.create_index([("token_hash", pymongo.ASCENDING)], unique=True)
            await db.v2_collection_links.create_index([("project_id", pymongo.ASCENDING)])
            await db.v2_card_jobs.create_index([("status", pymongo.ASCENDING), ("heartbeat_at", pymongo.ASCENDING)])
            logger.info("✅ V2 MongoDB indexes verified")
        except Exception as e:
            logger.error(f"❌ Failed to create V2 indexes: {e}")

db = Database()