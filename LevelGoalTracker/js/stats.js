// LevelGoalTracker/js/stats.js
// Pure computed stats for a game: pace, progress, track status, checkpoint state, and reward totals.

// ═══════════════════════════════════════════════
// Stats — pure computed stats, no DOM, no localStorage
// ═══════════════════════════════════════════════

import {todayStr, daysBetween} from './dates.js';

export function computeStats(game) {
    const today = todayStr();
    const finalLevel = game.tiers[game.tiers.length - 1].level;
    const currentLevel = game.snapshot.currentLevel;
    const daysLeft = Math.max(0, daysBetween(today, game.deadlineDate));
    const daysElapsed = Math.max(0, daysBetween(game.createdDate, today));
    const totalDays = daysBetween(game.createdDate, game.deadlineDate);

    const requiredPace = daysLeft > 0 ? (finalLevel - currentLevel) / daysLeft : Infinity;
    const optimalPace = totalDays > 0 ? (finalLevel - game.startLevel) / totalDays : 0;
    const optimalExpected = Math.min(finalLevel, Math.ceil(game.startLevel + optimalPace * (daysElapsed + 1)));
    const dailyTarget = game.snapshot.dailyTarget;
    const delta = currentLevel - dailyTarget;

    let trackStatus, trackIcon;
    if (currentLevel >= finalLevel) {
        trackStatus = 'done';
        trackIcon = '✅';
    } else if (delta >= 0) {
        trackStatus = 'ahead';
        trackIcon = '🟢';
    } else if (delta >= -requiredPace * 0.2) {
        trackStatus = 'close';
        trackIcon = '🟡';
    } else {
        trackStatus = 'behind';
        trackIcon = '🔴';
    }

    const completedTiers = game.tiers.filter(t => currentLevel >= t.level);
    const nextTier = game.tiers.find(t => currentLevel < t.level) || null;
    const levelsToNext = nextTier ? nextTier.level - currentLevel : 0;

    const earnedRewards = completedTiers.reduce((s, t) => s + (t.reward || 0), 0);
    const totalRewards = game.tiers.reduce((s, t) => s + (t.reward || 0), 0);
    const rewardPct = totalRewards > 0 ? (earnedRewards / totalRewards * 100).toFixed(1) : null;
    const hasRewards = totalRewards > 0;

    const levelProgress = finalLevel > game.startLevel
        ? Math.min(100, ((currentLevel - game.startLevel) / (finalLevel - game.startLevel) * 100)).toFixed(1)
        : 100;

    const isCompleted = currentLevel >= finalLevel;

    return {
        currentLevel, finalLevel, daysLeft, daysElapsed, totalDays,
        requiredPace, optimalPace, optimalExpected, dailyTarget, delta,
        baselineDelta: currentLevel - optimalExpected,
        trackStatus, trackIcon,
        completedTiers, nextTier, levelsToNext,
        earnedRewards, totalRewards, rewardPct, hasRewards,
        levelProgress, isCompleted
    };
}