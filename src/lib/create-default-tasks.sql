/**
 * create-default-tasks.sql
 * 
 * Purpose: Create the 5 default tasks that are common to each shift
 * 
 * Run notes:
 * - Run this script in your Supabase SQL Editor
 * - These tasks will be available for all shifts
 * - Tasks are marked as active by default
 * - You can modify categories, descriptions, and requirements as needed
 */

-- Insert default tasks (check if they exist first to avoid duplicates)
-- These tasks are common to all shifts

-- 1. Order Processing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tasks WHERE name = 'Order Processing') THEN
    INSERT INTO tasks (name, description, category, required_experience, estimated_duration, is_active)
    VALUES (
      'Order Processing',
      'Process customer orders, verify details, and prepare for fulfillment',
      'operations',
      'experienced',
      180,
      true
    );
  END IF;
END $$;

-- 2. Growth Team Escalations
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tasks WHERE name = 'Growth Team Escalations') THEN
    INSERT INTO tasks (name, description, category, required_experience, estimated_duration, is_active)
    VALUES (
      'Growth Team Escalations',
      'Handle escalated customer issues and coordinate with growth team',
      'customer-service',
      'experienced',
      120,
      true
    );
  END IF;
END $$;

-- 3. Inwarding
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tasks WHERE name = 'Inwarding') THEN
    INSERT INTO tasks (name, description, category, required_experience, estimated_duration, is_active)
    VALUES (
      'Inwarding',
      'Receive and process incoming inventory, verify quantities, and update stock',
      'inventory',
      'experienced',
      240,
      true
    );
  END IF;
END $$;

-- 4. Return Processing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tasks WHERE name = 'Return Processing') THEN
    INSERT INTO tasks (name, description, category, required_experience, estimated_duration, is_active)
    VALUES (
      'Return Processing',
      'Process customer returns, inspect items, and update inventory',
      'operations',
      'experienced',
      150,
      true
    );
  END IF;
END $$;

-- 5. Audit
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tasks WHERE name = 'Audit') THEN
    INSERT INTO tasks (name, description, category, required_experience, estimated_duration, is_active)
    VALUES (
      'Audit',
      'Conduct quality audits, verify processes, and document findings',
      'quality',
      'experienced',
      90,
      true
    );
  END IF;
END $$;

-- Verify the tasks were created
SELECT 
  id,
  name,
  description,
  category,
  required_experience,
  estimated_duration,
  is_active,
  created_at,
  updated_at
FROM tasks
WHERE name IN (
  'Order Processing',
  'Growth Team Escalations',
  'Inwarding',
  'Return Processing',
  'Audit'
)
ORDER BY name;
