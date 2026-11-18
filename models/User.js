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
    pendingGameReward: {
      pts: {
        type: Number,
        default: 0,
      },
      gameType: {
        type: String,
        default: '',
      },
      difficulty: {
        type: String,
        default: 'normal',
      },
      score: {
        type: Number,
        default: 0,
      },
    },
    gameEnergy: {
      matchesRemaining: {
        type: Number,
        default: 50,
        min: 0,
        max: 50,
      },
      lastResetAt: {
        type: Date,
        default: Date.now,
      },
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

userSchema.methods.getGameEnergy = function () {
  const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
  const now = Date.now();
  if (!this.gameEnergy || !this.gameEnergy.lastResetAt) {
    this.gameEnergy = { matchesRemaining: 50, lastResetAt: new Date(now) };
  } else {
    const elapsed = now - new Date(this.gameEnergy.lastResetAt).getTime();
    if (elapsed >= TWELVE_HOURS_MS) {
      this.gameEnergy.matchesRemaining = 50;
      this.gameEnergy.lastResetAt = new Date(now);
    }
  }
  const nextResetAt = new Date(new Date(this.gameEnergy.lastResetAt).getTime() + TWELVE_HOURS_MS);
  return {
    matchesRemaining: this.gameEnergy.matchesRemaining,
    maxMatches: 50,
    lastResetAt: this.gameEnergy.lastResetAt,
    nextResetAt,
    msUntilReset: Math.max(0, nextResetAt.getTime() - now),
  };
};

module.exports = mongoose.model('User', userSchema);
