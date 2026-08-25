// Health tab — manual quit-smoking log (localStorage) + actual Health/Quit-Smoking spend (IndexedDB, shared with the tracker).

const DB_NAME = 'expenseTrackerDB';
const DB_VERSION = 3;
const HEALTH_URGENCY = 2;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('expenses')) {
        const store = db.createObjectStore('expenses', { keyPath: 'id', autoIncrement: true });
        store.createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains('income')) {
        const store = db.createObjectStore('income', { keyPath: 'id', autoIncrement: true });
        store.createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains('debts')) {
        db.createObjectStore('debts', { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllExpenses() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('expenses', 'readonly');
    const req = tx.objectStore('expenses').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const money = (n) => `N$${(isNaN(n) ? 0 : n).toFixed(2)}`;
const todayStr = () => new Date().toISOString().slice(0, 10);

// "This month" runs on the actual pay cycle (25th to 24th) — payday is the 25th.
const PAYDAY = 25;
function monthKey(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  let year = y, month = m;
  if (d < PAYDAY) {
    month -= 1;
    if (month < 1) { month = 12; year -= 1; }
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}
function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  const start = new Date(y, m - 1, PAYDAY);
  const end = new Date(y, m, PAYDAY - 1);
  const fmt = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `${fmt(start)} – ${fmt(end)} ${end.getFullYear()}`;
}

function loadSmokeLog() {
  try {
    const raw = localStorage.getItem('smokeLog');
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore */ }
  return {};
}
function saveSmokeLog(log) {
  localStorage.setItem('smokeLog', JSON.stringify(log));
}
function loadDailyCost() {
  const raw = localStorage.getItem('smokeDailyCost');
  return raw ? parseFloat(raw) : 0;
}
function saveDailyCost(value) {
  localStorage.setItem('smokeDailyCost', String(value));
}

let smokeLog = loadSmokeLog();

const dailyCostInput = document.getElementById('dailyCost');
const todayDateEl = document.getElementById('todayDate');
const cleanBtn = document.getElementById('cleanBtn');
const slipBtn = document.getElementById('slipBtn');
const todayStatusEl = document.getElementById('todayStatus');
const streakEl = document.getElementById('streak');
const cleanDaysEl = document.getElementById('cleanDays');
const moneySavedEl = document.getElementById('moneySaved');
const logHistoryEl = document.getElementById('logHistory');
const monthSavedEl = document.getElementById('monthSaved');
const monthSpentEl = document.getElementById('monthSpent');
const netHealthEl = document.getElementById('netHealth');

dailyCostInput.value = loadDailyCost();
todayDateEl.textContent = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

function computeStreak() {
  let streak = 0;
  const d = new Date();
  for (;;) {
    const key = d.toISOString().slice(0, 10);
    if (smokeLog[key] === 'clean') {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

function renderToday() {
  const status = smokeLog[todayStr()];
  cleanBtn.classList.toggle('active', status === 'clean');
  slipBtn.classList.toggle('active', status === 'slip');
  todayStatusEl.textContent = status === 'clean' ? "Logged: smoke-free — nice." : status === 'slip' ? 'Logged: smoked today.' : 'Not logged yet today.';
}

function renderStats() {
  const dailyCost = parseFloat(dailyCostInput.value) || 0;
  const cleanDaysCount = Object.values(smokeLog).filter((v) => v === 'clean').length;

  streakEl.textContent = computeStreak();
  cleanDaysEl.textContent = cleanDaysCount;
  moneySavedEl.textContent = money(cleanDaysCount * dailyCost);
}

function renderHistory() {
  const entries = Object.entries(smokeLog).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  if (!entries.length) {
    logHistoryEl.innerHTML = '<p class="emptyState">No days logged yet — use the buttons above.</p>';
    return;
  }

  const groups = new Map();
  for (const [date, status] of entries) {
    const key = monthKey(date);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push([date, status]);
  }

  logHistoryEl.innerHTML = [...groups.keys()]
    .sort()
    .reverse()
    .map((key) => {
      const rows = groups
        .get(key)
        .map(
          ([date, status]) => `
        <div class="expenseRow">
          <div class="meta"><div class="date">${date}</div></div>
          <div class="${status === 'clean' ? 'logClean' : 'logSlip'}">${status === 'clean' ? 'Smoke-free' : 'Smoked'}</div>
        </div>`
        )
        .join('');
      return `<div class="monthGroup"><h3><span>${monthLabel(key)}</span></h3>${rows}</div>`;
    })
    .join('');
}

async function renderNetSection() {
  const key = monthKey(todayStr());
  const dailyCost = parseFloat(dailyCostInput.value) || 0;
  const monthCleanDays = Object.entries(smokeLog).filter(([date, status]) => status === 'clean' && monthKey(date) === key).length;
  const monthSaved = monthCleanDays * dailyCost;

  const expenses = await getAllExpenses();
  const monthSpent = expenses
    .filter((e) => monthKey(e.date) === key && e.urgency === HEALTH_URGENCY)
    .reduce((sum, e) => sum + e.amount, 0);

  monthSavedEl.textContent = money(monthSaved);
  monthSpentEl.textContent = money(monthSpent);
  const net = monthSaved - monthSpent;
  netHealthEl.textContent = money(net);
  netHealthEl.classList.toggle('over', net < 0);
}

function renderAll() {
  renderToday();
  renderStats();
  renderHistory();
  renderNetSection();
}

cleanBtn.addEventListener('click', () => {
  smokeLog[todayStr()] = 'clean';
  saveSmokeLog(smokeLog);
  renderAll();
});

slipBtn.addEventListener('click', () => {
  smokeLog[todayStr()] = 'slip';
  saveSmokeLog(smokeLog);
  renderAll();
});

dailyCostInput.addEventListener('input', () => {
  saveDailyCost(dailyCostInput.value);
  renderStats();
  renderNetSection();
});

const ownerName = localStorage.getItem('ownerName') || '';
document.querySelector('h1').textContent = ownerName ? `${ownerName}'s Health` : 'Health';

renderAll();
