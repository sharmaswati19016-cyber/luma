"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getResidentsList } from "../../../../lib/api";

export default function ProgressPage() {
  const [residents, setResidents] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getResidentsList()
      .then((list) => {
        if (active) setResidents(list);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Resident progress could not load.");
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <header className="staff-page-header">
        <p className="staff-eyebrow">WEEKLY TRENDS</p>
        <h1>Resident Progress</h1>
        <p>Select a resident to view check-in history and mark an off day.</p>
      </header>
      {error && <p className="staff-error" role="alert">{error}</p>}
      <section className="staff-panel progress-list">
        {residents.map((resident, index) => (
          <Link
            className="progress-resident"
            href={`/staff/progress/${resident.resident_id}`}
            key={resident.resident_id}
          >
            <span className={`resident-dot ${resident.status_label === "Worth a check-up conversation" ? "flag-dot" : resident.status_label === "Worth watching" ? "watch-dot" : "steady-dot"}`} />
            <span>
              <strong>{index + 1}. {resident.name}, Age: {resident.age ?? "—"}</strong>
              <small>{resident.status_label}</small>
            </span>
            <span className="progress-date">
              {resident.last_checkin_date
                ? `Last check-in ${resident.last_checkin_date}`
                : "No check-ins yet"}
            </span>
            <span aria-hidden="true">›</span>
          </Link>
        ))}
        {residents.length === 0 && <p className="staff-empty">No residents to display.</p>}
      </section>
    </>
  );
}
