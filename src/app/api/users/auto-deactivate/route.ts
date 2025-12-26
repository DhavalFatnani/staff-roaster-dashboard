/**
 * API route for auto-deactivating inactive staff
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth-helpers';
import { getCurrentUserWithRole } from '@/lib/get-current-user-with-role';
import { logAuditAction } from '@/lib/audit-logger';
import { ApiResponse, Permission } from '@/types';
import { canPerformAction } from '@/utils/validators';

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const authResult = await requireAuth(request);
    if (authResult.error) {
      return authResult.error;
    }

    // Get current user with role for permission check
    const currentUserResult = await getCurrentUserWithRole(request);
    if (currentUserResult.error) {
      return currentUserResult.error;
    }
    const currentUser = currentUserResult.user;

    // Check permission - only Store Managers can auto-deactivate
    const canDeactivate = canPerformAction(
      currentUser.id,
      Permission.CRUD_USER,
      { type: 'user' },
      currentUser
    );

    if (!canDeactivate) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: {
          code: 'PERMISSION_DENIED',
          message: 'You do not have permission to deactivate users'
        }
      }, { status: 403 });
    }

    const supabase = createServerClient();
    const body = await request.json();
    const { userIds } = body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'userIds must be a non-empty array'
        }
      }, { status: 400 });
    }

    // Deactivate users and add auto-deactivation note
    const deactivatedIds: string[] = [];
    const errors: string[] = [];

    for (const userId of userIds) {
      try {
        // Get user to verify they exist and belong to the same store
        const { data: user, error: fetchError } = await supabase
          .from('users')
          .select('id, store_id, is_active')
          .eq('id', userId)
          .eq('store_id', currentUser.storeId)
          .single();

        if (fetchError || !user) {
          errors.push(`User ${userId} not found or doesn't belong to your store`);
          continue;
        }

        if (!user.is_active) {
          // User already deactivated
          continue;
        }

        // Deactivate user and add note about auto-deactivation
        const { error: updateError } = await supabase
          .from('users')
          .update({
            is_active: false,
            updated_at: new Date().toISOString(),
            updated_by: currentUser.id
          })
          .eq('id', userId);

        if (updateError) {
          errors.push(`Failed to deactivate user ${userId}: ${updateError.message}`);
          continue;
        }

        // Get user details for audit log
        const { data: userDetails } = await supabase
          .from('users')
          .select('first_name, last_name, employee_id')
          .eq('id', userId)
          .single();

        const userName = userDetails 
          ? `${userDetails.first_name} ${userDetails.last_name} (${userDetails.employee_id})`
          : userId.substring(0, 8);

        // Create audit log entry for auto-deactivation
        await logAuditAction(
          request,
          currentUser.id,
          currentUser.storeId,
          'DEACTIVATE_USER',
          'user',
          userId,
          {
            entityName: userName,
            metadata: {
              reason: 'Auto-deactivated: Staff member not assigned to any roster for 30+ days',
              autoDeactivated: true
            }
          }
        );

        deactivatedIds.push(userId);
      } catch (error: any) {
        errors.push(`Error processing user ${userId}: ${error.message}`);
      }
    }

    // Create summary audit log if multiple users were deactivated
    if (deactivatedIds.length > 1) {
      await logAuditAction(
        request,
        currentUser.id,
        currentUser.storeId,
        'BULK_DEACTIVATE_USERS',
        'user',
        'bulk-deactivate',
        {
          entityName: `Bulk Auto-Deactivate: ${deactivatedIds.length} user(s)`,
          metadata: {
            deactivatedCount: deactivatedIds.length,
            errorsCount: errors.length,
            reason: 'Auto-deactivated: Staff members not assigned to any roster for 30+ days'
          }
        }
      );
    }

    return NextResponse.json<ApiResponse<{ deactivatedCount: number; errors: string[] }>>({
      success: true,
      data: {
        deactivatedCount: deactivatedIds.length,
        errors
      }
    });
  } catch (error: any) {
    console.error('Error in auto-deactivate:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to auto-deactivate users'
      }
    }, { status: 500 });
  }
}

