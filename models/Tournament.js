const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  telegramId: {
    type: String,
    required: true,
  },
  username: {
    type: String,
    default: '',
  },
  firstName: {
    type: String,
    default: 'Pilot',
  },
  photoUrl: {
    type: String,
    default: '',
  },
  bestScore: {
    type: Number,
    default: 0,
  },
  attempts: {
    type: Number,
    default: 0,
    max: 10,
  },
  scores: {
    type: [Number],
    default: [],
  },
  joinedAt: {
    type: Date,
    default: Date.now,
  },
  lastPlayedAt: {
    type: Date,
    default: null,
  },
});

const tournamentSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },
    gameType: {
      type: String,
      enum: ['asteroid_blaster', 'car_runner'],
      default: 'asteroid_blaster',
    },
    entryFee: {
      type: Number,
      required: true,
      default: 200, // in PTS
      min: 0,
    },
    prizePool: {
      type: Number,
      required: true,
      default: 1000, // in PTS
      min: 1,
    },
    maxParticipants: {
      type: Number,
      default: 50,
      min: 1,
    },
    winnerCount: {
      type: Number,
      enum: [1, 2, 3],
      default: 1,
    },
    rankRewards: [
      {
        rank: { type: Number, required: true },
        reward: { type: Number, required: true }, // PTS
      },
    ],
    endDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'completed', 'cancelled'],
      default: 'active',
      index: true,
    },
    resultsDeclared: {
      type: Boolean,
      default: false,
    },
    declaredAt: {
      type: Date,
      default: null,
    },
    winners: [
      {
        rank: Number,
        reward: Number,
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        telegramId: String,
        username: String,
        firstName: String,
        score: Number,
      },
    ],
    participants: [participantSchema],
  },
  {
    timestamps: true,
  }
);

tournamentSchema.index({ status: 1, endDate: 1 });
tournamentSchema.index({ 'participants.telegramId': 1 });

module.exports = mongoose.model('Tournament', tournamentSchema);
