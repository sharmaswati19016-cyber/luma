const KEY = "checkin_resident_id";

export function saveResidentId(id: string) {
  localStorage.setItem(KEY, id);
}

export function getResidentId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(KEY);
}

export function clearResidentId() {
  localStorage.removeItem(KEY);
}