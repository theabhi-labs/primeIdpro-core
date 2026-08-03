const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let backendProcess = null;
let mainWindow = null;

// Path to backend executable (relative to the final installer location)
function getBackendPath() {
    // In development: points to backend/dist/myapp-backend.exe
    // In production: the backend exe will be copied next to the Electron app
    if (app.isPackaged) {
        return path.join(process.resourcesPath, 'backend', 'myapp-backend.exe');
    } else {
        return path.join(__dirname, '..', 'backend', 'dist', 'myapp-backend.exe');
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
        icon: path.join(__dirname, 'icon.ico'), // optional: add an icon
    });

    // Load the built React app
    let frontendPath;
    if (app.isPackaged) {
        frontendPath = path.join(process.resourcesPath, 'frontend', 'index.html');
    } else {
        frontendPath = path.join(__dirname, '..', 'frontend', 'build', 'index.html');
    }
    mainWindow.loadFile(frontendPath);

    // Open DevTools for debugging (remove for production)
    // mainWindow.webContents.openDevTools();

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function startBackend() {
    const backendPath = getBackendPath();
    if (!fs.existsSync(backendPath)) {
        console.error('Backend executable not found at:', backendPath);
        return;
    }

    backendProcess = spawn(backendPath, [], {
        stdio: 'pipe',
        detached: false,
    });

    backendProcess.stdout.on('data', (data) => {
        console.log(`Backend: ${data}`);
    });
    backendProcess.stderr.on('data', (data) => {
        console.error(`Backend error: ${data}`);
    });
    backendProcess.on('close', (code) => {
        console.log(`Backend process exited with code ${code}`);
    });
}

app.whenReady().then(() => {
    startBackend();
    createWindow();
});

app.on('window-all-closed', () => {
    if (backendProcess) {
        backendProcess.kill();
    }
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});