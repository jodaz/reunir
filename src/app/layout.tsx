import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import QueryProvider from "@/components/providers/QueryProvider";

export const metadata: Metadata = {
  title: "Reunir",
  description:
    "Búsqueda unificada de personas desaparecidas — terremoto Venezuela 2026.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>
        <QueryProvider>{children}</QueryProvider>
        <footer
          style={{
            textAlign: "center",
            padding: "1.5rem 1rem",
            fontSize: "0.85rem",
            opacity: 0.7,
          }}
        >
          <Link href="/terminos">Términos de uso</Link>
          {" · "}
          <Link href="/contacto">Contacto y bajas</Link>
        </footer>
      </body>
    </html>
  );
}
