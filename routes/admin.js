const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Withdrawal = require('../models/Withdrawal');
const Transaction = require('../models/Transaction');
const PromoCode = require('../models/PromoCode');
const Setting = require('../models/Setting');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

// Apply auth and admin check to all admin routes
router.use(authMiddleware);
router.use(adminMiddleware);

const DEFAULT_CATEGORIES = {
  daily: true,
  social: true,
  partner: true,
  app_tasks: true,
  exclusive: true,
};

/**
 * Helper: get category settings from DB
 */
async function getCategorySettings() {
  const setting = await Setting.findOne({ key: 'task_categories' });
  if (!setting || !setting.value) {
    return { ...DEFAULT_CATEGORIES };
  }
  return { ...DEFAULT_CATEGORIES, ...setting.value };
}

/**
 * GET /api/admin/overview - Dashboard stats
 */
router.get('/overview', async (req, res) => {
  try {
    const [pendingWithdrawals, totalUsers, totalWithdrawals, activePromoCodes, categories] = await Promise.all([
      Withdrawal.countDocuments({ status: 'pending' }),
      User.countDocuments(),
      Withdrawal.countDocuments(),
      PromoCode.countDocuments({ isActive: true }),
      getCategorySettings(),
    ]);

    res.json({
      success: true,
      stats: {
        pendingWithdrawals,
        totalUsers,
        totalWithdrawals,
        activePromoCodes,
      },
      categories,
    });
  } catch (error) {
    console.error('Admin overview error:', error);
    res.status(500).json({ success: false, message: 'Server error loading admin stats' });
  }
});

/**
 * GET /api/admin/withdrawals - List withdrawal requests
 */
router.get('/withdrawals', async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status && status !== 'all') {
      filter.status = status;
    }

    const withdrawals = await Withdrawal.find(filter)
      .populate('userId', 'firstName lastName username telegramId withdrawableBalance coins')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.json({
      success: true,
      withdrawals,
    });
  } catch (error) {
    console.error('Admin withdrawals error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching withdrawals' });
  }
});

/**
 * POST /api/admin/withdrawals/:id/approve - Approve withdrawal
 */
router.post('/withdrawals/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const { transactionRef } = req.body;

    const withdrawal = await Withdrawal.findById(id).populate('userId');
    if (!withdrawal) {
      return res.status(404).json({ success: false, message: 'Withdrawal not found' });
    }

    if (withdrawal.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Withdrawal cannot be approved because current status is '${withdrawal.status}'`,
      });
    }

    withdrawal.status = 'completed';
    await withdrawal.save();

    await Transaction.create({
      userId: withdrawal.userId._id,
      type: 'withdrawal',
      amount: -withdrawal.amountInr,
      currency: 'INR',
      description: `Withdrawal of ₹${withdrawal.amountInr} to UPI ${withdrawal.upiId} Approved! ${transactionRef ? `Ref: ${transactionRef}` : ''}`,
    });

    res.json({
      success: true,
      message: `Withdrawal request for ₹${withdrawal.amountInr} approved successfully.`,
      withdrawal,
    });
  } catch (error) {
    console.error('Approve withdrawal error:', error);
    res.status(500).json({ success: false, message: 'Server error approving withdrawal' });
  }
});

/**
 * POST /api/admin/withdrawals/:id/reject - Reject withdrawal and refund user balance
 */
router.post('/withdrawals/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const withdrawal = await Withdrawal.findById(id);
    if (!withdrawal) {
      return res.status(404).json({ success: false, message: 'Withdrawal not found' });
    }

    if (withdrawal.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Withdrawal cannot be rejected because current status is '${withdrawal.status}'`,
      });
    }

    // Atomic refund
    await User.findByIdAndUpdate(withdrawal.userId, {
      $inc: { withdrawableBalance: withdrawal.amountInr },
    });

    withdrawal.status = 'rejected';
    withdrawal.rejectionReason = reason || 'Rejected by Admin. Amount refunded to wallet.';
    await withdrawal.save();

    await Transaction.create({
      userId: withdrawal.userId,
      type: 'refund',
      amount: withdrawal.amountInr,
      currency: 'INR',
      description: `Refund: Withdrawal of ₹${withdrawal.amountInr} rejected (${withdrawal.rejectionReason})`,
    });

    res.json({
      success: true,
      message: `Withdrawal rejected and ₹${withdrawal.amountInr} refunded to player wallet.`,
      withdrawal,
    });
  } catch (error) {
    console.error('Reject withdrawal error:', error);
    res.status(500).json({ success: false, message: 'Server error rejecting withdrawal' });
  }
});

/**
 * GET /api/admin/promo-codes - List all promo codes
 */
router.get('/promo-codes', async (req, res) => {
  try {
    const promoCodes = await PromoCode.find()
      .select('code rewardPoints maxUsers usedCount isActive createdAt')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, promoCodes });
  } catch (error) {
    console.error('Admin promo codes error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching promo codes' });
  }
});

/**
 * POST /api/admin/promo-codes - Create new promo code
 */
router.post('/promo-codes', async (req, res) => {
  try {
    const { code, rewardPoints, maxUsers } = req.body;

    if (!code || !code.trim()) {
      return res.status(400).json({ success: false, message: 'Promo code string is required' });
    }

    const cleanCode = code.trim().toUpperCase();
    const pts = parseInt(rewardPoints);
    const usersLimit = parseInt(maxUsers);

    if (!pts || pts < 1) {
      return res.status(400).json({ success: false, message: 'Reward points must be at least 1' });
    }

    if (!usersLimit || usersLimit < 1) {
      return res.status(400).json({ success: false, message: 'Max users limit must be at least 1' });
    }

    const existing = await PromoCode.findOne({ code: cleanCode });
    if (existing) {
      return res.status(400).json({ success: false, message: `Promo code '${cleanCode}' already exists.` });
    }

    const newPromo = await PromoCode.create({
      code: cleanCode,
      rewardPoints: pts,
      maxUsers: usersLimit,
      usedCount: 0,
      isActive: true,
    });

    res.json({
      success: true,
      message: `Promo code ${cleanCode} created successfully (+${pts} PTS for up to ${usersLimit} users).`,
      promoCode: newPromo,
    });
  } catch (error) {
    console.error('Create promo code error:', error);
    res.status(500).json({ success: false, message: 'Server error creating promo code' });
  }
});

/**
 * DELETE /api/admin/promo-codes/:id - Toggle active or delete promo code
 */
router.delete('/promo-codes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const promo = await PromoCode.findById(id);
    if (!promo) {
      return res.status(404).json({ success: false, message: 'Promo code not found' });
    }

    // Toggle active state or delete if inactive
    if (promo.isActive) {
      promo.isActive = false;
      await promo.save();
      return res.json({ success: true, message: `Promo code ${promo.code} deactivated.`, promoCode: promo });
    } else {
      await PromoCode.findByIdAndDelete(id);
      return res.json({ success: true, message: `Promo code ${promo.code} deleted permanently.` });
    }
  } catch (error) {
    console.error('Delete promo code error:', error);
    res.status(500).json({ success: false, message: 'Server error updating promo code' });
  }
});

/**
 * GET /api/admin/categories - Get category toggle status
 */
router.get('/categories', async (req, res) => {
  try {
    const categories = await getCategorySettings();
    res.json({ success: true, categories });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching categories' });
  }
});

/**
 * POST /api/admin/categories - Enable or disable task category
 */
router.post('/categories', async (req, res) => {
  try {
    const { category, enabled } = req.body;

    if (!category) {
      return res.status(400).json({ success: false, message: 'Category identifier is required' });
    }

    const currentCategories = await getCategorySettings();
    currentCategories[category] = Boolean(enabled);

    const updated = await Setting.findOneAndUpdate(
      { key: 'task_categories' },
      { value: currentCategories },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      message: `Category '${category}' is now ${enabled ? 'ENABLED' : 'DISABLED'}.`,
      categories: updated.value,
    });
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({ success: false, message: 'Server error updating category' });
  }
});

module.exports = router;
