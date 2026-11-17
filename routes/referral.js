const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');

/**
 * Get user referral stats and friend list
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const user = req.user;

    const referredFriends = await User.find({ referredBy: user.telegramId })
      .sort({ createdAt: -1 })
      .select('firstName username createdAt totalKills coins')
      .lean();

    const formattedFriends = referredFriends.map((f) => ({
      name: f.firstName || f.username || 'Friend',
      joinedAt: f.createdAt,
      isActive: (f.totalKills || 0) >= 5,
    }));

    const botUsername = process.env.BOT_USERNAME || process.env.TELEGRAM_BOT_USERNAME || 'FireflyPlayBot';
    const inviteLink = `https://t.me/${botUsername}?start=ref_${user.referralCode}`;

    res.json({
      success: true,
      referralCode: user.referralCode,
      inviteLink,
      friendsCount: referredFriends.length,
      activeFriendsCount: user.activeReferrals || 0,
      totalEarned: user.referralEarnings || 0,
      friends: formattedFriends,
    });
  } catch (error) {
    console.error('Referral error:', error);
    res.status(500).json({ success: false, message: 'Server error loading referral data' });
  }
});

module.exports = router;
