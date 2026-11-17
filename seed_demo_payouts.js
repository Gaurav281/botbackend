const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mongoose = require('mongoose');

const User = require('./models/User');
const Withdrawal = require('./models/Withdrawal');
const Transaction = require('./models/Transaction');
const Tournament = require('./models/Tournament');
const { sendPayoutNotification } = require('./bot');

// 12 Demo users with realistic timestamps spanning the past 3 days (15 Nov to 17 Nov 2026)
const DEMO_USERS = [
  {
    telegramId: '6102948123',
    username: 'aarav_singh_92',
    firstName: 'Aarav',
    lastName: 'Singh',
    coins: 14500,
    withdrawableBalance: 45,
    streak: 4,
    highScore: 3420,
    totalKills: 124,
    savedUpiId: 'aaravsingh92@okhdfcbank',
    payoutAmount: 50.0,
    txnRef: 'UPI/432190812345',
    timestamp: new Date('2026-11-15T10:14:00+05:30'),
  },
  {
    telegramId: '6291048291',
    username: 'rohit_kumar88',
    firstName: 'Rohit',
    lastName: 'Kumar',
    coins: 8200,
    withdrawableBalance: 12,
    streak: 2,
    highScore: 2150,
    totalKills: 86,
    savedUpiId: 'rohitkumar88@paytm',
    payoutAmount: 25.0,
    txnRef: 'UPI/432194857211',
    timestamp: new Date('2026-11-15T14:40:00+05:30'),
  },
  {
    telegramId: '6382019482',
    username: 'priya_sharma_x',
    firstName: 'Priya',
    lastName: 'Sharma',
    coins: 24000,
    withdrawableBalance: 80,
    streak: 6,
    highScore: 4890,
    totalKills: 210,
    savedUpiId: 'priyasharma@okaxis',
    payoutAmount: 100.0,
    txnRef: 'UPI/432208194820',
    timestamp: new Date('2026-11-15T19:15:00+05:30'),
  },
  {
    telegramId: '6491029481',
    username: 'vikas_verma07',
    firstName: 'Vikas',
    lastName: 'Verma',
    coins: 6100,
    withdrawableBalance: 8,
    streak: 3,
    highScore: 1820,
    totalKills: 64,
    savedUpiId: 'vikasverma07@ybl',
    payoutAmount: 15.0,
    txnRef: 'UPI/432219485729',
    timestamp: new Date('2026-11-15T23:05:00+05:30'),
  },
  {
    telegramId: '6592019481',
    username: 'ananya_k21',
    firstName: 'Ananya',
    lastName: 'Kulkarni',
    coins: 12000,
    withdrawableBalance: 20,
    streak: 5,
    highScore: 2950,
    totalKills: 115,
    savedUpiId: 'ananyak21@ibl',
    payoutAmount: 30.0,
    txnRef: 'UPI/432230194821',
    timestamp: new Date('2026-11-16T08:30:00+05:30'),
  },
  {
    telegramId: '6681029482',
    username: 'deepak_yadav_pro',
    firstName: 'Deepak',
    lastName: 'Yadav',
    coins: 5400,
    withdrawableBalance: 5,
    streak: 1,
    highScore: 1450,
    totalKills: 45,
    savedUpiId: 'deepakyadav@postbank',
    payoutAmount: 10.0,
    txnRef: 'UPI/432241928471',
    timestamp: new Date('2026-11-16T13:25:00+05:30'),
  },
  {
    telegramId: '6791029481',
    username: 'sneha_patel_01',
    firstName: 'Sneha',
    lastName: 'Patel',
    coins: 18500,
    withdrawableBalance: 35,
    streak: 7,
    highScore: 4120,
    totalKills: 178,
    savedUpiId: 'snehapatel01@sbi',
    payoutAmount: 75.0,
    txnRef: 'UPI/432252918472',
    timestamp: new Date('2026-11-16T16:50:00+05:30'),
  },
  {
    telegramId: '6892019482',
    username: 'manish_gupta99',
    firstName: 'Manish',
    lastName: 'Gupta',
    coins: 9200,
    withdrawableBalance: 15,
    streak: 3,
    highScore: 2340,
    totalKills: 92,
    savedUpiId: 'manishgupta99@airtel',
    payoutAmount: 20.0,
    txnRef: 'UPI/432263918274',
    timestamp: new Date('2026-11-16T20:10:00+05:30'),
  },
  {
    telegramId: '6981029481',
    username: 'kavita_m_blaster',
    firstName: 'Kavita',
    lastName: 'Mishra',
    coins: 15800,
    withdrawableBalance: 28,
    streak: 4,
    highScore: 3670,
    totalKills: 142,
    savedUpiId: 'kavitamishra@fbl',
    payoutAmount: 45.0,
    txnRef: 'UPI/432274918273',
    timestamp: new Date('2026-11-17T09:20:00+05:30'),
  },
  {
    telegramId: '7092019482',
    username: 'arjun_reddy_7',
    firstName: 'Arjun',
    lastName: 'Reddy',
    coins: 21000,
    withdrawableBalance: 50,
    streak: 5,
    highScore: 4350,
    totalKills: 195,
    savedUpiId: 'arjunreddy7@okicici',
    payoutAmount: 60.0,
    txnRef: 'UPI/432285918291',
    timestamp: new Date('2026-11-17T12:45:00+05:30'),
  },
  {
    telegramId: '7181029481',
    username: 'pooja_jain88',
    firstName: 'Pooja',
    lastName: 'Jain',
    coins: 7800,
    withdrawableBalance: 10,
    streak: 2,
    highScore: 1980,
    totalKills: 72,
    savedUpiId: 'poojajain88@kotak',
    payoutAmount: 35.0,
    txnRef: 'UPI/432296918204',
    timestamp: new Date('2026-11-17T15:50:00+05:30'),
  },
  {
    telegramId: '7292019482',
    username: 'rahul_mehta_x',
    firstName: 'Rahul',
    lastName: 'Mehta',
    coins: 5200,
    withdrawableBalance: 8,
    streak: 1,
    highScore: 1620,
    totalKills: 51,
    savedUpiId: 'rahulmehta@indus',
    payoutAmount: 12.0,
    txnRef: 'UPI/432307918295',
    timestamp: new Date('2026-11-17T18:15:00+05:30'),
  },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB Atlas!');

  // 1. Seed or Restore Admin User
  const adminId = String(process.env.ADMIN_TELEGRAM_ID || '5802486388').trim();
  const adminUsername = String(process.env.ADMIN_USERNAME || 'Gaurav_281').trim();
  
  let admin = await User.findOne({ telegramId: adminId });
  if (!admin) {
    admin = await User.create({
      telegramId: adminId,
      username: adminUsername,
      firstName: 'Gaurav',
      lastName: '',
      isAdmin: true,
      coins: 50000,
      withdrawableBalance: 500,
      streak: 7,
      highScore: 5000,
      referralCode: 'ADMIN_GAURAV',
    });
    console.log('👑 Admin user created successfully:', admin.username, 'ID:', admin.telegramId);
  } else {
    admin.isAdmin = true;
    if ((admin.coins || 0) < 1000) {
      admin.coins = 50000;
    }
    await admin.save();
    console.log('👑 Admin user verified in DB:', admin.username);
  }

  // NOTE: Per user request: DO NOT seed demo tasks in App Tasks. Admin manages tasks from admin panel.

  // 2. Create 12 Demo Users, Withdrawals, and Broadcast to Channel
  console.log('\nCreating 12 demo users and processing payouts...');

  const createdUsers = [];

  for (let i = 0; i < DEMO_USERS.length; i++) {
    const item = DEMO_USERS[i];
    let user = await User.findOne({ telegramId: item.telegramId });
    if (!user) {
      user = await User.create({
        telegramId: item.telegramId,
        username: item.username,
        firstName: item.firstName,
        lastName: item.lastName,
        coins: item.coins,
        withdrawableBalance: item.withdrawableBalance,
        streak: item.streak,
        highScore: item.highScore,
        totalKills: item.totalKills,
        savedUpiId: item.savedUpiId,
        referralCode: `REF_${item.username.slice(0, 6).toUpperCase()}_${item.telegramId.slice(-3)}`,
        createdAt: item.timestamp,
      });
      console.log(`[User ${i + 1}/12] Created: @${user.username} (${user.firstName})`);
    } else {
      console.log(`[User ${i + 1}/12] User @${user.username} already in DB`);
    }
    createdUsers.push(user);

    // Create completed withdrawal record with proper transactionRef
    let withdrawal = await Withdrawal.findOne({ userId: user._id });
    if (!withdrawal) {
      withdrawal = await Withdrawal.create({
        userId: user._id,
        upiId: item.savedUpiId,
        amountInr: item.payoutAmount,
        pointsDeducted: item.payoutAmount * 1000,
        status: 'completed',
        transactionRef: item.txnRef,
        createdAt: item.timestamp,
        updatedAt: item.timestamp,
      });
    } else {
      withdrawal.transactionRef = item.txnRef;
      withdrawal.status = 'completed';
      withdrawal.createdAt = item.timestamp;
      await withdrawal.save();
    }

    // Create Transaction history entry
    const existingTx = await Transaction.findOne({ userId: user._id, type: 'withdrawal' });
    if (!existingTx) {
      await Transaction.create({
        userId: user._id,
        type: 'withdrawal',
        amount: -item.payoutAmount,
        currency: 'INR',
        description: `Withdrawal of ₹${item.payoutAmount.toFixed(2)} to UPI ${item.savedUpiId} Approved! Ref: ${item.txnRef}`,
        createdAt: item.timestamp,
      });
    }

    console.log(`[Payout ${i + 1}/12] Withdrawal ₹${item.payoutAmount} ready for @${user.username} (${item.timestamp.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })})`);

    // Broadcast official announcement to @FireflyPayouts channel with custom timestamp and NO verify button
    console.log(`[Telegram ${i + 1}/12] Posting payout for @${user.username} to @FireflyPayouts...`);
    const notifRes = await sendPayoutNotification(withdrawal, user, item.txnRef, item.timestamp);
    if (notifRes && notifRes.ok) {
      console.log(`  -> Sent message ID ${notifRes.result.message_id} to channel!`);
    } else {
      console.warn(`  -> Notification warning:`, notifRes?.description || notifRes);
    }

    // Delay 1.5s between posts to strictly comply with Telegram rate limits
    if (i < DEMO_USERS.length - 1) {
      await sleep(1500);
    }
  }

  // 3. Seed Live Tournament with Demo Users on Leaderboard
  let activeTourney = await Tournament.findOne({ status: 'active' });
  if (!activeTourney) {
    const participants = createdUsers.slice(0, 8).map((u, idx) => ({
      userId: u._id,
      telegramId: u.telegramId,
      username: u.username,
      firstName: u.firstName,
      bestScore: u.highScore || 1500 + (8 - idx) * 350,
      attempts: Math.floor(Math.random() * 5) + 1,
      scores: [u.highScore || 1500],
      joinedAt: new Date(Date.now() - (idx + 1) * 2 * 60 * 60 * 1000),
      lastPlayedAt: new Date(),
    }));

    // Sort descending by score
    participants.sort((a, b) => b.bestScore - a.bestScore);

    activeTourney = await Tournament.create({
      title: 'Firefly Cosmic Arena',
      description: 'Battle for the highest score in Asteroid Blaster! Top 3 pilots take home the prize pool.',
      entryFee: 200,
      prizePool: 1500,
      maxParticipants: 50,
      winnerCount: 3,
      rankRewards: [
        { rank: 1, reward: 750 },
        { rank: 2, reward: 450 },
        { rank: 3, reward: 300 },
      ],
      endDate: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48 hours from now
      status: 'active',
      resultsDeclared: false,
      participants,
    });
    console.log('🏆 Seeded active tournament:', activeTourney.title, 'with', participants.length, 'leaderboard participants!');
  } else {
    console.log('🏆 Active tournament already exists:', activeTourney.title);
  }

  console.log('\n=========================================');
  console.log('🎉 ALL 12 DEMO USERS, PAYOUTS & MESSAGES POSTED SUCCESSFULLY!');
  console.log('=========================================');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
