/**
 * migrate-shift-type-to-name-immediate.sql
 * 
 * Purpose: IMMEDIATE migration - Update existing shift_definitions table to use name instead of shift_type
 * 
 * Run notes:
 * - Run this FIRST if you have existing data
 * - This updates the table structure immediately
 * - For new installations, the schema.sql already has the correct structure
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

-- Step 3: For any rows that still don't have a name, set a default
UPDATE shift_definitions 
SET name = 'Shift ' || id::text
WHERE name IS NULL OR name = '';

-- Step 4: Make name NOT NULL
ALTER TABLE shift_definitions 
ALTER COLUMN name SET NOT NULL;

-- Step 5: Drop the old unique constraint if it exists
ALTER TABLE shift_definitions 
DROP CONSTRAINT IF EXISTS shift_definitions_store_id_shift_type_key;

-- Step 6: Add new unique constraint on store_id and name
ALTER TABLE shift_definitions 
ADD CONSTRAINT shift_definitions_store_id_name_key 
UNIQUE(store_id, name);

-- Step 7: Drop the shift_type column (this will fail if there are still references, which is fine)
-- We'll keep it for now and drop it later after updating all references
-- ALTER TABLE shift_definitions DROP COLUMN IF EXISTS shift_type;

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

