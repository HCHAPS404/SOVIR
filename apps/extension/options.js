const KEY = "sovir-api-url";
const PRINCIPAL_KEY = "sovir-principal";
const OIDC_ISSUER_KEY = "sovir-oidc-issuer";
const OIDC_CLIENT_KEY = "sovir-oidc-client";
const input = document.querySelector("#api-url");
const saved = document.querySelector("#saved");
const principalInput = document.querySelector("#principal");
const savedPrincipal = document.querySelector("#saved-principal");
const oidcIssuer = document.querySelector("#oidc-issuer");
const oidcClient = document.querySelector("#oidc-client");
const savedOidc = document.querySelector("#saved-oidc");

chrome.storage.local.get([KEY, PRINCIPAL_KEY, OIDC_ISSUER_KEY, OIDC_CLIENT_KEY], (s) => {
  input.value = s[KEY] ?? "http://127.0.0.1:8787";
  principalInput.value = s[PRINCIPAL_KEY] ?? "";
  principalInput.placeholder = "ext-demo";
  oidcIssuer.value = s[OIDC_ISSUER_KEY] ?? "";
  oidcClient.value = s[OIDC_CLIENT_KEY] ?? "";
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
