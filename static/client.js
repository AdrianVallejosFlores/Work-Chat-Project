(async function () {
  // Espera a que modals.js valide la autenticación y nombre
  let waited = 0;
  while (typeof window.__AUTH_READY__ === "undefined" && waited < 6000) {
    await new Promise(r => setTimeout(r, 100));
    waited += 100;
  }
  if (typeof window.__AUTH_READY__ === "undefined") window.__AUTH_READY__ = true;

  // ---------- DOM ----------
  const status = document.getElementById("status");
  const btnLogout = document.getElementById("btnLogout");
  const chat = document.getElementById("chat");
  const msgInput = document.getElementById("msg");
  const sendBtn = document.getElementById("send");
  const roomSelect = document.getElementById("roomSelect");
  const loading = document.getElementById("loading");
  const chatPanel = document.getElementById("chatPanel");

  let room = "default";
  let session = null;
  let user = null;
  let ws = null;

  // ---------- Helpers ----------
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

  btnLogout.onclick = async () => {
    if (ws) try { ws.close(); } catch { }
    await fetch("/logout");
    window.location.reload();
  };

  roomSelect.innerHTML = `<option value="default">General</option>`;
  roomSelect.value = room;

  roomSelect.onchange = () => {
    room = roomSelect.value;
    chat.innerHTML = "";
    if (ws) try { ws.close(); } catch { }
    if (session) connectWS();
  };

  loading.style.display = "";
  chatPanel.style.display = "block";

  const ok = await fetchSession();
  loading.style.display = "none";

  if (!ok) {
    status.textContent = "No autenticado";
    btnLogout.style.display = "none";
    return;
  }

  status.textContent = `Conectado como ${user.display_name || user.name || user.email || "usuario"}`;
  btnLogout.style.display = "inline-block";

  // ---------- WEBSOCKET ----------
  function connectWS() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${proto}://${location.hostname}:8765/?session_id=${encodeURIComponent(session)}&room=${encodeURIComponent(room)}`;

    console.log("====================================");
    console.log("WS URL:", wsUrl);
    console.log("SESSION:", session);
    console.log("ROOM:", room);
    console.log("USER:", user);
    console.log("====================================");

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
      logLine("Error websocket");
    };

    ws.onmessage = ev => {
      try {
        const obj = JSON.parse(ev.data);

        // ---------- HISTORIAL ----------
        if (obj.type === "history") {
          obj.lines.forEach(t => {

            // Formato nuevo: [fecha] nombre|correo: texto
            let matchNew = t.match(/^\[(.*?)\]\s+([^|]+)\|([^:]+):\s+(.*)$/);

            // Formato viejo: [fecha] nombre: texto (sin correo)
            let matchOld = t.match(/^\[(.*?)\]\s+([^:]+):\s+(.*)$/);

            let dateStr, name, email, text;

            if (matchNew) {
              [, dateStr, name, email, text] = matchNew;
            } else if (matchOld) {
              [, dateStr, name, text] = matchOld;
              email = null; // No había correo en logs viejos
            } else {
              logLine(t, "system");
              return;
            }

            const ts = new Date(dateStr).getTime() / 1000;
            addDaySeparator(ts);

            // Comparación correcta:
            // Si hay correo → comparar por email
            // Si NO hay correo → fallback a nombre (solo para logs viejos)
            const isMe = email
              ? (email === user.email)
              : (name === user.name);

            logLine(
              `<strong>${name}</strong>: ${text}
              <br><span class="msg-time">${new Date(ts * 1000).toLocaleTimeString()}</span>`,
              isMe ? "me" : "user"
            );
          });

          return;
        }

        // ---------- EVENTO JOIN ----------
        if (obj.type === "join") {
          logLine(`➡️ ${obj.user.email} se ha unido`, "system");
          return;
        }

        // ---------- EVENTO LEAVE ----------
        if (obj.type === "leave") {
          logLine(`⬅️ ${obj.user.email} se ha ido`, "system");
          return;
        }

        // ---------- MENSAJE NORMAL ----------
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

  // ---------- Enviar mensaje ----------
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

  // ---------- Separador de días ----------
  let lastDay = null;

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

  connectWS();
})();
