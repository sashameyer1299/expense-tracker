// Expense Tracker — vanilla JS, IndexedDB storage, no backend, no network calls.

const DB_NAME = 'expenseTrackerDB';
const DB_VERSION = 1;
const STORE = 'expenses';

const DEFAULT_CATEGORIES = [
  '1 · Rent',
  '1 · Food & Groceries',
  '1 · Utilities',
  '1 · Transport',
  '1 · Family & Kids',
  '1 · Medical',
  '2 · Health & Fitness',
  '2 · Quit-Smoking',
  '3 · Track 1 Setup (Freelance)',
  '4 · Homelab / Tooling (gated)',
  '5 · Other',
];

// ---------- IndexedDB ----------

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
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

function loadCategories() {
  try {
    const raw = localStorage.getItem('categories');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
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
const categorySelect = document.getElementById('category');
const noteInput = document.getElementById('note');
const submitBtn = document.getElementById('submitBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');

const categoryListEl = document.getElementById('categoryList');
const newCategoryInput = document.getElementById('newCategory');
const addCategoryBtn = document.getElementById('addCategoryBtn');

const monthSummaryEl = document.getElementById('monthSummary');
const categorySummaryEl = document.getElementById('categorySummary');
const expenseGroupsEl = document.getElementById('expenseGroups');

const exportJsonBtn = document.getElementById('exportJsonBtn');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const importFile = document.getElementById('importFile');

// ---------- Rendering ----------

function renderCategoryOptions() {
  const current = categorySelect.value;
  categorySelect.innerHTML = categories
    .map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)
    .join('');
  if (categories.includes(current)) categorySelect.value = current;
}

function renderCategoryManager() {
  categoryListEl.innerHTML = categories
    .map(
      (c, i) => `<li><span>${escapeHtml(c)}</span><button type="button" data-idx="${i}" class="removeCategoryBtn">Remove</button></li>`
    )
    .join('');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function renderAll() {
  const expenses = await getAllExpenses();
  expenses.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));

  renderMonthSummary(expenses);
  renderCategorySummary(expenses);
  renderHistory(expenses);
}

function renderMonthSummary(expenses) {
  const key = monthKey(todayStr());
  const total = expenses.filter((e) => monthKey(e.date) === key).reduce((sum, e) => sum + e.amount, 0);
  monthSummaryEl.innerHTML = `${money(total)}<small>${monthLabel(key)}</small>`;
}

function renderCategorySummary(expenses) {
  const key = monthKey(todayStr());
  const monthExpenses = expenses.filter((e) => monthKey(e.date) === key);
  const totals = new Map();
  for (const e of monthExpenses) totals.set(e.category, (totals.get(e.category) || 0) + e.amount);

  if (!totals.size) {
    categorySummaryEl.innerHTML = '<li class="emptyState">No expenses logged this month yet.</li>';
    return;
  }

  const rows = categories
    .filter((c) => totals.has(c))
    .map((c) => `<li><span>${escapeHtml(c)}</span><span>${money(totals.get(c))}</span></li>`);
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
            <div class="category">${escapeHtml(e.category)}</div>
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
  submitBtn.textContent = 'Add expense';
  cancelEditBtn.hidden = true;
}

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const expense = {
    date: dateInput.value,
    amount: parseFloat(amountInput.value),
    category: categorySelect.value,
    note: noteInput.value.trim(),
  };
  if (!expense.date || isNaN(expense.amount) || expense.amount < 0 || !expense.category) return;

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
    categorySelect.value = expense.category;
    noteInput.value = expense.note || '';
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
  if (!name || categories.includes(name)) return;
  categories.push(name);
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
  const header = 'date,category,amount,note';
  const csvEscape = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const rows = expenses.map((e) => [e.date, csvEscape(e.category), e.amount.toFixed(2), csvEscape(e.note || '')].join(','));
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

// ---------- Init ----------

dateInput.value = todayStr();
renderCategoryOptions();
renderCategoryManager();
renderAll();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline install still works without it */ });
  });
}
