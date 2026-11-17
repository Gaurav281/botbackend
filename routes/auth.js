const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { verifyTelegramWebAppData, authMiddleware } = require('../middleware/auth');
const { checkChatMember } = require('../bot');

/**
 * Generate unique referral code
 */
function generateReferralCode(telegramId) {
  const hash = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `AST${telegramId.slice(-4) || '99'}${hash}`;
}

/**
 * Auto-login or register user using real Telegram credentials
 */
router.post('/telegram', async (req, res) => {
  try {
    const { initData, devUser, referralCode } = req.body;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    let tgUser = null;

    if (initData) {
      tgUser = verifyTelegramWebAppData(initData, botToken);
      // If cryptographic verification with placeholder token passes to raw parse
      if (!tgUser) {
        try {
          const urlParams = new URLSearchParams(initData);
          const raw = urlParams.get('user');
          if (raw) tgUser = JSON.parse(raw);
        } catch (e) {
          // ignore
        }
      }
    }

    // Fallback if accessed via direct browser outside Telegram
    if (!tgUser && devUser) {
      tgUser = {
        id: devUser.id || `web_${Date.now()}`,
        first_name: devUser.firstName || 'Player',
        last_name: devUser.lastName || '',
        username: devUser.username || '',
        photo_url: devUser.photoUrl || '',
      };
    }

    if (!tgUser || !tgUser.id) {
      return res.status(400).json({
        success: false,
        message: 'Could not authenticate Telegram user',
      });
    }

    const telegramId = String(tgUser.id);
    let user = await User.findOne({ telegramId });
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      const newRefCode = generateReferralCode(telegramId);

      let referrer = null;
      if (referralCode) {
        referrer = await User.findOne({ referralCode });
      }

      user = new User({
        telegramId,
        username: tgUser.username || '',
        firstName: tgUser.first_name || 'Player',
        lastName: tgUser.last_name || '',
        photoUrl: tgUser.photo_url || '',
        referralCode: newRefCode,
        referredBy: referrer ? referrer.telegramId : null,
        coins: referrer ? 500 : 100, // Starter bonus
      });

      await user.save();

      // Transaction log for starter bonus
      await Transaction.create({
        userId: user._id,
        type: 'referral_bonus',
        amount: referrer ? 500 : 100,
        currency: 'PTS',
        description: referrer ? 'Welcome bonus from friend referral' : 'Welcome starter bonus',
      });

      // Reward the referrer atomically
      if (referrer) {
        await User.findByIdAndUpdate(referrer._id, {
          $inc: {
            coins: 400,
            referralEarnings: 400,
            referralCount: 1,
            activeReferrals: 1,
          },
        });

        await Transaction.create({
          userId: referrer._id,
          type: 'referral_bonus',
          amount: 400,
          currency: 'PTS',
          description: `Referral bonus: ${user.firstName} joined!`,
        });
      }
    } else {
      // Update with real Telegram name if changed in Telegram
      let changed = false;
      if (tgUser.first_name && user.firstName !== tgUser.first_name) {
        user.firstName = tgUser.first_name;
        changed = true;
      }
      if (tgUser.username && user.username !== tgUser.username) {
        user.username = tgUser.username;
        changed = true;
      }
      if (tgUser.photo_url && user.photoUrl !== tgUser.photo_url) {
        user.photoUrl = tgUser.photo_url;
        changed = true;
      }
      if (changed) {
        await user.save();
      }
    }

    // Check admin status
    const adminId = String(process.env.ADMIN_TELEGRAM_ID || '5802486388').trim();
    const adminUsername = String(process.env.ADMIN_USERNAME || 'Gaurav_281').toLowerCase().replace('@', '').trim();
    const cleanUsername = (user.username || '').toLowerCase().replace('@', '').trim();
    const isAdmin = String(telegramId).trim() === adminId || (cleanUsername && cleanUsername === adminUsername);

    if (isAdmin || user.isAdmin !== isAdmin) {
      user.isAdmin = isAdmin || user.isAdmin;
      await user.save();
    }

    res.json({
      success: true,
      isNewUser,
      user,
    });
  } catch (err) {
    console.error('Error in /telegram login:', err);
    res.status(500).json({ success: false, message: 'Server error during authentication' });
  }
});

/**
 * Get current user profile
 */
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const adminId = String(process.env.ADMIN_TELEGRAM_ID || '5802486388').trim();
    const adminUsername = String(process.env.ADMIN_USERNAME || 'Gaurav_281').toLowerCase().replace('@', '').trim();
    const cleanUsername = (req.user.username || '').toLowerCase().replace('@', '').trim();
    if (String(req.user.telegramId).trim() === adminId || (cleanUsername && cleanUsername === adminUsername)) {
      if (!req.user.isAdmin) {
        req.user.isAdmin = true;
        await req.user.save();
      }
    }
    res.json({ success: true, user: req.user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Update user preferences
 */
router.patch('/preferences', authMiddleware, async (req, res) => {
  try {
    const { doNotShowRules, alwaysFullScreen, soundEnabled, savedUpiId } = req.body;
    const updates = {};
    if (typeof doNotShowRules === 'boolean') updates.doNotShowRules = doNotShowRules;
    if (typeof alwaysFullScreen === 'boolean') updates.alwaysFullScreen = alwaysFullScreen;
    if (typeof soundEnabled === 'boolean') updates.soundEnabled = soundEnabled;
    if (typeof savedUpiId === 'string') updates.savedUpiId = savedUpiId;

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true }
    );

    res.json({ success: true, user: updatedUser });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/auth/channels-status
 * Checks membership for individual channels
 */
router.get('/channels-status', authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    const tgId = user.telegramId;

    if (!tgId || isNaN(Number(tgId)) || user.isAdmin) {
      if (!user.hasJoinedChannels) {
        user.hasJoinedChannels = true;
        await user.save();
      }
      return res.json({
        success: true,
        channel: true,
        group: true,
        payouts: true,
        allJoined: true,
      });
    }

    const [channelRes, payoutsRes] = await Promise.all([
      checkChatMember('@FireflyPlay', tgId),
      checkChatMember('@FireflyPayouts', tgId),
    ]);

    const channelJoined = channelRes.ok ? channelRes.isMember : false;
    const payoutsJoined = payoutsRes.ok ? payoutsRes.isMember : false;
    // For invite link group without known ID, maintain user-confirmed flag or groupJoined
    const groupJoined = user.hasJoinedGroup || false;

    // Persist hasJoinedChannels on user record if channel joined
    if (channelJoined && !user.hasJoinedChannels) {
      user.hasJoinedChannels = true;
      await user.save();
    }

    const allJoined = channelJoined && (user.hasJoinedChannels || false);

    res.json({
      success: true,
      channel: channelJoined,
      group: groupJoined,
      payouts: payoutsJoined,
      allJoined,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/auth/verify-channels
 * Verifies that the user has joined the required Telegram channels before accessing the mini app
 */
router.post('/verify-channels', authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    const tgId = user.telegramId;

    // Dev user or testing outside Telegram
    if (!tgId || isNaN(Number(tgId))) {
      user.hasJoinedChannels = true;
      await user.save();
      return res.json({
        success: true,
        user,
        status: { channel: true, group: true, payouts: true },
        message: 'Dev environment: Channels verified!',
      });
    }

    // Admin user automatically passes
    if (user.isAdmin) {
      user.hasJoinedChannels = true;
      await user.save();
      return res.json({
        success: true,
        user,
        status: { channel: true, group: true, payouts: true },
        message: 'Admin access: Verified!',
      });
    }

    const [channelRes, payoutsRes] = await Promise.all([
      checkChatMember('@FireflyPlay', tgId),
      checkChatMember('@FireflyPayouts', tgId),
    ]);

    const channelJoined = channelRes.ok ? channelRes.isMember : true; // if bot not added, don't hard block
    const payoutsJoined = payoutsRes.ok ? payoutsRes.isMember : true;

    if (channelRes.ok && !channelRes.isMember) {
      return res.status(400).json({
        success: false,
        message: 'Please join our channel @FireflyPlay first, then tap "I\'ve joined"!',
        status: {
          channel: false,
          group: req.body?.groupJoined ?? true,
          payouts: payoutsJoined,
        },
      });
    }

    user.hasJoinedChannels = true;
    await user.save();

    res.json({
      success: true,
      user,
      status: {
        channel: true,
        group: true,
        payouts: payoutsJoined,
      },
      message: 'Verified! Welcome to Firefly Play!',
    });
  } catch (error) {
    console.error('Verify channels error:', error);
    res.status(500).json({ success: false, message: 'Server error during verification' });
  }
});

module.exports = router;
