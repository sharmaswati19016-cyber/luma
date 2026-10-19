"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getFacilityRoster, getFacilitySummary } from "../../../lib/api";
import { useStaffSession } from "./StaffShell";

export default function StaffDashboard() {
  const { staffName } = useStaffSession();
  const [summary, setSummary] = useState(null);
  const [flaggedResidents, setFlaggedResidents] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([getFacilitySummary(), getFacilityRoster()])
      .then(([counts, roster]) => {
        if (!active) return;
        setSummary(counts);
        setFlaggedResidents(
          roster.filter((resident) => resident.status_label === "Worth a check-up conversation")
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
        <section className="summary-cards" aria-label="Resident counts">
          <article className="summary-card">
            <span className="resident-dot steady-dot" aria-hidden="true" />
            <p>Steady</p>
            <strong>{summary?.steady_count ?? "—"}</strong>
          </article>
          <article className="summary-card">
            <span className="resident-dot watch-dot" aria-hidden="true" />
            <p>Watch</p>
            <strong>{summary?.watch_count ?? "—"}</strong>
          </article>
          <article className="summary-card">
            <span className="resident-dot total-dot" aria-hidden="true" />
            <p>Total residents</p>
            <strong>{summary?.total_residents ?? "—"}</strong>
          </article>
        </section>
      </div>
    </>
  );
}
