// Overview — read-only summary pulling from every store/localStorage key the other pages use.
// Salary/income, spending vs budget, real cash position, and debt, all against the actual pay
// cycle (25th to 24th), not the calendar month.

const DB_NAME = 'expenseTrackerDB';
const DB_VERSION = 3;

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

async function getAllFromStore(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putToStore(storeName, record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function toSupabaseExpense(e) {
  return {
    id: e.id, date: e.date, category: e.category, urgency: e.urgency, amount: e.amount,
    note: e.note || '', unexpected: Boolean(e.unexpected), debt_id: e.debtId || null, updated_at: e.updatedAt,
  };
}
function fromSupabaseExpense(r) {
  return {
    id: r.id, date: r.date, category: r.category, urgency: r.urgency, amount: r.amount,
    note: r.note || '', unexpected: Boolean(r.unexpected), debtId: r.debt_id || null, updatedAt: r.updated_at,
  };
}
function toSupabaseIncome(e) {
  return { id: e.id, date: e.date, source: e.source, amount: e.amount, note: e.note || '', updated_at: e.updatedAt };
}
function fromSupabaseIncome(r) {
  return { id: r.id, date: r.date, source: r.source, amount: r.amount, note: r.note || '', updatedAt: r.updated_at };
}
function toSupabaseDebt(d) {
  return { id: d.id, name: d.name, balance: d.balance, monthly_payment: d.monthlyPayment || 0, note: d.note || '', updated_at: d.updatedAt };
}
function fromSupabaseDebt(r) {
  return { id: r.id, name: r.name, balance: r.balance, monthlyPayment: r.monthly_payment || 0, note: r.note || '', updatedAt: r.updated_at };
}

async function syncEverything() {
  await Promise.all([
    syncStore('expenses', { getAllLocal: () => getAllFromStore('expenses'), putLocal: (r) => putToStore('expenses', fromSupabaseExpense(r)), toRemote: toSupabaseExpense }),
    syncStore('income', { getAllLocal: () => getAllFromStore('income'), putLocal: (r) => putToStore('income', fromSupabaseIncome(r)), toRemote: toSupabaseIncome }),
    syncStore('debts', { getAllLocal: () => getAllFromStore('debts'), putLocal: (r) => putToStore('debts', fromSupabaseDebt(r)), toRemote: toSupabaseDebt }),
  ]);
  const remote = await supabasePullSettings();
  if (remote) {
    if (remote.categories) localStorage.setItem('categories', JSON.stringify(remote.categories));
    if (remote.owner_name != null) localStorage.setItem('ownerName', remote.owner_name);
    if (remote.net_income != null) localStorage.setItem('netIncome', String(remote.net_income));
    if (remote.budget_targets) localStorage.setItem('budgetTargets', JSON.stringify(remote.budget_targets));
    if (remote.smoke_daily_cost != null) localStorage.setItem('smokeDailyCost', String(remote.smoke_daily_cost));
    if (remote.smoke_log) localStorage.setItem('smokeLog', JSON.stringify(remote.smoke_log));
  }
}

const money = (n) => `N$${(isNaN(n) ? 0 : n).toFixed(2)}`;
const todayStr = () => new Date().toISOString().slice(0, 10);

// Same pay-cycle logic as every other page — payday is the 25th.
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
function periodBounds(key) {
  const [y, m] = key.split('-').map(Number);
  const start = new Date(y, m - 1, PAYDAY);
  const end = new Date(y, m, PAYDAY - 1);
  return { start, end };
}
function periodLabel(key) {
  const { start, end } = periodBounds(key);
  const fmt = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const today = new Date();
  const daysLeft = Math.ceil((end - today) / 86400000);
  return `${fmt(start)} – ${fmt(end)} ${end.getFullYear()} · ${daysLeft <= 0 ? 'payday today' : `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} to payday`}`;
}

function updateHeading() {
  const ownerName = localStorage.getItem('ownerName') || '';
  document.querySelector('h1').textContent = ownerName ? `${ownerName}'s Overview` : 'Overview';
}
updateHeading();

async function render() {
  const key = monthKey(todayStr());
  document.getElementById('periodBanner').textContent = periodLabel(key);

  const [expenses, income, debts] = await Promise.all([
    getAllFromStore('expenses'),
    getAllFromStore('income'),
    getAllFromStore('debts'),
  ]);

  const periodExpenses = expenses.filter((e) => monthKey(e.date) === key);
  const periodIncome = income.filter((e) => monthKey(e.date) === key);

  const actualSpent = periodExpenses.reduce((sum, e) => sum + e.amount, 0);
  const actualIncome = periodIncome.reduce((sum, e) => sum + e.amount, 0);

  const assumedIncome = parseFloat(localStorage.getItem('netIncome')) || 0;
  let totalBudgeted = 0;
  try {
    const targets = JSON.parse(localStorage.getItem('budgetTargets') || '{}');
    totalBudgeted = Object.values(targets).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
  } catch (e) { /* ignore */ }

  document.getElementById('actualIncome').textContent = money(actualIncome);
  document.getElementById('assumedIncome').textContent = money(assumedIncome);

  document.getElementById('actualSpent').textContent = money(actualSpent);
  document.getElementById('totalBudgeted').textContent = money(totalBudgeted);
  const headroom = totalBudgeted - actualSpent;
  const headroomEl = document.getElementById('budgetHeadroom');
  headroomEl.textContent = money(headroom);
  headroomEl.classList.toggle('over', headroom < 0);

  const netCash = actualIncome - actualSpent;
  const netCashEl = document.getElementById('netCash');
  netCashEl.textContent = money(netCash);
  netCashEl.classList.toggle('over', netCash < 0);

  const totalDebt = debts.reduce((sum, d) => sum + d.balance, 0);
  document.getElementById('totalDebt').textContent = money(totalDebt);
  document.getElementById('debtCount').textContent = `${debts.length} ${debts.length === 1 ? 'debt' : 'debts'}`;
}

async function syncAndRender() {
  await syncEverything();
  updateHeading();
  render();
}
syncAndRender();
scheduleFocusSync(syncAndRender);
