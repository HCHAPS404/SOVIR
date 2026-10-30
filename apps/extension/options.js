const KEY = "sovir-api-url";
const input = document.querySelector("#api-url");
const saved = document.querySelector("#saved");

chrome.storage.local.get(KEY, (s) => {
  input.value = s[KEY] ?? "http://127.0.0.1:8787";
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
