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
  const [summary, setSummary] = useState({
    total_residents: 0,
    flagged_count: 0,
    watch_count: 0,
    steady_count: 0,
  });
  const [flaggedResidents, setFlaggedResidents] = useState([]);
  const [facilityName, setFacilityName] = useState("");
  const [facilityLinked, setFacilityLinked] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      getFacilitySummary(),
      getFacilityRoster(),
      getMyFacilityName(),
    ]).then(([summaryResult, rosterResult, nameResult]) => {
      if (!active) return;
      const summaryLoaded = summaryResult.status === "fulfilled";
      const rosterLoaded = rosterResult.status === "fulfilled";
      if (summaryLoaded) setSummary(summaryResult.value);
      else console.warn("Facility summary could not load:", summaryResult.reason);
      if (rosterLoaded) {
        setFlaggedResidents(
          (rosterResult.value ?? []).filter((resident) => resident.status === "flag")
        );
      } else {
        console.warn("Facility roster could not load:", rosterResult.reason);
      }

      if (nameResult.status === "fulfilled") {
        setFacilityName(nameResult.value || "Your facility");
      } else {
        console.warn("Facility name could not load:", nameResult.reason);
        setFacilityName("Your facility");
      }

      setFacilityLinked(summaryLoaded || rosterLoaded);
      if (!summaryLoaded && !rosterLoaded) {
        setError("Facility data could not load.");
      } else if (!summaryLoaded || !rosterLoaded) {
        setError("Some dashboard data could not load.");
      }
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [loadAttempt]);

  return (
    <>
      <header className="staff-page-header">
        <p className="staff-eyebrow">STAFF DASHBOARD</p>
        <h1>HELLO, {staffName.toUpperCase()} !</h1>
      </header>
      {error && (
        <p className="staff-error" role="alert">
          {error}{" "}
          <button className="staff-secondary-button" onClick={() => {
            setLoading(true);
            setError("");
            setLoadAttempt((attempt) => attempt + 1);
          }}>
            Retry
          </button>
        </p>
      )}
      <section className="staff-facility-card">
        <p className="staff-eyebrow">FACILITY</p>
        <h2>{loading ? "Loading facility..." : facilityLinked ? facilityName || "Your facility" : "No facility linked to this account"}</h2>
      </section>
      {!loading && !facilityLinked && (
        <p className="staff-error" role="status">
          Your account isn&apos;t linked to a facility yet. Please sign up with your facility code SUNRISE01 or contact your administrator.
        </p>
      )}
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
            {loading ? (
              <p>Loading residents...</p>
            ) : flaggedResidents.length === 0 ? (
              <p>{error ? "Flagged residents are unavailable." : "No flagged residents right now."}</p>
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
              <strong>{summary.flagged_count}</strong>
            </article>
            <article className="summary-card">
              <span className="resident-dot watch-dot" aria-hidden="true" />
              <p>Worth watching</p>
              <strong>{summary.watch_count}</strong>
            </article>
            <article className="summary-card">
              <span className="resident-dot steady-dot" aria-hidden="true" />
              <p>Steady</p>
              <strong>{summary.steady_count}</strong>
            </article>
            <article className="summary-card">
              <span className="resident-dot total-dot" aria-hidden="true" />
              <p>Total residents</p>
              <strong>{summary.total_residents}</strong>
            </article>
          </section>
          <div className="dashboard-quick-actions">
            <Link className="dashboard-action-card" href="/staff/residents#add-resident">
              <span aria-hidden="true">＋</span>
              <strong>Add a Resident</strong>
              <small>Open the resident form</small>
            </Link>
          </div>
        </aside>
      </div>
    </>
  );
}
