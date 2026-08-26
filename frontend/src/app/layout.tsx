import type { Metadata } from "next";
import { Sidebar } from "@/components/sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "OfferFlow - AI Job Operating System",
  description: "Your personal AI Native Job Search OS",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh">
      <body className="antialiased">
        <div className="flex h-screen bg-background">
          {/* Sidebar Navigation */}
          <Sidebar />

          {/* Main Content Area */}
          <main className="flex-1 overflow-hidden relative bg-[#fafafa]">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
