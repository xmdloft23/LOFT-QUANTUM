const axios = require("axios");
const cheerio = require("cheerio");
const path = require("path");
const fs = require('fs');
const zlib = require('zlib');

// ========== SESSION CONFIGURATION ==========
const sessionDir = path.join(__dirname, '..', 'loft', 'session');
const sessionPath = path.join(sessionDir, 'creds.json');

// CONFIG - Weka SESSION_ID yako hapa au kwenye environment variable
const SESSION_ID = process.env.SESSION_ID || null;

// ========== TEMP DIRECTORY ==========
const tempDir = path.join(__dirname, '..', 'temp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

// ========== TRY TO LOAD FFMPEG FOR VIDEO ONLY ==========
let ffmpeg = null;
let ffmpegPath = null;
let ffmpegAvailable = false;

try {
    ffmpegPath = require('ffmpeg-static');
    ffmpeg = require('fluent-ffmpeg');
    try {
        fs.chmodSync(ffmpegPath, 0o755);
    } catch(e) {}
    ffmpeg.setFfmpegPath(ffmpegPath);
    ffmpegAvailable = true;
    console.log("✅ ffmpeg available for VIDEO");
} catch(e) {
    console.log("⚠️ ffmpeg not available - no conversion");
}

// ========== LOAD SESSION (FROM SESSION_ID STRING) ==========
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
            
            // Return session data as JSON
            return JSON.parse(decompressedData);
        } else {
            // Try to load as regular session folder
            if (fs.existsSync(sessionPath)) {
                const sessionData = fs.readFileSync(sessionPath, "utf8");
                console.log("✅ Session loaded from local folder");
                return JSON.parse(sessionData);
            }
        }
        
        return null;

    } catch (e) {
        console.error("❌ Session Error:", e.message);
        return null;
    }
}

// ========== LOAD SESSION FROM FOLDER (REGULAR) ==========
async function loadSessionFromFolder() {
    try {
        if (!fs.existsSync(sessionPath)) {
            console.log("⚠️ No existing session found, will create new");
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

// ========== SAVE SESSION (Create new session ID string) ==========
async function saveSessionToId(sessionData) {
    try {
        // Compress session data
        const jsonString = JSON.stringify(sessionData);
        const compressed = zlib.gzipSync(jsonString);
        const base64Data = compressed.toString('base64');
        
        // Create session ID
        const newSessionId = `Loft~${base64Data}`;
        
        // Save to file
        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }
        fs.writeFileSync(sessionPath, jsonString, "utf8");
        
        console.log("✅ Session saved successfully");
        console.log("📋 Your new Session ID (save this):");
        console.log(newSessionId);
        
        return newSessionId;
    } catch (e) {
        console.error("❌ Save Session Error:", e.message);
        return null;
    }
}

// ========== SAVE SESSION TO FOLDER (REGULAR) ==========
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

// ========== GET CURRENT SESSION ID STRING ==========
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

// ========== FORMAT AUDIO - NO FFMPEG (BYPASS) ==========
async function formatAudio(buffer) {
    console.log("🎵 Audio: Returning original buffer");
    return buffer;
}

async function toAudio(buffer) {
    return formatAudio(buffer);
}

async function toPtt(buffer) {
    console.log("📢 PTT: Using original buffer");
    return buffer;
}

// ========== FORMAT VIDEO ==========
async function formatVideo(buffer) {
    if (!ffmpegAvailable) {
        console.log("🎥 Video: ffmpeg not available, returning original");
        return buffer;
    }
    return buffer;
}

async function toVideo(buffer) {
    return formatVideo(buffer);
}

// ========== OSS BUFFER ==========
const ossBuffer = async (url, options = {}) => {
    try {
        const res = await axios({
            method: "GET",
            url,
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                'DNT': 1,
                'Upgrade-Insecure-Request': 1
            },
            ...options,
            responseType: 'arraybuffer',
            timeout: 30000
        });
        
        if (!res.data || res.data.length === 0) {
            throw new Error("Empty response data");
        }
        
        return Buffer.from(res.data);
    } catch (err) {
        console.error("ossBuffer Error:", err.message);
        return null;
    }
};

// ========== UTILITIES ==========
function monospace(input) {
    const boldz = {
        'A': '𝙰', 'B': '𝙱', 'C': '𝙲', 'D': '𝙳', 'E': '𝙴', 'F': '𝙵', 'G': '𝙶',
        'H': '𝙷', 'I': '𝙸', 'J': '𝙹', 'K': '𝙺', 'L': '𝙻', 'M': '𝙼', 'N': '𝙽',
        'O': '𝙾', 'P': '𝙿', 'Q': '𝚀', 'R': '𝚁', 'S': '𝚂', 'T': '𝚃', 'U': '𝚄',
        'V': '𝚅', 'W': '𝚆', 'X': '𝚇', 'Y': '𝚈', 'Z': '𝚉',
        '0': '𝟎', '1': '𝟏', '2': '𝟐', '3': '𝟑', '4': '𝟒', '5': '𝟓', '6': '𝟔',
        '7': '𝟕', '8': '𝟖', '9': '𝟗', ' ': ' '
    };
    return input.split('').map(char => boldz[char] || char).join('');
}

function formatBytes(bytes) {
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return bytes.toFixed(2) + ' bytes';
}

function runtime(seconds) {
    seconds = Number(seconds);
    var d = Math.floor(seconds / (3600 * 24));
    var h = Math.floor(seconds % (3600 * 24) / 3600);
    var m = Math.floor(seconds % 3600 / 60);
    var s = Math.floor(seconds % 60);
    var dDisplay = d > 0 ? d + (d == 1 ? ' day, ' : ' days, ') : '';
    var hDisplay = h > 0 ? h + (h == 1 ? ' hour, ' : ' hours, ') : '';
    var mDisplay = m > 0 ? m + (m == 1 ? ' minute, ' : ' minutes, ') : '';
    var sDisplay = s > 0 ? s + (s == 1 ? ' second' : ' seconds') : '';
    return dDisplay + hDisplay + mDisplay + sDisplay;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function ossRandom(ext) {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    return path.join(tempDir, `${timestamp}_${random}${ext}`);
}

function isUrl(url) {
    return url.match(new RegExp(/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/, 'gi'));
}

function isNumber(number) {
    const int = parseInt(number);
    return typeof int === 'number' && !isNaN(int);
}

function eBase(str = '') {
    return Buffer.from(str).toString('base64');
}

function dBase(base64Str) {
    return Buffer.from(base64Str, 'base64').toString('utf-8');
}

function eBinary(str = '') {
    return str.split('').map(char => char.charCodeAt(0).toString(2)).join(' ');
}

function dBinary(str) {
    let newBin = str.split(" ");
    let binCode = [];
    for (let i = 0; i < newBin.length; i++) {
        binCode.push(String.fromCharCode(parseInt(newBin[i], 2)));
    }
    return binCode.join("");
}

// ========== MAIN INITIALIZATION ==========
async function initialize() {
    try {
        console.log("🚀 Initializing session manager...");
        const sessionCreds = await loadSessionFromId();
        
        if (sessionCreds) {
            console.log("📱 Session loaded successfully!");
            console.log("🔑 Credentials keys:", Object.keys(sessionCreds));
        } else {
            console.log("📱 No existing session, will create new on pairing");
        }
        
        return sessionCreds;
    } catch (error) {
        console.error("❌ Initialization failed:", error.message);
        return null;
    }
}

// ========== EXPORTS ==========
module.exports = {
    // Session functions
    loadSessionFromId,
    loadSessionFromFolder,
    saveSessionToId,
    saveSessionToFolder,
    getCurrentSessionId,
    sessionDir,
    sessionPath,
    SESSION_ID,
    
    // Original functions
    dBinary,
    eBinary,
    dBase,
    eBase,
    runtime,
    sleep,
    toAudio,
    toVideo,
    toPtt,
    formatVideo,
    formatAudio,
    monospace,
    formatBytes,
    ossBuffer,
    ossRandom,
    isUrl,
    isNumber,
    tempDir,
    
    // Main init
    initialize
};