import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "@/context/AuthContext";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

import { COMPANY } from "@/lib/company";

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
