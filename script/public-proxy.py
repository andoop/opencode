#!/usr/bin/env python3
import argparse
import http.client
import json
import os
import re
import select
import signal
import socket
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


HOP_HEADERS = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
}

FRONTEND_PREFIX = re.compile(r"^/(?:@vite|@react-refresh|@solid-refresh|@fs|@id|src|node_modules)\b")
FRONTEND_EXT = re.compile(
    r"\.(?:js|mjs|ts|tsx|css|map|json|svg|png|jpg|jpeg|gif|webp|ico|webmanifest|woff2?|ttf|otf)$",
    re.IGNORECASE,
)
DEBUG_LOG_PATH = "/Users/ke/Documents/project2/opencode/opencode/.cursor/debug-8a273b.log"
DEBUG_SESSION_ID = "8a273b"
UPLOAD_TIMEOUT = 15 * 60


def debug_log(location, message, data, run_id, hypothesis_id):
    payload = {
        "sessionId": DEBUG_SESSION_ID,
        "runId": run_id,
        "hypothesisId": hypothesis_id,
        "location": location,
        "message": message,
        "data": data,
        "timestamp": int(time.time() * 1000),
    }
    with open(DEBUG_LOG_PATH, "a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False) + "\n")


def is_frontend(path, method, headers):
    if "vite-hmr" in headers.get("sec-websocket-protocol", ""):
        return True
    if method not in ("GET", "HEAD"):
        return False
    if "text/html" in headers.get("accept", ""):
        return True
    if FRONTEND_PREFIX.search(path):
        return True
    return FRONTEND_EXT.search(path.split("?", 1)[0]) is not None


def request_headers(headers, port):
    result = {}
    for key, value in headers.items():
        if key.lower() in HOP_HEADERS:
            continue
        result[key] = value
    result["Host"] = f"localhost:{port}"
    result["Accept-Encoding"] = "identity"
    return result


def response_headers(headers, inject):
    for key, value in headers:
        lower = key.lower()
        if lower in HOP_HEADERS:
            continue
        if inject and lower in ("content-length", "content-encoding"):
            continue
        yield key, value


class Proxy(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_GET(self):
        self.proxy()

    def do_HEAD(self):
        self.proxy()

    def do_POST(self):
        self.proxy()

    def do_PUT(self):
        self.proxy()

    def do_PATCH(self):
        self.proxy()

    def do_DELETE(self):
        self.proxy()

    def do_OPTIONS(self):
        self.proxy()

    def log_message(self, fmt, *args):
        target = "web" if self.frontend() else "api"
        sys.stderr.write(f"[{target}] {self.address_string()} {fmt % args}\n")

    def frontend(self):
        return is_frontend(self.path, self.command, {k.lower(): v for k, v in self.headers.items()})

    def proxy(self):
        if self.headers.get("upgrade", "").lower() == "websocket":
            self.websocket()
            return

        conn = None
        front = self.frontend()
        port = self.server.frontend_port if front else self.server.api_port
        length = int(self.headers.get("content-length", "0") or "0")
        is_upload = self.command == "POST" and "/attachment" in self.path
        started_at = time.time()
        read_started_at = time.time()
        body = self.rfile.read(length) if length else None
        read_finished_at = time.time()

        if is_upload:
            # region agent log
            debug_log(
                "script/public-proxy.py:upload-read",
                "proxy upload body read",
                {
                    "path": self.path,
                    "contentLength": length,
                    "bytesRead": len(body or b""),
                    "readMs": round((read_finished_at - read_started_at) * 1000, 1),
                    "targetPort": port,
                },
                "upload-debug",
                "H1",
            )
            # endregion

        try:
            upstream_started_at = time.time()
            timeout = UPLOAD_TIMEOUT if is_upload else self.server.timeout
            conn = http.client.HTTPConnection("localhost", port, timeout=timeout)
            conn.request(
                self.command,
                self.path,
                body=body,
                headers=request_headers(self.headers, port),
            )
            res = conn.getresponse()
            content_type = res.getheader("content-type", "")
            inject = front and "text/html" in content_type

            if is_upload:
                # region agent log
                debug_log(
                    "script/public-proxy.py:upload-upstream",
                    "proxy upload upstream response",
                    {
                        "path": self.path,
                        "status": res.status,
                        "reason": res.reason,
                        "contentType": content_type,
                        "timeoutMs": timeout * 1000,
                        "upstreamMs": round((time.time() - upstream_started_at) * 1000, 1),
                        "totalMs": round((time.time() - started_at) * 1000, 1),
                    },
                    "upload-debug",
                    "H2",
                )
                # endregion

            self.send_response(res.status, res.reason)
            for key, value in response_headers(res.getheaders(), inject):
                self.send_header(key, value)
            self.send_header("Connection", "close")

            if inject:
                data = res.read()
                script = (
                    b'<script>try{localStorage.setItem("opencode.settings.dat:defaultServerUrl",'
                    b"location.origin)}catch{}</script>"
                )
                data = data.replace(b"</head>", script + b"</head>", 1) if b"</head>" in data else script + data
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                if self.command != "HEAD":
                    self.wfile.write(data)
            else:
                self.end_headers()
                if self.command != "HEAD":
                    if "text/event-stream" in content_type:
                        while True:
                            chunk = res.readline()
                            if not chunk:
                                break
                            self.wfile.write(chunk)
                            self.wfile.flush()
                    else:
                        while True:
                            chunk = res.read(64 * 1024)
                            if not chunk:
                                break
                            self.wfile.write(chunk)
            if is_upload:
                # region agent log
                debug_log(
                    "script/public-proxy.py:upload-finish",
                    "proxy upload response sent",
                    {
                        "path": self.path,
                        "status": res.status,
                        "totalMs": round((time.time() - started_at) * 1000, 1),
                    },
                    "upload-debug",
                    "H4",
                )
                # endregion
        except Exception as err:
            if is_upload:
                # region agent log
                debug_log(
                    "script/public-proxy.py:upload-error",
                    "proxy upload exception",
                    {
                        "path": self.path,
                        "error": str(err),
                        "timeoutMs": timeout * 1000 if "timeout" in locals() else None,
                        "totalMs": round((time.time() - started_at) * 1000, 1),
                    },
                    "upload-debug",
                    "H1",
                )
                # endregion
            try:
                self.send_error(502, f"proxy error: {err}")
            except BrokenPipeError:
                pass
        finally:
            self.close_connection = True
            try:
                conn.close()
            except Exception:
                pass

    def websocket(self):
        upstream = None
        front = self.frontend()
        port = self.server.frontend_port if front else self.server.api_port

        try:
            upstream = socket.create_connection(("localhost", port), timeout=self.server.timeout)
            upstream.sendall(f"{self.command} {self.path} HTTP/1.1\r\n".encode())
            for key, value in self.headers.items():
                if key.lower() == "host":
                    value = f"localhost:{port}"
                upstream.sendall(f"{key}: {value}\r\n".encode())
            upstream.sendall(b"\r\n")

            self.connection.setblocking(False)
            upstream.setblocking(False)
            sockets = [self.connection, upstream]

            while True:
                readable, _, broken = select.select(sockets, [], sockets, self.server.timeout)
                if broken:
                    break
                if not readable:
                    continue
                for sock in readable:
                    data = sock.recv(64 * 1024)
                    if not data:
                        return
                    (upstream if sock is self.connection else self.connection).sendall(data)
        except Exception as err:
            sys.stderr.write(f"[ws] proxy error: {err}\n")
        finally:
            self.close_connection = True
            try:
                upstream.close()
            except Exception:
                pass


class Server(ThreadingHTTPServer):
    allow_reuse_address = True


def command(pid):
    try:
        return subprocess.check_output(["ps", "-p", str(pid), "-o", "command="], text=True).strip()
    except subprocess.SubprocessError:
        return ""


def listeners(port):
    try:
        output = subprocess.check_output(
            ["lsof", "-nP", f"-iTCP:{port}", "-sTCP:LISTEN", "-t"],
            text=True,
            stderr=subprocess.DEVNULL,
        )
    except subprocess.SubprocessError:
        return []
    return [int(line) for line in output.splitlines() if line.strip().isdigit()]


def restart(port):
    current = os.getpid()
    pids = [pid for pid in listeners(port) if pid != current]
    if not pids:
        return

    own = [pid for pid in pids if "public-proxy.py" in command(pid)]
    blocked = [pid for pid in pids if pid not in own]
    if blocked:
        details = ", ".join(f"{pid} ({command(pid)})" for pid in blocked)
        raise RuntimeError(f"port {port} is already used by another process: {details}")

    for pid in own:
        print(f"stopping previous proxy pid {pid}", flush=True)
        os.kill(pid, signal.SIGTERM)

    deadline = time.time() + 5
    while time.time() < deadline:
        if not [pid for pid in own if pid in listeners(port)]:
            return
        time.sleep(0.1)

    for pid in own:
        if pid in listeners(port):
            print(f"force stopping previous proxy pid {pid}", flush=True)
            os.kill(pid, signal.SIGKILL)


def main():
    parser = argparse.ArgumentParser(description="Expose local web and API as one same-origin proxy.")
    parser.add_argument("--listen", type=int, default=7777, help="local proxy port")
    parser.add_argument("--web", type=int, default=3000, help="local web port")
    parser.add_argument("--api", type=int, default=4096, help="local API port")
    parser.add_argument("--host", default="127.0.0.1", help="proxy bind host")
    parser.add_argument("--no-restart", action="store_true", help="fail instead of replacing a previous proxy")
    parser.add_argument("--tunnel", action="store_true", help="start cloudflared and print the public URL")
    parser.add_argument("--cloudflared", default="cloudflared", help="cloudflared executable path")
    args = parser.parse_args()

    if not args.no_restart:
        restart(args.listen)

    server = Server((args.host, args.listen), Proxy)
    server.frontend_port = args.web
    server.api_port = args.api
    server.timeout = 60
    tunnel = None

    def start_tunnel():
        nonlocal tunnel
        tunnel = subprocess.Popen(
            [args.cloudflared, "--config", "/dev/null", "tunnel", "--url", f"http://localhost:{args.listen}"],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )

        def read():
            pattern = re.compile(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com")
            for line in tunnel.stdout or []:
                match = pattern.search(line)
                if match:
                    print(f"public url: {match.group(0)}", flush=True)
                sys.stderr.write(f"[cloudflared] {line}")

        threading.Thread(target=read, daemon=True).start()

    print(f"proxy listening on http://{args.host}:{args.listen}", flush=True)
    print(f"web -> http://localhost:{args.web}", flush=True)
    print(f"api -> http://localhost:{args.api}", flush=True)
    if args.tunnel:
        start_tunnel()
    else:
        print(f"run: cloudflared tunnel --url http://localhost:{args.listen}", flush=True)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        if tunnel:
            tunnel.terminate()


if __name__ == "__main__":
    main()
