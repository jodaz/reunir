import type { Metadata } from "next";
import Link from "next/link";
import styles from "./legal.module.css";

export const metadata: Metadata = {
  title: "Términos de uso — Reunir",
  description:
    "Términos de uso de Reunir: propósito humanitario, sin fines de lucro, y prohibición de recolección automatizada y reidentificación.",
};

/**
 * Terms of Use (PRD §5.8). Neutral Venezuelan Spanish, tuteo. States the humanitarian,
 * non-commercial purpose and prohibits automated collection + re-identification — a legal
 * marker that complements robots.txt and the token gate.
 */
export default function TerminosPage() {
  return (
    <main className={styles.page}>
      <article className={styles.article}>
        <h1>Términos de uso</h1>

        <p>
          Reunir es un buscador <strong>sin fines de lucro</strong> con un único
          propósito <strong>humanitario</strong>: ayudar a reunir a personas
          desaparecidas tras el terremoto de Venezuela de 2026 con sus familias.
          No publicamos información nueva: solo mostramos lo que ya es público en
          los registros originales y siempre enlazamos de vuelta a la fuente.
        </p>

        <h2>Qué puedes hacer</h2>
        <ul>
          <li>Buscar a una persona por su nombre.</li>
          <li>Consultar el resultado y seguir el enlace al registro original.</li>
          <li>
            Compartir un enlace con familiares que estén buscando a esa misma
            persona.
          </li>
        </ul>

        <h2>Qué no está permitido</h2>
        <ul>
          <li>
            <strong>Recolección automatizada</strong> (scraping, bots, descargas
            masivas) del contenido o de la API. El acceso es solo para búsquedas
            humanas individuales.
          </li>
          <li>
            <strong>Reidentificar</strong>, cruzar o enriquecer estos datos con
            otras fuentes para identificar o perfilar a las personas listadas.
          </li>
          <li>
            Usar la información con fines comerciales, publicitarios, de cobranza
            o de cualquier modo que perjudique a las personas o a sus familias.
          </li>
          <li>
            Volver a publicar los datos fuera de su contexto original.
          </li>
        </ul>

        <h2>Privacidad y minimización</h2>
        <p>
          Reunir nunca centraliza ni expone identificadores sensibles (como
          cédulas, correos o teléfonos de quien reporta). Solo se muestra lo que
          ya era público en la fuente. Las fotos enlazan a la fuente original; no
          las rehospedamos.
        </p>

        <h2>Sin garantías</h2>
        <p>
          La información proviene de registros de terceros y puede estar
          incompleta, desactualizada o contener errores. Reunir se ofrece
          &quot;tal cual&quot;, como herramienta de descubrimiento. Para reportar
          o actualizar un caso, usa la aplicación de la fuente correspondiente.
        </p>

        <h2>Contacto y bajas</h2>
        <p>
          Si eres responsable de uno de los proyectos fuente, o apareces (o
          aparece un familiar) en los resultados y quieres solicitar una baja,
          escríbenos. Mira la página de{" "}
          <Link href="/contacto">contacto</Link>.
        </p>

        <p className={styles.back}>
          <Link href="/">Volver a la búsqueda</Link>
        </p>
      </article>
    </main>
  );
}
