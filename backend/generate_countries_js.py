import os
import sys
import json

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.services.resize.presets import COUNTRY_PRESETS

seen_names = set()
countries_list = []

priority_codes = ['in', 'us', 'gb', 'ca', 'au', 'ae', 'sa', 'de', 'fr', 'jp', 'cn', 'sg', 'my', 'nz', 'br', 'ru']

for p_code in priority_codes:
    if p_code in COUNTRY_PRESETS:
        info = COUNTRY_PRESETS[p_code]
        if info['name'] not in seen_names:
            seen_names.add(info['name'])
            size_str = f"{info['width_mm']}x{info['height_mm']} mm"
            if info.get('width_mm') == 50.8:
                size_str = "2x2 inch (51x51 mm)"
            countries_list.append({
                'code': p_code,
                'name': info['name'],
                'size': size_str,
                'standard': size_str,
                'bg': info['bg_color'],
                'iso': info.get('country_code', p_code.upper())
            })

remaining = []
for code, info in COUNTRY_PRESETS.items():
    if info['name'] not in seen_names:
        seen_names.add(info['name'])
        size_str = f"{info['width_mm']}x{info['height_mm']} mm"
        if info.get('width_mm') == 50.8:
            size_str = "2x2 inch (51x51 mm)"
        remaining.append({
            'code': code,
            'name': info['name'],
            'size': size_str,
            'standard': size_str,
            'bg': info['bg_color'],
            'iso': info.get('country_code', code.upper())
        })

remaining.sort(key=lambda x: x['name'])
countries_list.extend(remaining)

out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'frontend', 'src', 'data')
os.makedirs(out_dir, exist_ok=True)
out_file = os.path.join(out_dir, 'countriesData.js')

js_content = '// 195+ Official UN Countries & ICAO 9303 Biometric Standards\nexport const DEFAULT_COUNTRIES_195 = ' + json.dumps(countries_list, indent=2) + ';\n\nexport default DEFAULT_COUNTRIES_195;\n'

with open(out_file, 'w', encoding='utf-8') as f:
    f.write(js_content)

print(f'Successfully generated {out_file} with {len(countries_list)} countries.')
