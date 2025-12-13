/**
 * API route for individual user operations
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { UpdateUserRequest, ApiResponse, User } from '@/types';
import { validateEmail, validateWeekOffsCount } from '@/utils/validators';
import { transformUser } from '@/utils/supabase-helpers';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
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
    const supabase = createServerClient();
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
      // Ensure weekOffDays is a valid array of integers (0-6)
      // Maximum 1 weekoff day allowed per staff member
      if (Array.isArray(body.weekOffDays)) {
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
        
        updateData.week_offs = uniqueDays.length > 0 ? uniqueDays : [];
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
    const supabase = createServerClient();
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
