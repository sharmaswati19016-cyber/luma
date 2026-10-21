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
  resident_id: string;
  name: string;
  pairing_code: string | null;
  status: string;
  status_label: string;
  reason_summary: string | null;
  last_checkin_date: string | null;
  is_off_today: boolean;
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
  if (password.length < 6) {
    throw new Error("Choose a password with at least 6 characters.");
  }
  const facility = await validateFacilityCode(facilityCode);
  if (!facility) throw new Error("That facility code is not valid.");

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: name } },
  });
  if (error) {
    if (/already registered|already exists|email.*taken/i.test(error.message)) {
      throw new Error("This email is already registered. Please log in instead.");
    }
    if (/password.*(weak|short|least)|weak password/i.test(error.message)) {
      throw new Error("Choose a password with at least 6 characters.");
    }
    if (/invalid facility code/i.test(error.message)) {
      throw new Error("That facility code is not valid.");
    }
    throw new Error(error.message);
  }
  if (data.user?.identities?.length === 0) {
    throw new Error("This email is already registered. Please log in instead.");
  }
  if (!data.session) {
    throw new Error("Confirm email is still on in Supabase. Turn it off for testing.");
  }

  await rpc("create_staff_profile", { p_code: facilityCode, p_name: name });
}

export async function staffLogin(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (/invalid login credentials|invalid email or password/i.test(error.message)) {
      throw new Error("Email or password is incorrect.");
    }
    if (/email not confirmed|email_not_confirmed/i.test(error.message)) {
      throw new Error("Your email isn't confirmed yet. Please check your inbox, or ask your administrator to confirm it.");
    }
    throw new Error(error.message);
  }
  if (!data.session) throw new Error("Unable to start a staff session.");
}

export async function staffLogout() {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  return data.session;
}

// The logged-in staff member's facility (allowed by the staff RLS policy)
export async function getMyFacilityId(): Promise<string | null> {
  const { data, error } = await supabase
    .from("staff")
    .select("facility_id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.facility_id ?? null;
}

export async function getMyStaffName(): Promise<string | null> {
  const { data, error } = await supabase
    .from("staff")
    .select("name")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.name ?? null;
}

export async function getMyFacilityName(): Promise<string | null> {
  const name = await rpc<string>("get_my_facility_name");
  return name || null;
}

// ---------- Staff: dashboard ----------
export async function getFacilitySummary() {
  const rows = await rpc<FacilitySummary[]>("get_facility_summary");
  return rows[0] ?? {
    total_residents: 0,
    flagged_count: 0,
    watch_count: 0,
    steady_count: 0,
  };
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

// The roster omits pairing codes, so fetch them from the residents table and
// merge them with status data returned by the roster RPC.
export async function getResidentsList() {
  const [{ data, error }, roster] = await Promise.all([
    supabase
      .from("residents")
      .select("id, name, pairing_code")
      .order("name"),
    getFacilityRoster(),
  ]);
  if (error) throw new Error(error.message);
  return data.map((resident) => {
    const status = roster.find((row) => row.resident_id === resident.id);
    if (!status) {
      throw new Error(`Status information is unavailable for ${resident.name}.`);
    }
    return {
      resident_id: resident.id,
      name: resident.name,
      pairing_code: resident.pairing_code,
      status: status.status,
      status_label: status.status_label,
      reason_summary: status.reason_summary,
      last_checkin_date: status.last_checkin_date,
      is_off_today: status.is_off_today,
    } satisfies ResidentListRow;
  });
}

// ---------- Staff: managing residents ----------
export async function createResident(name: string) {
  const rows = await rpc<{ resident_id: string; pairing_code: string }[]>(
    "create_resident_by_staff",
    { p_name: name }
  );
  return rows[0];
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

export async function getResidentName(residentId: string): Promise<string | null> {
  return rpc<string | null>("get_resident_name", { p_resident_id: residentId });
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
