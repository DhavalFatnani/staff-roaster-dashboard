-- Script to create default roles including PP (Picker Packer) roles
-- Run this in Supabase SQL Editor
-- This will create all default roles if they don't exist

DO $$
DECLARE
  auth_user_id UUID;
BEGIN
  -- Get the first auth user to use as created_by
  SELECT id INTO auth_user_id FROM auth.users LIMIT 1;
  
  -- If no auth user, try to get from users table
  IF auth_user_id IS NULL THEN
    SELECT id INTO auth_user_id FROM users LIMIT 1;
  END IF;
  
  -- Use a generated UUID if still no user found (for initial setup)
  IF auth_user_id IS NULL THEN
    auth_user_id := gen_random_uuid();
  END IF;
  
  -- Create Store Manager role
  IF NOT EXISTS (SELECT 1 FROM roles WHERE name = 'Store Manager') THEN
    INSERT INTO roles (id, name, description, permissions, is_editable, is_system_role, created_by)
    VALUES (
      gen_random_uuid(),
      'Store Manager',
      'Full administrative access to all features',
      ARRAY[
        'CRUD_USER', 'CRUD_ROLE', 'VIEW_ALL_STAFF', 'ASSIGN_SHIFT',
        'CREATE_ROSTER', 'MODIFY_ROSTER', 'PUBLISH_ROSTER', 'DELETE_ROSTER',
        'VIEW_ROSTER', 'ASSIGN_TASK', 'MODIFY_TASK', 'MANAGE_SETTINGS',
        'MANAGE_SHIFT_DEFINITIONS', 'MANAGE_ROSTER_TEMPLATES', 'EXPORT_ROSTER',
        'SHARE_ROSTER', 'VIEW_AUDIT_LOG', 'VIEW_REPORTS', 'DELETE_SM_USER',
        'DEMOTE_SM_USER', 'MANAGE_AD_HOC_PP'
      ]::text[],
      false,
      true,
      auth_user_id
    );
  END IF;
  
  -- Create Shift In Charge role
  IF NOT EXISTS (SELECT 1 FROM roles WHERE name = 'Shift In Charge') THEN
    INSERT INTO roles (id, name, description, permissions, is_editable, is_system_role, created_by)
    VALUES (
      gen_random_uuid(),
      'Shift In Charge',
      'Elevated user with staff management and roster creation capabilities',
      ARRAY[
        'VIEW_OWN_STAFF', 'CRUD_USER', 'ASSIGN_SHIFT', 'CREATE_ROSTER',
        'MODIFY_ROSTER', 'ASSIGN_TASK', 'VIEW_ROSTER', 'EXPORT_ROSTER',
        'MANAGE_AD_HOC_PP'
      ]::text[],
      true,
      true,
      auth_user_id
    );
  END IF;
  
  -- Create Inventory Executive role
  IF NOT EXISTS (SELECT 1 FROM roles WHERE name = 'Inventory Executive') THEN
    INSERT INTO roles (id, name, description, permissions, is_editable, is_system_role, created_by)
    VALUES (
      gen_random_uuid(),
      'Inventory Executive',
      'Manages inventory and stock-related tasks. Can add/update emails for staff.',
      ARRAY[
        'VIEW_ROSTER', 'ASSIGN_TASK', 'VIEW_REPORTS', 'CRUD_USER'
      ]::text[],
      true,
      false,
      auth_user_id
    );
  END IF;
  
  -- Create Picker Packer (Warehouse) role
  IF NOT EXISTS (SELECT 1 FROM roles WHERE name = 'Picker Packer (Warehouse)') THEN
    INSERT INTO roles (id, name, description, permissions, default_experience_level, default_pp_type, is_editable, is_system_role, created_by)
    VALUES (
      gen_random_uuid(),
      'Picker Packer (Warehouse)',
      'In-store picking and packing operations',
      ARRAY['VIEW_ROSTER']::text[],
      'fresher',
      'warehouse',
      true,
      false,
      auth_user_id
    );
  END IF;
  
  -- Create Picker Packer (Ad-Hoc) role
  IF NOT EXISTS (SELECT 1 FROM roles WHERE name = 'Picker Packer (Ad-Hoc)') THEN
    INSERT INTO roles (id, name, description, permissions, default_experience_level, default_pp_type, is_editable, is_system_role, created_by)
    VALUES (
      gen_random_uuid(),
      'Picker Packer (Ad-Hoc)',
      'Temporary or seasonal picking and packing staff',
      ARRAY['VIEW_ROSTER']::text[],
      'fresher',
      'adHoc',
      true,
      false,
      auth_user_id
    );
  END IF;
  
  -- Create generic Picker Packer role (if needed)
  IF NOT EXISTS (SELECT 1 FROM roles WHERE name = 'Picker Packer') THEN
    INSERT INTO roles (id, name, description, permissions, default_experience_level, is_editable, is_system_role, created_by)
    VALUES (
      gen_random_uuid(),
      'Picker Packer',
      'General picking and packing operations',
      ARRAY['VIEW_ROSTER']::text[],
      'fresher',
      true,
      false,
      auth_user_id
    );
  END IF;
  
END $$;

-- Verify roles were created
SELECT id, name, description, is_system_role FROM roles ORDER BY name;
