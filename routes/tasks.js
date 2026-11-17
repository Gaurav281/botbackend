const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const UserTask = require('../models/UserTask');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Setting = require('../models/Setting');
const { authMiddleware } = require('../middleware/auth');

const STREAK_REWARDS = [80, 100, 125, 150, 200, 300, 550];
const DEFAULT_CATEGORIES = {
  daily: true,
  social: true,
  partner: true,
  app_tasks: true,
  exclusive: true,
};

// Seed default tasks if empty
const defaultTasks = [
  {
    title: 'Play Firefly Tap Mini App',
    subtitle: 'Open app & reach Level 3 with Telegram ID',
    category: 'app_tasks',
    reward: 350,
    actionType: 'app_task',
    actionUrl: 'https://t.me/FireflyPlayBot',
    targetAppId: 'firefly_tap',
    requiredLevel: 3,
    icon: 'smartphone',
    badge: '+350',
  },
  {
    title: 'Join Space Miner TMA',
    subtitle: 'Complete beginner quest in partner TMA',
    category: 'app_tasks',
    reward: 400,
    actionType: 'app_task',
    actionUrl: 'https://t.me/FireflyPlayBot',
    targetAppId: 'space_miner',
    requiredLevel: 1,
    icon: 'zap',
    badge: '+400',
  },
  {
    title: 'Join Official Channel',
    subtitle: 'Join our official announcements channel',
    category: 'social',
    reward: 300,
    actionType: 'telegram',
    actionUrl: 'https://t.me/FireflyPlayBot',
    icon: 'megaphone',
    badge: '+300',
  },
  {
    title: 'Join Community Chat',
    subtitle: 'Chat with other Fire Fly Play pilots',
    category: 'social',
    reward: 300,
    actionType: 'telegram',
    actionUrl: 'https://t.me/FireflyPlayBot',
    icon: 'message-circle',
    badge: '+300',
  },
  {
    title: 'Watch Adsgram Ad',
    subtitle: 'Watch a quick video and earn coins',
    category: 'daily',
    reward: 120,
    actionType: 'ad_watch',
    actionUrl: '',
    icon: 'tv',
    badge: '+120',
  },
  {
    title: 'Watch Monetag Sponsor Ad',
    subtitle: 'Support the game and earn bonus points',
    category: 'daily',
    reward: 100,
    actionType: 'ad_watch',
    actionUrl: '',
    icon: 'tv',
    badge: '+100',
  },
  {
    title: 'Partner Airdrop Quest',
    subtitle: 'Stay 10s on the partner page',
    category: 'partner',
    reward: 120,
    actionType: 'sponsor',
    actionUrl: 'https://telegram.org',
    delaySeconds: 10,
    icon: 'sparkles',
    badge: '+120',
  },
  {
    title: 'Follow Twitter / X',
    subtitle: 'Stay updated with latest tournament news',
    category: 'exclusive',
    reward: 250,
    actionType: 'link',
    actionUrl: 'https://twitter.com',
    icon: 'globe',
    badge: '+250',
  },
];

async function ensureSeedTasks() {
  const count = await Task.countDocuments();
  if (count === 0) {
    await Task.insertMany(defaultTasks);
    console.log('✅ Seeded default tasks');
  } else {
    const appTasksCount = await Task.countDocuments({ category: 'app_tasks' });
    if (appTasksCount === 0) {
      await Task.insertMany(defaultTasks.filter((t) => t.category === 'app_tasks'));
      console.log('✅ Seeded app_tasks');
    }
  }
}
ensureSeedTasks();

/**
 * Get all tasks with user completion status and checkin info
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const user = req.user;

    // Fetch enabled categories setting
    const setting = await Setting.findOne({ key: 'task_categories' });
    const categoryStatus = { ...DEFAULT_CATEGORIES, ...(setting?.value || {}) };
    const enabledCategoryKeys = Object.keys(categoryStatus).filter((k) => categoryStatus[k]);

    // Only fetch tasks from enabled categories with optimized field projection
    const [tasks, userTasks] = await Promise.all([
      Task.find({ isActive: true, category: { $in: enabledCategoryKeys } })
        .select('title subtitle category reward actionType actionUrl targetAppId requiredLevel icon badge delaySeconds')
        .lean(),
      UserTask.find({ userId: user._id })
        .select('taskId status startedAt completedAt')
        .lean(),
    ]);

    const taskStatusMap = {};
    for (const ut of userTasks) {
      taskStatusMap[ut.taskId.toString()] = {
        status: ut.status,
        startedAt: ut.startedAt,
        completedAt: ut.completedAt,
      };
    }

    const formattedTasks = tasks.map((task) => {
      const userStatus = taskStatusMap[task._id.toString()];
      return {
        ...task,
        status: userStatus ? userStatus.status : 'not_started',
        startedAt: userStatus ? userStatus.startedAt : null,
      };
    });

    // Check check-in status
    const now = new Date();
    let canCheckIn = true;
    if (user.lastCheckIn) {
      const last = new Date(user.lastCheckIn);
      const isSameDay =
        last.getUTCFullYear() === now.getUTCFullYear() &&
        last.getUTCMonth() === now.getUTCMonth() &&
        last.getUTCDate() === now.getUTCDate();
      canCheckIn = !isSameDay;
    }

    const currentStreakIndex = (user.streak || 0) % 7;
    const todayReward = STREAK_REWARDS[currentStreakIndex];

    res.json({
      success: true,
      tasks: formattedTasks,
      enabledCategories: categoryStatus,
      checkIn: {
        canCheckIn,
        streak: user.streak || 0,
        currentDay: currentStreakIndex + 1,
        todayReward,
        rewardsList: STREAK_REWARDS,
      },
    });
  } catch (error) {
    console.error('Fetch tasks error:', error);
    res.status(500).json({ success: false, message: 'Server error loading tasks' });
  }
});

/**
 * Start a task (e.g. 10s visit timer)
 */
router.post('/:id/start', authMiddleware, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });

    let userTask = await UserTask.findOne({ userId: req.user._id, taskId: task._id });
    if (!userTask) {
      userTask = await UserTask.create({
        userId: req.user._id,
        taskId: task._id,
        status: 'started',
        startedAt: new Date(),
      });
    }

    res.json({ success: true, userTask });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error starting task' });
  }
});

/**
 * Claim task reward
 */
router.post('/:id/claim', authMiddleware, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });

    const user = req.user;
    let userTask = await UserTask.findOne({ userId: user._id, taskId: task._id });

    // For tasks with delay requirement
    if (task.delaySeconds > 0) {
      if (!userTask || userTask.status !== 'started') {
        return res.status(400).json({ success: false, message: 'Please start the task first.' });
      }
      const elapsedSeconds = (Date.now() - new Date(userTask.startedAt).getTime()) / 1000;
      if (elapsedSeconds < task.delaySeconds) {
        const remaining = Math.ceil(task.delaySeconds - elapsedSeconds);
        return res.status(400).json({
          success: false,
          message: `Please wait ${remaining} more seconds before claiming.`,
        });
      }
    }

    if (userTask && userTask.status === 'completed') {
      return res.status(400).json({ success: false, message: 'Task already completed.' });
    }

    // Atomic update
    await User.findByIdAndUpdate(user._id, {
      $inc: { coins: task.reward, wonToday: task.reward },
    });

    if (userTask) {
      userTask.status = 'completed';
      userTask.completedAt = new Date();
      await userTask.save();
    } else {
      await UserTask.create({
        userId: user._id,
        taskId: task._id,
        status: 'completed',
        completedAt: new Date(),
      });
    }

    await Transaction.create({
      userId: user._id,
      type: 'task_reward',
      amount: task.reward,
      currency: 'PTS',
      description: `Task reward: ${task.title}`,
    });

    const updatedUser = await User.findById(user._id);

    res.json({
      success: true,
      message: `Earned +${task.reward} PTS!`,
      reward: task.reward,
      user: updatedUser,
    });
  } catch (error) {
    console.error('Task claim error:', error);
    res.status(500).json({ success: false, message: 'Server error claiming task reward' });
  }
});

/**
 * Daily check-in claim
 */
router.post('/checkin', authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    const now = new Date();

    if (user.lastCheckIn) {
      const last = new Date(user.lastCheckIn);
      const isSameDay =
        last.getUTCFullYear() === now.getUTCFullYear() &&
        last.getUTCMonth() === now.getUTCMonth() &&
        last.getUTCDate() === now.getUTCDate();

      if (isSameDay) {
        return res.status(400).json({
          success: false,
          message: 'Already claimed today! Come back tomorrow.',
        });
      }

      // Check if streak was broken (more than 48 hours)
      const hoursDiff = (now - last) / (1000 * 60 * 60);
      if (hoursDiff > 48) {
        user.streak = 0; // Reset streak
      }
    }

    const currentStreakIndex = (user.streak || 0) % 7;
    const reward = STREAK_REWARDS[currentStreakIndex];

    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      {
        $inc: { coins: reward, wonToday: reward, streak: 1 },
        $set: { lastCheckIn: now },
      },
      { new: true }
    );

    await Transaction.create({
      userId: user._id,
      type: 'daily_checkin',
      amount: reward,
      currency: 'PTS',
      description: `Day ${(currentStreakIndex + 1)} Daily Check-in Bonus`,
    });

    res.json({
      success: true,
      message: `Claimed Day ${currentStreakIndex + 1} bonus: +${reward} PTS!`,
      reward,
      user: updatedUser,
    });
  } catch (error) {
    console.error('Checkin error:', error);
    res.status(500).json({ success: false, message: 'Server error during checkin' });
  }
});

module.exports = router;
