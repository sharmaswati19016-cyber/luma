-- ============================================================
-- Remove register_resident — pairing codes are now the only
-- way residents get onboarded. validate_facility_code() is
-- UNTOUCHED and still needed — staff still use a facility code
-- at signup (via create_staff_profile), only residents no
-- longer do.
-- ============================================================

drop function if exists register_resident(text, text, text);
