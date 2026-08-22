// Expense Tracker — vanilla JS, IndexedDB storage, no backend, no network calls.

const DB_NAME = 'expenseTrackerDB';
const DB_VERSION = 2;
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
}

let categories = loadCategories();

// ---------- Helpers ----------

const money = (n) => `N$${n.toFixed(2)}`;
const todayStr = () => new Date().toISOString().slice(0, 10);
const monthKey = (dateStr) => dateStr.slice(0, 7); // YYYY-MM
const monthLabel = (key) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
};

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
const importFile = document.getElementById('importFile');

// ---------- Rendering ----------

function renderCategoryOptions() {
  categoryOptionsEl.innerHTML = categories.map((c) => `<option value="${escapeHtml(c.name)}">`).join('');
}

function renderCategoryManager() {
  categoryListEl.innerHTML = categories
    .map(
      (c, i) => `<li><span>${escapeHtml(c.name)} <small>(urgency ${c.urgency})</small></span><button type="button" data-idx="${i}" class="removeCategoryBtn">Remove</button></li>`
    )
    .join('');
}

function findCategory(name) {
  const lower = name.trim().toLowerCase();
  return categories.find((c) => c.name.toLowerCase() === lower);
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
  expenses.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));

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
  submitBtn.textContent = 'Add expense';
  cancelEditBtn.hidden = true;
}

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const categoryName = categoryInput.value.trim();
  const expense = {
    date: dateInput.value,
    amount: parseFloat(amountInput.value),
    category: categoryName,
    urgency: parseInt(urgencyInput.value, 10),
    note: noteInput.value.trim(),
    unexpected: unexpectedInput.checked,
  };
  if (!expense.date || isNaN(expense.amount) || expense.amount < 0 || !categoryName) return;

  if (!findCategory(categoryName)) {
    categories.push({ name: categoryName, urgency: expense.urgency });
    saveCategories(categories);
    renderCategoryOptions();
    renderCategoryManager();
  }

  if (editIdInput.value) {
    expense.id = Number(editIdInput.value);
    await putExpense(expense);
  } else {
    await addExpense(expense);
  }
  resetForm();
  renderAll();
});

cancelEditBtn.addEventListener('click', resetForm);

expenseGroupsEl.addEventListener('click', async (ev) => {
  const editBtn = ev.target.closest('.editBtn');
  const delBtn = ev.target.closest('.deleteBtn');

  if (editBtn) {
    const id = Number(editBtn.dataset.id);
    const expenses = await getAllExpenses();
    const expense = expenses.find((e) => e.id === id);
    if (!expense) return;
    editIdInput.value = String(id);
    dateInput.value = expense.date;
    amountInput.value = expense.amount;
    categoryInput.value = expense.category;
    urgencyInput.value = String(expense.urgency || 5);
    noteInput.value = expense.note || '';
    unexpectedInput.checked = Boolean(expense.unexpected);
    submitBtn.textContent = 'Update expense';
    cancelEditBtn.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (delBtn) {
    const id = Number(delBtn.dataset.id);
    if (confirm('Delete this expense?')) {
      await deleteExpense(id);
      renderAll();
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

// ---------- One-time migration for expenses saved before urgency was split out ----------

async function migrateExpenses() {
  const expenses = await getAllExpenses();
  for (const e of expenses) {
    if (e.urgency) continue; // already migrated / already has urgency
    const normalized = normalizeCategory(e.category);
    await putExpense({ ...e, category: normalized.name, urgency: normalized.urgency });
  }
}

// ---------- Init ----------

dateInput.value = todayStr();
urgencyInput.value = '5';
renderCategoryOptions();
renderCategoryManager();
migrateExpenses().then(renderAll);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline install still works without it */ });
  });
}
