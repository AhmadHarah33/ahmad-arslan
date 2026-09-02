import type { Metadata, Viewport } from "next";
import "./globals.css";

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
    <html lang="en">
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {children}
      </body>
    </html>
  );
}
