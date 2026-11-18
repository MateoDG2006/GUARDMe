-- Ficha asistida editable (datos de contacto/salud no clínicos).

ALTER TABLE guardme.profiles
  ADD COLUMN IF NOT EXISTS age_years integer,
  ADD COLUMN IF NOT EXISTS height_text text,
  ADD COLUMN IF NOT EXISTS weight_text text,
  ADD COLUMN IF NOT EXISTS conditions_text text,
  ADD COLUMN IF NOT EXISTS allergies_text text,
  ADD COLUMN IF NOT EXISTS blood_type text,
  ADD COLUMN IF NOT EXISTS address_text text,
  ADD COLUMN IF NOT EXISTS phone_e164 text,
  ADD COLUMN IF NOT EXISTS doctor_name text,
  ADD COLUMN IF NOT EXISTS insurance_text text;

ALTER TABLE guardme.profiles
  DROP CONSTRAINT IF EXISTS guardme_profiles_age_years_check;

ALTER TABLE guardme.profiles
  ADD CONSTRAINT guardme_profiles_age_years_check
  CHECK (age_years IS NULL OR (age_years >= 0 AND age_years <= 130));
