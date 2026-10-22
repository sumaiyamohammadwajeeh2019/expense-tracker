"""
Expense Tracker - local mock API.

A tiny stand-in for the Google Apps Script backend (Code.gs) so the whole app
can be run and tested on a machine without touching Google Sheets.

It implements exactly the same contract as Code.gs:
    GET  /exec?action=list   -> { ok: true, expenses: [...] }
    GET  /exec?action=ping   -> { ok: true, message: '...' }
    POST /exec               -> { action: 'add'|'update'|'delete', ... }

Data is persisted in a local JSON file (data_expenses.json) so it survives
restarts. Run it with:
    python mock_api.py
"""

import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

HOST = '127.0.0.1'
PORT = int(os.environ.get('MOCK_API_PORT', 8001))
DATA_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data_expenses.json')

# Same column order as the Google Sheet
HEADERS = ['ID', 'Date', 'Type', 'Category', 'Description', 'Amount', 'User']

_lock = threading.Lock()

def _seed():
    """Initial sample data (only used when the data file does not exist yet)."""
    today = time.strftime('%Y-%m-%d')
    return [
        {
            'id': 'EXP-1001', 'date': today, 'type': 'Expense', 'category': 'Food',
            'description': 'Lunch with team', 'amount': 850.0, 'user': 'Sumaiya'
        },
        {
            'id': 'EXP-1002', 'date': today, 'type': 'Income', 'category': 'Salary',
            'description': 'Monthly salary', 'amount': 60000.0, 'user': 'Sumaiya'
        },
        {
            'id': 'EXP-1003', 'date': today, 'type': 'Expense', 'category': 'Transport',
            'description': 'Ride to hospital', 'amount': 320.0, 'user': 'Rahim'
        },
        {
            'id': 'EXP-1004', 'date': today, 'type': 'Expense', 'category': 'Health',
            'description': 'Clinic supplies', 'amount': 1200.0, 'user': 'Karim'
        },
    ]


def _load():
    if not os.path.exists(DATA_FILE):
        data = _seed()
        _save(data)
        return data
    try:
        with open(DATA_FILE, 'r', encoding='utf-8') as fh:
            return json.load(fh)
    except (ValueError, OSError):
        return []


def _save(data):
    with open(DATA_FILE, 'w', encoding='utf-8') as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)


def _norm(expense):
    """Normalise one record coming from the client."""
    return {
        'date': str(expense.get('date', '')),
        'type': str(expense.get('type', 'Expense')),
        'category': str(expense.get('category', 'Other')),
        'description': str(expense.get('description', '')),
        'amount': float(expense.get('amount', 0) or 0),
        'user': str(expense.get('user', '') or '').strip(),
    }



class Handler(BaseHTTPRequestHandler):
    def _respond(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):  # noqa: N802 (http.server naming)
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):  # noqa: N802
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)
        action = (query.get('action') or ['ping'])[0]

        if action == 'ping':
            return self._respond({'ok': True, 'message': 'Expense Tracker mock API is running'})

        if action == 'list':
            with _lock:
                return self._respond({'ok': True, 'expenses': _load()})

        self._respond({'ok': False, 'error': 'Unknown action: ' + action})


    def do_POST(self):  # noqa: N802
        length = int(self.headers.get('Content-Length') or 0)
        raw = self.rfile.read(length).decode('utf-8') if length else '{}'
        try:
            body = json.loads(raw)
        except ValueError:
            return self._respond({'ok': False, 'error': 'Invalid JSON body'})

        action = body.get('action')

        with _lock:
            data = _load()

            if action == 'add':
                record = _norm(body.get('expense') or {})
                record['id'] = 'EXP-' + str(int(time.time() * 1000))
                data.append(record)
                _save(data)
                return self._respond({'ok': True, 'id': record['id']})

            if action == 'update':
                exp = body.get('expense') or {}
                target = str(exp.get('id', ''))
                record = _norm(exp)
                for i, item in enumerate(data):
                    if str(item.get('id')) == target:
                        record['id'] = target
                        data[i] = record
                        _save(data)
                        return self._respond({'ok': True})
                return self._respond({'ok': False, 'error': 'ID not found'})

            if action == 'delete':
                target = str(body.get('id', ''))
                for i, item in enumerate(data):
                    if str(item.get('id')) == target:
                        data.pop(i)
                        _save(data)
                        return self._respond({'ok': True})
                return self._respond({'ok': False, 'error': 'ID not found'})

        self._respond({'ok': False, 'error': 'Unknown action'})

    def log_message(self, fmt, *args):
        print('[mock-api] ' + fmt % args)


def main():
    with _lock:
        _save(_load())
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print('=' * 50)
    print(f'  Mock API running at: http://{HOST}:{PORT}/exec')
    print(f'  Data file: {DATA_FILE}')
    print('  Press Ctrl+C to stop.')
    print('=' * 50)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nMock API stopped.')
        server.server_close()


if __name__ == '__main__':
    main()
