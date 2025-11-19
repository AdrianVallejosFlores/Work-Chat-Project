# oauth.py
import os
import requests
from urllib.parse import urlencode
from dotenv import load_dotenv 

# Cargar las variables del archivo .env
load_dotenv()

# Config: lee de variables de entorno
CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
REDIRECT_URI = os.environ.get("GOOGLE_REDIRECT_URI", "https://developers.google.com/oauthplayground")
SCOPES = ["openid", "email", "profile"]

AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"

def build_auth_url(state: str):
    params = {
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "include_granted_scopes": "true",
        "state": state,
        "prompt": "select_account"
    }
    return f"{AUTH_BASE}?{urlencode(params)}"

def exchange_code_for_user(code: str):
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
        raise Exception("No access token received from Google.")

    headers = {"Authorization": f"Bearer {access_token}"}
    r2 = requests.get(USERINFO_URL, headers=headers, timeout=10)
    r2.raise_for_status()
    return r2.json()
