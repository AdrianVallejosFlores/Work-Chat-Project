# 🚀 Work-Chat-Project  
### Chat Colaborativo en Tiempo Real con Python + WebSockets + OAuth2

Work-Chat es un sistema de mensajería en tiempo real que permite a miembros de un equipo comunicarse mediante salas públicas o privadas.  
Está implementado **solo con Python**, sin frameworks adicionales como Django o Flask, y utiliza un **cliente SPA** escrito en JavaScript puro.

Incluye:

- 🔐 Autenticación con **Google OAuth2**
- ⚡ WebSockets para mensajería en tiempo real
- 💾 Persistencia ligera con **archivos JSON + logs**
- 🎨 Interfaz SPA moderna (HTML + CSS + JS)
- 🧭 Backend + frontend en un solo servidor

---

# 📌 Características Principales

### ✔ Autenticación Google OAuth2  
El usuario debe iniciar sesión mediante Google para participar en el chat.  
Tras el login, se almacena localmente un `session_id` en una cookie.

### ✔ WebSocket en tiempo real  
Cada usuario mantiene una conexión WebSocket con el servidor de Python.  
Esto permite:

- Recepción inmediata de mensajes  
- Eventos de **join / leave**  
- Envío de historial reciente al conectarse  
- Manejo de múltiples salas

### ✔ Sistema de Salas  
El cliente puede cambiar entre salas (room), y cada sala tiene su propio log persistente.

### ✔ Persistencia sin base de datos  
El proyecto usa almacenamiento local en:

- `users.json`  
- `sessions.json`  
- `rooms.json`  
- `messages/<room>.log`  

Esto facilita portabilidad, pruebas rápidas y mantenimiento local.

---

# 📁 Estructura del Proyecto

```txt
Work-Chat-Project
├── server.py          → Servidor HTTP + WebSocket + manejo de sesiones
├── oauth.py           → Flujo de autenticación Google OAuth2
├── requirements.txt   → Dependencias del proyecto
├── README.md          → Documentación
├── .env               → Credenciales del OAuth y puertos
├── data/
│   ├── users.json     → Usuarios autenticados históricamente
│   ├── rooms.json     → Salas registradas
│   ├── sessions.json  → Sesiones activas
│   └── messages/
│       └── general.log → Historial de sala “default”
└── static/
    ├── index.html     → Interfaz SPA del chat
    ├── client.js      → Lógica WebSocket del cliente
    ├── modals.js      → Control de modales de autenticación y nombre
    ├── style.css      → Estilos generales del chat
    └── modal.css      → Estilos de modales

```

# 🛠 Dependencias

Instalar los requisitos:

```bash
pip install -r requirements.txt

```

# ▶️ Ejecución en local

Simplemente ejecutar el comando especificacdo y entrar a la ruta local: http://localhost:8000

```bash
python server.py



