// electron/src/network/photoStager.js
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const crypto = require("crypto");
const config = require("../config");
const logger = require("../logging/logger");
const cleanupManager = require("../cleanup/cleanupManager");

const MAX_IMAGE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB safety limit
const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff"];

// Magic byte signatures for image validation
function validateImageMagicBytes(buffer) {
    if (!buffer || buffer.length < 4) return false;

    // JPEG: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return true;

    // PNG: 89 50 4E 47
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return true;

    // WEBP: RIFF ... WEBP
    if (buffer.length >= 12 &&
        buffer.toString("ascii", 0, 4) === "RIFF" &&
        buffer.toString("ascii", 8, 12) === "WEBP") return true;

    // BMP: BM (42 4D)
    if (buffer[0] === 0x42 && buffer[1] === 0x4D) return true;

    return false;
}

function resolveFullDownloadUrl(downloadUrl) {
    if (!downloadUrl || typeof downloadUrl !== "string") return null;
    const trimmed = downloadUrl.trim();
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
        return trimmed;
    }
    // Reject other explicit protocols (ftp://, file://, etc.)
    if (/^[a-zA-Z0-9+-.]+:\/\//.test(trimmed)) {
        return null;
    }
    const base = config.REMOTE_API_BASE_URL || "https://primeidpro-central-platform.onrender.com/api/v1";
    let origin = "https://primeidpro-central-platform.onrender.com";
    try {
        origin = new URL(base).origin;
    } catch {}

    if (trimmed.startsWith("/")) {
        return `${origin}${trimmed}`;
    }
    return `${origin}/${trimmed}`;
}

class PhotoStager {
    constructor() {
        this.stagedDir = config.STAGED_PHOTOS_DIR;
    }

    ensureDir() {
        if (!fs.existsSync(this.stagedDir)) {
            fs.mkdirSync(this.stagedDir, { recursive: true });
        }
    }

    resolveUrl(url) {
        return resolveFullDownloadUrl(url);
    }

    async stageRemotePhoto({ downloadUrl, jobId, photoIndex = 1, originalFileName = "photo.jpg" }) {
        this.ensureDir();

        const fullUrl = resolveFullDownloadUrl(downloadUrl);
        if (!fullUrl || (!fullUrl.startsWith("http://") && !fullUrl.startsWith("https://"))) {
            throw new Error(`Invalid remote download URL provided: ${downloadUrl}`);
        }

        logger.info("REMOTE_PHOTO_DOWNLOAD_STARTED", { jobId, photoIndex, url: fullUrl });

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 45000); // 45s download timeout

            const response = await fetch(fullUrl, {
                method: "GET",
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                if (response.status === 404 || response.status === 410) {
                    throw new Error(`Photo has expired on cloud server (HTTP ${response.status}). Temporary QR order photos are purged after retention time.`);
                }
                throw new Error(`Remote image download failed with HTTP ${response.status}`);
            }

            const contentType = response.headers.get("content-type") || "image/jpeg";
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            if (buffer.length === 0) {
                throw new Error("Downloaded image payload is empty (0 bytes)");
            }

            if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
                throw new Error(`Downloaded image exceeds maximum size limit of 25MB (${Math.round(buffer.length / 1024 / 1024)}MB)`);
            }

            // Verify binary image signature
            if (!validateImageMagicBytes(buffer)) {
                throw new Error("Downloaded binary payload is not a valid image format (magic byte check failed)");
            }

            // Determine safe extension
            let ext = path.extname(originalFileName).toLowerCase();
            if (!ALLOWED_EXTENSIONS.includes(ext)) {
                if (contentType.includes("png")) ext = ".png";
                else if (contentType.includes("webp")) ext = ".webp";
                else ext = ".jpg";
            }

            // Generate isolated safe staging path
            const safeFileName = `staged_${jobId.replace(/[^a-zA-Z0-9_-]/g, "")}_idx${photoIndex}_${crypto.randomUUID().slice(0, 8)}${ext}`;
            const targetPath = path.join(this.stagedDir, safeFileName);

            await fsp.writeFile(targetPath, buffer);

            // Schedule automatic 10-minute privacy cleanup
            cleanupManager.scheduleCleanup(targetPath, jobId, config.RETENTION_MS);

            logger.info("REMOTE_PHOTO_DOWNLOAD_SUCCESS", {
                jobId,
                photoIndex,
                localPath: targetPath,
                fileSize: buffer.length
            });

            return {
                success: true,
                localPath: targetPath,
                fileSize: buffer.length,
                contentType
            };
        } catch (err) {
            logger.error("REMOTE_PHOTO_DOWNLOAD_FAILED", {
                jobId,
                photoIndex,
                error: err.message
            });
            throw err;
        }
    }
}

const photoStager = new PhotoStager();
module.exports = photoStager;

