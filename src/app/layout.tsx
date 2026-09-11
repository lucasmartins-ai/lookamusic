import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LookaMusic — You sing. LookaMusic builds the band.",
  description:
    "Browser-based real-time musical instrument. Sing into the microphone; LookaMusic detects pitch, timing and key, and builds harmony, rhythm and arrangement around your voice.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>
        <a className="skip-link" href="#main">
          Pular para o instrumento
        </a>
        {children}
      </body>
    </html>
  );
}
