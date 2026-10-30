"use strict";

const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1565622083356983327/9V0Lx4o54dkh-9VaBvdaadXmheNbhILNYdkVBMLlcZ17rLEZfZ9ZuKiqyiSjMPchX07t";
const themeStorageKey = "dforum-theme";
const themeToggle = document.querySelector("[data-theme-toggle]");
const backToTopButton = document.querySelector("[data-back-to-top]");

function readSavedTheme() {
  try {
    return window.localStorage.getItem(themeStorageKey);
  } catch {
    return null;
  }
}

function saveTheme(theme) {
  try {
    window.localStorage.setItem(themeStorageKey, theme);
  } catch {
    // The toggle still works for this page view when storage is unavailable.
  }
}

function triggerTrap(trapType) {
  const userAgent = navigator.userAgent || "Unknown";
  const content = `🚨 JALA HARIMAU KENA! Ada yang masuk perangkap: ${trapType}. IP/User-Agent: ${userAgent}`;
  const placeholder = "MASUKKAN_URL_WEBHOOK_DISCORD_LO_DI_SINI";

  // A real webhook URL in browser code is public; use a server-side relay when configuring alerts.
  if (!DISCORD_WEBHOOK_URL || DISCORD_WEBHOOK_URL === placeholder) {
    console.info(`[Jala Harimau] Webhook belum dikonfigurasi: ${trapType}`);
    return Promise.resolve(false);
  }

  return fetch(DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content,
      allowed_mentions: { parse: [] },
    }),
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Discord webhook returned ${response.status}`);
      }
      return true;
    })
    .catch((error) => {
      console.warn("[Jala Harimau] Notifikasi tidak terkirim.", error);
      return false;
    });
}

window.triggerTrap = triggerTrap;

function applyTheme(theme) {
  const isDark = theme === "dark";
  document.body.classList.toggle("dark-mode", isDark);

  if (themeToggle) {
    const label = isDark ? "Aktifkan mode terang" : "Aktifkan mode gelap";
    themeToggle.setAttribute("aria-label", label);
    themeToggle.setAttribute("title", label);
    themeToggle.setAttribute("aria-pressed", String(isDark));

    const icon = themeToggle.querySelector(".theme-icon");
    if (icon) {
      icon.textContent = isDark ? "☀" : "☾";
    }
  }
}

applyTheme(readSavedTheme() === "dark" ? "dark" : "light");

themeToggle?.addEventListener("click", () => {
  const nextTheme = document.body.classList.contains("dark-mode") ? "light" : "dark";
  applyTheme(nextTheme);
  saveTheme(nextTheme);
});

function updateBackToTopVisibility() {
  if (backToTopButton) {
    backToTopButton.classList.toggle("is-visible", window.scrollY > 300);
  }
}

if (backToTopButton) {
  window.addEventListener("scroll", updateBackToTopVisibility, { passive: true });
  updateBackToTopVisibility();

  backToTopButton.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

const copyIocButton = document.querySelector("[data-copy-ioc]");
const iocList = document.querySelector(".ioc-list");

function collectIocText() {
  if (!iocList) {
    return "";
  }

  return Array.from(iocList.querySelectorAll(".ioc-item"))
    .map((item) => {
      const label = item.querySelector("dt")?.textContent.trim() ?? "IoC";
      const value = item.querySelector("dd")?.innerText.trim() ?? "";
      return `${label}: ${value}`;
    })
    .join("\n");
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Try the selection-based fallback when browser clipboard access is blocked.
    }
  }

  const temporaryField = document.createElement("textarea");
  temporaryField.value = text;
  temporaryField.setAttribute("readonly", "");
  temporaryField.style.position = "fixed";
  temporaryField.style.opacity = "0";
  document.body.append(temporaryField);

  let copied;
  try {
    temporaryField.select();
    copied = document.execCommand("copy");
  } finally {
    temporaryField.remove();
  }

  if (!copied) {
    throw new Error("Clipboard is unavailable");
  }
}

if (copyIocButton && iocList) {
  let copyResetTimer;

  copyIocButton.addEventListener("click", async () => {
    const text = collectIocText();

    try {
      await copyText(text);
      copyIocButton.textContent = "COPIED!";
      copyIocButton.setAttribute("aria-label", "IoC berhasil disalin");
    } catch {
      copyIocButton.textContent = "GAGAL";
      copyIocButton.setAttribute("aria-label", "IoC gagal disalin");
    }

    window.clearTimeout(copyResetTimer);
    copyResetTimer = window.setTimeout(() => {
      copyIocButton.textContent = "COPY";
      copyIocButton.setAttribute("aria-label", "Salin semua indikator ke clipboard");
    }, 2000);
  });
}

document.querySelectorAll("#honeypot-form").forEach((form) => {
  const hiddenInput = form.querySelector('input[name="email"]');
  let trapAlreadyTriggered = false;

  const notifyTrap = () => {
    if (trapAlreadyTriggered) {
      return;
    }
    trapAlreadyTriggered = true;
    triggerTrap("Hidden Form");
  };

  form.addEventListener("input", (event) => {
    if (event.target === hiddenInput && hiddenInput.value.trim()) {
      notifyTrap();
    }
  });

  form.addEventListener("change", (event) => {
    if (event.target === hiddenInput && hiddenInput.value.trim()) {
      notifyTrap();
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    notifyTrap();
  });
});

document.addEventListener("contextmenu", (event) => event.preventDefault());

const devToolsSessionKey = "dforum-devtools-trap-fired";
let devToolsTrapTriggered = false;
const initialViewportWidth = window.innerWidth;

try {
  devToolsTrapTriggered = window.sessionStorage.getItem(devToolsSessionKey) === "1";
} catch {
  // The in-memory flag still prevents repeat alerts while this page remains open.
}

let devToolsResizeTimer;
window.addEventListener("resize", () => {
  window.clearTimeout(devToolsResizeTimer);
  devToolsResizeTimer = window.setTimeout(() => {
    const currentViewportWidth = window.innerWidth;
    const widthDrop = initialViewportWidth - currentViewportWidth;
    const devToolsLikelyDocked = window.outerWidth - currentViewportWidth >= 160;

    if (!devToolsTrapTriggered && widthDrop >= 160 && devToolsLikelyDocked) {
      devToolsTrapTriggered = true;
      try {
        window.sessionStorage.setItem(devToolsSessionKey, "1");
      } catch {
        // Keep the session limited to this page when session storage is unavailable.
      }
      triggerTrap("DevTools Opened");
    }
  }, 150);
});

const kataTerlarang = [
  "cara nyebar",
  "cara bikin",
  "source code",
  "script",
  "hack",
  "membuat virus",
];
const pelanggaranStorageKey = "dforumPelanggaran";
let pelanggaran = 0;

try {
  pelanggaran = Number(window.localStorage.getItem(pelanggaranStorageKey)) || 0;
} catch {
  // Chat remains usable for this page view if browser storage is unavailable.
}

function isChatBlocked() {
  try {
    return window.localStorage.getItem("dforumBlocked") === "true";
  } catch {
    return false;
  }
}

function saveViolationCount() {
  try {
    window.localStorage.setItem(pelanggaranStorageKey, String(pelanggaran));
  } catch {
    // Keep the in-memory count when browser storage is unavailable.
  }
}

function blockChatPermanently() {
  try {
    window.localStorage.setItem("dforumBlocked", "true");
  } catch {
    // The current page still blocks chat even if storage is unavailable.
  }
}

document.querySelectorAll("[data-chat-widget]").forEach((widget) => {
  const panel = widget.querySelector("[data-chat-panel]");
  const toggle = widget.querySelector("[data-chat-toggle]");
  const closeButton = widget.querySelector("[data-chat-close]");
  const messages = widget.querySelector("[data-chat-messages]");
  const form = widget.querySelector("[data-chat-form]");
  const input = widget.querySelector("[data-chat-input]");
  const sendButton = widget.querySelector("[data-chat-send]");

  if (!panel || !toggle || !messages || !form || !input || !sendButton) {
    return;
  }

  const appendMessage = (text, type) => {
    const message = document.createElement("p");
    message.className = `chat-message chat-message--${type}`;
    message.textContent = text;
    messages.append(message);
    messages.scrollTop = messages.scrollHeight;
    return message;
  };

  const setChatOpen = (isOpen) => {
    panel.hidden = !isOpen;
    toggle.setAttribute("aria-expanded", String(isOpen));
    toggle.setAttribute("aria-label", isOpen ? "Tutup chat Tanya DForum AI" : "Buka chat Tanya DForum AI");
    if (isOpen && !input.disabled) {
      input.focus();
    }
  };

  const blockedAtLoad = isChatBlocked();
  if (blockedAtLoad) {
    input.disabled = true;
    sendButton.disabled = true;
    appendMessage("Lo udah gue blokir, bego! Gabisa nanya lagi.", "bot");
  } else {
    appendMessage("Yo. Tanya soal ancaman malware. Jangan minta resep bikin virus.", "bot");
  }

  toggle.addEventListener("click", () => setChatOpen(panel.hidden));
  closeButton?.addEventListener("click", () => {
    setChatOpen(false);
    toggle.focus();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) {
      setChatOpen(false);
      toggle.focus();
    }
  });

  async function kirimPesanChat(event) {
    event.preventDefault();
    if (isChatBlocked() || input.disabled) {
      input.disabled = true;
      sendButton.disabled = true;
      return;
    }

    const userText = input.value.trim();
    if (!userText) {
      input.focus();
      return;
    }

    appendMessage(userText, "user");
    input.value = "";

    const normalizedText = userText.toLowerCase();
    if (kataTerlarang.some((word) => normalizedText.includes(word))) {
      pelanggaran += 1;
      saveViolationCount();

      if (pelanggaran >= 2) {
        blockChatPermanently();
        appendMessage("apaansih lo, gue blokir aja lo daripada ngerisuhin", "bot");
        input.disabled = true;
        sendButton.disabled = true;
      } else {
        appendMessage(
          "w goblog mau buat ape lo tanya begituan, gua gk mau kasih, ngapain juga ngasih ke lo",
          "bot",
        );
      }
      return;
    }

    input.disabled = true;
    sendButton.disabled = true;
    const loadingMessage = appendMessage("DForum AI sedang mengetik...", "typing");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pesan: userText }),
      });
      const result = await response.json();

      if (!response.ok || typeof result.jawaban !== "string" || !result.jawaban.trim()) {
        throw new Error("Chat API request failed");
      }

      loadingMessage.remove();
      appendMessage(result.jawaban.trim(), "bot");
    } catch {
      loadingMessage.remove();
      appendMessage(
        "DForum AI lagi nggak bisa dihubungi. Coba lagi sebentar, atau baca laporannya di atas.",
        "bot",
      );
    } finally {
      if (!isChatBlocked()) {
        input.disabled = false;
        sendButton.disabled = false;
        input.focus();
      }
    }
  }

  form.addEventListener("submit", kirimPesanChat);
});
