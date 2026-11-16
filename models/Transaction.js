const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        'game_reward',
        'boss_bonus',
        'daily_checkin',
        'task_reward',
        'referral_bonus',
        'convert',
        'withdrawal',
        'refund',
        'withdrawal_refund',
        'promo_reward',
      ],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      enum: ['PTS', 'INR', 'USDT'],
      default: 'PTS',
    },
    description: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Transaction', transactionSchema);
