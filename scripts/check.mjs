#!/usr/bin/env node
/**
 * npm run check — diagnóstico completo, en una pantalla.
 *
 * No escribe nada: solo lee y te dice qué está bien y qué falta.
 * Corrélo cuando algo no anda, antes de deployar, y después de cualquier
 * cambio en Meta. Un token vencido o el campo `messages` sin suscribir se
 * descubren acá en cinco segundos.
 *
 * Las consultas contra la Graph API están validadas contra la API real.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  ROOT, CRM_DIR, C, ok, fail, warn, info, encabezado, titulo,
  leerEnv, leerEstado, enmascarar, problemas, pedir, rutaCredenciales,
} from "./lib/ui.mjs";
import { SupabaseAdmin } from "./lib/supabase.mjs";
import { Meta, PERMISOS_NECESARIOS, errorDe } from "./lib/meta.mjs";

const creds = leerEnv(rutaCredenciales());
const envCrm = leerEnv(resolve(CRM_DIR, ".env.local"));
const estado = leerEstado();

const publicUrl = (creds.PUBLIC_URL || "").replace(/\/+$/, "");

encabezado("Diagnóstico del CRM de WhatsApp");

// ── 1. archivos ─────────────────────────────────────────────────────────────
titulo("1. Archivos");

if (existsSync(CRM_DIR)) ok("./crm clonado");
else fail("./crm no existe", "corré: npm run paso1");

if (existsSync(resolve(CRM_DIR, ".env.local"))) ok("crm/.env.local existe");
else fail("crm/.env.local no existe", "corré: npm run paso1");

for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "ENCRYPTION_KEY", "META_APP_SECRET"]) {
  if (envCrm[k]) ok(k, k.includes("KEY") || k.includes("SECRET") ? enmascarar(envCrm[k]) : envCrm[k]);
  else fail(`${k} vacía en crm/.env.local`, "corré: npm run paso1");
}
if (envCrm.ENCRYPTION_KEY && !/^[a-f0-9]{64}$/i.test(envCrm.ENCRYPTION_KEY)) {
  fail("ENCRYPTION_KEY no son 64 caracteres hexadecimales", "tiene que ser exactamente 32 bytes en hex");
}

// ── 2. Supabase ─────────────────────────────────────────────────────────────
titulo("2. Supabase");

const ref = creds.SUPABASE_PROJECT_REF || estado.projectRef;
if (!creds.SUPABASE_ACCESS_TOKEN || !ref) {
  warn("Sin token o sin project ref — salteo Supabase", "corré: npm run paso1");
} else {
  const supa = new SupabaseAdmin(creds.SUPABASE_ACCESS_TOKEN);

  const p = await supa.proyecto(ref);
  if (!p.ok) {
    fail(`No puedo leer el proyecto ${ref}: ${p.error}`);
  } else {
    const estadoProy = p.json.status;
    if (estadoProy === "ACTIVE_HEALTHY") ok(`Proyecto "${p.json.name}" sano`, `${ref} · ${p.json.region}`);
    else if (estadoProy === "INACTIVE") {
      fail(
        `El proyecto está PAUSADO`,
        "Supabase pausa los proyectos free por inactividad. Despertalo desde el dashboard.",
      );
    } else warn(`Estado del proyecto: ${estadoProy}`);

    const tablas = await supa.sql(
      ref,
      "select count(*)::int as n from information_schema.tables where table_schema='public';",
    );
    if (tablas.ok) {
      const n = (Array.isArray(tablas.json) ? tablas.json[0] : tablas.json?.result?.[0])?.n ?? 0;
      if (n >= 20) ok(`${n} tablas en public`);
      else fail(`Solo ${n} tablas en public`, "las migraciones no corrieron completas: npm run paso1");
    } else {
      fail(`No pude consultar la base: ${tablas.error}`);
    }

    const mig = await supa.migracionesAplicadas(ref);
    if (mig.size) ok(`${mig.size} migraciones registradas`, `hasta la ${[...mig].sort().at(-1)}`);
    else warn("No hay migraciones registradas", "puede que las hayas aplicado a mano");

    const auth = await supa.authConfig(ref);
    if (auth.ok) {
      const siteUrl = auth.json?.site_url || "";
      if (!siteUrl || /localhost/.test(siteUrl)) {
        fail(
          `Site URL = "${siteUrl || "(vacío)"}"`,
          "Por esto los mails de confirmación apuntan a localhost:3000. " +
            "Poné PUBLIC_URL en credenciales.env y corré npm run paso1.",
        );
      } else {
        ok(`Site URL = ${siteUrl}`);
        if (publicUrl && siteUrl.replace(/\/+$/, "") !== publicUrl) {
          warn(`No coincide con tu PUBLIC_URL (${publicUrl})`, "corré npm run paso1 para alinearlos");
        }
      }
    }
  }
}

// ── 3. Meta ─────────────────────────────────────────────────────────────────
titulo("3. Meta — token");

const meta = new Meta({
  appId: creds.META_APP_ID,
  appSecret: creds.META_APP_SECRET,
  token: creds.META_ACCESS_TOKEN,
});

let hayMeta = !!(creds.META_ACCESS_TOKEN && creds.META_APP_ID && creds.META_APP_SECRET);
if (!hayMeta) {
  warn("Faltan credenciales de Meta — salteo el resto", "corré: npm run creds");
} else {
  const t = await meta.inspeccionarToken();
  if (!t.ok) {
    fail(`No pude inspeccionar el token: ${t.error}`, "¿App ID y App Secret son de la misma app que emitió el token?");
    hayMeta = false;
  } else if (!t.valido) {
    fail("El token NO es válido", "generá uno nuevo desde el System User");
    hayMeta = false;
  } else {
    ok(`Token válido · tipo ${t.tipo}`);
    if (t.venceEn === null) ok("No vence", "(System User)");
    else if (t.venceEn <= 2) fail(`Vence en ${t.venceEn} día(s) — ${t.venceEl?.toLocaleString()}`, "es el token temporal del Quickstart: generá uno de System User");
    else warn(`Vence en ${t.venceEn} días`, "para producción, uno de System User que no vence");

    for (const p of PERMISOS_NECESARIOS) {
      if (t.permisos.includes(p)) ok(`Permiso ${p}`);
      else fail(`Falta ${p}`, "regenerá el token marcando ese permiso");
    }
  }
}

// ── 4. WABA y número ────────────────────────────────────────────────────────
const wabaId = creds.META_WABA_ID || estado.wabaId;

if (hayMeta && wabaId) {
  titulo("4. Cuenta y número");

  const w = await meta.waba(wabaId);
  if (!w.ok) {
    fail(`No puedo leer la WABA ${wabaId}: ${errorDe(w)}`);
  } else {
    ok(`WABA "${w.json.name || "(sin nombre)"}"`, wabaId);
    const rev = w.json.account_review_status;
    if (rev && rev !== "APPROVED") warn(`Revisión: ${rev}`, "limita los tiers de envío");
  }

  const nums = await meta.numeros(wabaId);
  if (!nums.ok) {
    fail(`No puedo listar los números: ${errorDe(nums)}`);
  } else {
    const lista = nums.json?.data || [];
    const mio = lista.find((n) => n.id === estado.phoneId) || lista[0];
    if (!mio) fail("La WABA no tiene números");
    else {
      ok(`${mio.display_phone_number} — "${mio.verified_name}"`, `id ${mio.id}`);
      if (mio.quality_rating && mio.quality_rating !== "GREEN") {
        warn(`Calidad: ${mio.quality_rating}`, "amarillo o rojo = te están reportando; en rojo tenés 7 días");
      }
      if (mio.status && mio.status !== "CONNECTED") {
        warn(`Estado: ${mio.status}`, "puede que falte registrarlo: npm run paso2");
      }
    }
  }

  titulo("5. Suscripciones");

  const subs = await meta.appsSuscritas(wabaId);
  if (!subs.ok) {
    fail(`No puedo leer subscribed_apps: ${errorDe(subs)}`);
  } else {
    const apps = subs.json?.data || [];
    if (!apps.length) {
      fail("Ninguna app suscrita a la WABA", "sin esto NO llegan los mensajes entrantes: npm run paso2");
    } else {
      ok(`Suscrita: ${apps.map((a) => a.whatsapp_business_api_data?.name || a.whatsapp_business_api_data?.id).join(", ")}`);
      if (!apps.some((a) => String(a.whatsapp_business_api_data?.id) === String(creds.META_APP_ID))) {
        fail("Tu app NO figura entre las suscritas", "los eventos se los está llevando otra app");
      }
    }
  }

  const wh = await meta.leerWebhook();
  if (!wh.ok) {
    fail(`No pude leer el webhook: ${wh.error}`);
  } else if (!wh.configurado) {
    fail("La app no tiene webhook de whatsapp_business_account", "corré: npm run paso2");
  } else {
    ok(`Callback: ${wh.callbackUrl}`, wh.activo ? "activo" : "INACTIVO");
    if (!wh.activo) fail("El webhook figura INACTIVO", "volvé a correr npm run paso2");
    if (wh.campos.includes("messages")) ok("Campo 'messages' suscrito");
    else fail("Falta el campo 'messages'", "sin esto NO llega ni un mensaje entrante — es el error #1");
    const otros = wh.campos.filter((f) => f !== "messages");
    if (otros.length) info(`otros campos: ${otros.join(", ")}`);
    if (publicUrl && wh.callbackUrl && !wh.callbackUrl.startsWith(publicUrl)) {
      warn("El callback en Meta apunta a otra URL que tu PUBLIC_URL", `Meta: ${wh.callbackUrl}`);
    }
  }
} else if (hayMeta) {
  titulo("4. Cuenta y número");
  warn("Sin WABA ID — salteo", "corré: npm run paso2");
}

// ── 6. la app en vivo ───────────────────────────────────────────────────────
titulo("6. La app respondiendo");

if (!publicUrl) {
  warn("PUBLIC_URL vacía — no puedo probar la app", "docs/03-deploy.md");
} else {
  try {
    const res = await pedir(publicUrl, { redirect: "manual" }, 15000);
    if (res.status < 500) ok(`${publicUrl} responde`, `HTTP ${res.status}`);
    else fail(`${publicUrl} devuelve ${res.status}`, "mirá los logs del deploy");
  } catch (e) {
    fail(`No pude alcanzar ${publicUrl}: ${e.message}`, "¿está levantada? ¿el túnel sigue abierto?");
  }

  if (creds.VERIFY_TOKEN) {
    const desafio = String(Math.floor(Math.random() * 1e9));
    const u = new URL(`${publicUrl}/api/whatsapp/webhook`);
    u.searchParams.set("hub.mode", "subscribe");
    u.searchParams.set("hub.verify_token", creds.VERIFY_TOKEN);
    u.searchParams.set("hub.challenge", desafio);
    try {
      const res = await pedir(u, {}, 15000);
      const cuerpo = (await res.text()).trim();
      if (res.ok && cuerpo === desafio) ok("El webhook devuelve el desafío", "el apretón de manos funciona");
      else if (res.status === 403) fail("El webhook devuelve 403", `el verify token guardado en el CRM no es ${creds.VERIFY_TOKEN}`);
      else fail(`El webhook devolvió ${res.status}`, "revisá Settings → WhatsApp en el CRM");
    } catch (e) {
      fail(`No pude probar el webhook: ${e.message}`);
    }
  }
}

// ── resumen ─────────────────────────────────────────────────────────────────
console.log("");
if (problemas.length === 0) {
  console.log(`${C.green(C.bold("✓ Todo en orden."))}`);
  console.log(C.dim("  Mandate un mensaje al número y miralo caer en el inbox."));
  console.log(C.dim("  Antes de vender esto: leé docs/04-costos.md (Meta empieza a cobrar el 1/10/2026)."));
  console.log("");
} else {
  console.log(`${C.red(C.bold(`✗ ${problemas.length} problema(s):`))}`);
  problemas.forEach((p) => console.log(`  · ${p}`));
  console.log(
    C.dim(
      "\n  Si algo no te cierra, pegale esta salida entera a Claude Code:\n" +
        "  tiene el repo, los docs y las credenciales a mano para arreglarlo.\n" +
        "  Errores raros y sus causas: docs/05-gotchas.md\n",
    ),
  );
  process.exitCode = 1;
}
