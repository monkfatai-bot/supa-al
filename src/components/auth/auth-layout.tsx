"use client";

import Link from "next/link";
import { APP_CONFIG } from "@/config/app";

interface AuthLayoutProps {
  children: React.ReactNode;
  title: string;
  description: string;
  footer?: React.ReactNode;
}

export function AuthLayout({ children, title, description, footer }: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        {/* Branding */}
        <div className="text-center space-y-2">
          <Link href="/" className="inline-block">
            <h1 className="text-2xl font-bold tracking-tight">
              {APP_CONFIG.name}
            </h1>
          </Link>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>

        {/* Form Card */}
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <div className="mt-6">{children}</div>
        </div>

        {/* Footer */}
        {footer && (
          <div className="text-center text-sm text-muted-foreground">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
