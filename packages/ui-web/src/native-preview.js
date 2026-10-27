const catalog = await fetch(new URL("./catalog.json", import.meta.url)).then((response) => response.json());

function resolve(section, state) {
  if (state === "ready") return section;
  const override = section.states[state] ?? {};
  return {
    ...section,
    title: override.title || section.title,
    lede: override.lede || section.lede,
    note: override.note || section.note,
    rows: override.rows ?? [],
    blocks: override.blocks ?? [],
    actions: override.actions ?? [],
  };
}

export function mount(root, config = {}) {
  const params = new URLSearchParams(location.search);
  const groups = [];
  for (const section of catalog.sections) {
    const found = groups.find((group) => group.name === section.group);
    if (found) found.ids.push(section.id);
    else groups.push({ name: section.group, ids: [section.id] });
  }
  root.className = `native-app ${config.layout || "sidebar"}`;
  root.innerHTML = `
    <nav class="destinations" aria-label="Secciones de la aplicación">
      ${groups
        .map(
          (group) =>
            `<p class="group">${group.name}</p>${group.ids
              .map((id) => {
                const section = catalog.sections.find((item) => item.id === id);
                return `<button type="button" data-nav="${id}">${section.label}</button>`;
              })
              .join("")}`,
        )
        .join("")}
    </nav>
    <div class="workspace">
      <nav class="sim" aria-label="Estado de simulación">
        ${catalog.states.map((id) => `<button type="button" data-state="${id}">${catalog.stateLabels[id]}</button>`).join("")}
      </nav>
      <article class="section-view">
        <h1></h1>
        <p class="lede"></p>
        <div class="actions"></div>
        <p class="note"></p>
        <div class="blocks"></div>
        <ul class="rows"></ul>
        <form class="fields" hidden></form>
      </article>
    </div>`;

  let current = params.get("section") || config.start || "inicio";
  let mode = params.get("state") || "ready";
  if (!catalog.sections.some((section) => section.id === current)) current = "inicio";
  if (!catalog.states.includes(mode)) mode = "ready";

  const title = root.querySelector("h1");
  const lede = root.querySelector(".lede");
  const actions = root.querySelector(".actions");
  const note = root.querySelector(".note");
  const blocks = root.querySelector(".blocks");
  const rows = root.querySelector(".rows");
  const fields = root.querySelector(".fields");

  function paint() {
    const section = catalog.sections.find((item) => item.id === current);
    const view = resolve(section, mode);
    title.textContent = view.title;
    lede.textContent = view.lede;
    note.textContent = view.note;
    actions.innerHTML = (view.actions || [])
      .map((action, index) => `<a class="${index === 0 ? "button" : "button secondary"}" href="#" data-go="${action.href || ""}">${action.label}</a>`)
      .join("");
    blocks.innerHTML = (view.blocks || []).map((block) => `<section><h2>${block.heading}</h2><p>${block.body}</p></section>`).join("");
    rows.innerHTML = (view.rows || []).map(([name, value]) => `<li><span>${name}</span><span>${value}</span></li>`).join("");
    const showForm = mode === "ready" && (current === "entrar" || current === "registro");
    fields.hidden = !showForm;
    fields.innerHTML = showForm
      ? `${current === "registro" ? "<label>Nombre<input autocomplete=\"off\" /></label>" : ""}<label>Correo<input type="email" autocomplete="off" /></label><label>Clave<input type="password" autocomplete="off" /></label><button type="button" data-sim="1">${current === "registro" ? "Simular registro" : "Simular entrada"}</button>`
      : "";
    for (const button of root.querySelectorAll("[data-nav]")) {
      if (button.dataset.nav === current) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    }
    for (const button of root.querySelectorAll("[data-state]")) {
      if (button.dataset.state === mode) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    }
  }

  root.addEventListener("click", (event) => {
    const target = event.target.closest("button, a");
    if (!target || !root.contains(target)) return;
    if (target.dataset.nav) current = target.dataset.nav;
    if (target.dataset.state) mode = target.dataset.state;
    if (target.dataset.go) {
      event.preventDefault();
      const next = catalog.sections.find((section) => section.path === target.dataset.go);
      if (next) current = next.id;
    }
    if (target.dataset.sim) {
      event.preventDefault();
      note.textContent = current === "registro" ? "No se guardó el registro. No hay cuenta." : "No se inició sesión. No se envió la clave.";
      return;
    }
    paint();
  });

  paint();
}
