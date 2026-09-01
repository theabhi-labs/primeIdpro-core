// electron/src/network/apiClient.js
const https = require("https");
const config = require("../config");
const logger = require("../logging/logger");
const appIdentity = require("../identity/appIdentity");

function extractErrorString(responseData, status) {
    if (!responseData) return status ? `HTTP ${status}` : "Network request failed";
    if (typeof responseData === "string") return responseData;
    if (typeof responseData.message === "string" && responseData.message.trim()) return responseData.message;
    if (typeof responseData.error === "string" && responseData.error.trim()) return responseData.error;
    if (responseData.error && typeof responseData.error === "object") {
        if (typeof responseData.error.message === "string") return responseData.error.message;
    }
    if (typeof responseData.detail === "string" && responseData.detail.trim()) return responseData.detail;
    try {
        return JSON.stringify(responseData);
    } catch {
        return status ? `HTTP ${status}` : "Network request failed";
    }
}

class ApiClient {
    constructor() {
        this.primaryUrl = config.REMOTE_API_BASE_URL;
        this.fallbackUrl = config.REMOTE_API_FALLBACK_URL;
        this.baseUrl = this.primaryUrl;
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

    getBaseUrls() {
        const urls = [this.baseUrl];
        if (this.fallbackUrl && this.fallbackUrl !== this.baseUrl && !urls.includes(this.fallbackUrl)) {
            urls.push(this.fallbackUrl);
        }
        return urls;
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
        const candidateBaseUrls = endpoint.startsWith("http") ? [null] : this.getBaseUrls();
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

        let lastErrorMsg = "Network request failed after retries";

        for (const currentBaseUrl of candidateBaseUrls) {
            const url = currentBaseUrl 
                ? `${currentBaseUrl}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`
                : endpoint;

            let attempt = 0;
            let delay = 1000;

            while (attempt <= retries) {
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), timeout);

                    logger.info("API_REQUEST_START", { method, endpoint, url, attempt });

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

                    const extractedError = extractErrorString(responseData, response.status);
                    lastErrorMsg = extractedError;

                    // Fatal client errors (do not retry)
                    if ([400, 401, 403, 404, 409, 410, 422].includes(response.status)) {
                        logger.warn("API_CLIENT_ERROR_NO_RETRY", { method, endpoint, status: response.status, error: extractedError });
                        return {
                            success: false,
                            status: response.status,
                            error: extractedError,
                            data: responseData?.data || responseData
                        };
                    }

                    // Server errors (5xx) - retryable
                    logger.warn("API_SERVER_ERROR_RETRYABLE", { method, endpoint, status: response.status, attempt });
                } catch (err) {
                    const isAbort = err.name === "AbortError";
                    const errMsg = isAbort ? "Request timed out" : err.message;
                    lastErrorMsg = errMsg;
                    logger.warn("API_REQUEST_FAILED", { method, endpoint, error: errMsg, attempt });
                }

                attempt++;
                if (attempt <= retries) {
                    await new Promise(r => setTimeout(r, delay));
                    delay = Math.min(delay * 2, 10000);
                }
            }
        }

        return { success: false, error: lastErrorMsg };
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
