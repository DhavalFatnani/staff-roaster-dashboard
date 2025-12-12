/**
 * API route for role CRUD operations
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { CreateRoleRequest, UpdateRoleRequest, ApiResponse, Role } from '@/types';
import { transformRoles, transformRole } from '@/utils/supabase-helpers';

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('roles')
      .select('*')
      .order('name');

    if (error) throw error;

    // Transform snake_case to camelCase
    const transformedRoles = transformRoles(data || []);

    return NextResponse.json<ApiResponse<Role[]>>({
      success: true,
      data: transformedRoles
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
    const supabase = createServerClient();
    const body: CreateRoleRequest = await request.json();

    // Get a valid UUID from users table (safer than using admin API)
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .limit(1)
      .single();
    
    if (!existingUser) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'No users found. Please create a user first, then you can create roles.'
        }
      }, { status: 401 });
    }
    
    const currentUserId = existingUser.id;

    const { data: newRole, error } = await supabase
      .from('roles')
      .insert({
        name: body.name,
        description: body.description,
        permissions: body.permissions,
        default_task_preferences: body.defaultTaskPreferences,
        default_experience_level: body.defaultExperienceLevel,
        default_pp_type: body.defaultPPType,
        is_editable: true,
        is_system_role: false,
        created_by: currentUserId
      })
      .select()
      .single();

    if (error) throw error;

    // Transform snake_case to camelCase
    const transformedRole = transformRole(newRole);

    return NextResponse.json<ApiResponse<Role>>({
      success: true,
      data: transformedRole
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
