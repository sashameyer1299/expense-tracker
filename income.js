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
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toSupabaseIncome(e) {
  return { id: e.id, date: e.date, source: e.source, amount: e.amount, note: e.note || '', updated_at: e.updatedAt };
}
function fromSupabaseIncome(r) {
  return { id: r.id, date: r.date, source: r.source, amount: r.amount, note: r.note || '', updatedAt: r.updated_at };
}
async function syncIncome() {
  await syncStore('income', { getAllLocal: getAllIncome, putLocal: (r) => putIncome(fromSupabaseIncome(r)), toRemote: toSupabaseIncome });
}
async function migrateIncome() {
  const entries = await getAllIncome();
  for (const e of entries) {
    const needsIdFix = typeof e.id === 'number';
    if (!needsIdFix && e.updatedAt) continue;
    const updated = { ...e, updatedAt: e.updatedAt || new Date().toISOString() };
    if (needsIdFix) {
      const oldId = e.id;
      updated.id = crypto.randomUUID();
      await deleteIncome(oldId);
      await addIncome(updated);
    } else {
      await putIncome(updated);
    }
  }
}
// Income doesn't own any settings fields but still applies whatever's shared (categories
// aren't used here, but ownerName personalizes this page's heading too).
async function applySharedOwnerName() {
  const remote = await supabasePullSettings();
  if (remote && remote.owner_name != null) localStorage.setItem('ownerName', remote.owner_name);
  const ownerName = localStorage.getItem('ownerName') || '';
  document.querySelector('h1').textContent = ownerName ? `${ownerName}'s Income` : 'Income';
}

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
  entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.updatedAt || '').localeCompare(a.updatedAt || '')));

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
  entry.updatedAt = new Date().toISOString();

  if (editIdInput.value) {
    entry.id = editIdInput.value;
    await putIncome(entry);
  } else {
    entry.id = crypto.randomUUID();
    await addIncome(entry);
  }
  supabasePush('income', toSupabaseIncome(entry));
  resetForm();
  renderAll();
});

cancelEditBtn.addEventListener('click', resetForm);

incomeGroupsEl.addEventListener('click', async (ev) => {
  const editBtn = ev.target.closest('.editBtn');
  const delBtn = ev.target.closest('.deleteBtn');

  if (editBtn) {
    const id = editBtn.dataset.id;
    const entries = await getAllIncome();
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;
    editIdInput.value = id;
    dateInput.value = entry.date;
    amountInput.value = entry.amount;
    sourceInput.value = entry.source;
    noteInput.value = entry.note || '';
    submitBtn.textContent = 'Update income';
    cancelEditBtn.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (delBtn) {
    const id = delBtn.dataset.id;
    if (confirm('Delete this income entry?')) {
      await deleteIncome(id);
      supabaseDelete('income', id);
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

dateInput.value = todayStr();

async function syncAndRender() {
  await migrateIncome();
  await Promise.all([syncIncome(), applySharedOwnerName()]);
  renderAll();
}
syncAndRender();
scheduleFocusSync(syncAndRender);
