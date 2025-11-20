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

  function logLine(text) {
    const d = document.createElement("div");
    d.textContent = text;
    chat.appendChild(d);
    chat.scrollTop = chat.scrollHeight;
  }

  async function fetchSession() {
    try {
      const r = await fetch("/session", { cache: "no-store" });
      if (r.status === 401) {
        session = null; user = null; return false;
      }
      const j = await r.json();
      session = j.session_id; user = j.user; return true;
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
    const wsUrl = `${proto}://${location.hostname}:8765/?session=${encodeURIComponent(session)}&room=${encodeURIComponent(room)}`;

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
        if (obj.type === "history") obj.lines.forEach(logLine);
        else if (obj.type === "join") logLine(`--> ${obj.user.name} se ha unido`);
        else if (obj.type === "leave") logLine(`--> ${obj.user.name} se ha ido`);
        else if (obj.type === "message") logLine(`[${new Date(obj.ts*1000).toLocaleTimeString()}] ${obj.user.name}: ${obj.text}`);
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

  connectWS();
})();
