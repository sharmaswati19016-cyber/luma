"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { getMyStaffName, staffLogout } from "../../../lib/api";
import Logo from "../../../src/components/shared/Logo";
import dashboardIcon from "../../../src/public/assets/dashboard.png";
import residentIcon from "../../../src/public/assets/resident.png";
import progressIcon from "../../../src/public/assets/progress.png";

const StaffContext = createContext(null);

export function useStaffSession() {
  return useContext(StaffContext);
}

export default function StaffShell({ session, children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [error, setError] = useState("");
  const [profileName, setProfileName] = useState("");
  const staffName = profileName ||
    session.user.user_metadata?.full_name ||
    session.user.email?.split("@")[0] ||
    "Staff";
  const navigation = [
    { label: "Dashboard", href: "/staff/dashboard", icon: dashboardIcon },
    { label: "All Residents", href: "/staff/residents", icon: residentIcon },
    { label: "Progress", href: "/staff/progress", icon: progressIcon },
  ];

  useEffect(() => {
    let active = true;
    getMyStaffName()
      .then((name) => {
        if (active) setProfileName(name);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Staff profile could not load.");
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleLogout() {
    setError("");
    try {
      await staffLogout();
      router.replace("/staff/login");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not log out.");
    }
  }

  function logoutButton() {
    return (
      <button className="staff-logout" type="button" aria-label="Log out" onClick={handleLogout}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M10 17l5-5-5-5M15 12H3" />
          <path d="M12 3h6a2 2 0 012 2v14a2 2 0 01-2 2h-6" />
        </svg>
        Log out
      </button>
    );
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
          <div className="staff-mobile-tools">
            <Logo variant="mark" className="staff-mobile-logo" />
            {logoutButton()}
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
                <Image src={item.icon} alt="" width={20} height={20} />
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="staff-main">
          <div className="staff-main-brand">
            <Logo variant="mark" />
            {logoutButton()}
          </div>
          {error && <p className="staff-error" role="alert">{error}</p>}
          {children}
        </main>
      </div>
    </StaffContext.Provider>
  );
}
