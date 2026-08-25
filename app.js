// Expense Tracker — vanilla JS, IndexedDB storage, no backend, no network calls.

const DB_NAME = 'expenseTrackerDB';
const DB_VERSION = 3;
const STORE = 'expenses';

// Each category is { name, urgency } — urgency is the 1-5 priority scale (1 = household floor
// ... 5 = everything else). Category name is free text; urgency is a separate, explicit choice
// per expense entry, not baked into the name.
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

// ---------- IndexedDB ----------

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

const dbPromise = openDB();

async function addExpense(expense) {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).add(expense);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putExpense(expense) {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).put(expense);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function deleteExpense(id) {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function getAllExpenses() {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function clearExpenses() {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function getAllDebts() {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('debts', 'readonly');
    const req = tx.objectStore('debts').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Full-record upsert for debts — app.js only otherwise touches debts via adjustDebtBalance(),
// but needs this to apply incoming records when syncing (the "Debt payment" dropdown should
// reflect current balances even if this device never opens the Debts page directly).
async function putDebt(debt) {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('debts', 'readwrite');
    tx.objectStore('debts').put(debt);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
function fromSupabaseDebt(r) {
  return { id: r.id, name: r.name, balance: r.balance, monthlyPayment: r.monthly_payment || 0, note: r.note || '', updatedAt: r.updated_at };
}

// delta is added to the debt's balance — pass a negative amount to apply a payment, a positive
// amount to reverse one (e.g. when a linked expense is edited or deleted).
async function adjustDebtBalance(debtId, delta) {
  if (!debtId) return;
  const db = await dbPromise;
  let updatedDebt = null;
  await new Promise((resolve, reject) => {
    const tx = db.transaction('debts', 'readwrite');
    const store = tx.objectStore('debts');
    const req = store.get(debtId);
    req.onsuccess = () => {
      const debt = req.result;
      if (debt) {
        debt.balance += delta;
        debt.updatedAt = new Date().toISOString();
        store.put(debt);
        updatedDebt = debt;
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  if (updatedDebt) supabasePush('debts', toSupabaseDebt(updatedDebt));
}

// ---------- Supabase field mapping (camelCase locally, snake_case in Postgres) ----------

function toSupabaseExpense(e) {
  return {
    id: e.id, date: e.date, category: e.category, urgency: e.urgency, amount: e.amount,
    note: e.note || '', unexpected: Boolean(e.unexpected), debt_id: e.debtId || null,
    updated_at: e.updatedAt,
  };
}
function fromSupabaseExpense(r) {
  return {
    id: r.id, date: r.date, category: r.category, urgency: r.urgency, amount: r.amount,
    note: r.note || '', unexpected: Boolean(r.unexpected), debtId: r.debt_id || null,
    updatedAt: r.updated_at,
  };
}
function toSupabaseDebt(d) {
  return {
    id: d.id, name: d.name, balance: d.balance, monthly_payment: d.monthlyPayment || 0,
    note: d.note || '', updated_at: d.updatedAt,
  };
}

// ---------- Categories (localStorage) ----------

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
        saveCategories(migrated);
        return migrated;
      }
    }
  } catch (e) { /* fall through to defaults */ }
  saveCategories(DEFAULT_CATEGORIES);
  return DEFAULT_CATEGORIES.slice();
}

function saveCategories(list) {
  localStorage.setItem('categories', JSON.stringify(list));
  supabasePushSettings({ categories: list });
}

let categories = loadCategories();

// ---------- Helpers ----------

const money = (n) => `N$${n.toFixed(2)}`;
const todayStr = () => new Date().toISOString().slice(0, 10);

// "This month" runs on the actual pay cycle (25th to 24th), not the calendar month — payday
// is the 25th. monthKey/monthLabel keep their names so every call site elsewhere is unaffected.
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

// ---------- DOM refs ----------

const form = document.getElementById('expenseForm');
const editIdInput = document.getElementById('editId');
const dateInput = document.getElementById('date');
const amountInput = document.getElementById('amount');
const categoryInput = document.getElementById('category');
const categoryOptionsEl = document.getElementById('categoryOptions');
const urgencyInput = document.getElementById('urgency');
const noteInput = document.getElementById('note');
const unexpectedInput = document.getElementById('unexpected');
const debtLinkInput = document.getElementById('debtLink');
const submitBtn = document.getElementById('submitBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');

const categoryListEl = document.getElementById('categoryList');
const newCategoryInput = document.getElementById('newCategory');
const newCategoryUrgencyInput = document.getElementById('newCategoryUrgency');
const addCategoryBtn = document.getElementById('addCategoryBtn');

const monthSummaryEl = document.getElementById('monthSummary');
const unexpectedSummaryEl = document.getElementById('unexpectedSummary');
const categorySummaryEl = document.getElementById('categorySummary');
const expenseGroupsEl = document.getElementById('expenseGroups');

const exportJsonBtn = document.getElementById('exportJsonBtn');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const exportPdfBtn = document.getElementById('exportPdfBtn');
const importFile = document.getElementById('importFile');

// Stashed when entering edit mode so a debt-linked expense's old effect can be reversed
// before the new one is applied — see the submit handler.
let originalExpense = null;
let debts = [];

// ---------- Rendering ----------

async function renderDebtOptions() {
  debts = await getAllDebts();
  const current = debtLinkInput.value;
  debtLinkInput.innerHTML =
    '<option value="">— None —</option>' +
    debts.map((d) => `<option value="${d.id}">${escapeHtml(d.name)} (${money(d.balance)} owed)</option>`).join('');
  if (debts.some((d) => String(d.id) === current)) debtLinkInput.value = current;
}

function renderCategoryOptions() {
  categoryOptionsEl.innerHTML = categories.map((c) => `<option value="${escapeHtml(c.name)}">`).join('');
}

function renderCategoryManager() {
  categoryListEl.innerHTML = categories
    .map(
      (c, i) => `<li data-name="${escapeHtml(c.name)}"><span class="dragHandle">&#9776;</span><span>${escapeHtml(c.name)} <small>(urgency ${c.urgency})</small></span><button type="button" data-idx="${i}" class="removeCategoryBtn">Remove</button></li>`
    )
    .join('');
}

function findCategory(name) {
  const lower = name.trim().toLowerCase();
  return categories.find((c) => c.name.toLowerCase() === lower);
}

// Pulls the whole shared settings row and applies every field to localStorage — other pages
// (Budget, Health) own most of these fields, but this device's copy needs to stay current
// regardless of which page was last used to edit them. app.js only re-renders the bits it
// displays (categories); it doesn't need to react to budget/health fields itself.
async function syncSettings() {
  const remote = await supabasePullSettings();
  if (!remote) return;
  if (remote.categories) localStorage.setItem('categories', JSON.stringify(remote.categories));
  if (remote.owner_name != null) localStorage.setItem('ownerName', remote.owner_name);
  if (remote.net_income != null) localStorage.setItem('netIncome', String(remote.net_income));
  if (remote.budget_targets) localStorage.setItem('budgetTargets', JSON.stringify(remote.budget_targets));
  if (remote.smoke_daily_cost != null) localStorage.setItem('smokeDailyCost', String(remote.smoke_daily_cost));
  if (remote.smoke_log) localStorage.setItem('smokeLog', JSON.stringify(remote.smoke_log));

  categories = loadCategories();
  renderCategoryOptions();
  renderCategoryManager();
  const ownerName = localStorage.getItem('ownerName') || '';
  document.querySelector('h1').textContent = ownerName ? `${ownerName}'s Expenses` : 'Expenses';
}

// Autofill urgency when the typed category matches a known one — still a real selector,
// just pre-set for convenience; the user can override it before submitting.
categoryInput.addEventListener('input', () => {
  const match = findCategory(categoryInput.value);
  if (match) urgencyInput.value = String(match.urgency);
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function renderAll() {
  const expenses = await getAllExpenses();
  expenses.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.updatedAt || '').localeCompare(a.updatedAt || '')));

  renderMonthSummary(expenses);
  renderUnexpectedSummary(expenses);
  renderCategorySummary(expenses);
  renderHistory(expenses);
}

function renderUnexpectedSummary(expenses) {
  const key = monthKey(todayStr());
  const unexpected = expenses.filter((e) => monthKey(e.date) === key && e.unexpected);
  if (!unexpected.length) {
    unexpectedSummaryEl.textContent = '';
    return;
  }
  const total = unexpected.reduce((sum, e) => sum + e.amount, 0);
  unexpectedSummaryEl.textContent = `${money(total)} unexpected this month (${unexpected.length} ${unexpected.length === 1 ? 'entry' : 'entries'})`;
}

function renderMonthSummary(expenses) {
  const key = monthKey(todayStr());
  const total = expenses.filter((e) => monthKey(e.date) === key).reduce((sum, e) => sum + e.amount, 0);
  monthSummaryEl.innerHTML = `${money(total)}<small>${monthLabel(key)}</small>`;
}

function renderCategorySummary(expenses) {
  const key = monthKey(todayStr());
  const monthExpenses = expenses.filter((e) => monthKey(e.date) === key);
  const totals = new Map(); // category name -> { total, urgency }
  for (const e of monthExpenses) {
    const entry = totals.get(e.category) || { total: 0, urgency: e.urgency || 5 };
    entry.total += e.amount;
    totals.set(e.category, entry);
  }

  if (!totals.size) {
    categorySummaryEl.innerHTML = '<li class="emptyState">No expenses logged this month yet.</li>';
    return;
  }

  const rows = [...totals.entries()]
    .sort((a, b) => a[1].urgency - b[1].urgency || a[0].localeCompare(b[0]))
    .map(([name, { total }]) => `<li><span>${escapeHtml(name)}</span><span>${money(total)}</span></li>`);
  categorySummaryEl.innerHTML = rows.join('');
}

function renderHistory(expenses) {
  if (!expenses.length) {
    expenseGroupsEl.innerHTML = '<p class="emptyState">No expenses yet — add your first one above.</p>';
    return;
  }

  const groups = new Map();
  for (const e of expenses) {
    const key = monthKey(e.date);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }

  const sortedKeys = [...groups.keys()].sort().reverse();
  expenseGroupsEl.innerHTML = sortedKeys
    .map((key) => {
      const rows = groups.get(key);
      const total = rows.reduce((sum, e) => sum + e.amount, 0);
      const rowsHtml = rows
        .map(
          (e) => `
        <div class="expenseRow" data-id="${e.id}">
          <div class="meta">
            <div class="category">${escapeHtml(e.category)} <span class="urgencyTag" title="Urgency ${e.urgency || '?'}">U${e.urgency || '?'}</span>${e.unexpected ? ' <span class="badge">Unexpected</span>' : ''}</div>
            ${e.debtId ? `<div class="note">&rarr; ${escapeHtml(debts.find((d) => String(d.id) === String(e.debtId))?.name || 'debt')}</div>` : ''}
            ${e.note ? `<div class="note">${escapeHtml(e.note)}</div>` : ''}
            <div class="date">${e.date}</div>
          </div>
          <div class="amount">${money(e.amount)}</div>
          <div class="actions">
            <button type="button" class="editBtn" data-id="${e.id}">Edit</button>
            <button type="button" class="deleteBtn" data-id="${e.id}">Del</button>
          </div>
        </div>`
        )
        .join('');
      return `<div class="monthGroup"><h3><span>${monthLabel(key)}</span><span>${money(total)}</span></h3>${rowsHtml}</div>`;
    })
    .join('');
}

// ---------- Form handling ----------

function resetForm() {
  form.reset();
  editIdInput.value = '';
  dateInput.value = todayStr();
  urgencyInput.value = '5';
  unexpectedInput.checked = false;
  debtLinkInput.value = '';
  originalExpense = null;
  submitBtn.textContent = 'Add expense';
  cancelEditBtn.hidden = true;
}

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const categoryName = categoryInput.value.trim();
  const debtId = debtLinkInput.value || null;
  const expense = {
    date: dateInput.value,
    amount: parseFloat(amountInput.value),
    category: categoryName,
    urgency: parseInt(urgencyInput.value, 10),
    note: noteInput.value.trim(),
    unexpected: unexpectedInput.checked,
    debtId,
  };
  if (!expense.date || isNaN(expense.amount) || expense.amount < 0 || !categoryName) return;

  if (!findCategory(categoryName)) {
    categories.push({ name: categoryName, urgency: expense.urgency });
    saveCategories(categories);
    renderCategoryOptions();
    renderCategoryManager();
  }

  // Reverse the old debt effect (if any) before applying the new one, so editing a
  // debt-linked expense's amount or unlinking it doesn't leave the balance wrong.
  if (originalExpense && originalExpense.debtId) {
    await adjustDebtBalance(originalExpense.debtId, originalExpense.amount);
  }

  expense.updatedAt = new Date().toISOString();

  if (editIdInput.value) {
    expense.id = editIdInput.value;
    await putExpense(expense);
  } else {
    expense.id = crypto.randomUUID();
    await addExpense(expense);
  }

  if (debtId) await adjustDebtBalance(debtId, -expense.amount);

  supabasePush('expenses', toSupabaseExpense(expense));

  resetForm();
  renderAll();
  renderDebtOptions();
});

cancelEditBtn.addEventListener('click', resetForm);

expenseGroupsEl.addEventListener('click', async (ev) => {
  const editBtn = ev.target.closest('.editBtn');
  const delBtn = ev.target.closest('.deleteBtn');

  if (editBtn) {
    const id = editBtn.dataset.id;
    const expenses = await getAllExpenses();
    const expense = expenses.find((e) => e.id === id);
    if (!expense) return;
    editIdInput.value = id;
    dateInput.value = expense.date;
    amountInput.value = expense.amount;
    categoryInput.value = expense.category;
    urgencyInput.value = String(expense.urgency || 5);
    noteInput.value = expense.note || '';
    unexpectedInput.checked = Boolean(expense.unexpected);
    debtLinkInput.value = expense.debtId || '';
    originalExpense = expense;
    submitBtn.textContent = 'Update expense';
    cancelEditBtn.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (delBtn) {
    const id = delBtn.dataset.id;
    if (confirm('Delete this expense?')) {
      const expenses = await getAllExpenses();
      const expense = expenses.find((e) => e.id === id);
      if (expense && expense.debtId) await adjustDebtBalance(expense.debtId, expense.amount);
      await deleteExpense(id);
      supabaseDelete('expenses', id);
      renderAll();
      renderDebtOptions();
    }
  }
});

// ---------- Category management ----------

addCategoryBtn.addEventListener('click', () => {
  const name = newCategoryInput.value.trim();
  if (!name || findCategory(name)) return;
  categories.push({ name, urgency: parseInt(newCategoryUrgencyInput.value, 10) });
  saveCategories(categories);
  newCategoryInput.value = '';
  renderCategoryOptions();
  renderCategoryManager();
});

categoryListEl.addEventListener('click', (ev) => {
  const btn = ev.target.closest('.removeCategoryBtn');
  if (!btn) return;
  const idx = Number(btn.dataset.idx);
  categories.splice(idx, 1);
  saveCategories(categories);
  renderCategoryOptions();
  renderCategoryManager();
});

// ---------- Hold-and-drag to reorder categories (touch only, no library) ----------

let dragEl = null;
let dragging = false;
let longPressTimer = null;

categoryListEl.addEventListener(
  'touchstart',
  (ev) => {
    const li = ev.target.closest('li');
    if (!li || ev.target.closest('.removeCategoryBtn')) return;
    longPressTimer = setTimeout(() => {
      dragging = true;
      dragEl = li;
      li.classList.add('dragging');
    }, 350);
  },
  { passive: true }
);

categoryListEl.addEventListener(
  'touchmove',
  (ev) => {
    if (!dragging || !dragEl) {
      clearTimeout(longPressTimer);
      return;
    }
    ev.preventDefault();
    const touchY = ev.touches[0].clientY;
    const siblings = [...categoryListEl.querySelectorAll('li:not(.dragging)')];
    const next = siblings.find((sib) => touchY < sib.getBoundingClientRect().top + sib.getBoundingClientRect().height / 2);
    if (next) categoryListEl.insertBefore(dragEl, next);
    else categoryListEl.appendChild(dragEl);
  },
  { passive: false }
);

categoryListEl.addEventListener('touchend', () => {
  clearTimeout(longPressTimer);
  if (dragging && dragEl) {
    dragEl.classList.remove('dragging');
    const newOrder = [...categoryListEl.querySelectorAll('li')].map((li) => li.dataset.name);
    categories.sort((a, b) => newOrder.indexOf(a.name) - newOrder.indexOf(b.name));
    saveCategories(categories);
    renderCategoryManager();
  }
  dragging = false;
  dragEl = null;
});

// ---------- Export / Import ----------

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

exportJsonBtn.addEventListener('click', async () => {
  const expenses = await getAllExpenses();
  const payload = { exportedAt: new Date().toISOString(), categories, expenses };
  downloadFile(`expenses-${todayStr()}.json`, JSON.stringify(payload, null, 2), 'application/json');
});

exportCsvBtn.addEventListener('click', async () => {
  const expenses = await getAllExpenses();
  expenses.sort((a, b) => (a.date < b.date ? -1 : 1));
  const header = 'date,category,urgency,amount,note,unexpected';
  const csvEscape = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const rows = expenses.map((e) => [e.date, csvEscape(e.category), e.urgency || '', e.amount.toFixed(2), csvEscape(e.note || ''), e.unexpected ? 'yes' : 'no'].join(','));
  downloadFile(`expenses-${todayStr()}.csv`, [header, ...rows].join('\n'), 'text/csv');
});

exportPdfBtn.addEventListener('click', () => {
  window.print();
});

importFile.addEventListener('change', async (ev) => {
  const file = ev.target.files[0];
  if (!file) return;
  const text = await file.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (e) {
    alert('Not a valid JSON file.');
    return;
  }
  if (!Array.isArray(payload.expenses)) {
    alert('This file has no expenses array.');
    return;
  }
  if (!confirm('This replaces ALL current data on this phone with the file contents. Continue?')) return;

  await clearExpenses();
  for (const e of payload.expenses) {
    const { id, ...rest } = e;
    await addExpense(rest);
  }
  if (Array.isArray(payload.categories) && payload.categories.length) {
    categories = payload.categories;
    saveCategories(categories);
    renderCategoryOptions();
    renderCategoryManager();
  }
  importFile.value = '';
  renderAll();
});

// ---------- Full backup / restore (all pages: expenses, income, debts, budget, health) ----------

async function getAllFromStore(storeName) {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function clearStore(storeName) {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function addToStore(storeName, record) {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).add(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

const exportAllBtn = document.getElementById('exportAllBtn');
const importAllFile = document.getElementById('importAllFile');

exportAllBtn.addEventListener('click', async () => {
  const payload = {
    exportedAt: new Date().toISOString(),
    localStorage: {
      categories: JSON.parse(localStorage.getItem('categories') || 'null'),
      budgetTargets: JSON.parse(localStorage.getItem('budgetTargets') || 'null'),
      netIncome: localStorage.getItem('netIncome'),
      smokeLog: JSON.parse(localStorage.getItem('smokeLog') || 'null'),
      smokeDailyCost: localStorage.getItem('smokeDailyCost'),
    },
    expenses: await getAllExpenses(),
    income: await getAllFromStore('income'),
    debts: await getAllDebts(),
  };
  downloadFile(`full-backup-${todayStr()}.json`, JSON.stringify(payload, null, 2), 'application/json');
});

importAllFile.addEventListener('change', async (ev) => {
  const file = ev.target.files[0];
  if (!file) return;
  const text = await file.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (e) {
    alert('Not a valid JSON file.');
    return;
  }
  if (!payload.localStorage || !Array.isArray(payload.expenses)) {
    alert('This does not look like a full backup file.');
    return;
  }
  if (!confirm('This replaces ALL data on this phone — Expenses, Income, Debts, Budget targets, Health log — with the backup file. Continue?')) return;

  const ls = payload.localStorage;
  if (ls.categories) localStorage.setItem('categories', JSON.stringify(ls.categories));
  if (ls.budgetTargets) localStorage.setItem('budgetTargets', JSON.stringify(ls.budgetTargets));
  if (ls.netIncome != null) localStorage.setItem('netIncome', String(ls.netIncome));
  if (ls.smokeLog) localStorage.setItem('smokeLog', JSON.stringify(ls.smokeLog));
  if (ls.smokeDailyCost != null) localStorage.setItem('smokeDailyCost', String(ls.smokeDailyCost));

  await clearStore('expenses');
  for (const e of payload.expenses) {
    const { id, ...rest } = e;
    await addToStore('expenses', rest);
  }
  await clearStore('income');
  for (const e of payload.income || []) {
    const { id, ...rest } = e;
    await addToStore('income', rest);
  }
  await clearStore('debts');
  for (const d of payload.debts || []) {
    const { id, ...rest } = d;
    await addToStore('debts', rest);
  }

  importAllFile.value = '';
  alert('Restored. Reloading now.');
  location.reload();
});

// ---------- One-time migration for expenses saved before urgency was split out ----------

async function migrateExpenses() {
  const expenses = await getAllExpenses();
  for (const e of expenses) {
    const needsCategoryFix = !e.urgency;
    const needsIdFix = typeof e.id === 'number'; // pre-sync records used IndexedDB autoIncrement
    if (!needsCategoryFix && !needsIdFix && e.updatedAt) continue;

    const normalized = needsCategoryFix ? normalizeCategory(e.category) : { name: e.category, urgency: e.urgency };
    const updated = { ...e, category: normalized.name, urgency: normalized.urgency, updatedAt: e.updatedAt || new Date().toISOString() };

    if (needsIdFix) {
      // Two devices synced via Supabase can't share autoIncrement integers — every record
      // needs a globally-unique id. Can't change an IndexedDB record's key in place, so
      // delete the old numeric-id record and add a fresh one with a UUID.
      const oldId = e.id;
      updated.id = crypto.randomUUID();
      await deleteExpense(oldId);
      await addExpense(updated);
    } else {
      await putExpense(updated);
    }
  }
}

async function syncExpenses() {
  await syncStore('expenses', {
    getAllLocal: getAllExpenses,
    putLocal: (r) => putExpense(fromSupabaseExpense(r)),
    toRemote: toSupabaseExpense,
  });
}

async function syncDebtsForExpenses() {
  await syncStore('debts', {
    getAllLocal: getAllDebts,
    putLocal: (r) => putDebt(fromSupabaseDebt(r)),
    toRemote: toSupabaseDebt,
  });
}

// ---------- Init ----------

const ownerName = localStorage.getItem('ownerName') || '';
document.querySelector('h1').textContent = ownerName ? `${ownerName}'s Expenses` : 'Expenses';

dateInput.value = todayStr();
urgencyInput.value = '5';
renderCategoryOptions();
renderCategoryManager();
async function syncAndRender() {
  await migrateExpenses();
  await Promise.all([syncExpenses(), syncDebtsForExpenses(), syncSettings()]);
  await renderDebtOptions();
  renderAll();
}
syncAndRender();
scheduleFocusSync(syncAndRender);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // updateViaCache: 'none' stops the browser from using its normal HTTP cache (GitHub Pages'
    // 10-minute max-age) when it checks sw.js itself for changes — without this, the update
    // check can compare two stale copies and never notice a new version exists at all, even
    // though the fix in sw.js's install handler correctly re-fetches the app shell fresh once
    // an update *is* detected. registration.update() forces an immediate check on load instead
    // of waiting for the browser's own timing.
    navigator.serviceWorker
      .register('sw.js', { updateViaCache: 'none' })
      .then((reg) => reg.update())
      .catch(() => { /* offline install still works without it */ });
  });
}
