-- Diagnostic SQL queries to troubleshoot password reset email issues
-- Run these in Supabase SQL Editor to check your setup

-- 1. Check if users have emails in both tables
SELECT 
  u.id,
  u.employee_id,
  u.email as users_table_email,
  au.email as auth_users_email,
  au.email_confirmed_at,
  CASE 
    WHEN au.email IS NULL THEN '❌ Missing in auth.users'
    WHEN au.email != u.email THEN '⚠️ Mismatched'
    WHEN au.email_confirmed_at IS NULL THEN '⚠️ Email not confirmed'
    ELSE '✅ OK'
  END as status
FROM users u
LEFT JOIN auth.users au ON u.id = au.id
WHERE u.deleted_at IS NULL
ORDER BY u.employee_id;

-- 2. Count users with/without emails
SELECT 
  COUNT(*) as total_users,
  COUNT(CASE WHEN u.email IS NOT NULL THEN 1 END) as users_with_email,
  COUNT(CASE WHEN au.email IS NOT NULL THEN 1 END) as auth_users_with_email,
  COUNT(CASE WHEN u.email IS NOT NULL AND au.email IS NULL THEN 1 END) as missing_in_auth,
  COUNT(CASE WHEN u.email IS DISTINCT FROM au.email THEN 1 END) as mismatched_emails
FROM users u
LEFT JOIN auth.users au ON u.id = au.id
WHERE u.deleted_at IS NULL;

-- 3. Find users with temp emails that need real emails
SELECT 
  u.id,
  u.employee_id,
  u.first_name,
  u.last_name,
  au.email as current_auth_email,
  CASE 
    WHEN au.email LIKE 'temp-%@temp.local' THEN '❌ Temporary email'
    WHEN au.email IS NULL THEN '❌ No email'
    ELSE '✅ Has real email'
  END as email_status
FROM users u
LEFT JOIN auth.users au ON u.id = au.id
WHERE u.deleted_at IS NULL
  AND (au.email IS NULL OR au.email LIKE 'temp-%@temp.local')
ORDER BY u.employee_id;

-- 4. Check email confirmation status
SELECT 
  COUNT(*) as total_auth_users,
  COUNT(CASE WHEN email IS NOT NULL THEN 1 END) as users_with_email,
  COUNT(CASE WHEN email_confirmed_at IS NOT NULL THEN 1 END) as confirmed_emails,
  COUNT(CASE WHEN email IS NOT NULL AND email_confirmed_at IS NULL THEN 1 END) as unconfirmed_emails
FROM auth.users;

-- 5. Check recent password reset attempts (if you have audit logs)
-- This requires your audit_logs table to track password reset requests
-- SELECT * FROM audit_logs 
-- WHERE action = 'PASSWORD_RESET_REQUEST' 
-- ORDER BY timestamp DESC 
-- LIMIT 10;

