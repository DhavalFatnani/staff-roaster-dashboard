/**
 * API route for shift definitions
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { ApiResponse, ShiftDefinition, ShiftType } from '@/types';

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();
    
    // Get store_id from first user
    const { data: firstUser } = await supabase
      .from('users')
      .select('store_id')
      .limit(1)
      .single();

    if (!firstUser) {
      return NextResponse.json<ApiResponse<ShiftDefinition[]>>({
        success: true,
        data: []
      });
    }

    const { data, error } = await supabase
      .from('shift_definitions')
      .select('*')
      .eq('store_id', firstUser.store_id)
      .eq('is_active', true)
      .order('shift_type', { ascending: true });

    if (error) throw error;

    const shiftDefinitions: ShiftDefinition[] = (data || []).map((sd: any) => ({
      id: sd.id,
      storeId: sd.store_id,
      shiftType: sd.shift_type as ShiftType,
      startTime: sd.start_time,
      endTime: sd.end_time,
      durationHours: sd.duration_hours,
      isActive: sd.is_active,
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
