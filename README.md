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

Work-Chat-Project
├── server.py
├── oauth.py
├── requirements.txt
├── README.md
├── .env
├── data/
│   ├── users.json
│   ├── rooms.json
│   ├── sessions.json
│   └── messages/
│       └── general.log
└── static/
    ├── index.html
    └── client.js

---

## 🧪 Requisitos

Instalar dependencias:

```bash
pip install -r requirements.txt