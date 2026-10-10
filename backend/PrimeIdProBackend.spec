# -*- mode: python ; coding: utf-8 -*-
import os
import sys
from PyInstaller.utils.hooks import collect_all, collect_dynamic_libs, collect_data_files

datas = [
    ('app/templates', 'app/templates'),
    ('app/metadata.json', 'app'),
    ('models', 'models'),
    ('.env', '.'),
]
binaries = []
hiddenimports = [
    'motor.motor_asyncio', 'pymongo', 'beanie',
    'uvicorn.logging', 'uvicorn.loops', 'uvicorn.loops.auto',
    'uvicorn.protocols', 'uvicorn.protocols.http', 'uvicorn.protocols.http.auto',
    'uvicorn.protocols.websockets', 'uvicorn.protocols.websockets.auto',
    'uvicorn.lifespans', 'uvicorn.lifespans.auto',
    'app', 'app.main', 'app.core', 'app.core.config', 'app.core.database',
    'app.core.cascade', 'app.core.state', 'app.middleware', 'app.api',
    'app.services', 'app.services.background', 'app.services.background.remover',
    'app.services.background.validator', 'app.services.enhancement.matting_utils',
    'pydantic_settings', 'onnxruntime', 'rembg'
]

# Ensure onnxruntime DLLs, rembg data, cv2 cascades, and mediapipe models are collected
for pkg in ['motor', 'pymongo', 'beanie', 'cv2', 'mediapipe', 'rembg', 'uvicorn', 'onnxruntime', 'fastapi', 'pydantic', 'pydantic_settings']:
    try:
        tmp_ret = collect_all(pkg)
        datas += tmp_ret[0]
        binaries += tmp_ret[1]
        hiddenimports += tmp_ret[2]
    except Exception as e:
        pass

# Explicit fallback collection for onnxruntime shared DLLs and binaries
try:
    binaries += collect_dynamic_libs('onnxruntime')
    datas += collect_data_files('onnxruntime')
except Exception:
    pass

a = Analysis(
    ['run_server.py'],
    pathex=['.'],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['matplotlib', 'sympy', 'fitz', 'pymupdf', 'pytesseract', 'tkinter', 'unittest'],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='PrimeIdProBackend',
    icon='icon.ico',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='PrimeIdProBackend',
)
