import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "@/context/AuthContext";
import { CalendarProvider } from "@/context/CalendarContext";
import "./globals.css";
import { PRODUCT } from "@/lib/company";

const inter = localFont({
  src: "../fonts/inter-latin-variable.woff2",
  variable: "--font-inter",
  display: "swap",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: `${PRODUCT.name}`,
  description: `${PRODUCT.name} — Nepal IRD VAT compliant POS, inventory and accounting.`,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#111827",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${inter.className} antialiased`}>
        <AuthProvider>
          <CalendarProvider>
            {children}
            <Toaster
              position="top-center"
              toastOptions={{
                className: "max-w-[calc(100vw-1.5rem)]",
                style: {
                  background: "#111827",
                  color: "#fff",
                  borderRadius: "8px",
                },
              }}
            />
          </CalendarProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
