const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    jidDecode,
} = require("@whiskeysockets/baileys")

const chalk = require('chalk');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const express = require('express');
const config = require('./settings/config');

const { smsg } = require('./system/storage.js');
const sessionManager = require('./system/session.js');

let modeSettings = config.MODE || {
    publicMode: true,
    fakeTyping: false,
    fakeRecording: false,
    autoStatus: false
};

const usePairingCode = true;

// =============== SESSION PATH MANAGEMENT ===============
function getSessionPath() {
    const { SESSION_ID } = sessionManager;
    if (SESSION_ID && SESSION_ID !== 'null' && SESSION_ID !== 'undefined' && SESSION_ID !== '') {
        const sessionFolder = `session_${SESSION_ID.substring(0, 20)}`;
        return path.join(__dirname, "loft", sessionFolder);
    }
    return path.join(__dirname, "loft", "session");
}

const question = (text) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(text, resolve));
};

async function connectToWhatsApp() {
    const currentSessionPath = getSessionPath();
    
    if (!fs.existsSync(currentSessionPath)) {
        fs.mkdirSync(currentSessionPath, { recursive: true });
    }
    
    console.log(chalk.cyan(`📂 Session path: ${currentSessionPath}`));
    
    // Try to load existing session from SESSION_ID first
    const loadedCreds = await sessionManager.loadSessionFromId();
    
    const { state, saveCreds } = await useMultiFileAuthState(currentSessionPath);
    
    // If we have loaded creds from SESSION_ID, merge them
    if (loadedCreds && !state.creds.registered) {
        console.log(chalk.green("✅ Merging loaded session credentials"));
        Object.assign(state.creds, loadedCreds);
    }

    const { version } = await fetchLatestBaileysVersion();

    const socket = makeWASocket({
        version,
        printQRInTerminal: !usePairingCode,
        syncFullHistory: false,
        markOnlineOnConnect: true,
        browser: ['Ubuntu', 'Chrome', '20.0.04'],
        logger: pino({ level: 'silent' }),
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino().child({ level: 'silent', stream: 'store' }))
        }
    });

    if (usePairingCode && !socket.authState.creds.registered) {
        const phoneNumber = await question(chalk.yellow('📱 Input Number (Example: 255xxxxxxxxxx):\n'));
        const code = await socket.requestPairingCode(phoneNumber.trim());
        console.log(chalk.black.bgGreen.bold(' LOFT—OSS PAIRING CODE: ') + chalk.white.bgBlue.bold(` ${code} `));
    }

    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            if (statusCode !== DisconnectReason.loggedOut) {
                console.log(chalk.yellow(`⚠️ Connection closed, reconnecting in 5s...`));
                setTimeout(connectToWhatsApp, 5000);
            } else {
                console.log(chalk.red('❌ Logged Out!'));
                if (sessionManager.SESSION_ID) {
                    console.log(chalk.yellow(`📱 Your session ID was set. To reuse, keep same SESSION_ID`));
                }
            }
        } else if (connection === 'open') {
            console.log(chalk.green.bold('🟢 LOFT—OSS Connected Successfully! 🚀'));
            
            // Save session as compressed ID for backup
            if (socket.authState.creds.registered) {
                const sessionIdString = await sessionManager.saveSessionToId(socket.authState.creds);
                if (sessionIdString && !sessionManager.SESSION_ID) {
                    console.log(chalk.yellow.bold('\n💾 SAVE THIS SESSION ID FOR FUTURE USE:\n'));
                    console.log(chalk.green.bold(sessionIdString));
                    console.log(chalk.yellow.bold('\n📋 Copy this and use as SESSION_ID environment variable\n'));
                }
            }
            
            // Send heartbeat every 30 seconds
            setInterval(async () => {
                try {
                    await socket.sendPresenceUpdate('available');
                } catch (e) {}
            }, 30000);
            
            try {
                await socket.newsletterFollow('120363398106360290@newsletter');
            } catch {}
        }
    });

    // GROUP PARTICIPANTS UPDATE
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
                    caption: `*Goodbye!*\n\n@${user.split('@')[0]} left the group.\n\nWe will miss you! 💔\n\nPowered by LOFT—OSS`,
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

            if (mek.key.remoteJid === 'status@broadcast') {
                if (modeSettings.autoStatus) {
                    await socket.readMessages([mek.key]);
                    await socket.sendMessage(mek.key.remoteJid, {
                        react: { text: "❤️", key: mek.key }
                    });
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

    socket.ev.on('creds.update', async (creds) => {
        await saveCreds();
        // Save as compressed ID whenever creds update
        if (creds.registered) {
            await sessionManager.saveSessionToId(creds);
        }
    });

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
}

// =============== KEEP ALIVE SERVER ===============
const PORT = process.env.PORT || 3000;
const server = require('http').createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200);
        res.end('Bot is alive!');
    } else if (req.url === '/session') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            hasSessionId: !!sessionManager.SESSION_ID,
            sessionPath: getSessionPath()
        }));
    } else {
        res.writeHead(404);
        res.end();
    }
});

server.listen(PORT, () => {
    console.log(chalk.green(`✅ Server running on port ${PORT}`));
});

// Auto ping every 5 minutes
setInterval(() => {
    console.log(chalk.cyan('🔄 Keeping bot alive...'));
}, 300000);

// Ping self every 10 minutes
setInterval(() => {
    if (process.env.RENDER_EXTERNAL_URL) {
        const https = require('https');
        https.get(`${process.env.RENDER_EXTERNAL_URL}/health`, () => {});
    }
}, 600000);

// Prevent crashes
process.on('uncaughtException', (err) => {
    console.log(chalk.red('Uncaught Exception:', err));
});

process.on('unhandledRejection', (reason) => {
    console.log(chalk.red('Unhandled Rejection:', reason));
});

// Start bot
console.log(chalk.cyan('\n╔═══════════════════════════════════════╗'));
console.log(chalk.cyan('║       LOFT—OSS SESSION MANAGER        ║'));
console.log(chalk.cyan('╠═══════════════════════════════════════╣'));
if (sessionManager.SESSION_ID) {
    console.log(chalk.green(`║  SESSION ID: ${sessionManager.SESSION_ID.substring(0, 30)}...║`));
} else {
    console.log(chalk.yellow(`║  SESSION ID: not set (new session)   ║`));
}
console.log(chalk.cyan(`║  PORT: ${String(PORT).padEnd(30)}║`));
console.log(chalk.cyan('╚═══════════════════════════════════════╝\n'));

connectToWhatsApp();