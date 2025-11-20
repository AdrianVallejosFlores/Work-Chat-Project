# server.py (consolidado y listo)
import os
import json
import threading
import asyncio
import time
from http.server import SimpleHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse
import secrets
from pathlib import Path
from typing import Dict, Any, Set
import websockets
from websockets.exceptions import ConnectionClosedOK, ConnectionClosedError
from dotenv import load_dotenv

from oauth import build_auth_url, exchange_code_for_user

load_dotenv()

HOST = os.environ.get("HOST", "0.0.0.0")
HTTP_PORT = int(os.environ.get("HTTP_PORT", 8000))
WS_PORT = int(os.environ.get("WS_PORT", 8765))
DATA_DIR = Path("data")
MESSAGES_DIR = DATA_DIR / "messages"
SESSIONS_FILE = DATA_DIR / "sessions.json"
USERS_FILE = DATA_DIR / "users.json"
ROOMS_FILE = DATA_DIR / "rooms.json"

DATA_DIR.mkdir(exist_ok=True)
MESSAGES_DIR.mkdir(exist_ok=True)

initial_files = [
    (SESSIONS_FILE, {}),
    (USERS_FILE, {}),
    (ROOMS_FILE, {"default": {"name": "General", "description": "Sala principal"}}),
]
for fpath, default in initial_files:
    if not fpath.exists():
        fpath.write_text(json.dumps(default, indent=2, ensure_ascii=False), encoding="utf-8")

LOCK = threading.Lock()

def load_json(path: Path) -> Dict[str, Any]:
    with LOCK:
        if not path.exists():
            return {}
        txt = path.read_text(encoding="utf-8")
        if not txt.strip():
            return {}
        try:
            return json.loads(txt)
        except Exception:
            return {}

def save_json(path: Path, data: Dict[str, Any]):
    with LOCK:
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

def append_message_log(room: str, line: str):
    path = MESSAGES_DIR / f"{room}.log"
    with LOCK:
        with open(path, "a", encoding="utf-8") as fh:
            fh.write(line + "\n")

def read_last_lines(room: str, n: int = 50):
    path = MESSAGES_DIR / f"{room}.log"
    if not path.exists():
        return []
    with LOCK:
        with open(path, "r", encoding="utf-8", errors="ignore") as fh:
            lines = fh.read().splitlines()
    return lines[-n:]

def create_session(userinfo: dict) -> str:
    sessions = load_json(SESSIONS_FILE)
    session_id = secrets.token_urlsafe(16)
    sessions[session_id] = {
        "user": {
            "sub": userinfo.get("sub"),
            "email": userinfo.get("email"),
            "name": userinfo.get("name") or (userinfo.get("email") or "").split("@")[0],
            "display_name": userinfo.get("display_name") or None
        },
        "created_at": time.time()
    }
    save_json(SESSIONS_FILE, sessions)
    users = load_json(USERS_FILE)
    users[str(userinfo.get("sub"))] = sessions[session_id]["user"]
    save_json(USERS_FILE, users)
    return session_id

def get_session(session_id: str):
    sessions = load_json(SESSIONS_FILE)
    return sessions.get(session_id)

class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        p = urlparse(path).path
        root = Path.cwd()
        if p == "/":
            return str(root / "static" / "index.html")
        if p.startswith("/static/"):
            sub = p[len("/static/"):].lstrip("/")
            return str(root / "static" / sub)
        return super().translate_path(path)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/login":
            state = secrets.token_urlsafe(8)
            url = build_auth_url(state)
            self.send_response(302)
            self.send_header("Location", url)
            self.end_headers()
            return

        if path == "/oauth2callback":
            qs = parse_qs(parsed.query)
            code = qs.get("code", [None])[0]
            if not code:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b"Missing code in callback.")
                return
            try:
                userinfo = exchange_code_for_user(code)
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(f"OAuth error: {e}".encode())
                return
            session_id = create_session(userinfo)
            self.send_response(302)
            cookie = f"session={session_id}; Path=/; SameSite=Lax"
            self.send_header("Set-Cookie", cookie)
            self.send_header("Location", "/")
            self.end_headers()
            return

        if path == "/session":
            cookies = self.headers.get("Cookie", "") or ""
            session_id = None
            for part in cookies.split(";"):
                if "=" in part:
                    k, v = part.strip().split("=", 1)
                    if k == "session":
                        session_id = v
                        break
            if not session_id:
                self.send_response(401)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "no session"}).encode())
                return
            sess = get_session(session_id)
            if not sess:
                self.send_response(401)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "invalid session"}).encode())
                return
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            out = {"session_id": session_id, "user": sess["user"]}
            self.wfile.write(json.dumps(out).encode())
            return

        if path == "/logout":
            cookies = self.headers.get("Cookie", "") or ""
            session_id = None
            for part in cookies.split(";"):
                if "=" in part:
                    k, v = part.strip().split("=", 1)
                    if k == "session":
                        session_id = v
                        break
            if session_id:
                sessions = load_json(SESSIONS_FILE)
                if session_id in sessions:
                    del sessions[session_id]
                    save_json(SESSIONS_FILE, sessions)
            self.send_response(302)
            self.send_header("Set-Cookie", "session=; Path=/; Max-Age=0; SameSite=Lax")
            self.send_header("Location", "/")
            self.end_headers()
            return

        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/setname":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length).decode("utf-8")
            try:
                data = json.loads(body) if body else {}
            except Exception:
                data = {}
            cookies = self.headers.get("Cookie", "") or ""
            session_id = None
            for part in cookies.split(";"):
                if "=" in part:
                    k, v = part.strip().split("=", 1)
                    if k == "session":
                        session_id = v
                        break
            if not session_id:
                self.send_response(401)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "no session"}).encode())
                return
            sessions = load_json(SESSIONS_FILE)
            sess = sessions.get(session_id)
            if not sess:
                self.send_response(401)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "invalid session"}).encode())
                return
            display_name = (data.get("name") or "").strip()
            if not display_name:
                display_name = f"Usuario_{secrets.token_hex(3)}"
            sess["user"]["display_name"] = display_name
            save_json(SESSIONS_FILE, sessions)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": True, "name": display_name}).encode())
            return

        self.send_response(404)
        self.end_headers()
        return

def run_http_server():
    server = HTTPServer(("0.0.0.0", HTTP_PORT), Handler)
    print(f"[HTTP] Serving HTTP on port {HTTP_PORT} (visit http://localhost:{HTTP_PORT})")
    server.serve_forever()

ROOMS: Dict[str, Set] = {}
WS_USERS: Dict[object, Dict[str, Any]] = {}

async def notify_room(room: str, message: dict):
    conns = set(ROOMS.get(room, set()))
    if not conns:
        return
    data = json.dumps(message, ensure_ascii=False)
    to_remove = []
    for conn in conns:
        try:
            await conn.send(data)
        except Exception:
            to_remove.append(conn)
    for conn in to_remove:
        ROOMS.get(room, set()).discard(conn)
        WS_USERS.pop(conn, None)

async def register(ws, user, room: str, session_id: str):
    # Asegurarse que session_id sea str o None
    session_id = None if session_id is None else str(session_id)
    print(f"[WS] register() -> session_id (repr): {repr(session_id)}, type: {type(session_id)}")
    ROOMS.setdefault(room, set()).add(ws)
    WS_USERS[ws] = {"user": user, "room": room, "session_id": session_id}
    await notify_room(room, {"type": "join", "user": user, "ts": time.time()})

async def unregister(ws):
    info = WS_USERS.get(ws)
    if not info:
        return
    room = info["room"]
    user = info["user"]
    ROOMS.get(room, set()).discard(ws)
    WS_USERS.pop(ws, None)
    await notify_room(room, {"type": "leave", "user": user, "ts": time.time()})

async def ws_handler(conn):
    raw = getattr(conn.request, "path", None)
    if raw is None:
        raw = "/"  

    parsed = urlparse(raw)
    query_params = parse_qs(parsed.query)

    room = query_params.get("room", ["default"])[0]
    session_id = query_params.get("session_id", [None])[0]

    # Buscar usuario por session_id
    user = None
    if session_id:
        sess = load_json(SESSIONS_FILE).get(session_id)
        if sess:
            u = sess["user"]
            user = {
                "name": u.get("display_name") or u.get("name"),
                "email": u.get("email")
            }

    if not user:
        user = {"name": f"Usuario_{secrets.token_hex(3)}", "email": None}

    await register(conn, user, room, session_id)

    lines = read_last_lines(room, n=100)
    try:
        await conn.send(json.dumps({"type": "history", "lines": lines}, ensure_ascii=False))
    except:
        pass

    try:
        async for raw in conn:
            obj = json.loads(raw)
            text = obj.get("text")
            if not text:
                continue

            ts = time.time()
            sess = load_json(SESSIONS_FILE).get(session_id)
            if sess:
                u = sess["user"]
                user_info = {
                    "name": u.get("display_name") or u.get("name"),
                    "email": u.get("email")
                }
            else:
                user_info = {"name": "Anon", "email": None}

            line = f"[{time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(ts))}] {user_info['name']}: {text}"
            append_message_log(room, line)

            await notify_room(room, {
                "type": "message",
                "user": user_info,
                "text": text,
                "ts": ts
            })

    except Exception:
        pass

    finally:
        await unregister(conn)

async def run_ws_server():
    print(f"[WS] Starting WebSocket server on port {WS_PORT}")
    async with websockets.serve(ws_handler, "0.0.0.0", WS_PORT):
        await asyncio.Future()

if __name__ == "__main__":
    t = threading.Thread(target=run_http_server, daemon=True)
    t.start()
    try:
        asyncio.run(run_ws_server())
    except KeyboardInterrupt:
        print("Shutting down.")