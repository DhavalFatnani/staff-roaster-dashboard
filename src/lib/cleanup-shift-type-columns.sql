/**
 * cleanup-shift-type-columns.sql
 * 
 * Purpose: Cleanup script to remove old shift_type columns after migration is complete
 * 
 * ⚠️ WARNING: Only run this AFTER:
 * 1. Running fix-shift-definitions-schema.sql
 * 2. Running migrate-shift-type-to-name.sql (full migration)
 * 3. Verifying all data has been migrated correctly
 * 4. Testing the application thoroughly
 * 
 * This script will permanently remove the shift_type columns.
 * Make sure you have a database backup before running this!
 */

-- Step 1: Verify migration is complete
-- Check that all shift_definitions have names
DO $$
DECLARE
  shifts_without_name INTEGER;
BEGIN
  SELECT COUNT(*) INTO shifts_without_name
  FROM shift_definitions
  WHERE name IS NULL OR name = '';
  
  IF shifts_without_name > 0 THEN
    RAISE EXCEPTION 'Migration incomplete: % shifts still missing name. Run migration scripts first.', shifts_without_name;
  END IF;
  
  RAISE NOTICE '✓ All shifts have names';
END $$;

-- Check that all rosters have shift_id
DO $$
DECLARE
  rosters_without_shift_id INTEGER;
BEGIN
  SELECT COUNT(*) INTO rosters_without_shift_id
  FROM rosters
  WHERE shift_id IS NULL;
  
  IF rosters_without_shift_id > 0 THEN
    RAISE EXCEPTION 'Migration incomplete: % rosters still missing shift_id. Run migration scripts first.', rosters_without_shift_id;
  END IF;
  
  RAISE NOTICE '✓ All rosters have shift_id';
END $$;

-- Check that all roster_slots have shift_id
DO $$
DECLARE
  slots_without_shift_id INTEGER;
BEGIN
  SELECT COUNT(*) INTO slots_without_shift_id
  FROM roster_slots
  WHERE shift_id IS NULL;
  
  IF slots_without_shift_id > 0 THEN
    RAISE EXCEPTION 'Migration incomplete: % roster slots still missing shift_id. Run migration scripts first.', slots_without_shift_id;
  END IF;
  
  RAISE NOTICE '✓ All roster slots have shift_id';
END $$;

-- Step 2: Drop old constraints that reference shift_type
ALTER TABLE shift_definitions 
DROP CONSTRAINT IF EXISTS shift_definitions_store_id_shift_type_key;

ALTER TABLE rosters 
DROP CONSTRAINT IF EXISTS rosters_store_id_date_shift_type_key;

-- Step 3: Drop the shift_type columns
-- Note: These will fail if columns don't exist, which is fine
ALTER TABLE shift_definitions 
DROP COLUMN IF EXISTS shift_type;

ALTER TABLE rosters 
DROP COLUMN IF EXISTS shift_type;

ALTER TABLE roster_slots 
DROP COLUMN IF EXISTS shift_type;

-- Step 4: Verify cleanup
DO $$
BEGIN
  RAISE NOTICE '✓ Cleanup complete!';
  RAISE NOTICE '✓ shift_type columns removed from all tables';
  RAISE NOTICE '✓ Application now uses name/shift_id exclusively';
END $$;

-- Final verification query
SELECT 
  'shift_definitions' as table_name,
  COUNT(*) as total_rows,
  COUNT(name) as rows_with_name,
  COUNT(shift_type) as rows_with_shift_type
FROM shift_definitions
UNION ALL
SELECT 
  'rosters' as table_name,
  COUNT(*) as total_rows,
  COUNT(shift_id) as rows_with_shift_id,
  COUNT(shift_type) as rows_with_shift_type
FROM rosters
UNION ALL
SELECT 
  'roster_slots' as table_name,
  COUNT(*) as total_rows,
  COUNT(shift_id) as rows_with_shift_id,
  COUNT(shift_type) as rows_with_shift_type
FROM roster_slots;

