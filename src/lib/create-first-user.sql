-- Script to create your first user
-- Run this AFTER you've created a user in Supabase Authentication

-- Step 1: Create a user in Supabase Authentication first
-- Go to Authentication > Users > Add user
-- Note down the user's UUID (id) from the auth.users table

-- Step 2: Get your user's UUID from auth.users
-- You can find it in: Authentication > Users > [Your User] > UUID
-- Or run: SELECT id FROM auth.users WHERE email = 'your-email@example.com';

-- Step 3: Get a role ID (create a role first if needed)
-- First, let's create default roles if they don't exist:
INSERT INTO roles (id, name, description, permissions, is_editable, is_system_role, created_by)
SELECT 
  gen_random_uuid(),
  'Store Manager',
  'Full administrative access',
  ARRAY[]::text[],
  false,
  true,
  (SELECT id FROM auth.users LIMIT 1) -- Use first auth user as creator
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'Store Manager')
ON CONFLICT DO NOTHING;

INSERT INTO roles (id, name, description, permissions, is_editable, is_system_role, created_by)
SELECT 
  gen_random_uuid(),
  'Shift In Charge',
  'Elevated user with staff management',
  ARRAY[]::text[],
  true,
  true,
  (SELECT id FROM auth.users LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'Shift In Charge')
ON CONFLICT DO NOTHING;

-- Step 4: Create a store if it doesn't exist
INSERT INTO stores (id, name, timezone, settings)
SELECT 
  gen_random_uuid(),
  'Main Store',
  'UTC',
  '{}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM stores LIMIT 1)
ON CONFLICT DO NOTHING;

-- Step 5: Create the user record
-- Replace these values:
-- - 'YOUR-AUTH-USER-UUID' with the UUID from auth.users
-- - 'SM001' with your desired employee ID
-- - 'John' and 'Manager' with the user's name
-- - 'john@example.com' with the user's email
-- - The role_id with the Store Manager role ID

INSERT INTO users (
  id,
  employee_id,
  first_name,
  last_name,
  email,
  role_id,
  store_id,
  experience_level,
  week_offs,
  created_by
)
SELECT 
  auth_user.id,                    -- Use the auth user's UUID
  'SM001',                         -- Employee ID
  'John',                          -- First name
  'Manager',                       -- Last name
  auth_user.email,                 -- Email (should match auth user)
  (SELECT id FROM roles WHERE name = 'Store Manager' LIMIT 1),  -- Role ID
  (SELECT id FROM stores LIMIT 1), -- Store ID
  'experienced',                   -- Experience level
  ARRAY[0, 6],                     -- Week offs (Sunday and Saturday)
  auth_user.id                     -- Created by (self)
FROM auth.users auth_user
WHERE auth_user.email = 'your-email@example.com'  -- Replace with your email
  AND NOT EXISTS (
    SELECT 1 FROM users WHERE id = auth_user.id
  );

-- Alternative: If you know your auth user UUID, use this simpler version:
/*
INSERT INTO users (
  id,
  employee_id,
  first_name,
  last_name,
  email,
  role_id,
  store_id,
  experience_level,
  week_offs,
  created_by
)
VALUES (
  'YOUR-AUTH-USER-UUID-HERE',  -- Replace with your auth.users UUID
  'SM001',
  'John',
  'Manager',
  'john@example.com',
  (SELECT id FROM roles WHERE name = 'Store Manager' LIMIT 1),
  (SELECT id FROM stores LIMIT 1),
  'experienced',
  ARRAY[0, 6],
  'YOUR-AUTH-USER-UUID-HERE'   -- Same UUID as id
);
*/
