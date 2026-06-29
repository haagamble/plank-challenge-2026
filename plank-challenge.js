// ─── CONFIGURATION ────────────────────────────────────────────────────────────
const DB_URL   = 'https://plank-challenge-2026-default-rtdb.firebaseio.com';
const JOIN_CODE = 'plank26';
const QUERY_PARAMS = new URLSearchParams(window.location.search);
const TEST_MODE = QUERY_PARAMS.get('test') === '1';
const TEST_STORAGE_KEY = 'plank-challenge-test-data';
const IDENTITY_STORAGE_KEY = TEST_MODE
  ? 'plank-challenge-test-player'
  : 'plank-challenge-player';

const PLAN = [
  {d:1,t:'0:20'},{d:2,t:'0:20'},{d:3,t:'0:30'},{d:4,t:'0:30'},{d:5,t:'0:45'},{d:6,t:'0:55'},{d:7,t:'REST'},
  {d:8,t:'1:00'},{d:9,t:'1:15'},{d:10,t:'1:15'},{d:11,t:'2×1:00'},{d:12,t:'1:30'},{d:13,t:'1:30'},{d:14,t:'REST'},
  {d:15,t:'2×1:00'},{d:16,t:'1:45'},{d:17,t:'2:00'},{d:18,t:'2×1:00'},{d:19,t:'REST'},
  {d:20,t:'2:00'},{d:21,t:'2×1:15'},{d:22,t:'2:00'},{d:23,t:'2×1:15'},{d:24,t:'2:00'},{d:25,t:'2×1:15'},{d:26,t:'2:30'},{d:27,t:'REST'},
  {d:28,t:'2:30'},{d:29,t:'2×1:30'},{d:30,t:'3:00'},{d:31,t:'2×1:40'},{d:32,t:'3:15'},{d:33,t:'2×1:45'},{d:34,t:'REST'},
  {d:35,t:'2×2:00'},{d:36,t:'4:00'},{d:37,t:'2×2:00'},{d:38,t:'4:00'},{d:39,t:'2×2:30'},{d:40,t:'REST'},
  {d:41,t:'2×2:30'},{d:42,t:'5:00'}
];
const WEEKS = [
  {label:'Week 1', days:[1,2,3,4,5,6,7]},
  {label:'Week 2', days:[8,9,10,11,12,13,14]},
  {label:'Week 3', days:[15,16,17,18,19]},
  {label:'Week 4', days:[20,21,22,23,24,25,26,27]},
  {label:'Week 5', days:[28,29,30,31,32,33,34]},
  {label:'Week 6', days:[35,36,37,38,39,40,41,42]}
];
const NON_REST = PLAN.filter(d => d.t !== 'REST').length;
const MEDALS   = ['🥇','🥈','🥉'];

// ─── STATE ────────────────────────────────────────────────────────────────────
let players     = [];   // loaded from Firebase
let currentPlayer = null;
let allData     = {};
let hasInvite   = false;
let loadState   = 'loading';
let ownedPlayer = localStorage.getItem(IDENTITY_STORAGE_KEY);
let installPrompt = null;

// ─── INVITE CODE CHECK ────────────────────────────────────────────────────────
function checkInvite() {
  hasInvite = TEST_MODE || QUERY_PARAMS.get('join') === JOIN_CODE;
}

// ─── FIREBASE REST API ────────────────────────────────────────────────────────
function playerKey(name) { return name.toLowerCase().replace(/[^a-z0-9]/g, '_'); }
function escapeHtml(value) {
  const chars = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value).replace(/[&<>"']/g, char => chars[char]);
}

async function fetchAll() {
  if (TEST_MODE) {
    const data = JSON.parse(localStorage.getItem(TEST_STORAGE_KEY) || 'null');
    if (data) {
      players = data.players || [];
      allData = data.allData || {};
    }
    loadState = 'ready';
    return;
  }

  try {
    const res  = await fetch(`${DB_URL}/plank.json`);
    if (!res.ok) throw new Error(`Firebase returned ${res.status}`);
    const data = await res.json();
    players = [];
    allData = {};
    if (data && typeof data === 'object') {
      // Rebuild player list from Firebase keys
      const names = Object.keys(data).map(k => data[k].name).filter(Boolean);
      players = names;
      allData = {};
      for (const p of players) {
        const key = playerKey(p);
        allData[p] = { completed: data[key]?.completed || [] };
      }
    }
    loadState = 'ready';
  } catch(e) {
    loadState = 'error';
  }
}

async function savePlayer(name, data) {
  if (TEST_MODE) {
    localStorage.setItem(TEST_STORAGE_KEY, JSON.stringify({ players, allData }));
    return;
  }

  const key = playerKey(name);
  try {
    await fetch(`${DB_URL}/plank/${key}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, completed: data.completed })
    });
  } catch(e) { showToast('Save failed — check your connection'); }
}

// ─── JOIN ─────────────────────────────────────────────────────────────────────
async function joinChallenge() {
  const input = document.getElementById('joinName');
  const name  = input.value.trim();
  if (!name) { showToast('Please enter your name'); return; }
  if (players.map(p => p.toLowerCase()).includes(name.toLowerCase())) {
    showToast('That name is already taken!'); return;
  }
  players.push(name);
  allData[name] = { completed: [] };
  await savePlayer(name, { completed: [] });
  if (!ownedPlayer) {
    ownedPlayer = name;
    localStorage.setItem(IDENTITY_STORAGE_KEY, name);
  }
  input.value = '';
  if (!TEST_MODE) document.getElementById('joinBox').classList.add('hidden');
  renderNames();
  selectPlayer(name);
  showToast('Welcome to the challenge, ' + name + '! 💪');
}

function resetTestData() {
  if (!TEST_MODE) return;
  localStorage.removeItem(TEST_STORAGE_KEY);
  localStorage.removeItem(IDENTITY_STORAGE_KEY);
  players = [];
  allData = {};
  currentPlayer = null;
  ownedPlayer = null;
  document.getElementById('playerContent').classList.add('hidden');
  document.getElementById('joinBox').classList.remove('hidden');
  renderNames();
  showToast('Test data reset');
}

// ─── POLLING ──────────────────────────────────────────────────────────────────
function startPolling() {
  fetchAll().then(refreshAll);
  setInterval(async () => {
    await fetchAll();
    refreshAll();
  }, 15000);
}

// ─── RENDER ───────────────────────────────────────────────────────────────────
function renderNames() {
  const g = document.getElementById('nameGrid');
  const label = document.getElementById('nameLabel');
  const status = document.getElementById('nameStatus');

  label.classList.toggle('hidden', players.length === 0);
  g.classList.toggle('hidden', players.length === 0);
  status.classList.toggle('hidden', players.length > 0);

  if (players.length === 0) {
    if (loadState === 'error') {
      status.innerHTML = '<strong>We couldn’t load the challenge.</strong>Check your connection and refresh the page.';
    } else if (TEST_MODE) {
      status.innerHTML = '<strong>Your test group is empty.</strong>Add a pretend participant above to get started.';
    } else if (hasInvite) {
      status.innerHTML = '<strong>Be the first to join.</strong>Enter your name above to start the challenge.';
    } else {
      status.innerHTML = '<strong>Ready to join the plank challenge?</strong>Open the invitation link you were sent. Once you’ve joined, your name will appear here.';
    }
  }

  g.replaceChildren();
  for (const p of players) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `name-btn${currentPlayer === p ? ' active' : ''}`;
    button.textContent = p === ownedPlayer ? `${p} (you)` : p;
    button.addEventListener('click', () => selectPlayer(p));
    g.appendChild(button);
  }

  renderIdentityNote();
}

function selectPlayer(p) {
  if (!ownedPlayer) {
    const confirmed = window.confirm(
      `Use this device as ${p}? You will be able to update ${p}'s progress.`
    );
    if (!confirmed) return;
    ownedPlayer = p;
    localStorage.setItem(IDENTITY_STORAGE_KEY, p);
  }

  currentPlayer = p;
  renderNames();
  document.getElementById('playerContent').classList.remove('hidden');
  renderStats();
  renderPlan();
  renderGroup();
}

function renderIdentityNote() {
  const note = document.getElementById('identityNote');
  note.replaceChildren();
  note.classList.toggle('hidden', players.length === 0);
  if (players.length === 0) return;

  const message = document.createElement('span');
  if (!ownedPlayer) {
    message.textContent = 'Choose your name. This browser will remember you.';
  } else if (currentPlayer && currentPlayer !== ownedPlayer) {
    message.append('Viewing ');
    const name = document.createElement('strong');
    name.textContent = currentPlayer;
    message.append(name, ' — their plan is read-only.');
  } else {
    message.append('This device is linked to ');
    const name = document.createElement('strong');
    name.textContent = ownedPlayer;
    message.append(name, '.');
  }
  note.appendChild(message);

  if (ownedPlayer) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn';
    if (currentPlayer && currentPlayer !== ownedPlayer) {
      button.textContent = 'Back to my plan';
      button.addEventListener('click', () => selectPlayer(ownedPlayer));
    } else {
      button.textContent = 'Change user';
      button.addEventListener('click', forgetIdentity);
    }
    note.appendChild(button);
  }
}

function forgetIdentity() {
  const confirmed = window.confirm(
    'Change the user linked to this device? Progress already saved will not be deleted.'
  );
  if (!confirmed) return;
  localStorage.removeItem(IDENTITY_STORAGE_KEY);
  ownedPlayer = null;
  currentPlayer = null;
  document.getElementById('playerContent').classList.add('hidden');
  renderNames();
}

function doneCount(p) { return (allData[p]?.completed || []).length; }

function renderStats() {
  const done      = doneCount(currentPlayer);
  const pct       = Math.round(done / NON_REST * 100);
  const completed = allData[currentPlayer]?.completed || [];
  const nextDay   = PLAN.find(d => d.t !== 'REST' && !completed.includes(d.d));
  document.getElementById('statRow').innerHTML = `
    <div class="stat-card"><div class="stat-num">${done}</div><div class="stat-lbl">Days done</div></div>
    <div class="stat-card"><div class="stat-num">${pct}%</div><div class="stat-lbl">Complete</div></div>
    <div class="stat-card"><div class="stat-num">${nextDay ? 'Day '+nextDay.d : '🎉'}</div><div class="stat-lbl">Up next</div></div>
  `;
}

function renderPlan() {
  document.getElementById('planLoading').style.display = 'none';
  const completed = allData[currentPlayer]?.completed || [];
  const maxDone   = completed.length ? Math.max(...completed) : 0;
  const canEdit   = currentPlayer === ownedPlayer;
  let html = '';
  for (const wk of WEEKS) {
    html += `<div class="week-label">${wk.label}</div>`;
    for (const dn of wk.days) {
      const day      = PLAN.find(d => d.d === dn);
      const isRest   = day.t === 'REST';
      const isDone   = completed.includes(dn);
      const isFuture = !isRest && !isDone && dn > maxDone + 1;
      const stateCls = isRest ? 'rest' : isDone ? 'done' : isFuture ? 'future' : 'clickable';
      const cls      = `${stateCls}${canEdit ? '' : ' view-only'}`;
      const onclick  = canEdit
        ? isDone
          ? `onclick="undoDay(${dn})"`
          : stateCls === 'clickable'
            ? `onclick="markDay(${dn})"`
            : ''
        : '';
      const title = canEdit && isDone ? 'Click to undo' : canEdit ? '' : 'View only';
      html += `<div class="day-card ${cls}" ${onclick} title="${title}">
        <div><div class="day-num">Day ${dn}</div><div class="day-time">${day.t}</div></div>
        ${isDone ? '<span class="check-icon">✓</span>' : ''}
      </div>`;
    }
  }
  document.getElementById('planGrid').innerHTML = html;
}

function renderGroup() {
  const sorted = [...players].sort((a,b) => doneCount(b) - doneCount(a));
  document.getElementById('leaderboard').innerHTML = sorted.map((p, i) => {
    const done = doneCount(p);
    const pct  = Math.round(done / NON_REST * 100);
    const isMe = p === ownedPlayer;
    const safeName = escapeHtml(p);
    return `<div class="lb-row${isMe?' me':''}">
      <div class="lb-rank">${MEDALS[i] || (i+1)}</div>
      <div class="lb-name">${safeName}${isMe?' <span style="font-size:12px;font-weight:400;color:var(--accent)">(you)</span>':''}</div>
      <div class="lb-bar-wrap"><div class="lb-bar${pct>=100?' complete':''}" style="width:${pct}%"></div></div>
      <div class="lb-count">${done}/${NON_REST}</div>
    </div>`;
  }).join('');
}

function refreshAll() {
  if (ownedPlayer && !players.includes(ownedPlayer)) {
    localStorage.removeItem(IDENTITY_STORAGE_KEY);
    ownedPlayer = null;
  }
  if (!currentPlayer && ownedPlayer) {
    currentPlayer = ownedPlayer;
    document.getElementById('playerContent').classList.remove('hidden');
  }
  if (currentPlayer && !players.includes(currentPlayer)) {
    currentPlayer = null;
    document.getElementById('playerContent').classList.add('hidden');
  }
  renderNames();
  if (currentPlayer) { renderStats(); renderPlan(); renderGroup(); }
}

// ─── ACTIONS ──────────────────────────────────────────────────────────────────
async function markDay(dn) {
  if (!currentPlayer) return;
  if (currentPlayer !== ownedPlayer) {
    showToast('You can only update your own plan');
    return;
  }
  const data = allData[currentPlayer] || { completed: [] };
  if (data.completed.includes(dn)) return;
  data.completed.push(dn);
  allData[currentPlayer] = data;
  renderStats(); renderPlan(); renderGroup();
  await savePlayer(currentPlayer, data);
  showToast('Day ' + dn + ' done! 💪');
}

async function undoDay(dn) {
  if (!currentPlayer) return;
  if (currentPlayer !== ownedPlayer) {
    showToast('You can only update your own plan');
    return;
  }
  const data = allData[currentPlayer] || { completed: [] };
  data.completed = data.completed.filter(d => d !== dn);
  allData[currentPlayer] = data;
  renderStats(); renderPlan(); renderGroup();
  await savePlayer(currentPlayer, data);
  showToast('Day ' + dn + ' unmarked');
}

function showTab(tab) {
  document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', ['plan','group'][i] === tab));
  document.getElementById('planView').classList.toggle('hidden', tab !== 'plan');
  document.getElementById('groupView').classList.toggle('hidden', tab !== 'group');
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2400);
}

// ─── INSTALLABLE APP ──────────────────────────────────────────────────────────
function setupInstallPrompt() {
  if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) return;
  if (localStorage.getItem('plank-install-dismissed') === 'yes') return;

  const card = document.getElementById('installCard');
  const button = document.getElementById('installButton');
  const message = document.getElementById('installMessage');
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

  if (isIos) {
    message.textContent = 'On iPhone, tap Share, then “Add to Home Screen.”';
    card.classList.remove('hidden');
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    button.classList.remove('hidden');
    card.classList.remove('hidden');
  });

  button.addEventListener('click', async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    card.classList.add('hidden');
  });

  document.getElementById('installDismiss').addEventListener('click', () => {
    localStorage.setItem('plank-install-dismissed', 'yes');
    card.classList.add('hidden');
  });

  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    card.classList.add('hidden');
  });
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js');
    });
  }
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
checkInvite();
if (TEST_MODE) document.getElementById('testBanner').classList.remove('hidden');
if (hasInvite) document.getElementById('joinBox').classList.remove('hidden');
setupInstallPrompt();
registerServiceWorker();
startPolling();
