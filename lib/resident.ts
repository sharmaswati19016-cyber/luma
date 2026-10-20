"use client";

const KEY = "checkin_resident_id";

export function saveResidentId(id: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, id);
}

export function getResidentId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(KEY);
}

 export function clearResidentId() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}
