const fs = require('fs');
const chalk = require('chalk');

const config = {
    // Bot Basic Info
    BOT_NAME: "LOFT—OSS",
    OWNER_NAME: "LOFT",             
    OWNER_NUM: "255795906721",            // Namba yako bila +
    
    // Prefix & Commands
    PREFIX: ".",                           // Prefix ya commands (.menu, .ping)
    
    // Links
    CHANNEL_LINK: "https://whatsapp.com/channel/0029Vb6B9xFCxoAseuG1g610", // Link yako ya channel
    SUPPORT_GROUP: "https://chat.whatsapp.com/G3ChQEjwrdVBTBUQHWSNHF?mode=gi_t",     // Group link
    
    // Session & Auth
    SESSION_FOLDER: "session",             // Folder ya session (usibadilishe)
    
    // Bot Behavior
    AUTO_READ: false,                       // Auto read messages
    ALWAYS_ONLINE: true,                   // Show always online
    
    // MODE SETTINGS (User commands toggle)
    MODE: {
        PUBLIC_MODE: false,                 // true = reply everyone, false = owner only
        FAKE_TYPING: true,                // Show "typing..." when replying
        FAKE_RECORDING: false,             // Show "recording..." when replying
        AUTO_STATUS_LIKE: true            // Auto view + like ❤️ every status
    },
    
    // GROUP CONTROL SETTINGS (New - Toggle for all groups)
    GROUP: {
        WELCOME: true,                    // Welcome new members with image & message
        GOODBYE: true,                    // Goodbye message when member leaves
        ANTILINK: true,                   // Delete links automatically
        ANTITAG: false,                    // Delete @everyone/@here mentions
        MUTE: false,                       // Group mute (announcements only)
        BANNED_USERS: []                   // Array ya banned users (global) - e.g. ["255xxxxxxxxxx@s.whatsapp.net"]
    },
    
    // API Keys (kama utaongeza AI au downloader)
    // GROQ_API_KEY: "gsk_XXXXXXXXXXXXXXXX",
    // OPENAI_API_KEY: "sk-XXXXXXXXXXXXXXXX",
    
    // Messages
    REPLY_MESSAGES: true,                  // Reply quoted message
    SELF_MODE: false,                      // Legacy self mode (ignore if using MODE.PUBLIC_MODE)
    
    // Logging
    LOG_COMMANDS: true,
    LOG_ERRORS: true
};

// Validate required fields
if (!config.OWNER_NUM || config.OWNER_NUM.length < 10) {
    console.log(chalk.red.bold('⚠️ ERROR: OWNER_NUM required in config.js!'));
    process.exit(1);
}

if (!config.CHANNEL_LINK.includes('whatsapp.com/channel')) {
    console.log(chalk.yellow.bold('⚠️ WARNING: CHANNEL_LINK might be invalid.'));
}

// Print loaded config
console.log(chalk.blue(`
    __    ____  _______       ____  _____ _____
   / /   / __ \/ ____/ /_     / __ \/ ___// ___/
  / /   / / / / /_  / __/    / / / /\__ \ \__ \ 
 / /___/ /_/ / __/ / /_     / /_/ /___/ /___/ / 
/_____/\____/_/    \__/     \____//____//____/  
`));

console.log(chalk.cyan.bold(`Config Loaded Successfully!`));
console.log(chalk.magenta(`👑 Owner     : ${config.OWNER_NAME}`));
console.log(chalk.blue(`📱 Number    : wa.me/${config.OWNER_NUM}`));
console.log(chalk.green(`🌐 Mode      : ${config.MODE.PUBLIC_MODE ? 'Public 🟢' : 'Private 🔒'}`));
console.log(chalk.yellow(`❤️ Auto Status Like: ${config.MODE.AUTO_STATUS_LIKE ? 'ON' : 'OFF'}`));
console.log(chalk.cyan(`👥 Group Controls:`));
console.log(chalk.white(`   Welcome: ${config.GROUP.WELCOME ? 'ON' : 'OFF'}`));
console.log(chalk.white(`   Goodbye: ${config.GROUP.GOODBYE ? 'ON' : 'OFF'}`));
console.log(chalk.white(`   Anti-Link: ${config.GROUP.ANTILINK ? 'ON' : 'OFF'}`));
console.log(chalk.white(`   Anti-Tag: ${config.GROUP.ANTITAG ? 'ON' : 'OFF'}`));
console.log(chalk.white(`   Mute: ${config.GROUP.MUTE ? 'ON' : 'OFF'}`));
console.log(chalk.white(`   Banned Users: ${config.GROUP.BANNED_USERS.length} users\n`));

module.exports = config;