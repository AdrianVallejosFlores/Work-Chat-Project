// static/client.js
(async function () {
  const status = document.getElementById("status");
  const btnLogin = document.getElementById("btnLogin");
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

  // ---------- Session handling ----------
  async function fetchSession() {
    try {
      const r = await fetch("/session", { cache: "no-store" });
      if (r.status === 401) {
        // no session
        session = null;
        user = null;
        return false;
      }
      if (!r.ok) throw new Error("error fetching session");
      const j = await r.json();
      session = j.session_id;
      user = j.user;
      return true;
    } catch (e) {
      console.error("fetchSession error:", e);
      session = null;
      user = null;
      return false;
    }
  }

  btnLogin.onclick = () => {
    window.location.href = "/login";
  };

  btnLogout.onclick = async () => {
    // close ws before logout
    if (ws) {
      try { ws.close(); } catch {}
      ws = null;
    }
    await fetch("/logout");
    // reload page to show login UI
    window.location.reload();
  };

  // Rooms dropdown basic
  roomSelect.innerHTML = `<option value="default">General</option>`;
  roomSelect.value = room;
  roomSelect.onchange = () => {
    room = roomSelect.value;
    if (ws) {
      try { ws.close(); } catch {}
      ws = null;
    }
    // reconnect with new room (only if logged)
    if (session) connectWS();
  };

  // Hide chat UI until we know session
  loading.style.display = "";
  chatPanel.style.display = "none";

  const hasSession = await fetchSession();

  // hide loading after check
  loading.style.display = "none";

  if (!hasSession) {
    // show login UI (status + login button are always visible in the HTML)
    status.textContent = "No autenticado";
    btnLogin.style.display = "inline-block";
    btnLogout.style.display = "none";
    return; // do not open WS
  }

  // If we reached here, we have session+user
  status.textContent = `Conectado como ${user.name} (${user.email || "sin email"})`;
  btnLogin.style.display = "none";
  btnLogout.style.display = "inline-block";
  chatPanel.style.display = "block";

  // ---------- WebSocket ----------
  function connectWS() {
    // build ws url. If you deploy to same origin but different port, adjust accordingly.
    const proto = location.protocol === "https:" ? "wss" : "ws";
    // Use location.hostname so it works on deployed host; port is WS port (default 8765)
    const wsUrl = `${proto}://${location.hostname}:8765/?session=${encodeURIComponent(session || "")}&room=${encodeURIComponent(room)}`;

    logLine("Conectando a " + wsUrl);
    try {
      ws = new WebSocket(wsUrl);
    } catch (e) {
      logLine("Error creando WebSocket: " + e);
      ws = null;
      return;
    }

    ws.onopen = () => logLine("Conexión establecida.");
    ws.onclose = () => logLine("Conexión cerrada.");
    ws.onerror = (err) => {
      console.error("WS error", err);
      logLine("Error WebSocket.");
    };

    ws.onmessage = (ev) => {
      try {
        const obj = JSON.parse(ev.data);
        if (obj.type === "history") {
          obj.lines.forEach(l => logLine(l));
        } else if (obj.type === "join") {
          logLine(`--> ${obj.user.name} se ha unido`);
        } else if (obj.type === "leave") {
          logLine(`--> ${obj.user.name} se ha ido`);
        } else if (obj.type === "message") {
          logLine(`[${new Date(obj.ts * 1000).toLocaleTimeString()}] ${obj.user.name}: ${obj.text}`);
        } else {
          // otros eventos
          console.log("evento ws:", obj);
        }
      } catch (e) {
        console.error("Error parsing WS message", e);
      }
    };
  }

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

  // start ws
  connectWS();
})();
