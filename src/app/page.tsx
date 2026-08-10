import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { APP_CONFIG } from "@/config/app";
import { Database, Zap, Shield, Layers } from "lucide-react";
import { AuthButton } from "./auth-button";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b px-4 py-3 flex items-center justify-between">
        <h2 className="text-sm font-medium">{APP_CONFIG.name}</h2>
        <AuthButton />
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center gap-8 px-4 py-24">
        <Badge variant="secondary" className="text-xs tracking-wide">
          Phase 1 - Foundation
        </Badge>

        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl text-center">
          {APP_CONFIG.name}
        </h1>

        <p className="max-w-xl text-center text-muted-foreground text-base sm:text-lg">
          AI-powered platform built on Supabase. Fast, scalable, and secure.
        </p>

        <div className="flex flex-wrap justify-center gap-4 mt-2">
          <Button asChild>
            <a href="/api/health">Check Health</a>
          </Button>
          <Button variant="outline" asChild>
            <a
              href="https://supabase.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              Supabase Docs
            </a>
          </Button>
        </div>

        {/* Foundation Cards */}
        <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 w-full max-w-4xl mt-12">
          <Card className="flex flex-col items-center text-center p-6">
            <CardHeader className="p-0 pb-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Database className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="text-base mt-3">Supabase</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <p className="text-sm text-muted-foreground">
                PostgreSQL database, auth, and storage powered by Supabase.
              </p>
            </CardContent>
          </Card>

          <Card className="flex flex-col items-center text-center p-6">
            <CardHeader className="p-0 pb-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Zap className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="text-base mt-3">Next.js 16</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <p className="text-sm text-muted-foreground">
                App Router with React Server Components for optimal performance.
              </p>
            </CardContent>
          </Card>

          <Card className="flex flex-col items-center text-center p-6">
            <CardHeader className="p-0 pb-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Layers className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="text-base mt-3">TypeScript</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <p className="text-sm text-muted-foreground">
                End-to-end type safety from database to UI.
              </p>
            </CardContent>
          </Card>

          <Card className="flex flex-col items-center text-center p-6">
            <CardHeader className="p-0 pb-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="text-base mt-3">Scalable Architecture</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <p className="text-sm text-muted-foreground">
                Clean structure ready for AI modules and team growth.
              </p>
            </CardContent>
          </Card>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        {APP_CONFIG.name} v{APP_CONFIG.version}
      </footer>
    </div>
  );
}