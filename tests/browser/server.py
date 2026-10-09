"""Serve the app's module graph without dropping parallel browser connections."""
import os
import sys
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

class Handler(SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    def log_message(self, *args):
        pass

class Server(ThreadingHTTPServer):
    request_queue_size = 256

os.chdir(Path(__file__).resolve().parents[2])
Server(('127.0.0.1', int(sys.argv[1]) if len(sys.argv)>1 else 8080), Handler).serve_forever()
