# Work-Chat-Project
Este proyecto corresponde a un sistema de chat colaborativo que permite a los usuarios y miembros del equipo comunicarse mediante salas de chat públicas y privadas. Incluye autenticación mediante Google e integra un servicio WebSocket para garantizar el envío de mensajes en tiempo real.


# Chat Colaborativo en Tiempo Real con Python

Este proyecto implementa un chat colaborativo en tiempo real usando únicamente **Python**, sin backend separado ni frameworks de frontend.

El servidor maneja:

- WebSockets para comunicación en tiempo real
- Servidor HTTP simple para servir la SPA
- Autenticación mediante Google OAuth2
- Persistencia usando archivos JSON y logs

---

# Estructura del Proyecto

```txt
Work-Chat-Project
├── server.py          → Servidor HTTP + WebSocket + sesiones
├── oauth.py           → Autenticación Google OAuth2
├── requirements.txt   → Dependencias del proyecto
├── README.md          → Documentación
├── .env               → Variables de entorno
├── data/
│   ├── users.json     → Usuarios autenticados
│   ├── rooms.json     → Salas registradas
│   ├── sessions.json  → Sesiones activas
│   └── messages/
│       └── general.log
└── static/
    ├── index.html     → Interfaz SPA del chat
    └── client.js      → Lógica WebSocket del cliente
```

# Requisitos

Instalar dependencias:

```bash
pip install -r requirements.txt
