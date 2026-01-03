/**
 * API route for ending test environment session
 * Deletes all test users and related data
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth-helpers';
import { getCurrentUserWithRole } from '@/lib/get-current-user-with-role';
import { createAuditLog } from '@/lib/audit-logger';

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

    // Find all test users (employee_id starts with TEST-)
    const { data: testUsers, error: fetchError } = await supabase
      .from('users')
      .select('id, employee_id')
      .like('employee_id', 'TEST-%')
      .is('deleted_at', null);

    if (fetchError) throw fetchError;

    if (!testUsers || testUsers.length === 0) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'NO_TEST_SESSION',
          message: 'No active test session found',
        },
      }, { status: 400 });
    }

    const testUserIds = testUsers.map(u => u.id);
    const deletedCount = testUserIds.length;

    // Get the earliest test user creation time BEFORE deleting users (needed for audit log cleanup)
    const { data: earliestTestUser } = await supabase
      .from('users')
      .select('created_at')
      .in('id', testUserIds)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    // Find all rosters that were created/modified by test users OR have "- TEST" in their name
    // First, get roster IDs created/updated by test users
    const testRosterIds: string[] = [];
    
    if (testUserIds.length > 0) {
      const { data: testRostersByUsers } = await supabase
        .from('rosters')
        .select('id')
        .eq('store_id', storeId)
        .in('created_by', testUserIds);

      if (testRostersByUsers) {
        testRosterIds.push(...testRostersByUsers.map(r => r.id));
      }

      const { data: testRostersByUpdaters } = await supabase
        .from('rosters')
        .select('id')
        .eq('store_id', storeId)
        .in('updated_by', testUserIds);

      if (testRostersByUpdaters) {
        testRosterIds.push(...testRostersByUpdaters.map(r => r.id));
      }
    }

    // Also find rosters with "- TEST" in their name (from audit logs entity_name field)
    const { data: testRosterAudits } = await supabase
      .from('audit_logs')
      .select('entity_id')
      .eq('store_id', storeId)
      .eq('entity_type', 'roster')
      .like('entity_name', '%- TEST');

    if (testRosterAudits) {
      const testRosterIdsFromAudits = testRosterAudits.map(a => a.entity_id).filter(Boolean) as string[];
      testRosterIds.push(...testRosterIdsFromAudits);
    }

    // Remove duplicates
    const uniqueTestRosterIds = [...new Set(testRosterIds)];

    // Delete roster slots for test rosters first (foreign key constraint)
    if (uniqueTestRosterIds.length > 0) {
      const { error: slotDeleteError } = await supabase
        .from('roster_slots')
        .delete()
        .in('roster_id', uniqueTestRosterIds);

      if (slotDeleteError) {
        console.error('Error deleting test roster slots:', slotDeleteError);
      }

      // Delete test rosters
      const { error: rosterDeleteError } = await supabase
        .from('rosters')
        .delete()
        .in('id', uniqueTestRosterIds);

      if (rosterDeleteError) {
        console.error('Error deleting test rosters:', rosterDeleteError);
      }
    }

    // Delete roster slots for test users (user_id references)
    if (testUserIds.length > 0) {
      const { error: slotDeleteError2 } = await supabase
        .from('roster_slots')
        .delete()
        .in('user_id', testUserIds);

      if (slotDeleteError2) {
        console.error('Error deleting test user roster slots:', slotDeleteError2);
      }

      // Delete roster slots with actual_user_id as test users
      const { error: actualSlotDeleteError } = await supabase
        .from('roster_slots')
        .delete()
        .in('actual_user_id', testUserIds);

      if (actualSlotDeleteError) {
        console.error('Error deleting test actuals:', actualSlotDeleteError);
      }
    }

    // Delete audit logs created during test mode (except TESTING_ENVIRONMENT_TRIGGER and TESTING_ENVIRONMENT_ENDED)
    // This must happen BEFORE deleting test users so we can query them
    if (earliestTestUser?.created_at) {
      const { error: auditLogDeleteError } = await supabase
        .from('audit_logs')
        .delete()
        .eq('store_id', storeId)
        .gte('timestamp', earliestTestUser.created_at)
        .neq('action', 'TESTING_ENVIRONMENT_TRIGGER')
        .neq('action', 'TESTING_ENVIRONMENT_ENDED');

      if (auditLogDeleteError) {
        console.error('Error deleting test audit logs:', auditLogDeleteError);
      }
    }

    // Now delete test users from auth (this will cascade delete user records due to ON DELETE CASCADE)
    for (const userId of testUserIds) {
      try {
        await supabase.auth.admin.deleteUser(userId);
      } catch (error) {
        console.error(`Failed to delete auth user ${userId}:`, error);
        // Continue with other users even if one fails
      }
    }

    // Also manually delete user records (in case cascade doesn't work as expected)
    if (testUserIds.length > 0) {
      const { error: deleteError } = await supabase
        .from('users')
        .delete()
        .in('id', testUserIds);

      if (deleteError) {
        console.error('Error deleting test users:', deleteError);
        // Continue anyway as auth users are already deleted
      }
    }

    // Log test session end (this is one of the only logs during test mode)
    await createAuditLog({
      userId: currentUser.id,
      storeId: storeId,
      action: 'TESTING_ENVIRONMENT_ENDED' as any,
      entityType: 'settings' as any,
      entityId: 'test-environment',
      entityName: 'Test Environment',
      metadata: {
        usersDeleted: deletedCount,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        deletedCount,
      },
    });
  } catch (error: any) {
    console.error('Error ending test environment:', error);
    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to end test environment',
      },
    }, { status: 500 });
  }
}

