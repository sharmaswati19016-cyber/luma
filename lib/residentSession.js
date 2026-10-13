const KEY = "checkin_resident";

// resident = { id: "...", name: "..." }
export function saveResident(resident) {
  localStorage.setItem(KEY, JSON.stringify(resident));
}

export function getResident() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}