import { supabase } from "./supabase";

// ---------- Types ----------
export type RosterRow = {
  resident_id: string;
  name: string;
  status: string; // steady | watch | flag
  status_label: string;
  reason_summary: string | null;
  last_checkin_date: string | null;
  is_off_today: boolean;
};

export type FacilitySummary = {
  total_residents: number;
  flagged_count: number;
  watch_count: number;
  steady_count: number;
};

export type HistoryRow = {
  week_start: string;
  recall_avg: number | null;
  fluency_avg: number | null;
  response_avg: number | null;
  checkins_completed: number;
};

export type WordSet = { id: number; word_1: string; word_2: string; word_3: string };
export type FluencyCategory = { id: number; category: string };

export type ResidentListRow = {
  id: string;
  name: string;
  age: number | null;
  pairing_code: string | null;
};

export type BulkResidentResult = {
  name: string;
  age: number | null;
  pairing_code: string;
  status: string;
};

// Small helper: run an rpc call and throw a readable error if it fails
async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

// ---------- Staff: auth ----------
export async function validateFacilityCode(code: string) {
  const rows = await rpc<{ facility_id: string; facility_name: string }[]>(
    "validate_facility_code",
    { p_code: code }
  );
  return rows[0] ?? null; // null = invalid code
}

export async function staffSignUp(
  email: string,
  password: string,
  name: string,
  facilityCode: string
) {
  const facility = await validateFacilityCode(facilityCode);
  if (!facility) throw new Error("That facility code is not valid.");

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw new Error(error.message);
  // If email confirmation is ON in Supabase, there is no session yet
  if (!data.session) {
    throw new Error("Email confirmation is on. Turn it off in Supabase for the demo.");
  }

  await rpc("create_staff_profile", { p_code: facilityCode, p_name: name });
}

export async function staffLogin(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
}

export async function staffLogout() {
  await supabase.auth.signOut();
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// The logged-in staff member's facility (allowed by the staff RLS policy)
export async function getMyFacilityId(): Promise<string> {
  const { data, error } = await supabase
    .from("staff")
    .select("facility_id")
    .single();
  if (error) throw new Error(error.message);
  return data.facility_id;
}

// ---------- Staff: dashboard ----------
export async function getFacilitySummary() {
  const rows = await rpc<FacilitySummary[]>("get_facility_summary");
  return rows[0];
}

export async function getFacilityRoster() {
  return rpc<RosterRow[]>("get_facility_roster");
}

export async function getResidentHistory(residentId: string, weeks = 8) {
  return rpc<HistoryRow[]>("get_resident_weekly_history", {
    p_resident_id: residentId,
    p_weeks: weeks,
  });
}

// "View All Residents" needs age + pairing code, which the roster doesn't return,
// so this reads the residents table directly (allowed by RLS for staff).
export async function getResidentsList() {
  const { data, error } = await supabase
    .from("residents")
    .select("id, name, age, pairing_code")
    .order("name");
  if (error) throw new Error(error.message);
  return data as ResidentListRow[];
}

// ---------- Staff: managing residents ----------
export async function createResident(name: string) {
  const rows = await rpc<{ resident_id: string; pairing_code: string }[]>(
    "create_resident_by_staff",
    { p_name: name }
  );
  return rows[0];
}

// residents example: [{ name: "Priya Nair", age: 76 }]
export async function addResidentsBulk(residents: { name: string; age?: number }[]) {
  const facilityId = await getMyFacilityId();
  return rpc<BulkResidentResult[]>("add_residents_bulk", {
    p_facility_id: facilityId,
    p_residents: residents,
  });
}

export async function regeneratePairingCode(residentId: string) {
  return rpc<string>("regenerate_pairing_code", { p_resident_id: residentId });
}

export async function deleteResident(residentId: string) {
  await rpc("delete_resident", { p_resident_id: residentId });
}

export async function markOffDay(residentId: string, reason = "other", date?: string) {
  await rpc("mark_off_day", { p_resident_id: residentId, p_reason: reason, p_date: date });
}

export async function unmarkOffDay(residentId: string, date?: string) {
  await rpc("unmark_off_day", { p_resident_id: residentId, p_date: date });
}

// ---------- Resident tablet (no login) ----------
export async function pairDevice(code: string) {
  return rpc<string>("pair_device", { p_pairing_code: code }); // returns resident id
}

// ---------- Check-in (used by resident AND staff-assisted) ----------
export async function getDailyWordSet(residentId: string) {
  const rows = await rpc<WordSet[]>("get_daily_word_set_for_resident", {
    p_resident_id: residentId,
  });
  return rows[0];
}

export async function getDailyFluencyCategory(residentId: string) {
  const rows = await rpc<FluencyCategory[]>("get_daily_fluency_category_for_resident", {
    p_resident_id: residentId,
  });
  return rows[0];
}

export async function countValidFluencyWords(categoryId: number, words: string[]) {
  return rpc<number>("count_valid_fluency_words", {
    p_category_id: categoryId,
    p_words: words,
  });
}

export type CheckinInput = {
  residentId: string;
  mode?: "self" | "staff-assisted";
  freeRecallScore?: number;
  recognitionScore?: number;
  orientationCorrect?: boolean;
  fluencyCount?: number;
  fluencyWords?: string[];
  categoryId?: number;
  avgResponseTime?: number;
};

export async function submitCheckin(c: CheckinInput) {
  return rpc<string>("submit_checkin", {
    p_resident_id: c.residentId,
    p_mode: c.mode ?? "self",
    p_free_recall_score: c.freeRecallScore,
    p_recognition_score: c.recognitionScore,
    p_orientation_correct: c.orientationCorrect,
    p_fluency_count: c.fluencyCount,
    p_fluency_words: c.fluencyWords,
    p_category_id: c.categoryId,
    p_avg_response_time: c.avgResponseTime,
  }); // returns the new check-in id
}
