// ═══════════════════════════════════════════════
// Storage
// ═══════════════════════════════════════════════

const STORAGE_KEY = 'levelGoalTracker_v1';

function loadData() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { games: [] }; }
    catch { return { games: [] }; }
}

function saveData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// ═══════════════════════════════════════════════
// Date helpers
// ═══════════════════════════════════════════════

function todayStr() {
    return new Date().toISOString().slice(0, 10);
}

function daysBetween(dateStrA, dateStrB) {
    return Math.round((new Date(dateStrB) - new Date(dateStrA)) / 86400000);
}

function formatDate(dateStr) {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric'
    });
}

// ═══════════════════════════════════════════════
// Snapshot
// ═══════════════════════════════════════════════

function calcDailyTarget(game) {
    const daysLeft = Math.max(0, daysBetween(todayStr(), game.deadlineDate));
    const finalLevel = game.tiers[game.tiers.length - 1].level;
    if (daysLeft <= 0) return finalLevel;
    const remaining = finalLevel - game.snapshot.currentLevel;
    if (remaining <= 0) return game.snapshot.currentLevel;
    return Math.min(finalLevel, Math.ceil(game.snapshot.currentLevel + remaining / daysLeft));
}

function maybeRollSnapshot(game) {
    if (game.snapshot.date === todayStr()) return false;
    game.snapshot.initialDailyLevel = game.snapshot.currentLevel;
    game.snapshot.date = todayStr();
    game.snapshot.dailyTarget = calcDailyTarget(game);
    return true;
}

// ═══════════════════════════════════════════════
// Computed stats
// ═══════════════════════════════════════════════

function computeStats(game) {
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
        trackStatus = 'done'; trackIcon = '✅';
    } else if (delta >= 0) {
        trackStatus = 'ahead'; trackIcon = '🟢';
    } else if (delta >= -requiredPace * 0.2) {
        trackStatus = 'close'; trackIcon = '🟡';
    } else {
        trackStatus = 'behind'; trackIcon = '🔴';
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

// ═══════════════════════════════════════════════
// Render: section functions
// ═══════════════════════════════════════════════

function renderBanners(game, s) {
    let html = '';
    if (s.isCompleted) {
        html += `<div class="completed-banner">🏆 All checkpoints complete!</div>`;
    }
    if (s.daysLeft <= 7 && !s.isCompleted) {
        html += `<div class="deadline-warn">⚠️ ${s.daysLeft} day${s.daysLeft !== 1 ? 's' : ''} remaining until deadline!</div>`;
    }
    return html;
}

function renderOverviewPanel(game, s) {
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
        <input type="number" id="levelInput" value="${s.currentLevel}" min="${game.startLevel}" placeholder="Current level">
        <button class="btn btn-primary" onclick="updateLevel()">Update</button>
      </div>
    </div>`;
}

function renderDailyProgressPanel(s) {
    let targetSubText, targetSubClass;
    if (s.isCompleted) {
        targetSubText = 'All done!';
        targetSubClass = 'reached';
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
          <div class="pace-val">${s.optimalExpected.toLocaleString()}</div>
          <div class="pace-delta ${s.baselineDelta >= 0 ? 'pace-delta-good' : 'pace-delta-bad'}">${s.baselineDelta >= 0 ? '+' : ''}${s.baselineDelta.toLocaleString()}</div>
        </div>
        <div class="pace-chip">
          <div class="pace-label">Baseline Rate</div>
          <div class="pace-val">${s.optimalPace.toFixed(1)} <span class="pace-unit">lvl/day</span></div>
        </div>
      </div>
    </div>`;
}

function renderNextCheckpointPanel(s) {
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
        ${s.nextTier.reward ? `<div class="next-reward">🏅 ${s.nextTier.reward} pts</div>` : ''}
      </div>
    </div>`;
}

function renderCheckpointsPanel(game, s) {
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
            ? `<td class="tier-reward">${t.reward ? t.reward + ' pts' : '—'}</td>`
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

function renderActions(gameId) {
    return `
    <div class="game-actions">
      <button class="btn btn-warn" onclick="openEditModal('${gameId}')">✏️ Edit</button>
      <button class="btn btn-danger" onclick="openConfirmDelete('${gameId}')">🗑 Delete</button>
    </div>`;
}

// ═══════════════════════════════════════════════
// Render: main orchestrator
// ═══════════════════════════════════════════════

let selectedGameId = null;

function renderSelector() {
    const data = loadData();
    const sel = document.getElementById('gameSelect');
    sel.innerHTML = '<option value="">— select a game —</option>';
    data.games.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g.id;
        opt.textContent = g.name;
        sel.appendChild(opt);
    });
    if (selectedGameId && data.games.find(g => g.id === selectedGameId)) {
        sel.value = selectedGameId;
    }
}

function selectGame(id) {
    selectedGameId = id;
    renderMain();
}

function renderMain() {
    const content = document.getElementById('mainContent');
    if (!selectedGameId) {
        const data = loadData();
        content.innerHTML = data.games.length === 0
            ? `<div class="empty-state"><div class="big">🎮</div>No games yet.<br>Hit <strong>+ Add</strong> to track your first goal.</div>`
            : `<div class="empty-state">Select a game above.</div>`;
        return;
    }

    const data = loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) { content.innerHTML = ''; return; }

    if (maybeRollSnapshot(game)) saveData(data);

    const s = computeStats(game);

    content.innerHTML = [
        renderBanners(game, s),
        renderOverviewPanel(game, s),
        renderDailyProgressPanel(s),
        renderNextCheckpointPanel(s),
        renderCheckpointsPanel(game, s),
        renderActions(game.id),
    ].join('');
}

// ═══════════════════════════════════════════════
// Update level
// ═══════════════════════════════════════════════

function updateLevel() {
    const newLevel = parseInt(document.getElementById('levelInput').value);
    if (isNaN(newLevel)) return;
    const data = loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) return;
    game.snapshot.currentLevel = newLevel;
    saveData(data);
    renderMain();
}

// ═══════════════════════════════════════════════
// Modal: Add / Edit
// ═══════════════════════════════════════════════

let editingGameId = null;

function toggleBackdate() {
    const checked = document.getElementById('fBackdate').checked;
    document.getElementById('backdateFields').classList.toggle('visible', checked);
    if (!checked) {
        document.getElementById('fTotalDays').value = '';
        document.getElementById('fStartLevel').value = '0';
    }
}

function resetBackdateFields() {
    document.getElementById('fBackdate').checked = false;
    document.getElementById('backdateFields').classList.remove('visible');
    document.getElementById('fTotalDays').value = '';
    document.getElementById('fStartLevel').value = '0';
}

function openAddModal() {
    editingGameId = null;
    document.getElementById('modalTitle').textContent = 'Add Game';
    document.getElementById('fName').value = '';
    document.getElementById('fCurrentLevel').value = '0';
    document.getElementById('fDays').value = '';
    resetBackdateFields();
    document.getElementById('tierRows').innerHTML = '';
    addTierRow();
    document.getElementById('gameModal').classList.add('open');
}

function openEditModal(id) {
    const data = loadData();
    const game = data.games.find(g => g.id === id);
    if (!game) return;
    editingGameId = id;
    document.getElementById('modalTitle').textContent = 'Edit Game';
    document.getElementById('fName').value = game.name;
    document.getElementById('fCurrentLevel').value = game.snapshot.currentLevel;
    document.getElementById('fDays').value = Math.max(0, daysBetween(todayStr(), game.deadlineDate));
    resetBackdateFields();
    const rows = document.getElementById('tierRows');
    rows.innerHTML = '';
    game.tiers.forEach(t => addTierRow(t.level, t.reward));
    document.getElementById('gameModal').classList.add('open');
}

function closeModal() {
    document.getElementById('gameModal').classList.remove('open');
}

function addTierRow(level = '', reward = '') {
    const rows = document.getElementById('tierRows');
    const div = document.createElement('div');
    div.className = 'tier-row';
    div.innerHTML = `
    <input type="number" class="tier-level" placeholder="Level" value="${level}" min="1">
    <input type="number" class="tier-reward" placeholder="0.0" step="0.1" value="${reward}">
    <button class="tier-remove" onclick="this.parentElement.remove()">✕</button>
  `;
    rows.appendChild(div);
}

function saveGame() {
    const name = document.getElementById('fName').value.trim();
    const currentLevelRaw = document.getElementById('fCurrentLevel').value;
    const currentLevel = currentLevelRaw === '' ? 0 : parseInt(currentLevelRaw);
    const days = parseInt(document.getElementById('fDays').value);
    const isBackdated = document.getElementById('fBackdate').checked;
    const totalDays = isBackdated ? parseInt(document.getElementById('fTotalDays').value) : null;
    const startLevelRaw = document.getElementById('fStartLevel').value;
    const startLevel = isBackdated ? (startLevelRaw === '' ? 0 : parseInt(startLevelRaw)) : currentLevel;

    if (!name) { alert('Please enter a game title.'); return; }
    if (!days || days < 1) { alert('Please enter a valid number of days remaining.'); return; }
    if (isBackdated && (!totalDays || totalDays <= days)) {
        alert('Total days must be greater than days remaining.'); return;
    }

    const tierRows = document.querySelectorAll('.tier-row');
    const tiers = [];
    for (const row of tierRows) {
        const lvl = parseInt(row.querySelector('.tier-level').value);
        const rew = parseFloat(row.querySelector('.tier-reward').value) || 0;
        if (!isNaN(lvl) && lvl > 0) tiers.push({ level: lvl, reward: rew });
    }
    if (tiers.length === 0) { alert('Please add at least one checkpoint.'); return; }
    tiers.sort((a, b) => a.level - b.level);

    const data = loadData();
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + days);
    const deadlineDate = deadline.toISOString().slice(0, 10);

    if (editingGameId) {
        const game = data.games.find(g => g.id === editingGameId);
        if (!game) return;
        game.name = name;
        game.tiers = tiers;
        game.deadlineDate = deadlineDate;
        game.snapshot.currentLevel = currentLevel;
        game.snapshot.initialDailyLevel = currentLevel;
        game.snapshot.date = todayStr();
        game.snapshot.dailyTarget = calcDailyTarget(game);
    } else {
        // For backdated games, createdDate = today - (totalDays - days)
        const daysAlreadyElapsed = isBackdated ? (totalDays - days) : 0;
        const createdDate = new Date();
        createdDate.setDate(createdDate.getDate() - daysAlreadyElapsed);
        const createdDateStr = createdDate.toISOString().slice(0, 10);

        const game = {
            id: 'game_' + Date.now(),
            name,
            startLevel,
            createdDate: createdDateStr,
            deadlineDate,
            tiers,
            snapshot: {
                date: todayStr(),
                initialDailyLevel: currentLevel,
                currentLevel,
                dailyTarget: 0
            }
        };
        game.snapshot.dailyTarget = calcDailyTarget(game);
        data.games.push(game);
        selectedGameId = game.id;
    }

    saveData(data);
    closeModal();
    renderSelector();
    document.getElementById('gameSelect').value = selectedGameId;
    renderMain();
}

// ═══════════════════════════════════════════════
// Delete
// ═══════════════════════════════════════════════

let pendingDeleteId = null;

function openConfirmDelete(id) {
    const data = loadData();
    const game = data.games.find(g => g.id === id);
    if (!game) return;
    pendingDeleteId = id;
    document.getElementById('confirmGameName').textContent = game.name;
    document.getElementById('confirmOverlay').classList.add('open');
}

function closeConfirm() {
    pendingDeleteId = null;
    document.getElementById('confirmOverlay').classList.remove('open');
}

function confirmDelete() {
    if (!pendingDeleteId) return;
    const data = loadData();
    data.games = data.games.filter(g => g.id !== pendingDeleteId);
    saveData(data);
    if (selectedGameId === pendingDeleteId) selectedGameId = null;
    closeConfirm();
    renderSelector();
    renderMain();
}

// ═══════════════════════════════════════════════
// Init
// ═══════════════════════════════════════════════

initTheme();
renderSelector();
renderMain();