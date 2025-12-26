-- SQL function and trigger to automatically sync email from users table to auth.users
-- Run this in Supabase SQL Editor

-- Function to sync email to auth.users when users.email is updated
CREATE OR REPLACE FUNCTION sync_email_to_auth_users()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Only sync if email has changed
  IF (OLD.email IS DISTINCT FROM NEW.email) THEN
    -- Update auth.users email using Supabase's auth schema
    -- Note: This requires the service_role key or admin privileges
    -- The trigger runs with the privileges of the function owner
    UPDATE auth.users
    SET 
      email = NEW.email,
      email_confirmed_at = CASE 
        WHEN NEW.email IS NOT NULL THEN COALESCE(email_confirmed_at, NOW())
        ELSE NULL
      END,
      updated_at = NOW()
    WHERE id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger that fires after email update in users table
DROP TRIGGER IF EXISTS trigger_sync_email_to_auth_users ON users;
CREATE TRIGGER trigger_sync_email_to_auth_users
  AFTER UPDATE OF email ON users
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION sync_email_to_auth_users();

-- Also sync on INSERT if email is provided
CREATE OR REPLACE FUNCTION sync_email_on_insert()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    UPDATE auth.users
    SET 
      email = NEW.email,
      email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
      updated_at = NOW()
    WHERE id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_sync_email_on_insert ON users;
CREATE TRIGGER trigger_sync_email_on_insert
  AFTER INSERT ON users
  FOR EACH ROW
  WHEN (NEW.email IS NOT NULL)
  EXECUTE FUNCTION sync_email_on_insert();

-- Grant necessary permissions (adjust as needed for your setup)
-- The SECURITY DEFINER allows the function to run with elevated privileges
-- to update auth.users table

COMMENT ON FUNCTION sync_email_to_auth_users() IS 'Automatically syncs email from users table to auth.users when email is updated';
COMMENT ON FUNCTION sync_email_on_insert() IS 'Automatically syncs email from users table to auth.users when a new user is inserted with an email';

