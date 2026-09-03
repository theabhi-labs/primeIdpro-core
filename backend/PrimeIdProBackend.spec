# -*- mode: python ; coding: utf-8 -*-
import os
import sys
from PyInstaller.utils.hooks import collect_all

datas = [('app', 'app'), ('models', 'models')]
binaries = []
hiddenimports = [
    'motor.motor_asyncio', 'pymongo', 'beanie',
    'uvicorn.logging', 'uvicorn.loops', 'uvicorn.loops.auto',
    'uvicorn.protocols', 'uvicorn.protocols.http', 'uvicorn.protocols.http.auto',
    'uvicorn.protocols.websockets', 'uvicorn.protocols.websockets.auto',
    'uvicorn.lifespans', 'uvicorn.lifespans.auto',
    'app', 'app.main', 'app.core', 'app.core.config', 'app.core.database',
    'app.core.cascade', 'app.core.state', 'app.middleware', 'app.api',
    'app.services', 'pydantic_settings'
]

for pkg in ['motor', 'pymongo', 'beanie', 'cv2', 'mediapipe', 'rembg', 'uvicorn', 'onnxruntime', 'fastapi', 'pydantic', 'pydantic_settings']:
    try:
        tmp_ret = collect_all(pkg)
        datas += tmp_ret[0]
        binaries += tmp_ret[1]
        hiddenimports += tmp_ret[2]
    except Exception as e:
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
    excludes=[],
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

