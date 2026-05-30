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

        if (!SESSION_ID || typeof SESSION_ID !== 'string') {
            console.log("⚠️ No SESSION_ID provided, will create new session");
            return null;
        }

        let sessionId = SESSION_ID;
        
        // Check if it's a Loft format session
        if (sessionId.includes('~')) {
            const [header, b64data] = sessionId.split('~');

            if (header !== "Loft" || !b64data) {
                console.log("⚠️ Invalid session format. Expected 'Loft~.....'");
                return null;
            }

            // Check if it's a valid base64 compressed data
            if (!b64data.startsWith('H4sI')) {
                console.log("⚠️ Invalid session format. Full session ID should start with 'Loft~H4sI'");
                return null;
            }

            console.log("📂 Loading session from SESSION_ID...");
            
            // Clean base64 data
            const cleanB64 = b64data.replace(/\.\.\./g, '');
            
            // Decode and decompress
            const compressedData = Buffer.from(cleanB64, 'base64');
            const decompressedData = zlib.gunzipSync(compressedData);

            // Save session file
            if (!fs.existsSync(sessionDir)) {
                fs.mkdirSync(sessionDir, { recursive: true });
            }

            fs.writeFileSync(sessionPath, decompressedData, "utf8");
            console.log("✅ Session File Loaded Successfully from SESSION_ID");
            
            return JSON.parse(decompressedData);
        }
        
        return null;

    } catch (e) {
        console.error("❌ Session Error:", e.message);
        return null;
    }
}

// ========== LOAD SESSION FROM FOLDER ==========
async function loadSessionFromFolder() {
    try {
        if (!fs.existsSync(sessionPath)) {
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
    return url.match(new RegExp(/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/, 'gi'));
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