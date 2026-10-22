/**
 * ============================================================
 *  EXPENSE TRACKER - Frontend Logic
 * ============================================================
 *  STEP 1: Deploy Code.gs as a Google Apps Script Web App
 *          (instructions at the top of Code.gs).
 *  STEP 2: Paste the Web App URL below (ends with /exec).
 * ============================================================
 */
const CONFIG = {
  // ⬇️ PASTE YOUR APPS SCRIPT WEB APP URL HERE ⬇️
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbxHqDTdobaki6-EHoOimLakCmQOFEI6ghwHpfVLy1O7rut4LST7E6CbcHUoiDuf_9dI8g/exec',

  // Local development API (mock_api.py). Used automatically when the page is
  // opened from localhost, so the app can be run fully offline.
  LOCAL_API_URL: 'http://127.0.0.1:8001/exec',

  CURRENCY: '৳'
};

/** Which API endpoint to talk to (mock locally, Apps Script in production). */
function apiBaseUrl() {
  const host = window.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0';
  if (isLocal && CONFIG.LOCAL_API_URL) return CONFIG.LOCAL_API_URL;
  return CONFIG.APPS_SCRIPT_URL;
}

// ---------------- State ----------------
let expenses = [];   // in-memory copy of all records
let editingId = null;
let currentUser = ''; // the name of the person using this device

// ---------------- Helpers ----------------
const $ = (id) => document.getElementById(id);

const STORAGE_USER_KEY = 'et_user';

/** Name of the current user (remembered on this device). */
function getUser() {
  if (currentUser) return currentUser;
  try { currentUser = localStorage.getItem(STORAGE_USER_KEY) || ''; } catch (e) { currentUser = ''; }
  return currentUser;
}

function setUser(name) {
  currentUser = String(name || '').trim();
  try { localStorage.setItem(STORAGE_USER_KEY, currentUser); } catch (e) { /* ignore */ }
}

/** Restore the saved name into the User input (called once at start-up). */
function restoreUserField() {
  const saved = getUser();
  if (saved) $('user').value = saved;
}

function money(n) {
  return CONFIG.CURRENCY + Number(n || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
}

function showToast(msg, isError = false) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isError ? ' error' : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => (t.className = 'toast'), 3000);
}

function setStatus(state) {
  const el = $('connectionStatus');
  if (state === 'online') {
    el.textContent = '● Connected ✓';
    el.className = 'status status-online';
  } else if (state === 'loading') {
    el.textContent = '● Connecting...';
    el.className = 'status status-loading';
  } else {
    el.textContent = '● Offline — check APPS_SCRIPT_URL in script.js';
    el.className = 'status status-offline';
  }
}

// ---------------- API ----------------
// POST calls are sent as JSON text (simple request -> no CORS preflight).
async function apiCall(body) {
  const res = await fetch(apiBaseUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  });
  return res.json();
}

const apiAdd = (expense) => apiCall({ action: 'add', expense });
const apiUpdate = (expense) => apiCall({ action: 'update', expense });
const apiDelete = (id) => apiCall({ action: 'delete', id });

async function apiList() {
  const res = await fetch(apiBaseUrl() + '?action=list');
  return res.json();
}

// ---------------- Load & render ----------------
async function loadExpenses(showToastMsg = false) {
  if (CONFIG.APPS_SCRIPT_URL.includes('YOUR_DEPLOYMENT_ID')) {
    setStatus('offline');
    $('expenseTableBody').innerHTML =
      '<tr><td colspan="7" class="empty">⚠ Paste your Apps Script Web App URL into CONFIG in script.js, then reload.</td></tr>';
    return;
  }
  setStatus('loading');
  try {
    const data = await apiList();
    if (!data.ok) throw new Error(data.error || 'API error');
    expenses = data.expenses;
    saveCache();
    setStatus('online');
    if (showToastMsg) showToast('Synced with Google Sheets ✓');
  } catch (err) {
    setStatus('offline');
    expenses = loadCache();
    showToast('Could not reach Google Sheets: ' + err.message, true);
  }
  render();
}

function saveCache() {
  try { localStorage.setItem('et_cache', JSON.stringify(expenses)); } catch (e) { /* ignore */ }
}
function loadCache() {
  try { return JSON.parse(localStorage.getItem('et_cache')) || []; } catch (e) { return []; }
}

function applyFilters() {
  const q = $('searchInput').value.toLowerCase();
  const type = $('filterType').value;
  const category = $('filterCategory').value;
  const user = $('filterUser').value;
  const onlyMine = $('filterMine').checked;
  const mine = myUser();
  const from = $('filterFrom').value;
  const to = $('filterTo').value;

  return expenses.filter((e) => {
    if (type !== 'all' && e.type !== type) return false;
    if (category !== 'all' && e.category !== category) return false;
    if (user !== 'all' && (e.user || '') !== user) return false;
    if (onlyMine && mine && (e.user || '') !== mine) return false;
    if (from && e.date < from) return false;
    if (to && e.date > to) return false;
    if (q && !(
      (e.description || '').toLowerCase().includes(q) ||
      (e.category || '').toLowerCase().includes(q) ||
      (e.user || '').toLowerCase().includes(q)
    )) return false;
    return true;
  });
}

/** The name this device is using (the "Only mine" identity). */
function myUser() {
  return getUser() || ($('user').value || '').trim();
}

/** Keep the User / Category filter dropdowns in sync with the data. */
function refreshFilterOptions() {
  const users = [...new Set(expenses.map((e) => (e.user || '').trim()).filter(Boolean))].sort();
  const categories = [...new Set(expenses.map((e) => (e.category || '').trim()).filter(Boolean))].sort();

  // Users
  const userSel = $('filterUser');
  const prevUser = userSel.value;
  userSel.innerHTML = '<option value="all">All users</option>' +
    users.map((u) => `<option value="${escapeHtml(u)}">${escapeHtml(u)}</option>`).join('');
  userSel.value = users.includes(prevUser) ? prevUser : 'all';

  // Categories
  const catSel = $('filterCategory');
  const prevCat = catSel.value;
  catSel.innerHTML = '<option value="all">All categories</option>' +
    categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  catSel.value = categories.includes(prevCat) ? prevCat : 'all';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------------- Monthly category breakdown ----------------
function currentMonthKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function renderCategoryBreakdown() {
  const monthKey = $('breakdownMonth').value || currentMonthKey();
  const body = $('categoryBreakdownBody');
  const totalEl = $('breakdownTotal');

  // Expenses of the selected month only
  const monthExpenses = expenses.filter(
    (e) => e.type === 'Expense' && String(e.date).substring(0, 7) === monthKey
  );
  const total = monthExpenses.reduce((s, e) => s + Number(e.amount), 0);

  const monthLabel = new Date(monthKey + '-01T00:00:00')
    .toLocaleString('en-US', { month: 'long', year: 'numeric' });

  if (total === 0) {
    body.innerHTML = '<div class="breakdown-empty">No expenses recorded for ' + monthLabel + '.</div>';
    totalEl.textContent = '';
    return;
  }

  // Sum per category
  const perCategory = {};
  monthExpenses.forEach((e) => {
    perCategory[e.category] = (perCategory[e.category] || 0) + Number(e.amount);
  });

  body.innerHTML = Object.entries(perCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, amt]) => {
      const pct = (amt / total) * 100;
      return `
      <div class="breakdown-row">
        <div class="breakdown-head">
          <span class="cat-tag">${escapeHtml(cat)}</span>
          <span class="breakdown-right">
            <span class="breakdown-amount">${money(amt)}</span>
            <span class="breakdown-pct">${pct.toFixed(1)}%</span>
          </span>
        </div>
        <div class="bar">
          <div class="bar-fill" style="width:${pct.toFixed(2)}%"></div>
        </div>
      </div>`;
    })
    .join('');

  const catCount = Object.keys(perCategory).length;
  totalEl.innerHTML =
    `Total ${escapeHtml(monthLabel)} expenses: <strong>${money(total)}</strong>` +
    ` across ${catCount} categor${catCount === 1 ? 'y' : 'ies'}`;
}

function render() {
  const list = applyFilters().sort((a, b) => (a.date < b.date ? 1 : -1));
  const tbody = $('expenseTableBody');

  // Summary (based on ALL records, not filtered)
  const income = expenses.filter((e) => e.type === 'Income').reduce((s, e) => s + Number(e.amount), 0);
  const expense = expenses.filter((e) => e.type === 'Expense').reduce((s, e) => s + Number(e.amount), 0);
  $('totalIncome').textContent = money(income);
  $('totalExpense').textContent = money(expense);
  $('totalBalance').textContent = money(income - expense);
  $('totalBalance').style.color = income - expense >= 0 ? 'var(--income)' : 'var(--expense)';

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty">No transactions found. Add one on the left ➜</td></tr>';
  } else {
    tbody.innerHTML = list.map((e) => `
      <tr>
        <td>${e.date}</td>
        <td><span class="user-tag">${escapeHtml(e.user || '—')}</span></td>
        <td><span class="badge ${e.type.toLowerCase()}">${e.type}</span></td>
        <td><span class="cat-tag">${escapeHtml(e.category)}</span></td>
        <td>${escapeHtml(e.description || '—')}</td>
        <td class="right amount-${e.type === 'Income' ? 'pos' : 'neg'}">
          ${e.type === 'Income' ? '+' : '−'}${money(e.amount)}
        </td>
        <td class="right">
          <button class="action-btn" title="Edit" onclick="startEdit('${e.id}')">✏️</button>
          <button class="action-btn delete" title="Delete" onclick="removeExpense('${e.id}')">🗑️</button>
        </td>
      </tr>`).join('');
  }
  $('recordCount').textContent = expenses.length + ' records';
  refreshFilterOptions();
  renderCategoryBreakdown();
}

// ---------------- Form actions ----------------
$('expenseForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const btn = $('submitBtn');
  const user = ($('user').value || '').trim();
  if (!user) {
    showToast('Please enter your name (User) first.', true);
    $('user').focus();
    return;
  }
  setUser(user);
  const expense = {
    user: user,
    date: $('date').value,
    type: $('type').value,
    category: $('category').value,
    description: $('description').value.trim(),
    amount: $('amount').value
  };

  btn.disabled = true;
  btn.textContent = 'Saving...';
  try {
    if (editingId) {
      const r = await apiUpdate({ ...expense, id: editingId });
      if (!r.ok) throw new Error(r.error);
      showToast('Transaction updated ✓');
    } else {
      const r = await apiAdd(expense);
      if (!r.ok) throw new Error(r.error);
      showToast('Transaction added ✓');
    }
    resetForm();
    await loadExpenses();
  } catch (err) {
    showToast('Save failed: ' + err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = editingId ? 'Update Transaction' : 'Add Transaction';
  }
});

window.startEdit = function (id) {
  const e = expenses.find((x) => x.id === id);
  if (!e) return;
  editingId = id;
  $('expenseId').value = id;
  $('user').value = e.user || getUser();
  $('date').value = e.date;
  $('type').value = e.type;
  $('category').value = e.category;
  $('description').value = e.description || '';
  $('amount').value = e.amount;
  $('formTitle').textContent = 'Edit Transaction';
  $('submitBtn').textContent = 'Update Transaction';
  $('cancelEditBtn').hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

function resetForm() {
  editingId = null;
  $('expenseForm').reset();
  $('date').valueAsDate = new Date();
  $('user').value = getUser();   // keep this device's identity
  $('formTitle').textContent = 'Add Transaction';
  $('submitBtn').textContent = 'Add Transaction';
  $('cancelEditBtn').hidden = true;
}

window.removeExpense = async function (id) {
  if (!confirm('Delete this transaction?')) return;
  try {
    const r = await apiDelete(id);
    if (!r.ok) throw new Error(r.error);
    showToast('Transaction deleted ✓');
    await loadExpenses();
  } catch (err) {
    showToast('Delete failed: ' + err.message, true);
  }
};

// ---------------- Event wiring ----------------
$('cancelEditBtn').addEventListener('click', resetForm);
$('refreshBtn').addEventListener('click', () => loadExpenses(true));
$('breakdownMonth').addEventListener('input', render);
['searchInput', 'filterType', 'filterCategory', 'filterUser', 'filterFrom', 'filterTo'].forEach((id) =>
  $(id).addEventListener('input', render)
);
$('filterMine').addEventListener('change', render);
$('clearFiltersBtn').addEventListener('click', () => {
  $('searchInput').value = '';
  $('filterType').value = 'all';
  $('filterCategory').value = 'all';
  $('filterUser').value = 'all';
  $('filterMine').checked = false;
  $('filterFrom').value = '';
  $('filterTo').value = '';
  render();
});

// ---------------- Init ----------------
$('date').valueAsDate = new Date();
$('breakdownMonth').value = currentMonthKey();
restoreUserField();
expenses = loadCache();
render();
loadExpenses();

