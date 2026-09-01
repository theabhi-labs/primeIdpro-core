// electron/src/ipc/validators.js

const MAX_HTML_LENGTH = 50 * 1024 * 1024; // 50 MB safety limit
const ALLOWED_PAPER_SIZES = [
    "A4", "Letter", "4x6", "A3", "A5", "B", "C", "D", "E", "F", "G", "H", "I", "J",
    "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"
];
const ALLOWED_ORIENTATIONS = ["Portrait", "Landscape", "portrait", "landscape"];

function validatePrintPayload(payload) {
    if (!payload || typeof payload !== "object") {
        throw new Error("Invalid payload: expected an object");
    }
    const { html, options } = payload;
    if (!html || typeof html !== "string") {
        throw new Error("Invalid print request: 'html' must be a non-empty string");
    }
    if (html.length > MAX_HTML_LENGTH) {
        throw new Error("Print HTML payload exceeds maximum size limit (50MB)");
    }

    const validatedOptions = {};
    if (options && typeof options === "object") {
        if (options.paperSize && ALLOWED_PAPER_SIZES.includes(options.paperSize)) {
            validatedOptions.paperSize = options.paperSize;
        } else {
            validatedOptions.paperSize = "A4";
        }

        if (options.orientation && ALLOWED_ORIENTATIONS.includes(options.orientation)) {
            validatedOptions.orientation = options.orientation.charAt(0).toUpperCase() + options.orientation.slice(1).toLowerCase();
        } else {
            validatedOptions.orientation = "Portrait";
        }
    } else {
        validatedOptions.paperSize = "A4";
        validatedOptions.orientation = "Portrait";
    }

    return { html, options: validatedOptions };
}

function validateJobCreate(payload) {
    if (!payload || typeof payload !== "object") {
        throw new Error("Invalid job payload");
    }
    const { type, source, orderId, serverJobId, items, metadata } = payload;
    return {
        type: type || "PHOTO",
        source: source || "LOCAL",
        serverJobId: typeof serverJobId === "string" ? serverJobId.slice(0, 100) : null,
        orderId: typeof orderId === "string" ? orderId.slice(0, 100) : null,
        items: Array.isArray(items) ? items.slice(0, 100) : [],
        metadata: metadata && typeof metadata === "object" ? metadata : {}
    };
}

function validatePairingPayload(payload) {
    if (!payload || typeof payload !== "object") {
        throw new Error("Invalid pairing payload: expected an object");
    }
    const { pairingCode, deviceName } = payload;
    if (!pairingCode || typeof pairingCode !== "string" || pairingCode.trim().length !== 6) {
        throw new Error("A valid 6-digit pairing code is required");
    }
    return {
        pairingCode: pairingCode.trim(),
        deviceName: typeof deviceName === "string" ? deviceName.slice(0, 100) : "Front Counter PC"
    };
}

function validateId(id) {
    if (!id || typeof id !== "string" || id.length > 128) {
        throw new Error("Invalid ID parameter");
    }
    return id;
}

module.exports = {
    validatePrintPayload,
    validateJobCreate,
    validatePairingPayload,
    validateId
};
