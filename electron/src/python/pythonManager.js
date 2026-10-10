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
            // In dev mode, prefer local Python venv (pythonw for zero-console launch)
            const venvPyw = path.join(__dirname, "..", "..", "..", "backend", ".venv", "Scripts", "pythonw.exe");
            const venvPy = path.join(__dirname, "..", "..", "..", "backend", ".venv", "Scripts", "python.exe");
            const pyBinary = fs.existsSync(venvPyw) ? venvPyw : (fs.existsSync(venvPy) ? venvPy : null);
            if (pyBinary) {
                return { type: "python", path: pyBinary, script: path.join(__dirname, "..", "..", "..", "backend", "run_server.py") };
            }
            // Check if frozen exe exists in dev as a secondary option
            const devExe = path.join(__dirname, "..", "..", "..", "backend", "dist", "PrimeIdProBackend", "PrimeIdProBackend.exe");
            if (fs.existsSync(devExe)) {
                return devExe;
            }
            // Fallback to system python
            return { type: "python", path: "pythonw", script: path.join(__dirname, "..", "..", "..", "backend", "run_server.py") };
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
                    windowsHide: false,
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

                await this.pollHealth(45000, 500);

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

    async pollHealth(timeoutMs = 45000, intervalMs = 500) {
        const startTime = Date.now();
        const healthUrl = `http://${config.PYTHON_HOST}:${config.PYTHON_PORT}/health`;
        let lastError = null;

        while (Date.now() - startTime < timeoutMs) {
            if (this.process && this.process.exitCode !== null) {
                throw new Error(`Python process exited prematurely with code ${this.process.exitCode}`);
            }

            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 2000);
                const res = await fetch(healthUrl, { signal: controller.signal });
                clearTimeout(timeoutId);

                if (res.status === 200) {
                    return true;
                }
            } catch (err) {
                lastError = err;
            }

            await new Promise(r => setTimeout(r, intervalMs));
        }

        throw new Error(`Health check timed out after ${timeoutMs}ms (${lastError?.message || 'Connection refused'})`);
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
