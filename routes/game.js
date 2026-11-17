const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { authMiddleware } = require('../middleware/auth');

/**
 * Start game session: checks boss claim lock (unlimited plays)
 */
router.post('/start', authMiddleware, async (req, res) => {
  try {
    const user = req.user;

    // Check if player has unclaimed boss reward
    if (user.bossKillPendingClaim) {
      return res.status(400).json({
        success: false,
        code: 'BOSS_CLAIM_PENDING',
        message: 'You defeated the Boss! Watch the ad to claim your 200 coins before playing again.',
      });
    }

    const sessionId = crypto.randomUUID();

    res.json({
      success: true,
      sessionId,
    });
  } catch (error) {
    console.error('Game start error:', error);
    res.status(500).json({ success: false, message: 'Server error starting game' });
  }
});

/**
 * Finish game session: calculates score, awards base coins, flags pending boss reward
 */
router.post('/finish', authMiddleware, async (req, res) => {
  try {
    const { score, enemiesKilled, bossKilled, difficulty, isTournament } = req.body;
    const user = req.user;

    const validScore = Math.max(0, parseInt(score) || 0);
    const validKills = Math.max(0, parseInt(enemiesKilled) || 0);
    const isBossDefeated = Boolean(bossKilled);
    const tournamentMatch = Boolean(isTournament);

    // Difficulty cap as per UI: Easy: 100 PTS, Normal: 150 PTS, Hard: 220 PTS
    let maxBasePoints = 150;
    if (difficulty === 'easy') maxBasePoints = 100;
    if (difficulty === 'hard') maxBasePoints = 220;

    // Per user requirement: In tournament match, do NOT add PTS to user PTS balance!
    const baseCoinsEarned = tournamentMatch ? 0 : Math.min(maxBasePoints, Math.floor(validScore / 10));

    // Prepare atomic update
    const updateOps = {
      $inc: {
        totalKills: validKills,
      },
    };

    if (baseCoinsEarned > 0) {
      updateOps.$inc.coins = baseCoinsEarned;
      updateOps.$inc.wonToday = baseCoinsEarned;
    }

    if (validScore > user.highScore) {
      updateOps.$set = { highScore: validScore };
    }

    // Only set boss kill claim in normal arena games, not tournament matches
    if (isBossDefeated && !tournamentMatch) {
      if (!updateOps.$set) updateOps.$set = {};
      updateOps.$set.bossKillPendingClaim = true;
      updateOps.$inc.bossKills = 1;
    }

    const updatedUser = await User.findByIdAndUpdate(user._id, updateOps, { new: true });

    // Record game reward transaction with real user name
    if (baseCoinsEarned > 0) {
      await Transaction.create({
        userId: user._id,
        type: 'game_reward',
        amount: baseCoinsEarned,
        currency: 'PTS',
        description: `${user.firstName || 'Pilot'} won +${baseCoinsEarned} in Asteroid Blaster`,
      });

      // 2% Commission for referrer if exists
      if (user.referredBy) {
        const referrer = await User.findOne({ telegramId: user.referredBy });
        const commission = Math.max(1, Math.floor(baseCoinsEarned * 0.02));
        if (referrer && commission > 0) {
          await User.findByIdAndUpdate(referrer._id, {
            $inc: { coins: commission, referralEarnings: commission },
          });
          await Transaction.create({
            userId: referrer._id,
            type: 'referral_bonus',
            amount: commission,
            currency: 'PTS',
            description: `2% Game commission from friend (${user.firstName})`,
          });
        }
      }
    }

    res.json({
      success: true,
      baseCoinsEarned,
      isBossDefeated,
      bossKillPendingClaim: updatedUser.bossKillPendingClaim,
      user: updatedUser,
    });
  } catch (error) {
    console.error('Game finish error:', error);
    res.status(500).json({ success: false, message: 'Server error saving game result' });
  }
});

/**
 * Claim 200 coins after watching Adsgram ad for Boss Kill
 */
router.post('/claim-boss-reward', authMiddleware, async (req, res) => {
  try {
    const user = req.user;

    if (!user.bossKillPendingClaim) {
      return res.status(400).json({
        success: false,
        message: 'No boss reward currently pending.',
      });
    }

    const BOSS_REWARD = 200;

    // Atomically award 200 coins and clear the pending flag
    const updatedUser = await User.findOneAndUpdate(
      { _id: user._id, bossKillPendingClaim: true },
      {
        $inc: { coins: BOSS_REWARD, wonToday: BOSS_REWARD },
        $set: { bossKillPendingClaim: false },
      },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(400).json({
        success: false,
        message: 'Could not claim boss reward or reward already claimed.',
      });
    }

    // Transaction record
    await Transaction.create({
      userId: user._id,
      type: 'boss_bonus',
      amount: BOSS_REWARD,
      currency: 'PTS',
      description: `${user.firstName || 'Pilot'} defeated Mothership Boss (+200 PTS)`,
    });

    // 2% Referrer commission on boss reward (4 coins)
    if (user.referredBy) {
      const referrer = await User.findOne({ telegramId: user.referredBy });
      const commission = 4;
      if (referrer) {
        await User.findByIdAndUpdate(referrer._id, {
          $inc: { coins: commission, referralEarnings: commission },
        });
        await Transaction.create({
          userId: referrer._id,
          type: 'referral_bonus',
          amount: commission,
          currency: 'PTS',
          description: `2% Boss reward commission from friend (${user.firstName})`,
        });
      }
    }

    res.json({
      success: true,
      message: 'Successfully claimed 200 Boss Coins!',
      coinsAwarded: BOSS_REWARD,
      user: updatedUser,
    });
  } catch (error) {
    console.error('Boss reward claim error:', error);
    res.status(500).json({ success: false, message: 'Server error claiming boss reward' });
  }
});

/**
 * Live Activity Ticker (Real data from database only - no demo/fake data)
 */
router.get('/live-ticker', async (req, res) => {
  try {
    const recentWins = await Transaction.find({
      type: { $in: ['game_reward', 'boss_bonus'] },
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('userId', 'firstName')
      .lean();

    const tickerItems = recentWins.map((w) => ({
      name: w.userId?.firstName || 'Player',
      amount: w.amount,
      game: 'Asteroid Blaster',
    }));

    res.json({ success: true, ticker: tickerItems });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error loading live ticker' });
  }
});

module.exports = router;
