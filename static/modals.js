/* ============================================================================
   modals.js — Gestión de autenticación visual (modales)
   ----------------------------------------------------------------------------
   Este archivo controla toda la lógica relacionada con:

   ✔ Mostrar modal de LOGIN si no hay sesión
   ✔ Mostrar modal para elegir nombre de usuario si aún no existe display_name
   ✔ Manejar backdrop y estados visuales (blur, ocultar panel)
   ✔ Enviar el nombre escogido al backend (/setname)
   ✔ Avisar a client.js cuando todo está listo → window.__AUTH_READY__

   Flujo general:
   1. Consultar /session para verificar si el usuario está autenticado.
   2. Si NO está autenticado → mostrar modalLogin y botón “Iniciar sesión”.
   3. Si está autenticado pero NO tiene display_name:
        - Mostrar modalUsername
        - Permitir elegir:
            * Nombre ingresado
            * Nombre por email
            * Nombre aleatorio
   4. Si ya tiene display_name → cerrar modales y marcar __AUTH_READY__=true.

   Este archivo se ejecuta ANTES que client.js.
   client.js espera a window.__AUTH_READY__ para iniciar el WebSocket.
   =========================================================================== */

(async function () {

  // ==========================================================================
  // 1) REFERENCIAS DOM
  // ==========================================================================
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

  // ==========================================================================
  // 2) UTILIDADES MODALES
  // ==========================================================================

  /** Muestra el fondo difuminado detrás del contenido */
  function showBackdrop() {
    backdrop.style.display = "block";
    chatPanel.classList.add("blurred");
  }

  /** Oculta el fondo difuminado */
  function hideBackdrop() {
    backdrop.style.display = "none";
    chatPanel.classList.remove("blurred");
  }

  /** Muestra un modal */
  function showModal(el) {
    el.style.display = "block";
    el.setAttribute("aria-hidden", "false");
  }

  /** Oculta un modal */
  function hideModal(el) {
    el.style.display = "none";
    el.setAttribute("aria-hidden", "true");
  }

  // ==========================================================================
  // 3) OBTENER SESIÓN ACTUAL
  // ==========================================================================
  async function fetchSession() {
    try {
      const r = await fetch("/session", { cache: "no-store" });
      if (!r.ok) return null;
      return await r.json();
    } catch (e) {
      return null;
    }
  }

  // ==========================================================================
  // 4) LÓGICA PRINCIPAL
  // ==========================================================================
  const session = await fetchSession();

  // --------------------------------------------------------------------------
  // A) PRIMER MODAL → LOGIN
  // --------------------------------------------------------------------------
  if (!session) {
    showBackdrop();
    showModal(modalLogin);
    statusEl.textContent = "No autenticado";

    // Redirige a /login → server.py inicia flujo OAuth
    btnLoginModal.onclick = () => {
      window.location.href = "/login";
    };

    // client.js esperará a que __AUTH_READY__ = true
    return;
  }

  // --------------------------------------------------------------------------
  // B) SEGUNDO MODAL → ELEGIR NOMBRE DE USUARIO
  // --------------------------------------------------------------------------
  const user = session.user || {};

  if (!user.display_name) {
    showBackdrop();
    showModal(modalUsername);

    statusEl.textContent = `Conectado como ${user.email || user.name || "usuario"}`;

    btnUseInput.onclick = () => sendName(usernameInput.value.trim());
    btnUseEmail.onclick = () => sendName(user.name);      // usa nombre de Google
    btnUseDefault.onclick = () => sendName(null);         // genera nombre random

    return; // esperamos a que el usuario envíe el nombre
  }

  // --------------------------------------------------------------------------
  // C) YA ESTÁ AUTENTICADO Y CON NOMBRE → continuar a client.js
  // --------------------------------------------------------------------------
  hideBackdrop();
  hideModal(modalLogin);
  hideModal(modalUsername);

  // Señal para client.js (sistema de sincronización básico)
  window.__AUTH_READY__ = true;

  // ==========================================================================
  // 5) FUNCIONES PARA ENVIAR DISPLAY_NAME
  // ==========================================================================

  /**
   * Envía el nombre seleccionado al servidor mediante /setname
   * Si todo va bien, se recarga la página para continuar.
   */
  async function sendName(name) {
    try {
      const r = await fetch("/setname", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      const j = await r.json();
      if (j.ok) {
        window.location.reload(); // recargar para continuar flujo normal
      } else {
        alert("Error guardando nombre.");
      }

    } catch (e) {
      alert("Error de red guardando nombre.");
    }
  }

})();
