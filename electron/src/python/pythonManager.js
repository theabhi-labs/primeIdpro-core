// electron/src/python/pythonManager.js
const { app } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const waitOn = require("wait-on");
const config = require("../config");
const logger = require("../logging/logger");

class PythonManager {
    constructor() {
        this.process = null;
        this.isRunning = false;
    }

    getBackendExecutablePath() {
        if (config.isDev) {
            // In dev mode, prefer local Python venv for hot reloading and live code updates
            const venvPy = path.join(__dirname, "..", "..", "..", "backend", ".venv", "Scripts", "python.exe");
            if (fs.existsSync(venvPy)) {
                return { type: "python", path: venvPy, script: path.join(__dirname, "..", "..", "..", "backend", "server.py") };
            }
            // Check if frozen exe exists in dev as a secondary option
            const devExe = path.join(__dirname, "..", "..", "..", "backend", "dist", "PrimeIdProBackend", "PrimeIdProBackend.exe");
            if (fs.existsSync(devExe)) {
                return devExe;
            }
            // Fallback to system python
            return { type: "python", path: "python", script: path.join(__dirname, "..", "..", "..", "backend", "server.py") };
        } else {
            return path.join(process.resourcesPath, "backend", "PrimeIdProBackend.exe");
        }
    }

    async startBackend(maxRetries = 2) {
        let attempt = 0;

        while (attempt <= maxRetries) {
            try {
                logger.info("STARTING_PYTHON_BACKEND", { attempt });
                const backendTarget = this.getBackendExecutablePath();

                let spawnCmd, spawnArgs, spawnCwd;

                if (typeof backendTarget === "object" && backendTarget.type === "python") {
                    spawnCmd = backendTarget.path;
                    spawnArgs = [backendTarget.script];
                    spawnCwd = path.dirname(backendTarget.script);
                } else {
                    spawnCmd = backendTarget;
                    spawnArgs = [];
                    spawnCwd = path.dirname(backendTarget);
                }

                logger.info("SPAWNING_BACKEND", { spawnCmd, spawnArgs });

                this.process = spawn(spawnCmd, spawnArgs, {
                    cwd: spawnCwd,
                    detached: false,
                    windowsHide: true,
                    stdio: "pipe",
                    env: {
                        ...process.env,
                        PORT: String(config.PYTHON_PORT),
                        HOST: config.PYTHON_HOST,
                        PYTHONUNBUFFERED: "1"
                    }
                });

                this.process.stdout.on("data", (data) => {
                    const text = data.toString().trim();
                    if (text) logger.debug("PYTHON_STDOUT", { msg: text.slice(0, 300) });
                });

                this.process.stderr.on("data", (data) => {
                    const text = data.toString().trim();
                    if (text) logger.warn("PYTHON_STDERR", { msg: text.slice(0, 300) });
                });

                this.process.on("exit", (code, signal) => {
                    logger.info("PYTHON_BACKEND_EXITED", { code, signal });
                    this.isRunning = false;
                });

                this.process.on("error", (err) => {
                    logger.error("PYTHON_BACKEND_SPAWN_ERROR", { error: err.message });
                });

                logger.info("WAITING_FOR_BACKEND_HEALTH", { url: config.LOCAL_HEALTH_URL });

                await waitOn({
                    resources: [`http-get://${config.PYTHON_HOST}:${config.PYTHON_PORT}/health`],
                    timeout: 45000,
                    interval: 1000,
                    validateStatus: (status) => status === 200
                });

                this.isRunning = true;
                logger.info("PYTHON_BACKEND_READY");
                return true;
            } catch (err) {
                logger.error("BACKEND_START_ATTEMPT_FAILED", { attempt, error: err.message });
                this.stopBackend();
                attempt++;
                if (attempt <= maxRetries) {
                    await new Promise(r => setTimeout(r, 2000));
                }
            }
        }

        throw new Error("Failed to start Python backend after multiple attempts");
    }

    stopBackend() {
        if (this.process) {
            try {
                logger.info("STOPPING_PYTHON_BACKEND");
                this.process.kill();
            } catch (err) {
                logger.error("BACKEND_KILL_ERROR", { error: err.message });
            }
            this.process = null;
            this.isRunning = false;
        }
    }
}

const pythonManager = new PythonManager();
module.exports = pythonManager;
