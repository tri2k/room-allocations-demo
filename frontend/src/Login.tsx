import { FormEvent, useEffect, useState } from "react";
import { ApiError, getAuthConfig, loginDev, type AuthConfig, type AuthUser } from "./lib/api";

const ERROR_COPY: Record<string, string> = {
  state_mismatch: "Sign-in expired. Try Continue with Google again.",
  missing_code: "Google did not return a sign-in code. Try again.",
  token_failed: "Could not finish Google sign-in. Try again.",
  email_unverified: "Google must verify that email before you can sign in.",
  not_configured: "Google sign-in is not configured on this server.",
  email_conflict: "That email is already tied to a different Google account."
};

type LoginProps = {
  onSignedIn: (user: AuthUser) => void;
};

function Login({ onSignedIn }: LoginProps) {
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get("error");
    if (fromQuery && ERROR_COPY[fromQuery]) {
      setError(ERROR_COPY[fromQuery]);
    } else if (fromQuery) {
      setError("Sign-in failed. Try again.");
    }
    void getAuthConfig()
      .then(setConfig)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Could not load sign-in options");
      });
  }, []);

  const onDevLogin = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const user = await loginDev({ email });
      window.history.replaceState({}, "", `${window.location.pathname}${window.location.hash}`);
      onSignedIn(user);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.detail : err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="boot-screen login-screen">
      <h1>Room Allocations</h1>
      <p>Sign in to open the schedule.</p>
      {error ? <p className="catalog-error">{error}</p> : null}
      {config?.googleEnabled ? (
        <a className="reset-button" href="/api/v1/auth/google/start">
          Continue with Google
        </a>
      ) : (
        <p className="login-hint">Google sign-in is not configured. Use a Google client on localhost, or enable dev sign-in.</p>
      )}
      {config?.devAuth ? (
        <form className="login-dev-form" onSubmit={(event) => void onDevLogin(event)}>
          <label>
            Dev email
            <input
              type="email"
              required
              value={email}
              onChange={(change) => setEmail(change.target.value)}
              autoComplete="username"
            />
          </label>
          <button className="reset-button" type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Dev sign in"}
          </button>
        </form>
      ) : null}
    </div>
  );
}

export default Login;
