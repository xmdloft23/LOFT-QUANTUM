'use strict';

const os = require('os');
const { getStr } = require('../lib/theme');

module.exports = {
    commands:    ['call', 'support', 'ss'],
    description: 'Support panel',
    permission:  'public',
    group:       true,
    private:     true,
    run: async (sock, message, args, { sender, contextInfo }) => {
        const botName = getStr('botName') || 'LOFT-QUANTUM';
        const pic     = getStr('pic1') || 'https://files.catbox.moe/d4nl2o.jpg';

        const nairobiTime = new Date().toLocaleTimeString('en-KE', {
            hour: 'numeric', minute: 'numeric', hour12: true, timeZone: 'Africa/Nairobi'
        });
        const nairobiDate = new Date().toLocaleDateString('en-KE', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Africa/Nairobi'
        });

        const uptime  = process.uptime();
        const hours   = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);

        const sub = args[0]?.toLowerCase() || 'menu';

        if (sub === 'status') {
            return sock.sendMessage(sender, {
                text:
`🖥️ *System Status*

⏰ ${nairobiTime} — ${nairobiDate}
⏳ Uptime: ${hours}h ${minutes}m ${seconds}s
💻 Platform: ${os.platform()} ${os.arch()}
🧠 Memory: ${(os.freemem() / 1048576).toFixed(0)} MB free of ${(os.totalmem() / 1048576).toFixed(0)} MB`,
                contextInfo
            }, { quoted: message });
        }

        if (sub === 'social') {
            return sock.sendMessage(sender, {
                text:
`🚀 *Meet Quantum Online*

• Facebook: https://web.facebook.com/loft loft
• Instagram: https://instagram.com/LOFTxmd
• X (Twitter): https://x.com/LOFTxmd`,
                contextInfo
            }, { quoted: message });
        }

        await sock.sendMessage(sender, {
            image:   { url: pic },
            caption:
`『 *${botName}* 』
© 2026 QUANTUM 🚀*

⏰ *${nairobiTime}*
📅 *${nairobiDate}*

*Support Options:*
• .call status — System status
• .call social — Social media links
• WhatsApp: https://wa.me/255778018545`,
            contextInfo: {
                ...contextInfo,
                externalAdReply: {
                    title:        `${botName} Support`,
                    body:         'Available 24/7',
                    thumbnailUrl: pic,
                    sourceUrl:    'https://wa.me/255778018545',
                    mediaType:    1
                }
            }
        }, { quoted: message });
    }
};
