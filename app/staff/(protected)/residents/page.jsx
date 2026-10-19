"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  addResidentsBulk,
  deleteResident,
  getResidentsList,
  regeneratePairingCode,
} from "../../../../lib/api";

function parseCsvRow(row) {
  const values = [];
  let value = "";
  let inQuotes = false;
  for (let index = 0; index < row.length; index += 1) {
    const character = row[index];
    if (character === '"' && row[index + 1] === '"' && inQuotes) {
      value += '"';
      index += 1;
    } else if (character === '"') {
      inQuotes = !inQuotes;
    } else if (character === "," && !inQuotes) {
      values.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value.trim());
  return values;
}

function parseResidentsCsv(text) {
  const rows = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((row) => row.trim());
  if (rows.length < 2) throw new Error("The CSV must include a header and at least one resident.");
  const headers = parseCsvRow(rows[0]).map((header) => header.toLowerCase());
  const nameIndex = headers.indexOf("name");
  const ageIndex = headers.indexOf("age");
  if (nameIndex < 0 || ageIndex < 0) {
    throw new Error("The CSV must have name and age columns.");
  }
  return rows.slice(1).map((row, index) => {
    const fields = parseCsvRow(row);
    const age = Number(fields[ageIndex]);
    if (!fields[nameIndex] || !Number.isInteger(age) || age < 1) {
      throw new Error(`Row ${index + 2} needs a name and a valid age.`);
    }
    return { name: fields[nameIndex], age };
  });
}

function statusDotClass(label) {
  if (label === "Worth a check-up conversation") return "flag-dot";
  if (label === "Worth watching") return "watch-dot";
  return "steady-dot";
}

export default function ResidentsPage() {
  const [residents, setResidents] = useState([]);
  const [residentName, setResidentName] = useState("");
  const [residentAge, setResidentAge] = useState("");
  const [pairingCodes, setPairingCodes] = useState({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

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
      });
    return () => {
      active = false;
    };
  }, []);

  async function addOne(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const age = Number(residentAge);
      if (!Number.isInteger(age) || age < 1) throw new Error("Enter a valid age.");
      const created = await addResidentsBulk([{ name: residentName.trim(), age }]);
      setPairingCodes((current) => ({ ...current, [created[0].resident_id]: created[0].pairing_code }));
      setResidentName("");
      setResidentAge("");
      setNotice("Resident added. Age is not stored by the current backend schema.");
      await refreshResidents();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Resident could not be added.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadSheet(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const entries = parseResidentsCsv(await file.text());
      const created = await addResidentsBulk(entries);
      setPairingCodes((current) => ({
        ...current,
        ...Object.fromEntries(created.map((resident) => [resident.resident_id, resident.pairing_code])),
      }));
      setNotice(`${created.length} resident${created.length === 1 ? "" : "s"} added. Age is not stored by the current backend schema.`);
      await refreshResidents();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The sheet could not be uploaded.");
      try {
        await refreshResidents();
      } catch (refreshError) {
        setError(`${cause instanceof Error ? cause.message : "The sheet could not be uploaded."} ${refreshError instanceof Error ? refreshError.message : ""}`);
      }
    } finally {
      setBusy(false);
      event.target.value = "";
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
      setError(cause instanceof Error ? cause.message : "Resident could not be deleted.");
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
      <section className="staff-panel resident-add-panel">
        <div className="staff-card-heading">
          <div><p className="staff-eyebrow">NEW RESIDENT</p><h2>Add Resident</h2></div>
        </div>
        <form className="resident-add-form" onSubmit={addOne}>
          <label>
            Name
            <input value={residentName} onChange={(event) => setResidentName(event.target.value)} required />
          </label>
          <label>
            Age
            <input
              type="number"
              min="1"
              max="125"
              value={residentAge}
              onChange={(event) => setResidentAge(event.target.value)}
              required
            />
          </label>
          <button className="staff-button" disabled={busy}>Add Resident</button>
        </form>
        <p className="staff-help">
          The current database stores resident names only; age is collected here but is not saved.
        </p>
        <label className="sheet-upload">
          Upload a CSV sheet (columns: name, age)
          <input type="file" accept=".csv,text/csv" onChange={uploadSheet} disabled={busy} />
        </label>
        <p className="staff-help">
          Bulk upload calls the existing create-resident RPC for each row. If a request fails partway through, some residents may already have been added.
        </p>
      </section>
      <section className="staff-panel resident-table-panel">
        <div className="staff-card-heading">
          <div><p className="staff-eyebrow">FACILITY ROSTER</p><h2>Residents</h2></div>
          <span className="staff-total">{residents.length} total</span>
        </div>
        <div className="resident-list">
          {residents.map((resident) => (
            <article className="resident-row" key={resident.resident_id}>
              <span className={`resident-dot ${statusDotClass(resident.status_label)}`} aria-hidden="true" />
              <div className="resident-row-main">
                <Link href={`/staff/progress/${resident.resident_id}`} className="resident-name">
                  {resident.name}
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
          {residents.length === 0 && <p className="staff-empty">No residents to display.</p>}
        </div>
      </section>
    </>
  );
}
