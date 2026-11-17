'use client';

import { Suspense } from 'react';

/**
 * Route-level suspense boundary only. The application shell (sidebar + the single
 * global header) is owned by app/agent/layout.tsx and app/admin/layout.tsx so a
 * page can never mount a second shell.
 */
export default function AdminSettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-950">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}