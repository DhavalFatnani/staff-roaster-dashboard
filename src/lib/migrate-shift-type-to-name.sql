/**
 * migrate-shift-type-to-name.sql
 * 
 * Purpose: Migrate shift_definitions table from shift_type to name field
 * 
 * Run notes:
 * - Run this script in your Supabase SQL Editor
 * - This migrates existing shift_type values to name field
 * - Adds name column and removes shift_type column
 * - Updates rosters and roster_slots to use shift_id instead of shift_type
 */

-- Step 1: Add name column to shift_definitions
ALTER TABLE shift_definitions 
ADD COLUMN IF NOT EXISTS name VARCHAR(255);

-- Step 2: Migrate existing shift_type values to name
UPDATE shift_definitions 
SET name = CASE 
  WHEN shift_type = 'morning' THEN 'Morning Shift'
  WHEN shift_type = 'evening' THEN 'Evening Shift'
  ELSE INITCAP(shift_type) || ' Shift'
END
WHERE name IS NULL;

-- Step 3: Make name NOT NULL after migration
ALTER TABLE shift_definitions 
ALTER COLUMN name SET NOT NULL;

-- Step 4: Add shift_id column to rosters table
ALTER TABLE rosters 
ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES shift_definitions(id);

-- Step 5: Migrate rosters from shift_type to shift_id
UPDATE rosters r
SET shift_id = (
  SELECT sd.id 
  FROM shift_definitions sd 
  WHERE sd.store_id = r.store_id 
  AND sd.shift_type = r.shift_type 
  LIMIT 1
)
WHERE shift_id IS NULL;

-- Step 6: Add shift_id column to roster_slots table
ALTER TABLE roster_slots 
ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES shift_definitions(id);

-- Step 7: Migrate roster_slots from shift_type to shift_id
UPDATE roster_slots rs
SET shift_id = (
  SELECT r.shift_id
  FROM rosters r
  WHERE r.id = rs.roster_id
)
WHERE shift_id IS NULL;

-- Step 8: Drop old shift_type columns (commented out for safety - uncomment after verifying)
-- ALTER TABLE shift_definitions DROP COLUMN IF EXISTS shift_type;
-- ALTER TABLE rosters DROP COLUMN IF EXISTS shift_type;
-- ALTER TABLE roster_slots DROP COLUMN IF EXISTS shift_type;

-- Step 9: Update unique constraint on shift_definitions
ALTER TABLE shift_definitions 
DROP CONSTRAINT IF EXISTS shift_definitions_store_id_shift_type_key;

ALTER TABLE shift_definitions 
ADD CONSTRAINT shift_definitions_store_id_name_key 
UNIQUE(store_id, name);

-- Step 10: Update unique constraint on rosters
ALTER TABLE rosters 
DROP CONSTRAINT IF EXISTS rosters_store_id_date_shift_type_key;

ALTER TABLE rosters 
ADD CONSTRAINT rosters_store_id_date_shift_id_key 
UNIQUE(store_id, date, shift_id);

-- Verify the migration
SELECT 
  id,
  store_id,
  name,
  start_time,
  end_time,
  duration_hours,
  is_active
FROM shift_definitions
ORDER BY name;

