/**
 * API route for individual task operations
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth-helpers';
import { getCurrentUserWithRole } from '@/lib/get-current-user-with-role';
import { logAuditAction } from '@/lib/audit-logger';
import { ApiResponse, Task, ExperienceLevel } from '@/types';

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get current user with role for audit logging
    const currentUserResult = await getCurrentUserWithRole(request);
    if (currentUserResult.error) {
      return currentUserResult.error;
    }
    const currentUser = currentUserResult.user;

    const supabase = createServerClient();
    const body = await request.json();

    // Check if task exists
    const { data: existing, error: fetchError } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', params.id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Task not found'
        }
      }, { status: 404 });
    }

    const updateData: any = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.category !== undefined) updateData.category = body.category;
    if (body.requiredExperience !== undefined) updateData.required_experience = body.requiredExperience;
    if (body.estimatedDuration !== undefined) updateData.estimated_duration = body.estimatedDuration;
    if (body.isActive !== undefined) updateData.is_active = body.isActive;

    const { data, error } = await supabase
      .from('tasks')
      .update(updateData)
      .eq('id', params.id)
      .select()
      .single();

    if (error) throw error;

    const task: Task = {
      id: data.id,
      name: data.name,
      description: data.description,
      category: data.category,
      requiredExperience: data.required_experience as ExperienceLevel | undefined,
      estimatedDuration: data.estimated_duration,
      isActive: data.is_active
    };

    // Create audit log - track what changed
    const changes: Record<string, { old: any; new: any }> = {};
    if (body.name !== undefined && body.name !== existing.name) {
      changes.name = { old: existing.name, new: body.name };
    }
    if (body.description !== undefined && body.description !== existing.description) {
      changes.description = { old: existing.description || null, new: body.description || null };
    }
    if (body.category !== undefined && body.category !== existing.category) {
      changes.category = { old: existing.category, new: body.category };
    }
    if (body.requiredExperience !== undefined && body.requiredExperience !== existing.required_experience) {
      changes.requiredExperience = { old: existing.required_experience || null, new: body.requiredExperience || null };
    }
    if (body.estimatedDuration !== undefined && body.estimatedDuration !== existing.estimated_duration) {
      changes.estimatedDuration = { old: existing.estimated_duration || null, new: body.estimatedDuration || null };
    }
    if (body.isActive !== undefined && body.isActive !== existing.is_active) {
      changes.isActive = { old: existing.is_active, new: body.isActive };
    }

    await logAuditAction(
      request,
      currentUser.id,
      currentUser.storeId,
      'UPDATE_TASK',
      'task',
      task.id,
      {
        entityName: task.name,
        changes: Object.keys(changes).length > 0 ? changes : undefined
      }
    );

    return NextResponse.json<ApiResponse<Task>>({
      success: true,
      data: task
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
    // Get current user with role for audit logging
    const currentUserResult = await getCurrentUserWithRole(request);
    if (currentUserResult.error) {
      return currentUserResult.error;
    }
    const currentUser = currentUserResult.user;

    const supabase = createServerClient();

    // Check if task exists
    const { data: existing, error: fetchError } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', params.id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Task not found'
        }
      }, { status: 404 });
    }

    // Soft delete by setting is_active to false
    const { error } = await supabase
      .from('tasks')
      .update({ is_active: false })
      .eq('id', params.id);

    if (error) throw error;

    // Create audit log
    await logAuditAction(
      request,
      currentUser.id,
      currentUser.storeId,
      'DELETE_TASK',
      'task',
      params.id,
      {
        entityName: existing.name
      }
    );

    return NextResponse.json<ApiResponse<null>>({
      success: true,
      data: null
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

