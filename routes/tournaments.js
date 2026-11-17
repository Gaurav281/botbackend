const express = require('express');
const router = express.Router();
const Tournament = require('../models/Tournament');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

/**
 * Helper to compute sorted leaderboard & user status for a tournament
 */
function formatTournamentData(tournamentDoc, currentUserId, currentTelegramId) {
  const t = tournamentDoc.toObject ? tournamentDoc.toObject() : tournamentDoc;
  
  // Sort participants by bestScore descending, then by attempts ascending or joinedAt
  const sortedParticipants = [...(t.participants || [])].sort((a, b) => {
    if (b.bestScore !== a.bestScore) return b.bestScore - a.bestScore;
    return (a.attempts || 0) - (b.attempts || 0);
  });

  // Calculate ranks
  const rankedParticipants = sortedParticipants.map((p, idx) => ({
    ...p,
    rank: idx + 1,
  }));

  // Top 10 leaderboard
  const top10 = rankedParticipants.slice(0, 10).map((p) => ({
    userId: p.userId,
    telegramId: p.telegramId,
    username: p.username || 'Anonymous',
    firstName: p.firstName || 'Pilot',
    photoUrl: p.photoUrl || '',
    bestScore: p.bestScore || 0,
    attempts: p.attempts || 0,
    rank: p.rank,
  }));

  // Find current user participation
  let userParticipation = null;
  const foundUserIndex = rankedParticipants.findIndex(
    (p) =>
      (currentTelegramId && String(p.telegramId) === String(currentTelegramId)) ||
      (currentUserId && String(p.userId) === String(currentUserId))
  );

  if (foundUserIndex !== -1) {
    const userP = rankedParticipants[foundUserIndex];
    userParticipation = {
      joined: true,
      rank: userP.rank,
      bestScore: userP.bestScore || 0,
      attempts: userP.attempts || 0,
      maxAttempts: 10,
      remainingAttempts: Math.max(0, 10 - (userP.attempts || 0)),
      canPlay: (userP.attempts || 0) < 10,
      requiresAd: (userP.attempts || 0) >= 1 && (userP.attempts || 0) < 10,
    };
  } else {
    userParticipation = {
      joined: false,
      rank: null,
      bestScore: 0,
      attempts: 0,
      maxAttempts: 10,
      remainingAttempts: 10,
      canPlay: false,
      requiresAd: false,
    };
  }

  // Check if expired
  const isExpired = new Date() > new Date(t.endDate);
  const effectiveStatus = t.status === 'active' && isExpired ? 'ended' : t.status;

  return {
    _id: t._id,
    title: t.title,
    description: t.description,
    entryFee: t.entryFee,
    prizePool: t.prizePool,
    maxParticipants: t.maxParticipants,
    winnerCount: t.winnerCount,
    rankRewards: t.rankRewards,
    endDate: t.endDate,
    status: effectiveStatus,
    resultsDeclared: t.resultsDeclared,
    declaredAt: t.declaredAt,
    winners: t.winners || [],
    participantCount: (t.participants || []).length,
    leaderboard: top10,
    userParticipation,
    createdAt: t.createdAt,
  };
}

/**
 * GET /api/tournaments - Fetch active and recent tournaments with leaderboards
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const tournaments = await Tournament.find({
      status: { $in: ['active', 'completed'] },
    })
      .sort({ createdAt: -1 })
      .limit(10);

    const formatted = tournaments.map((t) =>
      formatTournamentData(t, req.user._id, req.user.telegramId)
    );

    res.json({
      success: true,
      tournaments: formatted,
    });
  } catch (err) {
    console.error('Error fetching tournaments:', err);
    res.status(500).json({ success: false, message: 'Server error fetching tournaments' });
  }
});

/**
 * GET /api/tournaments/:id - Fetch single tournament with full leaderboard & user rank
 */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) {
      return res.status(404).json({ success: false, message: 'Tournament not found' });
    }

    const formatted = formatTournamentData(tournament, req.user._id, req.user.telegramId);

    res.json({
      success: true,
      tournament: formatted,
    });
  } catch (err) {
    console.error('Error fetching tournament details:', err);
    res.status(500).json({ success: false, message: 'Server error fetching tournament details' });
  }
});

/**
 * POST /api/tournaments/:id/join - Join tournament by paying entry fee in PTS
 */
router.post('/:id/join', authMiddleware, async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) {
      return res.status(404).json({ success: false, message: 'Tournament not found' });
    }

    if (tournament.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Tournament is no longer active' });
    }

    if (new Date() > new Date(tournament.endDate)) {
      return res.status(400).json({ success: false, message: 'Tournament has already ended' });
    }

    // Check if user already joined
    const alreadyJoined = tournament.participants.some(
      (p) =>
        String(p.telegramId) === String(req.user.telegramId) ||
        String(p.userId) === String(req.user._id)
    );
    if (alreadyJoined) {
      return res.status(400).json({ success: false, message: 'You have already joined this tournament!' });
    }

    // Check participant limit
    if (tournament.maxParticipants && tournament.participants.length >= tournament.maxParticipants) {
      return res.status(400).json({ success: false, message: 'Tournament participant limit reached!' });
    }

    // Check PTS balance
    if ((req.user.coins || 0) < tournament.entryFee) {
      return res.status(400).json({
        success: false,
        message: `Insufficient PTS! Entry fee is ${tournament.entryFee} PTS. You have ${req.user.coins || 0} PTS.`,
      });
    }

    // Deduct entry fee
    req.user.coins = Math.max(0, (req.user.coins || 0) - tournament.entryFee);
    await req.user.save();

    // Create entry transaction record
    await Transaction.create({
      userId: req.user._id,
      type: 'tournament_entry',
      amount: -tournament.entryFee,
      currency: 'PTS',
      description: `Entry fee for tournament: ${tournament.title}`,
    });

    // Add user to participants list
    tournament.participants.push({
      userId: req.user._id,
      telegramId: req.user.telegramId,
      username: req.user.username || '',
      firstName: req.user.firstName || 'Pilot',
      photoUrl: req.user.photoUrl || '',
      bestScore: 0,
      attempts: 0,
      scores: [],
      joinedAt: new Date(),
    });

    await tournament.save();

    const formatted = formatTournamentData(tournament, req.user._id, req.user.telegramId);

    res.json({
      success: true,
      message: `Successfully joined ${tournament.title}! ${tournament.entryFee} PTS deducted.`,
      tournament: formatted,
      user: req.user,
    });
  } catch (err) {
    console.error('Error joining tournament:', err);
    res.status(500).json({ success: false, message: 'Server error joining tournament' });
  }
});

/**
 * POST /api/tournaments/:id/score - Submit tournament match score
 */
router.post('/:id/score', authMiddleware, async (req, res) => {
  try {
    const { score } = req.body;
    const finalScore = Math.max(0, parseInt(score) || 0);

    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) {
      return res.status(404).json({ success: false, message: 'Tournament not found' });
    }

    if (tournament.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Tournament is no longer active' });
    }

    if (new Date() > new Date(tournament.endDate)) {
      return res.status(400).json({ success: false, message: 'Tournament has expired' });
    }

    const participant = tournament.participants.find(
      (p) =>
        String(p.telegramId) === String(req.user.telegramId) ||
        String(p.userId) === String(req.user._id)
    );

    if (!participant) {
      return res.status(400).json({ success: false, message: 'You have not joined this tournament yet!' });
    }

    if (participant.attempts >= 10) {
      return res.status(400).json({ success: false, message: 'You have used all 10 tournament attempts!' });
    }

    // Increment attempts
    participant.attempts += 1;
    participant.scores.push(finalScore);
    participant.lastPlayedAt = new Date();

    const isNewBest = finalScore > (participant.bestScore || 0);
    if (isNewBest) {
      participant.bestScore = finalScore;
    }

    // Also update global high score if beat
    if (finalScore > (req.user.highScore || 0)) {
      req.user.highScore = finalScore;
      await req.user.save();
    }

    await tournament.save();

    const formatted = formatTournamentData(tournament, req.user._id, req.user.telegramId);

    res.json({
      success: true,
      message: isNewBest
        ? `New personal best! Score: ${finalScore}`
        : `Score recorded: ${finalScore}. Best remains ${participant.bestScore}`,
      isNewBest,
      score: finalScore,
      bestScore: participant.bestScore,
      attempts: participant.attempts,
      remainingAttempts: Math.max(0, 10 - participant.attempts),
      tournament: formatted,
    });
  } catch (err) {
    console.error('Error submitting tournament score:', err);
    res.status(500).json({ success: false, message: 'Server error submitting score' });
  }
});

// ==========================================
// ADMIN TOURNAMENT ROUTES
// ==========================================

/**
 * GET /api/tournaments/admin/all - Get all tournaments for admin management
 */
router.get('/admin/all', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const tournaments = await Tournament.find().sort({ createdAt: -1 }).lean();

    // Map each tournament with sorted participants for admin view
    const detailed = tournaments.map((t) => {
      const sortedParticipants = [...(t.participants || [])].sort(
        (a, b) => (b.bestScore || 0) - (a.bestScore || 0)
      );
      return {
        ...t,
        participants: sortedParticipants,
        participantCount: sortedParticipants.length,
      };
    });

    res.json({
      success: true,
      tournaments: detailed,
    });
  } catch (err) {
    console.error('Admin all tournaments error:', err);
    res.status(500).json({ success: false, message: 'Server error loading tournaments' });
  }
});

/**
 * POST /api/tournaments/admin/create - Create a new tournament
 */
router.post('/admin/create', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const {
      title,
      description,
      entryFee,
      prizePool,
      maxParticipants,
      winnerCount,
      rankRewards,
      durationHours,
      endDate,
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Tournament title is required' });
    }

    const fee = Math.max(0, parseInt(entryFee) || 0);
    const pool = Math.max(1, parseInt(prizePool) || 1000);
    const maxP = Math.max(2, parseInt(maxParticipants) || 50);
    const count = [1, 2, 3].includes(parseInt(winnerCount)) ? parseInt(winnerCount) : 1;

    // Calculate end date
    let calculatedEndDate;
    if (endDate) {
      calculatedEndDate = new Date(endDate);
    } else {
      const hours = Math.max(1, parseInt(durationHours) || 24);
      calculatedEndDate = new Date(Date.now() + hours * 60 * 60 * 1000);
    }

    // Default rewards if not supplied or mismatched
    let rewards = rankRewards;
    if (!rewards || !Array.isArray(rewards) || rewards.length < count) {
      if (count === 1) {
        rewards = [{ rank: 1, reward: pool }];
      } else if (count === 2) {
        const r1 = Math.round(pool * 0.7);
        const r2 = pool - r1;
        rewards = [
          { rank: 1, reward: r1 },
          { rank: 2, reward: r2 },
        ];
      } else {
        const r1 = Math.round(pool * 0.5);
        const r2 = Math.round(pool * 0.3);
        const r3 = pool - r1 - r2;
        rewards = [
          { rank: 1, reward: r1 },
          { rank: 2, reward: r2 },
          { rank: 3, reward: r3 },
        ];
      }
    }

    const newTournament = await Tournament.create({
      title: title.trim(),
      description: (description || '').trim(),
      entryFee: fee,
      prizePool: pool,
      maxParticipants: maxP,
      winnerCount: count,
      rankRewards: rewards,
      endDate: calculatedEndDate,
      status: 'active',
      resultsDeclared: false,
      participants: [],
    });

    res.json({
      success: true,
      message: `Tournament "${newTournament.title}" created successfully!`,
      tournament: newTournament,
    });
  } catch (err) {
    console.error('Admin create tournament error:', err);
    res.status(500).json({ success: false, message: 'Server error creating tournament' });
  }
});

/**
 * POST /api/tournaments/admin/:id/declare-results - Declare results and award winners automatically
 */
router.post('/admin/:id/declare-results', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) {
      return res.status(404).json({ success: false, message: 'Tournament not found' });
    }

    if (tournament.resultsDeclared) {
      return res.status(400).json({ success: false, message: 'Results have already been declared for this tournament' });
    }

    // Sort participants by bestScore desc
    const sortedParticipants = [...(tournament.participants || [])].sort((a, b) => {
      if (b.bestScore !== a.bestScore) return b.bestScore - a.bestScore;
      return (a.attempts || 0) - (b.attempts || 0);
    });

    if (sortedParticipants.length === 0) {
      tournament.status = 'completed';
      tournament.resultsDeclared = true;
      tournament.declaredAt = new Date();
      await tournament.save();
      return res.json({
        success: true,
        message: 'Tournament closed. No participants were registered.',
        winners: [],
      });
    }

    const winnersList = [];
    const rewards = tournament.rankRewards || [];

    for (let i = 0; i < tournament.winnerCount; i++) {
      if (i < sortedParticipants.length) {
        const participant = sortedParticipants[i];
        const rewardConfig = rewards.find((r) => r.rank === i + 1);
        const rewardAmount = rewardConfig ? rewardConfig.reward : 0;

        if (rewardAmount > 0) {
          // Award PTS to participant
          const userDoc = await User.findById(participant.userId);
          if (userDoc) {
            userDoc.coins = (userDoc.coins || 0) + rewardAmount;
            await userDoc.save();

            await Transaction.create({
              userId: userDoc._id,
              type: 'tournament_reward',
              amount: rewardAmount,
              currency: 'PTS',
              description: `Tournament Prize: Rank #${i + 1} in "${tournament.title}"`,
            });
          }
        }

        winnersList.push({
          rank: i + 1,
          reward: rewardAmount,
          userId: participant.userId,
          telegramId: participant.telegramId,
          username: participant.username,
          firstName: participant.firstName,
          score: participant.bestScore,
        });
      }
    }

    tournament.winners = winnersList;
    tournament.status = 'completed';
    tournament.resultsDeclared = true;
    tournament.declaredAt = new Date();
    await tournament.save();

    res.json({
      success: true,
      message: `Results declared successfully! Prizes awarded to ${winnersList.length} winner(s).`,
      winners: winnersList,
      tournament,
    });
  } catch (err) {
    console.error('Admin declare results error:', err);
    res.status(500).json({ success: false, message: 'Server error declaring results' });
  }
});

/**
 * DELETE /api/tournaments/admin/:id - Delete tournament and refund active players if needed
 */
router.delete('/admin/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) {
      return res.status(404).json({ success: false, message: 'Tournament not found' });
    }

    // If active and has entryFee, refund all participants
    if (tournament.status === 'active' && tournament.entryFee > 0 && tournament.participants.length > 0) {
      for (const p of tournament.participants) {
        try {
          const userDoc = await User.findById(p.userId);
          if (userDoc) {
            userDoc.coins = (userDoc.coins || 0) + tournament.entryFee;
            await userDoc.save();

            await Transaction.create({
              userId: userDoc._id,
              type: 'tournament_refund',
              amount: tournament.entryFee,
              currency: 'PTS',
              description: `Refund for cancelled tournament: ${tournament.title}`,
            });
          }
        } catch (e) {
          console.error(`Refund error for user ${p.telegramId}:`, e);
        }
      }
    }

    await Tournament.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: `Tournament "${tournament.title}" deleted successfully.`,
    });
  } catch (err) {
    console.error('Admin delete tournament error:', err);
    res.status(500).json({ success: false, message: 'Server error deleting tournament' });
  }
});

module.exports = router;
