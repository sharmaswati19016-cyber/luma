"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "../../../lib/api";
import StaffShell from "./StaffShell";
import "../staff.css";

export default function ProtectedStaffLayout({ children }) {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getSession()
      .then((currentSession) => {
        if (!active) return;
        if (!currentSession) {
          router.replace("/staff/login");
          return;
        }
        setSession(currentSession);
        setStatus("ready");
      })
      .catch((cause) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Could not verify your session.");
        setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [router]);

  if (status === "loading") {
    return <main className="staff-loading">Checking your session...</main>;
  }
  if (status === "error") {
    return <main className="staff-loading staff-error" role="alert">{error}</main>;
  }
  if (!session) return null;
  return <StaffShell session={session}>{children}</StaffShell>;
}
