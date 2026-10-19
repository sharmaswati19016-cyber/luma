"use client";

import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export interface DailyWordSet {
  id: number;
  word_1: string;
  word_2: string;
  word_3: string;
}

export interface FluencyCategory {
  id: number;
  category: string;
}

export interface PairingResult {
  residentId: string;
}

export interface ResidentRosterEntry {
  resident_id: string;
  name: string;
  status_label: string;
  reason_summary: string | null;
  last_checkin_date: string | null;
  is_off_today: boolean;
  pairing_code?: string | null;
}

export interface FacilitySummary {
  total_residents: number;
  flagged_count: number;
  watch_count: number;
  steady_count: number;
}

export interface FacilityInfo {
  facility_id: string;
  facility_name: string;
}

export interface StaffSignupResult {
  user: User;
  requiresEmailConfirmation: boolean;
}

export interface ResidentHistoryEntry {
  week_start: string;
  recall_avg: number | null;
  fluency_avg: number | null;
  response_avg: number | null;
  checkins_completed: number;
}

export interface CheckinSubmission {
  p_resident_id: string;
  p_recall_score: number;
  p_orientation_correct: boolean;
  p_fluency_count: number;
  p_avg_response_time: number;
  p_mode: "self";
  p_free_recall_score: number;
  p_recognition_score: number;
  p_category_id: number;
  p_fluency_words: string[];
}

export interface NewResident {
  name: string;
  age?: number;
}

export interface CreatedResident {
  resident_id: string;
  pairing_code: string;
}

async function callRpc<T>(
  name: string,
  args?: Record<string, unknown>
): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as T;
}

export async function pairDevice(pairingCode: string): Promise<PairingResult> {
  const residentId = await callRpc<string>("pair_device", {
    p_pairing_code: pairingCode,
  });
  return { residentId };
}

export async function getDailyWordSet(
  residentId: string
): Promise<DailyWordSet> {
  const rows = await callRpc<DailyWordSet[]>(
    "get_daily_word_set_for_resident",
    { p_resident_id: residentId }
  );
  const wordSet = rows[0];
  if (!wordSet) throw new Error("No word set was returned for today.");
  return wordSet;
}

export async function getDailyFluencyCategory(
  residentId: string
): Promise<FluencyCategory> {
  const rows = await callRpc<FluencyCategory[]>(
    "get_daily_fluency_category_for_resident",
    { p_resident_id: residentId }
  );
  const category = rows[0];
  if (!category) throw new Error("No fluency category was returned for today.");
  return category;
}

export function countValidFluencyWords(
  categoryId: number,
  words: string[]
): Promise<number> {
  return callRpc<number>("count_valid_fluency_words", {
    p_category_id: categoryId,
    p_words: words,
  });
}

export function submitCheckin(
  submission: CheckinSubmission
): Promise<string> {
  return callRpc<string>("submit_checkin", { ...submission });
}

export async function staffSignUp(
  email: string,
  password: string,
  staffName: string,
  facilityCode: string
): Promise<StaffSignupResult> {
  await validateFacilityCode(facilityCode);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: staffName, facility_code: facilityCode } },
  });
  if (error) throw error;
  if (!data.user) throw new Error("Staff account creation returned no user.");
  if (data.session) {
    await createStaffProfile(facilityCode, staffName);
    await clearSignupFacilityCode();
  }
  return { user: data.user, requiresEmailConfirmation: !data.session };
}

export async function staffLogin(
  email: string,
  password: string
): Promise<User> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  const facilityCode = data.user.user_metadata?.facility_code;
  if (typeof facilityCode === "string" && facilityCode.length > 0) {
    const staffName = data.user.user_metadata?.full_name;
    if (typeof staffName !== "string" || !staffName.trim()) {
      throw new Error("Your account is missing its staff name. Contact your administrator.");
    }
    await createStaffProfile(facilityCode, staffName);
    await clearSignupFacilityCode();
  }
  return data.user;
}

export async function staffLogout(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function validateFacilityCode(
  code: string
): Promise<FacilityInfo> {
  const rows = await callRpc<FacilityInfo[]>("validate_facility_code", {
    p_code: code,
  });
  const facility = rows[0];
  if (!facility) throw new Error("That facility code was not recognized.");
  return facility;
}

async function createStaffProfile(code: string, staffName: string): Promise<void> {
  await callRpc<string>("create_staff_profile", {
    p_code: code,
    p_name: staffName,
  });
}

async function clearSignupFacilityCode(): Promise<void> {
  const { error } = await supabase.auth.updateUser({
    data: { facility_code: null },
  });
  if (error) throw error;
}

export function getFacilitySummary(): Promise<FacilitySummary> {
  return callRpc<FacilitySummary[]>("get_facility_summary").then((rows) => {
    const summary = rows[0];
    if (!summary) throw new Error("No facility summary was returned.");
    return summary;
  });
}

export function getFacilityRoster(): Promise<ResidentRosterEntry[]> {
  return callRpc<ResidentRosterEntry[]>("get_facility_roster");
}

export async function getResidentsList(): Promise<ResidentRosterEntry[]> {
  const [roster, pairingResult] = await Promise.all([
    getFacilityRoster(),
    supabase.from("residents").select("id, pairing_code"),
  ]);
  if (pairingResult.error) throw pairingResult.error;
  const pairingCodes = new Map(
    (pairingResult.data || []).map((resident) => [resident.id, resident.pairing_code])
  );
  return roster.map((resident) => ({
    ...resident,
    pairing_code: pairingCodes.get(resident.resident_id) ?? null,
  }));
}

export function getResidentHistory(
  residentId: string,
  weeks = 8
): Promise<ResidentHistoryEntry[]> {
  return callRpc<ResidentHistoryEntry[]>("get_resident_weekly_history", {
    p_resident_id: residentId,
    p_weeks: weeks,
  });
}

export function createResident(name: string): Promise<CreatedResident> {
  return callRpc<CreatedResident[]>("create_resident_by_staff", {
    p_name: name,
  }).then((rows) => {
    const created = rows[0];
    if (!created) throw new Error("Resident creation returned no result.");
    return created;
  });
}

export async function addResidentsBulk(
  residents: NewResident[]
): Promise<CreatedResident[]> {
  const created: CreatedResident[] = [];
  for (const resident of residents) {
    created.push(await createResident(resident.name));
  }
  return created;
}

export function regeneratePairingCode(residentId: string): Promise<string> {
  return callRpc<string>("regenerate_pairing_code", {
    p_resident_id: residentId,
  });
}

export function deleteResident(residentId: string): Promise<void> {
  return callRpc<void>("delete_resident", {
    p_resident_id: residentId,
  });
}

export async function markOffDay(
  residentId: string,
  date = localDate(),
  reason: "unwell" | "new_medicine" | "slept_badly" | "other" = "other"
): Promise<void> {
  await callRpc<void>("mark_off_day", {
    p_resident_id: residentId,
    p_date: date,
    p_reason: reason,
  });
}

export async function unmarkOffDay(
  residentId: string,
  date = localDate()
): Promise<void> {
  await callRpc<void>("unmark_off_day", {
    p_resident_id: residentId,
    p_date: date,
  });
}

function localDate(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
