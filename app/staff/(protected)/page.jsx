"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getFacilityRoster,
  getFacilitySummary,
  getMyFacilityName,
} from "../../../lib/api";
import { useStaffSession } from "./StaffShell";

export default function StaffDashboard() {
  const { staffName } = useStaffSession();
  const [summary, setSummary] = useState(null);
  const [flaggedResidents, setFlaggedResidents] = useState([]);
  const [facilityName, setFacilityName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([getFacilitySummary(), getFacilityRoster(), getMyFacilityName()])
      .then(([counts, roster, name]) => {
        if (!active) return;
        setSummary(counts);
        setFacilityName(name);
        setFlaggedResidents(
          roster.filter((resident) => resident.status === "flag")
        );
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Dashboard data could not load.");
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <header className="staff-page-header">
        <p className="staff-eyebrow">STAFF DASHBOARD</p>
        <h1>HELLO, {staffName.toUpperCase()} !</h1>
      </header>
      {error && <p className="staff-error" role="alert">{error}</p>}
      <section className="staff-facility-card">
        <p className="staff-eyebrow">FACILITY</p>
        <h2>{facilityName || "Loading facility..."}</h2>
      </section>
      <div className="dashboard-layout">
        <section className="flagged-card">
          <div className="staff-card-heading">
            <div>
              <p className="staff-eyebrow">FOLLOW-UP</p>
              <h2>Flagged Residents</h2>
            </div>
            <span className="flagged-count">{flaggedResidents.length}</span>
          </div>
          <div className="flagged-list">
            {flaggedResidents.length === 0 ? (
              <p>{summary ? "No flagged residents right now." : "Loading residents..."}</p>
            ) : flaggedResidents.map((resident) => (
              <Link
                className="flagged-resident"
                key={resident.resident_id}
                href={`/staff/progress/${resident.resident_id}`}
              >
                <span className="resident-dot flag-dot" aria-hidden="true" />
                <span className="flagged-copy">
                  <strong>{resident.name}</strong>
                  <span>{resident.status_label}</span>
                  <small>{resident.reason_summary || "No reason summary available."}</small>
                </span>
                <span aria-hidden="true">›</span>
              </Link>
            ))}
          </div>
        </section>
        <aside className="dashboard-aside">
          <section className="summary-cards" aria-label="Resident counts">
            <article className="summary-card">
              <span className="resident-dot flag-dot" aria-hidden="true" />
              <p>Flagged</p>
              <strong>{summary?.flagged_count ?? "—"}</strong>
            </article>
            <article className="summary-card">
              <span className="resident-dot watch-dot" aria-hidden="true" />
              <p>Worth watching</p>
              <strong>{summary?.watch_count ?? "—"}</strong>
            </article>
            <article className="summary-card">
              <span className="resident-dot steady-dot" aria-hidden="true" />
              <p>Steady</p>
              <strong>{summary?.steady_count ?? "—"}</strong>
            </article>
            <article className="summary-card">
              <span className="resident-dot total-dot" aria-hidden="true" />
              <p>Total residents</p>
              <strong>{summary?.total_residents ?? "—"}</strong>
            </article>
          </section>
          <div className="dashboard-quick-actions">
            <Link className="dashboard-action-card" href="/staff/residents#add-resident">
              <span aria-hidden="true">＋</span>
              <strong>Add a Resident</strong>
              <small>Open the resident form</small>
            </Link>
            <Link className="dashboard-action-card" href="/staff/residents#upload-sheet">
              <span aria-hidden="true">↑</span>
              <strong>Upload Sheet</strong>
              <small>Import a CSV with name and age</small>
            </Link>
          </div>
        </aside>
      </div>
    </>
  );
}
