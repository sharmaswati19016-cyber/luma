"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  createResident,
  deleteResident,
  getResidentsList,
  regeneratePairingCode,
} from "../../../../lib/api";

function statusDotClass(label) {
  if (label === "Worth a check-up conversation") return "flag-dot";
  if (label === "Worth watching") return "watch-dot";
  return "steady-dot";
}

export default function ResidentsPage() {
  const [residents, setResidents] = useState([]);
  const [residentName, setResidentName] = useState("");
  const [nameError, setNameError] = useState("");
  const [pairingCodes, setPairingCodes] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);

  async function refreshResidents() {
    setResidents(await getResidentsList());
  }

  useEffect(() => {
    let active = true;
    getResidentsList()
      .then((list) => {
        if (active) setResidents(list);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Residents could not load.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadAttempt]);

  async function addOne(event) {
    event.preventDefault();
    if (submitting.current) return;
    setError("");
    setNotice("");
    if (!residentName.trim()) {
      setNameError("Please enter a name.");
      return;
    }
    setNameError("");
    submitting.current = true;
    setBusy(true);
    try {
      const created = await createResident(residentName.trim());
      if (!created) throw new Error("The resident was not added; no pairing code was returned.");
      setPairingCodes((current) => ({ ...current, [created.resident_id]: created.pairing_code }));
      setResidentName("");
      setNotice(`Resident added. Pairing code: ${created.pairing_code}`);
      await refreshResidents();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Resident could not be added.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  async function refreshCode(residentId) {
    setError("");
    setNotice("");
    try {
      const code = await regeneratePairingCode(residentId);
      setPairingCodes((current) => ({ ...current, [residentId]: code }));
      setNotice("Pairing code regenerated. Share the new code with the resident.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Pairing code could not be regenerated.");
    }
  }

  async function removeResident(resident) {
    if (!window.confirm(`Delete ${resident.name} and their check-in history?`)) return;
    setError("");
    setNotice("");
    try {
      await deleteResident(resident.resident_id);
      setNotice(`${resident.name} was deleted.`);
      await refreshResidents();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Resident could not be deleted.";
      setError(/admin|not authorized|permission/i.test(message)
        ? "Only a facility admin can delete residents. Ask your facility administrator."
        : message);
    }
  }

  return (
    <>
      <header className="staff-page-header">
        <p className="staff-eyebrow">FACILITY</p>
        <h1>All Residents</h1>
        <p>Manage your resident list and pairing codes.</p>
      </header>
      {error && <p className="staff-error" role="alert">{error}</p>}
      {notice && <p className="staff-notice" role="status">{notice}</p>}
      <section className="staff-panel resident-add-panel" id="add-resident">
        <div className="staff-card-heading">
          <div><p className="staff-eyebrow">NEW RESIDENT</p><h2>Add Resident</h2></div>
        </div>
        <form className="resident-add-form" onSubmit={addOne} noValidate>
          <label>
            Resident name
            <input
              value={residentName}
              onChange={(event) => {
                setResidentName(event.target.value);
                setNameError("");
              }}
              className={nameError ? "form-field-invalid" : ""}
              aria-invalid={Boolean(nameError)}
              aria-describedby={nameError ? "resident-name-error" : undefined}
            />
            {nameError && <span className="form-validation-error" id="resident-name-error" role="alert">{nameError}</span>}
          </label>
          <button className="staff-button" disabled={busy}>
            {busy ? "Adding..." : "Add Resident"}
          </button>
        </form>
      </section>
      <section className="staff-panel resident-table-panel">
        <div className="staff-card-heading">
          <div><p className="staff-eyebrow">FACILITY ROSTER</p><h2>Residents</h2></div>
          <span className="staff-total">{residents.length} total</span>
        </div>
        <div className="resident-list">
          {residents.map((resident, index) => (
            <article className="resident-row" key={resident.resident_id}>
              <span className={`resident-dot ${statusDotClass(resident.status_label)}`} aria-hidden="true" />
              <div className="resident-row-main">
                <Link href={`/staff/progress/${resident.resident_id}`} className="resident-name">
                  {index + 1}. {resident.name}
                </Link>
                <span className="resident-status">{resident.status_label}</span>
              </div>
              <div className="resident-code">
                <span>Pairing code</span>
                <strong>
                  {pairingCodes[resident.resident_id] ||
                    resident.pairing_code ||
                    "Not paired"}
                </strong>
              </div>
              <div className="resident-actions">
                <button className="staff-button staff-button-small" onClick={() => refreshCode(resident.resident_id)}>
                  Regenerate code
                </button>
                <button className="staff-danger-button" onClick={() => removeResident(resident)}>
                  Delete
                </button>
              </div>
            </article>
          ))}
          {loading ? (
            <p className="staff-empty">Loading residents...</p>
          ) : error ? (
            <div className="staff-empty">
              <p>Residents could not load.</p>
              <button className="staff-secondary-button" onClick={() => {
                setLoading(true);
                setError("");
                setLoadAttempt((attempt) => attempt + 1);
              }}>
                Retry
              </button>
            </div>
          ) : residents.length === 0 ? (
            <p className="staff-empty">No residents yet. Use Add a Resident to create one.</p>
          ) : null}
        </div>
      </section>
    </>
  );
}
