"use client";

const KEY = "checkin_resident";

// resident = { id: "...", name: "..." }
export function saveResident(resident) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(resident));
}

export function getResident() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}