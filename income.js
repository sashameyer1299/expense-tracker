// Income log — same storage model as the tracker: IndexedDB, 'income' store, no network.

const DB_NAME = 'expenseTrackerDB';
const DB_VERSION = 3;
const STORE = 'income';

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

async function addIncome(entry) {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).add(entry);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putIncome(entry) {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).put(entry);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function deleteIncome(id) {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function getAllIncome() {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const money = (n) => `N$${n.toFixed(2)}`;
const todayStr = () => new Date().toISOString().slice(0, 10);
const monthKey = (dateStr) => dateStr.slice(0, 7);
const monthLabel = (key) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
};
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const form = document.getElementById('incomeForm');
const editIdInput = document.getElementById('editId');
const dateInput = document.getElementById('date');
const amountInput = document.getElementById('amount');
const sourceInput = document.getElementById('source');
const noteInput = document.getElementById('note');
const submitBtn = document.getElementById('submitBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const monthSummaryEl = document.getElementById('monthSummary');
const incomeGroupsEl = document.getElementById('incomeGroups');
const exportJsonBtn = document.getElementById('exportJsonBtn');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const exportPdfBtn = document.getElementById('exportPdfBtn');

async function renderAll() {
  const entries = await getAllIncome();
  entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));

  renderMonthSummary(entries);
  renderHistory(entries);
}

function renderMonthSummary(entries) {
  const key = monthKey(todayStr());
  const total = entries.filter((e) => monthKey(e.date) === key).reduce((sum, e) => sum + e.amount, 0);
  monthSummaryEl.innerHTML = `${money(total)}<small>${monthLabel(key)}</small>`;
}

function renderHistory(entries) {
  if (!entries.length) {
    incomeGroupsEl.innerHTML = '<p class="emptyState">No income logged yet — add your first entry above.</p>';
    return;
  }

  const groups = new Map();
  for (const e of entries) {
    const key = monthKey(e.date);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }

  const sortedKeys = [...groups.keys()].sort().reverse();
  incomeGroupsEl.innerHTML = sortedKeys
    .map((key) => {
      const rows = groups.get(key);
      const total = rows.reduce((sum, e) => sum + e.amount, 0);
      const rowsHtml = rows
        .map(
          (e) => `
        <div class="expenseRow" data-id="${e.id}">
          <div class="meta">
            <div class="category">${escapeHtml(e.source)}</div>
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

function resetForm() {
  form.reset();
  editIdInput.value = '';
  dateInput.value = todayStr();
  submitBtn.textContent = 'Add income';
  cancelEditBtn.hidden = true;
}

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const entry = {
    date: dateInput.value,
    amount: parseFloat(amountInput.value),
    source: sourceInput.value.trim(),
    note: noteInput.value.trim(),
  };
  if (!entry.date || isNaN(entry.amount) || entry.amount < 0 || !entry.source) return;

  if (editIdInput.value) {
    entry.id = Number(editIdInput.value);
    await putIncome(entry);
  } else {
    await addIncome(entry);
  }
  resetForm();
  renderAll();
});

cancelEditBtn.addEventListener('click', resetForm);

incomeGroupsEl.addEventListener('click', async (ev) => {
  const editBtn = ev.target.closest('.editBtn');
  const delBtn = ev.target.closest('.deleteBtn');

  if (editBtn) {
    const id = Number(editBtn.dataset.id);
    const entries = await getAllIncome();
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;
    editIdInput.value = String(id);
    dateInput.value = entry.date;
    amountInput.value = entry.amount;
    sourceInput.value = entry.source;
    noteInput.value = entry.note || '';
    submitBtn.textContent = 'Update income';
    cancelEditBtn.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (delBtn) {
    const id = Number(delBtn.dataset.id);
    if (confirm('Delete this income entry?')) {
      await deleteIncome(id);
      renderAll();
    }
  }
});

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
  const entries = await getAllIncome();
  downloadFile(`income-${todayStr()}.json`, JSON.stringify({ exportedAt: new Date().toISOString(), income: entries }, null, 2), 'application/json');
});

exportCsvBtn.addEventListener('click', async () => {
  const entries = await getAllIncome();
  entries.sort((a, b) => (a.date < b.date ? -1 : 1));
  const header = 'date,source,amount,note';
  const csvEscape = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const rows = entries.map((e) => [e.date, csvEscape(e.source), e.amount.toFixed(2), csvEscape(e.note || '')].join(','));
  downloadFile(`income-${todayStr()}.csv`, [header, ...rows].join('\n'), 'text/csv');
});

exportPdfBtn.addEventListener('click', () => {
  window.print();
});

const ownerName = localStorage.getItem('ownerName') || '';
document.querySelector('h1').textContent = ownerName ? `${ownerName}'s Income` : 'Income';

dateInput.value = todayStr();
renderAll();
