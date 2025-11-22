# oauth.py
# =============================================================================
# Módulo de Autenticación OAuth2 con Google
# -----------------------------------------------------------------------------
# Este archivo encapsula todo el flujo OAuth2 para el login con Google:
#
#   1. build_auth_url(state)
#        - Construye la URL a la cual el usuario será redirigido para iniciar
#          el proceso de autenticación de Google.
#
#   2. exchange_code_for_user(code)
#        - Intercambia el "authorization code" recibido en el callback
#          por un "access_token".
#        - Con el access_token solicita los datos del usuario (email, name, sub).
#
# Uso en server.py:
#   - GET /login → redirige al usuario a build_auth_url(...)
#   - GET /oauth2callback → recibe `code`, usa exchange_code_for_user(),
#                           crea sesión y setea cookie.
#
# Notas importantes:
#   - Este módulo solo realiza las llamadas a Google y devuelve el userinfo.
#   - La creación/gestión de sesiones NO sucede aquí, solo en server.py.
#   - No se almacenan tokens a largo plazo: este flujo solo usa access_token.
#   - Para aplicaciones de producción se recomienda:
#       * Verificación de "state" (CSRF).
#       * Validar el ID Token con firma JWT (opcional, según seguridad).
#       * Manejo seguro de refresh_tokens si se habilitan.
# =============================================================================

import os
import requests
from urllib.parse import urlencode
from dotenv import load_dotenv

# Cargar variables del .env
load_dotenv()

# Configuración del cliente OAuth2
CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
REDIRECT_URI = os.environ.get("GOOGLE_REDIRECT_URI", "https://developers.google.com/oauthplayground")

# Scopes que solicitaremos a Google
SCOPES = ["openid", "email", "profile"]

# URLs oficiales de Google OAuth2
AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"


# Funciones principales del flujo OAuth2
def build_auth_url(state: str) -> str:
    params = {
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "include_granted_scopes": "true",
        "state": state,
        "prompt": "select_account",
    }
    return f"{AUTH_BASE}?{urlencode(params)}"


def exchange_code_for_user(code: str) -> dict:
    data = {
        "code": code,
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "redirect_uri": REDIRECT_URI,
        "grant_type": "authorization_code",
    }

    r = requests.post(TOKEN_URL, data=data, timeout=10)
    r.raise_for_status()
    tokens = r.json()

    access_token = tokens.get("access_token")
    if not access_token:
        raise Exception("No access token received from Google during OAuth exchange.")

    headers = {"Authorization": f"Bearer {access_token}"}
    r2 = requests.get(USERINFO_URL, headers=headers, timeout=10)
    r2.raise_for_status()

    return r2.json()