import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/lib/i18n/provider";

// latin-ext carries the Turkish glyphs (ğ ı İ ş ç ö ü) — without it Turkish
// text falls back mid-word and looks broken. next/font self-hosts the files at
// build time, so there is no runtime request to Google and it works offline.
const poppins = Poppins({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Mars Technical Support",
  description: "Mars Med Dent — customers, spare parts, and engineer tasks.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Mars Support",
  },
  // ?v=2 is deliberate. Odoo was served from this same hostname before this
  // app, and Chrome had cached its icon for the origin — including inside
  // already-installed PWAs, which pin their icon at install time. Changing the
  // URL is what makes Chrome fetch the icon again instead of reusing that.
  // Bump the version if the icons are ever redrawn.
  icons: {
    icon: "/icons/icon-192.png?v=2",
    apple: "/icons/icon-192.png?v=2",
  },
};

export const viewport: Viewport = {
  themeColor: "#0284c7",
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
    <html lang="en" className={poppins.variable}>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
