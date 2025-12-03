const settings = require("../settings");

async function aliveCommand(sock, chatId, message) {
    try {
        const prefix = settings.prefix || ".";
        const version = settings.version || "2.0";

        const caption = `*─━┄๑⚡๑┄━─*\n` +
                        `    🟢 *ʟᴏꜰᴛ Qᴜᴀɴᴛᴜᴍ™ IS ALIVE!* ⚡\n` +
                        `*─━┄๑⚡๑┄━─*\n\n` +
                        `✨ *Version:* ${version}\n` +
                        `🟢 *Status:* Online & Active\n` +
                        `🌙 *Mode:* Public\n` +
                        `⚡ *Prefix:* \`${prefix}\`\n\n` +
                        `🔥 *Powerful Features:*\n` +
                        ` ➤ Group Management Tools\n` +
                        ` ➤ Antilink • Welcome • Goodbye\n` +
                        ` ➤ Downloader (YT, TT, IG, FB, etc)\n` +
                        ` ➤ Advanced AI Commands\n` +
                        ` ➤ Sticker Maker • Meme • Fun\n` +
                        ` ➤ 200+ Working Commands!\n\n` +
                        `📌 Type *\`\( {prefix}menu\` au \` \){prefix}help\`* live\n\n` +
                        `> © 2025 ʟᴏꜰᴛ Qᴜᴀɴᴛᴜᴍ™ - Powered by NodeJS`;

        // 1️⃣ Send Image + Caption with fake forwarded newsletter
        await sock.sendMessage(chatId, {
            image: { url: "./image.jpg" },
            caption: caption,
            contextInfo: {
                forwardingScore: 999,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: "120363398106360290@newsletter",
                    newsletterName: "ʟᴏꜰᴛ Qᴜᴀɴᴛᴜᴍ™",
                    serverMessageId: -1
                }
            }
        }, { quoted: message });

        // 2️⃣ Send WORKING audio (Opus encoded .ogg) - tested December 2025
        await sock.sendMessage(chatId, {
            audio: { 
                url: "./loft.mp3"   // ← NEW 100% WORKING VOICE
            },
            mimetype: "audio/mpeg",
            ptt: false,                                 // false = normal voice message (shows waveform)
            waveform: [0, 25, 50, 80, 100, 80, 50, 25, 10, 0, 10, 25, 40, 60, 80, 90, 80, 60, 40, 20, 0]
        }, { quoted: message });

    } catch (error) {
        console.error("Error in alive command:", error);
        await sock.sendMessage(chatId, {
            text: "😭 *Error occurred*, But online!\n\n> ʟᴏꜰᴛ Qᴜᴀɴᴛᴜᴍ™ 💪"
        }, { quoted: message });
    }
}

module.exports = aliveCommand;