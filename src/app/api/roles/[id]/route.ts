/**
 * API route for individual role operations
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth-helpers';
import { getCurrentUserWithRole } from '@/lib/get-current-user-with-role';
import { logAuditAction } from '@/lib/audit-logger';
import { UpdateRoleRequest, ApiResponse, Role, Permission } from '@/types';
import { canPerformAction } from '@/utils/validators';
import { transformRole } from '@/utils/supabase-helpers';

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

    // Check permission to update roles (only Store Manager)
    const permissionCheck = canPerformAction(
      currentUser.id,
      Permission.CRUD_ROLE,
      { type: 'role', id: params.id },
      currentUser
    );

    if (!permissionCheck.allowed) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: {
          code: 'PERMISSION_DENIED',
          message: permissionCheck.reason || 'Only Store Managers can update roles'
        }
      }, { status: 403 });
    }

    const supabase = createServerClient();
    const body: UpdateRoleRequest = await request.json();

    // Check if role exists and is editable
    const { data: existingRole, error: fetchError } = await supabase
      .from('roles')
      .select('*')
      .eq('id', params.id)
      .single();

    if (fetchError) throw fetchError;
    if (!existingRole) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: {
          code: 'ROLE_NOT_FOUND',
          message: 'Role not found'
        }
      }, { status: 404 });
    }

    if (!existingRole.is_editable) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: {
          code: 'ROLE_NOT_EDITABLE',
          message: 'This role cannot be edited'
        }
      }, { status: 400 });
    }

    // Get a valid UUID from users table
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .limit(1)
      .single();
    
    const currentUserId = existingUser?.id;

    const updateData: any = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.permissions !== undefined) updateData.permissions = body.permissions;
    if (body.defaultTaskPreferences !== undefined) updateData.default_task_preferences = body.defaultTaskPreferences;
    if (body.defaultExperienceLevel !== undefined) updateData.default_experience_level = body.defaultExperienceLevel;
    if (body.defaultPPType !== undefined) updateData.default_pp_type = body.defaultPPType;
    if (body.isEditable !== undefined) updateData.is_editable = body.isEditable;
    updateData.updated_by = currentUserId;

    const { data, error } = await supabase
      .from('roles')
      .update(updateData)
      .eq('id', params.id)
      .select()
      .single();

    if (error) throw error;

    // Transform snake_case to camelCase
    const transformedRole = transformRole(data);
    const oldRole = transformRole(existingRole);

    // Create audit log - track what changed
    const changes: Record<string, { old: any; new: any }> = {};
    if (body.name !== undefined && body.name !== oldRole.name) {
      changes.name = { old: oldRole.name, new: body.name };
    }
    if (body.permissions !== undefined && JSON.stringify(body.permissions) !== JSON.stringify(oldRole.permissions)) {
      changes.permissions = { old: oldRole.permissions, new: body.permissions };
    }
    if (body.description !== undefined && body.description !== oldRole.description) {
      changes.description = { old: oldRole.description, new: body.description };
    }

    await logAuditAction(
      request,
      currentUser.id,
      currentUser.storeId,
      'UPDATE_ROLE',
      'role',
      transformedRole.id,
      {
        entityName: transformedRole.name,
        changes: Object.keys(changes).length > 0 ? changes : undefined
      }
    );

    return NextResponse.json<ApiResponse<Role>>({
      success: true,
      data: transformedRole
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

    // Check permission to delete roles (only Store Manager)
    const permissionCheck = canPerformAction(
      currentUser.id,
      Permission.CRUD_ROLE,
      { type: 'role', id: params.id },
      currentUser
    );

    if (!permissionCheck.allowed) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: {
          code: 'PERMISSION_DENIED',
          message: permissionCheck.reason || 'Only Store Managers can delete roles'
        }
      }, { status: 403 });
    }

    const supabase = createServerClient();

    // Check if role has assigned users
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id')
      .eq('role_id', params.id)
      .is('deleted_at', null);

    if (usersError) throw usersError;

    if (users && users.length > 0) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: {
          code: 'DELETE_NOT_ALLOWED',
          message: `Cannot delete role because ${users.length} user(s) are assigned to it`,
          details: {
            affectedUsers: users.map(u => u.id)
          }
        }
      }, { status: 400 });
    }

    // Get role name before deletion for audit log
    const { data: roleToDelete } = await supabase
      .from('roles')
      .select('name')
      .eq('id', params.id)
      .single();

    const { error } = await supabase
      .from('roles')
      .delete()
      .eq('id', params.id);

    if (error) throw error;

    // Create audit log
    await logAuditAction(
      request,
      currentUser.id,
      currentUser.storeId,
      'DELETE_ROLE',
      'role',
      params.id,
      {
        entityName: roleToDelete?.name || 'Unknown Role'
      }
    );

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
