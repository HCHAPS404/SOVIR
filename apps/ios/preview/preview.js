import { mount } from "../../../packages/ui-web/src/native-preview.js";

mount(document.querySelector("#app"), { layout: "tabs" });

document.querySelector("#form").addEventListener("click", () => {
  const pad = document.body.dataset.form === "pad";
  if (pad) {
    delete document.body.dataset.form;
    document.querySelector("#form").textContent = "Vista iPad";
  } else {
    document.body.dataset.form = "pad";
    document.querySelector("#form").textContent = "Vista iPhone";
  }
});
