// electron/src/network/apiClient.js
const https = require("https");
const config = require("../config");
const logger = require("../logging/logger");
const appIdentity = require("../identity/appIdentity");

class ApiClient {
    constructor() {
        this.baseUrl = config.REMOTE_API_BASE_URL;
        this.agent = new https.Agent({
            keepAlive: true,
            timeout: 30000
        });
    }

    setBaseUrl(newUrl) {
        if (newUrl) {
            this.baseUrl = newUrl;
        }
    }

    async request({
        endpoint,
        method = "GET",
        data = null,
        headers = {},
        timeout = 30000,
        idempotencyKey = null,
        deviceCredential = null,
        deviceId = null,
        retries = 2
    }) {
        const url = endpoint.startsWith("http") ? endpoint : `${this.baseUrl}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
        const installationId = appIdentity.getInstallationId();

        // Lazy load deviceManager to prevent circular dependency
        let token = deviceCredential;
        let dId = deviceId;
        if (!token || !dId) {
            try {
                const { deviceManager } = require("../device/deviceManager");
                const status = deviceManager.getDeviceStatus();
                if (!token) token = deviceManager.getDecryptedCredential();
                if (!dId) dId = status.deviceId;
            } catch (err) {
                // Ignore fallback
            }
        }

        const requestHeaders = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-Installation-Id": installationId,
            "X-Installation-ID": installationId,
            "X-App-Version": config.APP_VERSION,
            ...headers
        };

        if (dId) {
            requestHeaders["X-Device-Id"] = dId;
        }

        if (token) {
            requestHeaders["X-Device-Token"] = token;
            requestHeaders["Authorization"] = `Bearer ${token}`;
        }

        if (idempotencyKey) {
            requestHeaders["X-Idempotency-Key"] = idempotencyKey;
        }

        let attempt = 0;
        let delay = 1000;

        while (attempt <= retries) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeout);

                logger.info("API_REQUEST_START", { method, endpoint, attempt });

                const response = await fetch(url, {
                    method,
                    headers: requestHeaders,
                    body: data ? JSON.stringify(data) : undefined,
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                const responseData = await response.json().catch(() => null);

                if (response.ok) {
                    logger.info("API_REQUEST_SUCCESS", { method, endpoint, status: response.status });
                    return { success: true, status: response.status, data: responseData?.data || responseData };
                }

                // Fatal client errors (do not retry)
                if ([400, 401, 403, 404, 409, 410, 422].includes(response.status)) {
                    logger.warn("API_CLIENT_ERROR_NO_RETRY", { method, endpoint, status: response.status, data: responseData });
                    return {
                        success: false,
                        status: response.status,
                        error: responseData?.message || responseData?.error || `HTTP ${response.status}`,
                        data: responseData?.data || responseData
                    };
                }

                // Server errors (5xx) - retryable
                logger.warn("API_SERVER_ERROR_RETRYABLE", { method, endpoint, status: response.status, attempt });
            } catch (err) {
                const isAbort = err.name === "AbortError";
                logger.warn("API_REQUEST_FAILED", { method, endpoint, error: isAbort ? "Timeout" : err.message, attempt });
            }

            attempt++;
            if (attempt <= retries) {
                await new Promise(r => setTimeout(r, delay));
                delay = Math.min(delay * 2, 10000);
            }
        }

        return { success: false, error: "Network request failed after retries" };
    }

    async post(endpoint, data, options = {}) {
        return this.request({ endpoint, method: "POST", data, ...options });
    }

    async get(endpoint, options = {}) {
        return this.request({ endpoint, method: "GET", ...options });
    }
}

const apiClient = new ApiClient();
module.exports = apiClient;
