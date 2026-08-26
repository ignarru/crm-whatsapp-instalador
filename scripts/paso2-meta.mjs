#!/usr/bin/env node
/**
 * npm run paso2 — conecta WhatsApp.
 *
 * Reemplaza estos pasos del tutorial manual:
 *   · buscar el Phone Number ID y el WABA ID en el panel
 *   · inventar un verify token tipo "123456"
 *   · copiar la callback URL del CRM y pegarla en Meta
 *   · darle "Verificar y guardar" y rezar
 *   · tildar a mano el campo `messages` (el error #1: sin eso no entra nada)
 *   · suscribir la app a la WABA
 *
 * Lo que NO automatiza (y no puede): pegar los cuatro valores en
 * Settings → WhatsApp del CRM. Ese formulario encripta el token con tu
 * ENCRYPTION_KEY antes de guardarlo; replicar esa encriptación desde afuera
 * sería acoplarme a un detalle interno que puede cambiar en el próximo commit
 * del upstream. Son 30 segundos y una sola pantalla.
 */

import { resolve } from "node:path";
import {
  ROOT, CRM_DIR, C, ok, fail, warn, info, encabezado, titulo, morir, salir,
  leerEnv, leerEstado, guardarEstado, preguntar, elegir, confirmar, enmascarar, pedir,
  rutaCredenciales,
} from "./lib/ui.mjs";
import { Meta, CAMPOS_WEBHOOK, PERMISOS_NECESARIOS, errorDe } from "./lib/meta.mjs";
import { SupabaseAdmin } from "./lib/supabase.mjs";

const CREDS = rutaCredenciales();
const creds = leerEnv(CREDS);
const estado = leerEstado();

const publicUrl = (creds.PUBLIC_URL || "").replace(/\/+$/, "");
const verifyToken = creds.VERIFY_TOKEN;

if (!creds.META_ACCESS_TOKEN || !creds.META_APP_ID || !creds.META_APP_SECRET) {
  morir("Faltan credenciales de Meta.", "Corré primero:  npm run creds");
}
if (!publicUrl) {
  morir(
    "PUBLIC_URL está vacía.",
    "Meta necesita una URL pública que responda AHORA para verificar el webhook.\n" +
      "  Deployá el CRM o abrí un túnel (docs/03-deploy.md), poné la URL en\n" +
      "  credenciales.env y volvé a correr este paso.",
  );
}
if (!verifyToken) morir("Falta el VERIFY_TOKEN.", "Corré:  npm run creds");

const meta = new Meta({
  appId: creds.META_APP_ID,
  appSecret: creds.META_APP_SECRET,
  token: creds.META_ACCESS_TOKEN,
});

encabezado("Paso 2 — WhatsApp", `Graph ${meta.version}`);

// ── 1. el token ─────────────────────────────────────────────────────────────
titulo("1. Token de acceso");

const t = await meta.inspeccionarToken();
if (!t.ok) {
  morir(
    `No pude inspeccionar el token: ${t.error}`,
    "Revisá que META_APP_ID y META_APP_SECRET sean de la MISMA app que emitió el token.",
  );
}
if (!t.valido) morir("El token NO es válido.", "Generá uno nuevo desde el System User.");

ok(`Token válido`, `tipo ${t.tipo}`);
if (t.venceEn === null) {
  ok("No vence", "(System User — es el que querés)");
} else if (t.venceEn <= 2) {
  fail(
    `El token vence en ${t.venceEn} día(s)`,
    "Estás usando el token temporal del Quickstart, que dura 24 h. Generá uno de System User: docs/01-meta.md",
  );
} else {
  warn(`Vence en ${t.venceEn} días`, "para producción usá un token de System User, que no vence");
}
for (const p of PERMISOS_NECESARIOS) {
  if (t.permisos.includes(p)) ok(`Permiso ${p}`);
  else fail(`Falta el permiso ${p}`, "regenerá el token del System User marcando ese permiso");
}

// ── 2. la WABA ──────────────────────────────────────────────────────────────
titulo("2. Cuenta de WhatsApp Business");

let wabaId = creds.META_WABA_ID || estado.wabaId || "";

if (!wabaId) {
  info("Buscándola sola…");
  const d = await meta.descubrirWabas();
  if (d.ok && d.wabas.length === 1) {
    wabaId = d.wabas[0].id;
    ok(`Encontrada: ${d.wabas[0].nombre}`, wabaId);
  } else if (d.ok && d.wabas.length > 1) {
    const el = await elegir(
      "Tenés más de una. ¿Cuál uso?",
      d.wabas.map((w) => ({ label: `${w.nombre} ${C.dim(`(${w.id} · ${w.negocio})`)}`, valor: w })),
    );
    wabaId = el.valor.id;
  } else {
    warn("No pude descubrirla sola", "tu token no tiene business_management — no es un problema");
    info("Está en: developers.facebook.com → tu app → WhatsApp → Configuración de la API");
    wabaId = await preguntar("  Pegá el WhatsApp Business Account ID");
    if (!wabaId) morir("Sin WABA ID no puedo seguir.");
  }
}

const w = await meta.waba(wabaId);
if (!w.ok) {
  morir(
    `No puedo leer la WABA ${wabaId}: ${errorDe(w)}`,
    "¿Es el ID correcto? ¿El System User tiene asignada esa cuenta?",
  );
}
ok(`WABA accesible: ${w.json.name || "(sin nombre)"}`, wabaId);
if (w.json.account_review_status && w.json.account_review_status !== "APPROVED") {
  warn(`Revisión de la cuenta: ${w.json.account_review_status}`, "no bloquea las pruebas, pero limita cuánto podés enviar");
}
guardarEstado({ wabaId });

// ── 3. el número ────────────────────────────────────────────────────────────
titulo("3. Número de teléfono");

const nums = await meta.numeros(wabaId);
if (!nums.ok) morir(`No puedo listar los números: ${errorDe(nums)}`);

const lista = nums.json?.data || [];
if (!lista.length) {
  morir(
    "La WABA no tiene ningún número.",
    "Agregá uno desde WhatsApp → Configuración de la API en el panel de Meta.",
  );
}

let numero;
if (lista.length === 1) {
  numero = lista[0];
  ok(`${numero.display_phone_number} — "${numero.verified_name}"`, `id ${numero.id}`);
} else {
  const el = await elegir(
    "¿Cuál número conecto?",
    lista.map((n) => ({
      label: `${n.display_phone_number} ${C.dim(`— ${n.verified_name} (${n.id})`)}`,
      valor: n,
    })),
  );
  numero = el.valor;
}
const phoneId = numero.id;
guardarEstado({ phoneId, displayNumber: numero.display_phone_number });

if (numero.quality_rating) info(`Calidad: ${numero.quality_rating}`);
if (numero.status && numero.status !== "CONNECTED") {
  warn(`Estado del número: ${numero.status}`, "puede que haga falta registrarlo (te lo ofrezco al final)");
}

// ── 4. los cuatro valores para el CRM ───────────────────────────────────────
titulo("4. Cargá esto en el CRM");

// El access token NO se imprime entero salvo que lo pidan: muchísima gente
// hace esta parte grabando la pantalla o compartiéndola, y este token no vence.
const mostrarToken = process.argv.includes("--mostrar-token");
const tokenEnPantalla = mostrarToken
  ? C.green(creds.META_ACCESS_TOKEN)
  : `${C.dim(enmascarar(creds.META_ACCESS_TOKEN))}  ${C.dim("← copialo de credenciales.env")}`;

console.log(`
  ${C.dim("Abrí")} ${C.bold(`${publicUrl}/settings/whatsapp`)} ${C.dim("y pegá:")}

    ${C.bold("Phone number ID")}  ${C.green(phoneId)}
    ${C.bold("WhatsApp Business ID")}  ${C.green(wabaId)}
    ${C.bold("Access token")}  ${tokenEnPantalla}
    ${C.bold("Verify token")}  ${C.green(verifyToken)}

  ${C.dim("Es el único paso que queda a mano: ese formulario encripta el token")}
  ${C.dim("con tu ENCRYPTION_KEY antes de guardarlo en la base.")}
${mostrarToken ? `  ${C.yellow("⚠ Token a la vista: no dejes esta pantalla en una grabación.")}\n` : `  ${C.dim("(Si necesitás verlo en pantalla: npm run paso2 -- --mostrar-token)")}\n`}`);

const listo = await confirmar("  ¿Ya lo guardaste en el CRM?", true);
if (!listo) {
  console.log(C.dim("\n  Dale, guardalo y volvé a correr:  npm run paso2\n"));
  salir(0);
}

// ── 5. el handshake, probado por mí antes que por Meta ──────────────────────
titulo("5. Prueba del webhook");
info("Hago yo el apretón de manos que va a hacer Meta. Si algo está mal,");
info("prefiero decírtelo en castellano antes que devolverte su error genérico.");

const desafio = String(Math.floor(Math.random() * 1e9));
const urlWebhook = `${publicUrl}/api/whatsapp/webhook`;
const prueba = new URL(urlWebhook);
prueba.searchParams.set("hub.mode", "subscribe");
prueba.searchParams.set("hub.verify_token", verifyToken);
prueba.searchParams.set("hub.challenge", desafio);

let handshakeOk = false;
try {
  const res = await pedir(prueba, {}, 20000);
  const cuerpo = (await res.text()).trim();

  if (res.ok && cuerpo === desafio) {
    handshakeOk = true;
    ok("El webhook responde y devuelve el desafío", "está listo para Meta");
  } else if (res.status === 403) {
    fail(
      "El webhook contestó 403: el verify token no coincide",
      `El CRM tiene guardado otro. Pegá exactamente: ${verifyToken}`,
    );
  } else if (res.status === 404) {
    fail(
      "404 en /api/whatsapp/webhook",
      "¿La app está corriendo en esa URL? ¿PUBLIC_URL apunta al CRM y no a otra cosa?",
    );
  } else {
    fail(
      `Respondió ${res.status} y devolvió "${cuerpo.slice(0, 80)}"`,
      "esperaba el desafío tal cual. Revisá que Settings → WhatsApp esté guardado.",
    );
  }
} catch (e) {
  fail(
    `No pude alcanzar ${urlWebhook}: ${e.message}`,
    "¿Está levantada la app? ¿El dominio resuelve? ¿El túnel sigue abierto?",
  );
}

if (!handshakeOk) {
  // Un 403 puede ser "lo cargaste distinto" o "lo dejaste vacío", y son dos
  // problemas con arreglos distintos. Miramos la base del CRM para decir cuál
  // es. verify_token está en texto plano (solo el access token va encriptado),
  // así que alcanza con leer — nunca escribimos esa tabla desde acá.
  await diagnosticarConfigDelCrm();

  console.log(
    C.dim(
      "\n  Freno acá a propósito: si le pido a Meta que verifique ahora, va a fallar\n" +
        "  igual y con un mensaje mucho más críptico. Arreglá esto y volvé a correr\n" +
        `  ${C.bold("npm run paso2")}.\n`,
    ),
  );
  salir(1);
}

async function diagnosticarConfigDelCrm() {
  const ref = creds.SUPABASE_PROJECT_REF || estado.projectRef;
  if (!creds.SUPABASE_ACCESS_TOKEN || !ref) return;

  const supa = new SupabaseAdmin(creds.SUPABASE_ACCESS_TOKEN);
  const r = await supa.sql(
    ref,
    `select phone_number_id, waba_id, verify_token, status,
            (access_token is not null and access_token <> '') as tiene_token
     from whatsapp_config limit 1;`,
  );
  if (!r.ok) return;

  const fila = (Array.isArray(r.json) ? r.json : r.json?.result || [])[0];

  console.log("");
  if (!fila) {
    fail(
      "El CRM no tiene NADA guardado en Settings → WhatsApp",
      `Entrá a ${publicUrl}/settings/whatsapp y cargá los cuatro valores de arriba.`,
    );
    return;
  }

  info("Miré qué tiene guardado el CRM:");
  console.log(`      Phone number ID  ${fila.phone_number_id === phoneId ? C.green("coincide") : C.red(`dice ${fila.phone_number_id}`)}`);
  console.log(`      WABA ID          ${fila.waba_id === wabaId ? C.green("coincide") : C.red(`dice ${fila.waba_id || "(vacío)"}`)}`);
  console.log(`      Access token     ${fila.tiene_token ? C.green("cargado") : C.red("VACÍO")}`);

  if (!fila.verify_token) {
    console.log(`      Verify token     ${C.red("VACÍO")}`);
    console.log("");
    fail(
      "El campo 'Webhook Verify Token' del CRM está vacío",
      `Es el error más común: su texto gris de ejemplo parece un valor cargado.\n` +
        `       Pegá exactamente esto y guardá:  ${C.bold(verifyToken)}`,
    );
  } else if (fila.verify_token !== verifyToken) {
    console.log(`      Verify token     ${C.red("distinto")}`);
    console.log("");
    fail(
      "El verify token del CRM no es el mismo que el de credenciales.env",
      `Reemplazalo en el CRM por:  ${C.bold(verifyToken)}`,
    );
  } else {
    console.log(`      Verify token     ${C.green("coincide")}`);
    console.log("");
    warn(
      "Los datos están bien pero el webhook igual no contesta",
      "puede que la app no haya recargado. Reiniciá el CRM y volvé a intentar.",
    );
  }
}

// ── 6. registrar el webhook en Meta ─────────────────────────────────────────
titulo("6. Webhook en Meta");

// ⚠️ Una app de Meta tiene UN solo webhook para whatsapp_business_account.
// Si ya apunta a otro lado, esto se lo lleva puesto: los mensajes que hoy
// recibe ese sistema van a empezar a caer acá. Es un accidente carísimo y
// silencioso, así que se avisa y se pide confirmación explícita.
const previo = await meta.leerWebhook();
if (previo.ok && previo.configurado && previo.callbackUrl) {
  const mismoDestino = previo.callbackUrl.replace(/\/+$/, "") === urlWebhook.replace(/\/+$/, "");
  if (!mismoDestino) {
    console.log("");
    warn("Esta app YA tiene un webhook configurado, apuntando a otro lado:");
    console.log(`      ${C.bold(previo.callbackUrl)}`);
    console.log(`
  ${C.yellow("Una app de Meta admite UN solo webhook de WhatsApp.")} Si sigo, los mensajes
  que hoy le llegan a esa dirección ${C.bold("van a empezar a caer acá")} y ese sistema
  se queda sin recibir nada.

  ${C.dim("Si esa dirección es de algo que está en producción, cortá acá y usá una")}
  ${C.dim("app de Meta aparte para el CRM. Crear una lleva cinco minutos y no")}
  ${C.dim("toca lo que ya funciona. → docs/01-meta.md")}
`);
    // --reemplazar-webhook salta la pregunta, para cuando ya decidiste (o para
    // automatizar). Sigue mostrando la dirección anterior: que quede escrita
    // en algún lado es lo que te permite volver atrás.
    const forzado = process.argv.includes("--reemplazar-webhook");
    const seguir = forzado
      ? true
      : await confirmar(`  ¿Reemplazo el webhook y lo apunto a ${publicUrl}?`, false);
    if (forzado) info("(--reemplazar-webhook: sigo sin preguntar)");
    if (!seguir) {
      console.log(C.dim("\n  No toqué nada. El webhook sigue como estaba.\n"));
      salir(0);
    }
    console.log("");
    info(`Anotá la dirección anterior por si querés volver: ${previo.callbackUrl}`);
  }
}

const sub = await meta.configurarWebhook(urlWebhook, verifyToken, CAMPOS_WEBHOOK);
if (!sub.ok) {
  fail(`Meta rechazó el webhook: ${errorDe(sub)}`, "revisá que la app sea de tipo Business y tenga el producto WhatsApp agregado");
} else {
  ok("Callback URL registrada", urlWebhook);
  ok(`Campos suscritos`, CAMPOS_WEBHOOK.join(", "));
}

const wh = await meta.leerWebhook();
if (wh.ok && wh.configurado) {
  if (wh.campos.includes("messages")) ok("Campo 'messages' confirmado", "es el que hace que lleguen los mensajes");
  else fail("El campo 'messages' NO quedó suscrito", "sin eso no entra ni un mensaje: es el error #1 de todo el proceso");
  if (!wh.activo) warn("Meta lo marca como inactivo", "suele arreglarse volviendo a correr este paso");
}

// ── 7. suscribir la app a la WABA ───────────────────────────────────────────
titulo("7. Suscripción de la app a la cuenta");

const subs = await meta.appsSuscritas(wabaId);
const yaSuscrita = (subs.json?.data || []).some(
  (a) => String(a.whatsapp_business_api_data?.id) === String(creds.META_APP_ID),
);

if (yaSuscrita) {
  ok("La app ya estaba suscrita a la WABA");
} else {
  const r = await meta.suscribirAppAWaba(wabaId);
  if (r.ok && r.json?.success !== false) ok("App suscrita a la WABA");
  else fail(`No pude suscribir la app: ${errorDe(r)}`, "sin esto los eventos de la cuenta no llegan a tu webhook");
}

// ── 8. registro del número (opcional) ───────────────────────────────────────
titulo("8. Registro del número en la Cloud API");

if (numero.status === "CONNECTED") {
  ok("El número ya está registrado y conectado");
} else {
  console.log("");
  info("Registrar el número es lo que le dice a Meta que ESTA app lo reclama.");
  info("Necesita el PIN de 6 dígitos de la verificación en dos pasos — el que");
  info("ya tiene el número, no uno nuevo. Si no lo recordás, se resetea desde");
  info("el Business Manager: por API no se puede.");

  // El PIN se puede dejar guardado en credenciales.env (META_PIN) para no
  // tener que tipearlo cada vez que se rehace el paso 2 — que con un túnel,
  // cuya URL cambia, pasa seguido.
  const pinGuardado = (creds.META_PIN || "").trim();
  if (pinGuardado) info(`Uso el META_PIN de credenciales.env`);

  const hacerlo = pinGuardado ? true : await confirmar("  ¿Lo registro ahora?", false);
  if (hacerlo) {
    const pin = pinGuardado || (await preguntar("  PIN de 6 dígitos", { porDefecto: "" }));
    if (/^\d{6}$/.test(pin)) {
      const r = await meta.registrarNumero(phoneId, pin);
      if (r.ok && r.json?.success !== false) {
        ok("Número registrado");
        info(`Anotá el PIN: ${pin} — te lo van a pedir si migrás el número.`);
      } else {
        fail(`No pude registrarlo: ${errorDe(r)}`, "si dice que ya está registrado, está todo bien");
      }
    } else {
      warn("PIN inválido — salteo el registro", "tiene que ser exactamente 6 dígitos");
    }
  } else {
    info("Salteado. Si los mensajes no salen, volvé a este paso.");
  }
}

// ── cierre ──────────────────────────────────────────────────────────────────
console.log(`\n${C.green(C.bold("✓ WhatsApp conectado."))}`);
console.log(C.dim(`  Verificá todo de punta a punta:  ${C.bold("npm run check")}`));
console.log(C.dim(`  Después mandate un mensaje al ${numero.display_phone_number} y miralo caer en el inbox.`));
console.log("");
