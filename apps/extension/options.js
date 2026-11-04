const KEY = "sovir-api-url";
const PRINCIPAL_KEY = "sovir-principal";
const OIDC_ISSUER_KEY = "sovir-oidc-issuer";
const OIDC_CLIENT_KEY = "sovir-oidc-client";
// Same deployment defaults as background.js: shown when the keys were never
// configured (undefined). An explicit null means the user cleared them.
const DEFAULT_API = "https://hell.taile32c7d.ts.net/api";
const DEFAULT_OIDC_ISSUER = "https://hell.taile32c7d.ts.net/sso/realms/sovir";
const DEFAULT_OIDC_CLIENT = "sovir-extension";
const input = document.querySelector("#api-url");
const saved = document.querySelector("#saved");
const principalInput = document.querySelector("#principal");
const savedPrincipal = document.querySelector("#saved-principal");
const oidcIssuer = document.querySelector("#oidc-issuer");
const oidcClient = document.querySelector("#oidc-client");
const savedOidc = document.querySelector("#saved-oidc");
const VISION_KEY = "sovir-vision-enabled";
const visionToggle = document.querySelector("#vision-enabled");
const savedVision = document.querySelector("#saved-vision");
const OBSERVE_ALL_KEY = "sovir-observe-all";
const BLOCKLIST_KEY = "sovir-observe-blocklist";
const SENSITIVE_KEY = "sovir-sensitive-enabled";
const observeAllToggle = document.querySelector("#observe-all");
const blocklistInput = document.querySelector("#observe-blocklist");
const savedObserve = document.querySelector("#saved-observe");
const sensitiveToggle = document.querySelector("#sensitive-enabled");

chrome.storage.local.get([KEY, PRINCIPAL_KEY, OIDC_ISSUER_KEY, OIDC_CLIENT_KEY, VISION_KEY, BLOCKLIST_KEY, SENSITIVE_KEY], (s) => {
  input.value = s[KEY] ?? DEFAULT_API;
  principalInput.value = s[PRINCIPAL_KEY] ?? "";
  principalInput.placeholder = "ext-demo";
  oidcIssuer.value = s[OIDC_ISSUER_KEY] === undefined ? DEFAULT_OIDC_ISSUER : (s[OIDC_ISSUER_KEY] ?? "");
  oidcClient.value = s[OIDC_CLIENT_KEY] === undefined ? DEFAULT_OIDC_CLIENT : (s[OIDC_CLIENT_KEY] ?? "");
  visionToggle.checked = s[VISION_KEY] === true;
  sensitiveToggle.checked = s[SENSITIVE_KEY] === true;
  blocklistInput.value = (s[BLOCKLIST_KEY] ?? []).join("\n");
  chrome.permissions.contains({ origins: ["<all_urls>"] }, (has) => {
    observeAllToggle.checked = has;
  });
});

visionToggle.addEventListener("change", () => {
  chrome.storage.local.set({ [VISION_KEY]: visionToggle.checked }, () => {
    if (!visionToggle.checked) {
      savedVision.textContent = "Desactivado.";
      return;
    }
    chrome.permissions.contains({ origins: ["<all_urls>"] }, (has) => {
      savedVision.textContent = has
        ? "Activo — escanea QR solo en sitios otorgados."
        : "Activo pero sin efecto: la captura visual requiere \"Observación amplia\" (arriba).";
    });
  });
});

// ADR-0022: the toggle's own click is the user gesture that fires the
// native Chrome <all_urls> prompt — that prompt IS the consent moment.
observeAllToggle.addEventListener("change", () => {
  if (observeAllToggle.checked) {
    chrome.permissions.request({ origins: ["<all_urls>"] }, (granted) => {
      if (!granted) {
        observeAllToggle.checked = false;
        savedObserve.textContent = "Permiso no concedido — sigue el modo por sitio.";
        return;
      }
      chrome.storage.local.set({ [OBSERVE_ALL_KEY]: true }, () => {
        savedObserve.textContent = "Observación amplia activa — excepciones abajo.";
      });
    });
  } else {
    chrome.permissions.remove({ origins: ["<all_urls>"] }, () => {
      chrome.storage.local.set({ [OBSERVE_ALL_KEY]: false }, () => {
        savedObserve.textContent = "Revocado — vuelve el consentimiento por sitio.";
      });
    });
  }
});

sensitiveToggle.addEventListener("change", () => {
  chrome.storage.local.set({ [SENSITIVE_KEY]: sensitiveToggle.checked }, () => {
    savedObserve.textContent = sensitiveToggle.checked
      ? "Sitios sensibles incluidos — banca y redes sociales también se observan."
      : "Sitios sensibles protegidos — banca y redes sociales quedan excluidos.";
  });
});

document.querySelector("#save-blocklist").addEventListener("click", () => {
  const entries = blocklistInput.value
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^https?:\/\//.test(l));
  const patterns = entries.map((l) => l.replace(/\/+$/, "") + "/*");
  chrome.storage.local.set({ [BLOCKLIST_KEY]: patterns }, () => {
    savedObserve.textContent = `${patterns.length} excepción(es) guardada(s).`;
  });
});

document.querySelector("#save").addEventListener("click", () => {
  const value = input.value.trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[\w.-]+(:\d+)?$/.test(value)) {
    saved.textContent = "URL inválida — usa http(s)://host[:puerto]";
    return;
  }
  chrome.storage.local.set({ [KEY]: value }, () => {
    saved.textContent = `Guardado: ${value}`;
  });
});

document.querySelector("#save-principal").addEventListener("click", () => {
  const value = principalInput.value.trim();
  if (value && !/^[a-z0-9][a-z0-9_-]{1,63}$/i.test(value)) {
    savedPrincipal.textContent = "Identidad inválida — letras, números, - y _";
    return;
  }
  chrome.storage.local.set({ [PRINCIPAL_KEY]: value || null }, () => {
    savedPrincipal.textContent = value ? `Guardado: ${value}` : "Vuelve al valor por defecto (ext-demo)";
  });
});

document.querySelector("#save-oidc").addEventListener("click", () => {
  const issuer = oidcIssuer.value.trim().replace(/\/+$/, "");
  const client = oidcClient.value.trim();
  if ((issuer && !client) || (!issuer && client)) {
    savedOidc.textContent = "Completa issuer y client ID, o deja ambos vacíos.";
    return;
  }
  if (issuer && !/^https?:\/\/[\w.-]+(:\d+)?(\/[\w./-]*)?$/.test(issuer)) {
    savedOidc.textContent = "Issuer inválido — p. ej. http://host:8081/realms/sovir";
    return;
  }
  chrome.storage.local.set(
    { [OIDC_ISSUER_KEY]: issuer || null, [OIDC_CLIENT_KEY]: client || null },
    () => {
      savedOidc.textContent = issuer
        ? "Guardado — en la próxima conexión se abrirá tu proveedor de identidad."
        : "OIDC desactivado — vuelve la sesión de demostración.";
    },
  );
});
