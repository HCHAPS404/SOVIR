import { mount } from "../../../packages/ui-web/src/native-preview.js";

const chrome = {
  macos: "Menú",
  windows: "Bandeja",
  gnome: "Barra superior",
  kde: "Panel",
};

mount(document.querySelector("#app"), { layout: "sidebar" });

function apply(skin) {
  document.body.dataset.skin = skin;
  document.querySelector("#chrome").textContent = chrome[skin];
  for (const button of document.querySelectorAll("button[data-skin]")) {
    button.setAttribute("aria-pressed", button.dataset.skin === skin ? "true" : "false");
  }
}

for (const button of document.querySelectorAll("button[data-skin]")) {
  button.addEventListener("click", () => apply(button.dataset.skin));
}

apply("windows");
