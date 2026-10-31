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



// Defang indicators in place so domains and IPs are readable but not clickable.
document.querySelectorAll(".ioc-list .ioc-item dd").forEach((valueNode) => {
  valueNode.querySelectorAll("a").forEach((link) => {
    link.replaceWith(document.createTextNode(link.textContent || ""));
  });

  const walker = document.createTreeWalker(valueNode, NodeFilter.SHOW_TEXT);
  let textNode;
  while ((textNode = walker.nextNode())) {
    textNode.nodeValue = textNode.nodeValue
      .replace(/https?:\/\//gi, (protocol) => protocol.replace(/^http/i, "hxxp"))
      .replace(/(^|[\w])\.(?=[\w])/g, "$1[.]");
  }
});

// Filter homepage report cards by category and search query, including dynamic news cards.
const articleSearch = document.querySelector("#article-search");
const articleGrid = document.querySelector("#article-grid");
const searchStatus = document.querySelector("#search-status");
const categoryFilterLinks = document.querySelectorAll(".main-nav [data-filter]");
let activeCategoryFilter = null;

function filterArticleCards() {
  if (!articleGrid) return;

  const query = articleSearch?.value.trim().toLocaleLowerCase("id-ID") || "";
  const selectedFilter = activeCategoryFilter?.toLocaleUpperCase("id-ID") || "";
  const hasSelection = Boolean(query || activeCategoryFilter);
  const articleCards = Array.from(articleGrid.querySelectorAll(".article-card"));
  let visibleCount = 0;

  articleCards.forEach((card) => {
    const category = (card.dataset.category || "").trim().toLocaleUpperCase("id-ID");
    const matchesCategory = !activeCategoryFilter || category === selectedFilter;
    const matchesSearch = card.textContent.toLocaleLowerCase("id-ID").includes(query);
    const matches = hasSelection && matchesCategory && matchesSearch;
    card.classList.toggle("is-search-hidden", !matches);
    if (matches) visibleCount += 1;
  });

  const emptyMessage = articleGrid.querySelector(".news-empty");
  if (emptyMessage) {
    emptyMessage.hidden = Boolean(query) || activeCategoryFilter !== "BERITA";
  }
  if (searchStatus) {
    searchStatus.textContent = hasSelection
      ? `${visibleCount} laporan cocok.`
      : "Pilih kategori atau cari dossier.";
  }
}

categoryFilterLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    activeCategoryFilter = link.dataset.filter || null;

    categoryFilterLinks.forEach((item) => {
      const isActive = item === link;
      item.classList.toggle("active", isActive);
      if (isActive) {
        item.setAttribute("aria-current", "true");
      } else {
        item.removeAttribute("aria-current");
      }
    });

    filterArticleCards();
  });
});

if (articleSearch) {
  articleSearch.addEventListener("input", filterArticleCards);
}
filterArticleCards();

// Tambahkan watermark pada teks yang disalin dari halaman.
document.addEventListener("copy", function (e) {
  const teksDipilih = window.getSelection().toString();
  if (!teksDipilih) return;

  const watermark = "\n\n©dforum - Koran Siber: Nggak Ada Waktu Buat Basa-Basi\nSumber: https://dforum.is-a.dev";
  const teksBaru = teksDipilih + watermark;
  e.clipboardData.setData("text/plain", teksBaru);
  e.preventDefault();
});


// Build safe, styled news cards from the editable root berita.json file.
function buatKartuBerita(berita) {
  if (!berita || typeof berita !== "object") return null;
  const judul = typeof berita.judul === "string" ? berita.judul.trim() : "";
  const tanggal = typeof berita.tanggal === "string" ? berita.tanggal.trim() : "";
  const kategori = typeof berita.kategori === "string" ? berita.kategori.trim() : "BERITA";
  const link = typeof berita.link === "string" ? berita.link.trim() : "";
  const sumber = typeof berita.sumber === "string" ? berita.sumber.trim() : "";
  const linkSumber = typeof berita.link_sumber === "string" ? berita.link_sumber.trim() : "";
  if (!judul || !tanggal || !link || /^[a-z][a-z\d+.-]*:/i.test(link) || link.startsWith("//")) return null;

  const baseUrl = new URL("./", document.baseURI);
  const tujuan = new URL(link, baseUrl);
  const pathBerita = new URL("berita/", baseUrl).pathname;
  if (tujuan.origin !== baseUrl.origin || !tujuan.pathname.startsWith(pathBerita)) return null;

  const card = document.createElement("article");
  card.className = "article-card berita-card is-search-hidden";
  card.dataset.category = (kategori || "BERITA").toLocaleUpperCase("id-ID");

  const topline = document.createElement("div");
  topline.className = "card-topline";
  const index = document.createElement("span");
  index.className = "card-index";
  index.textContent = "KABAR SIBER";
  topline.append(index);

  const labelKategori = document.createElement("p");
  labelKategori.className = "card-category";
  labelKategori.textContent = kategori || "BERITA";

  const heading = document.createElement("h2");
  const titleLink = document.createElement("a");
  titleLink.className = "news-title-link";
  titleLink.href = tujuan.href;
  titleLink.textContent = judul;
  heading.append(titleLink);

  const date = document.createElement("p");
  date.className = "card-description berita-date";
  date.textContent = tanggal;

  const sourceLine = document.createElement("p");
  sourceLine.className = "berita-source";
  sourceLine.append(document.createTextNode("Sumber: "));
  if (sumber && linkSumber) {
    try {
      const sourceUrl = new URL(linkSumber);
      if (sourceUrl.protocol !== "https:" && sourceUrl.protocol !== "http:") {
        throw new Error("URL sumber harus menggunakan HTTP atau HTTPS");
      }
      const sourceLink = document.createElement("a");
      sourceLink.className = "source-link";
      sourceLink.href = sourceUrl.href;
      sourceLink.target = "_blank";
      sourceLink.rel = "noopener noreferrer";
      sourceLink.textContent = sumber;
      sourceLine.append(sourceLink);
    } catch {
      sourceLine.append(document.createTextNode(sumber));
    }
  } else {
    sourceLine.append(document.createTextNode(sumber || "Tidak dicantumkan"));
  }

  const action = document.createElement("a");
  action.className = "card-action";
  action.href = tujuan.href;
  action.append(document.createTextNode("BACA BERITA "));
  const arrow = document.createElement("span");
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = "→";
  action.append(arrow);

  card.append(topline, labelKategori, heading, date, sourceLine, action);
  return card;
}

function tampilkanPesanBerita(container, pesan) {
  const message = document.createElement("p");
  message.className = "news-empty";
  message.setAttribute("role", "status");
  message.textContent = pesan;
  container.replaceChildren(message);
}

async function ambilDataBerita() {
  const container = document.querySelector("#daftar-berita");
  if (!container) return;

  try {
    const response = await fetch("berita.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`berita.json returned ${response.status}`);
    const dataBerita = await response.json();
    if (!Array.isArray(dataBerita)) throw new Error("berita.json harus berisi array");

    const cards = dataBerita.map(buatKartuBerita).filter(Boolean);
    if (cards.length) {
      container.replaceChildren(...cards);
    } else {
      tampilkanPesanBerita(container, "Belum ada update berita siber hari ini. Balik lagi nanti.");
    }
    filterArticleCards();
  } catch (error) {
    tampilkanPesanBerita(container, "Belum ada update berita siber hari ini. Balik lagi nanti.");
    filterArticleCards();
    console.warn("Berita siber gagal dimuat.", error);
  }
}

ambilDataBerita();
