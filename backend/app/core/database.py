from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

class Database:
    client: AsyncIOMotorClient = None
    
    async def connect(self):
        try:
            # MongoDB Atlas connection
            connection_string = settings.mongodb_url
            
            logger.info(f"Connecting to MongoDB Atlas...")
            
            # Create client with proper options
            self.client = AsyncIOMotorClient(
                connection_string,
                serverSelectionTimeoutMS=5000,  # 5 second timeout
                connectTimeoutMS=5000,
                retryWrites=True,
                w='majority'
            )
            
            # Test connection
            await self.client.admin.command('ping')
            logger.info(f"✅ Connected to MongoDB Atlas")
            
            # Initialize Beanie with models
            from app.models.image import Image
            from app.models.sheet import Sheet
            from app.models.session import Session
            
            await init_beanie(
                database=self.client[settings.mongodb_db_name],
                document_models=[Image, Sheet, Session]
            )
            
            logger.info(f"✅ Beanie initialized with database: {settings.mongodb_db_name}")
            return True
            
        except Exception as e:
            logger.error(f"❌ MongoDB connection error: {e}")
            logger.warning("⚠️ Starting without database...")
            self.client = None
            return False
    
    async def disconnect(self):
        if self.client:
            self.client.close()
            logger.info("✅ Disconnected from MongoDB")
    
    async def get_database(self):
        if self.client:
            return self.client[settings.mongodb_db_name]
        return None

# Create database instance
db = Database()