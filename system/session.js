const axios = require("axios");
const path = require("path");
const fs = require('fs');
const zlib = require('zlib');

// ========== SESSION CONFIGURATION ==========
const sessionDir = path.join(__dirname, '..', 'loft', 'session');
const sessionPath = path.join(sessionDir, 'creds.json');

// SESSION_ID kutoka environment variable
const SESSION_ID = process.env.SESSION_ID || null;

// ========== TEMP DIRECTORY ==========
const tempDir = path.join(__dirname, '..', 'temp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

// ========== LOAD SESSION FROM ID STRING ==========
async function loadSessionFromId() {
    try {
        // Clean existing session files
        if (fs.existsSync(sessionDir)) {
            const allFiles = fs.readdirSync(sessionDir);
            allFiles.forEach(f => {
                try { 
                    fs.unlinkSync(path.join(sessionDir, f)); 
                } catch (e) {}
            });
        }

        const sessionId = process.env.SESSION_ID || null;
        
        if (!sessionId || sessionId === 'null' || sessionId === 'undefined') {
            console.log("⚠️ No SESSION_ID provided, will create new session");
            return null;
        }

        // Check format
        if (!sessionId.includes('~')) {
            console.log("⚠️ Invalid SESSION_ID format, missing '~'");
            return null;
        }
        
        const parts = sessionId.split('~');
        if (parts.length !== 2) {
            console.log("⚠️ Invalid SESSION_ID format, expected 'Loft~...'");
            return null;
        }
        
        const [header, b64data] = parts;

        if (header !== "Loft") {
            console.log("⚠️ Invalid session header, expected 'Loft'");
            return null;
        }

        if (!b64data || b64data.length < 100) {
            console.log("⚠️ Session data is too short or empty");
            return null;
        }

        console.log(`📂 Loading session (${b64data.length} chars)...`);
        
        // Decode base64
        let compressedData;
        try {
            compressedData = Buffer.from(b64data, 'base64');
        } catch (e) {
            console.log("❌ Invalid base64 data:", e.message);
            return null;
        }
        
        if (!compressedData || compressedData.length === 0) {
            console.log("❌ Compressed data is empty");
            return null;
        }
        
        // Decompress
        let decompressedData;
        try {
            decompressedData = zlib.gunzipSync(compressedData);
        } catch (e) {
            console.log("❌ Failed to decompress session:", e.message);
            console.log("⚠️ Session data may be corrupted");
            return null;
        }
        
        // Parse JSON
        let creds;
        try {
            creds = JSON.parse(decompressedData);
        } catch (e) {
            console.log("❌ Invalid session JSON:", e.message);
            return null;
        }
        
        // Save to file
        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }
        fs.writeFileSync(sessionPath, JSON.stringify(creds, null, 2), "utf8");
        
        console.log("✅ Session loaded successfully!");
        return creds;
        
    } catch (e) {
        console.error("❌ Session Error:", e.message);
        return null;
    }
}

// ========== LOAD SESSION FROM FOLDER ==========
async function loadSessionFromFolder() {
    try {
        if (!fs.existsSync(sessionPath)) {
            console.log("⚠️ No session folder found");
            return null;
        }
        const sessionData = fs.readFileSync(sessionPath, "utf8");
        console.log("✅ Session loaded from local folder");
        return JSON.parse(sessionData);
    } catch (e) {
        console.error("❌ Session folder load error:", e.message);
        return null;
    }
}

// ========== SAVE SESSION TO ID STRING ==========
async function saveSessionToId(sessionData) {
    try {
        if (!sessionData) {
            console.log("⚠️ No session data to save");
            return null;
        }
        
        const jsonString = JSON.stringify(sessionData);
        const compressed = zlib.gzipSync(jsonString);
        const base64Data = compressed.toString('base64');
        const newSessionId = `Loft~${base64Data}`;
        
        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }
        fs.writeFileSync(sessionPath, jsonString, "utf8");
        
        console.log("✅ Session saved successfully");
        console.log("\n📋 SESSION ID (save this):");
        console.log("=".repeat(50));
        console.log(newSessionId);
        console.log("=".repeat(50));
        
        return newSessionId;
    } catch (e) {
        console.error("❌ Save Session Error:", e.message);
        return null;
    }
}

// ========== SAVE SESSION TO FOLDER ==========
async function saveSessionToFolder(sessionData) {
    try {
        if (!sessionData) {
            console.log("⚠️ No session data to save");
            return false;
        }
        
        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }
        fs.writeFileSync(sessionPath, JSON.stringify(sessionData, null, 2), "utf8");
        console.log("✅ Session saved to folder");
        return true;
    } catch (e) {
        console.error("❌ Save to folder error:", e.message);
        return false;
    }
}

// ========== GET CURRENT SESSION ID ==========
async function getCurrentSessionId() {
    try {
        if (!fs.existsSync(sessionPath)) {
            console.log("⚠️ No session file found");
            return null;
        }
        const sessionData = fs.readFileSync(sessionPath, "utf8");
        const compressed = zlib.gzipSync(sessionData);
        const base64Data = compressed.toString('base64');
        return `Loft~${base64Data}`;
    } catch (e) {
        console.error("❌ Get session ID error:", e.message);
        return null;
    }
}

// ========== UTILITIES ==========
function ossRandom(ext) {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    return path.join(tempDir, `${timestamp}_${random}${ext}`);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isUrl(url) {
    return url ? url.match(new RegExp(/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/, 'gi')) : null;
}

function isNumber(number) {
    const int = parseInt(number);
    return typeof int === 'number' && !isNaN(int);
}

// ========== EXPORTS ==========
module.exports = {
    loadSessionFromId,
    loadSessionFromFolder,
    saveSessionToId,
    saveSessionToFolder,
    getCurrentSessionId,
    sessionDir,
    sessionPath,
    SESSION_ID,
    ossRandom,
    sleep,
    isUrl,
    isNumber,
    tempDir
};