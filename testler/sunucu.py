"""Yerel test sunucusu: Cloudflare Pages adres kurallarını taklit eder.

- /sayfa.html  -> 308 ile /sayfa adresine yönlenir (index.html -> klasör kökü)
- /sayfa       -> sayfa.html dosyasını sunar
- bulunamayan  -> 404.html (durum 404)

Kullanım: python3 testler/sunucu.py [port] [kök klasör]
"""
import http.server, os, sys, urllib.parse

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
KOK = os.path.abspath(sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), ".."))


class Isleyici(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=KOK, **k)

    def log_message(self, *a):
        pass

    def _yonlendir(self, yeni, sorgu):
        self.send_response(308)
        self.send_header("Location", yeni + (("?" + sorgu) if sorgu else ""))
        self.end_headers()

    def _isle(self, govde=True):
        u = urllib.parse.urlsplit(self.path)
        yol = urllib.parse.unquote(u.path)
        if yol.endswith("/index.html"):
            return self._yonlendir(yol[: -len("index.html")], u.query)
        if yol.endswith(".html") and os.path.isfile(os.path.join(KOK, yol.lstrip("/"))):
            return self._yonlendir(yol[: -len(".html")], u.query)
        tam = os.path.join(KOK, yol.lstrip("/"))
        if not os.path.splitext(yol)[1] and not yol.endswith("/") and os.path.isfile(tam + ".html"):
            self.path = yol + ".html" + (("?" + u.query) if u.query else "")
        elif yol.endswith("/") and os.path.isfile(os.path.join(tam, "index.html")):
            pass
        elif not os.path.exists(tam):
            veri = open(os.path.join(KOK, "404.html"), "rb").read()
            self.send_response(404)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(veri)))
            self.end_headers()
            if govde:
                self.wfile.write(veri)
            return
        return super().do_GET() if govde else super().do_HEAD()

    def do_GET(self):
        self._isle(True)

    def do_HEAD(self):
        self._isle(False)


if __name__ == "__main__":
    http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Isleyici).serve_forever()
