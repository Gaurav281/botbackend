const mongoose = require('mongoose');

const userTaskSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      required: true,
    },
    status: {
      type: String,
      enum: ['started', 'completed'],
      default: 'started',
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

userTaskSchema.index({ userId: 1, taskId: 1 });

module.exports = mongoose.model('UserTask', userTaskSchema);
