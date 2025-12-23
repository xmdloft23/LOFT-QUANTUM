// ──────────────────────────────────────────────────────────────
//  MR LOFT – SLIDE MENU 
// ──────────────────────────────────────────────────────────────
const settings = require('../settings');
const axios = require('axios');
const { prepareWAMessageMedia, generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');

const IMAGES = [
  './image.jpg',
  // Add more images later
];

/**
 * Read More Spoiler (WhatsApp Hack)
 */
const READ_MORE = '\u200B'.repeat(4001);

/**
 * Full Help Message (used only for building slides)
 */
const HELP_MESSAGE = `
╭▰▰〔 *ʟᴏꜰᴛ Qᴜᴀɴᴛᴜᴍ* 〕▰▰╮
✖ 💠 *ʙᴏᴛ ɴᴀᴍᴇ:* ʟᴏꜰᴛ Qᴜᴀɴᴛᴜᴍ
✖ 👑 *ᴏᴡɴᴇʀ:* 𝚂𝚒𝚛 𝙻𝙾𝙵𝚃
✖ ⚙️ *ᴠᴇʀꜱɪᴏɴ:* 𝚕𝚊𝚝𝚎𝚜𝚝 𝚀𝚞𝚊𝚗𝚝𝚞𝚖
✖ 💻 *ᴘʟᴀᴛꜰᴏʀᴍ:* 𝚀𝚞𝚊𝚗𝚝𝚞𝚖 (𝟸𝟸.𝟶𝟺)
✖ 🕐 *ᴜᴘᴛɪᴍᴇ:* ${getUptime()}
▰▰▰▰▰▰▰▰▰▰
 ᴡᴇʟᴄᴏᴍᴇ ᴛᴏ ʟᴏꜰᴛ™
▰▰▰▰▰▰▰▰▰▰
ꜰʀᴇᴇ ʙᴏᴛ 👉 https://quantum-three-taupe.vercel.app/
ᴏᴡɴᴇʀ 👉 ꜱɪʀ ʟᴏꜰᴛ 
ᴄᴏɴᴛᴀᴄᴛ 👉 +255778018545

# ᴘᴀɢᴇ 01
✖ 𝐡𝐞𝐥𝐩 | .𝐦𝐞𝐧𝐮
✖ 𝐩𝐢𝐧𝐠
✖ 𝐚𝐥𝐢𝐯𝐞
✖ 𝐭𝐭𝐬 <𝐭𝐞𝐱𝐭>
✖ 𝐨𝐰𝐧𝐞𝐫
✖ 𝐣𝐨𝐤𝐞
✖ 𝐪𝐮𝐨𝐭𝐞
✖ 𝐟𝐚𝐜𝐭
✖ 𝐰𝐞𝐚𝐭𝐡𝐞𝐫 <𝐜𝐢𝐭𝐲>
✖ 𝐧𝐞𝐰𝐬
✖ 𝐚𝐭𝐭𝐩 <𝐭𝐞𝐱𝐭>
✖ 𝐥𝐲𝐫𝐢𝐜𝐬 <𝐬𝐨𝐧𝐠>
✖ 𝟖𝐛𝐚𝐥𝐥 <𝐪𝐮𝐞𝐬𝐭𝐢𝐨𝐧>
✖ 𝐠𝐫𝐨𝐮𝐩𝐢𝐧𝐟𝐨
✖ 𝐬𝐭𝐚𝐟𝐟 | .𝐚𝐝𝐦𝐢𝐧𝐬
✖ 𝐯𝐯
✖ 𝐭𝐫𝐭 <𝐭𝐞𝐱𝐭> <𝐥𝐚𝐧𝐠>
✖ 𝐬𝐬 <𝐥𝐢𝐧𝐤>
✖ 𝐣𝐢𝐝
✖ 𝐮𝐫𝐥 

# ᴘᴀɢᴇ 02
✖ 𝐛𝐚𝐧 @𝐮𝐬𝐞𝐫
✖ 𝐩𝐫𝐨𝐦𝐨𝐭𝐞 @𝐮𝐬𝐞𝐫
✖ 𝐝𝐞𝐦𝐨𝐭𝐞 @𝐮𝐬𝐞𝐫
✖ 𝐦𝐮𝐭𝐞 <𝐦𝐢𝐧𝐮𝐭𝐞𝐬>
✖ 𝐮𝐧𝐦𝐮𝐭𝐞
✖ 𝐝𝐞𝐥𝐞𝐭𝐞 | .𝐝𝐞𝐥
✖ 𝐤𝐢𝐜𝐤 @𝐮𝐬𝐞𝐫
✖ 𝐰𝐚𝐫𝐧𝐢𝐧𝐠𝐬 @𝐮𝐬𝐞𝐫
✖ 𝐰𝐚𝐫𝐧 @𝐮𝐬𝐞𝐫
✖ 𝐚𝐧𝐭𝐢𝐥𝐢𝐧𝐤
✖ 𝐚𝐧𝐭𝐢𝐛𝐚𝐝𝐰𝐨𝐫𝐝
✖ 𝐜𝐥𝐞𝐚𝐫
✖ 𝐭𝐚𝐠 <𝐦𝐞𝐬𝐬𝐚𝐠𝐞>
✖ 𝐭𝐚𝐠𝐚𝐥𝐥
✖ 𝐭𝐚𝐠𝐧𝐨𝐭𝐚𝐝𝐦𝐢𝐧
✖ 𝐡𝐢𝐝𝐞𝐭𝐚𝐠 <𝐦𝐞𝐬𝐬𝐚𝐠𝐞>
✖ 𝐜𝐡𝐚𝐭𝐛𝐨𝐭
✖ 𝐫𝐞𝐬𝐞𝐭𝐥𝐢𝐧𝐤
✖ 𝐚𝐧𝐭𝐢𝐭𝐚𝐠 <𝐨𝐧/𝐨𝐟𝐟>
✖ 𝐰𝐞𝐥𝐜𝐨𝐦𝐞 <𝐨𝐧/𝐨𝐟𝐟>
✖ 𝐠𝐨𝐨𝐝𝐛𝐲𝐞 <𝐨𝐧/𝐨𝐟𝐟>
✖ 𝐬𝐞𝐭𝐠𝐝𝐞𝐬𝐜 <𝐝𝐞𝐬𝐜𝐫𝐢𝐩𝐭𝐢𝐨𝐧>
✖ 𝐬𝐞𝐭𝐠𝐧𝐚𝐦𝐞 <𝐧𝐞𝐰 𝐧𝐚𝐦𝐞>
✖ 𝐬𝐞𝐭𝐠𝐩𝐩

# ᴘᴀɢᴇ 03
✖ 𝐦𝐨𝐝𝐞 <𝐩𝐮𝐛𝐥𝐢𝐜/𝐩𝐫𝐢𝐯𝐚𝐭𝐞>
✖ 𝐜𝐥𝐞𝐚𝐫𝐬𝐞𝐬𝐬𝐢𝐨𝐧
✖ 𝐚𝐧𝐭𝐢𝐝𝐞𝐥𝐞𝐭𝐞
✖ 𝐜𝐥𝐞𝐚𝐫𝐭𝐦𝐩
✖ 𝐮𝐩𝐝𝐚𝐭𝐞
✖ 𝐬𝐞𝐭𝐭𝐢𝐧𝐠𝐬
✖ 𝐬𝐞𝐭𝐩𝐩
✖ 𝐚𝐮𝐭𝐨𝐫𝐞𝐚𝐜𝐭 <𝐨𝐧/𝐨𝐟𝐟>
✖ 𝐚𝐮𝐭𝐨𝐬𝐭𝐚𝐭𝐮𝐬 <𝐨𝐧/𝐨𝐟𝐟>
✖ 𝐚𝐮𝐭𝐨𝐬𝐭𝐚𝐭𝐮𝐬 𝐫𝐞𝐚𝐜𝐭 <𝐨𝐧/𝐨𝐟𝐟>
✖ 𝐚𝐮𝐭𝐨𝐭𝐲𝐩𝐢𝐧𝐠 <𝐨𝐧/𝐨𝐟𝐟>
✖ 𝐚𝐮𝐭𝐨𝐫𝐞𝐚𝐝 <𝐨𝐧/𝐨𝐟𝐟>
✖ 𝐚𝐧𝐭𝐢𝐜𝐚𝐥𝐥 <𝐨𝐧/𝐨𝐟𝐟>
✖ 𝐩𝐦𝐛𝐥𝐨𝐜𝐤𝐞𝐫 <𝐨𝐧/𝐨𝐟𝐟/𝐬𝐭𝐚𝐭𝐮𝐬>
✖ 𝐩𝐦𝐛𝐥𝐨𝐜𝐤𝐞𝐫 𝐬𝐞𝐭𝐦𝐬𝐠 <𝐭𝐞𝐱𝐭>
✖ 𝐬𝐞𝐭𝐦𝐞𝐧𝐭𝐢𝐨𝐧
✖ 𝐦𝐞𝐧𝐭𝐢𝐨𝐧 <𝐨𝐧/𝐨𝐟𝐟>

# ᴘᴀɢᴇ 04
✖ 𝐛𝐥𝐮𝐫 <𝐢𝐦𝐚𝐠𝐞>
✖ 𝐬𝐢𝐦𝐚𝐠𝐞
✖ 𝐬𝐭𝐢𝐜𝐤𝐞𝐫
✖ 𝐫𝐞𝐦𝐨𝐯𝐞𝐛𝐠
✖ 𝐫𝐞𝐦𝐢𝐧𝐢
✖ 𝐜𝐫𝐨𝐩
✖ 𝐭𝐠𝐬𝐭𝐢𝐜𝐤𝐞𝐫 <𝐥𝐢𝐧𝐤>
✖ 𝐦𝐞𝐦𝐞
✖ 𝐭𝐚𝐤𝐞 <𝐩𝐚𝐜𝐤𝐧𝐚𝐦𝐞>
✖ 𝐞𝐦𝐨𝐣𝐢𝐦𝐢𝐱 <𝐞𝐦𝐣𝟏>+<𝐞𝐦𝐣𝟐>
✖ 𝐢𝐠𝐬 <𝐢𝐧𝐬𝐭𝐚 𝐥𝐢𝐧𝐤>
✖ 𝐢𝐠𝐬𝐜 <𝐢𝐧𝐬𝐭𝐚 𝐥𝐢𝐧𝐤>

# ᴘᴀɢᴇ 05
✖ 𝐩𝐢𝐞𝐬 <𝐜𝐨𝐮𝐧𝐭𝐫𝐲>
✖ 𝐜𝐡𝐢𝐧𝐚
✖ 𝐢𝐧𝐝𝐨𝐧𝐞𝐬𝐢𝐚
✖ 𝐣𝐚𝐩𝐚𝐧
✖ 𝐤𝐨𝐫𝐞𝐚
✖ 𝐡𝐢𝐣𝐚𝐛

# ᴘᴀɢᴇ 06
✖ 𝐭𝐢𝐜𝐭𝐚𝐜𝐭𝐨𝐞 @𝐮𝐬𝐞𝐫
✖ 𝐡𝐚𝐧𝐠𝐦𝐚𝐧
✖ 𝐠𝐮𝐞𝐬𝐬 <𝐥𝐞𝐭𝐭𝐞𝐫>
✖ 𝐭𝐫𝐢𝐯𝐢𝐚
✖ 𝐚𝐧𝐬𝐰𝐞𝐫 <𝐚𝐧𝐬𝐰𝐞𝐫>
✖ 𝐭𝐫𝐮𝐭𝐡
✖ 𝐝𝐚𝐫𝐞

# ᴘᴀɢᴇ 07
✖ 𝐠𝐩𝐭 <𝐪𝐮𝐞𝐬𝐭𝐢𝐨𝐧>
✖ 𝐠𝐞𝐦𝐢𝐧𝐢 <𝐪𝐮𝐞𝐬𝐭𝐢𝐨𝐧>
✖ 𝐢𝐦𝐚𝐠𝐢𝐧𝐞 <𝐩𝐫𝐨𝐦𝐩𝐭>
✖ 𝐟𝐥𝐮𝐱 <𝐩𝐫𝐨𝐦𝐩𝐭>
✖ 𝐬𝐨𝐫𝐚 <𝐩𝐫𝐨𝐦𝐩𝐭>

# ᴘᴀɢᴇ 08
✖ 𝐜𝐨𝐦𝐩𝐥𝐢𝐦𝐞𝐧𝐭 @𝐮𝐬𝐞𝐫
✖ 𝐢𝐧𝐬𝐮𝐥𝐭 @𝐮𝐬𝐞𝐫
✖ 𝐟𝐥𝐢𝐫𝐭
✖ 𝐬𝐡𝐚𝐲𝐚𝐫𝐢
✖ 𝐠𝐨𝐨𝐝𝐧𝐢𝐠𝐡𝐭
✖ 𝐫𝐨𝐬𝐞𝐝𝐚𝐲
✖ 𝐜𝐡𝐚𝐫𝐚𝐜𝐭𝐞𝐫 @𝐮𝐬𝐞𝐫
✖ 𝐰𝐚𝐬𝐭𝐞𝐝 @𝐮𝐬𝐞𝐫
✖ 𝐬𝐡𝐢𝐩 @𝐮𝐬𝐞𝐫
✖ 𝐬𝐢𝐦𝐩 @𝐮𝐬𝐞𝐫
✖ 𝐬𝐭𝐮𝐩𝐢𝐝 @𝐮𝐬𝐞𝐫 [𝐭𝐞𝐱𝐭]

# ᴘᴀɢᴇ 09
✖ 𝐦𝐞𝐭𝐚𝐥𝐥𝐢𝐜 <𝐭𝐞𝐱𝐭>
✖ 𝐢𝐜𝐞 <𝐭𝐞𝐱𝐭>
✖ 𝐬𝐧𝐨𝐰 <𝐭𝐞𝐱𝐭>
✖ 𝐢𝐦𝐩𝐫𝐞𝐬𝐬𝐢𝐯𝐞 <𝐭𝐞𝐱𝐭>
✖ 𝐦𝐚𝐭𝐫𝐢𝐱 <𝐭𝐞𝐱𝐭>
✖ 𝐥𝐢𝐠𝐡𝐭 <𝐭𝐞𝐱𝐭>
✖ 𝐧𝐞𝐨𝐧 <𝐭𝐞𝐱𝐭>
✖ 𝐝𝐞𝐯𝐢𝐥 <𝐭𝐞𝐱𝐭>
✖ 𝐩𝐮𝐫𝐩𝐥𝐞 <𝐭𝐞𝐱𝐭>
✖ 𝐭𝐡𝐮𝐧𝐝𝐞𝐫 <𝐭𝐞𝐱𝐭>
✖ 𝐥𝐞𝐚𝐯𝐞𝐬 <𝐭𝐞𝐱𝐭>
✖ 𝟏𝟗𝟏𝟕 <𝐭𝐞𝐱𝐭>
✖ 𝐚𝐫𝐞𝐧𝐚 <𝐭𝐞𝐱𝐭>
✖ 𝐡𝐚𝐜𝐤𝐞𝐫 <𝐭𝐞𝐱𝐭>
✖ 𝐬𝐚𝐧𝐝 <𝐭𝐞𝐱𝐭>
✖ 𝐛𝐥𝐚𝐜𝐤𝐩𝐢𝐧𝐤 <𝐭𝐞𝐱𝐭>
✖ 𝐠𝐥𝐢𝐭𝐜𝐡 <𝐭𝐞𝐱𝐭>
✖ 𝐟𝐢𝐫𝐞 <𝐭𝐞𝐱𝐭>

# ᴘᴀɢᴇ 10
✖ 𝐩𝐥𝐚𝐲 <𝐬𝐨𝐧𝐠>
✖ 𝐬𝐨𝐧𝐠 <𝐬𝐨𝐧𝐠>
✖ 𝐬𝐩𝐨𝐭𝐢𝐟𝐲 <𝐪𝐮𝐞𝐫𝐲>
✖ 𝐢𝐧𝐬𝐭𝐚𝐠𝐫𝐚𝐦 <𝐥𝐢𝐧𝐤>
✖ 𝐟𝐚𝐜𝐞𝐛𝐨𝐨𝐤 <𝐥𝐢𝐧𝐤>
✖ 𝐭𝐢𝐤𝐭𝐨𝐤 <𝐥𝐢𝐧𝐤>
✖ 𝐯𝐢𝐝𝐞𝐨 <𝐬𝐨𝐧𝐠>
✖ 𝐲𝐭𝐦𝐩𝟒 <𝐥𝐢𝐧𝐤>

# ᴘᴀɢᴇ 11
✖ 𝐡𝐞𝐚𝐫𝐭
✖ 𝐡𝐨𝐫𝐧𝐲
✖ 𝐜𝐢𝐫𝐜𝐥𝐞
✖ 𝐥𝐠𝐛𝐭
✖ 𝐥𝐨𝐥𝐢𝐜𝐞
✖ 𝐢𝐭𝐬-𝐬𝐨-𝐬𝐭𝐮𝐩𝐢𝐝
✖ 𝐧𝐚𝐦𝐞𝐜𝐚𝐫𝐝
✖ 𝐨𝐨𝐠𝐰𝐚𝐲
✖ 𝐭𝐰𝐞𝐞𝐭
✖ 𝐲𝐭𝐜𝐨𝐦𝐦𝐞𝐧𝐭
✖ 𝐜𝐨𝐦𝐫𝐚𝐝𝐞
✖ 𝐠𝐚𝐲
✖ 𝐠𝐥𝐚𝐬𝐬
✖ 𝐣𝐚𝐢𝐥
✖ 𝐩𝐚𝐬𝐬𝐞𝐝
✖ 𝐭𝐫𝐢𝐠𝐠𝐞𝐫𝐞𝐝

# ᴘᴀɢᴇ 12
✖ 𝐧𝐞𝐤𝐨
✖ 𝐰𝐚𝐢𝐟𝐮
✖ 𝐥𝐨𝐥𝐢
✖ 𝐧𝐨𝐦
✖ 𝐩𝐨𝐤𝐞
✖ 𝐜𝐫𝐲
✖ 𝐤𝐢𝐬𝐬
✖ 𝐩𝐚𝐭
✖ 𝐡𝐮𝐠
✖ 𝐰𝐢𝐧𝐤
✖ 𝐟𝐚𝐜𝐞𝐩𝐚𝐥𝐦
`.trim();

/**
 * Dynamic Uptime
 */
function getUptime() {
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);
  return `${hours}h ${minutes}m ${seconds}s`;
}

/**
 * Pick Random Item from Array
 */
const pickRandom = (arr) => arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;

/**
 * Validate URL via HEAD request
 */
const isValidUrl = async (url) => {
  try {
    const { status } = await axios.head(url, { timeout: 6000 });
    return status >= 200 && status < 400;
  } catch {
    return false;
  }
};

/**
 * SLIDE MENU - Interactive Carousel
 */
const sendSlideHelpMenu = async (sock, chatId, message) => {
  const quoted = message || null;

  try {
    const sections = HELP_MESSAGE.split('# ').filter(Boolean).map(s => '# ' + s);
    const cards = [];

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const titleMatch = section.match(/# ([^\n]+)/);
      const title = titleMatch ? titleMatch[1].trim() : `Section ${i + 1}`;
      const imageUrl = IMAGES[i % IMAGES.length] || IMAGES[0];

      let media = null;
      try {
        media = await prepareWAMessageMedia(
          { image: { url: imageUrl } },
          { upload: sock.waUploadToServer }
        );
      } catch (e) {
        console.warn(`Image upload failed for slide ${i + 1}:`, e.message);
      }

      const header = proto.Message.InteractiveMessage.Header.create({
        ...(media || {}),
        title: `*${title}*`,
        subtitle: "𝙻𝚘𝚏𝚝 𝚀𝚞𝚊𝚗𝚝𝚞𝚖 𝚇𝟽",
        hasMediaAttachment: !!media,
      });

      const bodyText = section.replace(/^[^\n]*\n/, '').trim().split('\n').slice(0, 25).join('\n');

      cards.push({
        header,
        body: { text: bodyText },
        nativeFlowMessage: {
          buttons: [
            {
              name: "quick_reply",
              buttonParamsJson: JSON.stringify({
                display_text: `View ${i + 1}`,
                id: `view_help_${i + 1}`
              })
            }
          ]
        }
      });
    }

    const carouselMessage = generateWAMessageFromContent(
      chatId,
      {
        viewOnceMessage: {
          message: {
            interactiveMessage: {
              body: { text: "*ꜱʟɪᴅᴇ ʀɪɢʜᴛ*" },
              footer: { text: "©ᴘᴏᴡᴇʀᴅ ʙʏ ʟᴏꜰᴛ" },
              carouselMessage: { cards, messageVersion: 1 },
              contextInfo: { forwardingScore: 0, isForwarded: false }
            }
          }
        }
      },
      { quoted }
    );

    const sent = await sock.relayMessage(chatId, carouselMessage.message, {
      messageId: carouselMessage.key.id
    });

    // Listener: React & Send Full Section on Button Press
    const listener = async (m) => {
      const mek = m.messages[0];
      if (!mek.message) return;

      const text = mek.message?.conversation || mek.message?.extendedTextMessage?.text || '';
      const isReply = mek.message?.extendedTextMessage?.contextInfo?.stanzaId === sent.key.id;
      const from = mek.key.remoteJid;

      if (!isReply || from !== chatId) return;

      await sock.sendMessage(from, { react: { text: 'Success', key: mek.key } });

      const match = text.match(/view_help_(\d+)/);
      if (match) {
        const idx = parseInt(match[1]) - 1;
        if (idx >= 0 && idx < sections.length) {
          const selected = sections[idx];
          const title = selected.match(/# ([^\n]+)/)?.[1]?.trim() || 'Menu';
          const imageUrl = IMAGES[idx % IMAGES.length] || IMAGES[0];

          await sock.sendMessage(from, {
            image: { url: imageUrl },
            caption: `*${title}*\n\n${selected.replace(/^#[^\n]*\n/, '').trim()}`
          }, { quoted: mek });
        }
      }

      sock.ev.off('messages.upsert', listener);
    };

    sock.ev.on('messages.upsert', listener);

  } catch (error) {
    console.error('Slide Menu Error:', error);
    await sock.sendMessage(chatId, { text: '*Slide menu failed.*\n\n' + HELP_MESSAGE }, { quoted });
  }
};

/**
 * Main Help Command – **SLIDE MENU ONLY**
 */
const helpCommand = async (sock, chatId, message) => {
  if (!sock || !chatId) return console.error('Missing sock or chatId');

  try {
    // Directly send the interactive slide menu
    await sendSlideHelpMenu(sock, chatId, message);

  } catch (error) {
    console.error('helpCommand Error:', error);
    await sock.sendMessage(chatId, { text: `*Error:* ${error.message}\n\n${HELP_MESSAGE}` }, { quoted: message });
  }
};

module.exports = helpCommand;