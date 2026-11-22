import { useRef, useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/apiClient';
import { ErrorBanner } from '../components/ErrorBanner';
import { FormField } from '../components/FormField';
import { MESSAGES } from '../validation/messages';
import {
  validateEmail,
  validatePasswordLogin,
  validatePasswordPolicy,
} from '../validation/rules';
import { mapDetailsToFields, messageFromError } from '../validation/serverErrors';

type Mode = 'login' | 'register';

interface FieldErrors {
  email?: string;
  password?: string;
}

interface LocationState {
  message?: string;
}

export function LoginPage() {
  const auth = useAuth();
  const location = useLocation();
  const state = (location.state ?? null) as LocationState | null;

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<string | null>(state?.message ?? null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  // Signed in (after login or registration, or already): always go to the playbook page.
  if (auth.status === 'authenticated') {
    return <Navigate to="/playbooks" replace />;
  }

  function switchMode(next: Mode) {
    setMode(next);
    setBanner(null);
    setFieldErrors({});
  }

  function handleServerError(err: unknown) {
    if (err instanceof ApiError) {
      if (err.code === 'VALIDATION_ERROR' && err.details.length > 0) {
        const mapped = mapDetailsToFields(err.details, ['email', 'password']);
        setFieldErrors(mapped.fieldErrors);
        if (mapped.unmatched.length > 0) setBanner(mapped.unmatched[0]);
        return;
      }
      if (err.code === 'EMAIL_TAKEN') {
        setFieldErrors({ email: err.message });
        return;
      }
    }
    setBanner(messageFromError(err));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;

    setBanner(null);
    const errors: FieldErrors = {};
    const emailError = validateEmail(email);
    if (emailError) errors.email = emailError;
    const passwordError =
      mode === 'login' ? validatePasswordLogin(password) : validatePasswordPolicy(password);
    if (passwordError) errors.password = passwordError;

    setFieldErrors(errors);
    if (errors.email || errors.password) return;

    submittingRef.current = true;
    setSubmitting(true);
    try {
      const trimmedEmail = email.trim();
      if (mode === 'login') {
        await auth.login(trimmedEmail, password);
      } else {
        await auth.register(trimmedEmail, password);
      }
      // On success the user is set; the Navigate above redirects.
    } catch (err) {
      handleServerError(err);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const isRegister = mode === 'register';

  return (
    <div className="auth-page">
      <section className="card auth-card">
        <header className="card__header">
          <h1 className="card__title">Login / Register</h1>
        </header>
        <div className="card__body">
          <ErrorBanner message={banner} />
          <form noValidate onSubmit={handleSubmit}>
            <FormField
              label="Email"
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={fieldErrors.email}
            />
            <FormField
              label="Password"
              id="password"
              type="password"
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={fieldErrors.password}
              hint={isRegister ? MESSAGES.passwordPolicyHint : undefined}
            />
            <div className="auth-card__submit">
              <button type="submit" className="btn btn--primary btn--block" disabled={submitting}>
                {isRegister ? 'Create account' : 'Log in'}
              </button>
            </div>
          </form>
          <div className="auth-card__modes" role="group" aria-label="Mode">
            <button
              type="button"
              className="btn btn--link"
              aria-pressed={mode === 'login'}
              onClick={() => switchMode('login')}
            >
              Login
            </button>
            <button
              type="button"
              className="btn btn--link"
              aria-pressed={mode === 'register'}
              onClick={() => switchMode('register')}
            >
              Register
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
