/**
 * API route for bulk user import
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth-helpers';
import { getCurrentUserWithRole } from '@/lib/get-current-user-with-role';
import { logAuditAction } from '@/lib/audit-logger';
import { syncUserEmailToAuth } from '@/lib/sync-user-email';
import { BulkImportUserRequest, ApiResponse } from '@/types';
import { validateEmail, validateWeekOffsCount, validateEmployeeId } from '@/utils/validators';
import { transformUsers } from '@/utils/supabase-helpers';

export async function POST(request: NextRequest) {
  try {
    // Get current user with role for audit logging
    const currentUserResult = await getCurrentUserWithRole(request);
    if (currentUserResult.error) {
      return currentUserResult.error;
    }
    const currentUser = currentUserResult.user;

    const supabase = createServerClient();
    const body: BulkImportUserRequest = await request.json();

    // Get a valid UUID from users table
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, store_id')
      .limit(1)
      .single();
    
    if (!existingUser) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'No users found. Please create your first user via SQL script first (see SETUP.md).'
        }
      }, { status: 401 });
    }
    
    const storeId = currentUser.storeId;

    // Get all existing users for validation
    const { data: allUsersData } = await supabase
      .from('users')
      .select('*, roles(*)')
      .is('deleted_at', null);
    
    const allUsers = transformUsers(allUsersData || []);

    let created = 0;
    let skipped = 0;
    const errors: any[] = [];

    for (let i = 0; i < body.users.length; i++) {
      const userData = body.users[i];
      
      try {
        // Validate required fields first
        if (!userData.employeeId || !userData.employeeId.trim()) {
          errors.push({
            row: i + 1,
            employeeId: userData.employeeId || 'unknown',
            error: 'Employee ID is required'
          });
          continue;
        }

        if (!userData.firstName || !userData.firstName.trim()) {
          errors.push({
            row: i + 1,
            employeeId: userData.employeeId,
            error: 'First name is required'
          });
          continue;
        }

        // Last name can be empty, default to empty string if missing
        if (!userData.lastName) {
          userData.lastName = '';
        }

        if (!userData.roleId) {
          errors.push({
            row: i + 1,
            employeeId: userData.employeeId,
            error: 'Role ID is required'
          });
          continue;
        }

        if (!userData.experienceLevel) {
          errors.push({
            row: i + 1,
            employeeId: userData.employeeId,
            error: 'Experience level is required'
          });
          continue;
        }

        // Email validation - optional for all roles (can be added later by SM, SI, IE)
        const emailValidation = validateEmail(userData.email, true);
        if (!emailValidation.valid) {
          errors.push({
            row: i + 1,
            employeeId: userData.employeeId,
            error: emailValidation.errors[0].message
          });
          continue;
        }

        // Check for duplicates within the current import batch
        const duplicateInBatch = body.users.slice(0, i).find((u: any) => 
          u.employeeId && u.employeeId.toLowerCase() === userData.employeeId?.toLowerCase()
        );
        
        if (duplicateInBatch) {
          const duplicateRow = body.users.findIndex((u: any) => 
            u.employeeId && u.employeeId.toLowerCase() === userData.employeeId?.toLowerCase()
          ) + 1;
          errors.push({
            row: i + 1,
            employeeId: userData.employeeId,
            error: `Duplicate employee ID "${userData.employeeId}" found in import batch (already at row ${duplicateRow})`
          });
          continue;
        }

        const employeeIdValidation = validateEmployeeId(
          userData.employeeId,
          allUsers || []
        );
        if (!employeeIdValidation.valid) {
          if (body.skipDuplicates) {
            skipped++;
            continue;
          }
          errors.push({
            row: i + 1,
            employeeId: userData.employeeId,
            error: employeeIdValidation.errors[0].message
          });
          continue;
        }

        // Week offs count validation (0-7)
        const weekOffsCount = userData.weekOffsCount !== undefined ? userData.weekOffsCount : 0;
        const weekOffsValidation = validateWeekOffsCount(weekOffsCount);
        if (!weekOffsValidation.valid) {
          errors.push({
            row: i + 1,
            employeeId: userData.employeeId,
            error: weekOffsValidation.errors[0].message
          });
          continue;
        }

        // Create auth user first (required because users.id references auth.users.id)
        // Generate temporary email if not provided
        const tempEmail = userData.email?.trim() || `temp-${userData.employeeId.toLowerCase().replace(/[^a-z0-9]/g, '-')}@temp.local`;
        // Generate a secure random password
        const tempPassword = `Temp${userData.employeeId}${Math.random().toString(36).slice(-8)}!`;
        
        // Create auth user using Supabase Admin API
        const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
          email: tempEmail,
          password: tempPassword,
          email_confirm: true, // Auto-confirm email
          user_metadata: {
            employee_id: userData.employeeId,
            first_name: userData.firstName,
            last_name: userData.lastName
          }
        });

        if (authError || !authUser?.user?.id) {
          errors.push({
            row: i + 1,
            employeeId: userData.employeeId,
            error: `Failed to create auth user: ${authError?.message || 'Unknown error'}`
          });
          continue;
        }

        const authUserId = authUser.user.id;

        // Insert user record with the auth user's UUID
        const { error: insertError } = await supabase
          .from('users')
          .insert({
            id: authUserId, // Use the auth user's UUID
            employee_id: userData.employeeId.trim(),
            first_name: userData.firstName.trim(),
            last_name: userData.lastName.trim(),
            email: userData.email?.trim() || null, // Optional for all roles (can be added later by SM, SI, IE)
            phone: userData.phone?.trim() || null,
            role_id: userData.roleId,
            store_id: storeId,
            experience_level: userData.experienceLevel,
            pp_type: userData.ppType || null,
            week_offs_count: weekOffsCount,
            default_shift_preference: userData.defaultShiftPreference || null,
            created_by: currentUserId
          });

        if (insertError) {
          // If user record creation fails, try to clean up the auth user
          await supabase.auth.admin.deleteUser(authUserId);
          errors.push({
            row: i + 1,
            employeeId: userData.employeeId,
            error: insertError.message || 'Database error'
          });
          continue;
        }

        // Sync email to auth.users if a real email was provided (not temp email)
        if (userData.email?.trim()) {
          const syncResult = await syncUserEmailToAuth(authUserId, userData.email.trim());
          if (!syncResult.success) {
            // Log warning but don't fail - user was created successfully
            console.warn(`Failed to sync email to auth.users for user ${authUserId}:`, syncResult.error);
          }
        }

        created++;
      } catch (err: any) {
        errors.push({
          row: i + 1,
          employeeId: userData.employeeId,
          error: err.message || 'Unknown error'
        });
      }
    }

    // Create audit log for bulk import
    if (created > 0) {
      await logAuditAction(
        request,
        currentUser.id,
        currentUser.storeId,
        'BULK_IMPORT_USERS',
        'user',
        'bulk-import', // Use a special ID for bulk operations
        {
          entityName: `Bulk Import: ${created} user(s) created`,
          metadata: {
            totalAttempted: body.users.length,
            created,
            skipped,
            errorsCount: errors.length,
            skipDuplicates: body.skipDuplicates || false
          }
        }
      );
    }

    return NextResponse.json<ApiResponse<{ created: number; skipped: number; errors: any[] }>>({
      success: true,
      data: {
        created,
        skipped,
        errors
      }
    });
  } catch (error: any) {
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message
      }
    }, { status: 500 });
  }
}
