"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  getResidentHistory,
  getResidentsList,
  markOffDay,
  unmarkOffDay,
} from "../../../../../lib/api";

function TrendChart({ title, rows, field, maxValue, unit = "" }) {
  const values = rows.map((row) => row[field]).filter((value) => value !== null);
  if (values.length === 0) {
    return <article className="trend-card"><h3>{title}</h3><p>No history available yet.</p></article>;
  }
  const points = rows
    .map((row, index) => ({ value: row[field], index }))
    .filter((point) => point.value !== null)
    .map(({ value, index }) => {
      const x = rows.length === 1 ? 360 : 48 + (index / (rows.length - 1)) * 624;
      const y = 188 - (Number(value) / maxValue) * 150;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <article className="trend-card">
      <h3>{title}</h3>
      <svg viewBox="0 0 720 220" role="img" aria-label={`${title} history chart`}>
        <line x1="48" y1="188" x2="672" y2="188" className="chart-axis" />
        <line x1="48" y1="38" x2="48" y2="188" className="chart-axis" />
        <polyline points={points} className="chart-line" />
        {rows.map((row, index) => {
          if (row[field] === null) return null;
          const x = rows.length === 1 ? 360 : 48 + (index / (rows.length - 1)) * 624;
          const y = 188 - (Number(row[field]) / maxValue) * 150;
          return <circle key={row.week_start} cx={x} cy={y} r="5" className="chart-point" />;
        })}
      </svg>
      <div className="chart-labels">
        {values.map((value, index) => <span key={`${title}-${index}`}>{Number(value).toFixed(1)}{unit}</span>)}
      </div>
    </article>
  );
}

export default function ResidentProgressPage() {
  const params = useParams();
  const residentId = Array.isArray(params.residentId) ? params.residentId[0] : params.residentId;
  const [resident, setResident] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);

  async function refreshData() {
    const [roster, weeks] = await Promise.all([
      getResidentsList(),
      getResidentHistory(residentId, 8),
    ]);
    setResident(roster.find((item) => item.resident_id === residentId) || null);
    setHistory(weeks);
  }

  useEffect(() => {
    let active = true;
    Promise.all([getResidentsList(), getResidentHistory(residentId, 8)])
      .then(([roster, weeks]) => {
        if (!active) return;
        setResident(roster.find((item) => item.resident_id === residentId) || null);
        setHistory(weeks);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Resident history could not load.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [residentId, loadAttempt]);

  async function toggleOffDay() {
    if (!resident) return;
    setBusy(true);
    setError("");
    try {
      if (resident.is_off_today) await unmarkOffDay(residentId);
      else await markOffDay(residentId);
      await refreshData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Off-day status could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="staff-page-header">
        <Link className="back-link" href="/staff/progress">← Progress</Link>
        <p className="staff-eyebrow">RESIDENT DETAIL</p>
        <h1>{resident?.name || "Resident progress"}</h1>
        {resident && <p>{resident.status_label}</p>}
      </header>
      {error && <p className="staff-error" role="alert">{error}</p>}
      {error && (
        <button className="staff-secondary-button" onClick={() => {
          setLoading(true);
          setError("");
          setLoadAttempt((attempt) => attempt + 1);
        }}>
          Retry
        </button>
      )}
      {loading && <p className="staff-empty">Loading resident history...</p>}
      <section className="staff-panel off-day-panel">
        <div>
          <p className="staff-eyebrow">TODAY</p>
          <h2>{resident?.is_off_today ? "Marked as an off day" : "Check-in day"}</h2>
        </div>
        <button
          className={resident?.is_off_today ? "staff-secondary-button" : "staff-button"}
          onClick={toggleOffDay}
          disabled={busy || !resident}
        >
          {busy ? "Saving..." : resident?.is_off_today ? "Unmark off day" : "Mark off day"}
        </button>
      </section>
      {!loading && !error && (
        <section className="trend-grid">
          <TrendChart title="Free recall" rows={history} field="recall_avg" maxValue={3} />
          <TrendChart title="Fluency words" rows={history} field="fluency_avg" maxValue={30} />
          <TrendChart title="Response time" rows={history} field="response_avg" maxValue={10} unit="s" />
        </section>
      )}
      <p className="history-footnote">
        Weekly averages exclude practice check-ins and marked off days. Response time is shown in seconds.
      </p>
    </>
  );
}
