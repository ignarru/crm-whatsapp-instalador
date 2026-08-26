#!/usr/bin/env node
/**
 * npm run paso1 — todo lo de Supabase, de una.
 *
 * Reemplaza estos pasos del tutorial manual:
 *   · crear el proyecto y anotar la contraseña en un bloc de notas
 *   · buscar la URL, la anon key y la service_role key en tres pantallas
 *   · generar el ENCRYPTION_KEY a mano con node -e
 *   · PEGAR 39 ARCHIVOS SQL, UNO POR UNO, EN EL SQL EDITOR   ← el peor
 *   · crear el .env.local a mano copiando del ejemplo
 *   · (y el que el tutorial ni hace: configurar el Site URL, que es la causa
 *      real del mail de confirmación que apunta a localhost:3000)
 *
 * Es idempotente: si lo corrés dos veces, no duplica nada ni rota tu
 * ENCRYPTION_KEY (rotarla dejaría huérfanos los tokens ya guardados).
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import {
  ROOT, CRM_DIR, C, ok, fail, warn, info, encabezado, titulo, progreso, morir, salir,
  leerEnv, escribirEnv, leerEstado, guardarEstado, preguntar, elegir, confirmar,
  rutaCredenciales,
} from "./lib/ui.mjs";
import { SupabaseAdmin, generarDbPass } from "./lib/supabase.mjs";

const UPSTREAM = "https://github.com/ArnasDon/wacrm.git";
const CREDS = rutaCredenciales();
const ENV_CRM = resolve(CRM_DIR, ".env.local");

const creds = leerEnv(CREDS);
if (!creds.SUPABASE_ACCESS_TOKEN) {
  morir("Falta el SUPABASE_ACCESS_TOKEN.", "Corré primero:  npm run creds");
}

const estado = leerEstado();
encabezado("Paso 1 — Supabase", "proyecto, llaves, migraciones y auth");

// ── 1. el código del CRM ────────────────────────────────────────────────────
titulo("1. Código del CRM");

if (!existsSync(CRM_DIR)) {
  const origen = creds.CRM_REPO_URL || UPSTREAM;
  info(`Clonando ${origen} …`);
  try {
    execFileSync("git", ["clone", "--depth", "1", origen, CRM_DIR], { stdio: "pipe" });
    ok("Clonado en ./crm");
  } catch (e) {
    morir(
      `No pude clonar el repo: ${String(e.stderr || e.message).slice(0, 300)}`,
      "¿Tenés git instalado? Probá:  git --version",
    );
  }
} else {
  ok("./crm ya existe", "no lo toco (si querés actualizarlo: cd crm && git pull)");
}

const DIR_MIGRACIONES = resolve(CRM_DIR, "supabase", "migrations");
if (!existsSync(DIR_MIGRACIONES)) {
  morir(
    "El clon no tiene supabase/migrations.",
    "¿Clonaste el repo correcto? Borrá ./crm y volvé a correr el paso 1.",
  );
}

const migraciones = readdirSync(DIR_MIGRACIONES)
  .filter((f) => f.endsWith(".sql"))
  .sort(); // 001…039: el orden alfabético ES el orden correcto
ok(`${migraciones.length} migraciones encontradas`, `${migraciones[0]} … ${migraciones.at(-1)}`);

// ── 2. la cuenta ────────────────────────────────────────────────────────────
titulo("2. Cuenta de Supabase");

const supa = new SupabaseAdmin(creds.SUPABASE_ACCESS_TOKEN);
const orgs = await supa.organizaciones();
if (!orgs.ok) {
  morir(
    `El token de Supabase no funciona: ${orgs.error}`,
    "Generá uno nuevo en supabase.com/dashboard/account/tokens y actualizá credenciales.env",
  );
}
const listaOrgs = orgs.json || [];
ok(`Token válido`, `${listaOrgs.length} organización(es)`);

// ── 3. el proyecto ──────────────────────────────────────────────────────────
titulo("3. Proyecto");

let ref = creds.SUPABASE_PROJECT_REF || estado.projectRef || "";

if (ref) {
  const p = await supa.proyecto(ref);
  if (!p.ok) {
    morir(
      `No encuentro el proyecto "${ref}": ${p.error}`,
      "Revisá el SUPABASE_PROJECT_REF de credenciales.env, o dejalo vacío para crear uno nuevo.",
    );
  }
  ok(`Uso el proyecto existente "${p.json.name}"`, `${ref} · ${p.json.region} · ${p.json.status}`);
} else {
  const org =
    listaOrgs.length === 1
      ? listaOrgs[0]
      : (await elegir(
          "¿En qué organización lo creo?",
          listaOrgs.map((o) => ({ label: `${o.name} ${C.dim(`(${o.slug})`)}`, valor: o })),
        )).valor;

  const nombre = await preguntar("  Nombre del proyecto", { porDefecto: "crm-whatsapp" });
  const region = await preguntar("  Región", { porDefecto: "sa-east-1" });

  console.log("");
  info(`Creando "${nombre}" en ${region} (plan free)…`);
  const dbPass = generarDbPass();
  const creado = await supa.crearProyecto({
    nombre, dbPass, organizacion: org.slug, region, plan: "free",
  });
  if (!creado.ok) {
    morir(
      `No pude crear el proyecto: ${creado.error}`,
      "Si ya tenés 2 proyectos free, Supabase no deja crear más: pausá uno o pegá el ref de uno existente en credenciales.env.",
    );
  }
  ref = creado.json.ref || creado.json.id;
  ok(`Proyecto creado`, ref);
  guardarEstado({ projectRef: ref, dbPassGuardada: true });

  // La contraseña de la base no se puede volver a ver: la dejo en credenciales.env.
  escribirEnvCreds({ ...creds, SUPABASE_PROJECT_REF: ref, SUPABASE_DB_PASSWORD: dbPass });
  info("Guardé el ref y la contraseña de la base en credenciales.env");

  process.stdout.write(`  ${C.dim("Esperando a que la base arranque")}`);
  const listo = await supa.esperarProyecto(ref, {
    onTick: (est, seg) => process.stdout.write(C.dim(` ${est}(${seg}s)`)),
  });
  console.log("");
  if (!listo.ok) {
    morir(
      `La base no llegó a estar lista (último estado: ${listo.estado}).`,
      `Mirá https://supabase.com/dashboard/project/${ref} y volvé a correr el paso 1 cuando esté verde.`,
    );
  }
  ok("Base arriba", "ACTIVE_HEALTHY");
}
guardarEstado({ projectRef: ref });

// ── 4. las llaves ───────────────────────────────────────────────────────────
titulo("4. Llaves de la API");

const llaves = await supa.llaves(ref);
if (!llaves.ok) morir(`No pude leer las llaves: ${llaves.error}`);
ok("URL, anon key y service_role obtenidas", `formato: ${llaves.tipo}`);

// ── 5. las migraciones ──────────────────────────────────────────────────────
titulo("5. Migraciones");
info("Esto es lo que el tutorial hace copiando y pegando 39 veces a mano.");

const prep = await supa.prepararTablaMigraciones(ref);
if (!prep.ok) {
  morir(
    `No pude preparar la tabla de migraciones: ${prep.error}`,
    "Si el proyecto se acaba de crear, esperá un minuto y volvé a correr el paso 1.",
  );
}

const yaAplicadas = await supa.migracionesAplicadas(ref);
if (yaAplicadas.size) info(`${yaAplicadas.size} ya estaban aplicadas — las salteo`);

let aplicadas = 0, salteadas = 0;
const fallidas = [];

for (const [i, archivo] of migraciones.entries()) {
  const version = archivo.split("_")[0];
  const nombre = archivo.replace(/^\d+_/, "").replace(/\.sql$/, "");

  if (yaAplicadas.has(version)) {
    salteadas++;
    progreso(i + 1, migraciones.length, `${archivo} (ya estaba)`);
    continue;
  }

  progreso(i + 1, migraciones.length, archivo);
  const sql = readFileSync(resolve(DIR_MIGRACIONES, archivo), "utf8");
  const r = await supa.sql(ref, sql);

  if (!r.ok) {
    fallidas.push({ archivo, error: r.error });
    break; // si una falla, las siguientes asumen su esquema: no tiene sentido seguir
  }
  await supa.marcarMigracion(ref, version, nombre);
  aplicadas++;
}
progreso(migraciones.length, migraciones.length, "");

if (fallidas.length) {
  const f = fallidas[0];
  console.log("");
  fail(`Falló ${f.archivo}`, f.error);
  console.log(
    C.dim(
      `\n  Las ${aplicadas} anteriores quedaron aplicadas y registradas: cuando arregles esto,\n` +
        `  volvé a correr ${C.bold("npm run paso1")} y sigue desde donde quedó.\n` +
        `  Si no entendés el error, pegáselo a Claude Code — tiene el SQL a mano en\n` +
        `  ./crm/supabase/migrations/${f.archivo}\n`,
    ),
  );
  salir(1);
}
ok(`${aplicadas} aplicadas · ${salteadas} ya estaban`, `${migraciones.length} en total`);

// ── 6. verificación del esquema ─────────────────────────────────────────────
titulo("6. Verificación del esquema");

const VERIFY = resolve(CRM_DIR, "supabase", "ci", "verify-schema.sql");
if (existsSync(VERIFY)) {
  const r = await supa.sql(ref, readFileSync(VERIFY, "utf8"));
  if (r.ok) ok("El esquema pasa la verificación del propio proyecto");
  else fail(`La verificación falló: ${r.error}`, "alguna migración corrió a medias");
} else {
  warn("El repo no trae supabase/ci/verify-schema.sql", "salteo la verificación");
}

const tablas = await supa.sql(
  ref,
  "select count(*)::int as n from information_schema.tables where table_schema='public';",
);
if (tablas.ok) {
  const n = (Array.isArray(tablas.json) ? tablas.json[0] : tablas.json?.result?.[0])?.n;
  if (n) ok(`${n} tablas en el esquema public`);
}

// ── 7. auth ─────────────────────────────────────────────────────────────────
titulo("7. Auth (el arreglo del mail que apunta a localhost)");

const publicUrl = (creds.PUBLIC_URL || "").replace(/\/+$/, "");

// Mientras estemos probando, la confirmación por mail va apagada: entrar al
// CRM no puede depender de que llegue un correo (el SMTP compartido de
// Supabase tiene un límite bajísimo). Se enciende recién con un dominio de
// verdad.
//
// "Probando" no es solo localhost: una dirección de túnel es igual de
// provisoria — cambia cada vez que se reabre y no sobrevive a cerrar la
// ventana. Tratarla como producción le pediría confirmar el mail justo en el
// momento en que está probando.
const ES_TUNEL = /\.(trycloudflare\.com|loca\.lt|ngrok\.io|ngrok-free\.app|serveo\.net)$/i;
const esTunel = publicUrl && ES_TUNEL.test(new URL(publicUrl).hostname);
const probando = !publicUrl || esTunel;
const siteUrl = publicUrl || "http://localhost:3000";

const rAuth = await supa.configurarAuth(ref, { siteUrl, autoconfirmar: probando });
if (!rAuth.ok) {
  warn(`No pude configurar Auth: ${rAuth.error}`, "se hace a mano en Authentication → URL Configuration");
} else if (probando) {
  ok(`Site URL = ${siteUrl}`, esTunel ? "túnel de pruebas" : "modo local");
  ok("Confirmación por mail DESACTIVADA", "para probar sin esperar correos");
  info("Con un dominio propio (no un túnel) se reactiva sola.");
} else {
  ok(`Site URL = ${siteUrl}`);
  ok("Confirmación por mail activada", "como corresponde en producción");
  info("Los mails de confirmación y de reset ahora apuntan a tu dominio,");
  info("no a localhost:3000. Ese 'bug' del tutorial era esto.");
}

// ── 8. .env.local del CRM ───────────────────────────────────────────────────
titulo("8. Archivo .env.local del CRM");

const envPrevio = leerEnv(ENV_CRM);

// ⚠️ Si ya había una ENCRYPTION_KEY, se respeta. Rotarla deja huérfanos los
// tokens de WhatsApp ya encriptados y hay que reconectar todo a mano.
const encryptionKey = envPrevio.ENCRYPTION_KEY || hex(32);
if (envPrevio.ENCRYPTION_KEY) ok("ENCRYPTION_KEY conservada", "(rotarla te obligaría a reconectar WhatsApp)");
else ok("ENCRYPTION_KEY generada", "64 hex = AES-256-GCM");

const cronSecret = envPrevio.AUTOMATION_CRON_SECRET || hex(32);
const locale = detectarLocale();

escribirEnv(
  ENV_CRM,
  [
    { titulo: "SUPABASE", vars: {
      NEXT_PUBLIC_SUPABASE_URL: llaves.url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: llaves.anon,
      SUPABASE_SERVICE_ROLE_KEY: llaves.serviceRole,
    }},
    { titulo: "SECRETOS DE LA APP", vars: {
      ENCRYPTION_KEY: encryptionKey,
      AUTOMATION_CRON_SECRET: cronSecret,
    }},
    { titulo: "META", vars: {
      META_APP_SECRET: creds.META_APP_SECRET || "",
      META_APP_ID: creds.META_APP_ID || "",
    }},
    { titulo: "SITIO", vars: {
      NEXT_PUBLIC_SITE_URL: publicUrl || "http://localhost:3000",
      NEXT_PUBLIC_APP_LOCALE: locale,
    }},
  ],
  "Generado por el instalador de IABYIA. NO subir a GitHub.\n" +
    "Si cambiás una variable NEXT_PUBLIC_*, hay que reconstruir la app\n" +
    "(se inlinean en el bundle del navegador en tiempo de build).",
);
ok("crm/.env.local escrito", `locale: ${locale}`);

// ── cierre ──────────────────────────────────────────────────────────────────
console.log(`\n${C.green(C.bold("✓ Supabase listo."))}`);
console.log(C.dim(`  Proyecto: https://supabase.com/dashboard/project/${ref}`));
console.log("");
console.log(`  ${C.bold("Ahora:")}`);
if (!publicUrl) {
  console.log(`   1. Levantá el CRM:      ${C.bold("npm run levantar")}`);
  console.log(`   2. Publicalo (dominio o túnel) → ${C.dim("docs/03-deploy.md")}`);
  console.log(`   3. Poné esa URL en ${C.bold("PUBLIC_URL")} de credenciales.env`);
  console.log(`   4. ${C.bold("npm run paso1")} otra vez ${C.dim("(para el Site URL)")} y después ${C.bold("npm run paso2")}`);
} else {
  console.log(`   1. Asegurate de que ${publicUrl} esté respondiendo`);
  console.log(`   2. ${C.bold("npm run paso2")} ${C.dim("(conecta WhatsApp)")}`);
}
console.log("");

// ── helpers ─────────────────────────────────────────────────────────────────
function hex(bytes) {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/** Si el CRM trae traducción al español, la usamos. Si no, inglés. */
function detectarLocale() {
  const dir = resolve(CRM_DIR, "messages");
  if (!existsSync(dir)) return "en";
  const disponibles = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
  return disponibles.includes("es") ? "es" : disponibles[0] || "en";
}

function escribirEnvCreds(valores) {
  escribirEnv(
    CREDS,
    [
      { titulo: "SUPABASE", vars: {
        SUPABASE_ACCESS_TOKEN: valores.SUPABASE_ACCESS_TOKEN || "",
        SUPABASE_PROJECT_REF: valores.SUPABASE_PROJECT_REF || "",
        SUPABASE_DB_PASSWORD: valores.SUPABASE_DB_PASSWORD || "",
      }},
      { titulo: "META / WHATSAPP", vars: {
        META_APP_ID: valores.META_APP_ID || "",
        META_APP_SECRET: valores.META_APP_SECRET || "",
        META_ACCESS_TOKEN: valores.META_ACCESS_TOKEN || "",
        META_WABA_ID: valores.META_WABA_ID || "",
      }},
      { titulo: "DOMINIO", vars: {
        PUBLIC_URL: valores.PUBLIC_URL || "",
        VERIFY_TOKEN: valores.VERIFY_TOKEN || "",
      }},
    ],
    "CREDENCIALES — generado por el instalador.\nNO subir a GitHub. NO mostrar si grabás pantalla.",
  );
}
