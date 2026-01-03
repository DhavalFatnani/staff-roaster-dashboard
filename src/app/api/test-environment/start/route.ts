/**
 * API route for starting test environment session
 * Creates test users with specified role ratios
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth-helpers';
import { getCurrentUserWithRole } from '@/lib/get-current-user-with-role';
import { createAuditLog } from '@/lib/audit-logger';
import { ExperienceLevel, PPType } from '@/types';

// Test user configuration with role ratios
const TEST_USER_CONFIG = [
  { roleName: 'Store Manager', count: 1 },
  { roleName: 'Shift In Charge', count: 2 },
  { roleName: 'Inventory Executive', count: 4 },
  { roleName: 'Dispatcher', count: 2 },
  { roleName: 'Picker Packer (Warehouse)', count: 10 },
  { roleName: 'Picker Packer (Ad-Hoc)', count: 6 },
];

// Random first names for test users
const FIRST_NAMES = [
  'Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Avery', 'Quinn',
  'Blake', 'Cameron', 'Dakota', 'Drew', 'Emery', 'Finley', 'Hayden', 'Jamie',
  'Kendall', 'Logan', 'Micah', 'Parker', 'Reese', 'Sage', 'Skylar', 'Tatum'
];

// Random last names for test users
const LAST_NAMES = [
  'Anderson', 'Brown', 'Davis', 'Garcia', 'Harris', 'Jackson', 'Johnson', 'Jones',
  'Lee', 'Martin', ' Martinez', 'Miller', 'Moore', 'Robinson', 'Smith', 'Taylor',
  'Thomas', 'Thompson', 'Walker', 'White', 'Williams', 'Wilson', 'Young', 'Clark'
];

function getRandomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function generateRandomPhone(): string {
  return `+1-555-${Math.floor(1000 + Math.random() * 9000)}`;
}

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const authResult = await requireAuth(request);
    if (authResult.error) {
      return authResult.error;
    }

    // Get current user with role
    const currentUserResult = await getCurrentUserWithRole(request);
    if (currentUserResult.error) {
      return currentUserResult.error;
    }
    const currentUser = currentUserResult.user;
    const storeId = currentUser.storeId;

    const supabase = createServerClient();

    // Check if test session already exists
    const { data: existingTestUsers } = await supabase
      .from('users')
      .select('id, employee_id')
      .like('employee_id', 'TEST-%')
      .is('deleted_at', null);

    if (existingTestUsers && existingTestUsers.length > 0) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'TEST_SESSION_EXISTS',
          message: 'Test session already active. Please end the existing session first.',
        },
      }, { status: 400 });
    }

    // Get all roles
    const { data: rolesData, error: rolesError } = await supabase
      .from('roles')
      .select('id, name');

    if (rolesError) throw rolesError;

    const rolesMap = new Map(rolesData?.map(r => [r.name, r.id]) || []);

    // Verify all required roles exist
    const missingRoles: string[] = [];
    TEST_USER_CONFIG.forEach(config => {
      if (!rolesMap.has(config.roleName)) {
        missingRoles.push(config.roleName);
      }
    });

    if (missingRoles.length > 0) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'MISSING_ROLES',
          message: `Required roles not found: ${missingRoles.join(', ')}`,
        },
      }, { status: 400 });
    }

    const createdUserIds: string[] = [];
    let testUserCounter = 1;

    // Create test users for each role configuration
    for (const config of TEST_USER_CONFIG) {
      const roleId = rolesMap.get(config.roleName)!;

      for (let i = 0; i < config.count; i++) {
        const firstName = getRandomElement(FIRST_NAMES);
        const lastName = getRandomElement(LAST_NAMES);
        const employeeId = `TEST-${String(testUserCounter).padStart(3, '0')}`;
        testUserCounter++;

        // Determine experience level and PP type based on role
        let experienceLevel = getRandomElement([ExperienceLevel.EXPERIENCED, ExperienceLevel.FRESHER]);
        let ppType: PPType | undefined = undefined;
        let weekOffsCount = Math.floor(Math.random() * 3) + 1; // 1-3 days

        if (config.roleName.includes('Picker Packer')) {
          if (config.roleName.includes('Warehouse')) {
            ppType = PPType.WAREHOUSE;
          } else if (config.roleName.includes('Ad-Hoc')) {
            ppType = PPType.AD_HOC;
            weekOffsCount = 0; // Ad-Hoc PP users cannot have weekoffs
          }
          experienceLevel = getRandomElement([ExperienceLevel.EXPERIENCED, ExperienceLevel.FRESHER]);
        }

        // Create auth user
        const tempEmail = `test-${employeeId.toLowerCase()}@test.local`;
        const tempPassword = `Test${employeeId}${Math.random().toString(36).slice(-8)}!`;

        const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
          email: tempEmail,
          password: tempPassword,
          email_confirm: true,
          user_metadata: {
            employee_id: employeeId,
            first_name: firstName,
            last_name: lastName,
          },
        });

        if (authError || !authUser?.user?.id) {
          console.error(`Failed to create auth user for ${employeeId}:`, authError);
          continue;
        }

        const authUserId = authUser.user.id;

        // Create user record
        const { data: newUser, error: userError } = await supabase
          .from('users')
          .insert({
            id: authUserId,
            employee_id: employeeId,
            first_name: firstName,
            last_name: lastName,
            email: null, // No real email for test users
            phone: generateRandomPhone(),
            role_id: roleId,
            store_id: storeId,
            experience_level: experienceLevel,
            pp_type: ppType || null,
            week_offs_count: weekOffsCount,
            default_shift_preference: null,
            is_active: true,
            created_by: currentUser.id,
          })
          .select('id')
          .single();

        if (userError) {
          // Clean up auth user if user record creation fails
          await supabase.auth.admin.deleteUser(authUserId);
          console.error(`Failed to create user record for ${employeeId}:`, userError);
          continue;
        }

        createdUserIds.push(newUser.id);
      }
    }

    // Log test session start (this is one of the only logs during test mode)
    await createAuditLog({
      userId: currentUser.id,
      storeId: storeId,
      action: 'TESTING_ENVIRONMENT_TRIGGER' as any,
      entityType: 'settings' as any,
      entityId: 'test-environment',
      entityName: 'Test Environment',
      metadata: {
        userIdsCreated: createdUserIds,
        userCount: createdUserIds.length,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        userIds: createdUserIds,
        userCount: createdUserIds.length,
      },
    });
  } catch (error: any) {
    console.error('Error starting test environment:', error);
    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to start test environment',
      },
    }, { status: 500 });
  }
}

