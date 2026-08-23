// Live-editable budget targets — same storage model as the tracker: localStorage for targets,
// IndexedDB (read-only) to pull actual income logged this month. No network calls.

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

async function getAllIncome() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('income', 'readonly');
    const req = tx.objectStore('income').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const todayStr = () => new Date().toISOString().slice(0, 10);
const monthKey = (dateStr) => dateStr.slice(0, 7);

const DEFAULT_CATEGORIES = [
  { name: 'Rent', urgency: 1 },
  { name: 'Food & Groceries', urgency: 1 },
  { name: 'Utilities', urgency: 1 },
  { name: 'Transport', urgency: 1 },
  { name: 'Family & Kids', urgency: 1 },
  { name: 'Medical', urgency: 1 },
  { name: 'Health & Fitness', urgency: 2 },
  { name: 'Quit-Smoking', urgency: 2 },
  { name: 'Track 1 Setup (Freelance)', urgency: 3 },
  { name: 'Homelab / Tooling (gated)', urgency: 4 },
  { name: 'Other', urgency: 5 },
];

const GROUP_LABELS = {
  1: '1 · Household floor',
  2: '2 · Health',
  3: '3 · Track 1 setup',
  4: '4 · Homelab / tooling (gated)',
  5: '5 · Everything else',
};

// Handles categories saved before urgency was split out — old shape was a plain string like
// "1 · Rent" instead of { name: 'Rent', urgency: 1 }.
function normalizeCategory(item) {
  if (item && typeof item === 'object' && typeof item.name === 'string') {
    return { name: item.name, urgency: item.urgency || 5 };
  }
  const text = String(item);
  const match = text.match(/^(\d)\s*·\s*(.+)$/);
  if (match) return { name: match[2].trim(), urgency: parseInt(match[1], 10) };
  return { name: text.trim(), urgency: 5 };
}

function loadCategories() {
  try {
    const raw = localStorage.getItem('categories');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) {
        const migrated = parsed.map(normalizeCategory);
        localStorage.setItem('categories', JSON.stringify(migrated));
        return migrated;
      }
    }
  } catch (e) { /* fall through to defaults */ }
  return DEFAULT_CATEGORIES.slice();
}

function loadBudget() {
  try {
    const raw = localStorage.getItem('budgetTargets');
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore */ }
  return {};
}

function saveBudget(targets) {
  localStorage.setItem('budgetTargets', JSON.stringify(targets));
}

function loadNetIncome() {
  const raw = localStorage.getItem('netIncome');
  return raw ? parseFloat(raw) : 15100;
}

function saveNetIncome(value) {
  localStorage.setItem('netIncome', String(value));
}

const money = (n) => `N$${(isNaN(n) ? 0 : n).toFixed(2)}`;
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const categories = loadCategories();
let targets = loadBudget();

const ownerNameInput = document.getElementById('ownerName');
const netIncomeInput = document.getElementById('netIncome');
const groupsEl = document.getElementById('budgetGroups');
const totalBudgetedEl = document.getElementById('totalBudgeted');
const totalIncomeEl = document.getElementById('totalIncome');
const actualIncomeEl = document.getElementById('actualIncome');
const remainingEl = document.getElementById('remaining');

// Shared across pages (Expenses/Income read it too) so the printed PDF header on each says
// "<name>'s Budget/Expenses/Income" instead of a generic title. One input, here, is enough.
function updateHeading() {
  const name = ownerNameInput.value.trim();
  document.querySelector('h1').textContent = name ? `${name}'s Budget` : 'Budget';
}
ownerNameInput.value = localStorage.getItem('ownerName') || '';
updateHeading();
ownerNameInput.addEventListener('input', () => {
  localStorage.setItem('ownerName', ownerNameInput.value);
  updateHeading();
});

netIncomeInput.value = loadNetIncome();

function render() {
  const groups = new Map();
  for (const c of categories) {
    const key = String(c.urgency);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }

  const sortedKeys = [...groups.keys()].sort();
  groupsEl.innerHTML = sortedKeys
    .map((key) => {
      const rows = groups
        .get(key)
        .map(
          (c) => `
        <div class="budgetRow">
          <label for="target-${escapeHtml(c.name)}">${escapeHtml(c.name)}</label>
          <input type="number" step="0.01" min="0" class="targetInput" data-category="${escapeHtml(c.name)}"
            id="target-${escapeHtml(c.name)}" value="${targets[c.name] || ''}" placeholder="0.00">
        </div>`
        )
        .join('');
      return `<section class="budgetGroup"><h2>${escapeHtml(GROUP_LABELS[key] || key)}</h2>${rows}</section>`;
    })
    .join('');

  updateTotals();
}

async function updateTotals() {
  const totalBudgeted = categories.reduce((sum, c) => sum + (parseFloat(targets[c.name]) || 0), 0);
  const netIncome = parseFloat(netIncomeInput.value) || 0;
  const remaining = netIncome - totalBudgeted;

  totalBudgetedEl.textContent = money(totalBudgeted);
  totalIncomeEl.textContent = money(netIncome);
  remainingEl.textContent = money(remaining);
  remainingEl.classList.toggle('over', remaining < 0);

  const income = await getAllIncome();
  const key = monthKey(todayStr());
  const actualIncome = income.filter((e) => monthKey(e.date) === key).reduce((sum, e) => sum + e.amount, 0);
  actualIncomeEl.textContent = money(actualIncome);
}

groupsEl.addEventListener('input', (ev) => {
  const input = ev.target.closest('.targetInput');
  if (!input) return;
  const value = parseFloat(input.value);
  if (input.value === '' ) {
    delete targets[input.dataset.category];
  } else {
    targets[input.dataset.category] = value;
  }
  saveBudget(targets);
  updateTotals();
});

netIncomeInput.addEventListener('input', () => {
  saveNetIncome(netIncomeInput.value);
  updateTotals();
});

document.getElementById('exportPdfBtn').addEventListener('click', () => {
  window.print();
});

render();
