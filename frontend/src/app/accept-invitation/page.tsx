'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authApi } from '@/lib/api';
import { Card, CardContent, CardHeader } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Badge } from '@/components/Badge';

function AcceptInvitationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invitationInfo, setInvitationInfo] = useState<{
    email: string;
    role: string;
    expires_at: string;
  } | null>(null);

  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Missing invitation token. Please check your invitation link.');
      setIsLoading(false);
      return;
    }

    const inspect = async () => {
      try {
        const info = await authApi.inspectInvitation(token);
        setInvitationInfo(info);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Invalid or expired invitation token.');
      } finally {
        setIsLoading(false);
      }
    };

    inspect();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !invitationInfo) return;

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const authResult = await authApi.acceptInvitation({
        token,
        full_name: fullName.trim(),
        password,
      });

      localStorage.setItem('access_token', authResult.access_token);

      // Redirect to appropriate portal based on role with full reload to re-hydrate AuthContext
      if (invitationInfo.role === 'agent') {
        window.location.href = '/agent';
      } else {
        window.location.href = '/admin';
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept invitation.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex items-center justify-center w-12 h-12 rounded-lg bg-blue-600 text-white font-bold text-xl">
            OC
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Accept Invitation</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Set up your account to join OpenChat</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-lg">
              {error}
            </div>
          )}

          {invitationInfo && (
            <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs space-y-1">
              <div>
                <span className="text-slate-500">Email:</span>{' '}
                <strong className="text-slate-900 dark:text-white">{invitationInfo.email}</strong>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">Role:</span>
                <Badge variant={invitationInfo.role === 'super_admin' ? 'default' : 'info'}>
                  {invitationInfo.role.replace('_', ' ').toUpperCase()}
                </Badge>
              </div>
            </div>
          )}

          {invitationInfo && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Full Name
                </label>
                <Input
                  required
                  placeholder="Your full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Create Password (min 8 characters)
                </label>
                <Input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Confirm Password
                </label>
                <Input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full"
                />
              </div>

              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting ? 'Setting up account...' : 'Complete Account Setup'}
              </Button>
            </form>
          )}

          {!invitationInfo && !isLoading && (
            <div className="text-center pt-2">
              <Button variant="outline" onClick={() => router.push('/login')}>
                Return to Login
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent" /></div>}>
      <AcceptInvitationContent />
    </Suspense>
  );
}
