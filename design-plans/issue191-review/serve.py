from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class PreviewHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    handler = partial(PreviewHandler, directory=str(Path(__file__).resolve().parents[2]))
    with ThreadingHTTPServer(("127.0.0.1", 53524), handler) as server:
        server.serve_forever()
