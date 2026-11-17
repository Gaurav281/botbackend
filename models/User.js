const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    telegramId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    username: {
      type: String,
      default: '',
    },
    firstName: {
      type: String,
      default: 'Player',
    },
    lastName: {
      type: String,
      default: '',
    },
    photoUrl: {
      type: String,
      default: '',
    },
    coins: {
      type: Number,
      default: 0,
      min: 0,
    },
    withdrawableBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    streak: {
      type: Number,
      default: 0,
    },
    lastCheckIn: {
      type: Date,
      default: null,
    },
    referralCode: {
      type: String,
      unique: true,
      index: true,
    },
    referredBy: {
      type: String,
      default: null,
    },
    referralEarnings: {
      type: Number,
      default: 0,
    },
    activeReferrals: {
      type: Number,
      default: 0,
    },
    bossKillPendingClaim: {
      type: Boolean,
      default: false,
    },
    highScore: {
      type: Number,
      default: 0,
    },
    wonToday: {
      type: Number,
      default: 0,
    },
    totalKills: {
      type: Number,
      default: 0,
    },
    bossKills: {
      type: Number,
      default: 0,
    },
    doNotShowRules: {
      type: Boolean,
      default: false,
    },
    alwaysFullScreen: {
      type: Boolean,
      default: false,
    },
    soundEnabled: {
      type: Boolean,
      default: true,
    },
    savedUpiId: {
      type: String,
      default: '',
    },
    hasJoinedChannels: {
      type: Boolean,
      default: false,
    },
    isAdmin: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.index({ username: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ coins: -1 });

module.exports = mongoose.model('User', userSchema);
