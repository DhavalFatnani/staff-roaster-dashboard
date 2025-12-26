-- Cleanup script: Remove weekoffs from Picker Packer (Ad-Hoc) users
-- Ad-Hoc PP users should not have weekoffs as per business rules

-- First, identify users with Ad-Hoc role who have weekoffs
SELECT 
    u.id,
    u.first_name || ' ' || u.last_name as full_name,
    u.employee_id,
    r.name as role_name,
    u.week_offs as current_weekoffs,
    u.week_offs_count
FROM users u
JOIN roles r ON u.role_id = r.id
WHERE r.name = 'Picker Packer (Ad-Hoc)'
  AND (
    (u.week_offs IS NOT NULL AND array_length(u.week_offs, 1) > 0)
    OR u.week_offs_count > 0
  )
  AND u.deleted_at IS NULL;

-- Update: Remove weekoffs from all Ad-Hoc PP users
UPDATE users u
SET 
    week_offs = ARRAY[]::integer[],
    week_offs_count = 0,
    updated_at = NOW()
FROM roles r
WHERE u.role_id = r.id
  AND r.name = 'Picker Packer (Ad-Hoc)'
  AND (
    (u.week_offs IS NOT NULL AND array_length(u.week_offs, 1) > 0)
    OR u.week_offs_count > 0
  )
  AND u.deleted_at IS NULL;

-- Verify cleanup
SELECT 
    COUNT(*) as adhoc_users_with_weekoffs
FROM users u
JOIN roles r ON u.role_id = r.id
WHERE r.name = 'Picker Packer (Ad-Hoc)'
  AND (
    (u.week_offs IS NOT NULL AND array_length(u.week_offs, 1) > 0)
    OR u.week_offs_count > 0
  )
  AND u.deleted_at IS NULL;
-- Should return 0 after cleanup

