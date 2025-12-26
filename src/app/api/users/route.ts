/**
 * API route for user CRUD operations
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth-helpers';
import { getCurrentUserWithRole } from '@/lib/get-current-user-with-role';
import { syncUserEmailToAuth } from '@/lib/sync-user-email';
import { logAuditAction } from '@/lib/audit-logger';
import { CreateUserRequest, UpdateUserRequest, ApiResponse, User, Permission } from '@/types';
import { validateEmail, validateWeekOffsCount, canPerformAction } from '@/utils/validators';
import { transformUsers, transformUser } from '@/utils/supabase-helpers';

export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const authResult = await requireAuth(request);
    if (authResult.error) {
      return authResult.error;
    }
    const user = authResult.user;

    const supabase = createServerClient();
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '0'); // 0 means no pagination
    const pageSize = parseInt(searchParams.get('pageSize') || '1000'); // Large default to get all users
    const roleId = searchParams.get('roleId');
    const storeId = searchParams.get('storeId');
    const includeInactive = searchParams.get('includeInactive') === 'true'; // For user management page

    let query = supabase
      .from('users')
      .select('*, roles(*)', { count: 'exact' })
      .is('deleted_at', null);

    // Only filter by is_active if includeInactive is not set (for backward compatibility)
    // When includeInactive=true, we want ALL users (active + inactive) for user management
    if (!includeInactive) {
      query = query.eq('is_active', true);
    }
    
    query = query.order('created_at', { ascending: false }); // Newest first, but we'll get all

    if (roleId) {
      query = query.eq('role_id', roleId);
    }

    if (storeId) {
      query = query.eq('store_id', storeId);
    }

    // If page is 0 or not specified, fetch all users (no pagination)
    let data, error, count;
    if (page === 0) {
      const result = await query;
      data = result.data;
      error = result.error;
      count = result.count;
    } else {
      const result = await query.range((page - 1) * pageSize, page * pageSize - 1);
      data = result.data;
      error = result.error;
      count = result.count;
    }

    if (error) throw error;

    // Transform snake_case to camelCase
    const transformedData = transformUsers(data || []);

    return NextResponse.json<ApiResponse<{ data: User[]; pagination: any }>>({
      success: true,
      data: {
        data: transformedData,
        pagination: {
          page: page || 1,
          pageSize: page === 0 ? transformedData.length : pageSize,
          total: count || transformedData.length,
          totalPages: page === 0 ? 1 : Math.ceil((count || 0) / pageSize)
        }
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

export async function POST(request: NextRequest) {
  try {
    // Get current user with role for permission check
    const currentUserResult = await getCurrentUserWithRole(request);
    if (currentUserResult.error) {
      return currentUserResult.error;
    }
    const currentUser = currentUserResult.user;

    // Check permission to create users
    const permissionCheck = canPerformAction(
      currentUser.id,
      Permission.CRUD_USER,
      { type: 'user' },
      currentUser
    );

    if (!permissionCheck.allowed) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: {
          code: 'PERMISSION_DENIED',
          message: permissionCheck.reason || 'You do not have permission to create users'
        }
      }, { status: 403 });
    }

    const supabase = createServerClient();
    const body: CreateUserRequest = await request.json();

    // Email validation - optional for all roles (can be added later by SM, SI, IE)
    const emailValidation = validateEmail(body.email, true);
    if (!emailValidation.valid) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: emailValidation.errors[0].message,
          details: emailValidation.errors
        }
      }, { status: 400 });
    }

    // Week offs count validation (0-7)
    const weekOffsCount = body.weekOffsCount !== undefined ? body.weekOffsCount : 0;
    const weekOffsValidation = validateWeekOffsCount(weekOffsCount);
    if (!weekOffsValidation.valid) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: weekOffsValidation.errors[0].message
        }
      }, { status: 400 });
    }

    // Check for duplicate employee ID
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('employee_id', body.employeeId)
      .is('deleted_at', null)
      .single();

    if (existing) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `Employee ID "${body.employeeId}" already exists`
        }
      }, { status: 400 });
    }

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
    
    const currentUserId = existingUser.id;

    // Get store_id from current user or use first store
    let storeId = 'store-001';
    if (currentUserId) {
      const { data: currentUser } = await supabase
        .from('users')
        .select('store_id')
        .eq('id', currentUserId)
        .single();
      
      if (currentUser?.store_id) {
        storeId = currentUser.store_id;
      } else {
        // Get first store
        const { data: firstStore } = await supabase
          .from('stores')
          .select('id')
          .limit(1)
          .single();
        
        if (firstStore) {
          storeId = firstStore.id;
        }
      }
    }

    // Create auth user first (required because users.id references auth.users.id)
    // Generate temporary email if not provided
    const tempEmail = body.email?.trim() || `temp-${body.employeeId.toLowerCase().replace(/[^a-z0-9]/g, '-')}@temp.local`;
    // Generate a secure random password
    const tempPassword = `Temp${body.employeeId}${Math.random().toString(36).slice(-8)}!`;
    
    // Create auth user using Supabase Admin API
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: tempEmail,
      password: tempPassword,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        employee_id: body.employeeId,
        first_name: body.firstName,
        last_name: body.lastName
      }
    });

    if (authError || !authUser?.user?.id) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: {
          code: 'AUTH_ERROR',
          message: `Failed to create auth user: ${authError?.message || 'Unknown error'}`
        }
      }, { status: 400 });
    }

    const authUserId = authUser.user.id;

    // Create user record with the auth user's UUID
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        id: authUserId, // Use the auth user's UUID
        employee_id: body.employeeId,
        first_name: body.firstName,
        last_name: body.lastName,
        email: body.email || null, // Optional for all roles (can be added later by SM, SI, IE)
        phone: body.phone || null,
        role_id: body.roleId,
        store_id: storeId,
        experience_level: body.experienceLevel,
        pp_type: body.ppType || null,
        week_offs_count: weekOffsCount,
        default_shift_preference: body.defaultShiftPreference,
        is_active: body.isActive !== undefined ? body.isActive : true,
        created_by: currentUserId
      })
      .select('*, roles(*)')
      .single();

    if (error) {
      // If user record creation fails, try to clean up the auth user
      await supabase.auth.admin.deleteUser(authUserId);
      throw error;
    }

    // Sync email to auth.users if a real email was provided (not temp email)
    if (body.email?.trim()) {
      const syncResult = await syncUserEmailToAuth(authUserId, body.email.trim());
      if (!syncResult.success) {
        // Log warning but don't fail - user was created successfully
        console.warn(`Failed to sync email to auth.users for new user ${authUserId}:`, syncResult.error);
      }
    }

    // Transform snake_case to camelCase
    const transformedUser = transformUser(newUser);

    // Create audit log
    await logAuditAction(
      request,
      currentUserId,
      storeId,
      'CREATE_USER',
      'user',
      transformedUser.id,
      {
        entityName: `${transformedUser.firstName} ${transformedUser.lastName} (${transformedUser.employeeId})`,
        changes: {
          employeeId: { old: null, new: transformedUser.employeeId },
          firstName: { old: null, new: transformedUser.firstName },
          lastName: { old: null, new: transformedUser.lastName },
          roleId: { old: null, new: transformedUser.roleId },
          email: { old: null, new: transformedUser.email }
        }
      }
    );

    return NextResponse.json<ApiResponse<User>>({
      success: true,
      data: transformedUser
    }, { status: 201 });
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
