import { createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { BadgePercent, BookOpen, Eye, EyeOff, FileSpreadsheet, ReceiptText } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Logo } from '../components/Layout';
import { Button, Field, Input, Segmented } from '../components/ui';
import { auth } from '../lib/firebase';

function authMessage(code: string): string {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email or password is incorrect.';
    case 'auth/email-already-in-use':
      return 'An account already exists with this email. Sign in instead.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a minute and try again.';
    case 'auth/network-request-failed':
      return 'No internet connection. Check your network and retry.';
    case 'auth/operation-not-allowed':
    case 'auth/configuration-not-found':
      return 'Email/Password sign-in is not enabled. Enable it in Firebase Console → Authentication → Sign-in method.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

export default function Login() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'signin') await signInWithEmailAndPassword(auth, email.trim(), password);
      else {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
        toast.success('Account created. Welcome!');
      }
    } catch (err) {
      setError(authMessage((err as { code?: string }).code ?? ''));
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!email.trim()) {
      setError('Type your email above, then tap “Forgot password”.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      toast.success(`Password reset link sent to ${email.trim()}`);
    } catch (err) {
      setError(authMessage((err as { code?: string }).code ?? ''));
    }
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-brand p-12 text-brand-ink lg:flex">
        <img src="/logo.png" alt="bananads." className="h-10 w-auto self-start" />
        <div className="relative z-10 max-w-md">
          <h1 className="text-4xl font-bold leading-tight tracking-tight">Your books, GST and invoices — in one simple place.</h1>
          <ul className="mt-8 space-y-4 text-[15px] font-medium">
            {[
              [ReceiptText, 'Add an expense in seconds, from your phone'],
              [BadgePercent, 'GST and non-GST tracked separately'],
              [BookOpen, 'Tally-style ledgers, Day Book, P&L, Balance Sheet'],
              [FileSpreadsheet, 'Excel & PDF reports and branded invoices'],
            ].map(([Icon, text], i) => {
              const I = Icon as typeof ReceiptText;
              return (
                <li key={i} className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-black/10">
                    <I className="size-5" />
                  </span>
                  {text as string}
                </li>
              );
            })}
          </ul>
        </div>
        <p className="text-sm font-medium opacity-70">6th Floor, Hilite Business Park, Calicut, Kerala</p>
        <div className="absolute -bottom-32 -right-32 size-[28rem] rounded-full bg-black/5" />
      </div>

      <div className="flex flex-col items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo className="h-8" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-ink">{mode === 'signin' ? 'Welcome back' : 'Create your account'}</h2>
          <p className="mt-1 text-sm text-muted">
            {mode === 'signin' ? 'Sign in to continue to your books.' : 'Start tracking in under a minute.'}
          </p>

          <Segmented
            full
            className="mt-6"
            value={mode}
            onChange={(m) => {
              setMode(m);
              setError(null);
            }}
            options={[
              { value: 'signin', label: 'Sign in' },
              { value: 'signup', label: 'Create account' },
            ]}
          />

          <form onSubmit={submit} className="mt-5 space-y-4">
            <Field label="Email" htmlFor="email">
              <Input
                id="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
              />
            </Field>
            <Field
              label="Password"
              htmlFor="password"
              aside={
                mode === 'signin' && (
                  <button type="button" onClick={reset} className="text-xs font-semibold text-ink-2 hover:text-ink">
                    Forgot password?
                  </button>
                )
              }
            >
              <div className="relative">
                <Input
                  id="password"
                  type={show ? 'text' : 'password'}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••'}
                  className="pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:text-ink"
                  aria-label={show ? 'Hide password' : 'Show password'}
                >
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>
            {error && <p className="rounded-xl bg-expense-soft px-3 py-2.5 text-sm font-medium text-expense">{error}</p>}
            <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
