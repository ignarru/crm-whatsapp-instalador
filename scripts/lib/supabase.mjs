/**
 * Cliente de la Management API de Supabase.
 *
 * Todo lo que el video hace a mano en el dashboard —crear el proyecto, copiar
 * las tres llaves, pegar 39 archivos SQL en el editor, configurar el Site URL—
 * son llamadas a esta API. Contratos verificados contra el OpenAPI oficial
 * (https://api.supabase.com/api/v1-json).
 */

import { randomBytes } from "node:crypto";

import { dormir, pedir } from "./ui.mjs";

const BASE = "https://api.supabase.com";

export class SupabaseAdmin {
  constructor(token) {
    if (!token) throw new Error("Falta el SUPABASE_ACCESS_TOKEN");
    this.token = token;
  }

  async req(metodo, path, body, { timeout = 60000 } = {}) {
    let res, texto;
    try {
      res = await pedir(
        `${BASE}${path}`,
        {
          method: metodo,
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
          },
          body: body ? JSON.stringify(body) : undefined,
        },
        timeout,
      );
      texto = await res.text();
    } catch (e) {
      return { ok: false, status: 0, error: `Red: ${e.message || e}`, json: null };
    }

    let json = null;
    try {
      json = texto ? JSON.parse(texto) : null;
    } catch {
      /* algunas respuestas no son JSON */
    }

    if (!res.ok) {
      const msg =
        json?.message ||
        json?.error?.message ||
        json?.msg ||
        texto?.slice(0, 400) ||
        `HTTP ${res.status}`;
      return { ok: false, status: res.status, error: msg, json };
    }
    return { ok: true, status: res.status, json, texto };
  }

  // ── cuenta ────────────────────────────────────────────────────────────────

  /** Valida el token y devuelve las organizaciones. */
  organizaciones() {
    return this.req("GET", "/v1/organizations");
  }

  proyectos() {
    return this.req("GET", "/v1/projects");
  }

  proyecto(ref) {
    return this.req("GET", `/v1/projects/${ref}`);
  }

  /**
   * Crea un proyecto. `region` por defecto sa-east-1 (São Paulo): es la más
   * cercana para Argentina y el resto del cono sur.
   */
  crearProyecto({ nombre, dbPass, organizacion, region = "sa-east-1", plan = "free" }) {
    return this.req(
      "POST",
      "/v1/projects",
      { name: nombre, db_pass: dbPass, organization_slug: organizacion, region, plan },
      { timeout: 120000 },
    );
  }

  /** Espera a que la base esté realmente arriba. Devuelve el estado final. */
  async esperarProyecto(ref, { maxMs = 300000, onTick } = {}) {
    const t0 = Date.now();
    let ultimo = "";
    while (Date.now() - t0 < maxMs) {
      const r = await this.proyecto(ref);
      const estado = r.json?.status || (r.ok ? "UNKNOWN" : `error:${r.status}`);
      if (estado !== ultimo) {
        ultimo = estado;
        onTick?.(estado, Math.round((Date.now() - t0) / 1000));
      }
      if (estado === "ACTIVE_HEALTHY") return { ok: true, estado };
      if (["INIT_FAILED", "REMOVED", "RESTORE_FAILED"].includes(estado)) {
        return { ok: false, estado };
      }
      await dormir(5000);
    }
    return { ok: false, estado: ultimo || "TIMEOUT" };
  }

  // ── llaves ────────────────────────────────────────────────────────────────

  /**
   * Devuelve { url, anon, serviceRole }.
   *
   * Supabase movió las llaves de anon/service_role (ahora "legacy") a
   * publishable/secret. wacrm espera las legacy, así que las pedimos primero
   * y solo caemos a las nuevas si el proyecto ya no las expone.
   */
  async llaves(ref) {
    const url = `https://${ref}.supabase.co`;

    const legacy = await this.req("GET", `/v1/projects/${ref}/api-keys/legacy`);
    if (legacy.ok && legacy.json) {
      const anon = legacy.json.anon_key || legacy.json.anonKey;
      const service = legacy.json.service_role_key || legacy.json.serviceRoleKey;
      if (anon && service) return { ok: true, url, anon, serviceRole: service, tipo: "legacy" };
    }

    const todas = await this.req("GET", `/v1/projects/${ref}/api-keys?reveal=true`);
    if (!todas.ok) return { ok: false, error: todas.error };

    const lista = Array.isArray(todas.json) ? todas.json : [];
    const porNombre = (n) => lista.find((k) => k.name === n)?.api_key;
    const porTipo = (t) => lista.find((k) => k.type === t)?.api_key;

    const anon = porNombre("anon") || porTipo("publishable");
    const serviceRole = porNombre("service_role") || porTipo("secret");

    if (!anon || !serviceRole) {
      return {
        ok: false,
        error:
          "No pude leer las llaves del proyecto. Sacálas a mano de " +
          `https://supabase.com/dashboard/project/${ref}/settings/api-keys`,
      };
    }
    return {
      ok: true,
      url,
      anon,
      serviceRole,
      tipo: porNombre("anon") ? "legacy" : "nuevas (publishable/secret)",
    };
  }

  // ── SQL ───────────────────────────────────────────────────────────────────

  /**
   * Ejecuta SQL arbitrario. Es el mismo camino que usa el SQL Editor del
   * dashboard: el que el video recorre 39 veces a mano.
   */
  sql(ref, query, { timeout = 180000 } = {}) {
    return this.req("POST", `/v1/projects/${ref}/database/query`, { query }, { timeout });
  }

  /** Crea la tabla de control de migraciones (la misma que usa el CLI). */
  async prepararTablaMigraciones(ref) {
    return this.sql(
      ref,
      `create schema if not exists supabase_migrations;
       create table if not exists supabase_migrations.schema_migrations (
         version text primary key,
         statements text[],
         name text
       );`,
    );
  }

  async migracionesAplicadas(ref) {
    const r = await this.sql(
      ref,
      "select version from supabase_migrations.schema_migrations order by version;",
    );
    if (!r.ok) return new Set();
    const filas = Array.isArray(r.json) ? r.json : r.json?.result || [];
    return new Set(filas.map((f) => String(f.version)));
  }

  async marcarMigracion(ref, version, nombre) {
    const esc = (s) => String(s).replace(/'/g, "''");
    return this.sql(
      ref,
      `insert into supabase_migrations.schema_migrations (version, name)
       values ('${esc(version)}', '${esc(nombre)}')
       on conflict (version) do nothing;`,
    );
  }

  // ── auth ──────────────────────────────────────────────────────────────────

  authConfig(ref) {
    return this.req("GET", `/v1/projects/${ref}/config/auth`);
  }

  /**
   * Esto es lo que arregla el "bug" del mail de confirmación que apunta a
   * localhost:3000. No es un bug del CRM: es el Site URL sin configurar.
   *
   * `autoconfirmar` controla si hace falta confirmar el mail para entrar:
   * en local se apaga (probar no debería depender de que llegue un correo,
   * y el SMTP compartido de Supabase tiene un límite bajísimo), y en cuanto
   * hay dominio real se vuelve a encender.
   */
  configurarAuth(ref, { siteUrl, extras = [], autoconfirmar = false }) {
    const lista = [
      siteUrl,
      `${siteUrl}/**`,
      "http://localhost:3000",
      "http://localhost:3000/**",
      ...extras,
    ];
    return this.req("PATCH", `/v1/projects/${ref}/config/auth`, {
      site_url: siteUrl,
      uri_allow_list: [...new Set(lista)].join(","),
      mailer_autoconfirm: autoconfirmar,
    });
  }
}

/** Contraseña fuerte para la base, sin caracteres que rompan una URL. */
export function generarDbPass(largo = 32) {
  const alfabeto = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789-_";
  const bytes = randomBytes(largo);
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join("");
}
