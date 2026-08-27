#!/usr/bin/env node
/**
 * npm run vps — deja el CRM andando en un servidor, con dominio propio y HTTPS.
 *
 * Este script se corre DENTRO del servidor. Es a propósito: así no hay que
 * decirle a nadie "a qué VPS" ni configurar accesos por SSH — ya estás adentro.
 * Funciona igual en Oracle, Hetzner, DigitalOcean, Contabo o el que uses.
 *
 * Reemplaza al túnel: con dominio fijo, el webhook de Meta deja de romperse
 * cada vez que reabrís la ventana.
 *
 * Dos modos:
 *   · caddy  (por defecto) — el servidor está limpio. Caddy toma los puertos
 *            80 y 443 y saca el certificado HTTPS solo.
 *   · proxy  — el servidor YA tiene Traefik/nginx/otro con el 80 y el 443
 *            ocupados. Publica el CRM en un puerto local y te dice qué
 *            agregarle a tu proxy.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import {
  ROOT, CRM_DIR, C, ok, fail, warn, info, encabezado, titulo, morir, salir,
  leerEnv, escribirEnv, preguntar, confirmar, pedir, dormir, verificarNode,
  rutaCredenciales,
} from "./lib/ui.mjs";

verificarNode();

const CREDS = rutaCredenciales();
const DEPLOY = resolve(ROOT, "deploy");
const creds = leerEnv(CREDS);
const envCrm = leerEnv(resolve(CRM_DIR, ".env.local"));

const argv = process.argv.slice(2);
const valorDe = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const modo = valorDe("--modo", "caddy");
const puertoLocal = valorDe("--puerto", "3000");

encabezado("Deploy al servidor", modo === "proxy" ? "modo proxy" : "modo caddy (HTTPS automático)");

// ── 1. dónde estamos ────────────────────────────────────────────────────────
titulo("1. El servidor");

if (process.platform !== "linux") {
  warn(`Estás en ${process.platform}, no en Linux`, "este comando va corrido DENTRO del servidor");
  console.log(`
  ${C.dim("El camino es:")}
    1. Entrá a tu servidor:  ${C.bold("ssh usuario@la-ip-de-tu-servidor")}
    2. Instalá ahí Node, git y Docker
    3. Cloná este repo, corré ${C.bold("npm run creds")} y ${C.bold("npm run paso1")}
    4. Y ahí sí, ${C.bold("npm run vps")}
`);
  if (!(await confirmar("  ¿Seguir igual? (solo tiene sentido para ver qué haría)", false))) salir(0);
} else {
  ok("Linux", process.arch);
}

if (!existsSync(CRM_DIR)) morir("No existe ./crm.", "Corré primero:  npm run paso1");
if (!envCrm.NEXT_PUBLIC_SUPABASE_URL) morir("crm/.env.local no tiene la configuración de Supabase.", "Corré:  npm run paso1");
ok("El CRM está clonado y configurado");

// ── 2. docker ───────────────────────────────────────────────────────────────
titulo("2. Docker");

const hay = (cmd, args) => {
  try {
    execFileSync(cmd, args, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
};

if (!hay("docker", ["--version"])) {
  morir(
    "No encontré Docker.",
    "Instalalo con:  curl -fsSL https://get.docker.com | sh\n" +
      "  Después, para no tener que usar sudo:  sudo usermod -aG docker $USER\n" +
      "  Cerrá la sesión de SSH, volvé a entrar, y corré esto de nuevo.",
  );
}
ok("Docker instalado");

if (!hay("docker", ["compose", "version"])) {
  morir(
    "Tenés Docker pero no el plugin compose.",
    "En Debian/Ubuntu:  sudo apt-get install -y docker-compose-plugin",
  );
}
ok("docker compose disponible");

// ── 3. el dominio ───────────────────────────────────────────────────────────
titulo("3. Tu dominio");

let publicUrl = (creds.PUBLIC_URL || "").replace(/\/+$/, "");
if (!publicUrl || /trycloudflare|loca\.lt|ngrok|localhost/.test(publicUrl)) {
  if (publicUrl) info(`PUBLIC_URL apunta a algo temporal (${publicUrl})`);
  console.log("");
  info("Necesito el dominio donde va a vivir el CRM. Por ejemplo:");
  info("  https://crm.tuempresa.com");
  const r = await preguntar("  Dominio (con https://)", { porDefecto: "" });
  if (!r) morir("Sin dominio no puedo seguir.");
  publicUrl = r.replace(/\/+$/, "");
}

if (!publicUrl.startsWith("https://")) {
  morir("El dominio tiene que empezar con https://", "Meta no acepta http para el webhook.");
}

let host;
try {
  host = new URL(publicUrl).hostname;
} catch {
  morir(`"${publicUrl}" no parece una URL válida.`, "Tiene que ser tipo https://crm.tuempresa.com");
}
ok(`Dominio: ${host}`);

// ── 4. ¿el dominio apunta acá? ──────────────────────────────────────────────
titulo("4. El DNS");
info("Reviso que tu dominio apunte a ESTE servidor. Si no, Caddy no va a poder");
info("sacar el certificado y el deploy queda a medias.");

let ipServidor = "";
try {
  const r = await pedir("https://api.ipify.org", {}, 10000);
  ipServidor = (await r.text()).trim();
} catch {
  /* seguimos sin poder comparar */
}

let ipsDominio = [];
try {
  const dns = await import("node:dns/promises");
  ipsDominio = await dns.resolve4(host).catch(() => []);
  if (!ipsDominio.length) ipsDominio = await dns.resolve6(host).catch(() => []);
} catch {
  /* idem */
}

if (ipServidor) ok(`IP pública de este servidor: ${ipServidor}`);
if (!ipsDominio.length) {
  fail(
    `${host} no resuelve a ninguna IP`,
    "Creá un registro A en tu proveedor de DNS apuntando a la IP de arriba.\n" +
      "       Puede tardar unos minutos en propagarse.",
  );
} else if (ipServidor && ipsDominio.includes(ipServidor)) {
  ok(`${host} apunta acá`, ipsDominio.join(", "));
} else {
  warn(`${host} resuelve a ${ipsDominio.join(", ")}`, `y este servidor es ${ipServidor || "(no pude averiguarlo)"}`);
  info("Si usás Cloudflare con el proxy naranja activado, esto es esperable.");
  info("Si no, revisá el registro A antes de seguir: el certificado va a fallar.");
  if (!(await confirmar("  ¿Sigo igual?", false))) salir(0);
}

// ── 5. puertos ──────────────────────────────────────────────────────────────
titulo("5. Puertos");

const puertoOcupado = (p) => {
  try {
    return execFileSync(
      "sh",
      ["-c", `(ss -ltnp 2>/dev/null || netstat -ltnp 2>/dev/null) | grep -E ":${p}[[:space:]]" || true`],
      { encoding: "utf8" },
    ).trim();
  } catch {
    return "";
  }
};

let modoFinal = modo;
if (modo === "caddy" && process.platform === "linux") {
  const ocupados = ["80", "443"].map((p) => ({ p, quien: puertoOcupado(p) })).filter((x) => x.quien);
  if (ocupados.length) {
    console.log("");
    for (const o of ocupados) {
      warn(`El puerto ${o.p} ya está ocupado`, o.quien.split("\n")[0].trim().slice(0, 120));
    }
    console.log(`
  ${C.yellow("Este servidor ya tiene algo sirviendo web")} —Traefik, nginx, otro Caddy—.
  Si levanto Caddy ahora va a pelear por el puerto y ${C.bold("puede tirar abajo lo que ya tenés andando")}.

  ${C.bold("Lo que conviene:")} el modo proxy. El CRM queda en un puerto local y
  vos lo enganchás a tu proxy, que ya tiene el HTTPS resuelto.
`);
    if (await confirmar("  ¿Uso el modo proxy?", true)) modoFinal = "proxy";
    else if (!(await confirmar("  ¿Seguro que levanto Caddy igual?", false))) salir(0);
  } else {
    ok("80 y 443 libres");
  }
}

// ── 6. levantar ─────────────────────────────────────────────────────────────
titulo(`6. Levantando (modo ${modoFinal})`);

const archivo = modoFinal === "proxy" ? "docker-compose.proxy.yml" : "docker-compose.vps.yml";
const entorno = {
  ...process.env,
  DOMINIO: host,
  PUERTO_LOCAL: puertoLocal,
  NEXT_PUBLIC_SITE_URL: publicUrl,
};

info("Construyendo la imagen y arrancando. La primera vez tarda unos minutos.");
const r = spawnSync(
  "docker",
  [
    "compose",
    "-f", resolve(DEPLOY, archivo),
    "--env-file", resolve(CRM_DIR, ".env.local"),
    "up", "-d", "--build",
  ],
  { stdio: "inherit", env: entorno, cwd: DEPLOY },
);
if (r.status !== 0) {
  morir("Falló el levantado.", "Pegale el error de arriba a Claude Code, o mirá:  docker compose logs");
}
ok("Contenedores arriba");

// ── 7. guardar el dominio ───────────────────────────────────────────────────
guardarPublicUrl(publicUrl);

// ── 8. esperar a que conteste ───────────────────────────────────────────────
titulo("7. Esperando a que conteste");

if (modoFinal === "proxy") {
  console.log(`
  ${C.green(C.bold("✓ El CRM está corriendo"))} en ${C.bold(`127.0.0.1:${puertoLocal}`)}

  ${C.bold("Falta que lo conectes a tu proxy.")} Tiene que mandar
  ${C.bold(host)} → ${C.bold(`127.0.0.1:${puertoLocal}`)}, sirviendo HTTPS.

  ${C.dim("Con nginx sería algo así:")}
     server {
       server_name ${host};
       location / {
         proxy_pass http://127.0.0.1:${puertoLocal};
         proxy_set_header Host $host;
         proxy_set_header X-Forwarded-Proto https;
         proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       }
     }

  ${C.dim("Con Traefik, agregale al servicio un router para el host")} ${C.bold(host)}
  ${C.dim("con su certresolver, apuntando al puerto")} ${C.bold(puertoLocal)}${C.dim(".")}

  Cuando esté, corré  ${C.bold("npm run check")}  y después  ${C.bold("npm run paso2")}.
`);
  salir(0);
}

info("Caddy está pidiendo el certificado a Let's Encrypt. Suele tardar menos de");
info("un minuto, pero la primera vez puede irse a dos o tres.");

let vivo = false;
for (let i = 1; i <= 40 && !vivo; i++) {
  try {
    const res = await pedir(publicUrl, { redirect: "manual" }, 10000);
    if (res.status < 500) vivo = true;
  } catch {
    /* todavía no */
  }
  if (!vivo) {
    process.stdout.write(`\r  ${C.dim(`probando ${publicUrl} … ${i * 6}s`)}   `);
    await dormir(6000);
  }
}
console.log("");

if (vivo) {
  ok(`${publicUrl} responde por HTTPS`);
  console.log(`
  ${C.green(C.bold("✓ El CRM está en internet, con dominio propio y certificado."))}

  ${C.bold("Ahora:")}
     ${C.bold("npm run paso1")}   ${C.dim("(actualiza el Site URL de Auth con tu dominio)")}
     ${C.bold("npm run paso2")}   ${C.dim("(conecta WhatsApp — este webhook ya no se cae)")}

  ${C.dim(`Ver los logs:   cd deploy && docker compose -f ${archivo} logs -f`)}
  ${C.dim(`Frenar:         cd deploy && docker compose -f ${archivo} down`)}
`);
} else {
  fail(`${publicUrl} todavía no contesta`, "los contenedores están arriba; el problema suele ser el certificado");
  console.log(
    C.dim(`
  Qué mirar, en orden:
    · ${C.bold(`cd deploy && docker compose -f ${archivo} logs caddy`)}
      Si menciona un "challenge", el DNS todavía no apunta acá.
    · Que el firewall del proveedor deje entrar los puertos 80 y 443.
      En Oracle Cloud hay DOS lugares: las Security List de la VCN y el
      iptables de la máquina. Es el olvido más común.
    · Que ${host} resuelva a ${ipServidor || "la IP de este servidor"}.
`),
  );
  process.exitCode = 1;
}

// ── helpers ─────────────────────────────────────────────────────────────────
function guardarPublicUrl(url) {
  const c = { ...creds, PUBLIC_URL: url };
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
        META_PIN: c.META_PIN || "",
      }},
      { titulo: "DOMINIO", vars: {
        PUBLIC_URL: c.PUBLIC_URL || "",
        VERIFY_TOKEN: c.VERIFY_TOKEN || "",
      }},
    ],
    "CREDENCIALES — generado por el instalador.\nNO subir a GitHub. NO mostrar si grabás pantalla.",
  );
}
