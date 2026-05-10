import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, onValue, push, set, get, update, remove
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";
import { DEFAULT_PLAYERS } from "./players.js";

// ============================================================
// INIT
// ============================================================
const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);

// ============================================================
// COMMISSIONER PASSWORD
// Change this to whatever you want!
// ============================================================
const COMMISSIONER_PASSWORD = "admin1234";

// ============================================================
// STATE
// ============================================================
let currentUser    = null; // { team, isCommissioner }
let draftConfig    = null; // loaded from Firebase
let pickQueue      = [];   // local pick queue
let timerInterval  = null;
let timerValue     = 90;
let allPicks       = [];
let activeRound    = 1;
let lastPickCount  = 0;

// ============================================================
// SCREEN HELPERS
// ============================================================
window.showScreen = function(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
};

// ============================================================
// LOGIN
// ============================================================
window.handleLogin = async function() {
  const name = document.getElementById('loginTeamName').value.trim();
  const pw   = document.getElementById('loginPassword').value.trim();
  const err  = document.getElementById('loginError');

  if (!name) { err.textContent = 'Bitte Team-Namen eingeben.'; return; }

  const configSnap = await get(ref(db, 'draftConfig'));
  const config = configSnap.val();

  if (!config) {
    err.textContent = 'Kein Draft konfiguriert. Bitte Commissioner starten.';
    return;
  }

  // Find team
  const teams = config.teams || [];
  const team = teams.find(t => t.name.toLowerCase() === name.toLowerCase());

  if (!team) {
    err.textContent = `Team "${name}" nicht gefunden. Frage den Commissioner.`;
    return;
  }
  if (team.password && team.password !== pw) {
    err.textContent = 'Falsches Passwort.';
    return;
  }

  currentUser = { team: team.name, isCommissioner: false };
  enterDraft();
};

window.showCommissionerLogin = function() {
  showScreen('commissionerScreen');
};

window.commLogin = function() {
  const pw  = document.getElementById('commPassword').value;
  const err = document.getElementById('commError');
  if (pw !== COMMISSIONER_PASSWORD) {
    err.textContent = 'Falsches Commissioner-Passwort.';
    return;
  }
  document.getElementById('commPanel').style.display = 'block';
  currentUser = { team: 'Commissioner', isCommissioner: true };
  loadCommissionerPanel();
};

// ============================================================
// COMMISSIONER PANEL
// ============================================================
function loadCommissionerPanel() {
  get(ref(db, 'draftConfig')).then(snap => {
    const c = snap.val();
    if (!c) {
      addTeamRow(); addTeamRow(); addTeamRow(); addTeamRow();
      document.getElementById('playerPool').value = DEFAULT_PLAYERS.join('
');
      return;
    }
    document.getElementById('numTeams').value   = c.numTeams   || 8;
    document.getElementById('numRounds').value  = c.numRounds  || 5;
    document.getElementById('timerSeconds').value = c.timerSeconds || 90;
    document.getElementById('snakeToggle').checked = c.snake ?? true;
    // Nutze DEFAULT_PLAYERS außer Commissioner hat eigene große Liste gespeichert
    const pool = (c.playerPool && c.playerPool.length > 20) ? c.playerPool : DEFAULT_PLAYERS;
    document.getElementById('playerPool').value = pool.join('
');

    const list = document.getElementById('teamList');
    list.innerHTML = '';
    (c.teams || []).forEach(t => addTeamRow(t.name, t.password));
  });
}

window.addTeamRow = function(name = '', pw = '') {
  const list = document.getElementById('teamList');
  const row = document.createElement('div');
  row.className = 'team-row';
  row.innerHTML = `
    <input type="text" placeholder="Team Name" value="${name}" class="team-name-input"/>
    <input type="text" placeholder="Passwort (optional)" value="${pw}" class="team-pw-input"/>
    <button class="remove-team" onclick="this.parentElement.remove()">×</button>
  `;
  list.appendChild(row);
};

window.saveDraftConfig = async function() {
  const numTeams     = parseInt(document.getElementById('numTeams').value) || 8;
  const numRounds    = parseInt(document.getElementById('numRounds').value) || 5;
  const timerSeconds = parseInt(document.getElementById('timerSeconds').value) || 90;
  const snake        = document.getElementById('snakeToggle').checked;
  const poolRaw      = document.getElementById('playerPool').value;
  const playerPool   = poolRaw.split('\n').map(s => s.trim()).filter(Boolean);

  const teamRows  = document.querySelectorAll('.team-row');
  const teams = [];
  teamRows.forEach(row => {
    const name = row.querySelector('.team-name-input').value.trim();
    const pw   = row.querySelector('.team-pw-input').value.trim();
    if (name) teams.push({ name, password: pw });
  });

  if (teams.length < 2) { alert('Mindestens 2 Teams erforderlich.'); return; }

  const config = { numTeams: teams.length, numRounds, timerSeconds, snake, playerPool, teams };

  await set(ref(db, 'draftConfig'), config);

  // Build snake draft order
  const order = buildSnakeOrder(teams.map(t => t.name), numRounds, snake);

  await set(ref(db, 'draftState'), {
    currentPick:   1,
    totalPicks:    teams.length * numRounds,
    onTheClock:    order[0],
    timerValue:    timerSeconds,
    timerRunning:  false,
    numTeams:      teams.length,
    numRounds,
    snake,
    order
  });

  alert('✅ Konfiguration gespeichert! Draft kann starten.');
};

window.resetDraft = async function() {
  if (!confirm('Wirklich alles zurücksetzen?')) return;
  await remove(ref(db, 'draftPicks'));
  const snap = await get(ref(db, 'draftConfig'));
  const c = snap.val();
  if (!c) return;
  const order = buildSnakeOrder(c.teams.map(t => t.name), c.numRounds, c.snake);
  await set(ref(db, 'draftState'), {
    currentPick: 1,
    totalPicks: c.numTeams * c.numRounds,
    onTheClock: order[0],
    timerValue: c.timerSeconds,
    timerRunning: false,
    numTeams: c.numTeams,
    numRounds: c.numRounds,
    snake: c.snake,
    order
  });
  alert('Draft zurückgesetzt.');
};

window.skipCurrentPick = async function() {
  await advancePick();
  alert('Pick übersprungen.');
};

// ============================================================
// SNAKE DRAFT ORDER BUILDER
// ============================================================
function buildSnakeOrder(teamNames, rounds, snake) {
  const order = [];
  for (let r = 0; r < rounds; r++) {
    const roundTeams = snake && r % 2 === 1
      ? [...teamNames].reverse()
      : [...teamNames];
    order.push(...roundTeams);
  }
  return order;
}

// ============================================================
// ENTER DRAFT
// ============================================================
function enterDraft() {
  showScreen('draftScreen');
  document.getElementById('userInfo').innerHTML =
    `Eingeloggt als <strong>${currentUser.team}</strong>`;

  if (currentUser.isCommissioner) {
    document.getElementById('userInfo').innerHTML =
      `<strong>⚙️ Commissioner</strong>`;
  }

  subscribeToFirebase();
  startLocalTimer();
}

// ============================================================
// FIREBASE SUBSCRIPTIONS
// ============================================================
function subscribeToFirebase() {
  // Config
  onValue(ref(db, 'draftConfig'), snap => {
    draftConfig = snap.val();
  });

  // Draft State
  onValue(ref(db, 'draftState'), snap => {
    const state = snap.val();
    if (!state) return;
    timerValue = state.timerValue ?? 90;

    const pickInfoEl = document.getElementById('currentPickInfo');
    const round = Math.ceil(state.currentPick / (state.numTeams || 1));
    const pickInRound = ((state.currentPick - 1) % (state.numTeams || 1)) + 1;

    pickInfoEl.innerHTML = `
      Runde ${round} · Pick ${state.currentPick}<br>
      <strong>On the Clock: ${state.onTheClock || '—'}</strong>
    `;

    renderDraftOrder(state);
    syncTimerDisplay();
  });

  // Picks
  onValue(ref(db, 'draftPicks'), snap => {
    const data = snap.val() || {};
    const picks = Object.values(data).map((p, i) => ({ ...p, pickNumber: i + 1 }));

    // Detect new pick for animation
    if (picks.length > lastPickCount && lastPickCount > 0) {
      const newest = picks[picks.length - 1];
      showPickAnimation(newest);
    }
    lastPickCount = picks.length;
    allPicks = picks;

    renderDraftBoard(picks);
    renderPlayers(picks.map(p => p.player));
    renderPickQueue();
  });
}

// ============================================================
// TIMER
// ============================================================
function startLocalTimer() {
  timerInterval = setInterval(() => {
    timerValue--;
    if (timerValue < 0) {
      timerValue = 0;
      // Auto skip: if commissioner or the user on the clock triggers it
      handleTimerExpired();
    }
    syncTimerDisplay();

    // Sync to Firebase every 5 seconds to keep OBS in sync
    if (timerValue % 5 === 0) {
      update(ref(db, 'draftState'), { timerValue });
    }
  }, 1000);
}

function syncTimerDisplay() {
  const el = document.getElementById('timer');
  if (!el) return;
  el.textContent = timerValue;
  el.classList.toggle('urgent', timerValue <= 10);
}

async function handleTimerExpired() {
  // Auto pick from queue if available
  const snap = await get(ref(db, 'draftState'));
  const state = snap.val();
  if (!state) return;
  if (state.onTheClock !== currentUser.team && !currentUser.isCommissioner) return;

  if (pickQueue.length > 0) {
    const draftedSnap = await get(ref(db, 'draftPicks'));
    const draftedPlayers = Object.values(draftedSnap.val() || {}).map(p => p.player);
    const next = pickQueue.find(p => !draftedPlayers.includes(p));
    if (next) {
      await executePick(next);
      pickQueue = pickQueue.filter(p => p !== next);
      renderPickQueue();
      return;
    }
  }

  // Skip pick
  if (currentUser.isCommissioner) {
    await advancePick();
  }
}

// ============================================================
// EXECUTE PICK
// ============================================================
async function executePick(player) {
  const snap  = await get(ref(db, 'draftState'));
  const state = snap.val();
  if (!state) return;

  // Only allow current team or commissioner
  if (!currentUser.isCommissioner && state.onTheClock !== currentUser.team) {
    alert('Du bist nicht dran!');
    return;
  }

  await push(ref(db, 'draftPicks'), {
    team: state.onTheClock,
    player,
    pick: state.currentPick,
    round: Math.ceil(state.currentPick / state.numTeams)
  });

  await advancePick();
}

async function advancePick() {
  const snap  = await get(ref(db, 'draftState'));
  const state = snap.val();
  if (!state) return;

  const nextPick = state.currentPick + 1;
  const nextTeam = state.order[nextPick - 1] || null;

  const newTimer = draftConfig?.timerSeconds ?? 90;
  timerValue = newTimer;

  await update(ref(db, 'draftState'), {
    currentPick:  nextPick,
    onTheClock:   nextTeam,
    timerValue:   newTimer,
    timerRunning: !!nextTeam
  });
}

// ============================================================
// RENDER DRAFT BOARD
// ============================================================
function renderDraftBoard(picks) {
  const tbody = document.getElementById('draftBoard');
  tbody.innerHTML = '';

  const numTeams = draftConfig?.teams?.length || 1;
  const numRounds = draftConfig?.numRounds || 1;

  // Build round tabs
  const tabsEl = document.getElementById('roundTabs');
  if (tabsEl.children.length !== numRounds) {
    tabsEl.innerHTML = '';
    for (let r = 1; r <= numRounds; r++) {
      const tab = document.createElement('div');
      tab.className = `round-tab${r === activeRound ? ' active' : ''}`;
      tab.textContent = `R${r}`;
      tab.onclick = () => {
        activeRound = r;
        document.querySelectorAll('.round-tab').forEach((t, i) => {
          t.classList.toggle('active', i + 1 === r);
        });
        renderDraftBoard(allPicks);
      };
      tabsEl.appendChild(tab);
    }
  }

  const filtered = picks.filter(p => p.round === activeRound);

  filtered.forEach(pick => {
    const row = document.createElement('tr');
    row.className = pick.team === currentUser?.team ? 'my-pick' : '';
    if (pick.pickNumber === picks.length) row.classList.add('new-pick');

    row.innerHTML = `
      <td>${pick.pickNumber}</td>
      <td>${pick.team}</td>
      <td>${pick.player}</td>
    `;
    tbody.appendChild(row);
  });
}

// ============================================================
// RENDER PLAYERS
// ============================================================
function renderPlayers(draftedPlayers = []) {
  if (!draftConfig) return;
  const search    = (document.getElementById('playerSearch')?.value || '').toLowerCase();
  const playersEl = document.getElementById('players');
  playersEl.innerHTML = '';

  const available = (draftConfig.playerPool || []).filter(p =>
    !draftedPlayers.includes(p) && p.toLowerCase().includes(search)
  );

  available.forEach(player => {
    const div = document.createElement('div');
    div.className = 'player';

    const inQueue = pickQueue.includes(player);

    div.innerHTML = `
      <span class="player-name">${player}</span>
      <div class="player-actions">
        <button class="btn-queue ${inQueue ? 'queued' : ''}" onclick="toggleQueue('${player}')">
          ${inQueue ? '★ Queue' : '☆ Queue'}
        </button>
        <button class="btn-draft" onclick="handleDraftClick('${player}')">Draften</button>
      </div>
    `;

    playersEl.appendChild(div);
  });
}

window.filterPlayers = function() {
  renderPlayers(allPicks.map(p => p.player));
};

// ============================================================
// PICK QUEUE
// ============================================================
window.toggleQueue = function(player) {
  if (pickQueue.includes(player)) {
    pickQueue = pickQueue.filter(p => p !== player);
  } else {
    pickQueue.push(player);
  }
  renderPlayers(allPicks.map(p => p.player));
  renderPickQueue();
};

function renderPickQueue() {
  const el       = document.getElementById('pickQueue');
  const emptyEl  = document.getElementById('queueEmpty');
  el.innerHTML   = '';

  // Remove already drafted from queue
  const drafted  = allPicks.map(p => p.player);
  pickQueue      = pickQueue.filter(p => !drafted.includes(p));

  if (pickQueue.length === 0) {
    emptyEl.style.display = 'block';
    return;
  }
  emptyEl.style.display = 'none';

  pickQueue.forEach((player, i) => {
    const item = document.createElement('div');
    item.className = 'queue-item';
    item.innerHTML = `
      <div class="queue-pos">${i + 1}</div>
      <div class="queue-name">${player}</div>
      <button class="queue-remove" onclick="removeFromQueue('${player}')">×</button>
    `;
    el.appendChild(item);
  });
}

window.removeFromQueue = function(player) {
  pickQueue = pickQueue.filter(p => p !== player);
  renderPlayers(allPicks.map(p => p.player));
  renderPickQueue();
};

// ============================================================
// DRAFT CLICK
// ============================================================
window.handleDraftClick = async function(player) {
  await executePick(player);
};

// ============================================================
// DRAFT ORDER
// ============================================================
function renderDraftOrder(state) {
  const el = document.getElementById('draftOrder');
  if (!el || !state.order) return;
  el.innerHTML = '';

  const currentIdx = state.currentPick - 1;
  const show = state.order.slice(currentIdx, currentIdx + 6);

  show.forEach((team, i) => {
    const item = document.createElement('div');
    item.className = `order-item${i === 0 ? ' on-clock' : ''}`;
    const pickNum = state.currentPick + i;
    item.innerHTML = `
      <div class="order-dot"></div>
      <div class="order-name">${team}</div>
      <div class="order-pick-num">Pick ${pickNum}</div>
    `;
    el.appendChild(item);
  });
}

// ============================================================
// PICK ANIMATION
// ============================================================
function showPickAnimation(pick) {
  const overlay = document.getElementById('pickOverlay');
  document.getElementById('overlayPickNum').textContent = pick.pickNumber;
  document.getElementById('overlayTeam').textContent    = pick.team;
  document.getElementById('overlayPlayer').textContent  = pick.player;
  document.getElementById('overlayRound').textContent   = `Runde ${pick.round}`;

  overlay.classList.add('active');

  setTimeout(() => {
    overlay.classList.remove('active');
  }, 3500);

  overlay.onclick = () => overlay.classList.remove('active');
}
