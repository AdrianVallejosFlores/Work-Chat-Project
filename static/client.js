(async function () {
  // Espera a que modals.js valide la autenticación y nombre
  let waited = 0;
  while (typeof window.__AUTH_READY__ === "undefined" && waited < 6000) {
    await new Promise(r => setTimeout(r, 100));
    waited += 100;
  }
  // Si no se definió después de 6s, lo asumimos true para evitar bloqueo en pruebas
  if (typeof window.__AUTH_READY__ === "undefined") window.__AUTH_READY__ = true;

  // ---------- resto del cliente ----------
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

  function logLine(text, type = "system") {
  const wrap = document.createElement("div");
  wrap.classList.add("msg-line");

  // Tipo de burbuja
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
        session = null; user = null; return false;
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
    if (ws) try { ws.close(); } catch {}
    await fetch("/logout");
    window.location.reload();
  };

  roomSelect.innerHTML = `<option value="default">General</option>`;
  roomSelect.value = room;
  roomSelect.onchange = () => {
    room = roomSelect.value;
    chat.innerHTML = "";
    if (ws) try { ws.close(); } catch {}
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

  function connectWS() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    // Usa hostname + puerto WS (8765)
    const wsUrl = `${proto}://${location.hostname}:8765/?session_id=${encodeURIComponent(session)}&room=${encodeURIComponent(room)}`;


        // ---- LOGS EXTRA PARA DEPURAR ----
    console.log("====================================");
    console.log("WS URL generada:", wsUrl);
    console.log("Session ID usado:", session);
    console.log("Room actual:", room);
    console.log("Usuario detectado en cliente:", user);
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
    ws.onerror = (e) => { console.error("ws err", e); logLine("Error websocket"); };

    ws.onmessage = ev => {
      try {
        const obj = JSON.parse(ev.data);
      if (obj.type === "history") {
  obj.lines.forEach(t => {
    // Ejemplo de línea: "[2025-11-20 19:03:56] Gabriel: hola"

    const match = t.match(/^\[(.*?)\]\s+(.*?):\s+(.*)$/);
    if (!match) {
      logLine(t, "system");
      return;
    }

    const [, dateStr, name, text] = match;
    const ts = new Date(dateStr).getTime() / 1000;

    const isMe = (name === user.name);
    addDaySeparator(ts);

    logLine(
      `<strong>${name}</strong>: ${text}
       <br><span class="msg-time">${new Date(ts * 1000).toLocaleTimeString()}</span>`,
      isMe ? "me" : "user"
    );
  });

  return; // <- importante para no procesar el historial como mensaje normal
}

else if (obj.type === "join") {
  logLine(`➡️ ${obj.user.name} se ha unido`, "system");
}
else if (obj.type === "leave") {
  logLine(`⬅️ ${obj.user.name} se ha ido`, "system");
}
else if (obj.type === "message") {
  addDaySeparator(obj.ts);
  const time = new Date(obj.ts * 1000).toLocaleTimeString();
  const isMe = (obj.user.email === user.email);
  
  logLine(
    `<strong>${obj.user.name}</strong>: ${obj.text}<br><span class="msg-time">${time}</span>`,
    isMe ? "me" : "user"
  );
}
      } catch (e) {
        console.error("parse msg", e);
      }
    };
  }

  sendBtn.onclick = () => {
    const text = msgInput.value.trim();
    if (!text) return;
    if (!ws || ws.readyState !== WebSocket.OPEN) { logLine("WebSocket no conectado."); return; }
    ws.send(JSON.stringify({ text }));
    msgInput.value = "";
  };
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
