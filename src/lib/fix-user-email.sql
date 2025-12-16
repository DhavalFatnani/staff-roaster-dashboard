-- Quick fix script for user: 02abd19c-e8f3-4d20-9f6c-e15375ed3eca
-- This will sync the email from users table to auth.users and confirm it
-- Run this in Supabase SQL Editor

-- Step 1: Check current status (run this first to see what needs fixing)
SELECT 
  u.employee_id,
  u.email as users_table_email,
  au.email as auth_users_email,
  au.email_confirmed_at,
  CASE 
    WHEN au.email IS NULL THEN '❌ Missing in auth.users'
    WHEN au.email != u.email THEN '⚠️ Mismatched'
    WHEN au.email LIKE 'temp-%@temp.local' THEN '❌ Temporary email'
    WHEN au.email_confirmed_at IS NULL THEN '⚠️ Not confirmed'
    ELSE '✅ OK'
  END as status
FROM users u
LEFT JOIN auth.users au ON u.id = au.id
WHERE u.id = '02abd19c-e8f3-4d20-9f6c-e15375ed3eca'
  AND u.deleted_at IS NULL;

-- Step 2: Fix the email (uncomment and run this to fix)
UPDATE auth.users au
SET 
  email = u.email,
  email_confirmed_at = CASE 
    WHEN u.email IS NOT NULL AND au.email_confirmed_at IS NULL THEN NOW()
    ELSE au.email_confirmed_at
  END,
  updated_at = NOW()
FROM users u
WHERE 
  au.id = '02abd19c-e8f3-4d20-9f6c-e15375ed3eca'
  AND u.id = '02abd19c-e8f3-4d20-9f6c-e15375ed3eca'
  AND u.deleted_at IS NULL
  AND u.email IS NOT NULL
  AND u.email NOT LIKE 'temp-%@temp.local'
  AND (au.email IS NULL OR au.email != u.email OR au.email_confirmed_at IS NULL);

-- Step 3: Verify the fix (run this after Step 2 to confirm)
SELECT 
  u.employee_id,
  u.email as users_table_email,
  au.email as auth_users_email,
  au.email_confirmed_at,
  CASE 
    WHEN au.email = u.email AND au.email_confirmed_at IS NOT NULL THEN '✅ Fixed! Email should work now'
    WHEN au.email IS NULL THEN '❌ Still missing - check if user has email in users table'
    WHEN au.email LIKE 'temp-%@temp.local' THEN '❌ Still temporary - update email via User Management page'
    ELSE '⚠️ Still needs attention'
  END as status
FROM users u
LEFT JOIN auth.users au ON u.id = au.id
WHERE u.id = '02abd19c-e8f3-4d20-9f6c-e15375ed3eca'
  AND u.deleted_at IS NULL;

