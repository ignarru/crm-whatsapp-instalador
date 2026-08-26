#!/usr/bin/env node
/**
 * npm run instalar — el comando único. Encadena todo en orden y va parando
 * donde de verdad necesita algo tuyo.
 *
 * Cada paso también se puede correr suelto (npm run creds / paso1 / paso2 /
 * check). Si algo se rompe a la mitad, arreglás y volvés a correr: todos los
 * pasos son idempotentes.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  ROOT, CRM_DIR, C, encabezado, info, leerEnv, confirmar, salir, rutaCredenciales,
  verificarNode,
} from "./lib/ui.mjs";

verificarNode();

const paso = (nombre) => {
  const r = spawnSync(process.execPath, [resolve(ROOT, "scripts", nombre)], {
    stdio: "inherit",
  });
  return r.status === 0;
};

console.log(`
${C.bold("  CRM de WhatsApp — instalador")}
${C.dim("  De 41 pasos manuales a cuatro credenciales y un comando.")}
${C.dim("  El CRM es wacrm (MIT). Este instalador es de IABYIA.")}
`);

// ── 1 ───────────────────────────────────────────────────────────────────────
if (!paso("credenciales.mjs")) {
  console.log(C.dim("\n  Completá credenciales.env y volvé a correr:  npm run instalar\n"));
  salir(1);
}

// ── 2 ───────────────────────────────────────────────────────────────────────
if (!paso("paso1-supabase.mjs")) salir(1);

// ── 3 ───────────────────────────────────────────────────────────────────────
const creds = leerEnv(rutaCredenciales());

if (!creds.PUBLIC_URL) {
  encabezado("Falta un solo dato: tu URL pública");
  console.log(`
  Supabase ya está listo y el CRM configurado. Lo que sigue —conectar
  WhatsApp— necesita una dirección de internet a la que Meta pueda llegar.
  ${C.dim("Con localhost no alcanza: Meta tiene que poder golpearte la puerta.")}

  ${C.bold("Dos caminos")} ${C.dim("(el detalle está en docs/03-deploy.md)")}

    ${C.bold("a)")} Probar ya, gratis, en 2 minutos ${C.dim("— sin cuenta en ningún lado")}
       ${C.bold("npm run levantar")}  ${C.dim("en una terminal, y dejala abierta")}
       ${C.bold("npm run tunel")}     ${C.dim("en otra: te da la URL y la guarda sola")}

    ${C.bold("b)")} Deployarlo en serio
       Tu VPS, Vercel, Railway, EasyPanel, Hostinger. Cualquiera sirve:
       el repo ya trae Dockerfile y docker-compose.yml.

  Cuando tengas la URL, ponela en ${C.bold("PUBLIC_URL")} de credenciales.env y corré:

     ${C.bold("npm run paso1")}   ${C.dim("(para que los mails apunten a tu dominio)")}
     ${C.bold("npm run paso2")}   ${C.dim("(conecta WhatsApp)")}
`);
  salir(0);
}

// ── 4 ───────────────────────────────────────────────────────────────────────
encabezado("Antes de conectar WhatsApp");
console.log(`
  El paso 2 le pide a Meta que verifique tu webhook, así que el CRM tiene
  que estar respondiendo en ${C.bold(creds.PUBLIC_URL)} ahora mismo.
`);
if (!(await confirmar("  ¿Está arriba?", true))) {
  console.log(C.dim(`\n  Levantalo (npm run levantar o tu deploy) y corré:  npm run paso2\n`));
  salir(0);
}

if (!paso("paso2-meta.mjs")) salir(1);

// ── 5 ───────────────────────────────────────────────────────────────────────
paso("check.mjs");
