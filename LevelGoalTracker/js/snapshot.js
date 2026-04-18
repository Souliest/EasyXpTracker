// LevelGoalTracker/js/snapshot.js
// Daily snapshot logic: calculates today's level target and rolls the snapshot over at midnight.

// ═══════════════════════════════════════════════
// Snapshot — daily rollover and daily target calculation
// ═══════════════════════════════════════════════

import {todayStr, daysBetween} from './dates.js';

export function calcDailyTarget(game) {
    const daysLeft = Math.max(0, daysBetween(todayStr(), game.deadlineDate));
    const finalLevel = game.tiers[game.tiers.length - 1].level;
    if (daysLeft <= 0) return finalLevel;
    const remaining = finalLevel - game.snapshot.currentLevel;
    if (remaining <= 0) return game.snapshot.currentLevel;
    return Math.min(finalLevel, Math.ceil(game.snapshot.currentLevel + remaining / daysLeft));
}

export function maybeRollSnapshot(game) {
    if (game.snapshot.date === todayStr()) return false;
    game.snapshot.initialDailyLevel = game.snapshot.currentLevel;
    game.snapshot.date = todayStr();
    game.snapshot.dailyTarget = calcDailyTarget(game);
    return true;
}