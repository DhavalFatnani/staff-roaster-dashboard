/**
 * API route for reordering shift definitions
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth-helpers';
import { getCurrentUserWithRole } from '@/lib/get-current-user-with-role';
import { logAuditAction } from '@/lib/audit-logger';
import { ApiResponse } from '@/types';

export async function PUT(request: NextRequest) {
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

    // Validate request body
    if (!body.shiftIds || !Array.isArray(body.shiftIds)) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'shiftIds array is required'
        }
      }, { status: 400 });
    }

    // Verify all shifts belong to the user's store
    const { data: shifts, error: fetchError } = await supabase
      .from('shift_definitions')
      .select('id')
      .eq('store_id', currentUser.storeId)
      .in('id', body.shiftIds);

    if (fetchError) throw fetchError;

    if (!shifts || shifts.length !== body.shiftIds.length) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Some shifts not found or do not belong to your store'
        }
      }, { status: 400 });
    }

    // Update display_order for each shift
    const updates = body.shiftIds.map((shiftId: string, index: number) => 
      supabase
        .from('shift_definitions')
        .update({ display_order: index + 1 })
        .eq('id', shiftId)
        .eq('store_id', currentUser.storeId)
    );

    const results = await Promise.all(updates);
    const errors = results.filter(r => r.error);

    if (errors.length > 0) {
      throw new Error('Failed to update some shift orders');
    }

    // Get shift names for audit log
    const { data: shiftNames } = await supabase
      .from('shift_definitions')
      .select('id, name')
      .in('id', body.shiftIds)
      .eq('store_id', currentUser.storeId);
    
    const orderedShiftNames = body.shiftIds
      .map((id: string) => shiftNames?.find(s => s.id === id)?.name || id.substring(0, 8))
      .join(' → ');

    // Create audit log
    await logAuditAction(
      request,
      currentUser.id,
      currentUser.storeId,
      'REORDER_SHIFT_DEFINITIONS',
      'shift',
      'reorder', // Special ID for reorder operation
      {
        entityName: `Reordered ${body.shiftIds.length} shift(s)`,
        changes: {
          newOrder: { old: 'Previous order', new: orderedShiftNames }
        },
        metadata: {
          shiftCount: body.shiftIds.length
        }
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

