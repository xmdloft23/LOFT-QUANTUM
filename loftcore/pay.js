const { sendButtons, getBuffer } = require('../lib/myfunc');
const settings = require('../settings');
const axios = require('axios');

// ────────────────────────────────────────────────
//                 CONFIGURATION
// ────────────────────────────────────────────────

const PRICE_PER_SCRIPT = 1000;          // TSh per Script
const MIN_SCRIPTS      = 10;
const SELLER_NUMBER    = '255778018545';
const SELLER_JID       = `${SELLER_NUMBER}@s.whatsapp.net`;
const SELLER_NAME      = 'HELLENA LUHWAGO';

const AD_BANNER_1 = 'https://files.catbox.moe/1mv2al.jpg';      // Calculation banner
const AD_BANNER_2 = 'https://files.catbox.moe/ljabyq.png';      // Payment banner
const CONFIRMATION_AUDIO = 'https://files.catbox.moe/t80fnj.mp3';

// Axios global defaults
axios.defaults = {
    ...axios.defaults,
    timeout: 30000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
};

// Simple in-memory counter (bad for production → use DB)
let orderCounter = 1000;

// ────────────────────────────────────────────────
//                   HELPER FUNCTIONS
// ────────────────────────────────────────────────

function formatNumber(n) {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function generateOrderRef() {
    return `HALO-\( {Date.now().toString().slice(-6)}- \){++orderCounter}`;
}

async function downloadAudioBuffer(url, maxAttempts = 3) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            console.log(`[Pay] Audio download attempt \( {attempt}/ \){maxAttempts}`);
            const { data } = await axios.get(url, { responseType: 'arraybuffer' });
            
            const buffer = Buffer.from(data);
            if (buffer.length === 0) throw new Error('Empty audio buffer');
            
            console.log(`[Pay] Audio downloaded successfully (${buffer.length} bytes)`);
            return buffer;
        } catch (err) {
            console.error(`[Pay] Audio attempt ${attempt} failed:`, err.message);
            if (attempt === maxAttempts) throw err;
            await new Promise(r => setTimeout(r, 1000 * attempt));
        }
    }
}

// ────────────────────────────────────────────────
//                   MAIN COMMAND
// ────────────────────────────────────────────────

async function payCommand(sock, chatId, message, userMessage = '') {
    try {
        // Security: Private chat only
        if (chatId.endsWith('@g.us')) {
            return await sock.sendMessage(chatId, {
                text: '🔒 Command hii inafanya kazi tu kwenye private chat kwa usalama.'
            }, { quoted: message });
        }

        const text = (userMessage || 
            message.message?.conversation || 
            message.message?.extendedTextMessage?.text || 
            '').trim().toLowerCase();

        const args = text.split(/\s+/).slice(1);

        // Show help menu
        if (args.length === 0) {
            const helpText = `╔══════════════════════════════╗
║      ⚡ PAY PREMIUM ⚡     ║
╚══════════════════════════════╝

🎁 *Nunua Premium Scripts!*

📝 *Jinsi ya ku-order:*
 .pay <idadi> [namba] [jina]

⚙️ Bei:
💰 TSh ${formatNumber(PRICE_PER_SCRIPT)} kwa kila Script
📦 Kima cha chini: ${MIN_SCRIPTS} Script

Mfano:
• .pay 20
• .pay 30 255712345678 Shaddy

✨ Faida:
✅ Delivery papo hapo
✅ Malipo salama
✅ Support 24/7

❓ Hitaji msaada? Reply hapa moja kwa moja!`;

            return await sock.sendMessage(chatId, { text: helpText }, { quoted: message });
        }

        // ─── Parse arguments ────────────────────────────────────────
        let scripts = null;
        let phone = null;
        let name = '';

        // 1. Tafuta idadi ya scripts
        for (let i = 0; i < args.length; i++) {
            const cleaned = args[i].replace(/[^0-9]/g, '');
            const num = parseInt(cleaned, 10);
            if (!isNaN(num) && num >= MIN_SCRIPTS) {
                scripts = num;
                args.splice(i, 1);
                break;
            }
        }

        // 2. Tafuta namba ya simu
        for (let i = 0; i < args.length; i++) {
            const digits = args[i].replace(/[^0-9]/g, '');
            if (digits.length >= 9 && digits.length <= 13) {
                phone = digits;
                args.splice(i, 1);
                break;
            }
        }

        // 3. Jina la mteja (optional)
        if (args.length > 0) {
            name = args.join(' ').trim();
        }

        // ─── Validation ─────────────────────────────────────────────
        if (!scripts) {
            return await sock.sendMessage(chatId, {
                text: `❌ Idadi batili\nKima cha chini ni ${MIN_SCRIPTS} Script\nMfano: .pay 20`
            }, { quoted: message });
        }

        if (!phone) {
            return await sock.sendMessage(chatId, {
                text: '❌ Namba ya simu inahitajika\nMfano: .pay 30 255712345678'
            }, { quoted: message });
        }

        const total = scripts * PRICE_PER_SCRIPT;
        const orderId = generateOrderRef();

        // ─── 1. Order Summary ───────────────────────────────────────
        const summary = `╭══════════════════════════════╮
║     ORDER SUMMARY #${orderId}     ║
╰══════════════════════════════╯

📦 Scripts     : ${scripts}
💰 Jumla      : TSh ${formatNumber(total)}
📱 Namba      : +${phone}
👤 Jina       : ${name || '(Haijawekwa)'}

⏳ Inasubiri malipo...`;

        let banner1;
        try { banner1 = await getBuffer(AD_BANNER_1); } catch {}

        await sock.sendMessage(chatId, {
            text: summary,
            contextInfo: banner1 ? {
                externalAdReply: {
                    title: `Order ${orderId}`,
                    body: `${scripts} Script • TSh ${formatNumber(total)}`,
                    thumbnail: banner1,
                    mediaType: 1,
                    renderLargerThumbnail: true,
                    sourceUrl: settings.homepage || ''
                }
            } : {}
        }, { quoted: message });

        await new Promise(r => setTimeout(r, 1400));

        // ─── 2. Maelekezo ya Malipo ────────────────────────────────
        const paymentInfo = `╭══════════════════════════════╮
║     MAelekezo YA MALIPO      ║
╰══════════════════════════════╯

👤 Muuzaji:
├ Name : ${SELLER_NAME}
├ Namba: +${SELLER_NUMBER}
└ Status: 🟢 24/7 Online

💵 Malipo:
├ Kiasi : TSh ${formatNumber(total)}
├ Order : ${orderId}
└ Njia : M-Pesa / Card

Baada ya kulipa:
1. Tumia screenshot hapa
2. Au reply: PAID ${orderId} [M-Pesa ID]
3. Au wasiliana na muuzaji moja kwa moja`;

        let banner2;
        try { banner2 = await getBuffer(AD_BANNER_2); } catch {}

        const buttons = [
            {
                urlButton: {
                    displayText: '💳 Lipa kwa WhatsApp',
                    url: `https://wa.me/\( {SELLER_NUMBER}?text= \){encodeURIComponent(
                        `ORDER \( {orderId}\n \){scripts} Script kwa ${phone}\nJumla: TSh ${formatNumber(total)}\nJina: ${name || '—'}`
                    )}`
                }
            },
            {
                quickReplyButton: {
                    displayText: '📞 Piga Muuzaji',
                    id: `.contact ${SELLER_NUMBER}`
                }
            }
        ];

        await sendButtons(
            sock,
            chatId,
            paymentInfo,
            'Chagua njia ya kulipa ⤵️',
            buttons,
            message,
            banner2 ? {
                contextInfo: {
                    externalAdReply: {
                        title: 'Malipo Salama',
                        body: 'Thibitisho haraka • Delivery papo hapo',
                        thumbnail: banner2,
                        mediaType: 1,
                        renderLargerThumbnail: true
                    }
                }
            } : {}
        );

        await new Promise(r => setTimeout(r, 1400));

        // ─── 3. Ujumbe wa mwisho + Audio ───────────────────────────
        await sock.sendMessage(chatId, {
            text: `✅ *Order ${orderId} Imepokewa!*\n\nTafadhali endelea na malipo ili tuwasilishe scripts haraka.\n\nAsante kwa kuchagua ʟᴏꜰᴛ Qᴜᴀɴᴛᴜᴍ™! 🚀`
        }, { quoted: message });

        await new Promise(r => setTimeout(r, 1500));

        // Jaribu kutuma audio (optional)
        try {
            const audio = await downloadAudioBuffer(CONFIRMATION_AUDIO);
            await sock.sendMessage(chatId, {
                audio: audio,
                mimetype: 'audio/mpeg',
                fileName: `confirmation-${orderId}.mp3`,
                ptt: false
            });
        } catch (e) {
            console.log('[PAY] Audio haikutumika:', e.message);
            // No error to user - audio ni bonus tu
        }

        // ─── Notify seller ──────────────────────────────────────────
        const sellerMsg = `🔔 *NEW PAYMENT ORDER* 🔔

Order ID   : ${orderId}
Scripts    : ${scripts}
Kwa Namba  : +${phone}
Jina       : ${name || '(Haijawekwa)'}
Jumla      : TSh ${formatNumber(total)}
Mteja JID  : ${chatId.split('@')[0]}
Muda       : ${new Date().toLocaleString('sw-TZ')}

Inasubiri uthibitisho wa malipo...`;

        sock.sendMessage(SELLER_JID, { text: sellerMsg })
            .catch(err => console.log('[Pay] Seller notification failed:', err.message));

    } catch (err) {
        console.error('[Pay] Error:', err);

        let reply = '⚠️ Hitilafu imetokea. Jaribu tena kidogo.';
        if (err.message?.includes('timeout') || err.message?.includes('network')) {
            reply = '⚠️ Tatizo la mtandao. Angalia mtandao wako na jaribu tena.';
        }

        await sock.sendMessage(chatId, { text: reply }, { quoted: message })
            .catch(() => {});
    }
}

module.exports = payCommand;