import type { Metadata } from "next";
import { Schibsted_Grotesk } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import BrandTheme from "@/components/BrandTheme";
import DataBanner from "@/components/DataBanner";
import LocalDataMigration from "@/components/LocalDataMigration";
import { THEME_SCRIPT } from "@/components/theme-script";

const schibsted = Schibsted_Grotesk({
  variable: "--font-schibsted",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Gerador de Posts Institucionais",
  description: "Gera arte com layout travado e legenda profissional para redes sociais, no tamanho certo de cada formato.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${schibsted.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <BrandTheme />
        <div className="app">
          <Sidebar />
          <div className="app-main">
            <DataBanner />
            <LocalDataMigration />
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
