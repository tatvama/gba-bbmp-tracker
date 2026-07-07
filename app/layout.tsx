import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { TopNav } from "@/components/nav/topnav";
import { Sidebar } from "@/components/nav/sidebar";
import { getSessionUser } from "@/lib/auth";
import { PageTransition } from "@/components/nav/page-transition";
import { TaskRegistryProvider } from "@/lib/jobs/client/task-registry";

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
  icons: {
    icon: "/icon.svg?v=4",
  },
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
          <TaskRegistryProvider>
            <div className="flex min-h-screen flex-col">
              <TopNav email={user?.email ?? null} role={user?.role ?? null} />
              <div className="flex flex-1">
                <Sidebar />
                <main
                  id="main-content"
                  className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 xl:px-10"
                >
                  <PageTransition>{children}</PageTransition>
                </main>
              </div>
            </div>
          </TaskRegistryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
