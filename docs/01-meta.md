# Los tres pasos de Meta que nadie puede automatizar

De toda la instalación, esto es lo único que tenés que hacer a mano. No es
porque nos dio fiaca: **no existe API para crear una app de Meta ni para generar
el token de un System User**. Son unos diez minutos, una sola vez.

Salís de acá con cuatro datos:

| Dato | Dónde va |
|---|---|
| App ID | `META_APP_ID` |
| App Secret | `META_APP_SECRET` |
| Token permanente | `META_ACCESS_TOKEN` |
| WABA ID *(opcional)* | `META_WABA_ID` |

> ⚠️ Ojo con dos paneles que se parecen y no son lo mismo:
> **developers.facebook.com** (tu app) y **business.facebook.com** (tu negocio).
> El token sale del segundo. Es el error más común de todos.

---

## Antes de empezar necesitás

- Una cuenta de Facebook.
- Un **Meta Business Portfolio** (si nunca creaste uno, te lo pide en el camino).
- Un **número de teléfono real** que reciba SMS o llamada, en formato
  internacional. **Los números VoIP no sirven.**
- Que ese número **no esté activo en la app de WhatsApp**. Si lo está, hay que
  eliminar esa cuenta primero (Configuración → Cuenta → Eliminar mi cuenta) y
  esperar unos minutos. **Se borra el historial y no migra.**
- Si el número tenía **verificación en dos pasos, desactivala antes**. Desde la
  API no se puede.

---

## Paso 1 — Crear la app  ·  *App ID y App Secret*

1. Entrá a **developers.facebook.com** → **My Apps** → **Create App**.
2. Ponele un nombre (el que quieras, se puede cambiar).
3. En casos de uso elegí **Other** si aparece; si no, **Business**.
4. Tipo de app: **Business**.
5. Seleccioná tu portfolio de negocio y creala.
6. Ya adentro, buscá el producto **WhatsApp** y agregalo.

Ahora los dos primeros datos:

7. **Configuración → Básica** (App settings → Basic).
8. Copiá el **Identificador de la app** → `META_APP_ID`.
9. Al lado, **Clave secreta** → **Mostrar** → copiala → `META_APP_SECRET`.

> El App Secret es lo que hace que tu CRM pueda comprobar que un mensaje entrante
> viene de Meta y no de un tercero. Sin eso, cualquiera puede escribirle a tu
> webhook haciéndose pasar por WhatsApp.

Mientras estés acá, anotá también:

10. **WhatsApp → Configuración de la API**. Ahí ves el **Phone number ID** y el
    **WhatsApp Business Account ID**. El segundo es tu `META_WABA_ID`
    *(opcional: el instalador intenta descubrirlo solo)*.

---

## Paso 2 — El token permanente  ·  *el paso que más se hace mal*

En la pantalla de arriba Meta te ofrece un **token temporal**. **No lo uses:
dura 24 horas** y al día siguiente el CRM deja de andar sin decir por qué.

El bueno se genera en el otro panel:

1. Entrá a **business.facebook.com** → **Configuración del negocio**.
2. Menú izquierdo → **Usuarios** → **Usuarios del sistema**.
3. **Agregar** → nombre cualquiera → rol **Administrador** → crear.
4. Con el usuario seleccionado: **Agregar activos**.
5. Pestaña **Apps** → elegí la app que creaste recién → **Control total** → guardar.
6. Ahora **Generar nuevo token**.
7. Elegí tu app en el desplegable.
8. Vencimiento: **Nunca**.
9. Marcá exactamente estos dos permisos:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
10. Generá y **copiá el token ahora**: no lo vas a poder volver a ver.

→ `META_ACCESS_TOKEN`

> Si además marcás `business_management`, el instalador puede descubrir tu WABA
> ID solo y te ahorrás ese dato. No es obligatorio.

**¿Cómo sé si agarré el correcto?** Corré `npm run check`. Si dice
*"No vence (System User)"*, está bien. Si dice *"vence en 1 día"*, agarraste el
temporal.

---

## Paso 3 — El número

1. **developers.facebook.com** → tu app → **WhatsApp → Configuración de la API**.
2. **Agregar número de teléfono**.
3. Nombre para mostrar (el que van a ver tus clientes). **Meta lo revisa**:
   puede tardar de unas horas a varios días. Evitá nombres genéricos tipo
   "Ventas" u "Oficial" — los rechaza.
4. Verificá el número con el código que te llega por SMS o llamada.
5. Vas a tener que poner un **PIN de seis dígitos** (verificación en dos pasos,
   obligatoria desde 2024). **Anotalo.** El instalador te lo pide si hace falta
   registrar el número.

> Para probar no hace falta nada de esto: Meta te da un **número de prueba**
> gratis que le escribe hasta a cinco destinatarios que vos autorices. Sirve
> para ver el CRM andando de punta a punta antes de comprometer tu número real.

---

## Listo

Poné los cuatro valores en `credenciales.env` y seguí con:

```bash
npm run creds     # valida que estén bien
npm run paso1     # Supabase entero
```

Si algo no cerró, `npm run check` te dice exactamente qué falta.
