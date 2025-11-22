/* ============================================================================
   client.js — Lógica principal del cliente Web (SPA)
   ----------------------------------------------------------------------------
   Este archivo controla:

   ✔ Autenticación del usuario (validada previamente por modals.js)
   ✔ Gestión de la interfaz de chat
   ✔ Conexión WebSocket con el servidor
   ✔ Cambio dinámico de salas (rooms)
   ✔ Render de mensajes, historial y separadores por día
   ✔ Envío de mensajes

   Flujo general:
   ---------------------------------------------------------------------------
   1. Esperar a que modals.js termine autenticación y nombre de usuario.
   2. Llamar a /session para obtener sesión y datos del usuario.
   3. Conectarse por WebSocket a ws://.../?session_id=...&room=...
   4. Procesar historial, eventos join/leave y mensajes.
   5. Permitir cambiar de sala sin recargar la página.
   =========================================================================== */

(async function () {

  // ==========================================================================
  // 1) ESPERAR A QUE AUTH ESTÉ LISTO (variable expuesta por modals.js)
  // ==========================================================================
  let waited = 0;
  while (typeof window.__AUTH_READY__ === "undefined" && waited < 6000) {
    await new Promise(r => setTimeout(r, 100));
    waited += 100;
  }
  if (typeof window.__AUTH_READY__ === "undefined") window.__AUTH_READY__ = true;

  // ==========================================================================
  // 2) REFERENCIAS DOM
  // ==========================================================================
  const status = document.getElementById("status");
  const btnLogout = document.getElementById("btnLogout");
  const chat = document.getElementById("chat");
  const msgInput = document.getElementById("msg");
  const sendBtn = document.getElementById("send");
  const roomSelect = document.getElementById("roomSelect");
  const loading = document.getElementById("loading");
  const chatPanel = document.getElementById("chatPanel");

  // ==========================================================================
  // 3) ESTADO LOCAL DEL CLIENTE
  // ==========================================================================
  let room = "default";   // Sala actual
  let session = null;     // session_id obtenido de /session
  let user = null;        // Datos del usuario actual
  let ws = null;          // WebSocket activo

  // ==========================================================================
  // 4) Helpers UI
  // ==========================================================================
  function logLine(text, type = "system") {
    const wrap = document.createElement("div");
    wrap.classList.add("msg-line");

    if (type === "me") wrap.classList.add("msg-me");
    else if (type === "user") wrap.classList.add("msg-user");
    else wrap.classList.add("msg-system");

    wrap.innerHTML = text;
    chat.appendChild(wrap);
    chat.scrollTop = chat.scrollHeight;
  }

  /**
   * Consulta la sesión actual vía /session
   */
  async function fetchSession() {
    try {
      const r = await fetch("/session", { cache: "no-store" });

      if (r.status === 401) {
        session = null;
        user = null;
        return false;
      }

      const j = await r.json();
      session = j.session_id;
      user = j.user;
      return true;

    } catch (e) {
      console.error("fetchSession", e);
      return false;
    }
  }

  // ==========================================================================
  // 5) LOGOUT
  // ==========================================================================
  btnLogout.onclick = async () => {
    if (ws) try { ws.close(); } catch { }
    await fetch("/logout");
    window.location.reload();
  };

  // ==========================================================================
  // 6) CONFIGURACIÓN DE SALAS
  // ==========================================================================
  roomSelect.innerHTML = `<option value="default">General</option>`;
  roomSelect.value = room;

  roomSelect.onchange = () => {
    room = roomSelect.value;
    chat.innerHTML = "";
    if (ws) try { ws.close(); } catch { }
    if (session) connectWS();
  };

  // ==========================================================================
  // 7) OBTENER SESIÓN
  // ==========================================================================
  loading.style.display = "";
  chatPanel.style.display = "block";

  const ok = await fetchSession();
  loading.style.display = "none";

  if (!ok) {
    status.textContent = "No autenticado";
    btnLogout.style.display = "none";
    return;
  }

  status.textContent =
    `Conectado como ${user.display_name || user.name || user.email || "usuario"}`;
  btnLogout.style.display = "inline-block";

  // ==========================================================================
  // 8) WEBSOCKET
  // ==========================================================================

  /**
   * Conecta al servidor WebSocket.
   *
   * Parametros enviados al servidor:
   *   - session_id: mantiene la identidad
   *   - room: sala seleccionada
   */
  function connectWS() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const wsUrl =
      `${proto}://${location.hostname}:8765/?session_id=${encodeURIComponent(session)}&room=${encodeURIComponent(room)}`;

    logLine("Conectando a " + wsUrl);

    try {
      ws = new WebSocket(wsUrl);
    } catch (e) {
      logLine("Error creando WebSocket: " + e);
      return;
    }

    ws.onopen = () => logLine("Conexión establecida.");
    ws.onclose = () => logLine("Conexión cerrada.");
    ws.onerror = e => {
      console.error("ws error", e);
      logLine("Error WebSocket");
    };

    // Procesador de mensajes del servidor
    ws.onmessage = ev => {
      try {
        const obj = JSON.parse(ev.data);

        // ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
        //  HISTORIAL
        // ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
        if (obj.type === "history") {
          obj.lines.forEach(t => renderHistoryLine(t));
          return;
        }

        // ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
        //  EVENTO JOIN
        // ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
        if (obj.type === "join") {
          logLine(`➡️ ${obj.user.email} se ha unido`, "system");
          return;
        }

        // ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
        //  EVENTO LEAVE
        // ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
        if (obj.type === "leave") {
          logLine(`⬅️ ${obj.user.email} se ha ido`, "system");
          return;
        }

        // ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
        //  MENSAJE NORMAL
        // ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
        if (obj.type === "message") {
          addDaySeparator(obj.ts);

          const time = new Date(obj.ts * 1000).toLocaleTimeString();
          const isMe = (obj.user.email === user.email);

          logLine(
            `<strong>${obj.user.name}</strong>: ${obj.text}<br>
             <span class="msg-time">${time}</span>`,
            isMe ? "me" : "user"
          );
          return;
        }

      } catch (e) {
        console.error("parse msg", e);
      }
    };
  }

  // ==========================================================================
  // 9) PROCESAR LÍNEAS DE HISTORIAL (distintos formatos)
  // ==========================================================================
  function renderHistoryLine(t) {

    // Formato nuevo: [fecha] nombre|correo: texto
    let matchNew = t.match(/^\[(.*?)\]\s+([^|]+)\|([^:]+):\s+(.*)$/);

    // Formato viejo: [fecha] nombre: texto
    let matchOld = t.match(/^\[(.*?)\]\s+([^:]+):\s+(.*)$/);

    let dateStr, name, email, text;

    if (matchNew) {
      [, dateStr, name, email, text] = matchNew;

    } else if (matchOld) {
      [, dateStr, name, text] = matchOld;
      email = null; // Logs viejos sin correo

    } else {
      logLine(t, "system");
      return;
    }

    const ts = new Date(dateStr).getTime() / 1000;
    addDaySeparator(ts);

    const isMe = email
      ? (email === user.email)
      : (name === user.name); // fallback para logs viejos

    logLine(
      `<strong>${name}</strong>: ${text}
       <br><span class="msg-time">${new Date(ts * 1000).toLocaleTimeString()}</span>`,
      isMe ? "me" : "user"
    );
  }

  // ==========================================================================
  // 10) Enviar mensajes
  // ==========================================================================
  sendBtn.onclick = () => {
    const text = msgInput.value.trim();
    if (!text) return;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      logLine("WebSocket no conectado.");
      return;
    }
    ws.send(JSON.stringify({ text }));
    msgInput.value = "";
  };

  // ==========================================================================
  // 11) Separador de días para historial y mensajes
  // ==========================================================================
  let lastDay = null;

  /**
   * Inserta un separador visual cuando cambia el día.
   */
  function addDaySeparator(ts) {
    const date = new Date(ts * 1000);
    const dayStr = date.toLocaleDateString("es-ES", {
      weekday: "long",
      day: "numeric",
      month: "long"
    });

    if (lastDay === dayStr) return;
    lastDay = dayStr;

    const sep = document.createElement("div");
    sep.classList.add("day-separator");
    sep.textContent = dayStr;
    chat.appendChild(sep);
  }

  // ==========================================================================
  // 12) ¡Conectar ahora!
  // ==========================================================================
  connectWS();
})();
