"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { pairDevice } from "../../../lib/api";
import { saveResidentId } from "../../../lib/resident";
import { saveResident } from "../../../lib/residentSession";
import Logo from "../shared/Logo";
import "./PairingScreen.css";

export default function PairingScreen({ onPaired }) {
  const [digits, setDigits] = useState(Array(6).fill(""));
  const [residentName, setResidentName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRefs = useRef([]);
  const pairingCode = digits.join("");

  function updateDigit(index, value) {
    const next = [...digits];
    next[index] = value.replace(/\D/g, "").slice(-1);
    setDigits(next);
    if (next[index] && index < 5) inputRefs.current[index + 1]?.focus();
  }

  function pasteCode(event) {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    event.preventDefault();
    setDigits(Array.from({ length: 6 }, (_, index) => pasted[index] || ""));
    inputRefs.current[Math.min(pasted.length, 5)]?.focus();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSaving(true);

    try {
      const residentId = await pairDevice(pairingCode);
      const name = residentName.trim();
      saveResidentId(residentId);
      saveResident({ id: residentId, name });
      onPaired(residentId, name);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      setError(/invalid pairing code/i.test(message)
        ? "That code didn't work. Check the six digits with your care team and try again."
        : "We couldn't connect just now. Check the connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="pairing-screen">
      <section className="pairing-card">
        <Logo variant="mark" className="pairing-logo" />
        <h1>Enter your code</h1>
        <p className="pairing-description">
          Ask the staff for your 6 digit pairing code.
        </p>
        <form onSubmit={handleSubmit}>
          <label htmlFor="resident-name">Your name</label>
          <input
            id="resident-name"
            autoComplete="name"
            value={residentName}
            onChange={(event) => setResidentName(event.target.value)}
            required
          />
          <label id="pairing-code-label">Pairing code</label>
          <div className="pairing-digits" role="group" aria-labelledby="pairing-code-label" onPaste={pasteCode}>
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={(element) => { inputRefs.current[index] = element; }}
                aria-label={`Pairing code digit ${index + 1}`}
                type="text"
                inputMode="numeric"
                autoComplete={index === 0 ? "one-time-code" : "off"}
                pattern="[0-9]*"
                maxLength={1}
                value={digit}
                onChange={(event) => updateDigit(index, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Backspace" && !digits[index] && index > 0) {
                    inputRefs.current[index - 1]?.focus();
                  }
                }}
                required
              />
            ))}
          </div>
          {error && <p className="pairing-error" role="alert">{error}</p>}
          <button type="submit" disabled={saving || pairingCode.length !== 6}>
            {saving ? "Connecting..." : "Continue"}
          </button>
        </form>
        <Link className="pairing-back" href="/role">← Back</Link>
      </section>
    </main>
  );
}
