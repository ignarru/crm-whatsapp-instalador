#!/usr/bin/env node
/**
 * npm run tunel — le da una dirección de internet al CRM que corre en tu compu.
 *
 * WhatsApp necesita poder golpearle la puerta a tu CRM desde afuera, y a
 * localhost no llega. Esto abre un túnel, captura la URL que te asignan y la
 * escribe solo en credenciales.env. No hace falta tener cuenta en ningún lado.
 *
 * El túnel vive mientras esta ventana esté abierta. Es para probar: para algo
 * permanente, mirá docs/03-deploy.md.
 */

import { resolve } from "node:path";
import { appendFileSync, writeFileSync } from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import {
  ROOT, C, ok, info, warn, encabezado, titulo, morir, leerEnv, escribirEnv,
  pedir, dormir, progreso, rutaCredenciales,
} from "./lib/ui.mjs";

const CREDS = rutaCredenciales();
const LOG = resolve(ROOT, "tunel.log");
const PUERTO = process.env.PORT || "3000";

writeFileSync(LOG, "");

encabezado("Túnel", "una dirección pública para tu CRM");

// ── ¿está la app levantada? ─────────────────────────────────────────────────
titulo("1. La app");

let viva = false;
try {
  const r = await pedir(`http://localhost:${PUERTO}`, { redirect: "manual" }, 6000);
  viva = r.status < 500;
} catch {
  /* abajo */
}

if (!viva) {
  morir(
    `No hay nada respondiendo en http://localhost:${PUERTO}`,
    "Abrí otra terminal, corré  npm run levantar  y dejala abierta.\n" +
      "  Después volvé acá y corré  npm run tunel  otra vez.",
  );
}
ok(`El CRM responde en localhost:${PUERTO}`);

// ── el túnel ────────────────────────────────────────────────────────────────
titulo("2. Abriendo el túnel");

// El puerto entra en la línea de comandos: lo validamos para no concatenar
// nada raro.
if (!/^\d{2,5}$/.test(String(PUERTO))) morir(`Puerto inválido: ${PUERTO}`);

const propio = tieneBinario("cloudflared");
const destino = `http://localhost:${PUERTO}`;

// Un solo string en vez de (comando, args[]) a propósito: en Windows hace falta
// shell para invocar npx, y la combinación shell + array dispara un
// DeprecationWarning que ensucia la pantalla del usuario sin aportar nada.
const linea = propio
  ? `cloudflared tunnel --url ${destino}`
  : `npx -y cloudflared tunnel --url ${destino}`;

if (!propio) info("Usando npx (la primera vez descarga el binario: puede tardar un minuto).");

const hijo = spawn(linea, { shell: true });

// Si nos matan con Ctrl+C, nos llevamos el túnel puesto: un cloudflared
// huérfano deja un túnel que nadie controla y que el usuario no sabe cerrar.
const matarHijo = () => {
  try {
    hijo.kill();
  } catch {
    /* ya estaba muerto */
  }
};
process.on("SIGINT", () => {
  console.log(C.dim("\n\n  Cerrando el túnel…\n"));
  matarHijo();
  process.exitCode = 0;
});
process.on("exit", matarHijo);

let url = "";
let avisado = false;

const mirar = (buf) => {
  const texto = buf.toString();

  // Todo el log crudo va a un archivo: cuando un túnel no levanta, la
  // explicación está siempre acá y en pantalla no se ve.
  try {
    appendFileSync(LOG, texto);
  } catch {
    /* el log es una ayuda, no una condición para seguir */
  }

  if (!url) {
    const m = texto.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (m) {
      url = m[0];
      guardarUrl(url);
    }
  }

  // El banner de cloudflared es ruidoso: solo mostramos lo que importa.
  for (const linea of texto.split("\n")) {
    if (/ERR |error|failed/i.test(linea) && !/^\s*$/.test(linea)) {
      const limpia = linea.replace(/^\S+\s+\S+\s+/, "").trim();
      if (limpia && !avisado) info(limpia.slice(0, 160));
    }
  }
};

hijo.stdout.on("data", mirar);
hijo.stderr.on("data", mirar);

hijo.on("exit", (code) => {
  if (!url) {
    console.log("");
    warn(`El túnel se cerró (código ${code}) sin darme una URL`, "probá el camino alternativo de docs/03-deploy.md");
    process.exitCode = 1;
  }
});

// Esperamos la URL hasta un minuto y medio (con npx, la primera vez descarga).
for (let i = 0; i < 90 && !url && hijo.exitCode === null; i++) await dormir(1000);

if (!url) {
  hijo.kill();
  morir(
    "No conseguí una URL pública.",
    "Alternativa sin instalar nada:  npx localtunnel --port " + PUERTO + "\n" +
      "  Después pegá esa URL en PUBLIC_URL de credenciales.env a mano.",
  );
}

avisado = true;
ok("Dirección asignada", url);
info("Guardada en PUBLIC_URL de credenciales.env");

// ── esperar a que sea alcanzable de verdad ──────────────────────────────────
titulo("3. Esperando a que esté en línea");
info("La dirección tarda entre 1 y 4 minutos en activarse en todo internet.");
info("Es normal: el túnel ya está conectado, falta que se propague el DNS.");
info("Espero yo, así el paso 2 no falla por arrancar antes de tiempo.");

// ⚠️ Los primeros 20 s NO se prueba nada, y después se prueba cada 10 s.
// Consultar el nombre antes de que exista hace que el sistema se guarde un
// "no existe" durante varios minutos, y el propio chequeo termina retrasando
// lo que quería medir. Verificado a mano: con sondeos cada 3 s desde el
// segundo cero, la dirección "no respondía" pasados 2 minutos aunque el túnel
// estaba conectado; dejándola tranquila, resuelve sola.
await dormir(20000);

let enLinea = false;
const INTENTOS = 30; // 30 × 10 s ≈ 5 minutos
for (let i = 1; i <= INTENTOS && !enLinea; i++) {
  try {
    const r = await pedir(url, { redirect: "manual" }, 8000);
    if (r.status < 500) enLinea = true;
  } catch {
    /* todavía no */
  }
  if (!enLinea) {
    progreso(i, INTENTOS, `esperando el DNS (${i * 10 + 20}s)`);
    await dormir(10000);
  }
}

console.log("");
if (enLinea) {
  ok("La dirección responde desde internet");
} else {
  warn("Todavía no responde", "el túnel está conectado igual — probá abrirla en el navegador");
  info("Si en un par de minutos anda, seguí normalmente con el paso 1.");
  info(`Detalle técnico completo en: ${LOG}`);
}

// ── listo ───────────────────────────────────────────────────────────────────
console.log(`
  ${C.green(C.bold("✓ Tu CRM ya está en internet:"))}

     ${C.bold(url)}

  ${C.bold("Dejá esta ventana abierta")} ${C.dim("— si la cerrás, se corta el túnel.")}

  ${C.bold("En OTRA terminal, corré:")}
     ${C.bold("npm run paso1")}   ${C.dim("(actualiza el Site URL con esta dirección)")}
     ${C.bold("npm run paso2")}   ${C.dim("(conecta WhatsApp)")}

  ${C.dim("Ctrl+C para cerrar el túnel.")}
`);

// Nos quedamos vivos mientras viva el túnel. Sin esto, Node termina, el
// proceso de cloudflared queda huérfano y el túnel se cae solo al rato.
await new Promise((resolver) => hijo.on("exit", resolver));
console.log(C.dim("\n  El túnel se cerró.\n"));

// ── helpers ─────────────────────────────────────────────────────────────────
function tieneBinario(nombre) {
  try {
    // Sin shell: con shell + args en array, Node tira un DeprecationWarning
    // que le aparece al usuario en pantalla y no significa nada acá.
    execFileSync(nombre, ["--version"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function guardarUrl(u) {
  const c = leerEnv(CREDS);
  c.PUBLIC_URL = u;
  escribirEnv(
    CREDS,
    [
      { titulo: "SUPABASE", vars: {
        SUPABASE_ACCESS_TOKEN: c.SUPABASE_ACCESS_TOKEN || "",
        SUPABASE_PROJECT_REF: c.SUPABASE_PROJECT_REF || "",
        SUPABASE_DB_PASSWORD: c.SUPABASE_DB_PASSWORD || "",
      }},
      { titulo: "META / WHATSAPP", vars: {
        META_APP_ID: c.META_APP_ID || "",
        META_APP_SECRET: c.META_APP_SECRET || "",
        META_ACCESS_TOKEN: c.META_ACCESS_TOKEN || "",
        META_WABA_ID: c.META_WABA_ID || "",
      }},
      { titulo: "DOMINIO", vars: {
        PUBLIC_URL: c.PUBLIC_URL || "",
        VERIFY_TOKEN: c.VERIFY_TOKEN || "",
      }},
    ],
    "CREDENCIALES — generado por el instalador.\nNO subir a GitHub. NO mostrar si grabás pantalla.",
  );
}
