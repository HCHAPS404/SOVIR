const status = document.querySelector("#status");
const button = document.querySelector("#pause");

function paint(paused) {
  status.textContent = paused
    ? "En pausa. No se pedirá permiso de sitio."
    : "Activa solo como interruptor local. Sigue sin permiso de sitio.";
  button.textContent = paused ? "Reanudar" : "Pausar";
  button.dataset.paused = paused ? "true" : "false";
}

chrome.runtime.sendMessage({ type: "get-state" }, (state) => {
  paint(Boolean(state?.paused));
});

button.addEventListener("click", () => {
  const paused = button.dataset.paused !== "true";
  chrome.runtime.sendMessage({ type: "set-paused", paused }, (state) => {
    paint(Boolean(state?.paused));
  });
});
