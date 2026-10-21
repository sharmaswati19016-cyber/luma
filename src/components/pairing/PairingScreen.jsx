"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { getResidentName, pairDevice } from "../../../lib/api";
import { saveResidentId, saveResidentName } from "../../../lib/resident";
import Logo from "../shared/Logo";
import "./PairingScreen.css";

export default function PairingScreen({ onPaired }) {
  const [digits, setDigits] = useState(Array(6).fill(""));
  const [error, setError] = useState("");
  const [validationError, setValidationError] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRefs = useRef([]);
  const pairingCode = digits.join("");

  function updateDigit(index, value) {
    const next = [...digits];
    next[index] = value.replace(/\D/g, "").slice(-1);
    setDigits(next);
    setValidationError("");
    if (next[index] && index < 5) inputRefs.current[index + 1]?.focus();
  }

  function pasteCode(event) {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    event.preventDefault();
    setDigits(Array.from({ length: 6 }, (_, index) => pasted[index] || ""));
    setValidationError("");
    inputRefs.current[Math.min(pasted.length, 5)]?.focus();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (pairingCode.length !== 6) {
      setValidationError("Please enter all 6 digits.");
      return;
    }
    setValidationError("");
    setSaving(true);

    try {
      const residentId = await pairDevice(pairingCode);
      saveResidentId(residentId);
      let name = "";
      try {
        name = (await getResidentName(residentId)) || "";
      } catch {
        name = "";
      }
      if (name) saveResidentName(name);
      onPaired(residentId);
    } catch (cause) {
      console.warn("Resident device pairing failed:", cause);
      setError("That code didn't work. Please ask the staff.");
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
        <form onSubmit={handleSubmit} noValidate>
          <label id="pairing-code-label">Pairing code</label>
          <div className="pairing-digits" role="group" aria-labelledby="pairing-code-label" onPaste={pasteCode}>
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={(element) => { inputRefs.current[index] = element; }}
                aria-label={`Pairing code digit ${index + 1}`}
                aria-invalid={Boolean(validationError)}
                aria-describedby={validationError ? "pairing-code-error" : undefined}
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
                className={validationError ? "form-field-invalid" : ""}
              />
            ))}
          </div>
          {validationError && <p className="form-validation-error" id="pairing-code-error" role="alert">{validationError}</p>}
          {error && <p className="form-validation-error" role="alert">{error}</p>}
          <button type="submit" disabled={saving}>
            {saving ? "Connecting..." : "Continue"}
          </button>
        </form>
        <Link className="pairing-back" href="/role">← Back</Link>
      </section>
    </main>
  );
}
