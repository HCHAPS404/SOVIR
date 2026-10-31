import { createInterface } from "node:readline";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stdin, stdout } from "node:process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const catalog = JSON.parse(readFileSync(resolve(root, "packages/ui-web/src/catalog.json"), "utf8"));
const storePath = join(process.env.SOVIR_TERMINAL_DIR || join(homedir(), ".sovir"), "terminal.json");

const sources = [
  ["equipo", "Este equipo", "La terminal donde se abre SOVIR."],
  ["extension", "Extensión", "El permiso por sitio vive en la extensión."],
  ["consola", "Consola web", "La sesión de la web no se comparte."],
  ["telefono", "Teléfono", "Android o iOS. No hay un enlace."],
];

const commands = {
  Sesión: ["entrar", "registro", "desarrollador", "cerrar"],
  Trabajo: ["inicio", "protecciones", "incidentes", "investigacion", "dispositivos", "conexiones", "permisos", "recursos", "notificaciones", "widget"],
  Organización: ["politicas", "agregados", "integraciones", "auditoria", "facturacion"],
  Persona: ["cuenta", "ajustes", "tema"],
  Terminal: ["nota", "aviso", "pausa", "ayuda", "salir"],
};

const aliases = {
  home: "inicio",
  protections: "protecciones",
  incidents: "incidentes",
  research: "investigacion",
  devices: "dispositivos",
  links: "conexiones",
  permissions: "permisos",
  resources: "recursos",
  notifications: "notificaciones",
  policies: "politicas",
  aggregates: "agregados",
  integrations: "integraciones",
  audit: "auditoria",
  billing: "facturacion",
  account: "cuenta",
  settings: "ajustes",
  help: "ayuda",
  exit: "salir",
  quit: "salir",
};

function load() {
  try {
    const raw = JSON.parse(readFileSync(storePath, "utf8"));
    return {
      demo: raw.demo === true,
      pending: Array.isArray(raw.pending) ? raw.pending.filter((id) => sources.some((item) => item[0] === id)) : [],
      theme: raw.theme === "light" || raw.theme === "dark" ? raw.theme : "system",
      pause: raw.pause === true,
      notice: false,
      fixture: false,
    };
  } catch {
    return { demo: false, pending: [], theme: "system", pause: false, notice: false, fixture: false };
  }
}

function save(state) {
  mkdirSync(dirname(storePath), { recursive: true });
  writeFileSync(storePath, JSON.stringify({ demo: state.demo, pending: state.pending, theme: state.theme, pause: state.pause }));
}

const state = load();
let gate = null;
let mailStep = null;
let mailDraft = "";

function section(id) {
  return catalog.sections.find((item) => item.id === id);
}

function line(label, value) {
  stdout.write(`  ${label.padEnd(22)} ${value}\n`);
}

function panel(title, lede, note, rows = [], blocks = []) {
  stdout.write(`\n${title}\n${lede}\n`);
  for (const [name, value] of rows) line(name, value);
  for (const block of blocks) stdout.write(`\n${block.heading}\n${block.body}\n`);
  if (note) stdout.write(`\n${note}\n`);
}

function showCatalog(id, mode = "ready") {
  const found = section(id);
  if (!found) return false;
  const view = mode === "ready" ? found : { ...found, ...(found.states[mode] || {}) };
  panel(view.title || found.title, view.lede || found.lede, view.note || found.note, view.rows || [], view.blocks || []);
  return true;
}

function header() {
  const session = state.demo ? "sesión de demostración" : "sin sesión";
  stdout.write(`\nSOVIR  terminal\n${session} · este equipo · captura sin permiso · tema ${state.theme}\n`);
  if (!state.demo) stdout.write("Escribe entrar, registro o desarrollador.\n");
}

function help() {
  stdout.write("\nComandos de esta terminal. No ejecutan el sistema ni llaman a un proveedor.\n");
  for (const [group, names] of Object.entries(commands)) {
    stdout.write(`\n${group}\n  ${names.join("  ")}\n`);
  }
  stdout.write("\nnota <equipo|extension|consola|telefono> guarda o quita una nota local.\n");
  stdout.write("aviso muestra o cierra un aviso sintético. No sale al sistema.\n");
  stdout.write("tema claro | oscuro | sistema\n");
}

function requireSession() {
  if (state.demo) return true;
  stdout.write("No hay sesión. desarrollador entra sin cuenta.\n");
  return false;
}

function connections() {
  panel("Conexiones", "Ninguna fuente está enlazada con una cuenta.", "Una nota local no es un enlace.");
  for (const [id, label] of sources) line(label, state.pending.includes(id) ? "Pendiente en este equipo" : "Sin enlace");
}

function notifications() {
  panel("Notificaciones", "El centro está vacío. Vacío no significa protegido.", "Esta terminal no publica avisos en el sistema.");
  if (!state.notice) {
    stdout.write("Ningún aviso.\n");
    return;
  }
  stdout.write("\nFIXTURE SINTÉTICO\nUna página de prueba pide un código.\nInferido, no verificado. Este aviso no salió al sistema.\n");
}

function widget() {
  panel("Widget", "No está anclado al escritorio. Esto es su forma.", "No hay un paquete de widget.");
  stdout.write("┌ Sin cobertura que afirmar ┐\n│ captura sin permiso       │\n└ vacío no es protegido    ┘\n");
}

function takeMail(text) {
  if (mailStep === "email") {
    mailDraft = text.trim();
    mailStep = "secret";
    stdout.write("Clave (no se guarda): ");
    return;
  }
  const secret = text;
  const email = mailDraft;
  mailStep = null;
  mailDraft = "";
  gate = null;
  if (!email || !email.includes("@") || email.startsWith("@") || email.endsWith("@")) {
    stdout.write("Falta un correo con forma de dirección. No se guardó nada.\n");
    return;
  }
  if (!secret.trim()) {
    stdout.write("Falta la clave. No se guardó nada.\n");
    return;
  }
  stdout.write("Elegiste el correo. No se inició sesión. La clave no se escribió en disco.\n");
}

function finishDoor(label) {
  stdout.write(gate === "registro"
    ? `Elegiste ${label}. No se guardó el registro. No se llamó a ningún servicio.\n`
    : `Elegiste ${label}. No se inició sesión. No se llamó a ningún servicio.\n`);
  gate = null;
}

async function handle(raw) {
  const text = raw.trim();
  if (mailStep) {
    takeMail(text);
    return false;
  }
  if (!text) return false;
  const [head, ...rest] = text.split(/\s+/);
  const name = aliases[head.toLowerCase()] || head.toLowerCase();

  if (name === "salir") return true;
  if (name === "ayuda") {
    help();
    return false;
  }
  if (name === "entrar" || name === "registro") {
    gate = name;
    stdout.write("Ninguna cuenta se abre desde aquí.\nPuertas: google  github  microsoft  apple  correo\n");
    return false;
  }
  if (gate && ["google", "github", "microsoft", "apple"].includes(name)) {
    finishDoor(name === "github" ? "GitHub" : name[0].toUpperCase() + name.slice(1));
    return false;
  }
  if (gate && name === "correo") {
    mailStep = "email";
    stdout.write("Correo: ");
    return false;
  }
  if (name === "desarrollador") {
    state.demo = true;
    save(state);
    gate = null;
    stdout.write("Sesión abierta en este equipo. No hay cuenta y no hay permiso de captura.\n");
    return false;
  }
  if (name === "cerrar") {
    state.demo = false;
    state.notice = false;
    state.pause = false;
    save(state);
    stdout.write("Sesión cerrada. No había una cuenta que borrar.\n");
    return false;
  }
  if (name === "tema") {
    const choice = (rest[0] || "").toLowerCase();
    const map = { claro: "light", oscuro: "dark", light: "light", dark: "dark", sistema: "system", system: "system" };
    if (!map[choice]) {
      stdout.write("tema claro | oscuro | sistema\n");
      return false;
    }
    state.theme = map[choice];
    save(state);
    stdout.write(`Tema ${state.theme}. Solo cambia esta terminal.\n`);
    return false;
  }
  if (!requireSession()) return false;
  if (name === "inicio") {
    showCatalog("inicio");
    return false;
  }
  if (name === "conexiones") {
    connections();
    return false;
  }
  if (name === "nota") {
    const id = (rest[0] || "").toLowerCase();
    if (!sources.some((item) => item[0] === id)) {
      stdout.write("nota equipo | extension | consola | telefono\n");
      return false;
    }
    state.pending = state.pending.includes(id) ? state.pending.filter((item) => item !== id) : [...state.pending, id];
    save(state);
    stdout.write(state.pending.includes(id) ? "Nota local guardada. No es un enlace.\n" : "Nota local quitada.\n");
    return false;
  }
  if (name === "notificaciones") {
    notifications();
    return false;
  }
  if (name === "aviso") {
    state.notice = !state.notice;
    notifications();
    return false;
  }
  if (name === "widget") {
    widget();
    return false;
  }
  if (name === "permisos") {
    showCatalog("permisos");
    stdout.write(state.pause ? "\nLa pausa está dibujada aquí. El sistema no recibió nada.\n" : "\nEscribe pausa para dibujarla. No abre un diálogo.\n");
    return false;
  }
  if (name === "pausa") {
    state.pause = !state.pause;
    save(state);
    stdout.write(state.pause ? "Pausa dibujada en esta terminal. El sistema no recibió nada.\n" : "Pausa dibujada quitada.\n");
    return false;
  }
  if (name === "incidentes") {
    if (rest[0] === "fixture") state.fixture = !state.fixture;
    showCatalog("incidentes", state.fixture ? "review" : "ready");
    return false;
  }
  if (name === "cuenta") {
    showCatalog("cuenta");
    line("Tema", state.theme);
    return false;
  }
  if (name === "ajustes") {
    showCatalog("ajustes");
    line("Tema", state.theme);
    line("Pausa dibujada", state.pause ? "Sí" : "No");
    return false;
  }
  const catalogIds = ["protecciones", "investigacion", "dispositivos", "recursos", "politicas", "agregados", "integraciones", "auditoria", "facturacion"];
  if (catalogIds.includes(name)) {
    showCatalog(name);
    return false;
  }
  stdout.write(`No conozco «${head}». Escribe ayuda.\n`);
  return false;
}

export function runTerminal() {
  header();
  help();
  return new Promise((resolve) => {
    const rl = createInterface({ input: stdin, output: stdout, terminal: Boolean(stdin.isTTY) });
    const prompt = () => (state.demo ? "\nsovir> " : "\nsovir sin sesión> ");
    rl.setPrompt(prompt());
    rl.prompt();
    rl.on("line", (raw) => {
      rl.pause();
      Promise.resolve(handle(raw))
        .then((done) => {
          if (done) {
            rl.close();
            return;
          }
          if (!mailStep) {
            rl.setPrompt(prompt());
            rl.prompt();
          }
          rl.resume();
        })
        .catch((error) => {
          stdout.write(`\n${error.message}\n`);
          rl.close();
        });
    });
    rl.on("close", () => resolve());
  });
}
