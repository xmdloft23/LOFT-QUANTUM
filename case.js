const {
    getAggregateVotesInPollMessage,
    prepareWAMessageMedia,
    generateWAMessageFromContent,
    proto
} = require('@whiskeysockets/baileys');

const fs = require('fs');
const axios = require('axios');
const util = require('util');
const { XMLParser } = require('fast-xml-parser');
const config = require('./settings/config');
const yts = require("yt-search");
const { exec } = require('child_process');
const { oss, toPtt, formatAudio, formatVideo, ossBuffer } = require("./loft/ossfunction");
const { getGroupSetting, setGroupSetting } = require("./loft/database/groupSettings");
const { sendButtons } = require("gifted-btns"); 
// Add these imports at the top of your file with other imports
const {
    getLidMapping,
    getGroupMetadata,
    getContextInfo  // You'll need to implement this or import it
} = require("./loft/connection/groupCache");

// Add these helper functions after your existing utility functions

function getUserName(jid) {
    return jid.split("@")[0];
}

function normalizeUserJid(jid) {
    if (!jid || typeof jid !== "string") return "";
    
    if (jid.endsWith("@lid")) {
        const mapped = getLidMapping(jid);
        if (mapped) return mapped;
    }
    
    let normalized = jid.split(":")[0].split("/")[0];
    if (!normalized.includes("@")) {
        normalized += "@s.whatsapp.net";
    }
    
    if (normalized.endsWith("@lid")) {
        const mapped = getLidMapping(normalized);
        if (mapped) return mapped;
    }
    
    return normalized;
}

function extractCode(text) {
    const codePatterns = [
        /\b(\d{4,8})\b/,
        /code[:\s]+(\d{4,8})/i,
        /verification[:\s]+(\d{4,8})/i,
        /otp[:\s]+(\d{4,8})/i,
        /pin[:\s]+(\d{4,8})/i,
    ];
    
    for (const pattern of codePatterns) {
        const match = text.match(pattern);
        if (match) return match[1];
    }
    return null;
}

// ========== RATE LIMITING & CACHE ==========
const cooldowns = new Map();
const groupMetadataCache = new Map();
const CACHE_TTL = 60000; // 1 minute

// ========== DELAY FUNCTION ==========
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ========== CACHED GROUP METADATA ==========
async function getCachedGroupMetadata(socket, chatId) {
    const now = Date.now();
    const cached = groupMetadataCache.get(chatId);
    
    if (cached && (now - cached.timestamp) < CACHE_TTL) {
        return cached.data;
    }
    
    try {
        const metadata = await socket.groupMetadata(chatId);
        groupMetadataCache.set(chatId, {
            data: metadata,
            timestamp: now
        });
        return metadata;
    } catch (error) {
        if (cached) return cached.data;
        throw error;
    }
}

// ========== UTILITY FUNCTIONS ==========
function runtime(seconds) {
    seconds = Number(seconds);
    var d = Math.floor(seconds / (3600 * 24));
    var h = Math.floor(seconds % (3600 * 24) / 3600);
    var m = Math.floor(seconds % 3600 / 60);
    var s = Math.floor(seconds % 60);
    var dDisplay = d > 0 ? d + (d == 1 ? " day, " : " days, ") : "";
    var hDisplay = h > 0 ? h + (h == 1 ? " hour, " : " hours, ") : "";
    var mDisplay = m > 0 ? m + (m == 1 ? " minute, " : " minutes, ") : "";
    var sDisplay = s > 0 ? s + (s == 1 ? " second" : " seconds") : "";
    return dDisplay + hDisplay + mDisplay + sDisplay;
}

// ========== BOT MODE ==========
let botMode = 'public';

// ========== LOFT FUNCTION ==========
async function loft(socket, m, text, buttons = [], title = "✨ LOFT—OSS ✨", footer = null) {
    try {
        const defaultFooter = `🛍️ Premium WhatsApp Bot | ⏰ ${runtime(process.uptime())}`;
        const finalFooter = footer || defaultFooter;
        
        if (!buttons || buttons.length === 0) {
            await socket.sendMessage(m.chat, { text: text }, { quoted: m });
            return;
        }
        
        const giftedButtons = buttons.map(btn => {
            if (btn.type === 2 || (btn.buttonId && btn.buttonId.startsWith('http'))) {
                return {
                    name: "cta_url",
                    buttonParamsJson: JSON.stringify({
                        display_text: btn.buttonText?.displayText || 'Visit Link',
                        url: btn.buttonId
                    })
                };
            } else {
                return {
                    id: btn.buttonId,
                    text: btn.buttonText?.displayText || 'Click'
                };
            }
        });
        
        await sendButtons(socket, m.chat, {
            title: title,
            text: text,
            footer: finalFooter,
            buttons: giftedButtons
        });
        
    } catch (err) {
        console.error("Loft Error:", err);
        await socket.sendMessage(m.chat, { text: text }, { quoted: m });
    }
}

// ========== GIFTED TECH API ==========
const isValidBuffer = (buf) => Buffer.isBuffer(buf) && buf.length > 10240;
const GIFTED_TECH_API = 'https://api.gifted.co.ke';
const GIFTED_API_KEY = 'gifted';

async function queryGiftedAPI(query, endpoints, timeout = 25000) {
    for (const endpoint of endpoints) {
        try {
            await delay(1000);
            const apiUrl = `${GIFTED_TECH_API}/api/download/${endpoint}?apikey=${GIFTED_API_KEY}&url=${encodeURIComponent(query)}`;
            const res = await axios.get(apiUrl, { timeout });
            
            let downloadUrl = null;
            
            if (res.data?.status === 200 || res.data?.success) {
                if (res.data?.result?.download_url) {
                    downloadUrl = res.data.result.download_url;
                } else if (res.data?.result?.url) {
                    downloadUrl = res.data.result.url;
                } else if (res.data?.download_url) {
                    downloadUrl = res.data.download_url;
                } else if (res.data?.url) {
                    downloadUrl = res.data.url;
                }
            }
            
            if (downloadUrl) {
                return { success: true, data: res.data, endpoint, download_url: downloadUrl };
            }
        } catch (e) {
            continue;
        }
    }
    return { success: false, error: "All endpoints failed" };
}

// Endpoints
const audioEndpoints = ['ytmp3v2', 'ytaudio', 'yta', 'ytmp3', 'savetubemp3', 'savemp3'];
const videoEndpoints = ['ytmp4v2', 'ytvideo', 'ytv', 'ytmp4', 'savetubemp4', 'savemp4'];
const tiktokEndpoints = ['tikdown', 'tiktok'];
const igEndpoints = ['instagram', 'igdown'];
const fbEndpoints = ['fbdown2', 'fbdown'];
const twitterEndpoints = ['twitterdown', 'twitter'];

// ========== DOWNLOADER HELPERS ==========
async function downloadMediaMessage(msg, type) {
    const stream = await msg.download();
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
    }
    return buffer;
}

async function uploadToCatbox(buffer) {
    const FormData = require('form-data');
    const form = new FormData();
    form.append('reqtype', 'fileupload');
    form.append('fileToUpload', buffer, 'file');
    const res = await axios.post('https://catbox.moe/user/api.php', form, {
        headers: { ...form.getHeaders() }
    });
    return res.data;
}

async function writeExifImg(buffer, metadata) {
    const { Sticker, StickerTypes } = require('wa-sticker-formatter');
    const sticker = new Sticker(buffer, {
        pack: metadata.packname,
        author: metadata.author,
        type: StickerTypes.FULL,
        categories: ['🤩', '🎉'],
        id: '12345',
        quality: 80,
        background: '#00000000'
    });
    return await sticker.toBuffer();
}

// ========== MAIN HANDLER ==========
module.exports = async (socket, m, chatUpdate, store) => {
    try {
        const body = (m.mtype === 'conversation') ? m.message.conversation :
                     (m.mtype === 'imageMessage') ? m.message.imageMessage.caption :
                     (m.mtype === 'videoMessage') ? m.message.videoMessage.caption :
                     (m.mtype === 'extendedTextMessage') ? m.message.extendedTextMessage.text :
                     (m.mtype === 'buttonsResponseMessage') ? m.message.buttonsResponseMessage.selectedButtonId :
                     (m.mtype === 'listResponseMessage') ? m.message.listResponseMessage.singleSelectReply.selectedRowId :
                     (m.mtype === 'templateButtonReplyMessage') ? m.message.templateButtonReplyMessage.selectedId :
                     (m.mtype === 'interactiveResponseMessage') ? JSON.parse(m.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson).id : '';

        const prefix = /^[°•π÷×¶∆£¢€¥®™+✓_=|~!?@#\( %^&.©^]/gi.test(body) ? body.match(/^[°•π÷×¶∆£¢€¥®™+✓_=|~!?@# \)%^&.©^]/gi)[0] : (config.PREFIX || '.');
        const isCmd = body.startsWith(prefix);
        const command = isCmd ? body.slice(prefix.length).trim().split(/ +/).shift().toLowerCase() : '';
        const args = body.trim().split(/ +/).slice(1);
        const text = args.join(' ');
        const pushname = m.pushName || "User";
        
        const sender = m.key.fromMe ? (socket.user.id.split(':')[0] + '@s.whatsapp.net') : (m.key.participant || m.key.remoteJid);
        const isOwner = [config.OWNER_NUM + "@s.whatsapp.net"].includes(sender) || m.key.fromMe;
        const isGroup = m.key.remoteJid.endsWith('@g.us');
        
        if (botMode === 'private' && !isOwner && isCmd) {
            return socket.sendMessage(m.chat, { text: "🔒 *Bot is in Private Mode!*\nOnly owner can use commands." }, { quoted: m });
        }
        
        // Rate limiting
        if (isCmd && !isOwner) {
            const cooldownKey = `${sender}_${command}`;
            if (cooldowns.has(cooldownKey)) {
                const remaining = (cooldowns.get(cooldownKey) - Date.now()) / 1000;
                if (remaining > 0) {
                    return socket.sendMessage(m.chat, { 
                        text: `🐌 *Slow down!*\nWait ${remaining.toFixed(1)} seconds before using \`${command}\` again.`
                    }, { quoted: m });
                }
            }
            cooldowns.set(cooldownKey, Date.now() + 3000);
        }
        
        // Get group metadata with caching
        let groupMetadata = null;
        let isAdmin = false;
        let isBotAdmin = false;
        
        if (isGroup) {
            try {
                groupMetadata = await getCachedGroupMetadata(socket, m.chat);
                isAdmin = groupMetadata.participants.some(p => p.id === sender && (p.admin === 'admin' || p.admin === 'superadmin'));
                const botJid = socket.user.id.split(':')[0] + '@s.whatsapp.net';
                isBotAdmin = groupMetadata.participants.some(p => p.id === botJid && (p.admin === 'admin' || p.admin === 'superadmin'));
            } catch(e) {
                console.log("Group metadata error:", e);
            }
        }

        if (isCmd) {
            console.log(`[ COMMAND ] ${new Date().toLocaleString()} - ${command} from ${pushname}`);
        }
        
        // Handle menu category buttons
        if (body.startsWith('menu_')) {
            const category = body.replace('menu_', '');
            
            const categoryMenus = {
                owner: `╭━━❪ 👑 *OWNER COMMANDS* ❫━━┈⊷
┃
┃ ✦ ${prefix}alive       
┃ ✦ ${prefix}menu     
┃ ✦ ${prefix}owner      
┃ ✦ ${prefix}ping        
┃ ✦ ${prefix}publicmode  
┃ ✦ ${prefix}privatemode 
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`,
                
                ai: `╭━━❪ 🤖 *AI COMMANDS* ❫━━┈⊷
┃
┃ ✦ ${prefix}ai [question]     
┃ ✦ ${prefix}img [description] 
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`,
                
                tools: `╭━━❪ 🛠️ *TOOLS COMMANDS* ❫━━┈⊷
┃
┃ ✦ ${prefix}sticker       
┃ ✦ ${prefix}vv            
┃ ✦ ${prefix}jid          
┃ ✦ ${prefix}emojimix 😎+😂 
┃ ✦ ${prefix}tempemail    
┃ ✦ ${prefix}quote        
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`,
                
                converter: `╭━━❪ 🔄 *CONVERTER COMMANDS* ❫━━┈⊷
┃
┃ ✦ ${prefix}calc [exp] 
┃ ✦ ${prefix}tourl      
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`,
                
                search: `╭━━❪ 🔍 *SEARCH COMMANDS* ❫━━┈⊷
┃
┃ ✦ ${prefix}meme         
┃ ✦ ${prefix}ytsearch [q]   
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`,
                
                news: `╭━━❪ 📰 *NEWS COMMANDS* ❫━━┈⊷
┃
┃ ✦ ${prefix}news         
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`,
                
                // Add to your categoryMenus object:
                              
                downloader: `╭━━❪ 📥 *DOWNLOADER COMMANDS* ❫━━┈⊷
┃
┃ ✦ ${prefix}play [song/url]    
┃ ✦ ${prefix}video [title/url]    
┃ ✦ ${prefix}sendaudio [url]    
┃ ✦ ${prefix}sendvideo [url]    
┃ ✦ ${prefix}tiktok [url]    
┃ ✦ ${prefix}ig [url]        
┃ ✦ ${prefix}fb [url]
┃ ✦ ${prefix}twitter [url]        
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`,
                
                group: `╭━━❪ 👥 *GROUP COMMANDS* ❫━━┈⊷
┃
┃ ✦ ${prefix}tagall       
┃ ✦ ${prefix}hidetag     
┃ ✦ ${prefix}tagadmins    
┃ ✦ ${prefix}promote   
┃ ✦ ${prefix}demote     
┃ ✦ ${prefix}kick         
┃ ✦ ${prefix}add [number] 
┃ ✦ ${prefix}mute         
┃ ✦ ${prefix}unmute      
┃ ✦ ${prefix}groupname    
┃ ✦ ${prefix}gcdesc     
┃ ✦ ${prefix}link         
┃ ✦ ${prefix}resetlink    
┃ ✦ ${prefix}listrequests 
┃ ✦ ${prefix}accept     
┃ ✦ ${prefix}reject      
┃ ✦ ${prefix}acceptall   
┃ ✦ ${prefix}rejectall    
┃ ✦ ${prefix}met         
┃ ✦ ${prefix}online       
┃ ✦ ${prefix}newgroup     
┃ ✦ ${prefix}left         
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`,
                
                more: `╭━━❪ 📜 *MORE COMMANDS* ❫━━┈⊷
┃
┃ ✦ ${prefix}lyrics [song] 
┃ ✦ ${prefix}qouteislamic 
┃ ✦ ${prefix}qoutechristian 
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`
            };
            
            const replyText = categoryMenus[category] || `╭━━❪ 🚀 *CATEGORY NOT FOUND* ❫━━┈⊷
┃
┃ Type ${prefix}menu to see all categories!
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`;
            
            await loft(socket, m, replyText, [
                { buttonId: `${prefix}menu`, buttonText: { displayText: '🔙 BACK TO MENU' }, type: 1 }
            ], "📁 CATEGORY MENU");
            return;
        }
        
        // ========== COMMANDS ==========
        switch (command) {
            
            case 'menu': {
                let menuText = `> ╭━━❪ ✨ *HELLO ${pushname}* ✨ ❫━━┈⊷
> ┃
> ┃ 👑 *Owner* : Mr LOFT
> ┃ ⚡ *Prefix* : [ ${prefix} ]
> ┃ 📱 *Number* : ${config.OWNER_NUM}
> ┃ ⏰ *Runtime* : ${runtime(process.uptime())}
> ┃
> ┃ 📌 *Click buttons below!*
> ┃
> ╰━━━━━━━━━━━━━━━━━━━━━┈⊷
*© LOFT—OSS* 🛍️`;

                const buttons = [
                    { buttonId: 'menu_owner', buttonText: { displayText: '👑 OWNER' }, type: 1 },
                    { buttonId: 'menu_ai', buttonText: { displayText: '🤖 AI' }, type: 1 },
                    { buttonId: 'menu_tools', buttonText: { displayText: '🛠️ TOOLS' }, type: 1 },
                    { buttonId: 'menu_converter', buttonText: { displayText: '🔄 CONVERTER' }, type: 1 },
                    { buttonId: 'menu_search', buttonText: { displayText: '🔍 SEARCH' }, type: 1 },
                    { buttonId: 'menu_news', buttonText: { displayText: '📰 NEWS' }, type: 1 },
                    { buttonId: 'menu_downloader', buttonText: { displayText: '📥 DOWNLOADER' }, type: 1 },
                    { buttonId: 'menu_group', buttonText: { displayText: '👥 GROUP' }, type: 1 },
                    { buttonId: 'menu_more', buttonText: { displayText: '📜 MORE' }, type: 1 }
                ];

                await loft(socket, m, menuText, buttons, "");
                break;
            }

            case 'alive': {
                const aliveText = `╭━━❪ 🟢 *BOT ACTIVE* 🟢 ❫━━┈⊷
┃
┃ 🤖 *Name*    : LOFT—OSS
┃ 👑 *Owner*   : Mr LOFT
┃ ⚡ *Runtime* : ${runtime(process.uptime())}
┃ 📅 *Date*    : ${new Date().toLocaleDateString()}
┃ ⏰ *Time*    : ${new Date().toLocaleTimeString()}
┃ 🚀 *Version* : 2.5.0
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷

✨ *I'm online 24/7! Type ${prefix}menu to start* ✨`;

                await loft(socket, m, aliveText, [
                    { buttonId: `${prefix}menu`, buttonText: { displayText: '📋 MENU' }, type: 1 },
                    { buttonId: `${prefix}owner`, buttonText: { displayText: '👑 OWNER' }, type: 1 }
                ], "🟢 BOT STATUS");
                break;
            }

            case 'ping': {
                const start = Date.now();
                await socket.sendPresenceUpdate('composing', m.chat);
                const end = Date.now();
                const pingTime = end - start;

                const pingText = `╭━━❪ 🏓 *PONG!* 🏓 ❫━━┈⊷
┃
┃ ⚡ *Latency* : ${pingTime} ms
┃ 🚀 *Runtime* : ${runtime(process.uptime())}
┃ 📊 *Status*  : ${pingTime < 200 ? '🟢 Excellent' : pingTime < 500 ? '🟡 Good' : '🔴 Slow'}
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷

✨ *Bot is running smoothly!* ✨`;

                await loft(socket, m, pingText, [
                    { buttonId: `${prefix}menu`, buttonText: { displayText: '📋 MENU' }, type: 1 },
                    { buttonId: `${prefix}alive`, buttonText: { displayText: '✨ ALIVE' }, type: 1 }
                ], "🏓 PONG!");
                break;
            }
            
            case 'publicmode': {
                if (!isOwner) {
                    return loft(socket, m, `╭━━❪ 🚀 *OWNER ONLY* ❫━━┈⊷\n┃\n┃ This command is for owner only!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 OWNER ONLY");
                }
                botMode = 'public';
                await loft(socket, m, `╭━━❪ 🌐 *PUBLIC MODE* 🌐 ❫━━┈⊷
┃
┃ Bot is now in PUBLIC MODE!
┃ Everyone can use commands.
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [
                    { buttonId: `${prefix}menu`, buttonText: { displayText: '📋 MENU' }, type: 1 }
                ], "🌐 PUBLIC MODE");
                break;
            }
            
            case 'privatemode': {
                if (!isOwner) {
                    return loft(socket, m, `╭━━❪ 🚀 *OWNER ONLY* ❫━━┈⊷\n┃\n┃ This command is for owner only!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 OWNER ONLY");
                }
                botMode = 'private';
                await loft(socket, m, `╭━━❪ 🔒 *PRIVATE MODE* 🔒 ❫━━┈⊷
┃
┃ Bot is now in PRIVATE MODE!
┃ Only owner can use commands.
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [
                    { buttonId: `${prefix}menu`, buttonText: { displayText: '📋 MENU' }, type: 1 }
                ], "🔒 PRIVATE MODE");
                break;
            }
            
            case 'jid':
            case 'myid': {
                const jidText = `╭━━❪ 🆔 *YOUR JID* 🆔 ❫━━┈⊷
┃
┃ 📱 *Your ID* : ${sender}
┃
┃ 💡 *Use this for owner commands*
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`;
                await socket.sendMessage(m.chat, { text: jidText }, { quoted: m });
                break;
            }
            
            case 'news': {
                await socket.sendMessage(m.chat, { text: "📰 *Fetching latest news...*" }, { quoted: m });
                
                try {
                    const res = await axios.get('https://gnewsapi.com/v4/top-headlines?token=8a4e8b8c6d5f4a3b2c1d9e8f7a6b5c4d&lang=en&max=5');
                    
                    if (res.data && res.data.articles) {
                        let newsText = '╭━━❪ 📰 *TOP NEWS* 📰 ❫━━┈⊷\n┃\n';
                        res.data.articles.slice(0, 5).forEach((article, i) => {
                            newsText += `┃ ${i+1}. *${article.title.substring(0, 60)}*\n`;
                            newsText += `┃    📌 ${article.source.name}\n`;
                            newsText += `┃    🔗 ${article.url}\n┃\n`;
                        });
                        newsText += '╰━━━━━━━━━━━━━━━━━━━━━┈⊷';
                        
                        await loft(socket, m, newsText, [
                            { buttonId: `${prefix}news`, buttonText: { displayText: '🔄 REFRESH' }, type: 1 }
                        ], "📰 LATEST NEWS");
                    } else {
                        throw new Error('No news found');
                    }
                } catch (err) {
                    const fallbackNews = `╭━━❪ 📰 *TOP NEWS* 📰 ❫━━┈⊷
┃
┃ 1. Global markets rally as tech stocks surge
┃ 2. New AI breakthrough announced by researchers
┃ 3. Climate summit reaches historic agreement
┃ 4. Football world cup preparations underway
┃ 5. Space exploration mission successful
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`;
                    await loft(socket, m, fallbackNews, [
                        { buttonId: `${prefix}news`, buttonText: { displayText: '🔄 REFRESH' }, type: 1 }
                    ], "📰 TOP STORIES");
                }
                break;
            }
            
            case 'ytsearch': {
                if (!text) {
                    await loft(socket, m, `╭━━❪ 🚀 *TRY AGAIN* ❫━━┈⊷
┃
┃ Example: ${prefix}ytsearch Michael Jackson
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 TRY AGAIN");
                    return;
                }
                
                await socket.sendMessage(m.chat, { text: "🔍 *Searching YouTube...*" }, { quoted: m });
                
                try {
                    const search = await yts(text);
                    if (!search.videos || search.videos.length === 0) {
                        return loft(socket, m, "❌ No results found!", [], "❌ NOT FOUND");
                    }
                    
                    let result = '╭━━❪ 📺 *YOUTUBE SEARCH* 📺 ❫━━┈⊷\n┃\n';
                    search.videos.slice(0, 5).forEach((v, i) => {
                        result += `┃ ${i+1}. *${v.title.substring(0, 50)}*\n`;
                        result += `┃    ⏱️ ${v.timestamp} | 👁️ ${v.views}\n`;
                        result += `┃    🔗 ${v.url}\n┃\n`;
                    });
                    result += '╰━━━━━━━━━━━━━━━━━━━━━┈⊷';
                    
                    await socket.sendMessage(m.chat, { text: result }, { quoted: m });
                } catch (err) {
                    await loft(socket, m, "❌ Search failed! Try again.", [], "❌ ERROR");
                }
                break;
            }

            // ========== DOWNLOADER COMMANDS ==========
            case 'play':
            case 'ytmp3':
            case 'ytaudio':
            case 'yta': {
                if (!text) {
                    await loft(socket, m, `╭━━❪ 🎵 *TRY AGAIN* 🎵 ❫━━┈⊷
┃
┃ Please provide a song name or YouTube URL!
┃
┃ 📌 *Example* : ${prefix}play Shape of You
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🎵 TRY AGAIN");
                    return;
                }

                try {
                    await socket.sendMessage(m.chat, { text: "🔍 *Searching for song...*" }, { quoted: m });
                    
                    let videoUrl = text;
                    let videoTitle = "YouTube Audio";
                    let videoTimestamp = "";
                    
                    if (!text.includes('youtube.com') && !text.includes('youtu.be')) {
                        const searchResponse = await yts(text);
                        if (!searchResponse.videos || searchResponse.videos.length === 0) {
                            await loft(socket, m, `╭━━❪ ❌ *NOT FOUND* ❌ ❫━━┈⊷
┃
┃ No results for: ${text}
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "❌ NOT FOUND");
                            return;
                        }
                        const video = searchResponse.videos[0];
                        videoUrl = video.url;
                        videoTitle = video.title;
                        videoTimestamp = video.timestamp || "Unknown";
                    }
                    
                    await socket.sendMessage(m.chat, { text: `🎵 *Found:* ${videoTitle.substring(0, 50)}...\n⬇️ *Downloading audio...*` }, { quoted: m });
                    await socket.sendPresenceUpdate('recording', m.chat);
                    
                    const result = await queryGiftedAPI(videoUrl, audioEndpoints, 30000);
                    
                    if (!result.success || !result.download_url) {
                        await loft(socket, m, `╭━━❪ ❌ *FAILED* ❌ ❫━━┈⊷
┃
┃ Failed to download. Try another song!
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "❌ FAILED");
                        return;
                    }
                    
                    let buffer = await ossBuffer(result.download_url);
                    
                    if (!isValidBuffer(buffer)) {
                        const remaining = audioEndpoints.filter(e => e !== result.endpoint);
                        const retry = await queryGiftedAPI(videoUrl, remaining, 30000);
                        if (retry.success && retry.download_url) {
                            buffer = await ossBuffer(retry.download_url);
                        }
                    }
                    
                    if (!isValidBuffer(buffer)) {
                        await loft(socket, m, `╭━━❪ ❌ *FAILED* ❌ ❫━━┈⊷
┃
┃ Failed to download audio. Please try again!
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "❌ FAILED");
                        return;
                    }
                    
                    const convertedBuffer = await formatAudio(buffer);
                    
                    if (convertedBuffer.length <= 16 * 1024 * 1024) {
                        await socket.sendMessage(m.chat, {
                            audio: convertedBuffer,
                            mimetype: "audio/mpeg",
                            caption: `🎵 *${videoTitle.substring(0, 80)}*\n⏱️ *Duration:* ${videoTimestamp}\n\n> LOFT—OSS 🛍️`
                        }, { quoted: m });
                    } else {
                        await socket.sendMessage(m.chat, {
                            document: convertedBuffer,
                            mimetype: "audio/mpeg",
                            fileName: `${videoTitle.replace(/[^\w\s.-]/gi, '').substring(0, 50)}.mp3`,
                            caption: `🎵 *${videoTitle.substring(0, 80)}*\n\n_File too large - sent as document_`
                        }, { quoted: m });
                    }
                    
                    await loft(socket, m, `╭━━❪ ✅ *AUDIO READY* ✅ ❫━━┈⊷
┃
┃ 🎵 ${videoTitle.substring(0, 50)}...
┃ ⏱️ ${videoTimestamp}
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [
                        { buttonId: `${prefix}play ${text}`, buttonText: { displayText: '🔄 DOWNLOAD AGAIN' }, type: 1 }
                    ], "✅ SUCCESS");
                    
                } catch (error) {
                    console.error("play error:", error);
                    await loft(socket, m, `╭━━❪ ❌ *ERROR* ❌ ❫━━┈⊷
┃
┃ Error: ${error.message.substring(0, 100)}
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "❌ ERROR");
                }
                break;
            }

            case 'video':
            case 'ytmp4':
            case 'ytvideo':
            case 'ytv': {
                if (!text) {
                    await loft(socket, m, `╭━━❪ 🎥 *TRY AGAIN* 🎥 ❫━━┈⊷
┃
┃ Please provide a video name or URL!
┃
┃ 📌 *Example* : ${prefix}video Shape of You
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🎥 TRY AGAIN");
                    return;
                }

                try {
                    await socket.sendMessage(m.chat, { text: "🔍 *Searching for video...*" }, { quoted: m });
                    
                    let videoUrl = text;
                    let videoTitle = "YouTube Video";
                    let videoTimestamp = "";
                    
                    if (!text.includes('youtube.com') && !text.includes('youtu.be')) {
                        const searchResponse = await yts(text);
                        if (!searchResponse.videos || searchResponse.videos.length === 0) {
                            await loft(socket, m, `╭━━❪ ❌ *NOT FOUND* ❌ ❫━━┈⊷
┃
┃ No results for: ${text}
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "❌ NOT FOUND");
                            return;
                        }
                        const video = searchResponse.videos[0];
                        videoUrl = video.url;
                        videoTitle = video.title;
                        videoTimestamp = video.timestamp || "Unknown";
                    }
                    
                    await socket.sendMessage(m.chat, { text: `🎥 *Found:* ${videoTitle.substring(0, 50)}...\n⬇️ *Downloading video...*` }, { quoted: m });
                    await socket.sendPresenceUpdate('recording', m.chat);
                    
                    const result = await queryGiftedAPI(videoUrl, videoEndpoints, 30000);
                    
                    if (!result.success || !result.download_url) {
                        await loft(socket, m, `╭━━❪ ❌ *FAILED* ❌ ❫━━┈⊷
┃
┃ Failed to download. Try another video!
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "❌ FAILED");
                        return;
                    }
                    
                    let buffer = await ossBuffer(result.download_url);
                    
                    if (!isValidBuffer(buffer)) {
                        const remaining = videoEndpoints.filter(e => e !== result.endpoint);
                        const retry = await queryGiftedAPI(videoUrl, remaining, 30000);
                        if (retry.success && retry.download_url) {
                            buffer = await ossBuffer(retry.download_url);
                        }
                    }
                    
                    if (!isValidBuffer(buffer)) {
                        await loft(socket, m, `╭━━❪ ❌ *FAILED* ❌ ❫━━┈⊷
┃
┃ Failed to download video. Please try again!
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "❌ FAILED");
                        return;
                    }
                    
                    const sizeMB = buffer.length / (1024 * 1024);
                    
                    if (buffer.length <= 50 * 1024 * 1024) {
                        await socket.sendMessage(m.chat, {
                            video: buffer,
                            mimetype: "video/mp4",
                            caption: `🎥 *${videoTitle.substring(0, 80)}*\n⏱️ *Duration:* ${videoTimestamp}\n📦 *Size:* ${sizeMB.toFixed(2)} MB\n\n> LOFT—OSS 🛍️`
                        }, { quoted: m });
                    } else {
                        await socket.sendMessage(m.chat, {
                            document: buffer,
                            mimetype: "video/mp4",
                            fileName: `${videoTitle.replace(/[^\w\s.-]/gi, '').substring(0, 50)}.mp4`,
                            caption: `🎥 *${videoTitle.substring(0, 80)}*\n\n_File too large - sent as document_`
                        }, { quoted: m });
                    }
                    
                    await loft(socket, m, `╭━━❪ ✅ *VIDEO READY* ✅ ❫━━┈⊷
┃
┃ 🎥 ${videoTitle.substring(0, 50)}...
┃ ⏱️ ${videoTimestamp}
┃ 📦 ${sizeMB.toFixed(2)} MB
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [
                        { buttonId: `${prefix}video ${text}`, buttonText: { displayText: '🔄 DOWNLOAD AGAIN' }, type: 1 }
                    ], "✅ SUCCESS");
                    
                } catch (error) {
                    console.error("video error:", error);
                    await loft(socket, m, `╭━━❪ ❌ *ERROR* ❌ ❫━━┈⊷
┃
┃ Error: ${error.message.substring(0, 100)}
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "❌ ERROR");
                }
                break;
            }

            case 'sendaudio':
            case 'dlmp3':
            case 'dlaudio': {
                if (!text) {
                    await loft(socket, m, `╭━━❪ 🎵 *TRY AGAIN* 🎵 ❫━━┈⊷
┃
┃ Please provide an audio URL!
┃
┃ 📌 *Example* : ${prefix}sendaudio https://example.com/song.mp3
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🎵 TRY AGAIN");
                    return;
                }

                try {
                    await socket.sendMessage(m.chat, { text: "🎶 *Downloading audio...*" }, { quoted: m });
                    
                    const buffer = await ossBuffer(text);
                    
                    if (!isValidBuffer(buffer)) {
                        await loft(socket, m, `╭━━❪ ❌ *FAILED* ❌ ❫━━┈⊷
┃
┃ Failed to download audio from URL!
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "❌ FAILED");
                        return;
                    }
                    
                    const convertedBuffer = await formatAudio(buffer);
                    
                    if (convertedBuffer.length <= 16 * 1024 * 1024) {
                        await socket.sendMessage(m.chat, {
                            audio: convertedBuffer,
                            mimetype: "audio/mpeg",
                            caption: `🎵 *Audio Ready*\n🔗 Source: ${text.substring(0, 50)}...\n\n> LOFT—OSS 🛍️`
                        }, { quoted: m });
                    } else {
                        await socket.sendMessage(m.chat, {
                            document: convertedBuffer,
                            mimetype: "audio/mpeg",
                            fileName: `audio_${Date.now()}.mp3`,
                            caption: `🎵 *Audio File*\n\n_File too large - sent as document_`
                        }, { quoted: m });
                    }
                    
                    await loft(socket, m, `╭━━❪ ✅ *AUDIO SENT* ✅ ❫━━┈⊷
┃
┃ Audio downloaded successfully!
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "✅ SUCCESS");
                    
                } catch (error) {
                    console.error("sendaudio error:", error);
                    await loft(socket, m, `╭━━❪ ❌ *ERROR* ❌ ❫━━┈⊷
┃
┃ Error: ${error.message.substring(0, 100)}
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "❌ ERROR");
                }
                break;
            }

            case 'sendvideo':
            case 'dlmp4':
            case 'dvideo': {
                if (!text) {
                    await loft(socket, m, `╭━━❪ 🎥 *TRY AGAIN* 🎥 ❫━━┈⊷
┃
┃ Please provide a video URL!
┃
┃ 📌 *Example* : ${prefix}sendvideo https://example.com/video.mp4
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🎥 TRY AGAIN");
                    return;
                }

                try {
                    await socket.sendMessage(m.chat, { text: "🎥 *Downloading video...*" }, { quoted: m });
                    
                    const buffer = await ossBuffer(text);
                    
                    if (!isValidBuffer(buffer)) {
                        await loft(socket, m, `╭━━❪ ❌ *FAILED* ❌ ❫━━┈⊷
┃
┃ Failed to download video from URL!
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "❌ FAILED");
                        return;
                    }
                    
                    const sizeMB = buffer.length / (1024 * 1024);
                    
                    if (buffer.length <= 50 * 1024 * 1024) {
                        await socket.sendMessage(m.chat, {
                            video: buffer,
                            mimetype: "video/mp4",
                            caption: `🎥 *Video Ready*\n📦 Size: ${sizeMB.toFixed(2)} MB\n\n> LOFT—OSS 🛍️`
                        }, { quoted: m });
                    } else {
                        await socket.sendMessage(m.chat, {
                            document: buffer,
                            mimetype: "video/mp4",
                            fileName: `video_${Date.now()}.mp4`,
                            caption: `🎥 *Video File*\n📦 Size: ${sizeMB.toFixed(2)} MB\n\n_File too large - sent as document_`
                        }, { quoted: m });
                    }
                    
                    await loft(socket, m, `╭━━❪ ✅ *VIDEO SENT* ✅ ❫━━┈⊷
┃
┃ Video downloaded successfully!
┃ 📦 Size: ${sizeMB.toFixed(2)} MB
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "✅ SUCCESS");
                    
                } catch (error) {
                    console.error("sendvideo error:", error);
                    await loft(socket, m, `╭━━❪ ❌ *ERROR* ❌ ❫━━┈⊷
┃
┃ Error: ${error.message.substring(0, 100)}
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "❌ ERROR");
                }
                break;
            }

            case 'tiktok':
            case 'tt': {
                if (!text) {
                    await loft(socket, m, `╭━━❪ 📱 *TRY AGAIN* 📱 ❫━━┈⊷
┃
┃ Please provide a TikTok URL!
┃
┃ 📌 *Example* : ${prefix}tiktok https://vm.tiktok.com/...
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "📱 TRY AGAIN");
                    return;
                }

                try {
                    await socket.sendMessage(m.chat, { text: "📱 *Downloading TikTok...*" }, { quoted: m });
                    
                    const result = await queryGiftedAPI(text, tiktokEndpoints, 20000);
                    
                    if (result.success && result.download_url) {
                        const buffer = await ossBuffer(result.download_url);
                        if (isValidBuffer(buffer)) {
                            await socket.sendMessage(m.chat, {
                                video: buffer,
                                mimetype: "video/mp4",
                                caption: `📱 *TikTok Video*\n\n> LOFT—OSS 🛍️`
                            }, { quoted: m });
                            
                            await loft(socket, m, `╭━━❪ ✅ *TIKTOK SENT* ✅ ❫━━┈⊷
┃
┃ Video downloaded successfully!
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "✅ SUCCESS");
                            return;
                        }
                    }
                    
                    await loft(socket, m, `╭━━❪ ❌ *FAILED* ❌ ❫━━┈⊷
┃
┃ Failed to download TikTok video!
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "❌ FAILED");
                    
                } catch (error) {
                    console.error("tiktok error:", error);
                    await loft(socket, m, `╭━━❪ ❌ *ERROR* ❌ ❫━━┈⊷
┃
┃ Error: ${error.message.substring(0, 100)}
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "❌ ERROR");
                }
                break;
            }

            case 'ig':
            case 'instagram': {
                if (!text) {
                    await loft(socket, m, `╭━━❪ 📸 *TRY AGAIN* 📸 ❫━━┈⊷
┃
┃ Please provide an Instagram URL!
┃
┃ 📌 *Example* : ${prefix}ig https://www.instagram.com/reel/...
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "📸 TRY AGAIN");
                    return;
                }

                try {
                    await socket.sendMessage(m.chat, { text: "📸 *Downloading Instagram...*" }, { quoted: m });
                    
                    const result = await queryGiftedAPI(text, igEndpoints, 20000);
                    
                    if (result.success && result.download_url) {
                        const buffer = await ossBuffer(result.download_url);
                        if (isValidBuffer(buffer)) {
                            if (result.download_url.includes('.mp4') || result.data?.result?.type === 'video') {
                                await socket.sendMessage(m.chat, {
                                    video: buffer,
                                    mimetype: "video/mp4",
                                    caption: `📸 *Instagram Video*\n\n> LOFT—OSS 🛍️`
                                }, { quoted: m });
                            } else {
                                await socket.sendMessage(m.chat, {
                                    image: buffer,
                                    caption: `📸 *Instagram Image*\n\n> LOFT—OSS 🛍️`
                                }, { quoted: m });
                            }
                            
                            await loft(socket, m, `╭━━❪ ✅ *INSTAGRAM SENT* ✅ ❫━━┈⊷
┃
┃ Media downloaded successfully!
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "✅ SUCCESS");
                            return;
                        }
                    }
                    
                    await loft(socket, m, `╭━━❪ ❌ *FAILED* ❌ ❫━━┈⊷
┃
┃ Failed to download Instagram media!
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "❌ FAILED");
                    
                } catch (error) {
                    console.error("instagram error:", error);
                    await loft(socket, m, `╭━━❪ ❌ *ERROR* ❌ ❫━━┈⊷
┃
┃ Error: ${error.message.substring(0, 100)}
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "❌ ERROR");
                }
                break;
            }

            case 'fb':
            case 'facebook': {
                if (!text) {
                    await loft(socket, m, `╭━━❪ 📘 *TRY AGAIN* 📘 ❫━━┈⊷
┃
┃ Please provide a Facebook URL!
┃
┃ 📌 *Example* : ${prefix}fb https://fb.watch/...
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "📘 TRY AGAIN");
                    return;
                }

                try {
                    await socket.sendMessage(m.chat, { text: "📘 *Downloading Facebook...*" }, { quoted: m });
                    
                    const result = await queryGiftedAPI(text, fbEndpoints, 20000);
                    
                    if (result.success && result.download_url) {
                        const buffer = await ossBuffer(result.download_url);
                        if (isValidBuffer(buffer)) {
                            await socket.sendMessage(m.chat, {
                                video: buffer,
                                mimetype: "video/mp4",
                                caption: `📘 *Facebook Video*\n\n> LOFT—OSS 🛍️`
                            }, { quoted: m });
                            
                            await loft(socket, m, `╭━━❪ ✅ *FACEBOOK SENT* ✅ ❫━━┈⊷
┃
┃ Video downloaded successfully!
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "✅ SUCCESS");
                            return;
                        }
                    }
                    
                    await loft(socket, m, `╭━━❪ ❌ *FAILED* ❌ ❫━━┈⊷
┃
┃ Failed to download Facebook video!
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "❌ FAILED");
                    
                } catch (error) {
                    console.error("facebook error:", error);
                    await loft(socket, m, `╭━━❪ ❌ *ERROR* ❌ ❫━━┈⊷
┃
┃ Error: ${error.message.substring(0, 100)}
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "❌ ERROR");
                }
                break;
            }

            case 'twitter':
            case 'tw':
            case 'xdown':
            case 'twitterdown': {
                if (!text) {
                    await loft(socket, m, `╭━━❪ 🐦 *TRY AGAIN* 🐦 ❫━━┈⊷
┃
┃ Please provide a Twitter/X URL!
┃
┃ 📌 *Example* : ${prefix}twitter https://twitter.com/...
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🐦 TRY AGAIN");
                    return;
                }

                try {
                    await socket.sendMessage(m.chat, { text: "🐦 *Downloading Twitter...*" }, { quoted: m });
                    
                    const result = await queryGiftedAPI(text, twitterEndpoints, 20000);
                    
                    if (result.success && result.download_url) {
                        const buffer = await ossBuffer(result.download_url);
                        if (isValidBuffer(buffer)) {
                            await socket.sendMessage(m.chat, {
                                video: buffer,
                                mimetype: "video/mp4",
                                caption: `🐦 *Twitter/X Video*\n\n> LOFT—OSS 🛍️`
                            }, { quoted: m });
                            
                            await loft(socket, m, `╭━━❪ ✅ *TWITTER SENT* ✅ ❫━━┈⊷
┃
┃ Video downloaded successfully!
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "✅ SUCCESS");
                            return;
                        }
                    }
                    
                    await loft(socket, m, `╭━━❪ ❌ *FAILED* ❌ ❫━━┈⊷
┃
┃ Failed to download Twitter video!
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "❌ FAILED");
                    
                } catch (error) {
                    console.error("twitter error:", error);
                    await loft(socket, m, `╭━━❪ ❌ *ERROR* ❌ ❫━━┈⊷
┃
┃ Error: ${error.message.substring(0, 100)}
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "❌ ERROR");
                }
                break;
            }
            
            case 'owner':
            case 'dev': {
                const ownerText = `> ╭━━❪ 👑 *OWNER INFO* 👑 ❫━━┈⊷
> ┃
> ┃ 📛 *Name*    : Mr LOFT
> ┃ 📱 *Number*  : ${config.OWNER_NUM}
> ┃ 🤖 *Bot*     : LOFT—OSS
> ┃ 💬 *Status*  : Online 24/7
> ┃
> ╰━━━━━━━━━━━━━━━━━━━━━┈⊷

📌 *Contact owner for support or inquiries*`;

                await loft(socket, m, ownerText, [
                    { buttonId: `https://wa.me/${config.OWNER_NUM}`, buttonText: { displayText: '📞 CONTACT' }, type: 2 },
                    { buttonId: `${prefix}menu`, buttonText: { displayText: '📋 MENU' }, type: 1 }
                ], "👑 OWNER INFO");
                break;
            }
                       
            case 'ai': {
                if (!text) {
                    await loft(socket, m, `╭━━❪ 🚀 *TRY AGAIN* ❫━━┈⊷
┃
┃ Please enter a question!
┃
┃ 📌 *Example* : ${prefix}ai What is AI?
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 TRY AGAIN");
                    return;
                }
                
                await socket.sendMessage(m.chat, { text: "🔎 *Thinking...*" }, { quoted: m });
                
                try {
                    const res = await axios.get(`https://api.yupra.my.id/api/ai/gpt5?text=${encodeURIComponent(text)}&lc=en`);
                    const reply = res.data.message || "I didn't understand that.";
                    
                    await loft(socket, m, `╭━━❪ 🤖 *AI RESPONSE* 🤖 ❫━━┈⊷
┃
┃ ${reply.substring(0, 3800)}
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🤖 AI CHAT");
                } catch (err) {
                    await loft(socket, m, `╭━━❪ 🚀 *TRY AGAIN* ❫━━┈⊷
┃
┃ Failed to get AI response.
┃ Please try again later.
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 TRY AGAIN");
                }
                break;
            }

            case 'img': {
                if (!text) {
                    await loft(socket, m, `╭━━❪ 🚀 *TRY AGAIN* ❫━━┈⊷
┃
┃ Please provide an image description!
┃
┃ 📌 *Example* : ${prefix}img Futuristic city
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 TRY AGAIN");
                    return;
                }
                
                await socket.sendMessage(m.chat, { text: "🎨 *Generating image...*" }, { quoted: m });
                
                try {
                    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(text)}`;
                    await socket.sendMessage(m.chat, { 
                        image: { url: imageUrl }, 
                        caption: `╭━━❪ 🖼️ *GENERATED IMAGE* 🖼️ ❫━━┈⊷
┃
┃ 📝 *Prompt* : ${text}
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`
                    }, { quoted: m });
                } catch (err) {
                    await loft(socket, m, `╭━━❪ 🚀 *TRY AGAIN* ❫━━┈⊷
┃
┃ Failed to generate image.
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 TRY AGAIN");
                }
                break;
            }

            // ========== GROUP COMMANDS ==========
            case 'unmute':
            case 'open':
            case 'groupopen':
            case 'gcopen': {
                if (!isGroup) return loft(socket, m, `╭━━❪ 🚀 *GROUPS ONLY* ❫━━┈⊷\n┃\n┃ Groups only!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 GROUPS ONLY");
                if (!isBotAdmin) return loft(socket, m, `╭━━❪ 🚀 *BOT NOT ADMIN* ❫━━┈⊷\n┃\n┃ Bot is not an admin!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 BOT NOT ADMIN");
                if (!isAdmin && !isOwner) return loft(socket, m, `╭━━❪ 🚀 *ADMIN ONLY* ❫━━┈⊷\n┃\n┃ Admin only!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 ADMIN ONLY");
                
                await socket.groupSettingUpdate(m.chat, 'not_announcement');
                await loft(socket, m, `╭━━❪ 🔊 *GROUP UNMUTED* 🔊 ❫━━┈⊷\n┃\n┃ Group successfully unmuted!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [
                    { buttonId: `${prefix}mute`, buttonText: { displayText: '🔇 MUTE' }, type: 1 }
                ], "🔊 GROUP UNMUTED");
                break;
            }

            case 'mute':
            case 'close':
            case 'groupmute':
            case 'gcmute':
            case 'gcclose': {
                if (!isGroup) return loft(socket, m, `╭━━❪ 🚀 *GROUPS ONLY* ❫━━┈⊷\n┃\n┃ Groups only!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 GROUPS ONLY");
                if (!isBotAdmin) return loft(socket, m, `╭━━❪ 🚀 *BOT NOT ADMIN* ❫━━┈⊷\n┃\n┃ Bot is not an admin!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 BOT NOT ADMIN");
                if (!isAdmin && !isOwner) return loft(socket, m, `╭━━❪ 🚀 *ADMIN ONLY* ❫━━┈⊷\n┃\n┃ Admin only!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 ADMIN ONLY");
                
                await socket.groupSettingUpdate(m.chat, 'announcement');
                await loft(socket, m, `╭━━❪ 🔇 *GROUP MUTED* 🔇 ❫━━┈⊷\n┃\n┃ Group successfully muted!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [
                    { buttonId: `${prefix}unmute`, buttonText: { displayText: '🔊 UNMUTE' }, type: 1 }
                ], "🔇 GROUP MUTED");
                break;
            }

            case 'promote': {
                if (!isGroup) return loft(socket, m, `╭━━❪ 🚀 *GROUPS ONLY* ❫━━┈⊷\n┃\n┃ Groups only!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 GROUPS ONLY");
                if (!isBotAdmin) return loft(socket, m, `╭━━❪ 🚀 *BOT NOT ADMIN* ❫━━┈⊷\n┃\n┃ Bot is not admin!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 BOT NOT ADMIN");
                if (!isAdmin && !isOwner) return loft(socket, m, `╭━━❪ 🚀 *ADMIN ONLY* ❫━━┈⊷\n┃\n┃ Admin only!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 ADMIN ONLY");
                
                let userToPromote = null;
                if (m.quoted) {
                    userToPromote = m.quoted.sender;
                } else if (text) {
                    const number = text.replace(/[^0-9]/g, '');
                    userToPromote = `${number}@s.whatsapp.net`;
                } else if (m.message.extendedTextMessage?.contextInfo?.mentionedJid) {
                    userToPromote = m.message.extendedTextMessage.contextInfo.mentionedJid[0];
                }
                
                if (!userToPromote) {
                    return loft(socket, m, `╭━━❪ 🚀 *TRY AGAIN* ❫━━┈⊷\n┃\n┃ Reply to a user or tag them!\n┃\n┃ Example: ${prefix}promote @user\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 TRY AGAIN");
                }
                
                try {
                    await socket.groupParticipantsUpdate(m.chat, [userToPromote], 'promote');
                    await loft(socket, m, `╭━━❪ ✅ *USER PROMOTED* ✅ ❫━━┈⊷\n┃\n┃ @${userToPromote.split('@')[0]} is now an admin!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "✅ PROMOTED");
                } catch (error) {
                    await loft(socket, m, `╭━━❪ ❌ *ERROR* ❫━━┈⊷\n┃\n┃ ${error.message}\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "❌ ERROR");
                }
                break;
            }

            case 'demote': {
                if (!isGroup) return loft(socket, m, `╭━━❪ 🚀 *GROUPS ONLY* ❫━━┈⊷\n┃\n┃ Groups only!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 GROUPS ONLY");
                if (!isBotAdmin) return loft(socket, m, `╭━━❪ 🚀 *BOT NOT ADMIN* ❫━━┈⊷\n┃\n┃ Bot is not admin!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 BOT NOT ADMIN");
                if (!isAdmin && !isOwner) return loft(socket, m, `╭━━❪ 🚀 *ADMIN ONLY* ❫━━┈⊷\n┃\n┃ Admin only!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 ADMIN ONLY");
                
                let userToDemote = null;
                if (m.quoted) {
                    userToDemote = m.quoted.sender;
                } else if (text) {
                    const number = text.replace(/[^0-9]/g, '');
                    userToDemote = `${number}@s.whatsapp.net`;
                } else if (m.message.extendedTextMessage?.contextInfo?.mentionedJid) {
                    userToDemote = m.message.extendedTextMessage.contextInfo.mentionedJid[0];
                }
                
                if (!userToDemote) {
                    return loft(socket, m, `╭━━❪ 🚀 *TRY AGAIN* ❫━━┈⊷\n┃\n┃ Reply to a user or tag them!\n┃\n┃ Example: ${prefix}demote @user\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 TRY AGAIN");
                }
                
                try {
                    await socket.groupParticipantsUpdate(m.chat, [userToDemote], 'demote');
                    await loft(socket, m, `╭━━❪ ⬇️ *USER DEMOTED* ⬇️ ❫━━┈⊷\n┃\n┃ @${userToDemote.split('@')[0]} is no longer an admin!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "⬇️ DEMOTED");
                } catch (error) {
                    await loft(socket, m, `╭━━❪ ❌ *ERROR* ❫━━┈⊷\n┃\n┃ ${error.message}\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "❌ ERROR");
                }
                break;
            }

            case 'kick':
            case 'remove': {
                if (!isGroup) return loft(socket, m, `╭━━❪ 🚀 *GROUPS ONLY* ❫━━┈⊷\n┃\n┃ Groups only!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 GROUPS ONLY");
                if (!isBotAdmin) return loft(socket, m, `╭━━❪ 🚀 *BOT NOT ADMIN* ❫━━┈⊷\n┃\n┃ Bot is not admin!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 BOT NOT ADMIN");
                if (!isAdmin && !isOwner) return loft(socket, m, `╭━━❪ 🚀 *ADMIN ONLY* ❫━━┈⊷\n┃\n┃ Admin only!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 ADMIN ONLY");
                
                let userToKick = null;
                if (m.quoted) {
                    userToKick = m.quoted.sender;
                } else if (text) {
                    const number = text.replace(/[^0-9]/g, '');
                    userToKick = `${number}@s.whatsapp.net`;
                } else if (m.message.extendedTextMessage?.contextInfo?.mentionedJid) {
                    userToKick = m.message.extendedTextMessage.contextInfo.mentionedJid[0];
                }
                
                if (!userToKick) {
                    return loft(socket, m, `╭━━❪ 🚀 *TRY AGAIN* ❫━━┈⊷\n┃\n┃ Reply to a user or tag them!\n┃\n┃ Example: ${prefix}kick @user\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 TRY AGAIN");
                }
                
                if (userToKick === sender) {
                    return loft(socket, m, `╭━━❪ ❌ *CANNOT KICK SELF* ❌ ❫━━┈⊷\n┃\n┃ You cannot kick yourself!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "❌ ERROR");
                }
                
                try {
                    await socket.groupParticipantsUpdate(m.chat, [userToKick], 'remove');
                    await loft(socket, m, `╭━━❪ 👢 *USER KICKED* 👢 ❫━━┈⊷\n┃\n┃ @${userToKick.split('@')[0]} has been removed from the group!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "👢 KICKED");
                } catch (error) {
                    await loft(socket, m, `╭━━❪ ❌ *ERROR* ❫━━┈⊷\n┃\n┃ ${error.message}\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "❌ ERROR");
                }
                break;
            }

            case 'add':
            case 'invite': {
                if (!isGroup) return loft(socket, m, `╭━━❪ 🚀 *GROUPS ONLY* ❫━━┈⊷\n┃\n┃ Groups only!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 GROUPS ONLY");
                if (!isBotAdmin) return loft(socket, m, `╭━━❪ 🚀 *BOT NOT ADMIN* ❫━━┈⊷\n┃\n┃ Bot is not admin!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 BOT NOT ADMIN");
                if (!isAdmin && !isOwner) return loft(socket, m, `╭━━❪ 🚀 *ADMIN ONLY* ❫━━┈⊷\n┃\n┃ Admin only!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 ADMIN ONLY");
                if (!text) return loft(socket, m, `╭━━❪ 🚀 *TRY AGAIN* ❫━━┈⊷\n┃\n┃ ${prefix}add 254712345678\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 TRY AGAIN");
                
                const number = text.replace(/[^0-9]/g, '');
                if (!number || number.length < 10) {
                    return loft(socket, m, `╭━━❪ ❌ *INVALID NUMBER* ❌ ❫━━┈⊷\n┃\n┃ Please provide a valid phone number!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "❌ ERROR");
                }
                
                const userJid = `${number}@s.whatsapp.net`;
                
                try {
                    await socket.groupParticipantsUpdate(m.chat, [userJid], 'add');
                    await loft(socket, m, `╭━━❪ ✅ *USER ADDED* ✅ ❫━━┈⊷\n┃\n┃ @${number} has been added to the group!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "✅ ADDED");
                } catch (error) {
                    let errorMsg = "Failed to add user.";
                    if (error.message.includes("405")) {
                        errorMsg = "User is already in the group or has privacy settings enabled!";
                    }
                    await loft(socket, m, `╭━━❪ ❌ *ERROR* ❌ ❫━━┈⊷\n┃\n┃ ${errorMsg}\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "❌ ERROR");
                }
                break;
            }

            case 'met':
            case 'groupinfo':
            case 'gcinfo': {
                if (!isGroup) return loft(socket, m, `╭━━❪ 🚀 *GROUPS ONLY* ❫━━┈⊷\n┃\n┃ Groups only!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 GROUPS ONLY");
                
                try {
                    const gInfo = groupMetadata;
                    const formatJid = (jid) => jid ? `@${jid.split('@')[0]}` : "N/A";
                    
                    const superAdmins = [];
                    const admins = [];
                    const members = [];
                    
                    gInfo.participants.forEach(p => {
                        if (p.admin === 'superadmin') superAdmins.push(p.id);
                        else if (p.admin === 'admin') admins.push(p.id);
                        else members.push(p.id);
                    });
                    
                    const metadataText = `╭━━❪ 📌 *GROUP METADATA* 📌 ❫━━┈⊷
┃
┃ 🔹 *ID:* ${gInfo.id}
┃ 🔹 *Subject:* ${gInfo.subject || "None"}
┃ 🔹 *Owner:* ${formatJid(gInfo.owner || gInfo.id.split('@')[0])}
┃ 🔹 *Created:* ${new Date(gInfo.creation * 1000).toLocaleString()}
┃ 🔹 *Size:* ${gInfo.participants.length} members
┃ 🔹 *Description:* ${gInfo.desc?.substring(0, 100) || "None"}
┃
┃ 👑 *Admins:* ${superAdmins.length + admins.length}
┃ 👥 *Members:* ${members.length}
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`;
                    
                    await socket.sendMessage(m.chat, { text: metadataText }, { quoted: m });
                } catch (error) {
                    await loft(socket, m, `╭━━❪ ❌ *ERROR* ❫━━┈⊷\n┃\n┃ Failed to fetch metadata!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "❌ ERROR");
                }
                break;
            }

            case 'resetlink':
            case 'revoke':
            case 'revokelink':
            case 'newlink': {
                if (!isGroup) return loft(socket, m, `╭━━❪ 🚀 *GROUPS ONLY* ❫━━┈⊷\n┃\n┃ Groups only!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 GROUPS ONLY");
                if (!isBotAdmin) return loft(socket, m, `╭━━❪ 🚀 *BOT NOT ADMIN* ❫━━┈⊷\n┃\n┃ Bot is not admin!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 BOT NOT ADMIN");
                if (!isAdmin && !isOwner) return loft(socket, m, `╭━━❪ 🚀 *ADMIN ONLY* ❫━━┈⊷\n┃\n┃ Admin only!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 ADMIN ONLY");
                
                try {
                    await socket.groupRevokeInvite(m.chat);
                    const newInviteCode = await socket.groupInviteCode(m.chat);
                    const newLink = `https://chat.whatsapp.com/${newInviteCode}`;
                    
                    await loft(socket, m, `╭━━❪ 🔄 *NEW GROUP LINK* 🔄 ❫━━┈⊷
┃
┃ 🔗 ${newLink}
┃
┃ _Old link has been revoked!_
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [
                        { buttonId: `${prefix}link`, buttonText: { displayText: '🔗 GET LINK' }, type: 1 }
                    ], "🔄 LINK RESET");
                } catch (error) {
                    await loft(socket, m, `╭━━❪ ❌ *ERROR* ❫━━┈⊷\n┃\n┃ ${error.message}\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "❌ ERROR");
                }
                break;
            }

            case 'link':
            case 'gclink':
            case 'grouplink':
            case 'invitelink': {
                if (!isGroup) return loft(socket, m, `╭━━❪ 🚀 *GROUPS ONLY* ❫━━┈⊷\n┃\n┃ Groups only!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 GROUPS ONLY");
                if (!isBotAdmin) return loft(socket, m, `╭━━❪ 🚀 *BOT NOT ADMIN* ❫━━┈⊷\n┃\n┃ Bot is not admin!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 BOT NOT ADMIN");
                if (!isAdmin && !isOwner) return loft(socket, m, `╭━━❪ 🚀 *ADMIN ONLY* ❫━━┈⊷\n┃\n┃ Admin only!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 ADMIN ONLY");
                
                try {
                    const inviteCode = await socket.groupInviteCode(m.chat);
                    const inviteLink = `https://chat.whatsapp.com/${inviteCode}`;
                    
                    await loft(socket, m, `╭━━❪ 🔗 *GROUP INVITE LINK* 🔗 ❫━━┈⊷
┃
┃ 🔗 ${inviteLink}
┃
┃ 📁 *Group:* ${groupMetadata?.subject || "Unknown"}
┃ 👥 *Members:* ${groupMetadata?.participants?.length || 0}
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [
                        { buttonId: `${prefix}resetlink`, buttonText: { displayText: '🔄 RESET LINK' }, type: 1 }
                    ], "🔗 INVITE LINK");
                } catch (error) {
                    await loft(socket, m, `╭━━❪ ❌ *ERROR* ❫━━┈⊷\n┃\n┃ ${error.message}\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "❌ ERROR");
                }
                break;
            }

            case 'groupname':
            case 'gcname':
            case 'setgroupname': {
                if (!isGroup) return loft(socket, m, `╭━━❪ 🚀 *GROUPS ONLY* ❫━━┈⊷\n┃\n┃ Groups only!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 GROUPS ONLY");
                if (!isBotAdmin) return loft(socket, m, `╭━━❪ 🚀 *BOT NOT ADMIN* ❫━━┈⊷\n┃\n┃ Bot is not admin!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 BOT NOT ADMIN");
                if (!isAdmin && !isOwner) return loft(socket, m, `╭━━❪ 🚀 *ADMIN ONLY* ❫━━┈⊷\n┃\n┃ Admin only!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 ADMIN ONLY");
                if (!text) return loft(socket, m, `╭━━❪ 🚀 *TRY AGAIN* ❫━━┈⊷\n┃\n┃ ${prefix}groupname New Name\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 TRY AGAIN");
                
                await socket.groupUpdateSubject(m.chat, text);
                await loft(socket, m, `╭━━❪ ✅ *GROUP NAME UPDATED* ✅ ❫━━┈⊷
┃
┃ 📛 *New Name:* ${text}
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "✅ UPDATED");
                break;
            }

            case 'gcdesc':
            case 'groupdesc':
            case 'setdescription': {
                if (!isGroup) return loft(socket, m, `╭━━❪ 🚀 *GROUPS ONLY* ❫━━┈⊷\n┃\n┃ Groups only!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 GROUPS ONLY");
                if (!isBotAdmin) return loft(socket, m, `╭━━❪ 🚀 *BOT NOT ADMIN* ❫━━┈⊷\n┃\n┃ Bot is not admin!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 BOT NOT ADMIN");
                if (!isAdmin && !isOwner) return loft(socket, m, `╭━━❪ 🚀 *ADMIN ONLY* ❫━━┈⊷\n┃\n┃ Admin only!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 ADMIN ONLY");
                if (!text) return loft(socket, m, `╭━━❪ 🚀 *TRY AGAIN* ❫━━┈⊷\n┃\n┃ ${prefix}gcdesc New Description\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 TRY AGAIN");
                
                await socket.groupUpdateDescription(m.chat, text);
                await loft(socket, m, `╭━━❪ ✅ *DESCRIPTION UPDATED* ✅ ❫━━┈⊷
┃
┃ 📝 *New Description:* ${text.substring(0, 200)}
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "✅ UPDATED");
                break;
            }

            case 'everyone':
            case 'tagall':
            case 'mention': {
                if (!isGroup) return loft(socket, m, `╭━━❪ 🚀 *GROUPS ONLY* ❫━━┈⊷\n┃\n┃ Groups only!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 GROUPS ONLY");
                if (!isAdmin && !isOwner) return loft(socket, m, `╭━━❪ 🚀 *ADMIN ONLY* ❫━━┈⊷\n┃\n┃ Admin only!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 ADMIN ONLY");
                
                const mentions = groupMetadata.participants.map(p => p.id);
                const tagMessage = text || "Attention everyone!";
                
                await socket.sendMessage(m.chat, { 
                    text: `╭━━❪ 📢 *ANNOUNCEMENT* 📢 ❫━━┈⊷\n┃\n┃ ${tagMessage}\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n${mentions.map(jid => `✨ @${jid.split('@')[0]}`).join('\n')}`,
                    mentions: mentions
                }, { quoted: m });
                break;
            }

            case 'hidetag':
            case 'htag': {
                if (!isGroup) return loft(socket, m, `╭━━❪ 🚀 *GROUPS ONLY* ❫━━┈⊷\n┃\n┃ Groups only!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 GROUPS ONLY");
                if (!isAdmin && !isOwner) return loft(socket, m, `╭━━❪ 🚀 *ADMIN ONLY* ❫━━┈⊷\n┃\n┃ Admin only!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 ADMIN ONLY");
                
                let hiddenText = text;
                if (!hiddenText && m.quoted) {
                    hiddenText = m.quoted.message?.conversation || m.quoted.message?.extendedTextMessage?.text || "Hidden message";
                }
                if (!hiddenText) return loft(socket, m, `╭━━❪ 🚀 *TRY AGAIN* ❫━━┈⊷\n┃\n┃ ${prefix}hidetag Your message\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 TRY AGAIN");
                
                const mentions = groupMetadata.participants.map(p => p.id);
                await socket.sendMessage(m.chat, { 
                    text: hiddenText,
                    mentions: mentions
                }, { quoted: m });
                break;
            }

            case 'tagadmins':
            case 'taggcadmins': {
                if (!isGroup) return loft(socket, m, `╭━━❪ 🚀 *GROUPS ONLY* ❫━━┈⊷\n┃\n┃ Groups only!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 GROUPS ONLY");
                if (!isAdmin && !isOwner) return loft(socket, m, `╭━━❪ 🚀 *ADMIN ONLY* ❫━━┈⊷\n┃\n┃ Admin only!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 ADMIN ONLY");
                
                const admins = groupMetadata.participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin').map(p => p.id);
                if (admins.length === 0) return loft(socket, m, `╭━━❪ ❌ *NO ADMINS* ❫━━┈⊷\n┃\n┃ No admins found!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "❌ NO ADMINS");
                
                const adminMessage = text || "Attention admins!";
                await socket.sendMessage(m.chat, { 
                    text: `╭━━❪ 👮 *ADMIN TAG* 👮 ❫━━┈⊷\n┃\n┃ ${adminMessage}\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n${admins.map(jid => `👑 @${jid.split('@')[0]}`).join('\n')}`,
                    mentions: admins
                }, { quoted: m });
                break;
            }

            case 'listrequests':
            case 'joinrequests':
            case 'pendingrequests': {
                if (!isGroup) return loft(socket, m, `╭━━❪ 🚀 *GROUPS ONLY* ❫━━┈⊷\n┃\n┃ Groups only!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 GROUPS ONLY");
                if (!isBotAdmin) return loft(socket, m, `╭━━❪ 🚀 *BOT NOT ADMIN* ❫━━┈⊷\n┃\n┃ Bot is not admin!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 BOT NOT ADMIN");
                if (!isAdmin && !isOwner) return loft(socket, m, `╭━━❪ 🚀 *ADMIN ONLY* ❫━━┈⊷\n┃\n┃ Admin only!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 ADMIN ONLY");
                
                try {
                    const pending = await socket.groupRequestParticipantsList(m.chat);
                    if (!pending || pending.length === 0) {
                        return loft(socket, m, `╭━━❪ 📭 *NO REQUESTS* ❫━━┈⊷\n┃\n┃ No pending join requests!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "📭 NO REQUESTS");
                    }
                    
                    let requestText = `╭━━❪ 📋 *PENDING REQUESTS* 📋 ❫━━┈⊷\n┃\n┃ Total: ${pending.length} request(s)\n┃\n`;
                    pending.forEach((r, i) => {
                        requestText += `┃ ${i+1}. @${r.jid.split('@')[0]}\n`;
                    });
                    requestText += `┃\n┃ Use: ${prefix}accept <number>\n┃ Use: ${prefix}reject <number>\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`;
                    
                    await socket.sendMessage(m.chat, { 
                        text: requestText,
                        mentions: pending.map(r => r.jid)
                    }, { quoted: m });
                } catch (error) {
                    await loft(socket, m, `╭━━❪ ❌ *ERROR* ❫━━┈⊷\n┃\n┃ ${error.message}\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "❌ ERROR");
                }
                break;
            }

            case 'accept':
            case 'approve': {
                if (!isGroup) return loft(socket, m, `╭━━❪ 🚀 *GROUPS ONLY* ❫━━┈⊷\n┃\n┃ Groups only!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 GROUPS ONLY");
                if (!isBotAdmin) return loft(socket, m, `╭━━❪ 🚀 *BOT NOT ADMIN* ❫━━┈⊷\n┃\n┃ Bot is not admin!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 BOT NOT ADMIN");
                if (!isAdmin && !isOwner) return loft(socket, m, `╭━━❪ 🚀 *ADMIN ONLY* ❫━━┈⊷\n┃\n┃ Admin only!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 ADMIN ONLY");
                if (!text) return loft(socket, m, `╭━━❪ 🚀 *TRY AGAIN* ❫━━┈⊷\n┃\n┃ ${prefix}accept 254712345678\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 TRY AGAIN");
                
                const number = text.replace(/[^0-9]/g, '');
                const userJid = `${number}@s.whatsapp.net`;
                
                try {
                    await socket.groupRequestParticipantsUpdate(m.chat, [userJid], 'approve');
                    await loft(socket, m, `╭━━❪ ✅ *REQUEST ACCEPTED* ✅ ❫━━┈⊷\n┃\n┃ @${number} has been added to the group!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [
                        { buttonId: `${prefix}listrequests`, buttonText: { displayText: '📋 VIEW REQUESTS' }, type: 1 }
                    ], "✅ ACCEPTED");
                } catch (error) {
                    await loft(socket, m, `╭━━❪ ❌ *ERROR* ❫━━┈⊷\n┃\n┃ ${error.message}\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "❌ ERROR");
                }
                break;
            }

            case 'reject':
            case 'decline': {
                if (!isGroup) return loft(socket, m, `╭━━❪ 🚀 *GROUPS ONLY* ❫━━┈⊷\n┃\n┃ Groups only!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 GROUPS ONLY");
                if (!isBotAdmin) return loft(socket, m, `╭━━❪ 🚀 *BOT NOT ADMIN* ❫━━┈⊷\n┃\n┃ Bot is not admin!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 BOT NOT ADMIN");
                if (!isAdmin && !isOwner) return loft(socket, m, `╭━━❪ 🚀 *ADMIN ONLY* ❫━━┈⊷\n┃\n┃ Admin only!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 ADMIN ONLY");
                if (!text) return loft(socket, m, `╭━━❪ 🚀 *TRY AGAIN* ❫━━┈⊷\n┃\n┃ ${prefix}reject 254712345678\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 TRY AGAIN");
                
                const number = text.replace(/[^0-9]/g, '');
                const userJid = `${number}@s.whatsapp.net`;
                
                try {
                    await socket.groupRequestParticipantsUpdate(m.chat, [userJid], 'reject');
                    await loft(socket, m, `╭━━❪ ❌ *REQUEST REJECTED* ❌ ❫━━┈⊷\n┃\n┃ @${number}'s request has been rejected!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [
                        { buttonId: `${prefix}listrequests`, buttonText: { displayText: '📋 VIEW REQUESTS' }, type: 1 }
                    ], "❌ REJECTED");
                } catch (error) {
                    await loft(socket, m, `╭━━❪ ❌ *ERROR* ❫━━┈⊷\n┃\n┃ ${error.message}\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "❌ ERROR");
                }
                break;
            }

            case 'acceptall':
            case 'approveall': {
                if (!isGroup) return loft(socket, m, `╭━━❪ 🚀 *GROUPS ONLY* ❫━━┈⊷\n┃\n┃ Groups only!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 GROUPS ONLY");
                if (!isBotAdmin) return loft(socket, m, `╭━━❪ 🚀 *BOT NOT ADMIN* ❫━━┈⊷\n┃\n┃ Bot is not admin!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 BOT NOT ADMIN");
                if (!isAdmin && !isOwner) return loft(socket, m, `╭━━❪ 🚀 *ADMIN ONLY* ❫━━┈⊷\n┃\n┃ Admin only!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 ADMIN ONLY");
                
                try {
                    const pending = await socket.groupRequestParticipantsList(m.chat);
                    if (!pending || pending.length === 0) {
                        return loft(socket, m, `╭━━❪ 📭 *NO REQUESTS* ❫━━┈⊷\n┃\n┃ No pending join requests!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "📭 NO REQUESTS");
                    }
                    
                    const jids = pending.map(r => r.jid);
                    await socket.groupRequestParticipantsUpdate(m.chat, jids, 'approve');
                    await loft(socket, m, `╭━━❪ ✅ *ALL REQUESTS ACCEPTED* ✅ ❫━━┈⊷\n┃\n┃ ${jids.length} request(s) approved!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "✅ ACCEPTED ALL");
                } catch (error) {
                    await loft(socket, m, `╭━━❪ ❌ *ERROR* ❫━━┈⊷\n┃\n┃ ${error.message}\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "❌ ERROR");
                }
                break;
            }

            case 'rejectall':
            case 'declineall': {
                if (!isGroup) return loft(socket, m, `╭━━❪ 🚀 *GROUPS ONLY* ❫━━┈⊷\n┃\n┃ Groups only!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 GROUPS ONLY");
                if (!isBotAdmin) return loft(socket, m, `╭━━❪ 🚀 *BOT NOT ADMIN* ❫━━┈⊷\n┃\n┃ Bot is not admin!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 BOT NOT ADMIN");
                if (!isAdmin && !isOwner) return loft(socket, m, `╭━━❪ 🚀 *ADMIN ONLY* ❫━━┈⊷\n┃\n┃ Admin only!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 ADMIN ONLY");
                
                try {
                    const pending = await socket.groupRequestParticipantsList(m.chat);
                    if (!pending || pending.length === 0) {
                        return loft(socket, m, `╭━━❪ 📭 *NO REQUESTS* ❫━━┈⊷\n┃\n┃ No pending join requests!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "📭 NO REQUESTS");
                    }
                    
                    const jids = pending.map(r => r.jid);
                    await socket.groupRequestParticipantsUpdate(m.chat, jids, 'reject');
                    await loft(socket, m, `╭━━❪ ❌ *ALL REQUESTS REJECTED* ❌ ❫━━┈⊷\n┃\n┃ ${jids.length} request(s) rejected!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "❌ REJECTED ALL");
                } catch (error) {
                    await loft(socket, m, `╭━━❪ ❌ *ERROR* ❫━━┈⊷\n┃\n┃ ${error.message}\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "❌ ERROR");
                }
                break;
            }

            case 'newgroup':
            case 'newgc':
            case 'creategroup': {
                if (!isOwner) return loft(socket, m, `╭━━❪ 🚀 *OWNER ONLY* ❫━━┈⊷\n┃\n┃ Owner only command!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 OWNER ONLY");
                if (!text) return loft(socket, m, `╭━━❪ 🚀 *TRY AGAIN* ❫━━┈⊷\n┃\n┃ ${prefix}newgroup Group Name\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 TRY AGAIN");
                
                try {
                    const group = await socket.groupCreate(text, [sender]);
                    const inviteCode = await socket.groupInviteCode(group.id);
                    const inviteLink = `https://chat.whatsapp.com/${inviteCode}`;
                    
                    await loft(socket, m, `╭━━❪ 🆕 *GROUP CREATED* 🆕 ❫━━┈⊷
┃
┃ 📛 *Name:* ${text}
┃ 🆔 *ID:* ${group.id}
┃ 🔗 *Link:* ${inviteLink}
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🆕 GROUP CREATED");
                } catch (error) {
                    await loft(socket, m, `╭━━❪ ❌ *ERROR* ❫━━┈⊷\n┃\n┃ ${error.message}\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "❌ ERROR");
                }
                break;
            }

            case 'left':
            case 'leave':
            case 'exitgc': {
                if (!isOwner) return loft(socket, m, `╭━━❪ 🚀 *OWNER ONLY* ❫━━┈⊷\n┃\n┃ Owner only!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 OWNER ONLY");
                if (!isGroup) return loft(socket, m, `╭━━❪ 🚀 *GROUPS ONLY* ❫━━┈⊷\n┃\n┃ Groups only!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 GROUPS ONLY");
                
                await socket.sendMessage(m.chat, { text: `👋 *Goodbye!* Leaving this group...` }, { quoted: m });
                await new Promise(r => setTimeout(r, 1000));
                await socket.groupLeave(m.chat);
                break;
            }

            case 'online':
            case 'listonline': {
                if (!isGroup) return loft(socket, m, `╭━━❪ 🚀 *GROUPS ONLY* ❫━━┈⊷\n┃\n┃ Groups only!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 GROUPS ONLY");
                
                await socket.sendMessage(m.chat, { text: "🔍 *Checking online members...*" }, { quoted: m });
                
                const onlineMembers = [];
                const presenceMap = new Map();
                
                const presenceListener = (update) => {
                    if (update.presences) {
                        for (const [jid, presence] of Object.entries(update.presences)) {
                            if (presence.lastKnownPresence === 'available' || 
                                presence.lastKnownPresence === 'composing' ||
                                presence.lastKnownPresence === 'recording') {
                                presenceMap.set(jid, presence);
                            }
                        }
                    }
                };
                
                socket.ev.on('presence.update', presenceListener);
                
                try {
                    for (const p of groupMetadata.participants) {
                        try {
                            await socket.presenceSubscribe(p.id);
                        } catch (e) {}
                    }
                    
                    await new Promise(r => setTimeout(r, 2000));
                    
                    for (const p of groupMetadata.participants) {
                        if (presenceMap.has(p.id)) {
                            onlineMembers.push(p.id);
                        }
                    }
                    
                    socket.ev.off('presence.update', presenceListener);
                    
                    if (onlineMembers.length === 0) {
                        return loft(socket, m, `╭━━❪ 😴 *NO ONLINE MEMBERS* 😴 ❫━━┈⊷\n┃\n┃ No members are currently online!\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "😴 OFFLINE");
                    }
                    
                    let onlineText = `╭━━❪ 🟢 *ONLINE MEMBERS* 🟢 ❫━━┈⊷\n┃\n┃ Total: ${onlineMembers.length} online\n┃\n`;
                    onlineMembers.forEach((jid, i) => {
                        onlineText += `┃ ${i+1}. @${jid.split('@')[0]}\n`;
                    });
                    onlineText += `┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`;
                    
                    await socket.sendMessage(m.chat, { 
                        text: onlineText,
                        mentions: onlineMembers
                    }, { quoted: m });
                } catch (error) {
                    socket.ev.off('presence.update', presenceListener);
                    await loft(socket, m, `╭━━❪ ❌ *ERROR* ❫━━┈⊷\n┃\n┃ ${error.message}\n┃\n╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "❌ ERROR");
                }
                break;
            }

            case 'sticker':
            case 's': {
                if (!m.quoted || (!m.quoted.message?.imageMessage && !m.quoted.message?.videoMessage)) {
                    await loft(socket, m, `╭━━❪ 🚀 *TRY AGAIN* ❫━━┈⊷
┃
┃ Reply to an image or video!
┃
┃ 📌 *Usage* : Reply to media with ${prefix}sticker
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 TRY AGAIN");
                    return;
                }

                try {
                    const buffer = await downloadMediaMessage(m.quoted, 'buffer');
                    const stickerBuffer = await writeExifImg(buffer, { packname: "LOFT—OSS", author: "Mr LOFT" });
                    await socket.sendMessage(m.chat, { sticker: stickerBuffer }, { quoted: m });
                } catch (err) {
                    await loft(socket, m, `╭━━❪ 🚀 *TRY AGAIN* ❫━━┈⊷
┃
┃ Failed to create sticker.
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 TRY AGAIN");
                }
                break;
            }
            
            // ========== NEW COMMANDS ==========
            case 'onwa':
            case 'onwhatsapp':
            case 'checkwa':
            case 'checknumber': {
                if (!text) {
        await loft(socket, m, `╭━━❪ 🔍 *TRY AGAIN* 🔍 ❫━━┈⊷
┃
┃ Please provide a phone number!
┃
┃ 📌 *Example* : ${prefix}onwa 254712345678
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🔍 TRY AGAIN");
        return;
    }
    
    const num = text.trim().replace(/[^0-9]/g, "");
    
    if (num.length < 7 || num.length > 15) {
        await loft(socket, m, `╭━━❪ ❌ *INVALID NUMBER* ❌ ❫━━┈⊷
┃
┃ Please provide a valid number with country code!
┃
┃ *Example:* ${prefix}onwa 254712345678
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "❌ INVALID");
        return;
    }
    
    await socket.sendMessage(m.chat, { text: "🔍 *Checking WhatsApp...*" }, { quoted: m });
    
    try {
        const [result] = await socket.onWhatsApp(num);
        
        if (result && result.exists) {
            await loft(socket, m, `╭━━❪ ✅ *WHATSAPP USER FOUND* ✅ ❫━━┈⊷
┃
┃ 📞 *Number:* ${num}
┃ 🆔 *JID:* ${result.jid}
┃
┃ ✅ *This number is registered on WhatsApp!*
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "✅ FOUND");
        } else {
            await loft(socket, m, `╭━━❪ ❌ *NOT ON WHATSAPP* ❌ ❫━━┈⊷
┃
┃ 📞 *Number:* ${num}
┃
┃ ❌ *This number is not registered on WhatsApp!*
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "❌ NOT FOUND");
        }
    } catch (err) {
        await loft(socket, m, `╭━━❪ ⚠️ *ERROR* ⚠️ ❫━━┈⊷
┃
┃ Could not verify if ${num} is on WhatsApp.
┃
┃ Error: ${err.message}
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "⚠️ ERROR");
    }
    break;
}

            case 'vcf':
            case 'contacts':
            case 'savecontact':
            case 'scontact':
            case 'savecontacts': {
                if (!isGroup) {
        await loft(socket, m, `╭━━❪ 🚀 *GROUPS ONLY* ❫━━┈⊷
┃
┃ This command only works in groups!
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 GROUPS ONLY");
        return;
    }
    
    await socket.sendMessage(m.chat, { text: "📇 *Exporting contacts...*" }, { quoted: m });
    
    try {
        const participants = groupMetadata?.participants || [];
        const groupName = groupMetadata?.subject || "My Group";
        
        if (participants.length === 0) {
            await loft(socket, m, `╭━━❪ ❌ *NO PARTICIPANTS* ❌ ❫━━┈⊷
┃
┃ No participants found in this group!
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "❌ ERROR");
            return;
        }
        
        let vcfContent = "";
        let index = 1;
        
        for (const member of participants) {
            const jid = member.id || member.jid;
            if (!jid || typeof jid !== "string") continue;
            
            const phoneJid = jid.includes("@s.whatsapp.net") ? jid : normalizeUserJid(jid);
            if (!phoneJid || !phoneJid.includes("@s.whatsapp.net")) continue;
            
            const id = phoneJid.split("@")[0];
            vcfContent += `BEGIN:VCARD\nVERSION:3.0\nFN:[${index++}] +${id}\nTEL;type=CELL;type=VOICE;waid=${id}:+${id}\nEND:VCARD\n`;
        }
        
        const count = index - 1;
        
        if (count === 0) {
            await loft(socket, m, `╭━━❪ ❌ *NO VALID CONTACTS* ❌ ❫━━┈⊷
┃
┃ Could not extract any valid contacts!
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "❌ ERROR");
            return;
        }
        
        const fileName = `${groupName.replace(/[^a-zA-Z0-9]/g, '_')}.vcf`;
        
        await socket.sendMessage(m.chat, {
            document: Buffer.from(vcfContent.trim(), "utf-8"),
            mimetype: "text/vcard",
            fileName: fileName,
            caption: `╭━━❪ 📇 *CONTACTS EXPORTED* 📇 ❫━━┈⊷
┃
┃ 📁 *Group:* ${groupName}
┃ 👥 *Contacts:* ${count}
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`
        }, { quoted: m });
        
    } catch (err) {
        await loft(socket, m, `╭━━❪ ❌ *ERROR* ❌ ❫━━┈⊷
┃
┃ Failed to export contacts: ${err.message}
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "❌ ERROR");
    }
    break;
}

            
// ========== VIEWONCE COMMAND ==========
case 'vv':
case 'viewonce': {
    if (!m.quoted || !m.quoted.message?.viewOnceMessageV2) {
        await socket.sendMessage(m.chat, { text: "Reply to a ViewOnce message!" }, { quoted: m });
        return;
    }
    // ... code yako ya viewonce
    break;  // <-- HAKIKISHA HII BREAK IPO!
}

            case 'quote': {
                const quotes = [
                    "Life is complicated. I killed people, smuggled people, sold people.",
                    "All I have in this world is my balls and my word, and I don't break 'em for no one.",
                    "The world is a mess, and I just need to rule it.",
                    "Better to be king for a night than schmuck for a lifetime.",
                    "You forget a thousand things every day, make sure this is one of them."
                ];
                
                const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
                await loft(socket, m, `╭━━❪ 🎮 *GTA V QUOTE* 🎮 ❫━━┈⊷
┃
┃ "${randomQuote}"
┃
┃ - GTA V Characters
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [
                    { buttonId: `${prefix}quote`, buttonText: { displayText: '🔄 ANOTHER' }, type: 1 }
                ], "🎮 GTA V QUOTE");
                break;
            }
            
            case 'emojimix': {
                if (!text || !text.includes('+')) {
                    await loft(socket, m, `╭━━❪ 🚀 *TRY AGAIN* ❫━━┈⊷
┃
┃ Example: ${prefix}emojimix 😎+😂
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 TRY AGAIN");
                    return;
                }

                try {
                    const [e1, e2] = text.split('+');
                    const url = `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(e1 + e2)}&key=AIzaSyBg3o7q3G4dA8q8a3q8a3q8a3q8a3q8a3q8&limit=1`;
                    const res = await axios.get(url);
                    
                    if (!res.data.results?.length) throw new Error('No result');
                    
                    await socket.sendMessage(m.chat, { 
                        image: { url: res.data.results[0].media_formats.gif.url }, 
                        caption: `╭━━❪ ✨ *EMOJI MIX* ✨ ❫━━┈⊷
┃
┃ ${e1} + ${e2} = Mixed!
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`
                    }, { quoted: m });
                } catch (err) {
                    await loft(socket, m, `╭━━❪ 🚀 *TRY AGAIN* ❫━━┈⊷
┃
┃ Failed to mix emojis.
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 TRY AGAIN");
                }
                break;
            }

            case 'meme': {
                try {
                    const res = await axios.get('https://meme-api.com/gimme');
                    await socket.sendMessage(m.chat, {
                        image: { url: res.data.url },
                        caption: `╭━━❪ 😂 *MEME TIME* 😂 ❫━━┈⊷
┃
┃ 📝 *Title* : ${res.data.title}
┃ 📁 *Subreddit* : r/${res.data.subreddit}
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`
                    }, { quoted: m });
                } catch (err) {
                    await loft(socket, m, `╭━━❪ 🚀 *TRY AGAIN* ❫━━┈⊷
┃
┃ Failed to fetch meme!
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 TRY AGAIN");
                }
                break;
            }

            case 'qouteislamic':
            case 'islamicquote': {
                const islamicQuotes = [
                    "And whoever relies upon Allah - then He is sufficient for him. Indeed, Allah will accomplish His purpose.",
                    "Indeed, with hardship [will be] ease. (Quran 94:6)",
                    "The best among you are those who have the best manners and character. (Hadith - Bukhari)",
                    "The strong believer is better and more beloved to Allah than the weak believer. (Hadith - Muslim)"
                ];
                
                const random = islamicQuotes[Math.floor(Math.random() * islamicQuotes.length)];
                await loft(socket, m, `╭━━❪ 🕌 *ISLAMIC QUOTE* 🕌 ❫━━┈⊷
┃
┃ "${random}"
┃
┃ May Allah guide us all. 🤲
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [
                    { buttonId: `${prefix}qouteislamic`, buttonText: { displayText: '🔄 ANOTHER' }, type: 1 }
                ], "🕌 ISLAMIC QUOTE");
                break;
            }

            case 'qoutechristian':
            case 'christianquote': {
                const christianQuotes = [
                    "For God so loved the world that he gave his one and only Son. (John 3:16)",
                    "I can do all things through Christ who strengthens me. (Philippians 4:13)",
                    "The Lord is my shepherd; I shall not want. (Psalm 23:1)",
                    "Trust in the Lord with all your heart and lean not on your own understanding. (Proverbs 3:5)"
                ];
                
                const random = christianQuotes[Math.floor(Math.random() * christianQuotes.length)];
                await loft(socket, m, `╭━━❪ ✝️ *CHRISTIAN QUOTE* ✝️ ❫━━┈⊷
┃
┃ "${random}"
┃
┃ May God bless you always. 🙏
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [
                    { buttonId: `${prefix}qoutechristian`, buttonText: { displayText: '🔄 ANOTHER' }, type: 1 }
                ], "✝️ CHRISTIAN QUOTE");
                break;
            }

            case 'lyrics': {
                if (!text) {
                    await loft(socket, m, `╭━━❪ 🚀 *TRY AGAIN* ❫━━┈⊷
┃
┃ Example: ${prefix}lyrics Shape of You
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 TRY AGAIN");
                    return;
                }

                try {
                    const res = await axios.get(`https://api.lyrics.ovh/v1/${encodeURIComponent(text.split(' ')[0])}/${encodeURIComponent(text)}`);
                    const lyrics = res.data.lyrics || "Lyrics not found!";
                    
                    await loft(socket, m, `╭━━❪ 🎵 *LYRICS* 🎵 ❫━━┈⊷
┃
┃ ${lyrics.substring(0, 3800)}
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🎵 LYRICS");
                } catch {
                    await loft(socket, m, `╭━━❪ 🚀 *TRY AGAIN* ❫━━┈⊷
┃
┃ Lyrics not found!
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 TRY AGAIN");
                }
                break;
            }

            case 'calc':
            case 'calculate': {
                if (!text) {
                    await loft(socket, m, `╭━━❪ 🚀 *TRY AGAIN* ❫━━┈⊷
┃
┃ Example: ${prefix}calc 2+2*5
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 TRY AGAIN");
                    return;
                }

                try {
                    const result = Function('"use strict";return (' + text + ')')();
                    await loft(socket, m, `╭━━❪ 🧮 *CALCULATION* 🧮 ❫━━┈⊷
┃
┃ ${text} = ${result}
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🧮 CALCULATION");
                } catch {
                    await loft(socket, m, `╭━━❪ 🚀 *TRY AGAIN* ❫━━┈⊷
┃
┃ Invalid calculation!
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 TRY AGAIN");
                }
                break;
            }
            

            case 'tourl':
            case 'url': {
                if (!m.quoted || (!m.quoted.message?.imageMessage && !m.quoted.message?.videoMessage && !m.quoted.message?.audioMessage)) {
                    await loft(socket, m, `╭━━❪ 🚀 *TRY AGAIN* ❫━━┈⊷
┃
┃ Reply to an image/video/audio!
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 TRY AGAIN");
                    return;
                }

                try {
                    const buffer = await downloadMediaMessage(m.quoted, 'buffer');
                    const url = await uploadToCatbox(buffer);
                    
                    await loft(socket, m, `╭━━❪ ☁️ *UPLOADED* ☁️ ❫━━┈⊷
┃
┃ 🔗 *Link* : ${url}
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "☁️ UPLOADED");
                } catch {
                    await loft(socket, m, `╭━━❪ 🚀 *TRY AGAIN* ❫━━┈⊷
┃
┃ Failed to upload file!
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`, [], "🚀 TRY AGAIN");
                }
                break;
            }

            default:
                if (body.startsWith('=>') && isOwner) {
                    try {
                        let evaled = await eval(`(async () => { ${body.slice(3)} })()`);
                        if (typeof evaled !== 'string') evaled = util.inspect(evaled);
                        await socket.sendMessage(m.chat, { text: `╭━━❪ 🖥️ *EVAL RESULT* 🖥️ ❫━━┈⊷
┃
┃ ${String(evaled).substring(0, 4000)}
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷` }, { quoted: m });
                    } catch (err) {
                        await socket.sendMessage(m.chat, { text: `╭━━❪ 🚀 *TRY AGAIN* ❫━━┈⊷
┃
┃ ${String(err)}
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷` }, { quoted: m });
                    }
                }
                break;
        }
    } catch (err) {
        console.log(err);
    }
};
