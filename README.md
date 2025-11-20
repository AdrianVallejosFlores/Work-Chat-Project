# Work-Chat-Project
Este proyecto corresponde a un sistema de chat colaborativo que permite a los usuarios y miembros del equipo comunicarse mediante salas de chat públicas y privadas. Incluye autenticación mediante Google e integra un servicio WebSocket para garantizar el envío de mensajes en tiempo real.


# Chat Colaborativo en Tiempo Real (Solo Python)

Este proyecto implementa un chat colaborativo en tiempo real usando únicamente **Python**, sin backend separado ni frameworks de frontend.

El servidor maneja:

- WebSockets para comunicación en tiempo real
- Servidor HTTP simple para servir la SPA
- Autenticación mediante Google OAuth2
- Persistencia usando archivos JSON y logs

---

## 🗂 Estructura del Proyecto

Work-Chat-Project/
├── server.py           # Servidor principal: HTTP + WebSocket + manejo de sesiones
├── oauth.py            # Módulo de autenticación Google OAuth2
├── requirements.txt    # Dependencias del proyecto
├── README.md           # Documentación del proyecto
├── .env                # Variables de entorno
├── data/               # Carpeta de persistencia interna
│   ├── users.json      # Usuarios autenticados
│   ├── rooms.json      # Salas registradas
│   ├── sessions.json   # Sesiones activas
│   └── messages/       # Logs de mensajes por sala
│       ├── default.log # Historial de sala 'default'
└── static/             # Archivos del cliente web (SPA)
    ├── index.html      # Interfaz principal del chat
    └── client.js       # Lógica del cliente y conexión WebSocket

---

## 🧪 Requisitos

Instalar dependencias:

```bash
pip install -r requirements.txt