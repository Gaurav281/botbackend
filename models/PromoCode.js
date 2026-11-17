const mongoose = require('mongoose');

const promoCodeSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    rewardPoints: {
      type: Number,
      required: true,
      min: 1,
    },
    maxUsers: {
      type: Number,
      required: true,
      min: 1,
      default: 100,
    },
    usedCount: {
      type: Number,
      default: 0,
    },
    usedBy: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        telegramId: String,
        redeemedAt: { type: Date, default: Date.now },
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

promoCodeSchema.index({ isActive: 1, createdAt: -1 });

module.exports = mongoose.model('PromoCode', promoCodeSchema);
