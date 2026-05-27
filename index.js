const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    jidDecode,
    proto
} = require("@whiskeysockets/baileys")

const chalk = require('chalk');
const pino = require('pino');
const fs = require('fs');
const readline = require('readline');
const path = require('path');
const config = require('./settings/config');

const { smsg } = require('./system/storage.js');

let modeSettings = config.MODE || {
    publicMode: true,
    fakeTyping: false,
    fakeRecording: false,
    autoStatus: false
};

// ================ SESSION ID HANDLER ================
function getSessionIdFromEnv() {
    // Check environment variable
    if (process.env.SESSION_ID && process.env.SESSION_ID !== '') {
        console.log(chalk.green('✅ Session ID found in environment variables'));
        return process.env.SESSION_ID;
    }
    return null;
}

function getSessionIdFromFile() {
    // Check session.json file
    const sessionFile = path.join(__dirname, 'session.json');
    if (fs.existsSync(sessionFile)) {
        try {
            const sessionData = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
            if (sessionData.sessionId && sessionData.sessionId !== '') {
                console.log(chalk.green('✅ Session ID found in session.json'));
                return sessionData.sessionId;
            }
        } catch (e) {
            console.log(chalk.red('Error reading session.json:', e.message));
        }
    }
    return null;
}

function getSessionIdFromDotEnv() {
    // Check .env file
    const envFile = path.join(__dirname, '.env');
    if (fs.existsSync(envFile)) {
        try {
            const envContent = fs.readFileSync(envFile, 'utf8');
            const match = envContent.match(/SESSION_ID=["']?([^"'\n]+)["']?/);
            if (match && match[1] && match[1] !== '') {
                console.log(chalk.green('✅ Session ID found in .env file'));
                return match[1];
            }
        } catch (e) {
            console.log(chalk.red('Error reading .env:', e.message));
        }
    }
    return null;
}

function saveSessionId(sessionId) {
    const sessionFile = path.join(__dirname, 'session.json');
    try {
        const data = { 
            sessionId, 
            savedAt: new Date().toISOString(),
            deviceName: 'LOFT—OSS Bot'
        };
        fs.writeFileSync(sessionFile, JSON.stringify(data, null, 2));
        console.log(chalk.green('✅ Session ID saved to session.json'));
        
        // Also save to .env
        const envFile = path.join(__dirname, '.env');
        let envContent = '';
        if (fs.existsSync(envFile)) {
            envContent = fs.readFileSync(envFile, 'utf8');
            if (envContent.includes('SESSION_ID=')) {
                envContent = envContent.replace(/SESSION_ID=.*/g, `SESSION_ID=${sessionId}`);
            } else {
                envContent += `\nSESSION_ID=${sessionId}\n`;
            }
        } else {
            envContent = `SESSION_ID=${sessionId}\n`;
        }
        fs.writeFileSync(envFile, envContent);
        console.log(chalk.green('✅ Session ID saved to .env file'));
        
        return true;
    } catch (e) {
        console.log(chalk.red('Error saving session ID:', e.message));
        return false;
    }
}

function getSessionId() {
    // Try different sources in order
    let sessionId = getSessionIdFromEnv();
    if (sessionId) return sessionId;
    
    sessionId = getSessionIdFromFile();
    if (sessionId) return sessionId;
    
    sessionId = getSessionIdFromDotEnv();
    if (sessionId) return sessionId;
    
    console.log(chalk.yellow('⚠️ No session ID found. Will request phone number for pairing.'));
    return null;
}

const SESSION_ID = getSessionId();
// ================ END SESSION ID HANDLER ================

// ================ PAIRING CODE WITH COUNTRY CODE ================
const question = (text) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(text, resolve));
};

async function getPhoneNumber() {
    console.log(chalk.cyan('\n═══════════════════════════════════════'));
    console.log(chalk.yellow.bold('📱 WHATSAPP PAIRING SETUP'));
    console.log(chalk.cyan('═══════════════════════════════════════\n'));
    
    console.log(chalk.white('Examples of valid numbers:'));
    console.log(chalk.gray('   • 255712345678 (Tanzania)'));
    console.log(chalk.gray('   • 254712345678 (Kenya)'));
    console.log(chalk.gray('   • 256712345678 (Uganda)'));
    console.log(chalk.gray('   • 234812345678 (Nigeria)'));
    console.log(chalk.gray('   • 923456789012 (Pakistan)'));
    console.log(chalk.gray('   • 628123456789 (Indonesia)\n'));
    
    let phoneNumber = '';
    while (!phoneNumber) {
        const input = await question(chalk.yellow.bold('📞 Enter phone number with country code (e.g., 255712345678):\n➤ '));
        phoneNumber = input.trim().replace(/[^0-9]/g, '');
        
        if (!phoneNumber) {
            console.log(chalk.red('❌ Phone number cannot be empty! Please try again.\n'));
        } else if (phoneNumber.length < 10) {
            console.log(chalk.red('❌ Phone number is too short! Include country code (e.g., 255...)\n'));
            phoneNumber = '';
        } else if (phoneNumber.length > 15) {
            console.log(chalk.red('❌ Phone number is too long! Maximum 15 digits\n'));
            phoneNumber = '';
        } else {
            // Validate country code (simple check for common codes)
            const countryCode = phoneNumber.substring(0, 3);
            const validCodes = ['255', '254', '256', '234', '92', '62', '91', '1', '44', '61', '27', '33', '49', '34', '39', '52', '55', '81', '82', '86'];
            if (!validCodes.some(code => phoneNumber.startsWith(code))) {
                console.log(chalk.yellow(`⚠️ Warning: ${countryCode} might not be a valid country code. Continue anyway? (y/n)`));
                const confirm = await question('➤ ');
                if (confirm.toLowerCase() !== 'y') {
                    phoneNumber = '';
                    continue;
                }
            }
            console.log(chalk.green(`✅ Phone number accepted: ${phoneNumber}\n`));
        }
    }
    
    return phoneNumber;
}
// ================ END PAIRING CODE ================

async function connectToWhatsApp() {
    // Check if we have existing session
    const sessionPath = './session';
    const hasExistingSession = fs.existsSync(sessionPath) && fs.readdirSync(sessionPath).length > 0;
    
    if (hasExistingSession) {
        console.log(chalk.cyan('📂 Existing session found, attempting to load...'));
    }
    
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    
    // Check if credentials are already registered
    const isRegistered = state.creds && state.creds.registered;
    
    const { version } = await fetchLatestBaileysVersion();

    const socket = makeWASocket({
        version,
        printQRInTerminal: !usePairingCode,
        syncFullHistory: false,
        markOnlineOnConnect: true,
        browser: ['LOFT—OSS', 'Chrome', '1.0.0'],
        logger: pino({ level: 'silent' }),
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino().child({ level: 'silent', stream: 'store' }))
        }
    });

    // Request pairing code if no existing session
    if (usePairingCode && !isRegistered && !hasExistingSession) {
        console.log(chalk.cyan('\n🔄 No existing session detected. Setting up new device...\n'));
        const phoneNumber = await getPhoneNumber();
        
        console.log(chalk.cyan('\n⏳ Requesting pairing code from WhatsApp...'));
        try {
            const code = await socket.requestPairingCode(phoneNumber);
            console.log(chalk.green('\n═══════════════════════════════════════'));
            console.log(chalk.black.bgGreen.bold('           LOFT—OSS PAIRING CODE          '));
            console.log(chalk.green('═══════════════════════════════════════'));
            console.log(chalk.white.bgBlue.bold(`            ${code}            `));
            console.log(chalk.green('═══════════════════════════════════════'));
            console.log(chalk.yellow('\n⚠️ Enter this code in WhatsApp Linked Devices\n'));
            
            // Generate and save session ID
            const newSessionId = `LOFT_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
            saveSessionId(newSessionId);
            
        } catch (error) {
            console.log(chalk.red('❌ Failed to get pairing code:'), error.message);
            console.log(chalk.yellow('🔄 Retrying in 5 seconds...'));
            setTimeout(connectToWhatsApp, 5000);
            return;
        }
    } else if (usePairingCode && !isRegistered && hasExistingSession) {
        console.log(chalk.yellow('⚠️ Session files exist but not registered. Please delete ./session folder and restart.\n'));
        const phoneNumber = await getPhoneNumber();
        
        try {
            const code = await socket.requestPairingCode(phoneNumber);
            console.log(chalk.green('\n═══════════════════════════════════════'));
            console.log(chalk.black.bgGreen.bold('           LOFT—OSS PAIRING CODE          '));
            console.log(chalk.green('═══════════════════════════════════════'));
            console.log(chalk.white.bgBlue.bold(`            ${code}            `));
            console.log(chalk.green('═══════════════════════════════════════'));
        } catch (error) {
            console.log(chalk.red('❌ Failed to get pairing code:'), error.message);
            setTimeout(connectToWhatsApp, 5000);
            return;
        }
    }

    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            if (statusCode !== DisconnectReason.loggedOut) {
                console.log(chalk.yellow(`⚠️ Connection closed, reconnecting in 5 seconds...`));
                console.log(chalk.gray(`Reason: ${lastDisconnect?.error?.message || 'Unknown'}`));
                setTimeout(connectToWhatsApp, 5000);
            } else {
                console.log(chalk.red('\n❌ Logged Out! Session expired or invalid.'));
                console.log(chalk.yellow('🔄 Delete ./session folder and restart bot to create new session.\n'));
            }
        } else if (connection === 'open') {
            // Get bot info
            const botJid = socket.user?.id?.split(':')[0] + '@s.whatsapp.net';
            const botName = socket.user?.name || 'LOFT—OSS Bot';
            
            // CONNECTED MESSAGE
            console.log(chalk.green.bold('\n═══════════════════════════════════════'));
            console.log(chalk.green.bold('🟢 LOFT—OSS CONNECTED SUCCESSFULLY! 🚀'));
            console.log(chalk.green.bold('═══════════════════════════════════════'));
            console.log(chalk.white(`📱 Device:     ${chalk.cyan(botName)}`));
            console.log(chalk.white(`📊 Status:     ${chalk.green('Online ✓')}`));
            console.log(chalk.white(`⏰ Time:       ${chalk.yellow(new Date().toLocaleString())}`));
            console.log(chalk.white(`🔑 Session ID: ${chalk.magenta(SESSION_ID || 'New Session')}`));
            console.log(chalk.white(`📞 Bot Number: ${chalk.cyan(botJid || 'Unknown')}`));
            console.log(chalk.green.bold('═══════════════════════════════════════\n'));
            
            // Send welcome message to owner if configured
            if (config.OWNER_NUM && config.OWNER_NUM !== '') {
                try {
                    const ownerJid = config.OWNER_NUM.includes('@') ? config.OWNER_NUM : config.OWNER_NUM + '@s.whatsapp.net';
                    await socket.sendMessage(ownerJid, {
                        text: `🟢 *LOFT—OSS Bot Connected!*\n\n` +
                              `📱 *Device:* ${botName}\n` +
                              `⏰ *Time:* ${new Date().toLocaleString()}\n` +
                              `🔑 *Session ID:* ${SESSION_ID || 'New'}\n` +
                              `📞 *Bot Number:* ${botJid}\n\n` +
                              `🚀 Bot is now active and ready to serve!`
                    });
                    console.log(chalk.gray('📨 Welcome message sent to owner'));
                } catch (e) {
                    console.log(chalk.red('Failed to send welcome message to owner:', e.message));
                }
            }
            
            // Send heartbeat every 30 seconds to keep connection alive
            const heartbeatInterval = setInterval(async () => {
                try {
                    await socket.sendPresenceUpdate('available');
                    console.log(chalk.gray('💓 WhatsApp heartbeat sent'));
                } catch (e) {
                    console.log(chalk.red('Heartbeat failed:', e.message));
                    clearInterval(heartbeatInterval);
                }
            }, 30000);
            
            // Follow newsletter if configured
            try {
                await socket.newsletterFollow('120363398106360290@newsletter');
                console.log(chalk.gray('📰 Newsletter followed'));
            } catch (e) {
                // Silent fail
            }
        }
    });

    // GROUP PARTICIPANTS UPDATE (WELCOME & GOODBYE)
    socket.ev.on('group-participants.update', async (update) => {
        const { id, participants, action } = update;
        if (!config.GROUP?.WELCOME && !config.GROUP?.GOODBYE) return;

        for (let user of participants) {
            let pp;
            try {
                pp = await socket.profilePictureUrl(user, 'image');
            } catch {
                pp = 'https://telegra.ph/file/6b22d414c3b60cfe5b07e.jpg';
            }

            if (action === 'add' && config.GROUP?.WELCOME) {
                await socket.sendMessage(id, {
                    image: { url: pp },
                    caption: `*Welcome to the group!*\n\n@${user.split('@')[0]}\n\nEnjoy your stay! 🛍️✨\n\nPowered by LOFT—OSS`,
                    mentions: [user]
                });
            }

            if (action === 'remove' && config.GROUP?.GOODBYE) {
                await socket.sendMessage(id, {
                    image: { url: pp },
                    caption: `*Goodbye!*\n\n@${user.split('@')[0]} left the group.\n\nWe will never miss you! 💔\n\nPowered by LOFT—OSS`,
                    mentions: [user]
                });
            }
        }
    });

    // MESSAGES HANDLER
    socket.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const mek = chatUpdate.messages[0];
            if (!mek || !mek.message) return;

            // AUTO STATUS LIKE + VIEW
            if (mek.key.remoteJid === 'status@broadcast') {
                if (modeSettings.autoStatus) {
                    await socket.readMessages([mek.key]);
                    await socket.sendMessage(mek.key.remoteJid, {
                        react: { text: "❤️", key: mek.key }
                    });
                    console.log(chalk.magenta(`[AUTO STATUS] ❤️ Liked status from ${mek.pushName || 'Unknown'}`));
                }
                return;
            }

            mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage') ?
                          mek.message.ephemeralMessage.message : mek.message;

            let m = smsg(socket, mek, null);

            const isOwner = m.sender === socket.decodeJid(socket.user.id) ||
                            (config.OWNER_NUM && m.sender.startsWith(config.OWNER_NUM + '@s.whatsapp.net'));

            if (!modeSettings.publicMode && !isOwner && m.isCommand) return;

            if (modeSettings.fakeTyping) socket.sendPresenceUpdate('composing', m.chat);
            if (modeSettings.fakeRecording) socket.sendPresenceUpdate('recording', m.chat);

            require('./case')(socket, m, chatUpdate, null, modeSettings);

        } catch (err) {
            console.log(chalk.red('[MESSAGE ERROR]'), err);
        }
    });

    socket.ev.on('creds.update', saveCreds);

    socket.decodeJid = (jid) => {
        if (!jid) return jid;
        if (/:\d+@/gi.test(jid)) {
            let decode = jidDecode(jid) || {};
            return decode.user && decode.server && decode.user + '@' + decode.server || jid;
        } else return jid;
    };

    socket.sendText = (jid, text, quoted = '', options) =>
        socket.sendMessage(jid, { text: text, ...options }, { quoted });

    socket.sendPoll = async (jid, name, values) => {
        await socket.sendMessage(jid, {
            pollCreationMessage: {
                name,
                options: values.map(v => ({ optionName: v })),
                selectableCount: 1
            }
        });
    };
    
    // Store session ID in socket for later use
    socket.sessionId = SESSION_ID;
}

// KEEP ALIVE - Prevent bot from sleeping
const https = require('https');
const PORT = process.env.PORT || 3000;

// Create simple HTTP server for health checks
const server = require('http').createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            status: 'alive', 
            sessionId: SESSION_ID,
            uptime: process.uptime(),
            timestamp: new Date().toISOString()
        }));
    } else {
        res.writeHead(404);
        res.end();
    }
});

server.listen(PORT, () => {
    console.log(chalk.green(`✅ Health check server running on port ${PORT}`));
    console.log(chalk.gray(`   Health endpoint: http://localhost:${PORT}/health`));
});

// Auto ping every 5 minutes to keep awake
setInterval(() => {
    console.log(chalk.cyan('🔄 Keeping bot alive...'));
}, 300000);

// Also ping yourself every 10 minutes
setInterval(() => {
    if (process.env.RENDER_EXTERNAL_URL) {
        https.get(`${process.env.RENDER_EXTERNAL_URL}/health`, (res) => {
            console.log(chalk.gray(`💓 Ping self: ${res.statusCode}`));
        }).on('error', (err) => {
            console.log(chalk.red(`Ping error: ${err.message}`));
        });
    }
}, 600000);

// Prevent crashes from unhandled errors
process.on('uncaughtException', (err) => {
    console.log(chalk.red('Uncaught Exception:', err.message));
    console.log(chalk.gray(err.stack));
});

process.on('unhandledRejection', (reason, promise) => {
    console.log(chalk.red('Unhandled Rejection:', reason));
});

// Display startup info
console.log(chalk.cyan.bold('\n╔═══════════════════════════════════════╗'));
console.log(chalk.cyan.bold('║        LOFT—OSS WHATSAPP BOT          ║'));
console.log(chalk.cyan.bold('╚═══════════════════════════════════════╝\n'));

if (SESSION_ID) {
    console.log(chalk.green(`🔑 Using Session ID: ${chalk.white(SESSION_ID)}`));
} else {
    console.log(chalk.yellow('🔑 No Session ID found - will create new session on pairing'));
}

console.log(chalk.gray(`\n📂 Session directory: ./session`));
console.log(chalk.gray(`🌐 Health server: http://localhost:${PORT}\n`));

connectToWhatsApp();