'use client';


import { Suspense } from 'react';
import { AgentLayout } from '@/components/AgentLayout';


/**
 * The agent shell (navigation rail + the single global header) is mounted here,
 * once per route, so client-side navigation between agent pages replaces the
 * content instead of stacking a second header/sidebar on top of the first.
 */
export default function AgentLayoutWrapper({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-950">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      }
    >
      <AgentLayout>{children}</AgentLayout>
    </Suspense>
  );
}