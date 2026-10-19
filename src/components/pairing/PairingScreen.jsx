"use client";

import { useState } from "react";
import { pairDevice } from "../../../lib/api";
import { saveResidentId } from "../../../lib/resident";
import "./PairingScreen.css";

export default function PairingScreen({ onPaired }) {
  const [pairingCode, setPairingCode] = useState("");
  const [residentName, setResidentName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSaving(true);

    try {
      const { residentId } = await pairDevice(pairingCode);
      const name = residentName.trim();
      saveResidentId(residentId, name);
      onPaired(residentId, name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Pairing failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="pairing-screen">
      <section className="pairing-card">
        <div className="pairing-sun" aria-hidden="true">☼</div>
        <p className="pairing-eyebrow">COGNITIVE CHECK-IN</p>
        <h1>Welcome</h1>
        <p className="pairing-description">
          Enter the six-digit code your care team gave you.
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
          <label htmlFor="pairing-code">Pairing code</label>
          <input
            id="pairing-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            value={pairingCode}
            onChange={(event) =>
              setPairingCode(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
            required
          />
          {error && <p className="pairing-error" role="alert">{error}</p>}
          <button type="submit" disabled={saving || pairingCode.length !== 6}>
            {saving ? "Connecting..." : "Connect this device"}
          </button>
        </form>
        <p className="pairing-note">
          Your name is saved on this device so we can greet you.
        </p>
      </section>
    </main>
  );
}
