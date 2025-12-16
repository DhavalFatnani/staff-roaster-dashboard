-- Diagnostic query for specific user: 02abd19c-e8f3-4d20-9f6c-e15375ed3eca
-- Run this in Supabase SQL Editor to check this user's email status

-- Check this specific user's email status
SELECT 
  u.id,
  u.employee_id,
  u.first_name,
  u.last_name,
  u.email as users_table_email,
  au.email as auth_users_email,
  au.email_confirmed_at,
  au.created_at as auth_user_created_at,
  u.created_at as user_created_at,
  u.deleted_at,
  u.is_active,
  CASE 
    WHEN u.deleted_at IS NOT NULL THEN '❌ User is deleted'
    WHEN u.is_active = false THEN '⚠️ User is inactive'
    WHEN au.email IS NULL THEN '❌ Email missing in auth.users'
    WHEN au.email != u.email THEN '⚠️ Email mismatched'
    WHEN au.email LIKE 'temp-%@temp.local' THEN '❌ Temporary email (temp-*@temp.local)'
    WHEN au.email_confirmed_at IS NULL THEN '⚠️ Email not confirmed'
    WHEN u.email IS NULL THEN '❌ No email in users table'
    ELSE '✅ Email should work'
  END as status,
  CASE 
    WHEN au.email IS NULL THEN 'Run: UPDATE auth.users SET email = (SELECT email FROM users WHERE id = ''02abd19c-e8f3-4d20-9f6c-e15375ed3eca''), email_confirmed_at = NOW() WHERE id = ''02abd19c-e8f3-4d20-9f6c-e15375ed3eca'';'
    WHEN au.email != u.email THEN 'Run: UPDATE auth.users SET email = (SELECT email FROM users WHERE id = ''02abd19c-e8f3-4d20-9f6c-e15375ed3eca''), email_confirmed_at = NOW() WHERE id = ''02abd19c-e8f3-4d20-9f6c-e15375ed3eca'';'
    WHEN au.email_confirmed_at IS NULL THEN 'Run: UPDATE auth.users SET email_confirmed_at = NOW() WHERE id = ''02abd19c-e8f3-4d20-9f6c-e15375ed3eca'';'
    WHEN au.email LIKE 'temp-%@temp.local' THEN 'Update email via User Management page in the app'
    ELSE 'No action needed'
  END as fix_action
FROM users u
LEFT JOIN auth.users au ON u.id = au.id
WHERE u.id = '02abd19c-e8f3-4d20-9f6c-e15375ed3eca';

-- Check if user exists in auth.users at all
SELECT 
  id,
  email,
  email_confirmed_at,
  created_at,
  CASE 
    WHEN email IS NULL THEN '❌ No email'
    WHEN email LIKE 'temp-%@temp.local' THEN '❌ Temporary email'
    WHEN email_confirmed_at IS NULL THEN '⚠️ Email not confirmed'
    ELSE '✅ Email OK'
  END as email_status
FROM auth.users
WHERE id = '02abd19c-e8f3-4d20-9f6c-e15375ed3eca';

-- Quick fix: Sync email for this user (run this if email is missing or mismatched)
-- UPDATE auth.users au
-- SET 
--   email = u.email,
--   email_confirmed_at = CASE 
--     WHEN u.email IS NOT NULL AND au.email_confirmed_at IS NULL THEN NOW()
--     ELSE au.email_confirmed_at
--   END,
--   updated_at = NOW()
-- FROM users u
-- WHERE 
--   au.id = '02abd19c-e8f3-4d20-9f6c-e15375ed3eca'
--   AND u.id = '02abd19c-e8f3-4d20-9f6c-e15375ed3eca'
--   AND u.deleted_at IS NULL
--   AND u.email IS NOT NULL
--   AND (au.email IS NULL OR au.email != u.email);

