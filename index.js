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
const config = require('./settings/config');

const { smsg } = require('./system/storage.js');

let modeSettings = config.MODE || {
    publicMode: true,
    fakeTyping: false,
    fakeRecording: false,
    autoStatus: false
};

const usePairingCode = true;

const question = (text) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(text, resolve));
};

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('./session');

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
        const phoneNumber = await question(chalk.yellow('Input Number (Example: 255xxxxxxxxxx):\n'));
        const code = await socket.requestPairingCode(phoneNumber.trim());
        console.log(chalk.black.bgGreen.bold(' LOFT—OSS PAIRING CODE: ') + chalk.white.bgBlue.bold(` ${code} `));
    }

    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            if (statusCode !== DisconnectReason.loggedOut) {
                console.log(chalk.yellow(`Connection closed, reconnecting in 5s...`));
                setTimeout(connectToWhatsApp, 5000);
            } else {
                console.log(chalk.red('Logged Out! Delete ./session folder.'));
            }
        } else if (connection === 'open') {
            console.log(chalk.green.bold('🟢 LOFT—OSS Connected Successfully! 🚀'));
            
            // Send heartbeat every 30 seconds to keep connection alive
            setInterval(async () => {
                try {
                    await socket.sendPresenceUpdate('available');
                    console.log(chalk.gray('💓 WhatsApp heartbeat sent'));
                } catch (e) {
                    console.log(chalk.red('Heartbeat failed:', e.message));
                }
            }, 30000);
            
            try {
                await socket.newsletterFollow('120363398106360290@newsletter');
            } catch {}
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
}

// KEEP ALIVE - Prevent bot from sleeping
const https = require('https');
const PORT = process.env.PORT || 3000;

// Create simple HTTP server for health checks
const server = require('http').createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200);
        res.end('Bot is alive!');
    } else {
        res.writeHead(404);
        res.end();
    }
});

server.listen(PORT, () => {
    console.log(chalk.green(`✅ Health check server running on port ${PORT}`));
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
    console.log(chalk.red('Uncaught Exception:', err));
});

process.on('unhandledRejection', (reason, promise) => {
    console.log(chalk.red('Unhandled Rejection:', reason));
});

connectToWhatsApp();