const apiEl = document.querySelector("#api");
const siteEl = document.querySelector("#site");
const observeBtn = document.querySelector("#observe");
const listEl = document.querySelector("#granted");

let currentTab = null;

const API_ORIGIN = "http://127.0.0.1:8787";

async function grantedOrigins() {
  const { origins } = await chrome.permissions.getAll();
  return (origins ?? []).filter((o) => !o.startsWith(API_ORIGIN));
}

async function paintApi() {
  const state = await chrome.runtime.sendMessage({ type: "get-state" });
  apiEl.textContent = state?.ready
    ? `API conectada · ${state.principal}`
    : "API: sin conexión — arranca cargo run -p sovir-api";
  return state;
}

async function paintSite() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;
  if (!tab?.url || !/^https?:/.test(tab.url)) {
    siteEl.textContent = "Este sitio: no observable";
    observeBtn.disabled = true;
    return;
  }
  const origin = new URL(tab.url).origin;
  const granted = await chrome.permissions.contains({ origins: [`${origin}/*`] });
  siteEl.textContent = granted ? `Observando ${origin}` : `Sin observar ${origin}`;
  observeBtn.textContent = granted ? "Observación activa" : "Observar este sitio";
  observeBtn.disabled = granted;
}

async function paintList() {
  const sites = await grantedOrigins();
  listEl.innerHTML = "";
  if (!sites.length) {
    listEl.innerHTML = "<li class='muted'>Ningún sitio observado</li>";
    return;
  }
  for (const pattern of sites) {
    const li = document.createElement("li");
    li.textContent = pattern.replace("/*", "");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "revoke";
    btn.textContent = "Quitar";
    btn.addEventListener("click", async () => {
      await chrome.permissions.remove({ origins: [pattern] });
      await paintSite();
      await paintList();
    });
    li.appendChild(btn);
    listEl.appendChild(li);
  }
}

observeBtn.addEventListener("click", async () => {
  if (!currentTab?.url) return;
  const origin = new URL(currentTab.url).origin;
  const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
  if (!granted) return;
  // Immediate inject for this tab; the registered content script covers
  // future loads on this origin (background.js sync).
  await chrome.scripting.executeScript({ target: { tabId: currentTab.id }, files: ["content.js"] });
  await paintSite();
  await paintList();
});

paintApi().then((s) => {
  if (!s?.ready) chrome.runtime.sendMessage({ type: "connect" }, paintApi);
});
paintSite();
paintList();
