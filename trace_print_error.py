import sys
import traceback

sys.path.insert(0, r"c:\Users\Abhishek  Yadav\OneDrive\Desktop\primeIdpro-core\backend")

from app.api.v1.print_studio import jobs_db, execute_print_job
import asyncio

async def test():
    try:
        # Check if job exists in memory
        print(f"Jobs in jobs_db: {list(jobs_db.keys())}")
        jid = list(jobs_db.keys())[0] if jobs_db else None
        if jid:
            await execute_print_job(jid)
    except Exception as e:
        print("EXCEPTION CAUGHT:")
        traceback.print_exc()

asyncio.run(test())
