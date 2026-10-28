const skin = document.body.dataset.skin === "macos" ? "macos" : "windows";
const device = skin === "macos" ? "este Mac" : "este equipo";
const catalog = await fetch(new URL("../../../packages/ui-web/src/catalog.json", import.meta.url)).then((response) => response.json());

const doors = [
  ["google", "Google"],
  ["github", "GitHub"],
  ["microsoft", "Microsoft"],
  ["apple", "Apple"],
];

const sources = [
  ["machine", device[0].toUpperCase() + device.slice(1), "El aparato donde se abre esta ventana.", "No está registrado en una cuenta. Marcarlo pendiente solo guarda una nota local."],
  ["extension", "Extensión del navegador", "El permiso por sitio vive en la extensión, no aquí.", "Esta ventana no observa páginas ni hereda ese permiso."],
  ["console", "Consola web", "La sesión de la consola no se comparte con el escritorio.", "Entrar en la web no enlaza este aparato."],
  ["phone", "Teléfono", "Android o iOS.", "No hay un enlace con un teléfono. La nota local no crea una cuenta."],
];

const extras = {
  conexiones: {
    id: "conexiones",
    group: "Trabajo",
    label: "Conexiones",
    title: "Conexiones",
    lede: "Fuentes que podrían enlazarse más adelante. Ninguna está enlazada con una cuenta.",
    note: "Una nota local no es un enlace ni un permiso.",
  },
  notificaciones: {
    id: "notificaciones",
    group: "Trabajo",
    label: "Notificaciones",
    title: "Notificaciones",
    lede: "El centro está vacío. Vacío no significa protegido.",
    note: "Esta ventana no publica avisos en el sistema.",
  },
  telefonos: {
    id: "telefonos",
    group: "Superficies",
    label: "Teléfonos",
    title: "Teléfonos",
    lede: "Así se ve la misma sesión en Android y en iPhone. No es un aparato conectado.",
    note: "La captura no está declarada en ninguna de las dos.",
  },
  widgets: {
    id: "widgets",
    group: "Superficies",
    label: "Widgets",
    title: "Widgets",
    lede: "El widget de escritorio no está instalado. Esto es su forma, no un anclaje real.",
    note: "No hay un paquete de widget en Windows ni en macOS.",
  },
};

const pathToId = {
  "/": "inicio",
  "/sign-in": "entrar",
  "/registro": "registro",
  "/protections": "protecciones",
  "/incidents": "incidentes",
  "/investigations": "investigacion",
  "/devices": "dispositivos",
  "/permissions": "permisos",
  "/resources": "recursos",
  "/account": "cuenta",
  "/settings": "ajustes",
  "/enterprise/policies": "politicas",
  "/enterprise/aggregates": "agregados",
  "/enterprise/integrations": "integraciones",
  "/enterprise/audit": "auditoria",
  "/enterprise/billing": "facturacion",
};

const key = `sovir.desktop.${skin}`;
const root = document.querySelector("#app");

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "{}");
    return {
      demo: raw.demo === true,
      pending: Array.isArray(raw.pending) ? raw.pending.filter((id) => sources.some((item) => item[0] === id)) : [],
    };
  } catch {
    return { demo: false, pending: [] };
  }
}

function save(state) {
  localStorage.setItem(key, JSON.stringify({ demo: state.demo, pending: state.pending }));
}

const state = load();
try {
  const stored = localStorage.getItem("sovir-theme");
  if (stored === "light" || stored === "dark") document.documentElement.dataset.theme = stored;
} catch {}

let screen = state.demo ? "shell" : "welcome";
let tab = "inicio";
let query = "";
let gate = "portal";
let kind = "entrar";
let result = "";
let problem = "";
let sourceId = null;
let showNotice = false;
let showFixture = false;
let pauseDrawn = false;
let phoneTab = "inicio";
let widgetSize = "small";
let noteFailed = false;

function sectionById(id) {
  return catalog.sections.find((item) => item.id === id) || extras[id];
}

function resolve(section, mode) {
  if (!section || mode === "ready" || !section.states) return section;
  const override = section.states[mode] || {};
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

function escape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function button(label, action, variant = "line") {
  return `<button type="button" class="${variant}" data-action="${action}">${escape(label)}</button>`;
}

function fact(label, value, action = "") {
  const tag = action ? "button" : "div";
  return `<${tag} class="fact" ${action ? `type="button" data-action="${action}"` : ""}><span>${escape(label)}</span><span>${escape(value)}</span></${tag}>`;
}

function refuse(doorLabel) {
  return kind === "entrar"
    ? `Elegiste ${doorLabel}. No se inició sesión. No se llamó a ningún servicio.`
    : `Elegiste ${doorLabel}. No se guardó el registro. No se llamó a ningún servicio.`;
}

function emailProblem(value) {
  const trimmed = value.trim();
  if (!trimmed) return "Falta el correo.";
  const at = trimmed.indexOf("@");
  if (at <= 0 || at !== trimmed.lastIndexOf("@") || at === trimmed.length - 1) return "El correo no tiene forma de dirección.";
  return "";
}

function pendingLabel(id) {
  return state.pending.includes(id) ? `Pendiente en ${device}` : "Sin enlace";
}

function groups() {
  const order = ["Trabajo", "Superficies", "Organización", "Persona"];
  const items = [
    ...catalog.sections.filter((item) => item.group !== "Acceso"),
    extras.conexiones,
    extras.notificaciones,
    extras.telefonos,
    extras.widgets,
  ];
  const needle = query.trim().toLocaleLowerCase("es");
  return order
    .map((name) => ({
      name,
      items: items.filter((item) => item.group === name && (!needle || item.label.toLocaleLowerCase("es").includes(needle))),
    }))
    .filter((group) => group.items.length);
}

function nav() {
  const body = groups()
    .map(
      (group) => `<div class="nav-group"><p class="kicker">${escape(group.name)}</p>${group.items
        .map(
          (item) =>
            `<button type="button" data-tab="${item.id}" ${tab === item.id ? 'aria-current="page"' : ""}>${escape(item.label)}</button>`,
        )
        .join("")}</div>`,
    )
    .join("");
  return `<label class="finder">Buscar<input type="search" value="${escape(query)}" placeholder="Buscar" data-search></label>${body || '<p class="muted">Ninguna sección</p>'}`;
}

function gateView() {
  if (screen === "welcome") {
    return `<section class="gate">
      <p class="lockup"><span class="mark" aria-hidden="true"></span> SOVIR</p>
      <h1>En el dispositivo, con una política, en tus manos.</h1>
      <p class="muted">Esta ventana no observa la pantalla. El empaquetado con Tauri no está publicado.</p>
      ${button("Entrar", "open-sign", "fill")}
      ${button("Crear cuenta", "open-register")}
    </section>`;
  }
  const title = kind === "entrar" ? "Entrar" : "Registro";
  const lede = kind === "entrar" ? "Simulación de acceso. No hay cuenta ni clave guardada." : "Simulación de alta. No se crea un usuario ni se conserva la clave.";
  let body = "";
  if (result) body = `<p>${escape(result)}</p>${button("Volver a las opciones", "options")}`;
  else if (gate === "mail") {
    body = `<form class="mail" data-mail>
      <label>Correo<input name="correo" type="email" autocomplete="off" placeholder="nombre@correo.com" required></label>
      <label>Clave<input name="clave" type="password" autocomplete="off" required></label>
      ${problem ? `<p class="danger">${escape(problem)}</p>` : ""}
      ${button("Continuar con el correo", "submit-mail", "fill")}
      ${button("Otras opciones", "options")}
    </form>`;
  } else {
    body = doors.map(([, label]) => button(`Continuar con ${label}`, `door-${label}`)).join("") + button("Continuar con el correo", "show-mail", "fill");
  }
  const foot =
    kind === "entrar"
      ? `<hr>${button("Perfil de desarrollador", "developer", "fill")}<p class="muted">Entra sin cuenta. La sesión queda solo en ${device} y no concede ningún permiso.</p>`
      : button("Ir a entrar", "switch-kind");
  return `<section class="gate">
    <p class="lockup"><span class="mark" aria-hidden="true"></span> SOVIR</p>
    <h1>Ninguna cuenta se abre desde aquí.</h1>
    <p class="muted">${escape(lede)}</p>
    <p class="kicker">${escape(title)}</p>
    ${body}
    <p class="muted">Al continuar no se abre una cuenta y no se envía el correo.</p>
    ${foot}
  </section>`;
}

function catalogView(id) {
  const mode = id === "incidentes" && showFixture ? "review" : "ready";
  const view = resolve(sectionById(id), mode);
  const rows = (view.rows || []).map(([name, value]) => fact(name, value)).join("");
  const blocks = (view.blocks || []).map((block) => `<h2>${escape(block.heading)}</h2><p>${escape(block.body)}</p>`).join("");
  const actions = (view.actions || [])
    .map((action, index) => button(action.label, `go-${action.href || "/"}`, index === 0 ? "fill" : "line"))
    .join("");
  const extra = id === "incidentes" ? button(showFixture ? "Ocultar el fixture" : "Ver un fixture sintético", "toggle-fixture") : "";
  const pause =
    id === "permisos"
      ? `${button(pauseDrawn ? "Quitar la pausa dibujada" : "Dibujar la pausa", "toggle-pause", pauseDrawn ? "line" : "fill")}<p class="muted">${pauseDrawn ? "La pausa está dibujada en esta ventana. El sistema no recibió nada." : "El botón no abre el diálogo del sistema."}</p>`
      : "";
  return `<section>
    <p class="kicker">${escape(view.group || "")}</p>
    <h1>${escape(view.title)}</h1>
    <p>${escape(view.lede || "")}</p>
    ${rows}
    ${blocks}
    <p class="muted">${escape(view.note || "")}</p>
    <div class="pair">${actions}${extra}</div>
    ${pause}
  </section>`;
}

function linksView() {
  if (sourceId) {
    const source = sources.find((item) => item[0] === sourceId);
    const marked = state.pending.includes(sourceId);
    return `<section>
      ${button("Volver a conexiones", "close-source")}
      <p class="kicker">${escape(pendingLabel(sourceId))}</p>
      <h1>${escape(source[1])}</h1>
      <p>${escape(source[2])}</p>
      <p class="muted">${escape(source[3])}</p>
      <p class="muted">La nota queda en ${device}. No crea una cuenta, no enlaza un servicio y no pide un permiso del sistema.</p>
      ${button(marked ? "Quitar la nota" : `Dejar pendiente en ${device}`, "toggle-source", marked ? "line" : "fill")}
      ${noteFailed ? `<p class="danger">No se pudo guardar la nota en ${device}.</p>` : ""}
    </section>`;
  }
  return `<section>
    <p class="kicker">Trabajo</p>
    <h1>Conexiones</h1>
    <p>Fuentes que podrían enlazarse más adelante. Ninguna está enlazada con una cuenta.</p>
    ${sources.map(([id, title]) => fact(title, pendingLabel(id), `open-${id}`)).join("")}
    <p class="muted">Esta ventana no consulta la red. Una nota local no es un enlace.</p>
  </section>`;
}

function phoneScreen(platform) {
  const tabs = [
    ["inicio", "Inicio"],
    ["conexiones", "Conexiones"],
    ["actividad", "Actividad"],
    ["cuenta", "Cuenta"],
  ];
  let body = "";
  if (phoneTab === "conexiones") body = sources.map((item) => `<p><span>${escape(item[1])}</span><small>Sin enlace</small></p>`).join("");
  else if (phoneTab === "actividad") body = "<p>No hay observaciones. Eso no significa protección activa.</p>";
  else if (phoneTab === "cuenta") body = "<p>Perfil de desarrollador. No hay correo ni nombre guardados.</p>";
  else body = "<h3>Sin cobertura que afirmar</h3><p>No hay sensores conectados. Vacío no significa protegido.</p><p><span>Captura</span><small>Sin permiso</small></p>";
  const bar = tabs
    .map(([id, label]) => `<button type="button" data-action="phone-${id}" ${phoneTab === id ? 'aria-current="page"' : ""}>${label}</button>`)
    .join("");
  return `<article class="handset ${platform}">
    <p class="kicker">${platform === "android" ? "Android" : "iPhone"}</p>
    <div class="bezel">
      <div class="bezel-screen">${body}</div>
      <nav aria-label="${platform === "android" ? "Android" : "iPhone"}">${bar}</nav>
    </div>
  </article>`;
}

function phonesView() {
  return `<section>
    <p class="kicker">Superficies</p>
    <h1>Teléfonos</h1>
    <p>Así se ve la misma sesión en Android y en iPhone. No es un aparato conectado.</p>
    <div class="hands">${phoneScreen("android")}${phoneScreen("ios")}</div>
    <p class="muted">La captura no está declarada en ninguna de las dos. Cambiar de pestaña aquí no abre el teléfono.</p>
  </section>`;
}

function widgetsView() {
  const sizes = [
    ["small", "Pequeño"],
    ["medium", "Mediano"],
  ];
  const card = (name) => `<article class="widget ${widgetSize}">
    <p class="kicker">${escape(name)}</p>
    <strong>Sin cobertura que afirmar</strong>
    <span>No está anclado. Vacío no significa protegido.</span>
  </article>`;
  return `<section>
    <p class="kicker">Superficies</p>
    <h1>Widgets</h1>
    <p>El widget de escritorio no está instalado. Esto es su forma, no un anclaje real.</p>
    <div class="pair">${sizes.map(([id, label]) => button(label, `widget-${id}`, widgetSize === id ? "fill" : "line")).join("")}</div>
    <div class="widget-row">${card(skin === "macos" ? "Widget de macOS" : "Widget de Windows")}${card(skin === "macos" ? "Widget de Windows" : "Widget de macOS")}</div>
    <p class="muted">No hay un paquete de widget. Ninguno de los dos lee la pantalla.</p>
  </section>`;
}

function noticeBody() {
  if (!showNotice) return `<p class="muted">Ningún aviso en este centro.</p>${button("Ver un aviso sintético", "show-notice", "fill")}`;
  const place = skin === "macos" ? "mac-banner" : "toast";
  return `<article class="${place}" role="status">
    <p class="kicker">Fixture sintético</p>
    <strong>Una página de prueba pide un código</strong>
    <span>Inferido, no verificado. No hay una fuente independiente. Este aviso no salió al sistema.</span>
    ${button("Cerrar el aviso", "hide-notice")}
  </article>`;
}

function notificationsView() {
  return `<section>
    <p class="kicker">Trabajo</p>
    <h1>Notificaciones</h1>
    <p>El centro está vacío. Vacío no significa protegido.</p>
    <div class="notice-stage ${skin}">${noticeBody()}</div>
    ${fact("Bandeja del sistema", "No instalada")}
    ${fact("Centro de avisos", showNotice ? "Un fixture en esta ventana" : "Vacío")}
    <p class="muted">Esta ventana no publica avisos en ${skin === "macos" ? "el Centro de notificaciones" : "el área de notificación"}.</p>
  </section>`;
}

function accountExtra() {
  const theme = document.documentElement.dataset.theme || "system";
  const choices = [
    ["system", "Sistema"],
    ["light", "Claro"],
    ["dark", "Oscuro"],
  ];
  return `<h2>Tema</h2><div class="pair">${choices.map(([id, label]) => button(label, `theme-${id}`, theme === id ? "fill" : "line")).join("")}</div>
    ${button("Cerrar sesión", "close-session")}
    <p class="muted">Cierra la sesión de demostración en ${device}. No hay una cuenta que borrar.</p>`;
}

function main() {
  if (tab === "conexiones") return linksView();
  if (tab === "notificaciones") return notificationsView();
  if (tab === "telefonos") return phonesView();
  if (tab === "widgets") return widgetsView();
  if (tab === "cuenta") return `${catalogView("cuenta")}${accountExtra()}`;
  return catalogView(tab);
}

function frame(content) {
  const current = sectionById(tab);
  const caption = current ? current.label : "SOVIR";
  if (skin === "macos") {
    return `<div class="mac">
      <aside><p class="lockup"><span class="mark" aria-hidden="true"></span> SOVIR</p><nav aria-label="Secciones">${nav()}</nav></aside>
      <div class="mac-main"><header><h2>${escape(caption)}</h2></header><main>${content}</main></div>
    </div>`;
  }
  return `<div class="win">
    <header class="win-title"><span class="mark" aria-hidden="true"></span><strong>SOVIR</strong><span>${escape(caption)}</span></header>
    <div class="win-body"><nav aria-label="Secciones">${nav()}</nav><main>${content}</main></div>
  </div>`;
}

function paint() {
  root.innerHTML = screen === "shell" ? frame(main()) : gateView();
}

function go(href) {
  const id = pathToId[href];
  if (id === "entrar") {
    screen = "gate";
    kind = "entrar";
    gate = "portal";
    result = "";
    return;
  }
  if (id === "registro") {
    screen = "gate";
    kind = "register";
    gate = "portal";
    result = "";
    return;
  }
  if (id) {
    tab = id;
    sourceId = null;
    screen = "shell";
  }
}

function setTheme(choice) {
  if (choice === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = choice;
  try {
    if (choice === "system") localStorage.removeItem("sovir-theme");
    else localStorage.setItem("sovir-theme", choice);
  } catch {}
}

root.addEventListener("input", (event) => {
  const field = event.target.closest("[data-search]");
  if (!field) return;
  const caret = field.selectionStart;
  query = field.value;
  paint();
  const next = root.querySelector("[data-search]");
  if (next) {
    next.focus();
    next.setSelectionRange(caret, caret);
  }
});

root.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action], [data-tab]");
  if (!target || !root.contains(target)) return;
  if (target.dataset.tab) {
    tab = target.dataset.tab;
    sourceId = null;
    paint();
    return;
  }
  const action = target.dataset.action;
  if (action === "submit-mail") return;
  if (action === "open-sign") {
    screen = "gate";
    kind = "entrar";
    gate = "portal";
    result = "";
  } else if (action === "open-register") {
    screen = "gate";
    kind = "register";
    gate = "portal";
    result = "";
  } else if (action === "switch-kind") {
    kind = kind === "entrar" ? "register" : "entrar";
    gate = "portal";
    result = "";
  } else if (action === "show-mail") {
    gate = "mail";
    problem = "";
  } else if (action === "options") {
    gate = "portal";
    result = "";
    problem = "";
  } else if (action.startsWith("door-")) {
    result = refuse(action.slice(5));
    gate = "portal";
  } else if (action === "developer") {
    state.demo = true;
    save(state);
    screen = "shell";
    tab = "inicio";
  } else if (action === "close-session") {
    state.demo = false;
    save(state);
    screen = "welcome";
  } else if (action.startsWith("go-")) go(action.slice(3));
  else if (action.startsWith("open-")) {
    sourceId = action.slice(5);
    tab = "conexiones";
    noteFailed = false;
  } else if (action === "close-source") sourceId = null;
  else if (action === "toggle-source" && sourceId) {
    try {
      state.pending = state.pending.includes(sourceId) ? state.pending.filter((id) => id !== sourceId) : [...state.pending, sourceId];
      save(state);
      noteFailed = false;
    } catch {
      noteFailed = true;
    }
  } else if (action === "toggle-fixture") showFixture = !showFixture;
  else if (action === "toggle-pause") pauseDrawn = !pauseDrawn;
  else if (action === "show-notice") showNotice = true;
  else if (action === "hide-notice") showNotice = false;
  else if (action.startsWith("phone-")) phoneTab = action.slice(6);
  else if (action.startsWith("widget-")) widgetSize = action.slice(7);
  else if (action.startsWith("theme-")) setTheme(action.slice(6));
  paint();
});

root.addEventListener("submit", (event) => {
  const form = event.target.closest("[data-mail]");
  if (!form) return;
  event.preventDefault();
  const data = new FormData(form);
  const issue = emailProblem(String(data.get("correo") || "")) || (String(data.get("clave") || "") ? "" : "Falta la clave.");
  form.reset();
  if (issue) {
    problem = issue;
    paint();
    return;
  }
  result = refuse("el correo");
  gate = "portal";
  problem = "";
  paint();
});

paint();
