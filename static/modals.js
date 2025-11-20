(async function () {
  const backdrop = document.getElementById("backdrop");
  const modalLogin = document.getElementById("modalLogin");
  const modalUsername = document.getElementById("modalUsername");
  const chatPanel = document.getElementById("chatPanel");
  const btnLoginModal = document.getElementById("btnLoginModal");
  const usernameInput = document.getElementById("usernameInput");
  const btnUseInput = document.getElementById("btnUseInput");
  const btnUseEmail = document.getElementById("btnUseEmail");
  const btnUseDefault = document.getElementById("btnUseDefault");
  const statusEl = document.getElementById("status");

  function showBackdrop() {
    backdrop.style.display = "block";
    chatPanel.classList.add("blurred");
  }

  function hideBackdrop() {
    backdrop.style.display = "none";
    chatPanel.classList.remove("blurred");
  }

  function showModal(el) {
    el.style.display = "block";
    el.setAttribute("aria-hidden", "false");
  }

  function hideModal(el) {
    el.style.display = "none";
    el.setAttribute("aria-hidden", "true");
  }

  async function fetchSession() {
    try {
      const r = await fetch("/session", { cache: "no-store" });
      if (!r.ok) return null;
      return await r.json();
    } catch (e) {
      return null;
    }
  }

  // ---------------------- LÓGICA PRINCIPAL ------------------------
  const session = await fetchSession();

  // --- PRIMER MODAL → LOGIN ---
  if (!session) {
    showBackdrop();
    showModal(modalLogin);
    statusEl.textContent = "No autenticado";

    btnLoginModal.onclick = () => {
      window.location.href = "/login";
    };

    return; // client.js seguirá cuando __AUTH_READY__ sea true
  }

  // --- SEGUNDO MODAL → ELEGIR NOMBRE ---
  const user = session.user || {};
  if (!user.display_name) {
    showBackdrop();
    showModal(modalUsername);
    statusEl.textContent = `Conectado como ${user.email || user.name || "usuario"}`;

    btnUseInput.onclick = () => sendName(usernameInput.value.trim());
    btnUseEmail.onclick = () => sendName((user.email || "").split("@")[0]);
    btnUseDefault.onclick = () => sendName(null);

    return;
  }

  // --- YA AUTENTICADO Y YA TIENE NOMBRE ---
  hideBackdrop();
  hideModal(modalLogin);
  hideModal(modalUsername);

  window.__AUTH_READY__ = true;

  // ------------------ FUNCIÓN PARA GUARDAR NOMBRE ------------------
  async function sendName(name) {
    try {
      const r = await fetch("/setname", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const j = await r.json();

      if (j.ok) {
        window.location.reload();
      } else {
        alert("Error guardando nombre.");
      }
    } catch (e) {
      alert("Error de red guardando nombre.");
    }
  }
})();