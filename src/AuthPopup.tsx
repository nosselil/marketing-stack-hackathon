import { useState } from "react";
import { supabase } from "./supabase";

type AuthPopupProps = {
  onClose: () => void;
  onAuthenticated: () => void;
};

export function AuthPopup({ onClose, onAuthenticated }: AuthPopupProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  async function handleGoogleLogin() {
    setIsLoading(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) {
      setMessage(error.message);
      setIsError(true);
    }
    setIsLoading(false);
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setMessage("Please enter email and password.");
      setIsError(true);
      return;
    }

    setIsLoading(true);
    setMessage("");
    setIsError(false);

    // Try to sign in first
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password.trim(),
    });

    if (!signInError) {
      // Login successful
      setMessage("Logged in!");
      setIsError(false);
      setTimeout(() => onAuthenticated(), 500);
      setIsLoading(false);
      return;
    }

    // If invalid credentials, try to sign up
    if (signInError.message.includes("Invalid login credentials")) {
      const { error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password: password.trim(),
        options: {
          emailRedirectTo: window.location.origin,
        },
      });

      if (signUpError) {
        setMessage(signUpError.message);
        setIsError(true);
      } else {
        // Try to sign in immediately after signup (works if email confirmation is disabled)
        const { error: autoSignInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password.trim(),
        });
        if (!autoSignInError) {
          setMessage("Account created!");
          setIsError(false);
          setTimeout(() => onAuthenticated(), 500);
          setIsLoading(false);
          return;
        }
        // If auto-signin fails (email confirmation required), show the message
        setMessage("Account created! Check your email for a confirmation link.");
        setIsError(false);
      }
    } else {
      setMessage(signInError.message);
      setIsError(true);
    }

    setIsLoading(false);
  }

  return (
    <div className="auth-overlay" onClick={onClose}>
      <div className="auth-popup glass-card" onClick={(e) => e.stopPropagation()}>
        <button className="auth-close" onClick={onClose} type="button">
          &times;
        </button>
        <h2 className="auth-title">Sign in to post</h2>
        <p className="auth-subtitle">Log in or create an account to publish your content.</p>

        <button
          className="auth-google-button"
          onClick={handleGoogleLogin}
          disabled={isLoading}
          type="button"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" />
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853" />
            <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
          </svg>
          Continue with Google
        </button>

        <div className="auth-divider">
          <span>or</span>
        </div>

        <form onSubmit={handleEmailSubmit} className="auth-form">
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="auth-input"
            autoComplete="email"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="auth-input"
            autoComplete="current-password"
            minLength={6}
          />
          <button className="auth-submit" type="submit" disabled={isLoading}>
            {isLoading ? "Please wait..." : "Continue with email"}
          </button>
        </form>

        {message && (
          <p className={`auth-message ${isError ? "auth-error" : "auth-success"}`}>
            {message}
          </p>
        )}

        <p className="auth-footer">
          New here? Just enter your email and password — we'll create your account and send a confirmation.
        </p>
      </div>
    </div>
  );
}
