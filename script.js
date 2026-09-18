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

  CURRENCY: '৳'
};

// ---------------- State ----------------
let expenses = [];   // in-memory copy of all records
let editingId = null;

// ---------------- Helpers ----------------
const $ = (id) => document.getElementById(id);

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
  const res = await fetch(CONFIG.APPS_SCRIPT_URL, {
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
  const res = await fetch(CONFIG.APPS_SCRIPT_URL + '?action=list');
  return res.json();
}

// ---------------- Load & render ----------------
async function loadExpenses(showToastMsg = false) {
  if (CONFIG.APPS_SCRIPT_URL.includes('YOUR_DEPLOYMENT_ID')) {
    setStatus('offline');
    $('expenseTableBody').innerHTML =
      '<tr><td colspan="6" class="empty">⚠ Paste your Apps Script Web App URL into CONFIG in script.js, then reload.</td></tr>';
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
  const from = $('filterFrom').value;
  const to = $('filterTo').value;

  return expenses.filter((e) => {
    if (type !== 'all' && e.type !== type) return false;
    if (from && e.date < from) return false;
    if (to && e.date > to) return false;
    if (q && !(e.description.toLowerCase().includes(q) || e.category.toLowerCase().includes(q))) return false;
    return true;
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
    tbody.innerHTML = '<tr><td colspan="6" class="empty">No transactions found. Add one on the left ➜</td></tr>';
  } else {
    tbody.innerHTML = list.map((e) => `
      <tr>
        <td>${e.date}</td>
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
}

// ---------------- Form actions ----------------
$('expenseForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const btn = $('submitBtn');
  const expense = {
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
['searchInput', 'filterType', 'filterFrom', 'filterTo'].forEach((id) =>
  $(id).addEventListener('input', render)
);
$('clearFiltersBtn').addEventListener('click', () => {
  $('searchInput').value = '';
  $('filterType').value = 'all';
  $('filterFrom').value = '';
  $('filterTo').value = '';
  render();
});

// ---------------- Init ----------------
$('date').valueAsDate = new Date();
expenses = loadCache();
render();
loadExpenses();

