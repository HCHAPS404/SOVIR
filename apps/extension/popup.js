const apiEl = document.querySelector("#api");
const siteEl = document.querySelector("#site");
const observeBtn = document.querySelector("#observe");

let currentTab = null;

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

observeBtn.addEventListener("click", async () => {
  if (!currentTab?.url) return;
  const origin = new URL(currentTab.url).origin;
  const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
  if (!granted) return;
  // Per-site opt-in granted — inject the extractor into the current tab.
  await chrome.scripting.executeScript({ target: { tabId: currentTab.id }, files: ["content.js"] });
  await paintSite();
});

paintApi().then((s) => {
  if (!s?.ready) chrome.runtime.sendMessage({ type: "connect" }, paintApi);
});
paintSite();
