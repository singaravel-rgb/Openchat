import http.server
import socketserver
import os

PORT = int(os.getenv('PORT', 8080))
Handler = http.server.SimpleHTTPRequestHandler

os.chdir(os.path.dirname(__file__))

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Serving widget test page at http://localhost:{PORT}/test-widget.html")
    httpd.serve_forever()

