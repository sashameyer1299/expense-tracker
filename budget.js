// Live-editable budget targets — same storage model as the tracker: localStorage only, no network.

const DEFAULT_CATEGORIES = [
  '1 · Rent', '1 · Food & Groceries', '1 · Utilities', '1 · Transport', '1 · Family & Kids', '1 · Medical',
  '2 · Health & Fitness', '2 · Quit-Smoking',
  '3 · Track 1 Setup (Freelance)',
  '4 · Homelab / Tooling (gated)',
  '5 · Other',
];

const GROUP_LABELS = {
  1: '1 · Household floor',
  2: '2 · Health',
  3: '3 · Track 1 setup',
  4: '4 · Homelab / tooling (gated)',
  5: '5 · Everything else',
};

function loadCategories() {
  try {
    const raw = localStorage.getItem('categories');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
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

const netIncomeInput = document.getElementById('netIncome');
const groupsEl = document.getElementById('budgetGroups');
const totalBudgetedEl = document.getElementById('totalBudgeted');
const totalIncomeEl = document.getElementById('totalIncome');
const remainingEl = document.getElementById('remaining');

netIncomeInput.value = loadNetIncome();

function groupKeyOf(category) {
  const match = category.match(/^(\d)/);
  return match ? match[1] : '5';
}

function render() {
  const groups = new Map();
  for (const c of categories) {
    const key = groupKeyOf(c);
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
          <label for="target-${escapeHtml(c)}">${escapeHtml(c)}</label>
          <input type="number" step="0.01" min="0" class="targetInput" data-category="${escapeHtml(c)}"
            id="target-${escapeHtml(c)}" value="${targets[c] || ''}" placeholder="0.00">
        </div>`
        )
        .join('');
      return `<section class="budgetGroup"><h2>${escapeHtml(GROUP_LABELS[key] || key)}</h2>${rows}</section>`;
    })
    .join('');

  updateTotals();
}

function updateTotals() {
  const totalBudgeted = categories.reduce((sum, c) => sum + (parseFloat(targets[c]) || 0), 0);
  const netIncome = parseFloat(netIncomeInput.value) || 0;
  const remaining = netIncome - totalBudgeted;

  totalBudgetedEl.textContent = money(totalBudgeted);
  totalIncomeEl.textContent = money(netIncome);
  remainingEl.textContent = money(remaining);
  remainingEl.classList.toggle('over', remaining < 0);
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

render();
