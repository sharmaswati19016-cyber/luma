"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useState } from "react";
import { staffLogout } from "../../../lib/api";

const StaffContext = createContext(null);

export function useStaffSession() {
  return useContext(StaffContext);
}

export default function StaffShell({ session, children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [error, setError] = useState("");
  const staffName =
    session.user.user_metadata?.full_name ||
    session.user.email?.split("@")[0] ||
    "Staff";
  const navigation = [
    { label: "Dashboard", href: "/staff/dashboard" },
    { label: "All Residents", href: "/staff/residents" },
    { label: "Progress", href: "/staff/progress" },
  ];

  async function handleLogout() {
    setError("");
    try {
      await staffLogout();
      router.replace("/staff/login");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not log out.");
    }
  }

  return (
    <StaffContext.Provider value={{ session, staffName }}>
      <div className="staff-app">
        <aside className="staff-sidebar">
          <div className="staff-profile">
            <div className="staff-avatar" aria-hidden="true">
              {staffName.slice(0, 1).toUpperCase()}
            </div>
            <strong>{staffName}</strong>
            <span>{session.user.email}</span>
          </div>
          <nav aria-label="Staff navigation">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={
                  pathname === item.href || pathname.startsWith(`${item.href}/`)
                    || (item.href === "/staff/dashboard" && pathname === "/staff")
                    ? "active"
                    : ""
                }
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <button className="staff-logout" onClick={handleLogout}>Log out</button>
        </aside>
        <main className="staff-main">
          {error && <p className="staff-error" role="alert">{error}</p>}
          {children}
        </main>
      </div>
    </StaffContext.Provider>
  );
}
