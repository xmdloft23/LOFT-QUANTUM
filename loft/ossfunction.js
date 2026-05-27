const axios = require("axios");
const cheerio = require("cheerio");
const path = require("path");
const fs = require('fs');
const zlib = require('zlib');

// ========== SESSION CONFIGURATION ==========
const sessionDir = path.join(__dirname, 'session');
const sessionPath = path.join(sessionDir, 'creds.json');

// CONFIG - Weka SESSION_ID yako hapa (full session tu)
const config = {
    SESSION_ID: process.env.SESSION_ID || "Loft~H4sIAAAAAAAA..." // Weka full session ID yako
};

// ========== TEMP DIRECTORY ==========
const tempDir = path.join(__dirname, 'temp');
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

// ========== LOAD SESSION (LOCAL ONLY - NO SERVER) ==========
async function loadSession() {
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

        if (!config.SESSION_ID || typeof config.SESSION_ID !== 'string') {
            throw new Error("❌ SESSION_ID is missing or invalid");
        }

        let sessionId = config.SESSION_ID;
        const [header, b64data] = sessionId.split('~');

        if (header !== "Loft" || !b64data) {
            throw new Error("❌ Invalid session format. Expected 'Loft~.....'");
        }

        // Check if it's a valid base64 compressed data
        if (!b64data.startsWith('H4sI')) {
            throw new Error("❌ Invalid session format. Full session ID should start with 'Loft~H4sI'");
        }

        console.log("📂 Loading session locally...");
        
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
        console.log("✅ Session File Loaded Successfully");
        
        // Return session data as JSON
        return JSON.parse(decompressedData);

    } catch (e) {
        console.error("❌ Session Error:", e.message);
        throw e;
    }
}

// ========== SAVE SESSION (Create new session ID) ==========
async function saveSession(sessionData) {
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
        console.log("🚀 Initializing...");
        const sessionCreds = await loadSession();
        console.log("📱 Session loaded successfully!");
        console.log("🔑 Credentials keys:", Object.keys(sessionCreds));
        return sessionCreds;
    } catch (error) {
        console.error("❌ Initialization failed:", error.message);
        throw error;
    }
}

// ========== EXPORTS ==========
module.exports = {
    // Session functions
    loadSession,
    saveSession,
    sessionDir,
    sessionPath,
    config,
    
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