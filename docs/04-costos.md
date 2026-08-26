# Lo que de verdad cuesta

Leé esto **antes** de prometerle a nadie —a un cliente o a vos mismo— que esto
es gratis.

El software es gratis y es tuyo. Eso es verdad y no es poco. Pero hay tres
costos que los tutoriales no mencionan, y uno de ellos arranca en semanas.

---

## 1. ⚠️ Desde el 1 de octubre de 2026, Meta cobra las respuestas

Este es el grande.

**Cómo era hasta ahora:** si un cliente te escribía, se abría una ventana de 24
horas y todo lo que le respondieras adentro de esa ventana era **gratis**. Solo
pagabas las plantillas que iniciabas vos.

**Cómo pasa a ser:** desde el **1/10/2026** los mensajes de servicio —las
respuestas dentro de esa ventana de 24 horas— **se cobran por mensaje**, a la
tarifa *utility* de tu país. Sin cuota gratuita mensual y sin descuentos por
volumen.

Cita textual de Meta:

> *"Effective October 1, 2026, Meta will charge for service messages, which have
> not been charged since November 2024."*

**Qué significa en plata.** Un negocio que recibe 70–80 mensajes por día pasa de
pagar **cero** a pagar del orden de **USD 80–130 por mes**. Es plata que le
llega a la tarjeta del dueño del número, no a la tuya.

**Tarifas de referencia para Argentina** *(último dato confirmado en julio de
2026 — el rate card oficial es interactivo y cambia: verificalo en tu propio
Business Manager antes de poner un número en una propuesta o en un video)*:

| Categoría | Precio aprox. por mensaje |
|---|---|
| Marketing | USD 0,0618 |
| Utility | USD 0,0260 |
| Authentication | USD 0,0260 |

**Qué sigue siendo gratis:** la ventana de 72 horas después de que alguien hace
clic en un anuncio *click-to-WhatsApp*.

> **Si vendés esto como servicio:** metelo en el presupuesto desde la primera
> conversación. Que el cliente se entere en octubre de que su WhatsApp ahora le
> cuesta plata es la peor forma de arrancar una relación.

---

## 2. "Con la API oficial no te banean" es falso

Lo dicen todos los tutoriales y no es cierto.

La API oficial te salva de **un** tipo de baneo: el de usar APIs no oficiales
(ese sí es permanente y automático). **No te salva de nada más.**

Te pueden suspender igual por:

- **Categoría de producto prohibida.** Hay rubros enteros que Meta no acepta.
  *Caso real: un negocio de productos médicos regulados perdió todas sus cuentas
  usando la API oficial, sin haber mandado un solo spam. El rubro estaba
  prohibido y listo.*
- **Calidad baja.** Meta mide con un semáforo. En verde escalás; en amarillo te
  están reportando; **en rojo tenés siete días** para mejorar o te bajan el
  límite de envío. Acumulado, suspensión.
- **Escribir primero sin permiso.** Necesitás opt-in antes del primer mensaje.
  Nunca compres listas.
- **Ignorar un "STOP".**

**Si la cuenta es nueva, hacé warm-up:** la primera semana, 10–20 mensajes por
día a gente que efectivamente te responde. Subí como mucho 20% por día. Meta
mira que las conversaciones sean de ida y vuelta, no solo de salida.

`npm run check` te muestra el `quality_rating` del número. Miralo seguido.

---

## 3. Infraestructura

| Qué | Cuánto |
|---|---|
| Supabase | Gratis hasta cierto punto. Se pausa por inactividad y tiene techo de base y de storage. El CRM guarda los adjuntos de WhatsApp: si tenés volumen, medilo. |
| Hosting del CRM | Desde ~5 USD/mes en un VPS chico. Gratis en las capas de prueba de Vercel o Railway. |
| Dominio | ~10–15 USD al año. |
| Asistente de IA | Aparte y opcional. El CRM lo trae, pero usa **tu** clave de OpenAI o Anthropic: pagás tu consumo. |

---

## El total honesto

Para un negocio chico, arrancando hoy:

- **Software:** 0. Es tuyo y es MIT.
- **Infra:** 0 a 15 USD/mes según dónde lo pongas.
- **WhatsApp:** hoy casi 0 si solo respondés. **Desde el 1/10/2026, del orden de
  30 a 130 USD/mes** según cuántos mensajes muevas.

Comparado con las plataformas que cobran por asiento y por mes, sigue siendo
mucho más barato — y la base de datos es tuya. Pero no es cero, y decirlo de
entrada te ahorra un problema en octubre.
