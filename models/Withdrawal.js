const mongoose = require('mongoose');

const withdrawalSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    upiId: {
      type: String,
      required: true,
      trim: true,
    },
    pointsDeducted: {
      type: Number,
      required: true,
      min: 1,
    },
    amountInr: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'rejected'],
      default: 'pending',
    },
    transactionRef: {
      type: String,
      default: '',
      trim: true,
    },
    rejectionReason: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

withdrawalSchema.index({ status: 1, createdAt: -1 });
withdrawalSchema.index({ userId: 1, createdAt: -1 });
withdrawalSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Withdrawal', withdrawalSchema);
