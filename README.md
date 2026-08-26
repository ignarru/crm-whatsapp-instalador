# CRM de WhatsApp — instalador

Montá tu propio CRM de WhatsApp: bandeja compartida para todo tu equipo, embudo
de ventas, campañas de difusión, automatizaciones y asistente de IA. Corriendo
en tu servidor, con tu base de datos, con la API oficial de Meta.

**El CRM es [wacrm](https://github.com/ArnasDon/wacrm), open source y MIT.**
Esto es el instalador: convierte 41 pasos manuales en cuatro credenciales y un
comando.

---

## Por qué existe

El tutorial que anda dando vueltas para montar este CRM tiene 41 pasos, cruza
seis paneles distintos y —el peor tramo— te hace **copiar y pegar 39 archivos
SQL, uno por uno**, en el editor de Supabase. Entre dos y cuatro horas si nunca
lo hiciste, con abandono garantizado en la mitad.

Casi todo eso es automatizable. Esto lo automatiza.

|  | A mano | Con el instalador |
|---|---|---|
| Pasos | ~41 | **4 credenciales + 1 comando** |
| Archivos SQL a pegar | 39 | **0** |
| Paneles que tocás | 6 | **2** (Meta y Supabase, una vez) |
| Tiempo | 2–4 h | **15–25 min** |

Además arregla de entrada dos cosas que el tutorial deja rotas:

- **El mail de confirmación que apunta a `localhost:3000`.** El video te enseña a
  editar la URL a mano cada vez. No es un bug del CRM: es el *Site URL* de
  Supabase sin configurar. Acá se configura solo.
- **El token que dura 24 horas.** Muchísima gente copia el token temporal del
  Quickstart y al día siguiente el CRM deja de andar sin explicación. El
  diagnóstico te avisa antes.

Y te dice **lo que realmente cuesta** → [`docs/04-costos.md`](docs/04-costos.md).
Spoiler: el 1 de octubre de 2026 Meta empieza a cobrar las respuestas.

---

## Empezar

Hay dos caminos y **los dos llegan al mismo lugar**. Elegí por comodidad, no
por nivel técnico.

Los dos necesitan [Node.js](https://nodejs.org) versión 20 o más y
[git](https://git-scm.com). Se instalan con siguiente, siguiente, siguiente.

> Después de instalarlos, **cerrá la terminal y abrí una nueva**. Si no, el
> sistema sigue sin encontrarlos y parece que no se instalaron.

### a) Con Claude Code — recomendado si no programás

1. Instalá [Claude Code](https://claude.com/claude-code). Va en la terminal,
   pero si no querés saber nada con la consola existe la **aplicación de
   escritorio**: es una ventana normal donde escribís.
2. Descargá este repo:
   ```bash
   git clone https://github.com/ignarru/crm-whatsapp-instalador.git
   ```
3. **Abrí esa carpeta con Claude Code y escribile:**

   > instalá el CRM

Y ya está. Claude lee las instrucciones que vienen en el repo, te va pidiendo
una cosa a la vez, y **cuando algo falla lo arregla** en vez de dejarte con un
error en pantalla. Podés preguntarle cualquier cosa en el camino: por qué te
pide algo, qué significa un término, si podés saltear un paso.

### b) Vos solo, con la terminal

Exactamente lo mismo, sin Claude en el medio:

```bash
git clone https://github.com/ignarru/crm-whatsapp-instalador.git
cd crm-whatsapp-instalador
npm run instalar
```

También te lleva de la mano y frena donde necesita algo tuyo. Cada comando se
puede correr suelto y **repetir sin romper nada**: si algo se corta, arreglás y
volvés a correr desde donde quedaste.

La única diferencia real entre los dos caminos aparece cuando algo sale mal: en
el (a) tenés a alguien que lee el error y lo resuelve; en el (b) tenés
[`docs/05-gotchas.md`](docs/05-gotchas.md), que cubre los errores conocidos con
su causa y su arreglo.

---

## Los cuatro datos que tenés que conseguir

Son los únicos que ningún programa puede sacar por vos: **no existe API para
crear una app de Meta ni para generar el token de un System User**. Diez
minutos, una sola vez, con el camino de clics exacto en
[`docs/01-meta.md`](docs/01-meta.md).

| Dato | De dónde sale |
|---|---|
| **Token de Supabase** | `supabase.com/dashboard/account/tokens` → un clic |
| **App ID** y **App Secret** | `developers.facebook.com` → tu app → Configuración → Básica |
| **Token permanente** | `business.facebook.com` → Usuarios del sistema → Generar token |

Van en `credenciales.env` (que está en `.gitignore`).

---

## Qué hace solo

**Supabase** — crea el proyecto, espera a que arranque, saca las tres llaves,
**aplica las ~39 migraciones en orden**, corre la verificación de esquema del
propio proyecto, configura el Site URL de Auth, genera la clave de encriptación
y escribe el `.env.local` completo.

**Meta** — descubre tu cuenta de WhatsApp Business y tus números, prueba el
apretón de manos del webhook, lo registra con la callback URL y el verify token,
suscribe los campos correctos (incluido `messages`, el que todo el mundo se
olvida), suscribe la app a la cuenta y registra el número si hace falta.

**Diagnóstico** — `npm run check` revisa las dos puntas y te dice en castellano
qué falta y cómo se arregla.

### Lo que queda a mano (y por qué)

Pegar cuatro valores en `Settings → WhatsApp` del CRM. Ese formulario encripta
el token con tu clave antes de guardarlo, y replicar esa encriptación desde
afuera sería atarnos a un detalle interno que puede cambiar en el próximo commit
del proyecto. Son 30 segundos y una sola pantalla — preferimos eso a que se
rompa solo dentro de dos meses.

---

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run instalar` | Todo, encadenado |
| `npm run creds` | Valida las credenciales y explica qué falta |
| `npm run paso1` | Supabase completo |
| `npm run levantar` | Instala dependencias y arranca el CRM |
| `npm run tunel` | Le da una dirección pública al CRM (sin cuenta en ningún lado) |
| `npm run paso2` | Conecta WhatsApp |
| `npm run check` | Diagnóstico de punta a punta |
| `npm run vincular` | Guarda las credenciales fuera del repo (dos máquinas, equipo) |

Todos son **idempotentes**: si algo se rompe, arreglás y volvés a correr. Nada
se duplica.

---

## Si trabajás desde dos computadoras

Las credenciales viven en `credenciales.env`, que **nunca se sube al repo** — y
no es una precaución exagerada: git guarda el historial para siempre, así que
borrarlo después no lo saca, y este repo está pensado para compartirse.

Para no volver a cargarlas en cada máquina, guardalas en una carpeta
sincronizada y dejá acá un puntero:

```bash
npm run vincular -- "C:\ruta\a\tu\carpeta\sincronizada\crm.env"
```

Eso mueve el archivo, borra la copia del repo (una sola fuente de verdad) y
anota la ubicación en `credenciales.ruta`, que también está en `.gitignore`.

En la otra computadora, después de clonar: **el mismo comando con la misma
ruta** y ya las tenés. Para volver atrás, `npm run vincular -- --deshacer`.

> También podés apuntar la variable de entorno `CRM_CREDENCIALES` al archivo,
> que tiene prioridad sobre todo lo demás.

**Una advertencia si vas y venís entre máquinas:** la `ENCRYPTION_KEY` vive en
`crm/.env.local`, no en `credenciales.env`. Si generás una nueva en la segunda
computadora, los tokens de WhatsApp guardados desde la primera quedan
ilegibles y hay que reconectar. Si ya conectaste WhatsApp, copiate esa línea
a mano.

---

## Documentación

| | |
|---|---|
| [`01-meta.md`](docs/01-meta.md) | Los tres pasos manuales de Meta, clic por clic |
| [`02-supabase.md`](docs/02-supabase.md) | El token, y qué esperar del plan gratis |
| [`03-deploy.md`](docs/03-deploy.md) | Probarlo con un túnel en 2 min, o deployarlo en serio |
| [`04-costos.md`](docs/04-costos.md) | **Lo que de verdad cuesta.** Leelo antes de vender esto |
| [`05-gotchas.md`](docs/05-gotchas.md) | Errores raros y qué los causa |

---

## Dos advertencias honestas

**"Es gratis" tiene fecha de vencimiento.** El software sí es gratis y es tuyo.
Pero desde el **1/10/2026** Meta cobra los mensajes de servicio: las respuestas
dentro de la ventana de 24 horas dejan de ser gratis. Un negocio con 70-80
mensajes por día pasa a pagar del orden de USD 80-130 por mes. Está todo con
números en [`docs/04-costos.md`](docs/04-costos.md).

**"Con la API oficial no te banean" es falso.** Te salva del baneo *por usar API
no oficial*. Por categoría de producto prohibida, calidad baja o escribir sin
permiso te suspenden igual, con API oficial y todo.

---

## Sobre el código

Este instalador **no incluye el CRM**: lo clona fresco del repositorio oficial
cuando lo corrés. Es a propósito. El proyecto se mueve rápido —pasó de 26 a 39
migraciones en pocos meses— así que congelar una copia sería garantizar que
quede vieja. Lo que envejece es el código; lo que no envejece es el instalador.

Cero dependencias de npm: todo sale de Node.

**wacrm es MIT**, así que podés usarlo, modificarlo, ponerle tu marca y venderlo.
Lo único que la licencia exige es conservar el aviso de copyright y el archivo
`LICENSE`. Vender el producto sí; borrar la atribución del repo no. Si querés
trabajar sobre tu propio fork, mirá [`docs/03-deploy.md`](docs/03-deploy.md).

---

Hecho por [IABYIA](https://iabyia.com.ar) · MIT
