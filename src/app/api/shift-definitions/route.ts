/**
 * API route for shift definitions
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth-helpers';
import { getCurrentUserWithRole } from '@/lib/get-current-user-with-role';
import { logAuditAction } from '@/lib/audit-logger';
import { ApiResponse, ShiftDefinition } from '@/types';

export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const authResult = await requireAuth(request);
    if (authResult.error) {
      return authResult.error;
    }

    const supabase = createServerClient();
    
    // Get store_id from current user
    const currentUserResult = await getCurrentUserWithRole(request);
    if (currentUserResult.error) {
      return currentUserResult.error;
    }
    const currentUser = currentUserResult.user;

    // Check if we want all shifts or just active ones
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';

    let query = supabase
      .from('shift_definitions')
      .select('*')
      .eq('store_id', currentUser.storeId)
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true });

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    let { data, error } = await query;

    // If error is about display_order column not existing, retry without it
    if (error && (error.message?.includes('display_order') || error.code === '42703' || error.message?.includes('column') && error.message?.includes('does not exist'))) {
      // Retry query without display_order ordering
      let fallbackQuery = supabase
        .from('shift_definitions')
        .select('*')
        .eq('store_id', currentUser.storeId)
        .order('name', { ascending: true });
      
      if (!includeInactive) {
        fallbackQuery = fallbackQuery.eq('is_active', true);
      }
      
      const fallbackResult = await fallbackQuery;
      data = fallbackResult.data;
      error = fallbackResult.error;
    }

    if (error) throw error;

    const shiftDefinitions: ShiftDefinition[] = (data || []).map((sd: any) => ({
      id: sd.id,
      storeId: sd.store_id,
      name: sd.name || sd.shift_type || 'Unnamed Shift', // Fallback for migration period
      startTime: sd.start_time,
      endTime: sd.end_time,
      durationHours: sd.duration_hours,
      isActive: sd.is_active,
      displayOrder: sd.display_order ?? undefined,
      createdAt: new Date(sd.created_at),
      updatedAt: new Date(sd.updated_at)
    }));

    return NextResponse.json<ApiResponse<ShiftDefinition[]>>({
      success: true,
      data: shiftDefinitions
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

    // Validate required fields
    if (!body.name || !body.startTime || !body.endTime) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'name, startTime, and endTime are required'
        }
      }, { status: 400 });
    }

    // Calculate duration in hours
    const start = new Date(`2000-01-01T${body.startTime}`);
    const end = new Date(`2000-01-01T${body.endTime}`);
    if (end < start) {
      // Handle overnight shifts
      end.setDate(end.getDate() + 1);
    }
    const durationMs = end.getTime() - start.getTime();
    const durationHours = Math.round(durationMs / (1000 * 60 * 60) * 10) / 10; // Round to 1 decimal

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

    // Check if shift name already exists for this store
    const { data: existing } = await supabase
      .from('shift_definitions')
      .select('id')
      .eq('store_id', currentUser.storeId)
      .eq('name', body.name.trim())
      .maybeSingle();

    if (existing) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `Shift name "${body.name}" already exists for this store`
        }
      }, { status: 400 });
    }

    // Set display_order to the next available number if not provided
    let displayOrder = body.displayOrder;
    if (displayOrder === undefined) {
      const { data: maxOrderData } = await supabase
        .from('shift_definitions')
        .select('display_order')
        .eq('store_id', currentUser.storeId)
        .order('display_order', { ascending: false })
        .limit(1)
        .maybeSingle();
      displayOrder = (maxOrderData?.display_order ?? 0) + 1;
    }
    
    const { data, error } = await supabase
      .from('shift_definitions')
      .insert({
        store_id: currentUser.storeId,
        name: body.name.trim(),
        start_time: body.startTime,
        end_time: body.endTime,
        duration_hours: durationHours,
        is_active: body.isActive !== undefined ? body.isActive : true,
        display_order: displayOrder
      })
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

    // Create audit log
    await logAuditAction(
      request,
      currentUser.id,
      currentUser.storeId,
      'CREATE_SHIFT_DEFINITION',
      'shift_definition',
      shiftDefinition.id,
      {
        entityName: shiftDefinition.name,
        changes: {
          name: { old: null, new: shiftDefinition.name },
          startTime: { old: null, new: shiftDefinition.startTime },
          endTime: { old: null, new: shiftDefinition.endTime }
        }
      }
    );

    return NextResponse.json<ApiResponse<ShiftDefinition>>({
      success: true,
      data: shiftDefinition
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
