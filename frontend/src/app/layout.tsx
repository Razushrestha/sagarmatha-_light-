import type { Metadata } from "next";
import localFont from "next/font/local";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "@/context/AuthContext";
import "./globals.css";
import { COMPANY } from "@/lib/company";

const inter = localFont({
  src: "../fonts/inter-latin-variable.woff2",
  variable: "--font-inter",
  display: "swap",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: `${COMPANY.name} - ERP`,
  description: `Complete ERP system for ${COMPANY.name} - Nepal IRD VAT Compliant`,
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
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: "#111827",
                color: "#fff",
                borderRadius: "8px",
              },
            }}
          />
        </AuthProvider>
      </body>
    </html>
  );
}
