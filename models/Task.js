const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    subtitle: {
      type: String,
      default: '',
    },
    category: {
      type: String,
      enum: ['social', 'daily', 'exclusive', 'partner', 'app_tasks'],
      default: 'daily',
    },
    reward: {
      type: Number,
      required: true,
      min: 1,
    },
    actionType: {
      type: String,
      enum: ['telegram', 'link', 'ad_watch', 'sponsor', 'app_task'],
      default: 'link',
    },
    actionUrl: {
      type: String,
      default: '',
    },
    targetAppId: {
      type: String,
      default: '',
    },
    requiredLevel: {
      type: Number,
      default: 1,
    },
    icon: {
      type: String,
      default: 'gift',
    },
    badge: {
      type: String,
      default: '',
    },
    delaySeconds: {
      type: Number,
      default: 0,
    },
    maxClaimsPerDay: {
      type: Number,
      default: 1,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Task', taskSchema);
