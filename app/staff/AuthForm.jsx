"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { staffLogin, staffSignUp } from "../../lib/api";
import Logo from "../../src/components/shared/Logo";

export default function AuthForm({ mode }) {
  const router = useRouter();
  const isSignup = mode === "signup";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [facilityCode, setFacilityCode] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [showLoginLink, setShowLoginLink] = useState(false);
  const [busy, setBusy] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);

  function clearFieldError(field) {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setShowLoginLink(false);
    const nextErrors = {};
    if (!email.trim()) nextErrors.email = "Please enter your email.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      nextErrors.email = "Please enter a valid email.";
    }
    if (!password) nextErrors.password = "Please enter your password.";
    else if (password.length < 6) {
      nextErrors.password = "Password must be at least 6 characters.";
    }
    if (isSignup && !name.trim()) nextErrors.name = "Please enter your full name.";
    if (isSignup && !facilityCode.trim()) {
      nextErrors.facilityCode = "Please enter your facility code.";
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setBusy(true);
    try {
      if (isSignup) {
        await staffSignUp(email.trim(), password, name.trim(), facilityCode.trim());
      } else {
        await staffLogin(email.trim(), password);
      }
      router.replace("/staff");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      if (isSignup && /this email is already registered/i.test(message)) {
        setShowLoginLink(true);
        setError("This email is already registered. Please log in instead.");
      } else if (/email or password is incorrect/i.test(message)) {
        setError("Email or password is incorrect.");
      } else if (/email isn't confirmed yet/i.test(message)) {
        setError("Your email isn't confirmed yet. Please check your inbox, or ask your administrator to confirm it.");
      } else if (/facility code is not valid/i.test(message)) {
        setError("That facility code is not valid.");
      } else if (/password.*at least 6 characters/i.test(message)) {
        setError("Password must be at least 6 characters.");
      } else if (/confirm email is still on/i.test(message)) {
        setError("Confirm email is still on in Supabase. Turn it off for testing.");
      } else {
        console.warn("Staff authentication failed:", cause);
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="staff-auth-page">
      <section className="staff-auth-card">
        <h1>{isSignup ? "SIGN UP" : "LOGIN"}</h1>
        <form onSubmit={handleSubmit} noValidate>
          {isSignup && (
            <>
              <label htmlFor="staff-name">Full name</label>
              <input
                id="staff-name"
                autoComplete="name"
                value={name}
                className={fieldErrors.name ? "form-field-invalid" : ""}
                aria-invalid={Boolean(fieldErrors.name)}
                aria-describedby={fieldErrors.name ? "staff-name-error" : undefined}
                onChange={(event) => {
                  setName(event.target.value);
                  clearFieldError("name");
                }}
              />
              {fieldErrors.name && <p className="form-validation-error" id="staff-name-error" role="alert">{fieldErrors.name}</p>}
            </>
          )}
          <label htmlFor="staff-email">Email</label>
          <input
            id="staff-email"
            type="email"
            autoComplete="email"
            value={email}
            className={fieldErrors.email ? "form-field-invalid" : ""}
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? "staff-email-error" : undefined}
            onChange={(event) => {
              setEmail(event.target.value);
              clearFieldError("email");
            }}
          />
          {fieldErrors.email && <p className="form-validation-error" id="staff-email-error" role="alert">{fieldErrors.email}</p>}
          <label htmlFor="staff-password">Password</label>
          <div className="password-field">
            <input
              id="staff-password"
              type={passwordVisible ? "text" : "password"}
              autoComplete={isSignup ? "new-password" : "current-password"}
              minLength={6}
              value={password}
              className={fieldErrors.password ? "form-field-invalid" : ""}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? "staff-password-error" : undefined}
              onChange={(event) => {
                setPassword(event.target.value);
                clearFieldError("password");
              }}
            />
            <button
              className="password-toggle"
              type="button"
              aria-label={passwordVisible ? "Hide password" : "Show password"}
              onClick={() => setPasswordVisible((visible) => !visible)}
            >
              {passwordVisible ? (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8" />
                  <path d="M9.9 5.2A10.7 10.7 0 0112 5c5 0 8.5 4.3 9.5 7-.4 1.1-1.3 2.4-2.5 3.5M6.2 6.2C3.9 7.6 2.7 9.6 2.5 12c.4 1.1 1.3 2.4 2.5 3.5A10 10 0 0012 19c1 0 1.9-.2 2.8-.5" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
          {fieldErrors.password && <p className="form-validation-error" id="staff-password-error" role="alert">{fieldErrors.password}</p>}
          {isSignup && (
            <>
              <label htmlFor="facility-code">Facility code</label>
              <input
                id="facility-code"
                placeholder="SUNRISE01"
                value={facilityCode}
                className={fieldErrors.facilityCode ? "form-field-invalid" : ""}
                aria-invalid={Boolean(fieldErrors.facilityCode)}
                aria-describedby={fieldErrors.facilityCode ? "facility-code-error" : undefined}
                onChange={(event) => {
                  setFacilityCode(event.target.value);
                  clearFieldError("facilityCode");
                }}
              />
              {fieldErrors.facilityCode && <p className="form-validation-error" id="facility-code-error" role="alert">{fieldErrors.facilityCode}</p>}
              <p>Use the facility code provided by your care team.</p>
            </>
          )}
          {error && (
            <p className="staff-error" role="alert">
              {error}
              {showLoginLink && <> <Link href="/staff/login">Go to login</Link></>}
            </p>
          )}
          <button className="staff-button" type="submit" disabled={busy}>
            {busy ? "Please wait..." : isSignup ? "Create account" : "Log in"}
          </button>
        </form>
        <p className="staff-auth-switch">
          {isSignup ? "Already have an account?" : "New to the dashboard?"}{" "}
          <Link href={isSignup ? "/staff/login" : "/staff/signup"}>
            {isSignup ? "Log in" : "Sign up"}
          </Link>
        </p>
        <Link className="staff-auth-back" href="/role">← Back</Link>
        <Logo variant="mark" className="staff-auth-logo" />
      </section>
    </main>
  );
}
