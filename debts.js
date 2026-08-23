// Debts — balance + typical monthly payment, no interest math. Balances are normally reduced
// by logging a payment as an expense on the Expenses page and linking it to a debt; this page
// is for defining debts and correcting a balance directly when needed.

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

const dbPromise = openDB();

async function addDebt(debt) {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('debts', 'readwrite');
    const req = tx.objectStore('debts').add(debt);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putDebt(debt) {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('debts', 'readwrite');
    const req = tx.objectStore('debts').put(debt);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function deleteDebt(id) {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('debts', 'readwrite');
    const req = tx.objectStore('debts').delete(id);
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

const money = (n) => `N$${(isNaN(n) ? 0 : n).toFixed(2)}`;
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const form = document.getElementById('debtForm');
const editIdInput = document.getElementById('editId');
const nameInput = document.getElementById('name');
const balanceInput = document.getElementById('balance');
const paymentInput = document.getElementById('monthlyPayment');
const noteInput = document.getElementById('note');
const submitBtn = document.getElementById('submitBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const totalDebtEl = document.getElementById('totalDebt');
const debtsListEl = document.getElementById('debtsList');

async function renderAll() {
  const debts = await getAllDebts();
  debts.sort((a, b) => b.balance - a.balance);

  const total = debts.reduce((sum, d) => sum + d.balance, 0);
  totalDebtEl.innerHTML = `${money(total)}<small>total owed across ${debts.length} ${debts.length === 1 ? 'debt' : 'debts'}</small>`;

  if (!debts.length) {
    debtsListEl.innerHTML = '<p class="emptyState">No debts logged.</p>';
    return;
  }

  debtsListEl.innerHTML = debts
    .map((d) => {
      const monthsLeft = d.monthlyPayment > 0 ? Math.ceil(d.balance / d.monthlyPayment) : null;
      return `
      <div class="expenseRow" data-id="${d.id}">
        <div class="meta">
          <div class="category">${escapeHtml(d.name)}</div>
          ${d.note ? `<div class="note">${escapeHtml(d.note)}</div>` : ''}
          <div class="date">${d.monthlyPayment ? `${money(d.monthlyPayment)}/month` : 'no typical payment set'}${monthsLeft !== null ? ` &middot; ~${monthsLeft} ${monthsLeft === 1 ? 'month' : 'months'} to clear` : ''}</div>
        </div>
        <div class="amount">${money(d.balance)}</div>
        <div class="actions">
          <button type="button" class="editBtn" data-id="${d.id}">Edit</button>
          <button type="button" class="deleteBtn" data-id="${d.id}">Del</button>
        </div>
      </div>`;
    })
    .join('');
}

function resetForm() {
  form.reset();
  editIdInput.value = '';
  submitBtn.textContent = 'Add debt';
  cancelEditBtn.hidden = true;
}

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const debt = {
    name: nameInput.value.trim(),
    balance: parseFloat(balanceInput.value),
    monthlyPayment: paymentInput.value ? parseFloat(paymentInput.value) : 0,
    note: noteInput.value.trim(),
  };
  if (!debt.name || isNaN(debt.balance) || debt.balance < 0) return;

  if (editIdInput.value) {
    debt.id = Number(editIdInput.value);
    await putDebt(debt);
  } else {
    await addDebt(debt);
  }
  resetForm();
  renderAll();
});

cancelEditBtn.addEventListener('click', resetForm);

debtsListEl.addEventListener('click', async (ev) => {
  const editBtn = ev.target.closest('.editBtn');
  const delBtn = ev.target.closest('.deleteBtn');

  if (editBtn) {
    const id = Number(editBtn.dataset.id);
    const debts = await getAllDebts();
    const debt = debts.find((d) => d.id === id);
    if (!debt) return;
    editIdInput.value = String(id);
    nameInput.value = debt.name;
    balanceInput.value = debt.balance;
    paymentInput.value = debt.monthlyPayment || '';
    noteInput.value = debt.note || '';
    submitBtn.textContent = 'Update debt';
    cancelEditBtn.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (delBtn) {
    const id = Number(delBtn.dataset.id);
    if (confirm('Delete this debt? Expenses already linked to it keep their own record but will no longer show a live balance.')) {
      await deleteDebt(id);
      renderAll();
    }
  }
});

renderAll();
