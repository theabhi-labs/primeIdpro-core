import os
import time
import logging
from typing import Dict, Any

logger = logging.getLogger("primeidpro.cards.sync")

# Absolute path to template store
TEMPLATES_ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "templates", "cards")

async def sync_templates_from_web() -> Dict[str, Any]:
    """
    Mock implementation of syncing templates from the Web API.
    In a real implementation, this would:
    1. Read the auth token from auth_store.json
    2. Make a GET request to the Web API
    3. Download ZIP or JSON payloads
    4. Save/extract them into TEMPLATES_ROOT
    """
    logger.info("Starting Template Sync from Web...")
    
    # Simulate network delay
    time.sleep(1.5)
    
    # Mock data that would have been downloaded
    new_template_id = "synced-corporate-v1"
    new_template_dir = os.path.join(TEMPLATES_ROOT, new_template_id)
    
    if not os.path.exists(new_template_dir):
        os.makedirs(new_template_dir, exist_ok=True)
        
        # Write dummy template files to show it worked
        with open(os.path.join(new_template_dir, "template.json"), "w", encoding="utf-8") as f:
            f.write('''{
  "id": "synced-corporate-v1",
  "name": "Corporate Sync Premium",
  "category": "corporate",
  "version": "1.0.0",
  "scalable": true,
  "size": {
    "width": 53.98,
    "height": 85.60,
    "unit": "mm",
    "orientation": "vertical"
  },
  "sides": ["front"],
  "fields": [
    {"id": "name", "label": "Full Name", "type": "text", "required": true},
    {"id": "employeeId", "label": "Employee ID", "type": "text", "required": true},
    {"id": "department", "label": "Department", "type": "text", "required": false}
  ]
}''')
            
        with open(os.path.join(new_template_dir, "template.html"), "w", encoding="utf-8") as f:
            f.write('''<style>
  .card-container {
    width: 100cqw;
    height: 100cqh;
    background: linear-gradient(135deg, #1e293b, #0f172a);
    color: white;
    font-family: sans-serif;
    position: relative;
    border-radius: 4cqw;
    overflow: hidden;
  }
  .header {
    height: 25cqh;
    background: {{ organization.themeColor | default('#2563eb') }};
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 6cqw;
    font-weight: bold;
  }
  .photo {
    width: 35cqw;
    height: 45cqw;
    background-color: white;
    border: 1cqw solid white;
    border-radius: 2cqw;
    margin: 5cqh auto;
    background-image: url('{{ photo }}');
    background-size: cover;
    background-position: center;
  }
  .name {
    text-align: center;
    font-size: 5.5cqw;
    font-weight: bold;
    margin-bottom: 2cqh;
  }
  .dept {
    text-align: center;
    font-size: 4cqw;
    color: #cbd5e1;
  }
  .synced-badge {
    position: absolute;
    bottom: 2cqw;
    right: 2cqw;
    font-size: 3cqw;
    color: #10b981;
  }
</style>
<div class="card-container">
  <div class="header">{{ organization.name | uppercase }}</div>
  <div class="photo"></div>
  <div class="name">{{ name | uppercase }}</div>
  <div class="dept">{{ department | titlecase }}</div>
  <div class="dept">ID: {{ employeeId }}</div>
  <div class="synced-badge">⚡ Cloud Synced</div>
</div>''')

    return {
        "success": True,
        "message": "Templates synced successfully.",
        "downloaded_count": 1
    }
