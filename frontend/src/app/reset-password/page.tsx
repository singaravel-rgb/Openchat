'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Card, CardContent, CardHeader } from '@/components/Card';

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [isValidating, setIsValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [validationError, setValidationError] = useState('');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!token) {
      setIsValidating(false);
      setValidationError('Missing password reset token. Please use the link provided in your email.');
      return;
    }

    const validateToken = async () => {
      try {
        const res = await fetch(`/api/v1/auth/reset-password/validate?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (res.ok && data.valid) {
          setTokenValid(true);
          setUserEmail(data.email || '');
        } else {
          setTokenValid(false);
          setValidationError(data.detail || 'This password reset link is invalid or has expired.');
        }
      } catch {
        setTokenValid(false);
        setValidationError('Unable to validate reset token. Please try again.');
      } finally {
        setIsValidating(false);
      }
    };

    validateToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (newPassword.length < 8) {
      setFormError('Password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to reset password');
      }
      setIsSuccess(true);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex items-center justify-center w-12 h-12 rounded-lg bg-blue-600">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Set new password</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            {userEmail ? `Resetting password for ${userEmail}` : 'Create a secure new password for your account'}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {isValidating ? (
            <div className="flex flex-col items-center justify-center py-8 space-y-3">
              <div className="animate-spin rounded-full h-8 w-8 border-3 border-blue-600 border-t-transparent" />
              <p className="text-xs text-slate-500">Verifying reset token...</p>
            </div>
          ) : !tokenValid ? (
            <div className="space-y-4 text-center">
              <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-lg text-rose-800 dark:text-rose-200 text-sm">
                <p className="font-semibold">Invalid or Expired Link</p>
                <p className="mt-1 text-xs">{validationError}</p>
              </div>
              <Link
                href="/forgot-password"
                className="inline-block w-full py-2 px-4 rounded-lg bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 transition"
              >
                Request a new reset link
              </Link>
              <div>
                <Link href="/login" className="text-xs text-slate-500 hover:underline">
                  Return to sign in
                </Link>
              </div>
            </div>
          ) : isSuccess ? (
            <div className="space-y-4 text-center">
              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg text-emerald-800 dark:text-emerald-200 text-sm">
                <p className="font-semibold">Password Reset Complete</p>
                <p className="mt-1 text-xs">Your password has been reset successfully. You can now sign in with your new password.</p>
              </div>
              <Button onClick={() => router.push('/login')} className="w-full">
                Sign in to your account
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {formError && (
                <div className="p-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-lg">
                  {formError}
                </div>
              )}

              <Input
                label="New Password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
                autoComplete="new-password"
              />

              <Input
                label="Confirm New Password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your new password"
                required
                autoComplete="new-password"
              />

              <Button type="submit" className="w-full" disabled={isSubmitting || !newPassword || !confirmPassword}>
                {isSubmitting ? 'Resetting password...' : 'Update password'}
              </Button>

              <div className="text-center pt-2">
                <Link href="/login" className="text-xs text-slate-500 hover:underline">
                  Cancel and return to sign in
                </Link>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent" /></div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}
