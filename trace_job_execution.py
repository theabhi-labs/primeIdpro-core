import sys
import os
import traceback
import asyncio

sys.path.insert(0, r"c:\Users\Abhishek  Yadav\OneDrive\Desktop\primeIdpro-core\backend")

from app.api.v1.print_studio import jobs_db, execute_print_job, PrintJob, PrintDocument

# Reconstruct job dee76a9c-9e61-4af2-950c-320ae9388e94
job_id = "dee76a9c-9e61-4af2-950c-320ae9388e94"
doc_data = [
    {'id': 'd7f6c325-851f-4ab2-8729-0fde47c93dec', 'fileUrl': '/uploads/d7f6c325-851f-4ab2-8729-0fde47c93dec.jpg', 'fileType': 'image', 'jobType': 'id-card', 'docTypeLabel': 'ID Card', 'extractedCode': None, 'extractedText': '', 'side': 'front', 'groupId': '9b1e1d4d', 'status': 'matched', 'isDarkPage': False, 'pageCount': 1, 'lowConfidenceCrop': False},
    {'id': 'b26f58c1-b3b1-4647-a942-095a7a419076', 'fileUrl': '/uploads/b26f58c1-b3b1-4647-a942-095a7a419076.jpg', 'fileType': 'image', 'jobType': 'id-card', 'docTypeLabel': 'ID Card', 'extractedCode': None, 'extractedText': '', 'side': 'front', 'groupId': '330ff019', 'status': 'matched', 'isDarkPage': False, 'pageCount': 1, 'lowConfidenceCrop': False}
]

job = PrintJob(id=job_id, customerLabel="ID Card Print", status="pending-review", combineMode="side-by-side", documents=[PrintDocument(**d) for d in doc_data])
jobs_db[job_id] = job

async def run():
    try:
        res = await execute_print_job(job_id)
        print("execute_print_job succeeded:", res)
    except Exception as e:
        print("EXCEPTION CAUGHT IN execute_print_job:")
        traceback.print_exc()

asyncio.run(run())
