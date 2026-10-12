import type { Metadata, Viewport } from "next";
import { Poppins, Zilla_Slab, Manrope } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/lib/i18n/provider";
import { Splash } from "@/components/splash";

// latin-ext carries the Turkish glyphs (ğ ı İ ş ç ö ü) — without it Turkish
// text falls back mid-word and looks broken. next/font self-hosts the files at
// build time, so there is no runtime request to Google and it works offline.
const poppins = Poppins({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

// Wordmark faces (brand board): Zilla Slab for "MARS", Manrope for "TECHNICAL".
const zillaSlab = Zilla_Slab({ subsets: ["latin"], weight: ["700"], variable: "--font-slab", display: "swap" });
const manrope = Manrope({ subsets: ["latin"], weight: ["800"], variable: "--font-manrope", display: "swap" });

export const metadata: Metadata = {
  title: "Mars Technical",
  description: "Mars Med Dent — customers, spare parts, and engineer tasks.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Mars Technical",
  },
  // ?v=2 is deliberate. Odoo was served from this same hostname before this
  // app, and Chrome had cached its icon for the origin — including inside
  // already-installed PWAs, which pin their icon at install time. Changing the
  // URL is what makes Chrome fetch the icon again instead of reusing that.
  // Bump the version if the icons are ever redrawn (v=4: Mars Technical logo).
  icons: {
    icon: [
      { url: "/favicon.ico?v=4", sizes: "any" },
      { url: "/icons/icon-192.png?v=4", type: "image/png", sizes: "192x192" },
    ],
    apple: "/icons/icon-192.png?v=4",
  },
};

export const viewport: Viewport = {
  themeColor: "#323490",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

// Applies the saved accent/mode/background from localStorage before paint
// (no flash). Background is a global, owner-set value cached on this device.
const themeScript = `(function(){try{
  var el=document.documentElement;
  var a=localStorage.getItem('theme_accent');
  var m=localStorage.getItem('theme_mode');
  if(a){el.setAttribute('data-accent',a);}
  el.setAttribute('data-mode', m==='dark' ? 'dark' : 'light');
  var bg=localStorage.getItem('bg_style');
  var blur=localStorage.getItem('bg_blur');
  el.setAttribute('data-bg', bg==='wallpaper' ? 'wallpaper' : 'solid');
  if(blur){el.style.setProperty('--bg-blur', (Number(blur)/100*30)+'px');}
}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${poppins.variable} ${zillaSlab.variable} ${manrope.variable}`} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <Splash />
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
