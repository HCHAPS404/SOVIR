import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const catalog = JSON.parse(readFileSync(resolve(root, "packages/ui-web/src/catalog.json"), "utf8"));

const surfaces = {
  website: "http://127.0.0.1:3000",
  console: "http://127.0.0.1:3001",
  android: "http://127.0.0.1:8766/apps/android/preview/index.html",
  ios: "http://127.0.0.1:8766/apps/ios/preview/index.html",
  desktop: "http://127.0.0.1:8766/apps/desktop/shell/index.html",
};

function find(id) {
  return catalog.sections.find((section) => section.id === id || section.path === id || section.label.toLowerCase() === String(id).toLowerCase());
}

function argsOf(list) {
  const flags = {};
  const words = [];
  for (const item of list) {
    if (item.startsWith("--")) {
      const [key, value] = item.slice(2).split("=");
      flags[key] = value ?? true;
    } else words.push(item);
  }
  return { words, flags };
}

function withTheme(url, theme) {
  if (theme !== "light" && theme !== "dark") return url;
  const target = new URL(url);
  target.searchParams.set("theme", theme);
  return target.toString();
}

function urlFor(surface, section, state, theme) {
  const base = surfaces[surface];
  if (!base) return "";
  let url = base;
  if (surface === "website") {
    if (section?.id === "registro") url = `${base}/registro`;
    else if (section?.id === "entrar") url = `${base}/sign-in`;
  } else if (surface === "console") {
    url = `${base}${section ? section.path : "/"}`;
    if (state) url += `?state=${encodeURIComponent(state)}`;
  } else {
    const query = new URLSearchParams();
    if (section) query.set("section", section.id);
    if (state) query.set("state", state);
    const text = query.toString();
    if (text) url = `${base}?${text}`;
  }
  return withTheme(url, theme);
}

function open(url) {
  if (process.platform === "win32") spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
  else if (process.platform === "darwin") spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
  else spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
}

function help() {
  console.log(`SOVIR CLI — control del esqueleto local

  pnpm sovir list
  pnpm sovir show <seccion> [--state=review]
  pnpm sovir open <website|console|android|ios|desktop> [seccion] [--state=empty] [--theme=dark]
  pnpm sovir theme light|dark
  pnpm sovir status

No crea cuentas, no concede captura y no llama a un proveedor.
Sitio en 3000, consola en 3001, vistas nativas en 8766.`);
}

const [command, ...rest] = process.argv.slice(2);
const { words, flags } = argsOf(rest);

if (!command || command === "help" || flags.help) {
  help();
} else if (command === "list") {
  let group = "";
  for (const section of catalog.sections) {
    if (section.group !== group) {
      group = section.group;
      console.log(`\n${group}`);
    }
    console.log(`  ${section.id.padEnd(16)} ${section.path}`);
  }
  console.log(`\nEstados: ${catalog.states.join(", ")}`);
} else if (command === "show") {
  const section = find(words[0]);
  if (!section) {
    console.error("Sección no encontrada.");
    process.exitCode = 1;
  } else {
    const state = flags.state || "ready";
    const view = state === "ready" ? section : { ...section, ...(section.states[state] || {}) };
    console.log(`${view.title} · ${state}`);
    console.log(view.lede || section.lede);
    console.log(view.note || section.note);
    for (const [name, value] of view.rows || []) console.log(`  ${name}: ${value}`);
  }
} else if (command === "open") {
  const surface = words[0];
  if (!surfaces[surface]) {
    console.error("Superficie: website, console, android, ios o desktop.");
    process.exitCode = 1;
  } else {
    const section = words[1] ? find(words[1]) : null;
    if (words[1] && !section) {
      console.error("Sección no encontrada.");
      process.exitCode = 1;
    } else {
      const url = urlFor(surface, section, flags.state, flags.theme);
      console.log(url);
      open(url);
    }
  }
} else if (command === "theme") {
  const theme = words[0];
  if (theme !== "light" && theme !== "dark") {
    console.log("Usa: pnpm sovir theme light");
    console.log("     pnpm sovir theme dark");
    console.log("Cada superficie tiene los botones Claro y Oscuro. El comando abre el tema en la URL.");
  } else {
    console.log(`Tema ${theme}.`);
    for (const [name, base] of Object.entries(surfaces)) console.log(`  ${name.padEnd(10)} ${withTheme(base, theme)}`);
  }
} else if (command === "status") {
  console.log(`Secciones: ${catalog.sections.length}`);
  console.log(`Estados: ${catalog.states.length}`);
  console.log("Web pública y consola: operativas en local, con datos sintéticos.");
  console.log("Android e iOS: diseño navegable. Compilación NOT_IMPLEMENTED.");
  console.log("Escritorio: shell navegable. Tauri y captura NOT_IMPLEMENTED.");
  console.log("Marca: Umbral, identidad final del esqueleto. Nombre en Outfit.");
} else {
  console.error(`Comando desconocido: ${command}`);
  help();
  process.exitCode = 1;
}
