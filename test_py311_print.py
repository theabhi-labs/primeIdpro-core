import os
import sys
import traceback

sys.path.insert(0, r"c:\Users\Abhishek  Yadav\OneDrive\Desktop\primeIdpro-core\backend")
from app.services.printer_service import print_file, get_default_printer
from app.services.print_layout_service import generate_single_print

UPLOAD_DIR = r"c:\Users\Abhishek  Yadav\OneDrive\Desktop\primeIdpro-core\backend\uploads"
p_name = get_default_printer()
print(f"Default printer: {p_name}")

test_img_path = os.path.join(UPLOAD_DIR, "test_job_311.jpg")
sample_files = [f for f in os.listdir(UPLOAD_DIR) if f.endswith(('.jpg', '.png'))]
if sample_files:
    src_file = os.path.join(UPLOAD_DIR, sample_files[0])
    generate_single_print(src_file, test_img_path, is_id_card=False)
    print(f"Generated single print canvas at: {test_img_path}")
    
    try:
        result = print_file(test_img_path, p_name)
        print(f"Result of print_file in Python 3.11: {result}")
    except Exception as e:
        print("EXCEPTION IN PYTHON 3.11:")
        traceback.print_exc()
