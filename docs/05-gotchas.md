# Errores raros y qué los causa

Ordenados por frecuencia. La mayoría los detecta `npm run check`.

---

## WhatsApp

### No llega ningún mensaje al inbox

Casi siempre es una de dos, y las dos son distintas aunque suenen igual:

1. **El campo `messages` no está suscrito** en el webhook de la app.
2. **La app no está suscrita a la WABA.**

Son cosas separadas: podés tener el webhook perfecto y aun así no recibir nada
porque la cuenta no le está mandando eventos a tu app. `npm run paso2` hace las
dos; `npm run check` te dice cuál falta.

### El webhook devuelve 403 al verificarlo

El verify token que guardaste en `Settings → WhatsApp` del CRM no es el mismo
que está en `credenciales.env`. Tienen que coincidir **exactamente** — sin
espacios de más al copiar.

**El caso más común no es que esté mal, es que esté vacío.** El campo *Webhook
Verify Token* del CRM es fácil de saltear porque su texto de ejemplo en gris
("Create a custom verify token") se parece a un valor cargado. Si el campo se ve
gris, está vacío.

Y recordá de dónde sale: **el verify token no te lo da Meta, lo genera el
instalador.** Es una palabra secreta al azar que tiene que estar en dos lados —
el CRM y Meta — para que se reconozcan entre ellos. Vos solo la copiás al CRM;
a Meta se la pone `npm run paso2` por API.

### "Not registered — Meta will not deliver events"

El número existe en tu cuenta pero no está registrado en la Cloud API, así que
Meta no le va a entregar nada. Lo resuelve `npm run paso2` en su última sección.

Necesita el **PIN de verificación en dos pasos** de ese número:

- **Números de prueba de Meta** (los que empiezan con `+1 555…`): no tienen PIN
  y vienen pre-registrados. Dejá el campo vacío.
- **Números reales tuyos**: sí tienen PIN, el que pusiste al darlo de alta. Si no
  lo recordás, se resetea desde el Business Manager → WhatsApp Accounts →
  Phone Numbers → Two-step verification. **Desde la API no se puede.**

### ⚠️ Los eventos se los lleva la última app que reclamó el número

Esto explica varios misterios y conviene entenderlo antes de romperlo:

**Una app de Meta tiene un solo webhook de WhatsApp, y Meta le entrega los
mensajes a la última app que reclamó ese número.** Si conectás el mismo número a
otra app, la anterior deja de recibir sin previo aviso y sin error visible.

Consecuencias prácticas:

- **No uses para el CRM la misma app de Meta que ya tenés en producción.** Crear
  una app aparte lleva cinco minutos y no toca lo que funciona. `npm run paso2`
  te avisa y te pide confirmación antes de pisar un webhook que apunte a otro
  lado, pero es mejor no llegar a esa situación.
- Es también el síntoma clásico cuando **un segundo número bajo la misma WABA**
  deja de recibir: alguien reclamó el número desde otra app.

### El webhook devuelve 404

La app no está corriendo en esa URL, o `PUBLIC_URL` apunta a otra cosa. Si estás
con un túnel, fijate que siga abierto: la URL cambia cada vez que lo reabrís.

### Andaba y de golpe dejó de andar (al día siguiente)

Usaste el **token temporal del Quickstart**, que dura 24 horas. Generá el del
System User siguiendo `docs/01-meta.md` paso 2. `npm run check` te lo dice:
si aparece *"vence en 1 día"*, es eso.

### "El número ya está registrado"

Está todo bien, seguí de largo.

### No puedo registrar el número / el PIN es rechazado

El número tenía verificación en dos pasos con **otro** PIN. Hay que desactivarla
desde el panel de Meta: **desde la API no se puede**.

### No llega el código de verificación

Pedilo por llamada en vez de SMS. Si sigue sin llegar: el número está en formato
equivocado (falta el código de país) o es VoIP, que Meta no acepta.

### "Número ya en uso"

El número sigue activo en la app de WhatsApp. Hay que eliminar esa cuenta
(Configuración → Cuenta → Eliminar mi cuenta), esperar unos minutos y reintentar.
**Se pierde el historial: no migra.**

### El nombre para mostrar fue rechazado

Meta revisa el *display name*. Rechaza los genéricos ("Ventas", "Oficial",
"Atención"). Usá el nombre real del negocio.

---

## Supabase

### El mail de confirmación apunta a localhost:3000

El **Site URL** no está configurado. No es un bug del CRM.

Poné `PUBLIC_URL` en `credenciales.env` y corré `npm run paso1`. A mano sería
Authentication → URL Configuration.

### Una migración falla

El paso 1 frena ahí y te dice cuál. Las anteriores ya quedaron aplicadas y
registradas: arreglás y volvés a correr `npm run paso1`, que sigue desde donde
quedó.

El SQL está en `crm/supabase/migrations/<archivo>`. Si no entendés el error,
pegáselo a Claude Code con el nombre del archivo.

### "No puedo crear más proyectos"

El plan gratis limita cuántos proyectos activos podés tener. Pausá uno viejo
desde el dashboard, o pegá el ref de un proyecto existente en
`SUPABASE_PROJECT_REF`.

### El proyecto aparece pausado

Supabase suspende los proyectos gratis por inactividad. Se despierta desde el
dashboard. `npm run check` lo reporta.

### La base recién creada rechaza consultas

Tarda un ratito en terminar de arrancar aunque la API ya diga que existe.
Esperá un minuto y volvé a correr el paso 1.

### No encuentro la anon key donde dice el tutorial

Supabase movió las llaves: las viejas `anon` / `service_role` ahora están bajo
**legacy**, y las nuevas se llaman *publishable* y *secret*. El instalador
maneja los dos casos solo. A mano: Settings → API keys.

---

## El túnel

### La URL del túnel dice "no se encuentra el servidor"

**Es normal los primeros minutos.** El túnel se conecta al instante, pero el
nombre tarda entre 1 y 4 minutos en propagarse por internet. `npm run tunel`
espera solo y te avisa cuando está lista.

Un detalle contraintuitivo: **consultar la dirección antes de tiempo empeora la
espera**, porque tu equipo se guarda el "no existe" durante varios minutos. Si
te desesperaste refrescando, esperá un rato sin tocarla.

Para ver qué está pasando de verdad, mirá `tunel.log`: si dice
`Registered tunnel connection`, el túnel está sano y solo falta el DNS.

### La URL cambia cada vez

Es así por diseño: son túneles descartables y anónimos. Cuando cambie, corré
`npm run tunel` de nuevo (actualiza `PUBLIC_URL` solo) y después `npm run paso1`
y `npm run paso2` para reapuntar el Site URL y el webhook.

Para una dirección fija, hay que deployar → `docs/03-deploy.md`.

### Cerré la ventana y se cayó todo

El túnel vive mientras esa ventana esté abierta. Son tres ventanas en total:
la app (`npm run levantar`), el túnel (`npm run tunel`) y una tercera para
correr los pasos.

---

## La app

### Cambié una variable y no pasa nada

Si empieza con `NEXT_PUBLIC_`, se incrusta en el código **durante el build**.
Hay que reconstruir:

```bash
cd crm && docker compose --env-file .env.local up --build -d
```

### El puerto no cambia

En el compose se cambia con **`HOST_PORT`**, no con `PORT`. `PORT` solo afecta
el puerto interno del contenedor, y el healthcheck está fijado a 3000.

### `docker compose up` no toma las variables

Falta el flag: `--env-file .env.local`. Compose solo lee `.env` por defecto.

### El build falla por rutas largas (Windows)

Si el proyecto está en una carpeta muy anidada, Next puede tirar
`path length … exceeds max length of filesystem`. Parece un error del código y
no lo es: movelo a una ruta corta, tipo `C:\crm`.

---

## Si nada de esto es lo tuyo

Corré `npm run check` y pegale la salida entera a Claude Code. Tiene el repo,
los docs y las credenciales a mano.
