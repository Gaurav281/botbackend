const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Withdrawal = require('../models/Withdrawal');
const Transaction = require('../models/Transaction');
const PromoCode = require('../models/PromoCode');
const { authMiddleware } = require('../middleware/auth');

const MIN_WITHDRAW_INR = 10;
const POINTS_PER_INR = 1000; // 1000 PTS = 1 INR

// Helper: Convert UTC timestamp to IST Date string (YYYY-MM-DD)
function getISTDateString(date) {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // +5:30
  const istDate = new Date(new Date(date).getTime() + IST_OFFSET_MS);
  return istDate.toISOString().slice(0, 10);
}

/**
 * Get 7-Day Real Earnings Graph (last 6 days + today in IST)
 */
router.get('/weekly-graph', authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    const now = new Date();
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

    // Build 7 calendar days ending today in IST
    const days = [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    for (let i = 6; i >= 0; i--) {
      const pastTime = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const istDate = new Date(pastTime.getTime() + IST_OFFSET_MS);
      const dateKey = istDate.toISOString().slice(0, 10);
      const dayOfWeek = dayNames[istDate.getUTCDay()];
      const dayNum = istDate.getUTCDate();
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthStr = monthNames[istDate.getUTCMonth()];

      days.push({
        dateKey,
        label: i === 0 ? 'Today' : dayOfWeek,
        dateFormatted: `${dayNum} ${monthStr}`,
        pts: 0,
      });
    }

    // Earliest boundary in UTC
    const earliestISTKey = days[0].dateKey;
    const [y, m, d] = earliestISTKey.split('-').map(Number);
    // Start of that day in IST: y, m-1, d 00:00:00 IST -> UTC is minus 5.5 hours
    const startOfWindowUTC = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - IST_OFFSET_MS);

    // Fetch user's positive earning transactions
    const transactions = await Transaction.find({
      userId: user._id,
      amount: { $gt: 0 },
      type: { $in: ['game_reward', 'boss_bonus', 'daily_checkin', 'task_reward', 'referral_bonus', 'promo_reward'] },
      createdAt: { $gte: startOfWindowUTC },
    }).lean();

    // Sum earnings per IST day
    for (const tx of transactions) {
      const txISTKey = getISTDateString(tx.createdAt);
      const dayObj = days.find((d) => d.dateKey === txISTKey);
      if (dayObj) {
        dayObj.pts += tx.amount;
      }
    }

    const todayEarned = days[days.length - 1].pts;
    const totalWeekEarned = days.reduce((acc, curr) => acc + curr.pts, 0);

    res.json({
      success: true,
      todayEarned,
      totalWeekEarned,
      days,
    });
  } catch (error) {
    console.error('Error fetching weekly graph:', error);
    res.status(500).json({ success: false, message: 'Server error loading graph' });
  }
});

/**
 * Get wallet details and recent activity
 */
router.get('/summary', authMiddleware, async (req, res) => {
  try {
    const user = req.user;

    const recentTransactions = await Transaction.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .limit(15);

    const withdrawals = await Withdrawal.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .limit(10);

    const inrValueFromCoins = (user.coins / POINTS_PER_INR).toFixed(2);
    const totalValueInr = (parseFloat(inrValueFromCoins) + user.withdrawableBalance).toFixed(2);

    res.json({
      success: true,
      points: user.coins,
      withdrawableBalanceInr: user.withdrawableBalance,
      totalEstimatedInr: totalValueInr,
      pointsPerInr: POINTS_PER_INR,
      minWithdrawInr: MIN_WITHDRAW_INR,
      savedUpiId: user.savedUpiId || '',
      recentTransactions,
      withdrawals,
    });
  } catch (error) {
    console.error('Wallet summary error:', error);
    res.status(500).json({ success: false, message: 'Server error loading wallet' });
  }
});

/**
 * Convert PTS into withdrawable balance (1000 PTS = 1 INR, even 1 PTS allowed!)
 */
router.post('/convert', authMiddleware, async (req, res) => {
  try {
    const { pointsToConvert } = req.body;
    const pts = parseInt(pointsToConvert);

    if (!pts || pts < 1) {
      return res.status(400).json({
        success: false,
        message: 'Please enter at least 1 PTS to convert.',
      });
    }

    if (req.user.coins < pts) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient PTS balance.',
      });
    }

    // Precise INR calculation: e.g. 1 PTS = 0.001 INR, 1000 PTS = 1.00 INR
    const inrToAdd = parseFloat((pts / POINTS_PER_INR).toFixed(4));

    // Atomic update
    const updatedUser = await User.findOneAndUpdate(
      { _id: req.user._id, coins: { $gte: pts } },
      {
        $inc: {
          coins: -pts,
          withdrawableBalance: inrToAdd,
        },
      },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(400).json({ success: false, message: 'Conversion failed. Balance changed.' });
    }

    await Transaction.create({
      userId: req.user._id,
      type: 'convert',
      amount: pts,
      currency: 'PTS',
      description: `Converted ${pts.toLocaleString('en-IN')} PTS to ₹${inrToAdd} INR`,
    });

    res.json({
      success: true,
      message: `Successfully converted ${pts.toLocaleString('en-IN')} PTS to ₹${inrToAdd}`,
      user: updatedUser,
    });
  } catch (error) {
    console.error('Wallet convert error:', error);
    res.status(500).json({ success: false, message: 'Server error during conversion' });
  }
});

/**
 * Redeem Promo Code
 */
router.post('/redeem-promo', authMiddleware, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code || !code.trim()) {
      return res.status(400).json({ success: false, message: 'Please enter a promo code.' });
    }

    const cleanCode = code.trim().toUpperCase();
    const promo = await PromoCode.findOne({ code: cleanCode, isActive: true });

    if (!promo) {
      return res.status(400).json({ success: false, message: 'Invalid or inactive promo code.' });
    }

    if (promo.usedCount >= promo.maxUsers) {
      return res.status(400).json({
        success: false,
        message: 'This promo code has reached its maximum redemption limit.',
      });
    }

    const alreadyRedeemed = promo.usedBy.some(
      (u) =>
        (u.userId && u.userId.equals(req.user._id)) ||
        (u.telegramId && u.telegramId === req.user.telegramId)
    );

    if (alreadyRedeemed) {
      return res.status(400).json({
        success: false,
        message: 'You have already redeemed this promo code.',
      });
    }

    // Atomic update user balance
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { $inc: { coins: promo.rewardPoints } },
      { new: true }
    );

    // Record promo usage
    promo.usedCount += 1;
    promo.usedBy.push({
      userId: req.user._id,
      telegramId: req.user.telegramId,
      redeemedAt: new Date(),
    });
    await promo.save();

    await Transaction.create({
      userId: req.user._id,
      type: 'promo_reward',
      amount: promo.rewardPoints,
      currency: 'PTS',
      description: `Promo Code ${cleanCode} redeemed: +${promo.rewardPoints} PTS`,
    });

    res.json({
      success: true,
      message: `Promo code applied! +${promo.rewardPoints.toLocaleString('en-IN')} PTS added to your wallet!`,
      rewardPoints: promo.rewardPoints,
      user: updatedUser,
    });
  } catch (error) {
    console.error('Redeem promo code error:', error);
    res.status(500).json({ success: false, message: 'Server error redeeming promo code' });
  }
});

/**
 * Submit withdrawal request by entering UPI ID
 */
router.post('/withdraw', authMiddleware, async (req, res) => {
  try {
    const { upiId, amountInr } = req.body;
    const requestedAmount = parseFloat(amountInr);

    if (!upiId || typeof upiId !== 'string' || !upiId.includes('@')) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid UPI ID (e.g. name@okhdfcbank or 9876543210@paytm).',
      });
    }

    const cleanUpiId = upiId.trim().toLowerCase();

    if (!requestedAmount || requestedAmount < MIN_WITHDRAW_INR) {
      return res.status(400).json({
        success: false,
        message: `Minimum withdrawal amount is ₹${MIN_WITHDRAW_INR}.`,
      });
    }

    const user = req.user;

    // Check if user has sufficient withdrawable balance
    if (user.withdrawableBalance < requestedAmount) {
      return res.status(400).json({
        success: false,
        message: `Insufficient withdrawable balance. You have ₹${user.withdrawableBalance.toFixed(2)}. Please convert your PTS first.`,
      });
    }

    // Atomic deduction
    const updatedUser = await User.findOneAndUpdate(
      { _id: user._id, withdrawableBalance: { $gte: requestedAmount } },
      {
        $inc: { withdrawableBalance: -requestedAmount },
        $set: { savedUpiId: cleanUpiId },
      },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(400).json({
        success: false,
        message: 'Withdrawal failed. Insufficient funds or concurrent update.',
      });
    }

    // Create withdrawal request record
    const withdrawal = await Withdrawal.create({
      userId: user._id,
      upiId: cleanUpiId,
      pointsDeducted: requestedAmount * POINTS_PER_INR,
      amountInr: requestedAmount,
      status: 'pending',
    });

    // Create transaction log
    await Transaction.create({
      userId: user._id,
      type: 'withdrawal',
      amount: -requestedAmount,
      currency: 'INR',
      description: `Withdrawal request to ${cleanUpiId} (Status: Pending)`,
    });

    res.json({
      success: true,
      message: `Withdrawal request of ₹${requestedAmount} submitted successfully to ${cleanUpiId}.`,
      withdrawal,
      user: updatedUser,
    });
  } catch (error) {
    console.error('Withdrawal error:', error);
    res.status(500).json({ success: false, message: 'Server error processing withdrawal' });
  }
});

module.exports = router;
