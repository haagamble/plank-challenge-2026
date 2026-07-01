// ─── CONFIGURATION ────────────────────────────────────────────────────────────
const DB_URL   = 'https://plank-challenge-2026-default-rtdb.firebaseio.com';
const JOIN_CODE = 'plank26';
const FIREBASE_API_KEY = window.PLANK_FIREBASE_CONFIG?.apiKey || '';
const QUERY_PARAMS = new URLSearchParams(window.location.search);
const TEST_MODE = QUERY_PARAMS.get('test') === '1';
const TEST_STORAGE_KEY = 'plank-challenge-test-data';
const TEST_IDENTITY_STORAGE_KEY = 'plank-challenge-test-player';
const AUTH_STORAGE_KEY = 'plank-challenge-firebase-auth';
const CHALLENGE_START = new Date(Date.UTC(2026, 6, 1));
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

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
  {label:'Week 3', days:[15,16,17,18,19,20,21]},
  {label:'Week 4', days:[22,23,24,25,26,27,28]},
  {label:'Week 5', days:[29,30,31,32,33,34,35]},
  {label:'Week 6', days:[36,37,38,39,40,41,42]}
];
const NON_REST = PLAN.filter(d => d.t !== 'REST').length;
const MEDALS   = ['🥇','🥈','🥉'];

function dateForDay(dayNumber) {
  return new Date(CHALLENGE_START.getTime() + (dayNumber - 1) * ONE_DAY_MS);
}

function formatDayDate(dayNumber) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  }).format(dateForDay(dayNumber));
}

function formatWeekRange(days) {
  const start = dateForDay(days[0]);
  const end = dateForDay(days[days.length - 1]);
  const month = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' });
  const startMonth = month.format(start);
  const endMonth = month.format(end);

  if (startMonth === endMonth) {
    return `${startMonth} ${start.getUTCDate()}–${end.getUTCDate()}`;
  }

  return `${startMonth} ${start.getUTCDate()}–${endMonth} ${end.getUTCDate()}`;
}

// ─── STATE ────────────────────────────────────────────────────────────────────
let players     = [];   // loaded from Firebase
let currentPlayer = null;
let allData     = {};
let playerUids  = {};
let hasInvite   = false;
let joinOpen    = false;
let loadState   = 'loading';
let ownedPlayer = TEST_MODE ? localStorage.getItem(TEST_IDENTITY_STORAGE_KEY) : null;
let authSession = null;
let authPromise = null;
let installPrompt = null;

// ─── INVITE CODE CHECK ────────────────────────────────────────────────────────
function isStandaloneApp() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function checkInvite() {
  // Installed apps need invitation access even when an older Home Screen icon
  // opens the root URL without the query string.
  hasInvite = TEST_MODE || QUERY_PARAMS.get('join') === JOIN_CODE || isStandaloneApp();
}

// ─── FIREBASE AUTHENTICATION AND REST API ─────────────────────────────────────
function escapeHtml(value) {
  const chars = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value).replace(/[&<>"']/g, char => chars[char]);
}

function storeAuthSession(data) {
  const expiresIn = Number(data.expiresIn || data.expires_in || 3600);
  authSession = {
    idToken: data.idToken || data.id_token,
    refreshToken: data.refreshToken || data.refresh_token,
    localId: data.localId || data.user_id,
    expiresAt: Date.now() + (expiresIn * 1000) - 60000
  };
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authSession));
  return authSession;
}

function readAuthSession() {
  if (authSession) return authSession;
  try {
    authSession = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || 'null');
  } catch {
    authSession = null;
  }
  return authSession;
}

async function createAnonymousAccount() {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(FIREBASE_API_KEY)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnSecureToken: true })
    }
  );
  if (!response.ok) throw new Error('Anonymous Firebase Authentication is not enabled.');
  return storeAuthSession(await response.json());
}

async function refreshAnonymousAccount(session) {
  const response = await fetch(
    `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(FIREBASE_API_KEY)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: session.refreshToken
      })
    }
  );
  if (!response.ok) throw new Error('This device could not restore its Firebase identity.');
  return storeAuthSession(await response.json());
}

async function ensureAuthenticated(forceRefresh = false) {
  if (TEST_MODE) return null;
  if (authPromise) return authPromise;

  authPromise = (async () => {
    const session = readAuthSession();
    if (session && !forceRefresh && session.idToken && session.expiresAt > Date.now()) {
      return session;
    }
    if (session?.refreshToken) return refreshAnonymousAccount(session);
    return createAnonymousAccount();
  })();

  try {
    return await authPromise;
  } finally {
    authPromise = null;
  }
}

async function firebaseRequest(path, options = {}, hasRetried = false) {
  const session = await ensureAuthenticated();
  const separator = path.includes('?') ? '&' : '?';
  const response = await fetch(
    `${DB_URL}/${path}.json${separator}auth=${encodeURIComponent(session.idToken)}`,
    options
  );

  if (response.status === 401 && !hasRetried) {
    await ensureAuthenticated(true);
    return firebaseRequest(path, options, true);
  }
  return response;
}

function completedMap(days) {
  return Object.fromEntries(days.map(day => [String(day), true]));
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
    const [playersResponse, joinResponse] = await Promise.all([
      firebaseRequest('plank'),
      firebaseRequest('settings/joinOpen')
    ]);
    if (!playersResponse.ok) throw new Error(`Firebase returned ${playersResponse.status}`);

    const data = await playersResponse.json();
    joinOpen = joinResponse.ok && await joinResponse.json() === true;
    players = [];
    allData = {};
    playerUids = {};
    ownedPlayer = null;

    if (data && typeof data === 'object') {
      for (const [uid, record] of Object.entries(data)) {
        if (!record?.name) continue;
        const name = record.name;
        const completed = Object.entries(record.completed || {})
          .filter(([, isDone]) => isDone === true)
          .map(([day]) => Number(day))
          .filter(day => Number.isInteger(day) && day >= 1 && day <= 42);
        players.push(name);
        playerUids[name] = uid;
        allData[name] = { completed };
        if (uid === authSession.localId) ownedPlayer = name;
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

  try {
    const response = await firebaseRequest(`plank/${authSession.localId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        completed: completedMap(data.completed)
      })
    });
    if (!response.ok) throw new Error(`Firebase rejected the write (${response.status}).`);
  } catch (error) {
    showToast(error.message || 'Save failed — check your connection');
    throw error;
  }
}

// ─── JOIN ─────────────────────────────────────────────────────────────────────
async function joinChallenge() {
  const input = document.getElementById('joinName');
  const name  = input.value.trim();
  if (!name) { showToast('Please enter your name'); return; }
  if (!TEST_MODE && ownedPlayer) {
    showToast('This device has already joined the challenge');
    return;
  }
  if (!TEST_MODE && (!hasInvite || !joinOpen)) {
    showToast('Joining is currently closed');
    return;
  }
  if (players.map(p => p.toLowerCase()).includes(name.toLowerCase())) {
    showToast('That name is already taken!'); return;
  }

  if (TEST_MODE) {
    players.push(name);
    allData[name] = { completed: [] };
    await savePlayer(name, allData[name]);
    if (!ownedPlayer) {
      ownedPlayer = name;
      localStorage.setItem(TEST_IDENTITY_STORAGE_KEY, name);
    }
  } else {
    try {
      await savePlayer(name, { completed: [] });
    } catch {
      return;
    }
    players.push(name);
    allData[name] = { completed: [] };
    ownedPlayer = name;
    playerUids[name] = authSession.localId;
  }
  input.value = '';
  renderNames();
  selectPlayer(name);
  showToast('Welcome to the challenge, ' + name + '! 💪');
}

function resetTestData() {
  if (!TEST_MODE) return;
  localStorage.removeItem(TEST_STORAGE_KEY);
  localStorage.removeItem(TEST_IDENTITY_STORAGE_KEY);
  players = [];
  allData = {};
  playerUids = {};
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
  document.getElementById('joinBox').classList.toggle(
    'hidden',
    !(TEST_MODE || (hasInvite && joinOpen && !ownedPlayer && loadState === 'ready'))
  );

  if (players.length === 0) {
    if (loadState === 'config') {
      status.innerHTML = '<strong>Firebase setup is incomplete.</strong>Add the Web API key and finish the Firebase Console steps in the README.';
    } else if (loadState === 'error') {
      status.innerHTML = '<strong>We couldn’t load the challenge.</strong>Check your connection and refresh the page.';
    } else if (TEST_MODE) {
      status.innerHTML = '<strong>Your test group is empty.</strong>Add a pretend participant above to get started.';
    } else if (hasInvite && joinOpen) {
      status.innerHTML = '<strong>Be the first to join.</strong>Enter your name above to start the challenge.';
    } else if (hasInvite && !joinOpen && loadState === 'ready') {
      status.innerHTML = '<strong>Joining is closed.</strong>Ask the challenge organizer if you still need access.';
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
  if (TEST_MODE && !ownedPlayer) {
    const confirmed = window.confirm(
      `Use this device as ${p}? You will be able to update ${p}'s progress.`
    );
    if (!confirmed) return;
    ownedPlayer = p;
    localStorage.setItem(TEST_IDENTITY_STORAGE_KEY, p);
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
    message.textContent = TEST_MODE
      ? 'Choose a test user. This browser will remember your choice.'
      : 'This device has not joined. Existing plans are view-only.';
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

  if (ownedPlayer && (TEST_MODE || currentPlayer !== ownedPlayer)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn';
    if (currentPlayer && currentPlayer !== ownedPlayer) {
      button.textContent = 'Back to my plan';
      button.addEventListener('click', () => selectPlayer(ownedPlayer));
    } else if (TEST_MODE) {
      button.textContent = 'Change user';
      button.addEventListener('click', forgetIdentity);
    }
    note.appendChild(button);
  }
}

function forgetIdentity() {
  if (!TEST_MODE) return;
  const confirmed = window.confirm(
    'Change the user linked to this device? Progress already saved will not be deleted.'
  );
  if (!confirmed) return;
  localStorage.removeItem(TEST_IDENTITY_STORAGE_KEY);
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
    html += `<div class="week-label">${wk.label} · ${formatWeekRange(wk.days)}</div>`;
    for (const dn of wk.days) {
      const day      = PLAN.find(d => d.d === dn);
      const isRest   = day.t === 'REST';
      const isDone   = completed.includes(dn);
      const isFuture = !isRest && !isDone && dn > maxDone + 1;
      const stateCls = isRest ? 'rest' : isDone ? 'done' : isFuture ? 'future' : 'clickable';
      const cls      = `${stateCls}${canEdit ? '' : ' view-only'}`;
      const action = canEdit
        ? isDone
          ? 'undo'
          : stateCls === 'clickable'
            ? 'mark'
            : ''
        : '';
      const actionAttributes = action ? `data-action="${action}" data-day="${dn}"` : '';
      const title = canEdit && isDone ? 'Click to undo' : canEdit ? '' : 'View only';
      html += `<div class="day-card ${cls}" ${actionAttributes} title="${title}">
        <div><div class="day-num">Day ${dn} · ${formatDayDate(dn)}</div><div class="day-time">${day.t}</div></div>
        ${isDone ? '<span class="check-icon">✓</span>' : ''}
      </div>`;
    }
  }
  const grid = document.getElementById('planGrid');
  grid.innerHTML = html;
  grid.querySelectorAll('[data-action]').forEach(card => {
    const day = Number(card.dataset.day);
    card.addEventListener('click', () => {
      if (card.dataset.action === 'undo') undoDay(day);
      else markDay(day);
    });
  });
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
    if (TEST_MODE) localStorage.removeItem(TEST_IDENTITY_STORAGE_KEY);
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
  const previous = [...data.completed];
  data.completed.push(dn);
  allData[currentPlayer] = data;
  renderStats(); renderPlan(); renderGroup();
  try {
    await savePlayer(currentPlayer, data);
    showToast('Day ' + dn + ' done! 💪');
  } catch {
    data.completed = previous;
    renderStats(); renderPlan(); renderGroup();
  }
}

async function undoDay(dn) {
  if (!currentPlayer) return;
  if (currentPlayer !== ownedPlayer) {
    showToast('You can only update your own plan');
    return;
  }
  const data = allData[currentPlayer] || { completed: [] };
  const previous = [...data.completed];
  data.completed = data.completed.filter(d => d !== dn);
  allData[currentPlayer] = data;
  renderStats(); renderPlan(); renderGroup();
  try {
    await savePlayer(currentPlayer, data);
    showToast('Day ' + dn + ' unmarked');
  } catch {
    data.completed = previous;
    renderStats(); renderPlan(); renderGroup();
  }
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
  const card = document.getElementById('installCard');
  const button = document.getElementById('installButton');
  const message = document.getElementById('installMessage');
  const isIos = isIosDevice();
  const isStandalone = isStandaloneApp();

  if (isIos && !isStandalone && hasInvite) {
    document.getElementById('joinInstructions').textContent =
      'First add this page to your Home Screen. Then open the Plank app and join there.';
    document.getElementById('joinName').disabled = true;
    document.getElementById('joinButton').disabled = true;
  }

  if (isStandalone) return;
  if (localStorage.getItem('plank-install-dismissed') === 'yes') return;

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
function connectInterface() {
  document.getElementById('joinButton').addEventListener('click', joinChallenge);
  document.getElementById('resetTestButton').addEventListener('click', resetTestData);
  document.getElementById('joinName').addEventListener('keydown', event => {
    if (event.key === 'Enter') joinChallenge();
  });
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => showTab(tab.dataset.tab));
  });
}

async function startApp() {
  checkInvite();
  connectInterface();
  setupInstallPrompt();
  registerServiceWorker();
  localStorage.removeItem('plank-challenge-player');

  if (TEST_MODE) {
    joinOpen = true;
    document.getElementById('testBanner').classList.remove('hidden');
    startPolling();
    return;
  }

  if (!FIREBASE_API_KEY || FIREBASE_API_KEY === 'REPLACE_WITH_FIREBASE_WEB_API_KEY') {
    loadState = 'config';
    renderNames();
    return;
  }

  try {
    await ensureAuthenticated();
    startPolling();
  } catch (error) {
    console.error(error);
    loadState = 'error';
    renderNames();
  }
}

startApp();
