const https = require('https');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '9254480058:AAEU91vAtIan_4Mjc5shbIDZoFv_wwmbo88';
const MINI_APP_URL = process.env.MINI_APP_URL || 'https://fireflyplayv1.vercel.app';

function callTelegramApi(method, data = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${BOT_TOKEN}/${method}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw));
          } catch (e) {
            resolve({ ok: false, error: raw });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/**
 * Configure Telegram Bot Menu Button (Web App button next to chat bar)
 */
async function configureMenuButton() {
  try {
    const res = await callTelegramApi('setChatMenuButton', {
      menu_button: {
        type: 'web_app',
        text: '🚀 Play Now',
        web_app: {
          url: MINI_APP_URL,
        },
      },
    });
    console.log('🤖 Telegram Menu Button configured:', res.ok ? 'SUCCESS' : res);
  } catch (err) {
    console.warn('Failed to set chat menu button:', err.message);
  }
}

/**
 * Long-polling loop to respond to /start and direct commands
 */
let lastUpdateId = 0;
let isPolling = false;

async function startBotPolling() {
  if (isPolling) return;
  isPolling = true;

  console.log('🤖 Telegram Bot polling started for @FireflyPlayBot');
  await configureMenuButton();

  const poll = async () => {
    try {
      const res = await callTelegramApi('getUpdates', {
        offset: lastUpdateId + 1,
        timeout: 25,
        allowed_updates: ['message'],
      });

      if (res && res.ok && Array.isArray(res.result)) {
        for (const update of res.result) {
          lastUpdateId = update.update_id;
          const msg = update.message;
          if (!msg || !msg.text) continue;

          const text = msg.text.trim();
          const chatId = msg.chat.id;
          const username = msg.from?.username ? `@${msg.from.username}` : (msg.from?.first_name || 'Player');

          if (text.startsWith('/start')) {
            // Check for referral parameter e.g. /start AST1234
            const parts = text.split(' ');
            const refParam = parts.length > 1 ? parts[1] : '';
            const appUrl = refParam
              ? `${MINI_APP_URL}?startapp=${encodeURIComponent(refParam)}`
              : MINI_APP_URL;

            const welcomeMessage =
              `⚡️ *Welcome to Firefly Play!*\n` +
              `Hey ${username}, welcome to the Firefly's community! ❤️\n\n` +
              `Play, complete tasks, invite friends, and earn PTS that can be withdrawn easily into real USDT.\n\n` +
              `Play • Earn • Withdraw`;

            await callTelegramApi('sendMessage', {
              chat_id: chatId,
              text: welcomeMessage,
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: '🎮 Launch Firefly Play',
                      web_app: { url: appUrl },
                    },
                  ],
                  [
                    {
                      text: '📢 Firefly Channel',
                      url: 'https://t.me/FireflyPlay',
                    },
                    {
                      text: '💬 Community Group',
                      url: 'https://t.me/+K1hfu9rlv9kwYzA9',
                    },
                  ],
                  [
                    {
                      text: '💳 Payout Proofs',
                      url: 'https://t.me/FireflyPayouts',
                    },
                    {
                      text: '👥 Invite Friends',
                      url: `https://t.me/share/url?url=${encodeURIComponent(
                        `https://t.me/FireflyPlayBot?start=${msg.from?.id || ''}`
                      )}&text=${encodeURIComponent(
                        'Join Firefly Play! Blast enemies and earn real rewards!'
                      )}`,
                    },
                  ],
                ],
              },
            });
          }
        }
      }
    } catch (err) {
      // Polling network glitch, wait briefly before resuming
      await new Promise((r) => setTimeout(r, 3000));
    }

    if (isPolling) {
      setTimeout(poll, 1000);
    }
  };

  poll();
}

function stopBotPolling() {
  isPolling = false;
}

/**
 * Check if a user has joined a chat/channel
 */
async function checkChatMember(chatId, userId) {
  try {
    const res = await callTelegramApi('getChatMember', {
      chat_id: chatId,
      user_id: Number(userId),
    });
    if (!res || !res.ok) {
      return { ok: false, error: res?.description || 'Error querying chat member' };
    }
    const status = res.result?.status;
    const isMember = ['creator', 'administrator', 'member', 'restricted'].includes(status);
    return { ok: true, isMember, status };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = {
  configureMenuButton,
  startBotPolling,
  stopBotPolling,
  callTelegramApi,
  checkChatMember,
};
