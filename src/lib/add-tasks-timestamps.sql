/**
 * add-tasks-timestamps.sql
 * 
 * Purpose: Add created_at and updated_at columns to the tasks table
 * 
 * Run notes:
 * - Run this script in your Supabase SQL Editor
 * - This adds timestamp columns for audit and tracking purposes
 * - Existing tasks will get the current timestamp for created_at
 */

-- Add created_at column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tasks' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE tasks 
    ADD COLUMN created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
    
    -- Set created_at for existing tasks to current time
    UPDATE tasks 
    SET created_at = NOW() 
    WHERE created_at IS NULL;
  END IF;
END $$;

-- Add updated_at column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tasks' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE tasks 
    ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
    
    -- Set updated_at for existing tasks to current time
    UPDATE tasks 
    SET updated_at = NOW() 
    WHERE updated_at IS NULL;
  END IF;
END $$;

-- Create trigger to automatically update updated_at on row changes
CREATE OR REPLACE FUNCTION update_tasks_updated_at()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Drop trigger if it exists and recreate it
DROP TRIGGER IF EXISTS tasks_updated_at_trigger ON tasks;
CREATE TRIGGER tasks_updated_at_trigger
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_tasks_updated_at();

-- Verify the columns were added
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'tasks'
  AND column_name IN ('created_at', 'updated_at')
ORDER BY column_name;
