"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { staffLogin, staffSignUp } from "../../lib/api";

export default function AuthForm({ mode }) {
  const router = useRouter();
  const isSignup = mode === "signup";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [facilityCode, setFacilityCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      if (isSignup) {
        const result = await staffSignUp(email.trim(), password, name.trim(), facilityCode.trim());
        if (result.requiresEmailConfirmation) {
          setNotice("Account created. Confirm your email, then log in to finish linking your facility.");
          return;
        }
      } else {
        await staffLogin(email.trim(), password);
      }
      router.replace("/staff");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="staff-auth-page">
      <section className="staff-auth-card">
        <p className="staff-eyebrow">COGNITIVE CHECK-IN</p>
        <h1>{isSignup ? "SIGN UP" : "LOGIN"}</h1>
        <form onSubmit={handleSubmit}>
          {isSignup && (
            <>
              <label htmlFor="staff-name">Full name</label>
              <input
                id="staff-name"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </>
          )}
          <label htmlFor="staff-email">Email</label>
          <input
            id="staff-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <label htmlFor="staff-password">Password</label>
          <input
            id="staff-password"
            type="password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          {isSignup && (
            <>
              <label htmlFor="facility-code">Facility code</label>
              <input
                id="facility-code"
                value={facilityCode}
                onChange={(event) => setFacilityCode(event.target.value)}
                required
              />
            </>
          )}
          {error && <p className="staff-error" role="alert">{error}</p>}
          {notice && <p className="staff-notice" role="status">{notice}</p>}
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
      </section>
    </main>
  );
}
