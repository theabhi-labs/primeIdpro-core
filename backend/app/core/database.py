import logging
from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings

logger = logging.getLogger("primeidpro.database")


class Database:
    client: AsyncIOMotorClient = None
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
            return self.get_database()
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


db = Database()