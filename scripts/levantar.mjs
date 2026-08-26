#!/usr/bin/env node
/**
 * npm run levantar — instala dependencias y arranca el CRM.
 *
 * Detecta si tenés Docker; si no, usa Node directo. El tutorial asume Docker
 * y una cuenta de hosting: acá cualquiera de las dos vías sirve para tener el
 * CRM andando en tu máquina antes de deployar nada.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { CRM_DIR, C, ok, info, warn, encabezado, titulo, morir, leerEnv, ROOT } from "./lib/ui.mjs";

if (!existsSync(CRM_DIR)) morir("No existe ./crm.", "Corré primero:  npm run paso1");

const envCrm = leerEnv(resolve(CRM_DIR, ".env.local"));
if (!envCrm.NEXT_PUBLIC_SUPABASE_URL) {
  morir("crm/.env.local no tiene la configuración de Supabase.", "Corré:  npm run paso1");
}

encabezado("Levantando el CRM");

const hayDocker = probar("docker", ["--version"]);
const modo = process.argv.includes("--docker")
  ? "docker"
  : process.argv.includes("--node")
    ? "node"
    : hayDocker
      ? "docker"
      : "node";

if (modo === "docker") {
  titulo("Docker");
  info("docker compose --env-file .env.local up --build -d");
  info("(las NEXT_PUBLIC_* se inlinean en el build: si las cambiás, hay que reconstruir)");
  correr("docker", ["compose", "--env-file", ".env.local", "up", "--build", "-d"], CRM_DIR);
  console.log(`\n${C.green(C.bold("✓ Contenedor arriba."))}`);
  console.log(C.dim("  http://localhost:3000  ·  logs: cd crm && docker compose logs -f"));
  console.log("");
} else {
  titulo("Node");
  if (!hayDocker) info("No encontré Docker — uso Node directo, que para probar alcanza.");

  if (!existsSync(resolve(CRM_DIR, "node_modules"))) {
    info("npm install (esto tarda un par de minutos la primera vez)…");
    correr("npm", ["install"], CRM_DIR);
    ok("Dependencias instaladas");
  } else {
    ok("node_modules ya estaba");
  }

  console.log("");
  info("Arrancando en modo desarrollo. Ctrl+C para frenar.");
  console.log(C.dim(`  Cuando levante: ${C.bold("http://localhost:3000")}`));
  console.log(
    C.dim(
      "\n  Ojo: localhost NO le sirve a Meta para el webhook. Para conectar\n" +
        "  WhatsApp necesitás una URL pública → docs/03-deploy.md\n",
    ),
  );

  const hijo = spawn("npm", ["run", "dev"], { cwd: CRM_DIR, stdio: "inherit", shell: true });
  hijo.on("exit", (code) => process.exit(code ?? 0));
}

// ── helpers ─────────────────────────────────────────────────────────────────
function probar(cmd, args) {
  try {
    execFileSync(cmd, args, { stdio: "pipe", shell: true });
    return true;
  } catch {
    return false;
  }
}

function correr(cmd, args, cwd) {
  try {
    execFileSync(cmd, args, { cwd, stdio: "inherit", shell: true });
  } catch (e) {
    morir(`Falló: ${cmd} ${args.join(" ")}`, "Pegale el error de arriba a Claude Code.");
  }
}
