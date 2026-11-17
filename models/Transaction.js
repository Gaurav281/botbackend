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
        'tournament_entry',
        'tournament_reward',
        'tournament_refund',
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

transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ userId: 1, type: 1, createdAt: -1 });
transactionSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);
