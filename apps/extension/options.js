const KEY = "sovir-api-url";
const PRINCIPAL_KEY = "sovir-principal";
const input = document.querySelector("#api-url");
const saved = document.querySelector("#saved");
const principalInput = document.querySelector("#principal");
const savedPrincipal = document.querySelector("#saved-principal");

chrome.storage.local.get([KEY, PRINCIPAL_KEY], (s) => {
  input.value = s[KEY] ?? "http://127.0.0.1:8787";
  principalInput.value = s[PRINCIPAL_KEY] ?? "";
  principalInput.placeholder = "ext-demo";
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
