#!/usr/bin/env node
/**
 * npm run creds — revisa credenciales.env y te dice, dato por dato, qué falta
 * y de dónde sacarlo. Si el archivo no existe, lo crea desde el ejemplo y
 * ofrece cargarlo de forma interactiva (sin mostrar lo que tipeás).
 *
 * No toca nada de Supabase ni de Meta: solo mira que estén los cuatro datos
 * y que tengan pinta de ser lo que dicen ser.
 */

import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  ROOT, C, ok, fail, warn, info, encabezado, leerEnv, escribirEnv,
  preguntar, confirmar, enmascarar, resumenFinal, problemas,
  rutaCredenciales, credencialesExternas, verificarNode,
} from "./lib/ui.mjs";

verificarNode();

const CREDS = rutaCredenciales();
const EJEMPLO = resolve(ROOT, "credenciales.env.example");

const CAMPOS = [
  {
    k: "SUPABASE_ACCESS_TOKEN",
    etiqueta: "Personal Access Token de Supabase",
    donde: "supabase.com/dashboard/account/tokens → Generate new token",
    obligatorio: true,
    secreto: true,
    validar: (v) =>
      v.startsWith("sbp_") ? null : "no arranca con 'sbp_' — ¿copiaste el token entero?",
  },
  {
    k: "META_APP_ID",
    etiqueta: "App ID de Meta",
    donde: "developers.facebook.com → tu app → Configuración → Básica",
    obligatorio: true,
    validar: (v) => (/^\d{10,}$/.test(v) ? null : "tendría que ser un número largo, solo dígitos"),
  },
  {
    k: "META_APP_SECRET",
    etiqueta: "App Secret de Meta",
    donde: "developers.facebook.com → tu app → Configuración → Básica → Mostrar",
    obligatorio: true,
    secreto: true,
    validar: (v) =>
      /^[a-f0-9]{32}$/i.test(v) ? null : "suele ser una tira de 32 caracteres hexadecimales",
  },
  {
    k: "META_ACCESS_TOKEN",
    etiqueta: "Token permanente del System User",
    donde: "business.facebook.com → Configuración del negocio → Usuarios del sistema → Generar token",
    obligatorio: true,
    secreto: true,
    validar: (v) => (v.length > 60 ? null : "parece corto para ser un token de Meta"),
  },
  {
    k: "PUBLIC_URL",
    etiqueta: "URL pública del CRM",
    donde: "tu dominio, o la URL del túnel si todavía estás probando (docs/03-deploy.md)",
    obligatorio: false,
    validar: (v) => {
      if (!/^https:\/\//.test(v)) return "tiene que empezar con https:// (Meta no acepta http)";
      if (v.endsWith("/")) return "sacale la barra del final";
      if (/localhost|127\.0\.0\.1/.test(v)) return "localhost no le sirve a Meta: necesita alcanzarla desde internet";
      return null;
    },
  },
  { k: "SUPABASE_PROJECT_REF", etiqueta: "Project Ref de Supabase (opcional)", obligatorio: false },
  { k: "META_WABA_ID", etiqueta: "WABA ID (opcional)", obligatorio: false },
  { k: "VERIFY_TOKEN", etiqueta: "Verify token del webhook (opcional)", obligatorio: false },
];

encabezado("Credenciales", "— los 4 datos que el instalador no puede sacar solo");

const externas = credencialesExternas();
if (externas) console.log(`\n  ${C.dim("Guardadas fuera del repo:")} ${externas}`);

// ── el archivo ──────────────────────────────────────────────────────────────
if (!existsSync(CREDS)) {
  copyFileSync(EJEMPLO, CREDS);
  console.log(`\n  ${C.yellow("Creé credenciales.env")} a partir del ejemplo.`);
  info("Está en .gitignore: no se sube a GitHub.");
}

let env = leerEnv(CREDS);
const faltan = CAMPOS.filter((c) => c.obligatorio && !env[c.k]);

// ── carga interactiva ───────────────────────────────────────────────────────
if (faltan.length && process.stdin.isTTY) {
  console.log(`\n  Faltan ${C.bold(String(faltan.length))} dato(s).`);
  const interactivo = await confirmar("  ¿Los cargamos ahora acá? (si no, editá credenciales.env a mano)");
  if (interactivo) {
    console.log(C.dim("\n  Lo que tipeés no se va a ver en pantalla. Enter para saltear.\n"));
    for (const campo of faltan) {
      console.log(`  ${C.bold(campo.etiqueta)}`);
      if (campo.donde) info(campo.donde);
      const val = await preguntar("  Pegalo acá", { secreto: campo.secreto });
      if (val) env[campo.k] = val;
      console.log("");
    }
    if (!env.PUBLIC_URL) {
      console.log(`  ${C.bold("URL pública del CRM")} ${C.dim("(podés dejarla para después)")}`);
      info("Si todavía no deployaste, dejala vacía y corré el paso 2 más tarde.");
      const val = await preguntar("  URL", {});
      if (val) env.PUBLIC_URL = val.replace(/\/+$/, "");
      console.log("");
    }
    guardar(env);
  }
}

// El verify token lo generamos nosotros: no tiene sentido pedírselo a nadie,
// y el "123456" que sugieren los tutoriales es lo único que separa a tu webhook
// de cualquiera que se quiera hacer pasar por Meta.
let verifyRecienGenerado = false;
if (!env.VERIFY_TOKEN) {
  env.VERIFY_TOKEN = generarVerifyToken();
  guardar(env);
  verifyRecienGenerado = true;
}

// ── verificación ────────────────────────────────────────────────────────────
console.log("");
for (const campo of CAMPOS) {
  const v = (env[campo.k] || "").trim();

  if (!v) {
    if (campo.obligatorio) fail(`${campo.k} vacío`, campo.donde);
    else info(`${campo.k} vacío — opcional`);
    continue;
  }

  const problema = campo.validar?.(v);
  if (problema) {
    // Es una advertencia, no un error: los formatos de Meta cambian y no
    // quiero frenar una instalación buena por una heurística mía.
    warn(`${campo.k}: ${problema}`, `valor: ${campo.secreto ? enmascarar(v) : v}`);
  } else {
    ok(campo.k, campo.secreto ? enmascarar(v) : v);
  }
}

if (verifyRecienGenerado) {
  info("El VERIFY_TOKEN lo generé yo, al azar — es más seguro que el '123456'");
  info("que sugieren los tutoriales.");
}

console.log("");
if (problemas.length === 0) {
  const listoParaMeta = !!env.PUBLIC_URL;
  console.log(`${C.green(C.bold("✓ Credenciales completas."))}`);
  console.log(C.dim(`  Siguiente: ${C.bold("npm run paso1")} (Supabase: proyecto + 39 migraciones)`));
  if (!listoParaMeta) {
    console.log(C.dim("  PUBLIC_URL está vacía — la vas a necesitar recién en el paso 2."));
  }
  console.log("");
} else {
  resumenFinal("", "sin esto no puedo seguir", "Detalle de dónde sale cada dato: docs/01-meta.md");
}

// ── helpers ─────────────────────────────────────────────────────────────────
function guardar(valores) {
  escribirEnv(
    CREDS,
    [
      { titulo: "SUPABASE", vars: { SUPABASE_ACCESS_TOKEN: valores.SUPABASE_ACCESS_TOKEN || "", SUPABASE_PROJECT_REF: valores.SUPABASE_PROJECT_REF || "" } },
      { titulo: "META / WHATSAPP", vars: { META_APP_ID: valores.META_APP_ID || "", META_APP_SECRET: valores.META_APP_SECRET || "", META_ACCESS_TOKEN: valores.META_ACCESS_TOKEN || "", META_WABA_ID: valores.META_WABA_ID || "" } },
      { titulo: "DOMINIO", vars: { PUBLIC_URL: valores.PUBLIC_URL || "", VERIFY_TOKEN: valores.VERIFY_TOKEN || "" } },
    ],
    "CREDENCIALES — generado por el instalador.\nNO subir a GitHub. NO mostrar si grabás pantalla.\n¿De dónde sale cada dato? docs/01-meta.md",
  );
  env = leerEnv(CREDS);
}

function generarVerifyToken() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
