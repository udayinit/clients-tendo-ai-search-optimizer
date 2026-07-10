import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Optimizer",
  description: "AI Optimizer",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: "#007aff",
          colorDanger: "#ff3b30",
          colorSuccess: "#34c759",
          colorWarning: "#ff9500",
          colorTextOnPrimaryBackground: "#ffffff",
          borderRadius: "10px",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        },
        elements: {
          card: "shadow-none border border-[rgba(60,60,67,0.29)]",
          formButtonPrimary: "text-[15px] font-semibold",
        },
      }}
    >
      <html lang="en">
        <body className="min-h-screen">{children}</body>
      </html>
    </ClerkProvider>
  );
}
