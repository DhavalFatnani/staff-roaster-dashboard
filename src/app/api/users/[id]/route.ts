/**
 * API route for individual user operations
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth-helpers';
import { getCurrentUserWithRole } from '@/lib/get-current-user-with-role';
import { syncUserEmailToAuth } from '@/lib/sync-user-email';
import { logAuditAction } from '@/lib/audit-logger';
import { UpdateUserRequest, ApiResponse, User, Permission } from '@/types';
import { validateEmail, validateWeekOffsCount, canPerformAction } from '@/utils/validators';
import { transformUser } from '@/utils/supabase-helpers';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Verify authentication
    const authResult = await requireAuth(request);
    if (authResult.error) {
      return authResult.error;
    }

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('users')
      .select('*, roles(*)')
      .eq('id', params.id)
      .is('deleted_at', null)
      .single();

    if (error) throw error;
    if (!data) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found'
        }
      }, { status: 404 });
    }

    // Transform snake_case to camelCase
    const transformedUser = transformUser(data);

    return NextResponse.json<ApiResponse<User>>({
      success: true,
      data: transformedUser
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

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get current user with role for permission check
    const currentUserResult = await getCurrentUserWithRole(request);
    if (currentUserResult.error) {
      return currentUserResult.error;
    }
    const currentUser = currentUserResult.user;

    const supabase = createServerClient();
    
    // Get target user for permission check
    const { data: targetUserData, error: targetError } = await supabase
      .from('users')
      .select('*, roles(*)')
      .eq('id', params.id)
      .single();

    if (targetError || !targetUserData) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found'
        }
      }, { status: 404 });
    }

    const targetUser = transformUser(targetUserData);

    // Check permission to update users
    const permissionCheck = canPerformAction(
      currentUser.id,
      Permission.CRUD_USER,
      { type: 'user', id: params.id },
      currentUser,
      targetUser
    );

    if (!permissionCheck.allowed) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: {
          code: 'PERMISSION_DENIED',
          message: permissionCheck.reason || 'You do not have permission to update this user'
        }
      }, { status: 403 });
    }

    const body: UpdateUserRequest = await request.json();

    // Validation - email is optional, but if provided must be valid
    // SM, SI, IE can add/update emails for any user
    if (body.email !== undefined && body.email !== null && body.email.trim() !== '') {
      const emailValidation = validateEmail(body.email, false);
      if (!emailValidation.valid) {
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: emailValidation.errors[0].message
          }
        }, { status: 400 });
      }
    }

    if (body.weekOffsCount !== undefined) {
      const weekOffsValidation = validateWeekOffsCount(body.weekOffsCount);
      if (!weekOffsValidation.valid) {
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: weekOffsValidation.errors[0].message
          }
        }, { status: 400 });
      }
    }

    // Get a valid UUID from auth.users or users table
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    let currentUserId = authUsers?.users?.[0]?.id;
    
    if (!currentUserId) {
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .limit(1)
        .single();
      
      if (existingUser) {
        currentUserId = existingUser.id;
      }
    }

    const updateData: any = {};
    if (body.firstName !== undefined) updateData.first_name = body.firstName;
    if (body.lastName !== undefined) updateData.last_name = body.lastName;
    // Allow setting email to null/empty (SM, SI, IE can add/update emails)
    if (body.email !== undefined) updateData.email = body.email || null;
    if (body.phone !== undefined) updateData.phone = body.phone || null;
    if (body.roleId !== undefined) updateData.role_id = body.roleId;
    if (body.experienceLevel !== undefined) updateData.experience_level = body.experienceLevel;
    if (body.ppType !== undefined) updateData.pp_type = body.ppType;
    if (body.weekOffsCount !== undefined) updateData.week_offs_count = body.weekOffsCount;
    if (body.weekOffDays !== undefined) {
      // Check if user has "Picker Packer (Ad-Hoc)" role - they cannot have weekoffs
      const roleName = targetUserData.roles?.name;
      if (roleName === 'Picker Packer (Ad-Hoc)') {
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          error: {
            code: 'INVALID_WEEKOFF_DAYS',
            message: 'Picker Packer (Ad-Hoc) users are not allowed to have weekoffs'
          }
        }, { status: 400 });
      }

      // Ensure weekOffDays is a valid array of integers (0-6)
      // Maximum 1 weekoff day allowed per staff member
      if (Array.isArray(body.weekOffDays)) {
        // If trying to set weekoffs (non-empty array), validate
        if (body.weekOffDays.length > 0) {
          // Validate all values are between 0-6
          const validDays = body.weekOffDays.filter(day => 
            typeof day === 'number' && day >= 0 && day <= 6
          );
          // Remove duplicates
          const uniqueDays = [...new Set(validDays)];
          
          // Enforce maximum of 1 weekoff day
          if (uniqueDays.length > 1) {
            return NextResponse.json<ApiResponse<null>>({
              success: false,
              error: {
                code: 'INVALID_WEEKOFF_DAYS',
                message: 'Maximum 1 weekoff day allowed per staff member'
              }
            }, { status: 400 });
          }
          
          updateData.week_offs = uniqueDays;
        } else {
          // Empty array - clearing weekoffs (allowed even for Ad-Hoc, but we already checked above)
          updateData.week_offs = [];
        }
      } else {
        updateData.week_offs = [];
      }
    }
    if (body.defaultShiftPreference !== undefined) {
      updateData.default_shift_preference = body.defaultShiftPreference || null;
    }
    if (body.isActive !== undefined) updateData.is_active = body.isActive;
    updateData.updated_by = currentUserId;

    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', params.id)
      .select('*, roles(*)')
      .single();

    if (error) {
      console.error('Supabase update error:', error);
      throw error;
    }

    // Sync email to auth.users if email was updated
    if (body.email !== undefined) {
      const emailToSync = body.email || null;
      const syncResult = await syncUserEmailToAuth(params.id, emailToSync);
      
      if (!syncResult.success) {
        // Log warning but don't fail the request - email update in users table succeeded
        console.warn(`Failed to sync email to auth.users for user ${params.id}:`, syncResult.error);
        // Optionally, you could return a warning in the response
      }
    }

    // Transform snake_case to camelCase
    const transformedUser = transformUser(data);

    // Create audit log - track what changed
    const changes: Record<string, { old: any; new: any }> = {};
    const oldUser = targetUser;
    
    // Get role names for better display
    let oldRoleName = oldUser.role?.name || 'Unknown';
    let newRoleName = oldRoleName;
    if (body.roleId !== undefined && body.roleId !== oldUser.roleId) {
      const { data: newRole } = await supabase
        .from('roles')
        .select('name')
        .eq('id', body.roleId)
        .single();
      newRoleName = newRole?.name || 'Unknown';
    }
    
    if (body.firstName !== undefined && body.firstName !== oldUser.firstName) {
      changes.firstName = { old: oldUser.firstName, new: body.firstName };
    }
    if (body.lastName !== undefined && body.lastName !== oldUser.lastName) {
      changes.lastName = { old: oldUser.lastName, new: body.lastName };
    }
    if (body.email !== undefined && body.email !== oldUser.email) {
      changes.email = { old: oldUser.email || null, new: body.email || null };
    }
    if (body.phone !== undefined && body.phone !== oldUser.phone) {
      changes.phone = { old: oldUser.phone || null, new: body.phone || null };
    }
    if (body.roleId !== undefined && body.roleId !== oldUser.roleId) {
      changes.role = { old: oldRoleName, new: newRoleName };
    }
    if (body.experienceLevel !== undefined && body.experienceLevel !== oldUser.experienceLevel) {
      changes.experienceLevel = { old: oldUser.experienceLevel, new: body.experienceLevel };
    }
    if (body.ppType !== undefined && body.ppType !== oldUser.ppType) {
      changes.ppType = { old: oldUser.ppType || null, new: body.ppType || null };
    }
    if (body.isActive !== undefined && body.isActive !== oldUser.isActive) {
      changes.isActive = { old: oldUser.isActive, new: body.isActive };
    }
    if (body.weekOffsCount !== undefined && body.weekOffsCount !== oldUser.weekOffsCount) {
      changes.weekOffsCount = { old: oldUser.weekOffsCount, new: body.weekOffsCount };
    }
    if (body.defaultShiftPreference !== undefined && body.defaultShiftPreference !== oldUser.defaultShiftPreference) {
      changes.defaultShiftPreference = { old: oldUser.defaultShiftPreference || null, new: body.defaultShiftPreference || null };
    }
    if (body.weekOffDays !== undefined) {
      const oldWeekOffs = oldUser.weekOffDays || [];
      const newWeekOffs = Array.isArray(body.weekOffDays) ? body.weekOffDays : [];
      // Only log if actually changed
      if (JSON.stringify(oldWeekOffs.sort()) !== JSON.stringify(newWeekOffs.sort())) {
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const formatDays = (days: number[]) => {
          if (days.length === 0) return 'None';
          return days.map(d => dayNames[d]).join(', ');
        };
        changes.weekOffDays = { 
          old: formatDays(oldWeekOffs), 
          new: formatDays(newWeekOffs) 
        };
      }
    }

    await logAuditAction(
      request,
      currentUser.id,
      currentUser.storeId,
      'UPDATE_USER',
      'user',
      transformedUser.id,
      {
        entityName: `${transformedUser.firstName} ${transformedUser.lastName} (${transformedUser.employeeId})`,
        changes: Object.keys(changes).length > 0 ? changes : undefined
      }
    );

    return NextResponse.json<ApiResponse<User>>({
      success: true,
      data: transformedUser
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // PATCH is the same as PUT for partial updates - reuse PUT logic
  return PUT(request, { params });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get current user with role for permission check
    const currentUserResult = await getCurrentUserWithRole(request);
    if (currentUserResult.error) {
      return currentUserResult.error;
    }
    const currentUser = currentUserResult.user;

    const supabase = createServerClient();
    
    // Get target user for permission check
    const { data: targetUserData, error: targetError } = await supabase
      .from('users')
      .select('*, roles(*)')
      .eq('id', params.id)
      .single();

    if (targetError || !targetUserData) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found'
        }
      }, { status: 404 });
    }

    const targetUser = transformUser(targetUserData);

    // Check permission to delete users
    const permissionCheck = canPerformAction(
      currentUser.id,
      Permission.CRUD_USER,
      { type: 'user', id: params.id },
      currentUser,
      targetUser
    );

    if (!permissionCheck.allowed) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: {
          code: 'PERMISSION_DENIED',
          message: permissionCheck.reason || 'You do not have permission to delete this user'
        }
      }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const { reassignTo, confirmVacancy, deletionReason } = body;

    // Get a valid UUID from users table
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .limit(1)
      .single();
    
    const currentUserId = existingUser?.id;

    // Soft delete
    const { error } = await supabase
      .from('users')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: currentUserId,
        deletion_reason: deletionReason,
        is_active: false
      })
      .eq('id', params.id);

    if (error) throw error;

    // Create audit log
    await logAuditAction(
      request,
      currentUser.id,
      currentUser.storeId,
      'DELETE_USER',
      'user',
      params.id,
      {
        entityName: `${targetUser.firstName} ${targetUser.lastName} (${targetUser.employeeId})`,
        metadata: {
          deletionReason,
          reassignTo,
          confirmVacancy
        }
      }
    );

    // TODO: Handle reassignment of roster slots if needed

    return NextResponse.json<ApiResponse<{ success: boolean }>>({
      success: true,
      data: { success: true }
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
