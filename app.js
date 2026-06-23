// ===========================
// CONSTANTS
// ===========================
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyC4iuxUEP6xNXrdlg2TNwdEZWFNFufUMno",
    authDomain: "sittonsoccer.firebaseapp.com",
    projectId: "sittonsoccer",
    storageBucket: "sittonsoccer.firebasestorage.app",
    messagingSenderId: "656446248098",
    appId: "1:656446248098:web:090224f241df47ca3173fb",
    databaseURL: "https://sittonsoccer-default-rtdb.europe-west1.firebasedatabase.app"
};

const STEPS = {
    SETUP: "setup",
    LOTTERY: "lottery",
    DRAFT: "draft",
    COLORS: "colors",
    FINAL: "final"
};

const ROLES = {
    ADMIN: 'admin',
    CAPTAIN_0: 0,
    CAPTAIN_1: 1,
    CAPTAIN_2: 2
};

const LOTTERY_POSITIONS = {
    TOP_CORNER: 0,
    CENTER: 1,
    MISS: 2
};

const ANIMATION_CLASSES = {
    TOP_CORNER: 'kick-top-corner',
    CENTER: 'kick-center',
    MISS: 'kick-miss'
};

const DRAFT_ORDER = [0, 1, 2, 0, 1, 2, 2, 0, 1, 0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2];
const COLOR_DRAFT_ORDER = [2, 1, 0];

const AVAILABLE_COLORS = [
    { name: 'לבן', emoji: '⚪' },
    { name: 'כחול/שחור', emoji: '🔵⚫' },
    { name: 'אדום', emoji: '🔴' }
];

const DEFAULT_STATE = {
    step: STEPS.SETUP,
    players: [],
    initialCaptains: [],
    sortedCaptains: ["", "", ""],
    teams: [[], [], []],
    teamColors: ["", "", ""],
    lotteryResults: [],
    lotteryPool: [0, 1, 2],
    currentPickStep: 0,
    lotteryClickCount: 0,
    pickHistory: [],
    colorPickStep: 0
};

const LOTTERY_RESULT_MESSAGES = {
    [LOTTERY_POSITIONS.TOP_CORNER]: "⚽ לחיבורים!!!",
    [LOTTERY_POSITIONS.CENTER]: "🥅 פנימה!",
    [LOTTERY_POSITIONS.MISS]: "❌ החוצה!"
};

const ANIMATION_DURATION = 1100;

// ===========================
// GLOBAL STATE
// ===========================
let myRole = null;
let gameState = { ...DEFAULT_STATE };
let isProcessing = false;
let db = null;
let gameRef = null;
let soundEnabled = true;
let timerEnabled = false;
let timerInterval = null;
let timeRemaining = 30;
let pickStartTime = null;
let showHistory = false;
let statistics = {
    picks: [], // Array of {time, captain, player, capIdx}
    totalPicks: 0,
    fastestPick: null,
    slowestPick: null,
    captainStats: {} // {capIdx: {totalTime, count}}
};

// ===========================
// FIREBASE INITIALIZATION
// ===========================
function initializeFirebase() {
    if (!firebase.apps.length) {
        firebase.initializeApp(FIREBASE_CONFIG);
    }
    db = firebase.database();
    gameRef = db.ref('current_game');

    gameRef.on('value', handleFirebaseUpdate);
}

function handleFirebaseUpdate(snapshot) {
    const data = snapshot.val();
    if (data) {
        gameState = normalizeState(data);
        renderUI();
        updateLoginButtons();
    }
}

async function updateFirebase(newState) {
    try {
        const normalizedState = normalizeState(newState);
        await gameRef.set(normalizedState);
        saveToLocalStorage(); // Auto-save backup
        return true;
    } catch (e) {
        console.error("Firebase error:", e);
        showToast('שגיאת שרת - נסה שוב', 'error');
        return false;
    }
}

// ===========================
// STATE MANAGEMENT
// ===========================
function normalizeState(state) {
    const safeTeams = [0, 1, 2].map(i => {
        if (state.teams && state.teams[i]) return state.teams[i];
        return [];
    });

    return {
        step: state.step || STEPS.SETUP,
        players: Array.isArray(state.players) ? state.players : [],
        initialCaptains: Array.isArray(state.initialCaptains) ? state.initialCaptains : [],
        sortedCaptains: Array.isArray(state.sortedCaptains) ? state.sortedCaptains : ["", "", ""],
        teams: safeTeams,
        teamColors: Array.isArray(state.teamColors) ? state.teamColors : ["", "", ""],
        lotteryResults: Array.isArray(state.lotteryResults) ? state.lotteryResults : [],
        lotteryPool: Array.isArray(state.lotteryPool) ? state.lotteryPool : [0, 1, 2],
        currentPickStep: state.currentPickStep || 0,
        lotteryClickCount: state.lotteryClickCount || 0,
        pickHistory: Array.isArray(state.pickHistory) ? state.pickHistory : [],
        colorPickStep: state.colorPickStep || 0
    };
}

// ===========================
// IDENTITY & PERMISSIONS
// ===========================
function setIdentity(role) {
    myRole = role;
    hideElement('identity-overlay');

    const roleName = getRoleName(role);
    setText('user-role-display', "שלום, " + roleName);
    renderUI();
}

function getRoleName(role) {
    if (role === ROLES.ADMIN) return "מנהל";

    const capName = (gameState.initialCaptains && gameState.initialCaptains[role])
        ? gameState.initialCaptains[role]
        : ("קפטן " + (role + 1));
    return capName;
}

function checkTurn(actionType) {
    if (myRole === ROLES.ADMIN) return true;

    if (actionType === 'lottery') {
        return myRole === gameState.lotteryClickCount;
    }

    if (actionType === 'draft') {
        const currentTurnCapIdx = DRAFT_ORDER[gameState.currentPickStep];
        return myRole === currentTurnCapIdx;
    }

    if (actionType === 'color') {
        const currentTurnCapIdx = COLOR_DRAFT_ORDER[gameState.colorPickStep];
        return myRole === currentTurnCapIdx;
    }

    return false;
}

// ===========================
// UTILITY FUNCTIONS
// ===========================
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// ===========================
// DOM HELPERS
// ===========================
function getElement(id) {
    return document.getElementById(id);
}

function setText(id, text) {
    const element = getElement(id);
    if (element) element.innerText = text;
}

function setHTML(id, html) {
    const element = getElement(id);
    if (element) element.innerHTML = html;
}

function showElement(id) {
    const element = getElement(id);
    if (element) element.style.display = 'block';
}

function hideElement(id) {
    const element = getElement(id);
    if (element) element.style.display = 'none';
}

function getValue(id) {
    const element = getElement(id);
    return element ? element.value : '';
}

// ===========================
// CUSTOM MODAL & NOTIFICATIONS
// ===========================
function showModal(message, icon = '⚽', buttons = []) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';

        const modal = document.createElement('div');
        modal.className = 'modal-box';

        modal.innerHTML = `
            <div class="modal-icon">${icon}</div>
            <div class="modal-message">${message}</div>
            <div class="modal-buttons" id="modal-buttons"></div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const buttonsContainer = modal.querySelector('#modal-buttons');

        if (buttons.length === 0) {
            buttons = [{ text: 'אישור', type: 'primary', value: true }];
        }

        buttons.forEach(btn => {
            const button = document.createElement('button');
            button.className = `modal-btn modal-btn-${btn.type || 'primary'}`;
            button.textContent = btn.text;
            button.onclick = () => {
                document.body.removeChild(overlay);
                resolve(btn.value !== undefined ? btn.value : true);
            };
            buttonsContainer.appendChild(button);
        });
    });
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    document.body.appendChild(toast);

    setTimeout(() => {
        if (document.body.contains(toast)) {
            document.body.removeChild(toast);
        }
    }, 3000);
}

function showConfirm(message, icon = '❓') {
    return showModal(message, icon, [
        { text: 'ביטול', type: 'secondary', value: false },
        { text: 'אישור', type: 'primary', value: true }
    ]);
}

function showAlert(message, icon = '⚽') {
    return showModal(message, icon);
}

// ===========================
// LOADING STATE MANAGEMENT
// ===========================
function showLoading() {
    let loadingOverlay = getElement('loading-overlay');
    if (!loadingOverlay) {
        loadingOverlay = document.createElement('div');
        loadingOverlay.id = 'loading-overlay';
        loadingOverlay.className = 'loading-overlay';
        loadingOverlay.innerHTML = '<div class="loading-spinner"></div>';
        const container = document.querySelector('.container');
        if (container) container.appendChild(loadingOverlay);
    }
    loadingOverlay.style.display = 'flex';
}

function hideLoading() {
    const loadingOverlay = getElement('loading-overlay');
    if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
    }
}

function setButtonLoading(buttonId, loading) {
    const button = getElement(buttonId);
    if (!button) return;

    if (loading) {
        button.classList.add('loading');
        button.disabled = true;
    } else {
        button.classList.remove('loading');
        button.disabled = false;
    }
}

// ===========================
// SOUND EFFECTS
// ===========================
const SOUNDS = {
    kick: { frequency: 200, duration: 100 },
    goal: { frequency: 600, duration: 300 },
    miss: { frequency: 150, duration: 200 },
    pick: { frequency: 400, duration: 80 },
    success: { frequency: 500, duration: 150 },
    error: { frequency: 100, duration: 200 }
};

function playSound(soundName) {
    if (!soundEnabled) return;

    const sound = SOUNDS[soundName];
    if (!sound) return;

    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = sound.frequency;
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + sound.duration / 1000);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + sound.duration / 1000);
    } catch (e) {
        // Sound not supported, silently fail
    }
}

function toggleSound() {
    soundEnabled = !soundEnabled;
    const btn = getElement('sound-toggle');
    if (btn) {
        btn.textContent = soundEnabled ? '🔊 קול' : '🔇 שקט';
        btn.classList.toggle('muted', !soundEnabled);
    }
    showToast(soundEnabled ? 'קול הופעל' : 'קול כובה', 'info');
}

// ===========================
// LOCALSTORAGE BACKUP
// ===========================
function saveToLocalStorage() {
    try {
        localStorage.setItem('sitton_soccer_backup', JSON.stringify({
            gameState,
            timestamp: Date.now(),
            myRole
        }));
    } catch (e) {
        console.warn('LocalStorage save failed:', e);
    }
}

function loadFromLocalStorage() {
    try {
        const backup = localStorage.getItem('sitton_soccer_backup');
        if (backup) {
            const data = JSON.parse(backup);
            // Only restore if backup is less than 24 hours old
            if (Date.now() - data.timestamp < 24 * 60 * 60 * 1000) {
                return data;
            }
        }
    } catch (e) {
        console.warn('LocalStorage load failed:', e);
    }
    return null;
}

function clearLocalStorageBackup() {
    localStorage.removeItem('sitton_soccer_backup');
}

// Search feature removed - not needed for mobile use

// ===========================
// DRAFT TIMER
// ===========================
function startTimer() {
    if (timerInterval) clearInterval(timerInterval);

    timeRemaining = 30;
    pickStartTime = Date.now();

    timerInterval = setInterval(() => {
        timeRemaining--;
        updateTimerDisplay();

        if (timeRemaining <= 0) {
            clearInterval(timerInterval);
            playSound('error');
            showToast('⏰ הזמן תם!', 'error');
        }
    }, 1000);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function updateTimerDisplay() {
    const display = getElement('timer-display');
    if (!display) return;

    display.textContent = timeRemaining + 's';
    display.className = 'timer-display';

    if (timeRemaining <= 5) {
        display.classList.add('critical');
    } else if (timeRemaining <= 10) {
        display.classList.add('warning');
    }
}

function toggleTimer() {
    timerEnabled = !timerEnabled;
    const btn = getElement('timer-toggle-btn');
    if (btn) {
        btn.textContent = timerEnabled ? '⏱️ טיימר מופעל' : '⏱️ טיימר כבוי';
        btn.classList.toggle('active', timerEnabled);
    }

    if (!timerEnabled) {
        stopTimer();
    }

    showToast(timerEnabled ? 'טיימר הופעל (30 שניות)' : 'טיימר כובה', 'info');
    renderDraft();
}

// ===========================
// PICK HISTORY & TIMELINE
// ===========================
function toggleHistory() {
    showHistory = !showHistory;
    renderDraft();
}

async function undoPickAtIndex(index) {
    if (myRole !== ROLES.ADMIN) return;
    if (isProcessing) return;

    const confirmed = await showConfirm(`לבטל את הבחירה #${index + 1}?`, "↩️");
    if (!confirmed) return;

    isProcessing = true;
    showLoading();

    // Undo all picks from this index onwards
    const picksToUndo = gameState.pickHistory.slice(index);
    let newTeams = [...gameState.teams.map(t => [...t])];
    let newPlayers = [...gameState.players];

    // Remove all players that were picked after this point
    picksToUndo.forEach(pick => {
        newTeams[pick.teamIdx] = newTeams[pick.teamIdx].filter(p => p !== pick.player);
        if (!newPlayers.includes(pick.player)) {
            newPlayers.push(pick.player);
        }
    });

    const newHistory = gameState.pickHistory.slice(0, index);

    await updateFirebase({
        ...gameState,
        teams: newTeams,
        players: newPlayers,
        currentPickStep: index,
        pickHistory: newHistory,
        step: STEPS.DRAFT
    });

    hideLoading();
    showToast(`בוטלו ${picksToUndo.length} בחירות`, 'info');
    isProcessing = false;
}

// ===========================
// STATISTICS
// ===========================
function recordPickTime(playerName, capIdx) {
    if (pickStartTime) {
        const pickTime = (Date.now() - pickStartTime) / 1000; // seconds
        const captainName = gameState.sortedCaptains[capIdx];

        const pickData = {
            time: pickTime,
            captain: captainName,
            player: playerName,
            capIdx: capIdx
        };

        statistics.picks.push(pickData);
        statistics.totalPicks++;

        // Update fastest/slowest
        if (!statistics.fastestPick || pickTime < statistics.fastestPick.time) {
            statistics.fastestPick = pickData;
        }
        if (!statistics.slowestPick || pickTime > statistics.slowestPick.time) {
            statistics.slowestPick = pickData;
        }

        // Update captain stats
        if (!statistics.captainStats[capIdx]) {
            statistics.captainStats[capIdx] = { totalTime: 0, count: 0, name: captainName };
        }
        statistics.captainStats[capIdx].totalTime += pickTime;
        statistics.captainStats[capIdx].count++;

        pickStartTime = null;
    }
}

function getAveragePickTime() {
    if (statistics.picks.length === 0) return 0;
    const sum = statistics.picks.reduce((a, b) => a + b.time, 0);
    return (sum / statistics.picks.length).toFixed(1);
}

function getFastestCaptain() {
    const captains = Object.values(statistics.captainStats);
    if (captains.length === 0) return null;

    return captains.reduce((fastest, cap) => {
        const avgTime = cap.totalTime / cap.count;
        const fastestAvg = fastest ? (fastest.totalTime / fastest.count) : Infinity;
        return avgTime < fastestAvg ? cap : fastest;
    }, null);
}

function getSlowestCaptain() {
    const captains = Object.values(statistics.captainStats);
    if (captains.length === 0) return null;

    return captains.reduce((slowest, cap) => {
        const avgTime = cap.totalTime / cap.count;
        const slowestAvg = slowest ? (slowest.totalTime / slowest.count) : 0;
        return avgTime > slowestAvg ? cap : slowest;
    }, null);
}

function renderStatistics() {
    const statsPanel = getElement('stats-panel');
    if (!statsPanel) return;

    // Only show stats if we have picks
    if (statistics.totalPicks === 0) {
        statsPanel.style.display = 'none';
        return;
    }

    statsPanel.style.display = 'block';
    const avgTime = getAveragePickTime();
    const fastestCap = getFastestCaptain();
    const slowestCap = getSlowestCaptain();

    let html = `<h4 style="color: var(--sky-blue); margin-top: 0;">📊 סטטיסטיקות</h4>`;

    html += `
        <div class="stat-row">
            <span class="stat-label">סה"כ בחירות:</span>
            <span class="stat-value">${statistics.totalPicks}</span>
        </div>
        <div class="stat-row">
            <span class="stat-label">זמן ממוצע לבחירה:</span>
            <span class="stat-value">${avgTime}s</span>
        </div>
    `;

    // Fastest pick
    if (statistics.fastestPick) {
        html += `
            <div class="stat-row">
                <span class="stat-label">⚡ הבחירה המהירה ביותר:</span>
                <span class="stat-value">${statistics.fastestPick.time.toFixed(1)}s</span>
            </div>
            <div class="stat-row" style="padding-right: 20px; font-size: 0.85rem;">
                <span class="stat-label">${statistics.fastestPick.captain} ← ${statistics.fastestPick.player}</span>
                <span></span>
            </div>
        `;
    }

    // Slowest pick
    if (statistics.slowestPick) {
        html += `
            <div class="stat-row">
                <span class="stat-label">🐌 הבחירה האיטית ביותר:</span>
                <span class="stat-value">${statistics.slowestPick.time.toFixed(1)}s</span>
            </div>
            <div class="stat-row" style="padding-right: 20px; font-size: 0.85rem;">
                <span class="stat-label">${statistics.slowestPick.captain} ← ${statistics.slowestPick.player}</span>
                <span></span>
            </div>
        `;
    }

    // Fastest captain
    if (fastestCap) {
        const fastestAvg = (fastestCap.totalTime / fastestCap.count).toFixed(1);
        html += `
            <div class="stat-row">
                <span class="stat-label">🏃 הקפטן המהיר ביותר:</span>
                <span class="stat-value">${fastestAvg}s</span>
            </div>
            <div class="stat-row" style="padding-right: 20px; font-size: 0.85rem;">
                <span class="stat-label">${fastestCap.name} (${fastestCap.count} בחירות)</span>
                <span></span>
            </div>
        `;
    }

    // Slowest captain
    if (slowestCap && Object.keys(statistics.captainStats).length > 1) {
        const slowestAvg = (slowestCap.totalTime / slowestCap.count).toFixed(1);
        html += `
            <div class="stat-row">
                <span class="stat-label">🤔 הקפטן האיטי ביותר:</span>
                <span class="stat-value">${slowestAvg}s</span>
            </div>
            <div class="stat-row" style="padding-right: 20px; font-size: 0.85rem;">
                <span class="stat-label">${slowestCap.name} (${slowestCap.count} בחירות)</span>
                <span></span>
            </div>
        `;
    }

    statsPanel.innerHTML = html;
}

// Keyboard shortcuts removed - app is used on mobile

// ===========================
// HISTORICAL PLAYER STATISTICS
// ===========================

// Round calculation - picks 0-2 = round 1, picks 3-5 = round 2, etc.
function getRoundFromPickStep(pickStep) {
    return Math.floor(pickStep / 3) + 1;
}

// Enrich pick history with captain names
function enrichPickHistory(pickHistory) {
    return pickHistory.map(pick => ({
        ...pick,
        captain: gameState.sortedCaptains[pick.teamIdx]
    }));
}

// Save completed game to Firebase
async function saveCompletedGame() {
    const gameId = Date.now().toString();
    const gameData = {
        gameId: gameId,
        timestamp: Date.now(),
        date: new Date().toISOString().split('T')[0],
        captains: gameState.initialCaptains,
        captainOrder: gameState.sortedCaptains,
        teams: gameState.teams,
        teamColors: gameState.teamColors,
        pickHistory: enrichPickHistory(gameState.pickHistory)
    };

    try {
        await db.ref(`completed_games/${gameId}`).set(gameData);
        await updatePlayerStatistics(gameData);
    } catch (e) {
        console.error("Error saving game history:", e);
        showToast('שגיאה בשמירת ההיסטוריה', 'error');
    }
}

// Update player statistics from completed game
async function updatePlayerStatistics(gameData) {
    const allPlayersInGame = new Set();

    for (const pick of gameData.pickHistory) {
        const playerName = pick.player;
        const captainName = pick.captain;
        const pickPosition = pick.pickStep;
        const round = getRoundFromPickStep(pickPosition);

        allPlayersInGame.add(playerName);

        const statsRef = db.ref(`player_stats/${playerName}`);
        const snapshot = await statsRef.once('value');
        const currentStats = snapshot.val() || {
            totalGames: 0,
            pickPositions: [],
            picksByRound: {},
            captainRelationships: {},
            firstSeen: gameData.timestamp
        };

        currentStats.totalGames++;
        currentStats.pickPositions.push(pickPosition);
        currentStats.lastSeen = gameData.timestamp;
        currentStats.picksByRound[round] = (currentStats.picksByRound[round] || 0) + 1;
        currentStats.captainRelationships[captainName] =
            (currentStats.captainRelationships[captainName] || 0) + 1;

        const sum = currentStats.pickPositions.reduce((a, b) => a + b, 0);
        currentStats.averagePick = parseFloat((sum / currentStats.pickPositions.length).toFixed(1));

        await statsRef.set(currentStats);
    }

    // Update all_players registry
    const updates = {};
    for (const playerName of allPlayersInGame) {
        updates[playerName] = true;
    }
    await db.ref('all_players').update(updates);
}

// Get player stats from Firebase
async function getPlayerStats(playerName) {
    const snapshot = await db.ref(`player_stats/${playerName}`).once('value');
    return snapshot.val();
}

// Format stats for player card display
function formatPlayerStats(stats) {
    if (!stats) return '';

    const roundPercentages = {};
    for (const round in stats.picksByRound) {
        roundPercentages[round] = Math.round((stats.picksByRound[round] / stats.totalGames) * 100);
    }

    const captains = Object.entries(stats.captainRelationships || {});
    captains.sort((a, b) => b[1] - a[1]);
    const topCaptain = captains.length > 0 ? captains[0] : null;

    return `
        <div class="player-stats-overlay">
            <div class="stat-line">
                <span>📊 ממוצע: ${stats.averagePick}</span>
                <span>משחקים: ${stats.totalGames}</span>
            </div>
            <div class="stat-line">
                <span>🎯 R1: ${roundPercentages[1] || 0}%</span>
                <span>R2: ${roundPercentages[2] || 0}%</span>
            </div>
            ${topCaptain ? `<div class="captain-fav">👤 ${topCaptain[0]}: ${topCaptain[1]}x</div>` : ''}
        </div>
    `;
}

// ===========================
// STATISTICS PAGE
// ===========================

// View statistics page
async function viewStatistics() {
    const prevSection = gameState.step || 'setup';
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    getElement('statistics').classList.add('active');
    getElement('statistics').dataset.previousSection = prevSection;

    // Show admin controls if user is admin
    const adminControls = getElement('admin-stats-controls');
    if (adminControls) {
        adminControls.style.display = myRole === ROLES.ADMIN ? 'block' : 'none';
    }

    await renderStatisticsList();
}

// Close statistics and return
function closeStatistics() {
    const statsSection = getElement('statistics');
    const prevSection = statsSection.dataset.previousSection || gameState.step || 'setup';

    statsSection.classList.remove('active');
    const targetSection = getElement(prevSection);
    if (targetSection) {
        targetSection.classList.add('active');
    } else {
        // Fallback to setup
        getElement('setup').classList.add('active');
    }
}

// Render statistics list
async function renderStatisticsList(sortBy = 'averagePick') {
    showLoading();

    const statsSnapshot = await db.ref('player_stats').once('value');
    const allStats = statsSnapshot.val() || {};

    let statsArray = Object.entries(allStats).map(([name, stats]) => ({
        name,
        ...stats
    }));

    // Sort
    if (sortBy === 'averagePick') {
        statsArray.sort((a, b) => (a.averagePick || 999) - (b.averagePick || 999));
    } else if (sortBy === 'totalGames') {
        statsArray.sort((a, b) => b.totalGames - a.totalGames);
    } else if (sortBy === 'name') {
        statsArray.sort((a, b) => a.name.localeCompare(b.name));
    }

    const html = statsArray.map(player => `
        <div class="player-stat-card">
            <h3>${player.name}</h3>
            <div class="stat-grid">
                <div class="stat-item">
                    <div class="stat-label">משחקים</div>
                    <div class="stat-value">${player.totalGames}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">ממוצע בחירה</div>
                    <div class="stat-value">${player.averagePick}</div>
                </div>
            </div>

            <div class="round-breakdown">
                <h4>התפלגות סיבובים</h4>
                ${renderRoundBreakdown(player)}
            </div>

            <div class="captain-preferences">
                <h4>קפטנים שבחרו</h4>
                ${renderCaptainPreferences(player)}
            </div>
        </div>
    `).join('');

    setHTML('player-stats-list', html || '<p>אין נתונים עדיין</p>');
    hideLoading();
}

function renderRoundBreakdown(player) {
    const rounds = Object.entries(player.picksByRound || {});
    if (rounds.length === 0) return '<p>אין נתונים</p>';

    return rounds.map(([round, count]) => {
        const percentage = Math.round((count / player.totalGames) * 100);
        return `
            <div class="round-bar">
                <span>סיבוב ${round}</span>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${percentage}%"></div>
                </div>
                <span>${count}/${player.totalGames} (${percentage}%)</span>
            </div>
        `;
    }).join('');
}

function renderCaptainPreferences(player) {
    const captains = Object.entries(player.captainRelationships || {});
    if (captains.length === 0) return '<p>אין נתונים</p>';

    captains.sort((a, b) => b[1] - a[1]);

    return captains.map(([captain, count]) => `
        <div class="captain-stat">
            <span>${captain}</span>
            <span class="captain-count">${count}x</span>
        </div>
    `).join('');
}

function sortStatsBy(criteria) {
    renderStatisticsList(criteria);
}

// ===========================
// ADMIN STATS MANAGEMENT
// ===========================

// Recalculate all statistics from completed games
async function recalculateAllStats() {
    if (myRole !== ROLES.ADMIN) {
        await showAlert("רק המנהל יכול לבצע פעולה זו!", "🚫");
        return;
    }

    const confirmed = await showConfirm("לחשב מחדש את כל הסטטיסטיקות מההיסטוריה?", "🔄");
    if (!confirmed) return;

    showLoading();

    try {
        const gamesSnapshot = await db.ref('completed_games').once('value');
        const allGames = gamesSnapshot.val() || {};

        // Clear existing stats
        await db.ref('player_stats').set({});
        await db.ref('all_players').set({});

        // Reprocess all games
        for (const gameId in allGames) {
            await updatePlayerStatistics(allGames[gameId]);
        }

        await renderStatisticsList();
        hideLoading();
        showToast('סטטיסטיקות חושבו מחדש בהצלחה! ✅', 'success');
    } catch (e) {
        console.error("Error recalculating stats:", e);
        hideLoading();
        showToast('שגיאה בחישוב מחדש', 'error');
    }
}

// Clear all history and statistics
async function clearAllHistory() {
    if (myRole !== ROLES.ADMIN) {
        await showAlert("רק המנהל יכול לבצע פעולה זו!", "🚫");
        return;
    }

    const confirmed = await showConfirm("למחוק את כל ההיסטוריה והסטטיסטיקות? פעולה זו בלתי הפיכה!", "⚠️");
    if (!confirmed) return;

    const doubleConfirm = await showConfirm("האם אתה בטוח? כל הנתונים ימחקו לצמיתות!", "🗑️");
    if (!doubleConfirm) return;

    showLoading();

    try {
        await db.ref('completed_games').set({});
        await db.ref('player_stats').set({});
        await db.ref('all_players').set({});

        await renderStatisticsList();
        hideLoading();
        showToast('כל ההיסטוריה נמחקה', 'success');
    } catch (e) {
        console.error("Error clearing history:", e);
        hideLoading();
        showToast('שגיאה במחיקת נתונים', 'error');
    }
}

// ===========================
// GAME FLOW FUNCTIONS
// ===========================
async function goToLottery() {
    if (myRole !== ROLES.ADMIN) {
        await showAlert("רק המנהל יכול להתחיל משחק!", "🚫");
        return;
    }

    if (isProcessing) return;
    isProcessing = true;
    showLoading();

    const rawPlayers = getValue('player-input');
    const rawCaps = getValue('cap-input');

    if (!rawCaps.includes(',')) {
        await showAlert("נא להפריד 3 קפטנים בפסיק", "⚠️");
        hideLoading();
        isProcessing = false;
        return;
    }

    const initialCaptains = rawCaps.split(',').map(s => s.trim());
    let tempPlayers = rawPlayers
        .replace(/^\d+[:.]?/, '')
        .split(/[,\n]/)
        .map(s => s.trim())
        .filter(s => s.length > 0);

    const players = tempPlayers.filter(p => !initialCaptains.includes(p));
    const lotteryPool = shuffleArray([0, 1, 2]);

    await updateFirebase({
        ...DEFAULT_STATE,
        step: STEPS.LOTTERY,
        players: players,
        initialCaptains: initialCaptains,
        lotteryPool: lotteryPool
    });

    hideLoading();
    playSound('success');
    showToast('המשחק מתחיל! 🎯', 'success');
    isProcessing = false;
}

async function shoot() {
    if (!checkTurn('lottery')) {
        await showAlert("זה לא התור שלך! חכה שהקפטן הנכון יבעט.", "⏸️");
        return;
    }

    if (isProcessing) return;
    if (gameState.lotteryClickCount >= 3) return;

    isProcessing = true;

    const clickIndex = gameState.lotteryClickCount;
    const pos = gameState.lotteryPool[clickIndex];
    const capName = gameState.initialCaptains[clickIndex];

    playSound('kick');
    playBallAnimation(pos);
    await new Promise(resolve => setTimeout(resolve, ANIMATION_DURATION));

    // Play result sound
    if (pos === LOTTERY_POSITIONS.TOP_CORNER || pos === LOTTERY_POSITIONS.CENTER) {
        playSound('goal');
    } else {
        playSound('miss');
    }

    const newSortedCaptains = [...gameState.sortedCaptains];
    newSortedCaptains[pos] = capName;

    const resultText = LOTTERY_RESULT_MESSAGES[pos];
    const newResults = [...gameState.lotteryResults, `${capName}: ${resultText}`];

    await updateFirebase({
        ...gameState,
        sortedCaptains: newSortedCaptains,
        lotteryResults: newResults,
        lotteryClickCount: clickIndex + 1
    });

    isProcessing = false;
}

function playBallAnimation(position) {
    const ball = getElement('kicking-ball');
    if (!ball) return;

    const animationMap = {
        [LOTTERY_POSITIONS.TOP_CORNER]: ANIMATION_CLASSES.TOP_CORNER,
        [LOTTERY_POSITIONS.CENTER]: ANIMATION_CLASSES.CENTER,
        [LOTTERY_POSITIONS.MISS]: ANIMATION_CLASSES.MISS
    };

    const animClass = animationMap[position];
    ball.classList.remove(
        ANIMATION_CLASSES.TOP_CORNER,
        ANIMATION_CLASSES.CENTER,
        ANIMATION_CLASSES.MISS
    );
    void ball.offsetWidth; // Force reflow
    ball.classList.add(animClass);
}

async function startDraft() {
    if (myRole !== ROLES.ADMIN) return;
    if (isProcessing) return;

    isProcessing = true;

    await updateFirebase({
        ...gameState,
        step: STEPS.DRAFT,
        teamColors: ["", "", ""],
        colorPickStep: 0
    });

    isProcessing = false;
}

async function pickPlayer(playerName) {
    if (!checkTurn('draft')) {
        await showAlert("היי! זה לא התור שלך לבחור שחקן.", "⏸️");
        return;
    }

    if (isProcessing) return;
    isProcessing = true;

    try {
        const capIdx = DRAFT_ORDER[gameState.currentPickStep];

        // Record pick time for statistics
        recordPickTime(playerName, capIdx);
        stopTimer();

        // Add visual feedback to picked card
        const cards = document.querySelectorAll('.player-card');
        cards.forEach(card => {
            if (card.textContent === playerName) {
                card.classList.add('picking');
            }
        });

        playSound('pick');
        let newTeams = gameState.teams.map((team, idx) =>
            idx === capIdx ? [...team, playerName] : [...team]
        );

        let newPlayers = gameState.players.filter(pl => pl !== playerName);
        let newPickStep = gameState.currentPickStep + 1;

        const newHistory = [...gameState.pickHistory, {
            player: playerName,
            teamIdx: capIdx,
            pickStep: gameState.currentPickStep
        }];

        let nextStep = STEPS.DRAFT;

        // Auto-assign last player
        if (newPlayers.length === 1) {
            const lastPlayer = newPlayers[0];
            const lastPlayerCapIdx = DRAFT_ORDER[newPickStep];

            newTeams = newTeams.map((team, idx) =>
                idx === lastPlayerCapIdx ? [...team, lastPlayer] : [...team]
            );

            newPlayers = [];
            nextStep = STEPS.COLORS;
        }

        await updateFirebase({
            ...gameState,
            teams: newTeams,
            players: newPlayers,
            currentPickStep: newPickStep,
            pickHistory: newHistory,
            step: nextStep
        });

        if (nextStep === STEPS.COLORS) {
            showToast('כל השחקנים נבחרו! 🎉', 'success');
            playSound('success');
            stopTimer();
        }
    } catch (e) {
        console.error("pickPlayer error:", e);
        showToast('שגיאה בבחירה - נסה שוב', 'error');
    } finally {
        isProcessing = false;
    }
}

async function undoLastPick() {
    if (myRole !== ROLES.ADMIN) {
        await showAlert("רק המנהל יכול לבטל בחירה!", "🚫");
        return;
    }

    if (isProcessing) return;
    if (gameState.pickHistory.length === 0) return;

    const confirmed = await showConfirm("לבטל את הבחירה האחרונה?", "↩️");
    if (!confirmed) return;

    isProcessing = true;
    showLoading();

    const lastPick = gameState.pickHistory[gameState.pickHistory.length - 1];

    const newTeams = gameState.teams.map((team, idx) =>
        idx === lastPick.teamIdx ? team.filter(p => p !== lastPick.player) : [...team]
    );

    const newPlayers = [...gameState.players, lastPick.player];
    const newHistory = gameState.pickHistory.slice(0, -1);

    await updateFirebase({
        ...gameState,
        teams: newTeams,
        players: newPlayers,
        currentPickStep: lastPick.pickStep,
        pickHistory: newHistory,
        step: STEPS.DRAFT
    });

    hideLoading();
    showToast('הבחירה בוטלה', 'info');
    isProcessing = false;
}

async function pickColor(teamIdx, color, emoji) {
    if (!checkTurn('color')) {
        await showAlert("חכה לתור שלך לבחור צבע!", "⏸️");
        return;
    }

    if (isProcessing) return;
    isProcessing = true;

    playSound('pick');

    const newTeamColors = [...gameState.teamColors];
    newTeamColors[teamIdx] = emoji + " " + color;

    const nextColorStep = gameState.colorPickStep + 1;

    await updateFirebase({
        ...gameState,
        teamColors: newTeamColors,
        colorPickStep: nextColorStep
    });

    if (nextColorStep >= 3) {
        showToast('כל הצבעים נבחרו! 🎨', 'success');
        playSound('success');
    }

    isProcessing = false;
}

async function finishColors() {
    if (myRole !== ROLES.ADMIN) return;

    showLoading();
    await saveCompletedGame();
    await updateFirebase({ ...gameState, step: STEPS.FINAL });
    hideLoading();
    showToast('המשחק נשמר בהיסטוריה! 🎉', 'success');
}

async function copyFinal() {
    let text = "*🏆 SITTON SOCCER - כוחות 🏆*\n\n";

    for (let i = 0; i < 3; i++) {
        const color = gameState.teamColors[i] || "⚪";
        const capName = gameState.sortedCaptains[i] || "חסר שם";
        const players = gameState.teams[i] || [];

        const playersList = players.length > 0 ? players.join(", ") : "(אין שחקנים)";
        text += `${color} - ${capName}: ${playersList}\n\n`;
    }

    try {
        await navigator.clipboard.writeText(text);
        showToast("הועתק ללוח! 📋", "success");
        playSound('success');
    } catch (e) {
        await showAlert("לא הצלחתי להעתיק. נסה שוב.", "❌");
    }
}

async function resetGame() {
    const confirmed = await showConfirm("בטוח שאתה רוצה לאפס את המשחק? כל הנתונים יימחקו!", "🔄");
    if (confirmed) {
        showLoading();
        await gameRef.set(null);
        location.reload();
    }
}

// ===========================
// UI RENDERING
// ===========================
function updateLoginButtons() {
    if (gameState.initialCaptains && gameState.initialCaptains.length === 3) {
        setText('btn-cap-0', "אני " + gameState.initialCaptains[0]);
        setText('btn-cap-1', "אני " + gameState.initialCaptains[1]);
        setText('btn-cap-2', "אני " + gameState.initialCaptains[2]);
        hideElement('waiting-msg');
    } else {
        setText('btn-cap-0', "קפטן 1 (ממתין לשם...)");
        setText('btn-cap-1', "קפטן 2 (ממתין לשם...)");
        setText('btn-cap-2', "קפטן 3 (ממתין לשם...)");
        showElement('waiting-msg');
    }
}

function renderUI() {
    // Show/hide reset button for admin
    if (myRole === ROLES.ADMIN) {
        showElement('admin-reset-btn');
    } else {
        hideElement('admin-reset-btn');
    }

    if (!gameState.step) return;

    // Show active section
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    const section = getElement(gameState.step);
    if (section) section.classList.add('active');

    // Render based on current step
    switch (gameState.step) {
        case STEPS.LOTTERY:
            renderLottery();
            break;
        case STEPS.DRAFT:
            renderDraft();
            break;
        case STEPS.COLORS:
            renderColors();
            break;
        case STEPS.FINAL:
            renderFinal();
            break;
    }
}

function renderLottery() {
    const instruction = gameState.lotteryClickCount < 3
        ? `${gameState.initialCaptains[gameState.lotteryClickCount] || ''}, תבעט!`
        : "הגרלה הסתיימה";
    setText('lottery-instruction', instruction);

    const resultsHTML = gameState.lotteryResults.map(r => `<div>${r}</div>`).join('');
    setHTML('lottery-results', resultsHTML);

    if (gameState.lotteryClickCount === 3 && myRole === ROLES.ADMIN) {
        showElement('start-draft-btn');
    } else {
        hideElement('start-draft-btn');
    }

    const ball = getElement('kicking-ball');
    if (gameState.lotteryClickCount < 3 && ball) {
        ball.className = 'ball';
    }
}

async function renderDraft() {
    const currentCap = gameState.sortedCaptains[DRAFT_ORDER[gameState.currentPickStep]] || "";
    const isMyTurn = checkTurn('draft');
    const turnDisplay = getElement('turn-display');

    if (turnDisplay) {
        turnDisplay.innerText = "תור: " + currentCap;

        if (isMyTurn) {
            turnDisplay.style.background = "#27ae60";
            turnDisplay.classList.add('my-turn');
            turnDisplay.innerHTML = "תור: " + currentCap + " <span style='font-size:1.5rem'>✨ תורך!</span>";

            // Start timer if enabled and it's my turn
            if (timerEnabled && !timerInterval && !isProcessing) {
                startTimer();
            }

            // Start tracking pick time for statistics
            if (!pickStartTime) {
                pickStartTime = Date.now();
            }
        } else {
            turnDisplay.style.background = "#e74c3c";
            turnDisplay.classList.remove('my-turn');
            turnDisplay.innerHTML = "תור: " + currentCap;
        }
    }

    // Render available players — first render immediately with no stats (fast),
    // then fetch all stats in a single batch and re-render with stats.
    const disabledClass = !isMyTurn ? 'disabled' : '';
    const placeholderCards = gameState.players.map(p =>
        `<div class="player-card ${disabledClass}" onclick="pickPlayer('${p}')">
            <div class="player-name">${p}</div>
        </div>`
    );
    setHTML('available-players', placeholderCards.join(''));

    // Fetch all player stats in parallel (one Promise.all, not sequential)
    const statsResults = await Promise.all(gameState.players.map(p => getPlayerStats(p)));
    const playerCards = gameState.players.map((p, i) => {
        const stats = statsResults[i];
        const statsHTML = formatPlayerStats(stats);
        const hasStats = stats !== null;
        return `
            <div class="player-card ${hasStats ? 'with-stats' : ''} ${disabledClass}" onclick="pickPlayer('${p}')">
                <div class="player-name">${p}</div>
                ${statsHTML}
            </div>
        `;
    });
    setHTML('available-players', playerCards.join(''));

    // Show/hide timer
    const timerContainer = getElement('timer-container');
    if (timerContainer) {
        if (timerEnabled && isMyTurn) {
            timerContainer.style.display = 'block';
            updateTimerDisplay();
        } else {
            timerContainer.style.display = 'none';
        }
    }

    // Show/hide history
    const historyPanel = getElement('history-panel');
    if (historyPanel) {
        if (showHistory && gameState.pickHistory.length > 0) {
            const historyHTML = gameState.pickHistory.map((pick, idx) => {
                const capName = gameState.sortedCaptains[pick.teamIdx];
                return `
                    <div class="history-item">
                        <div class="history-number">${idx + 1}</div>
                        <div class="history-details">
                            ${capName} ← <strong>${pick.player}</strong>
                        </div>
                        ${myRole === ROLES.ADMIN ? `<button class="history-undo-btn" onclick="undoPickAtIndex(${idx})">↩️</button>` : ''}
                    </div>
                `;
            }).reverse().join('');
            historyPanel.innerHTML = historyHTML;
            historyPanel.style.display = 'block';
        } else {
            historyPanel.style.display = 'none';
        }
    }

    // Update history toggle button
    const historyToggle = getElement('history-toggle');
    if (historyToggle) {
        historyToggle.textContent = showHistory ? '📜 הסתר היסטוריה' : `📜 הצג היסטוריה (${gameState.pickHistory.length})`;
        historyToggle.style.display = gameState.pickHistory.length > 0 ? 'inline-block' : 'none';
    }

    // Show/hide timer toggle button (only for admin)
    const timerToggleBtn = getElement('timer-toggle-btn');
    if (timerToggleBtn) {
        if (myRole === ROLES.ADMIN) {
            timerToggleBtn.style.display = 'inline-block';
        } else {
            timerToggleBtn.style.display = 'none';
        }
    }

    // Show undo button
    if (gameState.pickHistory.length > 0 && myRole === ROLES.ADMIN) {
        showElement('undo-btn');
    } else {
        hideElement('undo-btn');
    }

    // Render teams
    for (let i = 0; i < 3; i++) {
        setText(`cap-${i}-name`, gameState.sortedCaptains[i] || "");

        const teamPlayersHTML = (gameState.teams[i] || []).map((p, idx) =>
            `<div class="team-player">${idx + 1}. ${p}</div>`
        ).join('');
        setHTML(`team-${i}-list`, teamPlayersHTML);
    }

    // Render statistics
    renderStatistics();
}

function renderColors() {
    const currentPickerIdx = COLOR_DRAFT_ORDER[gameState.colorPickStep];
    const isFinished = gameState.colorPickStep >= 3;

    for (let i = 0; i < 3; i++) {
        setText(`color-cap-${i}-name`, gameState.sortedCaptains[i]);

        const currentColor = gameState.teamColors[i];

        if (currentColor && currentColor !== "") {
            setHTML(`color-select-${i}`, `<div class="selected-color">${currentColor}</div>`);
        } else if (i === currentPickerIdx && !isFinished) {
            if (myRole === currentPickerIdx || myRole === ROLES.ADMIN) {
                let buttonsHtml = '<div class="color-buttons">';
                AVAILABLE_COLORS.forEach(opt => {
                    const isTaken = gameState.teamColors.some(taken => taken.includes(opt.name));
                    if (!isTaken) {
                        buttonsHtml += `<button class="color-btn" onclick="pickColor(${i}, '${opt.name}', '${opt.emoji}')">${opt.emoji}</button>`;
                    }
                });
                buttonsHtml += '</div>';
                setHTML(`color-select-${i}`, buttonsHtml);
            } else {
                setHTML(`color-select-${i}`, `<div style="color:yellow">הוא בוחר עכשיו...</div>`);
            }
        } else {
            setHTML(`color-select-${i}`, `<div style="opacity:0.5;">ממתין לתורו...</div>`);
        }
    }

    if (isFinished && myRole === ROLES.ADMIN) {
        showElement('finish-colors-btn');
    } else {
        hideElement('finish-colors-btn');
    }
}

function renderFinal() {
    for (let i = 0; i < 3; i++) {
        setText(`final-cap-${i}-name`, gameState.sortedCaptains[i] || "");
        setText(`final-team-${i}-color`, gameState.teamColors[i] || "");

        const playersHTML = (gameState.teams[i] || []).map((p, idx) =>
            `<div>${idx + 1}. ${p}</div>`
        ).join('');
        setHTML(`final-team-${i}-list`, playersHTML);
    }
}

// ===========================
// MOBILE TOUCH FIX
// ===========================
// Delegate touch events on player cards to avoid 300ms iOS click delay
// and prevent ghost taps from propagating.
function setupPlayerCardTouchDelegation() {
    const container = document.getElementById('available-players');
    if (!container) return;

    let touchMoved = false;

    container.addEventListener('touchstart', function(e) {
        touchMoved = false;
    }, { passive: true });

    container.addEventListener('touchmove', function(e) {
        touchMoved = true;
    }, { passive: true });

    container.addEventListener('touchend', function(e) {
        if (touchMoved) return; // User was scrolling, not tapping
        const card = e.target.closest('.player-card');
        if (!card || card.classList.contains('disabled')) return;
        e.preventDefault(); // Prevent the 300ms delayed click
        const onclick = card.getAttribute('onclick');
        if (onclick) {
            // Extract player name from onclick="pickPlayer('NAME')"
            const match = onclick.match(/pickPlayer\('(.+)'\)/);
            if (match) pickPlayer(match[1]);
        }
    }, { passive: false });
}

// ===========================
// INITIALIZE ON LOAD
// ===========================
document.addEventListener('DOMContentLoaded', () => {
    initializeFirebase();
    setupPlayerCardTouchDelegation();

    // Check for localStorage backup
    const backup = loadFromLocalStorage();
    if (backup && !gameState.step) {
        showConfirm('נמצא גיבוי מקומי. לשחזר?', '💾').then(restore => {
            if (restore) {
                gameState = backup.gameState;
                myRole = backup.myRole;
                renderUI();
                showToast('המשחק שוחזר מגיבוי! ✅', 'success');
            }
        });
    }
});

// ===========================
// EXPOSE FUNCTIONS TO WINDOW
// ===========================
window.setIdentity = setIdentity;
window.goToLottery = goToLottery;
window.shoot = shoot;
window.startDraft = startDraft;
window.pickPlayer = pickPlayer;
window.undoLastPick = undoLastPick;
window.pickColor = pickColor;
window.finishColors = finishColors;
window.copyFinal = copyFinal;
window.resetGame = resetGame;
window.toggleSound = toggleSound;
window.toggleHistory = toggleHistory;
window.toggleTimer = toggleTimer;
window.undoPickAtIndex = undoPickAtIndex;
window.viewStatistics = viewStatistics;
window.closeStatistics = closeStatistics;
window.sortStatsBy = sortStatsBy;
window.recalculateAllStats = recalculateAllStats;
window.clearAllHistory = clearAllHistory;
