# Supabase — un clic y listo

Supabase es la base de datos del CRM: ahí viven tus contactos, conversaciones,
embudos y automatizaciones. Es tuya, no de nadie más.

De todo lo que el tutorial original hace acá —crear el proyecto, anotar la
contraseña en un bloc de notas, buscar tres llaves en tres pantallas distintas,
**pegar 39 archivos SQL uno por uno**— vos hacés **una sola cosa**.

---

## Lo único que tenés que hacer

1. Creá una cuenta en **supabase.com** (con Google va en diez segundos).
2. Andá a **supabase.com/dashboard/account/tokens**.
3. **Generate new token**, ponele cualquier nombre.
4. Copiá el token (empieza con `sbp_`) → `SUPABASE_ACCESS_TOKEN`.

Eso es todo. El instalador con eso:

- crea el proyecto (o usa uno tuyo, si le pasás el ref),
- genera y guarda la contraseña de la base,
- espera a que arranque,
- saca las tres llaves,
- **aplica las ~39 migraciones en orden**,
- corre la verificación de esquema del propio proyecto,
- configura el Site URL de Auth,
- y te escribe el `.env.local` completo.

> El token es una llave maestra de tu cuenta de Supabase. Está en
> `credenciales.env`, que está en `.gitignore`. No lo subas a ningún lado ni lo
> muestres si grabás pantalla.

---

## ¿Ya tenés un proyecto?

Poné su **Project Ref** en `SUPABASE_PROJECT_REF` y el instalador lo usa en vez
de crear uno nuevo. El ref es la parte del medio de la URL del dashboard:

```
https://supabase.com/dashboard/project/abcdefghijklmnop
                                       └──── esto ────┘
```

Las migraciones se registran en `supabase_migrations.schema_migrations`, así que
correr el paso 1 dos veces no las duplica: saltea las que ya estaban.

---

## Cosas del plan gratis que conviene saber

- **Se pausa por inactividad.** Si el proyecto pasa un tiempo sin recibir
  tráfico, Supabase lo suspende y hay que despertarlo desde el dashboard. Un CRM
  con mensajes entrando no debería llegar a eso, pero si estás probando y lo
  dejás una semana, te lo vas a encontrar dormido. `npm run check` te lo dice.
- **Hay límite de proyectos activos** en el plan gratis. Si el instalador dice
  que no puede crear más, pausá uno viejo o reusá uno existente.
- **Hay techo de base y de storage.** El CRM guarda los adjuntos de WhatsApp
  (fotos, audios, PDF). Si tenés volumen de verdad, medilo antes de asumir que
  el plan gratis te alcanza para siempre.

---

## El "bug" del mail que apunta a localhost

En el tutorial original, cuando te registrás, el mail de confirmación te manda a
`localhost:3000` y hay que **editar la URL a mano en el navegador**. El video lo
presenta como un bug del proyecto y te enseña a convivir con él.

No es un bug: es el **Site URL** de Supabase Auth sin configurar.

El paso 1 lo setea solo, siempre que `PUBLIC_URL` esté cargada en
`credenciales.env`. Si la completaste después, volvé a correr `npm run paso1` y
queda arreglado. `npm run check` verifica que apunte a tu dominio y no a
localhost.

A mano sería: **Authentication → URL Configuration → Site URL**.
