import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { TopNav } from "@/components/nav/topnav";
import { Sidebar } from "@/components/nav/sidebar";
import { getSessionUser } from "@/lib/auth";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: {
    default: "GBA · BBMP Ward & Engineer Tracker",
    template: "%s · GBA BBMP",
  },
  description:
    "Trace any Bengaluru locality across the 198 → 225 → 369 ward restructures and reach the responsible engineering sub-division.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();

  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <div className="flex min-h-screen flex-col">
            <TopNav email={user?.email ?? null} role={user?.role ?? null} />
            <div className="flex flex-1">
              <aside className="sticky top-13 hidden h-[calc(100vh-3.25rem)] w-56 shrink-0 overflow-y-auto border-r bg-card/80 lg:block">
                <Sidebar />
              </aside>
              <main
                id="main-content"
                className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 xl:px-10"
              >
                {children}
              </main>
            </div>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
