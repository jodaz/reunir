# Outreach — venezuelatebusca (Source B)

Estado: **borrador listo para enviar** (en progreso).
Enviar desde: **jesus@jodaz.xyz**
Para: equipo / contacto de venezuelatebusca.com

Contexto (ADR 0001): Source B queda como "no conectado" hasta obtener un feed autorizado o
confirmar que sus registros ya son alcanzables vía el upstream compartido `reconexion` / Source C.
**Nunca** se automatiza ni se evade el Turnstile de B. Este correo es el único camino aceptado
para conectar B.

---

## Asunto

Reunir — búsqueda unificada de personas desaparecidas (terremoto 2026): solicitud de feed autorizado

## Cuerpo

Estimado equipo de venezuelatebusca:

Les escribo por **Reunir**, un proyecto humanitario, sin fines de lucro y de **solo lectura** que
unifica la búsqueda de personas desaparecidas tras el terremoto de 2026 en Venezuela. Reunir
permite buscar un nombre una sola vez y consultar en paralelo los tres registros independientes
que hoy existen —desaparecidos-terremoto, terremotovenezuela y el de ustedes,
venezuelatebusca— mostrando cada resultado con un enlace de vuelta al registro original. No
republicamos sus datos ni reemplazamos su aplicación: el objetivo es ayudar a que un familiar
encuentre la ficha correcta más rápido, y el reporte sigue ocurriendo en la app de origen.

Quiero ser claro y transparente en dos puntos que para nosotros son innegociables:

1. **Respetamos su protección anti-bots.** Sabemos que su feed está detrás de Cloudflare
   Turnstile. **No lo vamos a evadir ni automatizar de ninguna forma.** Esa misma protección es
   la que Reunir aplica a su propia API; por principio no la vulneramos en nadie.
2. **No centralizamos datos sensibles.** Reunir nunca almacena ni expone cédulas ni los datos de
   contacto del reportante (correo/teléfono). Solo mostramos lo que ya es público en la ficha de
   origen, y siempre enlazando de vuelta a ustedes.

Por eso me gustaría consultarles:

- ¿Podrían facilitarnos un **feed o webhook autorizado** (de solo lectura) para integrar sus
  registros de forma sancionada por ustedes?
- Si no, ¿nos pueden **confirmar** si sus registros ya son alcanzables a través del upstream
  compartido `reconexion` / del registro de terremotovenezuela? (Observamos referencias cruzadas
  de imágenes/registros que sugieren una base común; preferimos confirmarlo con ustedes antes de
  asumir nada.)

Mientras tanto, en Reunir su fuente aparece como **"no conectada"**, de forma honesta y sin
intentar acceder a sus datos.

Quedo atento a la vía que ustedes prefieran. Pueden responderme directamente a este correo,
**jesus@jodaz.xyz**. Mil gracias por el trabajo que están haciendo; con gusto me adapto a las
condiciones que consideren para proteger a las personas reportadas.

Cordialmente,
Jesús
Reunir — jesus@jodaz.xyz
