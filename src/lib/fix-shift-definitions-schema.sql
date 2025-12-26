/**
 * fix-shift-definitions-schema.sql
 * 
 * Purpose: Fix the shift_definitions table to use 'name' instead of 'shift_type'
 * 
 * Run this IMMEDIATELY in your Supabase SQL Editor to fix the schema issue
 */

-- Step 1: Add name column if it doesn't exist
ALTER TABLE shift_definitions 
ADD COLUMN IF NOT EXISTS name VARCHAR(255);

-- Step 2: Migrate existing shift_type values to name (if any exist)
UPDATE shift_definitions 
SET name = CASE 
  WHEN shift_type = 'morning' THEN 'Morning Shift'
  WHEN shift_type = 'evening' THEN 'Evening Shift'
  ELSE INITCAP(COALESCE(shift_type, 'Shift')) || ' Shift'
END
WHERE name IS NULL OR name = '';

-- Step 3: For any rows that still don't have a name, set a default based on ID
UPDATE shift_definitions 
SET name = 'Shift ' || SUBSTRING(id::text, 1, 8)
WHERE name IS NULL OR name = '';

-- Step 4: Make name NOT NULL
ALTER TABLE shift_definitions 
ALTER COLUMN name SET NOT NULL;

-- Step 5: Drop the old unique constraint if it exists
ALTER TABLE shift_definitions 
DROP CONSTRAINT IF EXISTS shift_definitions_store_id_shift_type_key;

-- Step 6: Add new unique constraint on store_id and name
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'shift_definitions_store_id_name_key'
  ) THEN
    ALTER TABLE shift_definitions 
    ADD CONSTRAINT shift_definitions_store_id_name_key 
    UNIQUE(store_id, name);
  END IF;
END $$;

-- Step 7: Make shift_type nullable (we'll drop it later, but for now make it nullable so inserts work)
ALTER TABLE shift_definitions 
ALTER COLUMN shift_type DROP NOT NULL;

-- Verify the migration
SELECT 
  id,
  store_id,
  name,
  shift_type,
  start_time,
  end_time,
  duration_hours,
  is_active
FROM shift_definitions
ORDER BY name;

