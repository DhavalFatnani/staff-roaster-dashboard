/**
 * API route for individual shift definition operations
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth-helpers';
import { getCurrentUserWithRole } from '@/lib/get-current-user-with-role';
import { logAuditAction } from '@/lib/audit-logger';
import { ApiResponse, ShiftDefinition } from '@/types';

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Verify authentication
    const authResult = await requireAuth(request);
    if (authResult.error) {
      return authResult.error;
    }

    const currentUserResult = await getCurrentUserWithRole(request);
    if (currentUserResult.error) {
      return currentUserResult.error;
    }
    const currentUser = currentUserResult.user;

    const supabase = createServerClient();
    const body = await request.json();

    // Check if shift definition exists and belongs to user's store
    const { data: existing, error: fetchError } = await supabase
      .from('shift_definitions')
      .select('*')
      .eq('id', params.id)
      .eq('store_id', currentUser.storeId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Shift definition not found'
        }
      }, { status: 404 });
    }

    // Calculate duration if times are provided
    let durationHours = existing.duration_hours;
    if (body.startTime && body.endTime) {
      const start = new Date(`2000-01-01T${body.startTime}`);
      const end = new Date(`2000-01-01T${body.endTime}`);
      if (end < start) {
        end.setDate(end.getDate() + 1);
      }
      const durationMs = end.getTime() - start.getTime();
      durationHours = Math.round(durationMs / (1000 * 60 * 60) * 10) / 10;
    }

    // Validate max 10 hours
    if (durationHours > 10) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Shift duration cannot exceed 10 hours'
        }
      }, { status: 400 });
    }

    // Check for duplicate shift name if changing it
    if (body.name && body.name.trim() !== existing.name) {
      const { data: duplicate } = await supabase
        .from('shift_definitions')
        .select('id')
        .eq('store_id', currentUser.storeId)
        .eq('name', body.name.trim())
        .neq('id', params.id)
        .single();

      if (duplicate) {
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `Shift name "${body.name}" already exists for this store`
          }
        }, { status: 400 });
      }
    }

    const updateData: any = {};
    if (body.name !== undefined) {
      updateData.name = body.name.trim();
      // Also update shift_type for backward compatibility during migration
      const shiftTypeFallback = body.name.toLowerCase().includes('morning') ? 'morning' : 
                                body.name.toLowerCase().includes('evening') ? 'evening' : 
                                existing.shift_type || 'morning';
      updateData.shift_type = shiftTypeFallback;
    }
    if (body.startTime !== undefined) updateData.start_time = body.startTime;
    if (body.endTime !== undefined) updateData.end_time = body.endTime;
    if (durationHours !== undefined) updateData.duration_hours = durationHours;
    if (body.isActive !== undefined) updateData.is_active = body.isActive;

    const { data, error } = await supabase
      .from('shift_definitions')
      .update(updateData)
      .eq('id', params.id)
      .select()
      .single();

    if (error) throw error;

    const shiftDefinition: ShiftDefinition = {
      id: data.id,
      storeId: data.store_id,
      name: data.name || data.shift_type || 'Unnamed Shift', // Fallback for migration period
      startTime: data.start_time,
      endTime: data.end_time,
      durationHours: data.duration_hours,
      isActive: data.is_active,
      displayOrder: data.display_order ?? undefined,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at)
    };

    // Create audit log - track what changed
    const changes: Record<string, { old: any; new: any }> = {};
    if (body.name !== undefined && body.name.trim() !== existing.name) {
      changes.name = { old: existing.name, new: body.name.trim() };
    }
    if (body.startTime !== undefined && body.startTime !== existing.start_time) {
      changes.startTime = { old: existing.start_time, new: body.startTime };
    }
    if (body.endTime !== undefined && body.endTime !== existing.end_time) {
      changes.endTime = { old: existing.end_time, new: body.endTime };
    }
    // Track duration if it changed (either explicitly or due to time changes)
    if (durationHours !== existing.duration_hours) {
      changes.durationHours = { old: existing.duration_hours, new: durationHours };
    }
    if (body.isActive !== undefined && body.isActive !== existing.is_active) {
      changes.isActive = { old: existing.is_active, new: body.isActive };
    }

    await logAuditAction(
      request,
      currentUser.id,
      currentUser.storeId,
      'UPDATE_SHIFT_DEFINITION',
      'shift_definition',
      shiftDefinition.id,
      {
        entityName: shiftDefinition.name,
        changes: Object.keys(changes).length > 0 ? changes : undefined
      }
    );

    return NextResponse.json<ApiResponse<ShiftDefinition>>({
      success: true,
      data: shiftDefinition
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
    // Verify authentication
    const authResult = await requireAuth(request);
    if (authResult.error) {
      return authResult.error;
    }

    const currentUserResult = await getCurrentUserWithRole(request);
    if (currentUserResult.error) {
      return currentUserResult.error;
    }
    const currentUser = currentUserResult.user;

    const supabase = createServerClient();

    // Check if shift definition exists and belongs to user's store
    const { data: existing, error: fetchError } = await supabase
      .from('shift_definitions')
      .select('*')
      .eq('id', params.id)
      .eq('store_id', currentUser.storeId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Shift definition not found'
        }
      }, { status: 404 });
    }

    // Soft delete by setting is_active to false
    const { error } = await supabase
      .from('shift_definitions')
      .update({ is_active: false })
      .eq('id', params.id);

    if (error) throw error;

    // Create audit log
    await logAuditAction(
      request,
      currentUser.id,
      currentUser.storeId,
      'DELETE_SHIFT_DEFINITION',
      'shift_definition',
      params.id,
      {
        entityName: existing.name || 'Unknown Shift'
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

