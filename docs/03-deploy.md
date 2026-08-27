# Ponerlo en internet

WhatsApp le avisa a tu CRM que llegó un mensaje golpeándole la puerta a una
dirección de internet. Por eso **localhost no alcanza**: Meta tiene que poder
llegar desde afuera.

Dos caminos. Empezá por el primero aunque después uses el segundo.

---

## a) Probarlo ya — túnel, gratis, dos minutos

Un túnel le pone una dirección pública temporal a la app que corre en tu compu.
Ideal para ver todo el circuito andando antes de decidir dónde pagar hosting.

**No hace falta tener cuenta en ningún lado.** Ni en Cloudflare ni en ninguna
otra parte: se descarga un programita, te asigna una dirección al azar y listo.

**1. Levantá el CRM** y dejá esa ventana abierta:

```bash
npm run levantar
```

**2. En otra terminal:**

```bash
npm run tunel
```

Eso abre el túnel, **captura la URL y la guarda solo** en `PUBLIC_URL`. No
tenés que copiar ni pegar nada. Dejá también esta ventana abierta.

> ⏱️ **La dirección tarda entre 1 y 4 minutos en activarse.** El túnel se
> conecta enseguida, pero el nombre tarda en propagarse por internet. El script
> espera solo y te avisa cuando está lista. Si te impacientás y la abrís antes,
> vas a ver un error de "no se encuentra el servidor" — esperá y reintentá.

**3. En una tercera terminal:**

```bash
npm run paso1    # actualiza el Site URL de Auth con la nueva dirección
npm run paso2    # conecta WhatsApp
```

> ⚠️ La URL del túnel **cambia cada vez que lo abrís**. Cuando eso pase, volvé a
> correr `npm run tunel` (que actualiza `PUBLIC_URL` solo) y después `paso1` y
> `paso2`. Es para probar, no para producción.

**Si el túnel no arranca**, la alternativa manual:

```bash
npx localtunnel --port 3000
```

y pegás esa URL en `PUBLIC_URL` de `credenciales.env` a mano.

---

## b) En tu propio servidor — con dominio fijo

Es lo que querés si vas a usarlo en serio: dirección estable, HTTPS de verdad,
y el webhook de Meta deja de romperse cada vez que cerrás algo.

Un comando: **`npm run vps`**. Se corre **dentro del servidor**, a propósito —
así no hay que configurar accesos por SSH ni decirle a nadie a qué servidor, y
funciona igual en Hetzner, DigitalOcean, Contabo, Vultr, Oracle o el que uses.

### Desde cero, en un VPS recién comprado

**1. Apuntá un dominio al servidor.** En tu proveedor de DNS, un registro `A`:

```
crm   →   la IP de tu servidor
```

Tarda unos minutos en propagarse. Si usás Cloudflare con el proxy naranja, el
instalador lo detecta y sigue sin molestarte.

**2. Entrá al servidor:**

```bash
ssh usuario@la-ip-de-tu-servidor
```

**3. Instalá lo necesario** (una sola vez):

```bash
# Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Node 20 y git
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git
```

> ⚠️ **Cerrá la sesión de SSH y volvé a entrar.** Si no, el sistema no toma el
> permiso de Docker y vas a ver errores de "permission denied". Es el tropiezo
> más común de este paso.
>
> No uses `apt install nodejs` a secas: en varias versiones de Ubuntu instala
> un Node viejísimo. La línea de NodeSource de arriba te da el 20.

**4. Instalá el CRM:**

```bash
git clone https://github.com/ignarru/crm-whatsapp-instalador.git
cd crm-whatsapp-instalador
npm run creds     # las 4 credenciales, y tu dominio en PUBLIC_URL
npm run paso1     # Supabase: proyecto, migraciones, llaves
npm run vps       # ← levanta el CRM con HTTPS
npm run paso2     # conecta WhatsApp
```

Listo. `npm run vps` levanta **Caddy**, que saca el certificado de Let's
Encrypt solo y lo renueva solo. No hay nada que configurar ni que renovar.

### Si tu servidor ya tiene otras cosas andando

El instalador se da cuenta y se adapta: mira si los puertos 80 y 443 están
ocupados antes de hacer nada. **Nunca va a pelear por un puerto ni tirarte abajo
lo que ya funciona.**

| Qué tiene tu servidor | Qué hace | Modo |
|---|---|---|
| Nada — VPS recién comprado | Levanta Caddy y saca el certificado solo | `caddy` *(por defecto)* |
| **Dokploy, Coolify o Traefik** | Se cuelga de ese proxy con etiquetas, sin publicar puertos | `traefik` |
| nginx, Apache, otro Caddy | Publica el CRM en `127.0.0.1` y te imprime la config a agregar | `proxy` |

Los detecta solo y te propone el correcto, pero podés forzarlo:

```bash
npm run vps -- --modo traefik
npm run vps -- --modo proxy --puerto 3001
```

Para un Traefik que no use los nombres habituales:

```bash
npm run vps -- --modo traefik --red mi-red --entrypoint https --certresolver mi-resolver
```

### Después

```bash
cd deploy
docker compose -f docker-compose.vps.yml logs -f     # ver los logs
docker compose -f docker-compose.vps.yml down        # frenar
```

Los contenedores tienen `restart: unless-stopped`: si reiniciás el servidor,
el CRM vuelve solo.

**Dos trampas del compose del CRM**, por si lo levantás a mano:

- Para cambiar el puerto publicado usá **`HOST_PORT`**, no `PORT`. El segundo
  solo cambia el puerto interno, y el healthcheck está fijado a 3000.
- El flag `--env-file .env.local` **es obligatorio**: Compose solo lee `.env`
  por defecto.

### Vercel, Railway, Hostinger, EasyPanel

Todas sirven. Es una app Next.js estándar.

1. Subí tu **fork** del CRM a GitHub (ver abajo).
2. Conectá el repo en la plataforma.
3. Cargá las variables de `crm/.env.local` en su panel de entorno.
4. Deploy.

> **Lo que rompe a todo el mundo:** las variables que empiezan con
> `NEXT_PUBLIC_` se **incrustan en el código durante el build**. Si las cambiás
> después, no pasa nada hasta que **reconstruyas**. Si ves valores viejos que no
> se actualizan, es esto.

---

## Sobre el fork

El instalador clona el CRM **fresco desde el repositorio oficial** y no lo toca.
Es a propósito: así el instalador no envejece cuando el proyecto se actualiza
(en pocos meses pasó de 26 migraciones a 39).

Si querés tu propia copia —para deployar desde tu GitHub, cambiarle el logo,
ponerle tu marca— la licencia MIT te deja:

1. Forkeá `github.com/ArnasDon/wacrm` a tu cuenta.
2. Antes de correr el paso 1, agregá a `credenciales.env`:
   ```
   CRM_REPO_URL=https://github.com/TU-USUARIO/wacrm.git
   ```
3. Borrá `./crm` si ya existía y corré `npm run paso1`.

**Lo que MIT te permite:** usarlo, modificarlo, ponerle tu marca, venderlo.
**Lo único que exige:** conservar el aviso de copyright y el archivo `LICENSE`
en el código. Vender el producto sí; borrar la atribución del repo no.

---

## Después de deployar

Cada vez que cambie el dominio:

```bash
npm run paso1    # realinea el Site URL de Auth
npm run paso2    # reapunta el webhook de Meta
npm run check    # confirma que todo quedó consistente
```
