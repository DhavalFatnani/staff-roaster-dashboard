/**
 * create-default-shifts.sql
 * 
 * Purpose: Create the default morning and evening shifts
 * 
 * Run notes:
 * - Run this script in your Supabase SQL Editor
 * - These shifts will be created for the first store in the system
 * - Shifts are marked as active by default
 * - Morning shift: 08:00 - 17:00 (9 hours)
 * - Evening shift: 17:00 - 02:00 (9 hours, overnight)
 */

DO $$
DECLARE
  first_store_id UUID;
BEGIN
  -- Get the first store ID
  SELECT id INTO first_store_id FROM stores LIMIT 1;
  
  -- If no store exists, we can't create shifts
  IF first_store_id IS NULL THEN
    RAISE NOTICE 'No store found. Please create a store first.';
    RETURN;
  END IF;
  
  -- Create Morning Shift (08:00 - 17:00, 9 hours)
  IF NOT EXISTS (
    SELECT 1 FROM shift_definitions 
    WHERE store_id = first_store_id 
    AND shift_type = 'morning'
  ) THEN
    INSERT INTO shift_definitions (
      store_id,
      shift_type,
      start_time,
      end_time,
      duration_hours,
      is_active
    )
    VALUES (
      first_store_id,
      'morning',
      '08:00',
      '17:00',
      9,
      true
    );
    RAISE NOTICE 'Morning shift created successfully';
  ELSE
    RAISE NOTICE 'Morning shift already exists';
  END IF;
  
  -- Create Evening Shift (17:00 - 02:00, 9 hours - overnight)
  IF NOT EXISTS (
    SELECT 1 FROM shift_definitions 
    WHERE store_id = first_store_id 
    AND shift_type = 'evening'
  ) THEN
    INSERT INTO shift_definitions (
      store_id,
      shift_type,
      start_time,
      end_time,
      duration_hours,
      is_active
    )
    VALUES (
      first_store_id,
      'evening',
      '17:00',
      '02:00',
      9,
      true
    );
    RAISE NOTICE 'Evening shift created successfully';
  ELSE
    RAISE NOTICE 'Evening shift already exists';
  END IF;
  
END $$;

-- Verify shifts were created
SELECT 
  id,
  store_id,
  shift_type,
  start_time,
  end_time,
  duration_hours,
  is_active,
  created_at
FROM shift_definitions
ORDER BY shift_type;

