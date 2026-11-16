const crypto = require('crypto');
const User = require('../models/User');

/**
 * Validates Telegram initData string with Bot Token
 */
function verifyTelegramWebAppData(initData, botToken) {
  if (!initData || !botToken) return null;

  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    if (!hash) return null;

    urlParams.delete('hash');

    const params = [];
    for (const [key, value] of urlParams.entries()) {
      params.push(`${key}=${value}`);
    }
    params.sort();
    const dataCheckString = params.join('\n');

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (calculatedHash === hash) {
      const userRaw = urlParams.get('user');
      return userRaw ? JSON.parse(userRaw) : null;
    }
    return null;
  } catch (err) {
    console.error('Error verifying initData:', err.message);
    return null;
  }
}

/**
 * Auth middleware: extracts user by telegram ID or auth header
 */
const authMiddleware = async (req, res, next) => {
  try {
    const telegramId = req.headers['x-telegram-id'];

    if (!telegramId) {
      return res.status(401).json({ success: false, message: 'Authentication required. No Telegram ID provided.' });
    }

    let user = await User.findOne({ telegramId });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found. Please initialize session.' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth error:', error.message);
    res.status(500).json({ success: false, message: 'Server auth error' });
  }
};

/**
 * Admin middleware: restricts endpoint to authorized admin
 */
const adminMiddleware = async (req, res, next) => {
  try {
    const telegramId = req.headers['x-telegram-id'];
    const adminId = String(process.env.ADMIN_TELEGRAM_ID || '5802486388');
    const adminUsername = String(process.env.ADMIN_USERNAME || 'Gaurav_281').toLowerCase();

    let user = req.user;
    if (!user && telegramId) {
      user = await User.findOne({ telegramId });
    }

    if (!user) {
      return res.status(401).json({ success: false, message: 'Authentication required for admin access.' });
    }

    const isMatchId = String(user.telegramId) === adminId;
    const isMatchUsername = user.username && user.username.toLowerCase() === adminUsername;

    if (!isMatchId && !isMatchUsername && !user.isAdmin) {
      return res.status(403).json({ success: false, message: 'Access denied: Admin privileges required.' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Admin auth error:', error.message);
    res.status(500).json({ success: false, message: 'Admin auth error' });
  }
};

module.exports = {
  verifyTelegramWebAppData,
  authMiddleware,
  adminMiddleware,
};
