// Health tab — manual quit-smoking log (localStorage) + actual Health/Quit-Smoking spend (IndexedDB, shared with the tracker).

const DB_NAME = 'expenseTrackerDB';
const DB_VERSION = 1;
const STORE = 'expenses';
const HEALTH_GROUP = '2';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllExpenses() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function groupKeyOf(category) {
  const match = category.match(/^(\d)/);
  return match ? match[1] : '5';
}

const money = (n) => `N$${(isNaN(n) ? 0 : n).toFixed(2)}`;
const todayStr = () => new Date().toISOString().slice(0, 10);
const monthKey = (dateStr) => dateStr.slice(0, 7);
const monthLabel = (key) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
};

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
    .filter((e) => monthKey(e.date) === key && groupKeyOf(e.category) === HEALTH_GROUP)
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

renderAll();
