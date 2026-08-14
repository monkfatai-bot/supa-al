"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ConfirmPage() {
  const router = useRouter();

  useEffect(() => {
    // Small delay to ensure cookies are fully set
    const timer = setTimeout(() => {
      // Redirect to chat - middleware will verify session
      // If session not set, middleware will redirect back to login
      router.push("/chat");
    }, 500);

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="flex h-screen items-center justify-center bg-gradient-to-br from-slate-950 to-slate-800">
      <div className="text-center space-y-4">
        <div className="animate-spin h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto" />
        <h1 className="text-2xl font-bold text-white">Confirming your email...</h1>
        <p className="text-slate-400">Please wait while we set up your account.</p>
      </div>
    </div>
  );
}
