-- Migration script to sync all existing emails from users table to auth.users
-- Run this in Supabase SQL Editor to sync all existing user emails

-- This script updates auth.users.email to match users.email for all users
-- where the emails are different or missing in auth.users

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
  au.id = u.id
  AND u.deleted_at IS NULL
  AND u.email IS NOT NULL
  AND (au.email IS DISTINCT FROM u.email);

-- Show summary of synced emails
SELECT 
  COUNT(*) as total_users_with_email,
  COUNT(CASE WHEN au.email = u.email THEN 1 END) as synced_emails,
  COUNT(CASE WHEN au.email IS DISTINCT FROM u.email THEN 1 END) as mismatched_emails
FROM users u
LEFT JOIN auth.users au ON u.id = au.id
WHERE u.deleted_at IS NULL AND u.email IS NOT NULL;

-- Show any remaining mismatches (for debugging)
SELECT 
  u.id,
  u.employee_id,
  u.email as users_table_email,
  au.email as auth_users_email,
  CASE 
    WHEN au.email IS NULL THEN 'Missing in auth.users'
    WHEN au.email != u.email THEN 'Mismatched'
    ELSE 'Synced'
  END as status
FROM users u
LEFT JOIN auth.users au ON u.id = au.id
WHERE 
  u.deleted_at IS NULL 
  AND u.email IS NOT NULL
  AND (au.email IS NULL OR au.email IS DISTINCT FROM u.email)
ORDER BY u.employee_id;

