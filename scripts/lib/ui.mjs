/**
 * Salida por consola, prompts y manejo de archivos .env.
 * Sin dependencias: todo esto sale de Node.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CRM_DIR = resolve(ROOT, "crm");

// ── colores ─────────────────────────────────────────────────────────────────
const soportaColor = process.stdout.isTTY && process.env.NO_COLOR === undefined;
const c = (code) => (s) => (soportaColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));
export const C = {
  dim: c(2), bold: c(1), green: c(32), red: c(31),
  yellow: c(33), blue: c(36), magenta: c(35),
};

// ── salida ──────────────────────────────────────────────────────────────────
export const problemas = [];

export const ok = (t, extra) =>
  console.log(`  ${C.green("✓")} ${t}${extra ? ` ${C.dim(extra)}` : ""}`);

export const fail = (t, comoArreglar) => {
  console.log(`  ${C.red("✗")} ${t}`);
  if (comoArreglar) console.log(`    ${C.dim(`→ ${comoArreglar}`)}`);
  problemas.push(t);
};

export const warn = (t, nota) => {
  console.log(`  ${C.yellow("!")} ${t}`);
  if (nota) console.log(`    ${C.dim(`→ ${nota}`)}`);
};

export const info = (t) => console.log(`    ${C.dim(t)}`);

export const titulo = (t) => console.log(`\n${C.bold(C.blue(t))}`);

export const encabezado = (t, sub) => {
  console.log(`\n${C.bold(t)}${sub ? ` ${C.dim(sub)}` : ""}`);
  console.log(C.dim("─".repeat(Math.min(70, (t + (sub || "")).length + 4))));
};

/** Barra de progreso de una línea, para las migraciones. */
export const progreso = (hechos, total, etiqueta) => {
  if (!process.stdout.isTTY) return;
  const ancho = 24;
  const llenos = Math.round((hechos / total) * ancho);
  const barra = "█".repeat(llenos) + "░".repeat(ancho - llenos);
  const txt = `  ${C.blue(barra)} ${hechos}/${total} ${C.dim(etiqueta || "")}`;
  process.stdout.write(`\r${txt.padEnd(90).slice(0, 110)}`);
  if (hechos === total) process.stdout.write("\n");
};

/**
 * Salida controlada.
 *
 * ⚠️ NUNCA usar process.exit() en estos scripts. En Node 24 sobre Windows,
 * llamarlo después de cualquier fetch() revienta libuv con
 * "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), src\win\async.c".
 * Verificado con un caso mínimo: fetch+exit() crashea; fetch+exitCode sale
 * limpio y rápido. El usuario veía su mensaje de error y enseguida un volcado
 * incomprensible que parecía un bug del instalador.
 *
 * Entonces: seteamos exitCode y lanzamos, para cortar el flujo sin matar el
 * proceso a mano. El handler de abajo se encarga del resto.
 */
class Salida extends Error {
  constructor(codigo = 1) {
    super("salida-controlada");
    this.codigo = codigo;
  }
}

// Un throw en el top-level de un módulo ESM llega como uncaughtException, no
// como unhandledRejection. Registramos los dos por las dudas: sin capturarlo,
// Node imprime el stack (feo e inútil para el usuario) y sale por su cuenta,
// que es justo el camino que dispara el crash de libuv.
const manejar = (e) => {
  if (e instanceof Salida) {
    process.exitCode = e.codigo;
    return; // sin re-lanzar: que el event loop se vacíe solo
  }
  console.error(`\n${C.red("Error inesperado:")}`, e);
  console.error(C.dim("\n  Pegale esto a Claude Code y lo arregla.\n"));
  process.exitCode = 1;
};
process.on("uncaughtException", manejar);
process.on("unhandledRejection", manejar);

/** Corta acá, con este código de salida. */
export const salir = (codigo = 0) => {
  process.exitCode = codigo;
  throw new Salida(codigo);
};

export const morir = (mensaje, comoArreglar) => {
  console.log(`\n${C.red(C.bold("✗ " + mensaje))}`);
  if (comoArreglar) console.log(`  ${C.dim(comoArreglar)}`);
  console.log("");
  salir(1);
};

// ── prompts ─────────────────────────────────────────────────────────────────

/**
 * Pregunta por consola. Con `secreto: true` no se ve lo que se tipea
 * (importante: mucha gente hace esto grabando la pantalla).
 */
export function preguntar(texto, { secreto = false, porDefecto = "" } = {}) {
  const etiqueta = porDefecto ? `${texto} ${C.dim(`[${porDefecto}]`)}: ` : `${texto}: `;

  if (!process.stdin.isTTY) {
    // Sin terminal interactiva (CI, pipe): no se puede preguntar.
    return Promise.resolve(porDefecto);
  }

  return new Promise((resolveP) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    if (secreto) {
      // Mientras se tipea no se escribe nada en pantalla; sí el prompt.
      let promptEscrito = false;
      rl._writeToOutput = function (s) {
        if (!promptEscrito) {
          rl.output.write(etiqueta);
          promptEscrito = true;
          return;
        }
        if (s.includes("\n")) rl.output.write("\n");
      };
    }

    rl.question(etiqueta, (val) => {
      rl.close();
      resolveP((val || "").trim() || porDefecto);
    });
  });
}

export async function confirmar(texto, porDefecto = true) {
  const hint = porDefecto ? "S/n" : "s/N";
  const r = (await preguntar(`${texto} ${C.dim(`(${hint})`)}`, { porDefecto: "" }))
    .toLowerCase();
  if (!r) return porDefecto;
  return r.startsWith("s") || r.startsWith("y");
}

export async function elegir(texto, opciones) {
  console.log(`\n  ${texto}`);
  opciones.forEach((o, i) => console.log(`    ${C.bold(String(i + 1))}. ${o.label}`));
  const r = await preguntar("  Número", { porDefecto: "1" });
  const i = parseInt(r, 10) - 1;
  return opciones[Number.isInteger(i) && i >= 0 && i < opciones.length ? i : 0];
}

// ── archivos .env ───────────────────────────────────────────────────────────

export function leerEnv(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

/**
 * Reescribe un .env preservando las claves que ya estaban y que no tocamos.
 * `bloques` es [{ titulo, vars: {K: V} }] y se escribe en ese orden.
 */
export function escribirEnv(path, bloques, notaCabecera = "") {
  const lineas = [];
  if (notaCabecera) {
    lineas.push("# " + "=".repeat(74));
    for (const l of notaCabecera.split("\n")) lineas.push(`# ${l}`.trimEnd());
    lineas.push("# " + "=".repeat(74), "");
  }
  for (const b of bloques) {
    if (b.titulo) lineas.push(`# ─── ${b.titulo} ${"─".repeat(Math.max(0, 62 - b.titulo.length))}`);
    for (const [k, v] of Object.entries(b.vars)) {
      if (v === undefined || v === null) continue;
      lineas.push(`${k}=${v}`);
    }
    lineas.push("");
  }
  writeFileSync(path, lineas.join("\n"), "utf8");
}

// ── prerequisitos ───────────────────────────────────────────────────────────

/**
 * Node viejo falla de formas raras y difíciles de interpretar (fetch que no
 * existe, sintaxis que no parsea). Mejor decirlo de entrada y en castellano.
 */
export function verificarNode(minimo = 20) {
  const mayor = parseInt(process.versions.node.split(".")[0], 10);
  if (Number.isFinite(mayor) && mayor < minimo) {
    console.log(`\n${C.red(C.bold(`✗ Tu Node.js es muy viejo: v${process.versions.node}`))}`);
    console.log(`  ${C.dim(`Hace falta la versión ${minimo} o más nueva.`)}`);
    console.log(`  ${C.dim("Bajala de https://nodejs.org (elegí la opción LTS), instalá,")}`);
    console.log(`  ${C.dim("cerrá esta ventana, abrí una nueva y volvé a intentar.")}\n`);
    process.exit(1);
  }
}

// ── dónde viven las credenciales ────────────────────────────────────────────

/**
 * Por defecto, `credenciales.env` al lado de este repo. Pero se puede guardar
 * en otro lado —una carpeta sincronizada, un disco cifrado, una ubicación
 * compartida con tu equipo— para no volver a cargarlas en cada máquina.
 *
 * Orden de búsqueda:
 *   1. la variable de entorno CRM_CREDENCIALES
 *   2. lo que diga el archivo `credenciales.ruta` (una línea con la ruta)
 *   3. ./credenciales.env
 *
 * Lo que NUNCA hay que hacer es commitear el archivo: queda en el historial de
 * git para siempre, y este repo está pensado para compartirse.
 * Para vincular una ubicación externa:  npm run vincular -- "<ruta>"
 */
export function rutaCredenciales() {
  if (process.env.CRM_CREDENCIALES) return process.env.CRM_CREDENCIALES;

  const puntero = resolve(ROOT, "credenciales.ruta");
  if (existsSync(puntero)) {
    const linea = readFileSync(puntero, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith("#"));
    if (linea) return linea;
  }

  return resolve(ROOT, "credenciales.env");
}

/** Para mensajes: dice si las credenciales están afuera y dónde. */
export function credencialesExternas() {
  const r = rutaCredenciales();
  return r === resolve(ROOT, "credenciales.env") ? null : r;
}

// ── estado local (idempotencia) ─────────────────────────────────────────────
const ESTADO = resolve(ROOT, ".instalador.json");

export function leerEstado() {
  if (!existsSync(ESTADO)) return {};
  try {
    return JSON.parse(readFileSync(ESTADO, "utf8"));
  } catch {
    return {};
  }
}

export function guardarEstado(parcial) {
  const actual = leerEstado();
  const nuevo = { ...actual, ...parcial, actualizado: new Date().toISOString() };
  writeFileSync(ESTADO, JSON.stringify(nuevo, null, 2), "utf8");
  return nuevo;
}

// ── utilidades ──────────────────────────────────────────────────────────────
export const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch con timeout, limpiando el temporizador siempre.
 *
 * ⚠️ No usar AbortSignal.timeout() acá: deja un handle vivo que, si el proceso
 * termina antes de que expire, hace crashear a libuv en Windows con
 * "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)". El usuario ve el
 * mensaje de error correcto y ENSEGUIDA un volcado incomprensible.
 * Con un AbortController propio y clearTimeout en finally, no queda nada colgado.
 */
export async function pedir(url, opciones = {}, ms = 25000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opciones, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export const enmascarar = (s) =>
  !s ? "(vacío)" : s.length <= 12 ? "••••" : `${s.slice(0, 6)}…${s.slice(-4)}`;

export const resumenFinal = (tituloOk, tituloMal, pista) => {
  console.log("");
  if (problemas.length === 0) {
    console.log(`${C.green(C.bold("✓ " + tituloOk))}\n`);
    return 0;
  }
  console.log(`${C.red(C.bold(`✗ ${problemas.length} problema(s) — ${tituloMal}:`))}`);
  problemas.forEach((p) => console.log(`  · ${p}`));
  if (pista) console.log(C.dim(`\n  ${pista}`));
  console.log("");
  process.exitCode = 1;
  return 1;
};
