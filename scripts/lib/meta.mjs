/**
 * Cliente de la Graph API de Meta.
 *
 * Los pasos que el video hace clickeando en dos paneles distintos —copiar el
 * Phone Number ID, copiar el WABA ID, pegar la callback URL, inventar el verify
 * token, tildar el campo `messages`, suscribir la app— son todos llamadas acá.
 *
 * Lo único que NO se puede automatizar (no existe API para eso) es crear la app
 * y generar el token del System User. Ver docs/01-meta.md.
 */

import { pedir } from "./ui.mjs";

const VERSION_POR_DEFECTO = "v26.0";

export class Meta {
  constructor({ appId, appSecret, token, version }) {
    this.appId = appId;
    this.appSecret = appSecret;
    this.token = token;
    this.version = version || process.env.GRAPH_API_VERSION || VERSION_POR_DEFECTO;
  }

  /** Token de aplicación: el único que sirve para tocar /{app-id}/subscriptions. */
  get appToken() {
    return this.appId && this.appSecret ? `${this.appId}|${this.appSecret}` : null;
  }

  async get(path, params = {}, token = this.token) {
    const url = new URL(`https://graph.facebook.com/${this.version}/${path}`);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    }
    url.searchParams.set("access_token", token);
    try {
      const res = await pedir(url, {}, 25000);
      const json = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, json };
    } catch (e) {
      return { ok: false, status: 0, json: { error: { message: String(e.message || e) } } };
    }
  }

  async post(path, body = {}, token = this.token) {
    const url = `https://graph.facebook.com/${this.version}/${path}`;
    const form = new URLSearchParams();
    for (const [k, v] of Object.entries(body)) {
      if (v !== undefined && v !== null) form.set(k, typeof v === "object" ? JSON.stringify(v) : v);
    }
    form.set("access_token", token);
    try {
      const res = await pedir(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: form.toString(),
        },
        30000,
      );
      const json = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, json };
    } catch (e) {
      return { ok: false, status: 0, json: { error: { message: String(e.message || e) } } };
    }
  }

  // ── token ─────────────────────────────────────────────────────────────────

  /** Devuelve { valido, tipo, venceEn (días|null = no vence), permisos[] }. */
  async inspeccionarToken() {
    if (!this.appToken) return { ok: false, error: "Faltan META_APP_ID / META_APP_SECRET" };
    const r = await this.get("debug_token", { input_token: this.token }, this.appToken);
    const d = r.json?.data;
    if (!r.ok || !d) {
      return { ok: false, error: r.json?.error?.message || `HTTP ${r.status}` };
    }
    const permisos = [
      ...new Set([...(d.scopes || []), ...(d.granular_scopes || []).map((g) => g.scope)]),
    ];
    return {
      ok: true,
      valido: !!d.is_valid,
      tipo: d.type || "?",
      // expires_at 0 = token de System User: no vence. Es el que querés.
      venceEn: d.expires_at ? Math.round((d.expires_at * 1000 - Date.now()) / 86400000) : null,
      venceEl: d.expires_at ? new Date(d.expires_at * 1000) : null,
      permisos,
    };
  }

  // ── descubrimiento ────────────────────────────────────────────────────────

  /**
   * Intenta encontrar las WABA solo. Requiere que el token tenga
   * business_management; si solo tiene los dos permisos de WhatsApp, falla
   * de forma limpia y el instalador pide el WABA ID a mano.
   */
  async descubrirWabas() {
    const negocios = await this.get("me/businesses", { fields: "id,name", limit: 50 });
    if (!negocios.ok) {
      return { ok: false, error: negocios.json?.error?.message || `HTTP ${negocios.status}` };
    }
    const encontradas = [];
    for (const n of negocios.json?.data || []) {
      const r = await this.get(`${n.id}/owned_whatsapp_business_accounts`, {
        fields: "id,name",
        limit: 50,
      });
      for (const w of r.json?.data || []) {
        encontradas.push({ id: w.id, nombre: w.name, negocio: n.name, negocioId: n.id });
      }
    }
    return { ok: true, wabas: encontradas };
  }

  waba(wabaId) {
    return this.get(wabaId, { fields: "id,name,account_review_status,timezone_id" });
  }

  numeros(wabaId) {
    return this.get(`${wabaId}/phone_numbers`, {
      fields:
        "id,display_phone_number,verified_name,quality_rating,code_verification_status,platform_type,status",
      limit: 50,
    });
  }

  // ── acciones ──────────────────────────────────────────────────────────────

  /**
   * Registra el número en la Cloud API. El PIN es el de verificación en dos
   * pasos: si el número ya tenía uno distinto, esto falla — y hay que
   * desactivarlo desde el panel (desde la API no se puede).
   */
  registrarNumero(phoneId, pin) {
    return this.post(`${phoneId}/register`, { messaging_product: "whatsapp", pin });
  }

  /** Suscribe la app a la WABA. Sin esto NO llega un solo mensaje entrante. */
  suscribirAppAWaba(wabaId) {
    return this.post(`${wabaId}/subscribed_apps`, {});
  }

  appsSuscritas(wabaId) {
    return this.get(`${wabaId}/subscribed_apps`);
  }

  /**
   * Da de alta el webhook: callback URL + verify token + campos.
   * Meta hace un GET de verificación contra la URL en este mismo momento, así
   * que la app TIENE que estar respondiendo antes de llamar a esto.
   */
  configurarWebhook(callbackUrl, verifyToken, campos) {
    if (!this.appToken) {
      return Promise.resolve({
        ok: false,
        json: { error: { message: "Faltan META_APP_ID / META_APP_SECRET" } },
      });
    }
    return this.post(
      `${this.appId}/subscriptions`,
      {
        object: "whatsapp_business_account",
        callback_url: callbackUrl,
        verify_token: verifyToken,
        fields: (campos || CAMPOS_WEBHOOK).join(","),
        include_values: "true",
      },
      this.appToken,
    );
  }

  async leerWebhook() {
    if (!this.appToken) return { ok: false, error: "Faltan META_APP_ID / META_APP_SECRET" };
    const r = await this.get(`${this.appId}/subscriptions`, {}, this.appToken);
    if (!r.ok) return { ok: false, error: r.json?.error?.message || `HTTP ${r.status}` };
    const wa = (r.json?.data || []).find((s) => s.object === "whatsapp_business_account");
    if (!wa) return { ok: true, configurado: false };
    return {
      ok: true,
      configurado: true,
      callbackUrl: wa.callback_url,
      activo: !!wa.active,
      campos: (wa.fields || []).map((f) => f.name),
    };
  }
}

/**
 * Los campos que wacrm necesita. `messages` es el crítico: sin ese, no entra
 * un solo mensaje. Los tres de template son para que el estado de las
 * plantillas (aprobada/rechazada) se refleje en el CRM.
 */
export const CAMPOS_WEBHOOK = [
  "messages",
  "message_template_status_update",
  "message_template_quality_update",
  "message_template_components_update",
];

export const PERMISOS_NECESARIOS = [
  "whatsapp_business_messaging",
  "whatsapp_business_management",
];

export const errorDe = (r) => r?.json?.error?.message || r?.error || `HTTP ${r?.status ?? "?"}`;
