const https = require('https');
const Withdrawal = require('./models/Withdrawal');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '9254480058:AAEU91vAtIan_4Mjc5shbIDZoFv_wwmbo88';
const MINI_APP_URL = process.env.MINI_APP_URL || 'https://fireflyplayv1.vercel.app';
const PAYOUT_CHANNEL = process.env.PAYOUT_CHANNEL || '@FireflyPayouts';

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
 * Data Masking Helpers for Channel Privacy
 */
function maskUsername(username, firstName) {
  if (username) {
    const clean = username.replace('@', '').trim();
    if (clean.length <= 4) return `@${clean[0]}***${clean.slice(-1)}`;
    return `@${clean.slice(0, 3)}****${clean.slice(-2)}`;
  }
  if (firstName) {
    const clean = firstName.trim();
    if (clean.length <= 4) return `${clean[0]}***${clean.slice(-1)}`;
    return `${clean.slice(0, 2)}****${clean.slice(-2)}`;
  }
  return 'Player';
}

function maskUpi(upi) {
  if (!upi) return 'upi****@bank';
  const parts = upi.split('@');
  if (parts.length < 2) return 'upi****@bank';
  const handle = parts[0];
  const provider = parts[1];
  const maskedHandle =
    handle.length <= 4
      ? `${handle.slice(0, 2)}****`
      : `${handle.slice(0, 3)}****${handle.slice(-2)}`;
  return `${maskedHandle}@${provider}`;
}

function maskTxnId(txnRef) {
  if (!txnRef) return 'UPI/****9821';
  const str = String(txnRef).trim();
  if (str.length <= 8) return 'UPI/****' + str.slice(-3);
  return `${str.slice(0, 7)}****${str.slice(-4)}`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Send official payout notification to @FireflyPayouts channel
 */
async function sendPayoutNotification(withdrawal, userDoc, transactionRef, customTimestamp) {
  try {
    const shortRef = withdrawal._id ? withdrawal._id.toString().slice(-4).toUpperCase() : '7B21';
    const maskedUser = maskUsername(userDoc?.username, userDoc?.firstName);
    const maskedUpiId = maskUpi(withdrawal.upiId);
    const maskedTxn = maskTxnId(transactionRef || withdrawal.transactionRef);
    const amountStr = Number(withdrawal.amountInr).toFixed(2);

    const eventDate = customTimestamp || withdrawal.createdAt || new Date();
    const timeStr = new Date(eventDate).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Kolkata',
    });

    const messageText =
      `⚡️ <b>Payout Sent #${shortRef}</b>\n\n` +
      `👤 <b>User:</b> ${escapeHtml(maskedUser)}\n` +
      `💰 <b>Amount:</b> ₹${amountStr}\n` +
      `💳 <b>Payment Method:</b> UPI (${escapeHtml(maskedUpiId)})\n` +
      `🧾 <b>Txn ID:</b> <code>${escapeHtml(maskedTxn)}</code>\n` +
      `⏰ <b>Time:</b> ${timeStr} IST\n\n` +
      `✅ <b>Verified Payout by Firefly Play</b>`;

    const res = await callTelegramApi('sendMessage', {
      chat_id: PAYOUT_CHANNEL,
      text: messageText,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🚀 Open Firefly Play',
              url: 'https://t.me/FireflyPlayBot/app',
            },
          ],
        ],
      },
    });

    console.log(`📢 Payout notification sent to ${PAYOUT_CHANNEL}:`, res.ok ? 'SUCCESS' : res);
    return res;
  } catch (err) {
    console.error('Error sending payout notification to Telegram channel:', err);
    return null;
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
            const parts = text.split(' ');
            const param = parts.length > 1 ? parts[1].trim() : '';

            // 1. Check if user clicked [Verify] from @FireflyPayouts channel
            if (param.startsWith('payout_')) {
              const withdrawalId = param.replace('payout_', '');
              try {
                const w = await Withdrawal.findById(withdrawalId).populate('userId');
                if (w) {
                  const shortId = w._id.toString().slice(-4).toUpperCase();
                  const dateStr = (w.updatedAt || w.createdAt).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'Asia/Kolkata',
                  });

                  const recipient = escapeHtml(w.userId?.firstName || w.userId?.username || 'Pilot');
                  const upiClean = escapeHtml(w.upiId);
                  const txnClean = escapeHtml(w.transactionRef || 'Settled via Instant UPI');

                  const receiptMsg =
                    `🧾 <b>Official Firefly Payout Receipt</b>\n\n` +
                    `🆔 <b>Payout Ref:</b> #${shortId}\n` +
                    `💰 <b>Amount Paid:</b> ₹${w.amountInr.toFixed(2)}\n` +
                    `👤 <b>Recipient:</b> ${recipient}\n` +
                    `💳 <b>UPI ID:</b> <code>${upiClean}</code>\n` +
                    `🧾 <b>Complete Txn ID:</b> <code>${txnClean}</code>\n` +
                    `📅 <b>Processed At:</b> ${dateStr} IST\n` +
                    `⚡️ <b>Status:</b> ✅ Transferred & Confirmed\n\n` +
                    `<i>This withdrawal was approved and verified by the Firefly Play financial gateway.</i>`;

                  await callTelegramApi('sendMessage', {
                    chat_id: chatId,
                    text: receiptMsg,
                    parse_mode: 'HTML',
                    reply_markup: {
                      inline_keyboard: [
                        [
                          {
                            text: '🎮 Play & Earn Now',
                            web_app: { url: MINI_APP_URL },
                          },
                        ],
                        [
                          {
                            text: '📢 Firefly Payout Proofs',
                            url: 'https://t.me/FireflyPayouts',
                          },
                        ],
                      ],
                    },
                  });
                  continue;
                }
              } catch (lookupErr) {
                console.warn('Error fetching withdrawal verification:', lookupErr.message);
              }
            }

            // 2. Normal Welcome Message / Referral handler
            const appUrl = param
              ? `${MINI_APP_URL}?startapp=${encodeURIComponent(param)}`
              : MINI_APP_URL;

            const welcomeMessage =
              `⚡️ *Welcome to Firefly Play!*\n` +
              `Hey ${username}, welcome to the Firefly's community! ❤️\n\n` +
              `Play, complete tasks, invite friends, and earn PTS that can be withdrawn easily into real USDT.\n\n` +
              `Play • Earn • Withdraw`;

            await callTelegramApi('sendMessage', {
              chat_id: chatId,
              text: welcomeMessage,
              parse_mode: 'Markdown',
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
                        `https://t.me/FireflyPlayBot?start=ref_${msg.from?.id || ''}`
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
  sendPayoutNotification,
};
