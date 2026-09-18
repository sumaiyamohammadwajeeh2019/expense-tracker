"""
Expense Tracker - local dev server.

Serves the static frontend (index.html, script.js, style.css) at:
    http://localhost:8000

Run it with:
    python main.py

The data itself is stored in Google Sheets via the Apps Script backend
(Code.gs) - see the setup notes at the top of Code.gs.
"""

import http.server
import os
import socketserver

HOST = '127.0.0.1'
PORT = 8000

# Always serve from the folder this script lives in.
os.chdir(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    """SimpleHTTPRequestHandler with the working directory already set."""

    def end_headers(self):
        # Avoid stale cached files while developing.
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


def main():
    with socketserver.TCPServer((HOST, PORT), Handler) as httpd:
        url = f'http://{HOST}:{PORT}'
        print('=' * 50)
        print(f'  Expense Tracker running at: {url}')
        print(f'  Serving files from: {os.getcwd()}')
        print('  Press Ctrl+C to stop.')
        print('=' * 50)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\nServer stopped.')


if __name__ == '__main__':
    main()
