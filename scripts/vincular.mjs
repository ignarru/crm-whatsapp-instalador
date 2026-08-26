#!/usr/bin/env node
/**
 * npm run vincular -- "<ruta>"
 *
 * Guarda tus credenciales FUERA del repo y deja acá un puntero a esa ubicación.
 *
 * Para qué sirve: si trabajás en dos computadoras —o compartís el setup con
 * alguien de tu equipo— podés poner el archivo en una carpeta sincronizada y
 * no volver a cargar las credenciales en cada máquina.
 *
 * Lo que NO hay que hacer nunca es commitear el archivo al repo: git guarda el
 * historial para siempre, así que borrarlo después no lo saca. Y este repo está
 * pensado para compartirse.
 *
 * Ejemplo:
 *   npm run vincular -- "C:\\Users\\vos\\OneDrive\\secretos\\crm.env"
 *   npm run vincular -- --deshacer     (vuelve a usar el del repo)
 */

import { existsSync, copyFileSync, writeFileSync, unlinkSync, mkdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import {
  ROOT, C, ok, info, warn, encabezado, titulo, morir, leerEnv, confirmar, rutaCredenciales,
} from "./lib/ui.mjs";

const LOCAL = resolve(ROOT, "credenciales.env");
const PUNTERO = resolve(ROOT, "credenciales.ruta");

const arg = process.argv.slice(2).find((a) => a && a !== "--");

encabezado("Vincular credenciales", "guardarlas fuera del repo");

// ── deshacer ────────────────────────────────────────────────────────────────
if (arg === "--deshacer") {
  if (!existsSync(PUNTERO)) morir("No hay ninguna ubicación externa vinculada.");
  const anterior = rutaCredenciales();
  unlinkSync(PUNTERO);
  ok("Puntero borrado");
  info(`Vuelvo a usar: ${LOCAL}`);
  info(`Tu archivo sigue intacto en: ${anterior}`);
  console.log("");
  process.exit(0);
}

if (!arg) {
  const actual = rutaCredenciales();
  console.log(`
  Ahora mismo las credenciales se leen de:
     ${C.bold(actual)}
     ${existsSync(actual) ? C.dim("(el archivo existe)") : C.yellow("(el archivo NO existe todavía)")}

  ${C.bold("Para guardarlas en otro lado:")}
     npm run vincular -- "C:\\ruta\\a\\tu\\carpeta\\crm.env"

  ${C.bold("Para volver a usar el archivo del repo:")}
     npm run vincular -- --deshacer

  ${C.dim("También funciona la variable de entorno CRM_CREDENCIALES, que tiene")}
  ${C.dim("prioridad sobre todo lo demás.")}
`);
  process.exit(0);
}

// ── vincular ────────────────────────────────────────────────────────────────
const destino = resolve(arg);

titulo("1. Destino");

if (destino === LOCAL) morir("Esa es la ubicación por defecto.", "No hace falta vincular nada.");

// Que no lo manden adentro del repo: el objetivo es sacarlo de acá.
if (destino.toLowerCase().startsWith(ROOT.toLowerCase())) {
  warn("Esa ruta está DENTRO del repo", "el objetivo es justamente sacar las credenciales de acá");
  const igual = await confirmar("  ¿Seguro que querés eso?", false);
  if (!igual) {
    console.log(C.dim("\n  Cancelado. No toqué nada.\n"));
    process.exit(0);
  }
}

const carpeta = dirname(destino);
if (!existsSync(carpeta)) {
  mkdirSync(carpeta, { recursive: true });
  ok("Carpeta creada", carpeta);
}
ok("Destino", destino);

// ── mover lo que ya tengas ──────────────────────────────────────────────────
titulo("2. Tus credenciales actuales");

if (existsSync(destino)) {
  const cuantas = Object.values(leerEnv(destino)).filter(Boolean).length;
  ok("Ya hay un archivo ahí", `${cuantas} valor(es) cargado(s)`);

  if (existsSync(LOCAL)) {
    const localCargadas = Object.values(leerEnv(LOCAL)).filter(Boolean).length;
    warn(`También tenés uno en el repo con ${localCargadas} valor(es)`, "no lo piso");
    info("Va a usarse el del destino. Si querés el otro, copialo a mano.");
  }
} else if (existsSync(LOCAL)) {
  copyFileSync(LOCAL, destino);
  const cuantas = Object.values(leerEnv(destino)).filter(Boolean).length;
  ok("Copiado al destino", `${cuantas} valor(es)`);

  // La copia del repo se borra: dejar dos copias de un archivo con secretos es
  // la forma más común de que una quede desactualizada y la otra se filtre.
  unlinkSync(LOCAL);
  ok("Borré la copia del repo", "para que haya una sola fuente de verdad");
} else {
  writeFileSync(destino, "", "utf8");
  ok("Archivo vacío creado", "cargalo con: npm run creds");
}

// ── el puntero ──────────────────────────────────────────────────────────────
titulo("3. Puntero");

writeFileSync(
  PUNTERO,
  `# Dónde están tus credenciales. Generado por: npm run vincular\n` +
    `# Este archivo NO se sube a git (revela rutas de tu máquina).\n` +
    `# Para deshacer:  npm run vincular -- --deshacer\n` +
    `${destino}\n`,
  "utf8",
);
ok("credenciales.ruta escrito", "está en .gitignore");

const verificado = rutaCredenciales();
if (verificado !== destino) morir(`Algo salió mal: quedó apuntando a ${verificado}`);

console.log(`
  ${C.green(C.bold("✓ Listo."))}

  Tus credenciales viven en:
     ${C.bold(destino)}

  ${C.bold("En tu otra computadora")}, después de clonar el repo, corré ${C.bold("el mismo comando")}
  con la misma ruta y ya las tenés: no hay que volver a cargar nada.

  ${C.dim("Recordá que ese archivo tiene llaves con acceso total a tu cuenta de")}
  ${C.dim("Supabase y a tu WhatsApp. Guardalo donde guardarías una contraseña.")}
`);
