/**
 * API route to initialize default shifts (morning and evening)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth-helpers';
import { getCurrentUserWithRole } from '@/lib/get-current-user-with-role';
import { logAuditAction } from '@/lib/audit-logger';
import { ApiResponse, ShiftDefinition } from '@/types';

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

    // Check if shifts already exist
    const { data: existingShifts } = await supabase
      .from('shift_definitions')
      .select('name')
      .eq('store_id', currentUser.storeId);

    const existingNames = (existingShifts || []).map(s => s.name);
    const shiftsToCreate: Array<{ name: string; start_time: string; end_time: string; duration_hours: number }> = [];

    // Add morning shift if it doesn't exist
    if (!existingNames.includes('Morning Shift')) {
      shiftsToCreate.push({
        name: 'Morning Shift',
        start_time: '08:00',
        end_time: '17:00',
        duration_hours: 9
      });
    }

    // Add evening shift if it doesn't exist
    if (!existingNames.includes('Evening Shift')) {
      shiftsToCreate.push({
        name: 'Evening Shift',
        start_time: '17:00',
        end_time: '02:00',
        duration_hours: 9
      });
    }

    if (shiftsToCreate.length === 0) {
      return NextResponse.json<ApiResponse<ShiftDefinition[]>>({
        success: true,
        data: []
      });
    }

    // Create the shifts
    const shiftsWithStoreId = shiftsToCreate.map(shift => ({
      ...shift,
      store_id: currentUser.storeId,
      is_active: true
    }));

    const { data: createdShifts, error } = await supabase
      .from('shift_definitions')
      .insert(shiftsWithStoreId)
      .select();

    if (error) throw error;

    const shiftDefinitions: ShiftDefinition[] = (createdShifts || []).map((sd: any) => ({
      id: sd.id,
      storeId: sd.store_id,
      name: sd.name,
      startTime: sd.start_time,
      endTime: sd.end_time,
      durationHours: sd.duration_hours,
      isActive: sd.is_active,
      createdAt: new Date(sd.created_at),
      updatedAt: new Date(sd.updated_at)
    }));

    // Create audit log for each shift created
    if (shiftDefinitions.length > 0) {
      for (const shift of shiftDefinitions) {
        await logAuditAction(
          request,
          currentUser.id,
          currentUser.storeId,
          'CREATE_SHIFT_DEFINITION',
          'shift_definition',
          shift.id,
          {
            entityName: shift.name,
            changes: {
              name: { old: null, new: shift.name },
              startTime: { old: null, new: shift.startTime },
              endTime: { old: null, new: shift.endTime }
            },
            metadata: {
              initialized: true
            }
          }
        );
      }
    }

    return NextResponse.json<ApiResponse<ShiftDefinition[]>>({
      success: true,
      data: shiftDefinitions,
        // message: `Successfully created ${shiftDefinitions.length} default shift(s)` // ApiResponse doesn't have message field
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

