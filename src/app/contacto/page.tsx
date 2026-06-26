import type { Metadata } from "next";
import Link from "next/link";
import styles from "../terminos/legal.module.css";

export const metadata: Metadata = {
  title: "Contacto y bajas — Reunir",
  description:
    "Cómo contactar a Reunir y solicitar la baja (opt-out) de un registro: proyectos fuente y personas listadas.",
};

const CONTACT_EMAIL = "jesus@jodaz.xyz";

/**
 * Contact + opt-out path (PRD §5.8). Neutral Venezuelan Spanish, tuteo. One clear address for
 * source projects and for listed individuals (or their families) to request removal.
 */
export default function ContactoPage() {
  return (
    <main className={styles.page}>
      <article className={styles.article}>
        <h1>Contacto y bajas</h1>

        <p>
          Reunir es un proyecto humanitario, sin fines de lucro. Si tienes
          dudas, quieres reportar un problema, o necesitas solicitar la baja de
          un registro, escríbenos a:
        </p>

        <p className={styles.email}>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>

        <h2>Para los proyectos fuente</h2>
        <p>
          Si eres responsable de uno de los registros que Reunir consulta y
          quieres coordinar un acceso autorizado, ajustar la frecuencia de
          consultas, o pedir que dejemos de mostrar tu fuente, escríbenos.
          Respondemos y actuamos lo antes posible.
        </p>

        <h2>Para personas listadas o sus familias</h2>
        <p>
          Si apareces en los resultados (o aparece un familiar) y quieres que
          dejemos de mostrar ese registro en Reunir, indícanos el enlace o el
          nombre tal como aparece y lo retiramos de nuestra vista. Ten en cuenta
          que Reunir solo refleja lo que ya es público en la fuente: para que el
          dato desaparezca por completo, también conviene gestionarlo con el
          registro original.
        </p>

        <h2>Uso indebido</h2>
        <p>
          Si detectas recolección automatizada, reidentificación o cualquier uso
          que viole los <Link href="/terminos">términos de uso</Link>,
          repórtalo a la misma dirección.
        </p>

        <p className={styles.back}>
          <Link href="/">Volver a la búsqueda</Link>
        </p>
      </article>
    </main>
  );
}
