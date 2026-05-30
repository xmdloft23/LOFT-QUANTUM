const fs = require('fs');
const chalk = require('chalk');

// =============== SESSION ID CONFIGURATION ===============
// Get SESSION_ID from environment variable or use null for default
const SESSION_ID = process.env.SESSION_ID || null;

const config = {
    // =============== SESSION & AUTH ===============
    SESSION_ID: SESSION_ID,              // Set via environment variable: SESSION_ID="mybot" node loft.js
    SESSION_FOLDER: "loft",              // Main session folder (do not change)
    
    // =============== BOT BASIC INFO ===============
    BOT_NAME: "LOFT—OSS",
    OWNER_NAME: "LOFT",             
    OWNER_NUM: "255795906721",           // Namba yako bila + (255...)
    
    // =============== PREFIX & COMMANDS ===============
    PREFIX: ".",                         // Prefix ya commands (.menu, .ping, .help)
    
    // =============== LINKS ===============
    CHANNEL_LINK: "https://whatsapp.com/channel/0029Vb6B9xFCxoAseuG1g610",
    SUPPORT_GROUP: "https://chat.whatsapp.com/G3ChQEjwrdVBTBUQHWSNHF",
    
    // =============== BOT BEHAVIOR ===============
    AUTO_READ: false,                    // Auto read incoming messages
    ALWAYS_ONLINE: true,                 // Show bot as always online
    
    // =============== MODE SETTINGS (User toggles via commands) ===============
    MODE: {
        PUBLIC_MODE: false,              // true = reply everyone, false = owner/sudo only
        FAKE_TYPING: true,               // Show "typing..." when replying
        FAKE_RECORDING: false,           // Show "recording..." when replying
        AUTO_STATUS_LIKE: true           // Auto view + like (❤️) every status
    },
    
    // =============== GROUP CONTROL SETTINGS ===============
    GROUP: {
        WELCOME: true,                   // Welcome new members with image & message
        GOODBYE: true,                   // Goodbye message when member leaves
        ANTILINK: true,                  // Delete links automatically
        ANTITAG: false,                  // Delete @everyone/@here mentions
        MUTE: false,                     // Group mute (announcements only)
        BANNED_USERS: []                 // Array ya banned users global - e.g. ["255xxxxxxxxxx@s.whatsapp.net"]
    },
    
    // =============== ANTI-DELETE SETTINGS ===============
    ANTI_DELETE: {
        ENABLED: true,                   // Enable anti-delete feature
        LOG_DELETED: true                // Log deleted messages to console
    },
    
    // =============== API KEYS (Optional - for extra features) ===============
    // GROQ_API_KEY: "gsk_XXXXXXXXXXXXXXXX",
    // OPENAI_API_KEY: "sk-XXXXXXXXXXXXXXXX",
    // WEATHER_API_KEY: "XXXXXXXXXXXXXXXX",
    
    // =============== MESSAGE SETTINGS ===============
    REPLY_MESSAGES: true,                // Reply to quoted messages
    SELF_MODE: false,                    // Legacy self mode (ignore if MODE.PUBLIC_MODE is set)
    
    // =============== LOGGING ===============
    LOG_COMMANDS: true,                  // Log commands to console
    LOG_ERRORS: true,                    // Log errors to console
    LOG_SESSION: true                    // Log session info on startup
};

// =============== VALIDATION ===============
// Validate owner number
if (!config.OWNER_NUM || config.OWNER_NUM.length < 10) {
    console.log(chalk.red.bold('⚠️ ERROR: OWNER_NUM is required in config.js!'));
    console.log(chalk.yellow('📝 Please set a valid phone number (e.g., "255795906721")'));
    process.exit(1);
}

// Validate channel link (warning only)
if (config.CHANNEL_LINK && !config.CHANNEL_LINK.includes('whatsapp.com/channel')) {
    console.log(chalk.yellow.bold('⚠️ WARNING: CHANNEL_LINK might be invalid. Check your WhatsApp channel link.'));
}

// =============== BANNER ===============
console.log(chalk.blue(`
    __    ____  _______       ____  _____ _____
   / /   / __ \\/ ____/ /_     / __ \\/ ___// ___/
  / /   / / / / /_  / __/    / / / /\\__ \\ \\__ \\ 
 / /___/ /_/ / __/ / /_     / /_/ /___/ /___/ / 
/_____/\\____/_/    \\__/     \\____//____//____/  
`));

// =============== SESSION INFO ===============
console.log(chalk.cyan.bold('╔════════════════════════════════════════════╗'));
console.log(chalk.cyan.bold('║           LOFT—OSS CONFIG LOADED           ║'));
console.log(chalk.cyan.bold('╠════════════════════════════════════════════╣'));

// Session info
if (config.SESSION_ID && config.SESSION_ID !== 'null' && config.SESSION_ID !== 'undefined') {
    console.log(chalk.green(`║ 🔑 SESSION ID : ${config.SESSION_ID.padEnd(35)}║`));
    console.log(chalk.green(`║ 📂 SESSION PATH: loft/session_${config.SESSION_ID.padEnd(23)}║`));
} else {
    console.log(chalk.yellow(`║ 🔑 SESSION ID : default (not set)${' '.repeat(19)}║`));
    console.log(chalk.yellow(`║ 📂 SESSION PATH: loft/session${' '.repeat(30)}║`));
}

console.log(chalk.cyan.bold('╠════════════════════════════════════════════╣'));

// Bot info
console.log(chalk.magenta(`║ 👑 OWNER      : ${config.OWNER_NAME} (${config.OWNER_NUM})${' '.repeat(34 - config.OWNER_NAME.length - config.OWNER_NUM.length)}║`));
console.log(chalk.blue(`║ 🌐 MODE       : ${config.MODE.PUBLIC_MODE ? 'Public 🟢' : 'Private 🔒'}${' '.repeat(35)}║`));
console.log(chalk.yellow(`║ ❤️ AUTO STATUS : ${config.MODE.AUTO_STATUS_LIKE ? 'ON ✅' : 'OFF ❌'}${' '.repeat(35)}║`));
console.log(chalk.gray(`║ 📝 PREFIX     : ${config.PREFIX.padEnd(37)}║`));

console.log(chalk.cyan.bold('╠════════════════════════════════════════════╣'));

// Group settings
console.log(chalk.cyan(`║ 👥 GROUP CONTROLS:${' '.repeat(38)}║`));
console.log(chalk.white(`║    ├─ WELCOME   : ${config.GROUP.WELCOME ? 'ON ✅' : 'OFF ❌'}${' '.repeat(35)}║`));
console.log(chalk.white(`║    ├─ GOODBYE   : ${config.GROUP.GOODBYE ? 'ON ✅' : 'OFF ❌'}${' '.repeat(35)}║`));
console.log(chalk.white(`║    ├─ ANTILINK  : ${config.GROUP.ANTILINK ? 'ON ✅' : 'OFF ❌'}${' '.repeat(35)}║`));
console.log(chalk.white(`║    ├─ ANTITAG   : ${config.GROUP.ANTITAG ? 'ON ✅' : 'OFF ❌'}${' '.repeat(35)}║`));
console.log(chalk.white(`║    ├─ MUTE      : ${config.GROUP.MUTE ? 'ON ✅' : 'OFF ❌'}${' '.repeat(35)}║`));
console.log(chalk.white(`║    └─ BANNED    : ${config.GROUP.BANNED_USERS.length} users${' '.repeat(35)}║`));

console.log(chalk.cyan.bold('╠════════════════════════════════════════════╣'));

// Anti-delete
console.log(chalk.cyan(`║ 🛡️ ANTI-DELETE : ${config.ANTI_DELETE.ENABLED ? 'ENABLED ✅' : 'DISABLED ❌'}${' '.repeat(32)}║`));

// Links
console.log(chalk.cyan.bold('╠════════════════════════════════════════════╣'));
console.log(chalk.blue(`║ 📢 CHANNEL    : ${config.CHANNEL_LINK ? 'Set ✅' : 'Not set ❌'}${' '.repeat(35)}║`));
console.log(chalk.green(`║ 👥 SUPPORT    : ${config.SUPPORT_GROUP ? 'Set ✅' : 'Not set ❌'}${' '.repeat(35)}║`));

console.log(chalk.cyan.bold('╚════════════════════════════════════════════╝\n'));

// =============== USAGE TIPS ===============
if (!config.SESSION_ID || config.SESSION_ID === 'null' || config.SESSION_ID === 'undefined') {
    console.log(chalk.yellow('💡 TIP: To save your session and reuse it later, run:'));
    console.log(chalk.gray('   SESSION_ID="my_bot_name" node loft.js'));
    console.log(chalk.gray('   Then use the same SESSION_ID next time to restore session.\n'));
}

// =============== EXPORT ===============
module.exports = config;