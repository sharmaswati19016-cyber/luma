"use client";

const RESIDENT_ID_KEY = "checkin_resident_id";
const RESIDENT_NAME_KEY = "checkin_resident_name";

export function saveResidentId(residentId: string, residentName?: string): void {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(RESIDENT_ID_KEY, residentId);
  if (residentName) window.localStorage.setItem(RESIDENT_NAME_KEY, residentName);
}

export function getResidentId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(RESIDENT_ID_KEY);
}

export function getResidentName(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(RESIDENT_NAME_KEY);
}

export function clearResidentId(): void {
  if (typeof window === "undefined") return;

  window.localStorage.removeItem(RESIDENT_ID_KEY);
  window.localStorage.removeItem(RESIDENT_NAME_KEY);
}
