# server.py
# =============================================================================
# Servidor principal de Work-Chat
# -----------------------------------------------------------------------------
# Responsabilidades de este módulo:
# - Servir la SPA del cliente (HTML/JS/CSS) vía HTTP.
# - Gestionar el flujo de autenticación Google OAuth2 (/login, /oauth2callback).
# - Crear y gestionar sesiones de usuario basadas en cookies.
# - Exponer un endpoint HTTP para obtener la sesión actual (/session)
#   y para actualizar el nombre visible del usuario (/setname).
# - Mantener un servidor WebSocket para el chat en tiempo real:
#     * Manejo de salas (rooms).
#     * Broadcast de mensajes, eventos de join/leave.
#     * Persistencia de logs de mensajes por sala.
#
# Notas de diseño:
# - Para simplicidad, la persistencia se maneja con archivos JSON y logs .log.
# - Se usa un único proceso con:
#     * HTTPServer (thread bloqueante) en un hilo separado.
#     * WebSocket server (asyncio) en el hilo principal.
# - El acceso a archivos se protege con un LOCK de threading para evitar
#   condiciones de carrera en lectura/escritura.
#
# =============================================================================

import os
import json
import threading
import asyncio
import time
from http.server import SimpleHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse
import secrets
from pathlib import Path
from typing import Dict, Any, Set, Optional

import websockets
from websockets.exceptions import ConnectionClosedOK, ConnectionClosedError
from dotenv import load_dotenv

from oauth import build_auth_url, exchange_code_for_user

# Carga de variables de entorno desde .env
load_dotenv()

# Configuración básica y rutas de archivos
HOST = os.environ.get("HOST", "0.0.0.0")
HTTP_PORT = int(os.environ.get("HTTP_PORT", 8000))
WS_PORT = int(os.environ.get("WS_PORT", 8765))

DATA_DIR = Path("data")
MESSAGES_DIR = DATA_DIR / "messages"
SESSIONS_FILE = DATA_DIR / "sessions.json"
USERS_FILE = DATA_DIR / "users.json"
ROOMS_FILE = DATA_DIR / "rooms.json"

# Aseguramos existencia de directorios base
DATA_DIR.mkdir(exist_ok=True)
MESSAGES_DIR.mkdir(exist_ok=True)

# Inicializamos archivos JSON con estructura mínima en caso de que no existan
initial_files = [
    (SESSIONS_FILE, {}),
    (USERS_FILE, {}),
    (ROOMS_FILE, {"default": {"name": "General", "description": "Sala principal"}}),
]
for fpath, default in initial_files:
    if not fpath.exists():
        fpath.write_text(json.dumps(default, indent=2, ensure_ascii=False), encoding="utf-8")

# LOCK global para acceso concurrente a archivos
LOCK = threading.Lock()

# Utilidades de acceso a archivos JSON / logs
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
            # En un entorno productivo se podría loguear este error
            return {}


def save_json(path: Path, data: Dict[str, Any]) -> None:
    with LOCK:
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def append_message_log(room: str, line: str) -> None:
    path = MESSAGES_DIR / f"{room}.log"
    with LOCK:
        with open(path, "a", encoding="utf-8") as fh:
            fh.write(line + "\n")


def read_last_lines(room: str, n: int = 50) -> list[str]:
    path = MESSAGES_DIR / f"{room}.log"
    if not path.exists():
        return []
    with LOCK:
        with open(path, "r", encoding="utf-8", errors="ignore") as fh:
            lines = fh.read().splitlines()
    return lines[-n:]

# Sesiones y usuarios
def create_session(userinfo: dict) -> str:
    sessions = load_json(SESSIONS_FILE)
    session_id = secrets.token_urlsafe(16)

    user_record = {
        "sub": userinfo.get("sub"),
        "email": userinfo.get("email"),
        "name": userinfo.get("name") or (userinfo.get("email") or "").split("@")[0],
        # display_name es editable luego por el usuario vía /setname
        "display_name": userinfo.get("display_name") or None,
    }

    sessions[session_id] = {
        "user": user_record,
        "created_at": time.time(),
    }
    save_json(SESSIONS_FILE, sessions)

    # Persistimos también el usuario en el archivo global de usuarios
    users = load_json(USERS_FILE)
    users_key = (
        str(userinfo.get("sub"))
        if userinfo.get("sub") is not None
        else user_record["email"] or user_record["name"]
    )
    users[users_key] = user_record
    save_json(USERS_FILE, users)

    return session_id


def get_session(session_id: str) -> Optional[dict]:
    sessions = load_json(SESSIONS_FILE)
    return sessions.get(session_id)


def extract_session_id_from_cookie(cookie_header: str) -> Optional[str]:
    cookies = cookie_header or ""
    session_id = None
    for part in cookies.split(";"):
        if "=" in part:
            k, v = part.strip().split("=", 1)
            if k == "session":
                session_id = v
                break
    return session_id

# Handler HTTP (estático + endpoints de autenticación y sesión)
class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path: str) -> str:
        p = urlparse(path).path
        root = Path.cwd()

        if p == "/":
            return str(root / "static" / "index.html")
        if p.startswith("/static/"):
            sub = p[len("/static/") :].lstrip("/")
            return str(root / "static" / sub)

        return super().translate_path(path)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        
        if path == "/login":
            state = secrets.token_urlsafe(8)
            url = build_auth_url(state)
            self.send_response(302)
            self.send_header("Location", url)
            self.end_headers()
            return

        # --- Callback de OAuth, crea sesión y setea cookie ---
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

        # --- Devuelve la sesión actual (si existe) ---
        if path == "/session":
            cookie_header = self.headers.get("Cookie", "") or ""
            session_id = extract_session_id_from_cookie(cookie_header)

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

        # --- Logout: borra la sesión y limpia la cookie ---
        if path == "/logout":
            cookie_header = self.headers.get("Cookie", "") or ""
            session_id = extract_session_id_from_cookie(cookie_header)

            if session_id:
                sessions = load_json(SESSIONS_FILE)
                if session_id in sessions:
                    del sessions[session_id]
                    save_json(SESSIONS_FILE, sessions)

            self.send_response(302)
            # Max-Age=0 expira la cookie inmediatamente
            self.send_header("Set-Cookie", "session=; Path=/; Max-Age=0; SameSite=Lax")
            self.send_header("Location", "/")
            self.end_headers()
            return

        # Si no es ningún endpoint especial, delegar a estáticos
        return super().do_GET()

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/setname":
            # Leer body como JSON
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length).decode("utf-8")
            try:
                data = json.loads(body) if body else {}
            except Exception:
                data = {}

            # Obtener session_id desde cookie
            cookie_header = self.headers.get("Cookie", "") or ""
            session_id = extract_session_id_from_cookie(cookie_header)

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

            # Normalización del nombre visible
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

        # Otros POST no están soportados
        self.send_response(404)
        self.end_headers()
        return


def run_http_server() -> None:
    server = HTTPServer((HOST, HTTP_PORT), Handler)
    print(f"[HTTP] Serving HTTP on {HOST}:{HTTP_PORT} (visit http://localhost:{HTTP_PORT})")
    server.serve_forever()



# ROOMS: room_id -> set de conexiones WebSocket
ROOMS: Dict[str, Set] = {}

# WS_USERS: websocket -> info usuario (user, room, session_id)
WS_USERS: Dict[object, Dict[str, Any]] = {}


async def notify_room(room: str, message: dict) -> None:
    conns = set(ROOMS.get(room, set()))
    if not conns:
        return

    data = json.dumps(message, ensure_ascii=False)
    to_remove = []

    for conn in conns:
        try:
            await conn.send(data)
        except (ConnectionClosedOK, ConnectionClosedError, RuntimeError):
            to_remove.append(conn)
        except Exception:
            # Cualquier otro error de envío también invalida la conexión
            to_remove.append(conn)

    # Limpieza de conexiones cerradas
    for conn in to_remove:
        ROOMS.get(room, set()).discard(conn)
        WS_USERS.pop(conn, None)


async def register(ws, user: dict, room: str, session_id: Optional[str]) -> None:
    session_id = None if session_id is None else str(session_id)

    # Útil para debug; se puede silenciar en producción
    print(f"[WS] register() -> session_id (repr): {repr(session_id)}, type: {type(session_id)}")

    ROOMS.setdefault(room, set()).add(ws)
    WS_USERS[ws] = {"user": user, "room": room, "session_id": session_id}

    await notify_room(room, {"type": "join", "user": user, "ts": time.time()})


async def unregister(ws) -> None:
    info = WS_USERS.get(ws)
    if not info:
        return

    room = info.get("room")
    user = info.get("user")

    ROOMS.get(room, set()).discard(ws)
    WS_USERS.pop(ws, None)

    await notify_room(room, {"type": "leave", "user": user, "ts": time.time()})

# Handler principal de WebSocket
async def ws_handler(conn):
    # Algunos servidores/implementaciones ponen la ruta en conn.request.path
    raw = getattr(conn.request, "path", None)
    if raw is None:
        raw = "/"

    try:
       
        # 1. Parseo de parámetros
        parsed = urlparse(raw)
        query_params = parse_qs(parsed.query)

        room = query_params.get("room", ["default"])[0]
        session_id = query_params.get("session_id", [None])[0]

        # 2. Obtener usuario por session_id
        user = None
        if session_id:
            sess = load_json(SESSIONS_FILE).get(session_id)
            if sess:
                u = sess.get("user", {})
                user = {
                    "name": u.get("display_name") or u.get("name"),
                    "email": u.get("email"),
                }

        # Fallback si no existe usuario (sesión inválida o anónima)
        if not user:
            user = {"name": f"Usuario_{secrets.token_hex(3)}", "email": None}

        # Registrar la conexión en la sala
        await register(conn, user, room, session_id)

        # 3. Enviar historial al recién conectado
        raw_lines = read_last_lines(room, n=100)
        history = []
        for ln in raw_lines:
            try:
                history.append(json.loads(ln))
            except Exception:
                # Línea no JSON → ignorar sin romper nada
                pass

        try:
            # Nota: actualmente se envían las líneas en texto plano.
            # Si el cliente espera objetos JSON, se podría usar `history`.
            await conn.send(json.dumps({"type": "history", "lines": raw_lines}, ensure_ascii=False))
        except Exception:
            # Si falla enviar historial, no se cierra la conexión, solo se continúa.
            pass

        # 4. Bucle principal → recepción de mensajes
        async for raw_msg in conn:
            # Intentar parsear JSON del mensaje
            try:
                obj = json.loads(raw_msg)
            except Exception:
                # Mensaje mal formado → se ignora
                continue

            text = obj.get("text")
            if not text:
                # Mensajes sin campo "text" se ignoran
                continue

            ts = time.time()

            # Refrescar usuario desde session_id en cada mensaje
            sess = load_json(SESSIONS_FILE).get(session_id) if session_id else None
            if sess:
                u = sess.get("user", {})
                user_info = {
                    "name": u.get("display_name") or u.get("name"),
                    "email": u.get("email"),
                }
            else:
                # Fallback: último user conocido o anónimo
                user_info = {
                    "name": user.get("name") or "Anon",
                    "email": user.get("email"),
                }

            # Guardar registro como línea de log (texto plano)
            line = (
                f"[{time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(ts))}] "
                f"{user_info['name']}|{user_info['email']}: {text}"
            )
            append_message_log(room, line)

            # Broadcast a todos los clientes de la sala
            await notify_room(
                room,
                {
                    "type": "message",
                    "user": user_info,
                    "text": text,
                    "ts": ts,
                },
            )

    except (ConnectionClosedOK, ConnectionClosedError):
        # Cierre limpio del cliente
        pass
    except Exception as e:
        # Errores inesperados durante el ciclo de vida del WebSocket
        print(f"[WS] Error in handler: {e}")
    finally:
        # Siempre desregistrar conexión al salir
        await unregister(conn)


async def run_ws_server() -> None:
    """
    Arranca el servidor WebSocket y mantiene el loop activo indefinidamente.
    """
    print(f"[WS] Starting WebSocket server on {HOST}:{WS_PORT}")
    async with websockets.serve(ws_handler, HOST, WS_PORT):
        # asyncio.Future() nunca se resuelve → el servidor corre "para siempre"
        await asyncio.Future()


# Punto de entrada principal
if __name__ == "__main__":
    # Levantamos servidor HTTP en un hilo separado
    t = threading.Thread(target=run_http_server, daemon=True)
    t.start()

    # Ejecutamos el servidor WebSocket en el hilo principal (asyncio)
    try:
        asyncio.run(run_ws_server())
    except KeyboardInterrupt:
        print("Shutting down.")
