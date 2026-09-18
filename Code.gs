/**
 * ============================================================
 *  EXPENSE TRACKER - Google Apps Script Backend
 * ============================================================
 *  This script turns your Google Sheet into a database for the
 *  expense tracker web app.
 *
 *  HOW TO INSTALL (one-time setup):
 *  1. Open your Google Sheet:
 *     https://docs.google.com/spreadsheets/d/17Ey6vxNclSB__PSigsvpd2pje4cOURbBpo4JWqMu5nw/edit
 *  2. Menu: Extensions -> Apps Script
 *  3. Delete any code there, paste THIS entire file, save (Ctrl+S).
 *  4. Click "Deploy" -> "New deployment"
 *  5. Select type: gear icon -> "Web app"
 *     - Description:  Expense Tracker API
 *     - Execute as:   Me (your email)
 *     - Who has access: Anyone          <-- IMPORTANT
 *  6. Click Deploy -> Authorize access -> choose your account ->
 *     Advanced -> Go to ... (unsafe) -> Allow.
 *  7. COPY the Web App URL (ends in /exec) and paste it into the
 *     CONFIG section at the top of script.js in this project.
 *  8. Open index.html in your browser. Done!
 *
 *  NOTE: Whenever you change Code.gs, you must re-deploy:
 *  Deploy -> Manage deployments -> edit (pencil) -> Version: New
 *  version -> Deploy.
 * ============================================================
 */

// Your spreadsheet ID (from the URL you provided)
const SHEET_ID = '17Ey6vxNclSB__PSigsvpd2pje4cOURbBpo4JWqMu5nw';

// Name of the tab that stores the data
const SHEET_NAME = 'Expenses';

// The exact header row we maintain
const HEADERS = ['ID', 'Date', 'Type', 'Category', 'Description', 'Amount'];

/** Get (and create if missing) the Expenses sheet with headers. */
function getSheet_() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.getRange('A1:F1').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange('A1:F1').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** Simple JSON response helper. */
function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * GET handler.
 *  ?action=list     -> returns all expenses
 *  ?action=ping     -> health check
 */
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'ping';

  if (action === 'ping') {
    return json_({ ok: true, message: 'Expense Tracker API is running' });
  }

  if (action === 'list') {
    const sheet = getSheet_();
    const data = sheet.getDataRange().getValues();
    const tz = Session.getScriptTimeZone();
    const expenses = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row[0] === '' || row[0] === null) continue;
      // Dates may be stored as Date objects OR as 'yyyy-MM-dd' strings
      const dateStr = (row[1] instanceof Date)
        ? Utilities.formatDate(row[1], tz, 'yyyy-MM-dd')
        : String(row[1]).substring(0, 10);
      expenses.push({
        id: String(row[0]),
        date: dateStr,
        type: String(row[2]),
        category: String(row[3]),
        description: String(row[4]),
        amount: Number(row[5])
      });
    }
    return json_({ ok: true, expenses: expenses });
  }

  return json_({ ok: false, error: 'Unknown action: ' + action });
}

/**
 * POST handler. Body is JSON:
 *  { action: 'add',    expense: { date, type, category, description, amount } }
 *  { action: 'update', expense: { id, date, type, category, description, amount } }
 *  { action: 'delete', id: '...' }
 */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    if (body.action === 'add') {
      const sheet = getSheet_();
      const id = 'EXP-' + new Date().getTime();
      sheet.appendRow([
        id,
        body.expense.date,
        body.expense.type,
        body.expense.category,
        body.expense.description,
        Number(body.expense.amount)
      ]);
      return json_({ ok: true, id: id });
    }

    if (body.action === 'update') {
      const sheet = getSheet_();
      const ids = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), 1).getValues();
      for (let i = 0; i < ids.length; i++) {
        if (String(ids[i][0]) === String(body.expense.id)) {
          sheet.getRange(i + 2, 2, 1, 5).setValues([[
            body.expense.date,
            body.expense.type,
            body.expense.category,
            body.expense.description,
            Number(body.expense.amount)
          ]]);
          return json_({ ok: true });
        }
      }
      return json_({ ok: false, error: 'ID not found' });
    }

    if (body.action === 'delete') {
      const sheet = getSheet_();
      const ids = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), 1).getValues();
      for (let i = 0; i < ids.length; i++) {
        if (String(ids[i][0]) === String(body.id)) {
          sheet.deleteRow(i + 2);
          return json_({ ok: true });
        }
      }
      return json_({ ok: false, error: 'ID not found' });
    }

    return json_({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/** Run once from the editor to pre-create the sheet with headers. */
function setup() {
  getSheet_();
}
