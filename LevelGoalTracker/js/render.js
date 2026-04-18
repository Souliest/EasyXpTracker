// LevelGoalTracker/js/render.js
// HTML section builders for the main view: overview, daily progress, checkpoints, and action button wiring.

// ═══════════════════════════════════════════════
// Render — section builders and DOM orchestration
// Receive data/stats as parameters; no internal loadData calls.
// ═══════════════════════════════════════════════

import {formatDate} from './dates.js';

// ── Section builders ──

export function renderBanners(game, s) {
    let html = '';
    if (s.isCompleted) {
        html += `<div class="completed-banner">🏆 All checkpoints complete!</div>`;
    }
    if (s.daysLeft <= 7 && !s.isCompleted) {
        html += `<div class="deadline-warn">⚠️ ${s.daysLeft} day${s.daysLeft !== 1 ? 's' : ''} remaining until deadline!</div>`;
    }
    return html;
}

export function renderOverviewPanel(game, s) {
    const deadlineFmt = formatDate(game.deadlineDate);
    return `
    <div class="panel">
      <div class="panel-title">Overview</div>
      <div class="status-grid">
        <div class="stat-box">
          <div class="stat-label">Current</div>
          <div class="stat-value">${s.currentLevel.toLocaleString()}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Goal</div>
          <div class="stat-value muted">${s.finalLevel.toLocaleString()}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Days Left</div>
          <div class="stat-value ${s.daysLeft <= 7 ? 'warn' : ''}">${s.daysLeft}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Deadline</div>
          <div class="stat-value muted" style="font-size:0.8rem">${deadlineFmt}</div>
        </div>
      </div>
      <div class="progress-wrap">
        <div class="progress-labels">
          <span>Lv ${game.startLevel.toLocaleString()}</span>
          <span>${s.levelProgress}%</span>
          <span>Lv ${s.finalLevel.toLocaleString()}</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width:${s.levelProgress}%"></div>
        </div>
      </div>
      <div style="font-size:0.82rem;color:var(--muted);text-align:right;margin-bottom:4px">
        ${s.completedTiers.length} / ${game.tiers.length} checkpoints
      </div>
      <div class="update-row">
        <input type="number" id="levelInput" value="${s.currentLevel}"
               min="${game.startLevel}" max="${s.finalLevel}"
               placeholder="Current level">
        <button class="btn btn-primary" id="updateLevelBtn">Update</button>
      </div>
    </div>`;
}

export function renderDailyProgressPanel(s) {
    let targetSubText, targetSubClass;
    if (s.isCompleted) {
        targetSubText = 'All done!';
        targetSubClass = 'reached';
    } else if (s.trackStatus === 'deadline') {
        targetSubText = 'Deadline reached — keep going!';
        targetSubClass = 'behind';
    } else if (s.delta >= 0) {
        targetSubText = `Daily target reached! (+${s.delta.toLocaleString()})`;
        targetSubClass = 'reached';
    } else {
        const lvls = Math.abs(s.delta);
        targetSubText = `${lvls.toLocaleString()} level${lvls !== 1 ? 's' : ''} to go today`;
        targetSubClass = s.trackStatus === 'behind' ? 'behind' : '';
    }

    return `
    <div class="panel">
      <div class="panel-title">Daily Progress</div>
      <div class="target-box">
        <div class="target-icon">${s.trackIcon}</div>
        <div class="target-main">
          <div class="target-label">Today's Target</div>
          <div class="target-levels">
            <span class="current">${s.currentLevel.toLocaleString()}</span>
            <span class="sep">/</span>
            <span class="goal">${s.dailyTarget.toLocaleString()}</span>
          </div>
          <div class="target-sub ${targetSubClass}">${targetSubText}</div>
        </div>
      </div>
      <div class="pace-row">
        <div class="pace-chip">
          <div class="pace-label">Revised Rate</div>
          <div class="pace-val">${s.daysLeft > 0 ? s.requiredPace.toFixed(1) : '—'} <span class="pace-unit">lvl/day</span></div>
        </div>
        <div class="pace-chip">
          <div class="pace-label">Baseline Target</div>
          <div class="pace-val">${s.optimalExpected.toLocaleString()} <span class="pace-delta ${s.baselineDelta >= 0 ? 'pace-delta-good' : 'pace-delta-bad'}">(${s.baselineDelta >= 0 ? '+' : ''}${s.baselineDelta.toLocaleString()})</span></div>
        </div>
        <div class="pace-chip">
          <div class="pace-label">Baseline Rate</div>
          <div class="pace-val">${s.optimalPace.toFixed(1)} <span class="pace-unit">lvl/day</span></div>
        </div>
      </div>
    </div>`;
}

export function renderNextCheckpointPanel(s) {
    if (!s.nextTier || s.isCompleted) return '';
    return `
    <div class="panel">
      <div class="panel-title">Next Checkpoint</div>
      <div class="next-checkpoint">
        <div>
          <div class="next-label">Target Level</div>
          <div class="next-value">Lv ${s.nextTier.level.toLocaleString()}</div>
        </div>
        <div>
          <div class="next-label">Levels to go</div>
          <div class="next-value">${s.levelsToNext.toLocaleString()}</div>
        </div>
        ${s.nextTier.reward != null && s.nextTier.reward !== 0 ? `<div class="next-reward">🏅 ${s.nextTier.reward} pts</div>` : ''}
      </div>
    </div>`;
}

export function renderCheckpointsPanel(game, s) {
    const rewardsHeader = s.hasRewards ? `
    <div class="rewards-summary">
      <div class="reward-chip">
        <div class="rc-label">Earned</div>
        <div class="rc-value">${s.earnedRewards.toLocaleString()}</div>
      </div>
      <div class="reward-chip">
        <div class="rc-label">Total</div>
        <div class="rc-value">${s.totalRewards.toLocaleString()}</div>
      </div>
      <div class="reward-chip">
        <div class="rc-label">Progress</div>
        <div class="rc-value">${s.rewardPct}%</div>
      </div>
    </div>` : '';

    const rows = game.tiers.map((t, i) => {
        const done = s.currentLevel >= t.level;
        const isNext = !done && (i === 0 || s.currentLevel >= game.tiers[i - 1].level);
        const rowClass = done ? 'done' : isNext ? 'next-up' : '';
        const icon = done ? '✅' : isNext ? '▶' : '○';
        const rewardCell = s.hasRewards
            ? `<td class="tier-reward">${t.reward != null ? t.reward + ' pts' : '—'}</td>`
            : '';
        return `<tr class="${rowClass}">
      <td class="tier-check">${icon}</td>
      <td>Lv ${t.level.toLocaleString()}</td>
      ${rewardCell}
    </tr>`;
    }).join('');

    return `
    <div class="panel">
      <div class="panel-title">Checkpoints</div>
      ${rewardsHeader}
      <table class="checkpoint-list">
        <thead><tr>
          <th></th>
          <th>Level</th>
          ${s.hasRewards ? '<th>Reward</th>' : ''}
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

export function renderActions(gameId) {
    return `
    <div class="game-actions">
      <button class="btn btn-warn"   id="editGameBtn">✏️ Edit</button>
      <button class="btn btn-danger" id="deleteGameBtn">🗑 Delete</button>
    </div>`;
}

export function wireActions(gameId, onEdit, onDelete) {
    const editBtn = document.getElementById('editGameBtn');
    const deleteBtn = document.getElementById('deleteGameBtn');
    if (editBtn) editBtn.addEventListener('click', () => onEdit(gameId));
    if (deleteBtn) deleteBtn.addEventListener('click', () => onDelete(gameId));
}