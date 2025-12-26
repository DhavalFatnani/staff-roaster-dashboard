-- Migration: Change week_offs from INTEGER[] (array of days) to INTEGER (count of days off per week)
-- This supports rotational week-offs where specific days are not fixed

-- Step 1: Drop the existing trigger and function
DROP TRIGGER IF EXISTS validate_users_week_offs ON users;
DROP FUNCTION IF EXISTS validate_user_week_offs();
DROP FUNCTION IF EXISTS validate_week_offs(INTEGER[]);

-- Step 2: Add a new column for week_offs_count
ALTER TABLE users ADD COLUMN IF NOT EXISTS week_offs_count INTEGER DEFAULT 0;

-- Step 3: Migrate existing data (convert array length to count)
-- If week_offs array exists, use its length; otherwise default to 0
UPDATE users 
SET week_offs_count = COALESCE(array_length(week_offs, 1), 0)
WHERE week_offs_count IS NULL;

-- Step 4: Add constraint for week_offs_count (0-7 days per week)
ALTER TABLE users ADD CONSTRAINT check_week_offs_count 
  CHECK (week_offs_count >= 0 AND week_offs_count <= 7);

-- Step 5: Make email nullable (for SM, SI, IE roles that can be added without email)
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
-- Recreate unique constraint that allows NULL (PostgreSQL allows multiple NULLs in unique columns)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(email) WHERE email IS NOT NULL;

-- Step 6: Create new validation function for week_offs_count
CREATE OR REPLACE FUNCTION validate_week_offs_count(week_offs_count_val INTEGER)
RETURNS BOOLEAN 
LANGUAGE plpgsql 
IMMUTABLE
SET search_path = ''
AS $$
BEGIN
  RETURN week_offs_count_val IS NULL OR (week_offs_count_val >= 0 AND week_offs_count_val <= 7);
END;
$$;

-- Step 7: Create trigger to validate week_offs_count
CREATE OR REPLACE FUNCTION validate_user_week_offs_count()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NOT validate_week_offs_count(NEW.week_offs_count) THEN
    RAISE EXCEPTION 'Invalid week_offs_count: must be between 0 and 7';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_users_week_offs_count
  BEFORE INSERT OR UPDATE OF week_offs_count ON users
  FOR EACH ROW
  EXECUTE FUNCTION validate_user_week_offs_count();

-- Step 8: Keep the old week_offs column for backward compatibility (can be removed later)
-- For now, we'll keep it but it won't be used for new records
-- You can drop it later with: ALTER TABLE users DROP COLUMN week_offs;
