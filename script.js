"use strict";

const blockedBotKeywords = [
  "python",
  "curl",
  "wget",
  "bot",
  "spider",
  "crawler",
  "headlesschrome",
  "selenium",
  "puppeteer",
  "postman",
];
const userAgent = navigator.userAgent.toLowerCase();
let blockedBotDetected = false;

for (const keyword of blockedBotKeywords) {
  if (userAgent.includes(keyword)) {
    blockedBotDetected = true;
    break;
  }
}

if (blockedBotDetected) {
  document.body.innerHTML = `
    <div style="background-color: #111; color: #ff0000; font-family: monospace; height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;">
      <h1 style="font-size: 4rem; margin-bottom: 10px;">403 FORBIDDEN</h1>
      <p style="font-size: 1.2rem; color: #fff;">Sistem mendeteksi aktivitas bot otomatis.</p>
      <p style="font-size: 1rem; color: #888;">Akses ditolak. IP dan User-Agent Anda telah dicatat.</p>
    </div>`;
  throw new Error("Automated user-agent blocked");
}

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
const beritaCategoryLink = Array.from(categoryFilterLinks).find(
  (link) => (link.dataset.filter || "").trim().toLocaleUpperCase("id-ID") === "BERITA",
);
let activeCategoryFilter = null;

if (beritaCategoryLink) beritaCategoryLink.hidden = true;

function setNewsCategoryAvailability(isAvailable) {
  if (beritaCategoryLink) beritaCategoryLink.hidden = !isAvailable;
}

function filterArticleCards() {
  if (!articleGrid) return;

  const query = articleSearch?.value.trim().toLocaleLowerCase("id-ID") || "";
  const selectedFilter = activeCategoryFilter?.toLocaleUpperCase("id-ID") || "";
  const hasSelection = Boolean(query || activeCategoryFilter);
  const articleCards = Array.from(articleGrid.querySelectorAll(".article-card, .card-berita"));
  let visibleCount = 0;

  articleCards.forEach((card) => {
    const category = (card.dataset.category || "").trim().toLocaleUpperCase("id-ID");
    const matchesCategory = !activeCategoryFilter || category === selectedFilter;
    const matchesSearch = card.textContent.toLocaleLowerCase("id-ID").includes(query);
    // Keep the editorial grid visible on first load; filters narrow it only
    // after the reader chooses a category or enters a search query.
    const matches = !hasSelection || (matchesCategory && matchesSearch);
    card.classList.toggle("is-search-hidden", !matches);
    if (matches) visibleCount += 1;
  });

  const emptyMessage = articleGrid.querySelector(".news-empty");
  if (emptyMessage) {
    emptyMessage.hidden = Boolean(query) || activeCategoryFilter !== "BERITA";
  }

  const sideArticles = articleGrid.querySelector(".side-articles");
  if (sideArticles) {
    const hasVisibleCard = sideArticles.querySelector(
      ".article-card:not(.is-search-hidden), .card-berita:not(.is-search-hidden)",
    );
    const hasVisibleMessage = sideArticles.querySelector(".news-empty:not([hidden])");
    sideArticles.hidden = !hasVisibleCard && !hasVisibleMessage;
  }
  articleGrid.classList.toggle("is-filtered", hasSelection);

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
  const gambar = typeof berita.gambar === "string"
    ? berita.gambar.trim()
    : typeof berita.image === "string"
      ? berita.image.trim()
      : "";
  if (!judul || !tanggal || !link || /^[a-z][a-z\d+.-]*:/i.test(link) || link.startsWith("//")) return null;

  const baseUrl = new URL("./", document.baseURI);
  const tujuan = new URL(link, baseUrl);
  const pathBerita = new URL("berita/", baseUrl).pathname;
  if (tujuan.origin !== baseUrl.origin || !tujuan.pathname.startsWith(pathBerita)) return null;

  const namaFileBerita = tujuan.pathname.slice(pathBerita.length);
  if (!namaFileBerita || namaFileBerita.includes("/")) return null;
  const idBerita = namaFileBerita.replace(/\.(?:html|md)$/i, "");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(idBerita)) return null;

  const halamanBerita = new URL("berita/template.html", baseUrl);
  halamanBerita.searchParams.set("id", idBerita);

  const defaultGambar = new URL("assets/img/server.jpg", baseUrl);
  let urlGambar = defaultGambar;
  if (gambar) {
    try {
      const kandidatGambar = new URL(gambar, baseUrl);
      if (kandidatGambar.origin === baseUrl.origin) urlGambar = kandidatGambar;
    } catch {
      // Use the default image when the JSON image path is invalid.
    }
  }

  const card = document.createElement("div");
  card.className = "card-berita is-search-hidden";
  card.dataset.category = (kategori || "BERITA").toLocaleUpperCase("id-ID");

  const imageWrapper = document.createElement("div");
  imageWrapper.className = "card-berita-img-wrapper";
  const image = document.createElement("img");
  image.className = "card-berita-img";
  image.src = urlGambar.href;
  image.alt = judul;
  imageWrapper.append(image);

  const content = document.createElement("div");
  content.className = "card-berita-content";

  const labelKategori = document.createElement("span");
  labelKategori.className = "card-kategori";
  labelKategori.textContent = kategori || "BERITA";

  const heading = document.createElement("h3");
  heading.className = "card-judul";
  heading.textContent = judul;

  const date = document.createElement("p");
  date.className = "card-tanggal";
  date.textContent = tanggal;

  const sourceLine = document.createElement("p");
  sourceLine.className = "card-sumber";
  sourceLine.textContent = `Sumber: ${sumber || "Tidak dicantumkan"}`;

  const action = document.createElement("a");
  action.className = "btn-baca";
  action.href = halamanBerita.href;
  action.textContent = "BACA BERITA →";

  content.append(labelKategori, heading, date, sourceLine, action);
  card.append(imageWrapper, content);
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
    setNewsCategoryAvailability(cards.some(
      (card) => (card.dataset.category || "").trim().toLocaleUpperCase("id-ID") === "BERITA",
    ));
    if (cards.length) {
      container.replaceChildren(...cards);
    } else {
      tampilkanPesanBerita(container, "Belum ada update berita siber hari ini. Balik lagi nanti.");
    }
    filterArticleCards();
  } catch (error) {
    setNewsCategoryAvailability(false);
    tampilkanPesanBerita(container, "Belum ada update berita siber hari ini. Balik lagi nanti.");
    filterArticleCards();
    console.warn("Berita siber gagal dimuat.", error);
  }
}

ambilDataBerita();
