import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth-helpers';
import { getCurrentUserWithRole } from '@/lib/get-current-user-with-role';
import { ApiResponse } from '@/types';

export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const authResult = await requireAuth(request);
    if (authResult.error) {
      return authResult.error;
    }

    // Get current user with role to access store_id
    const currentUserResult = await getCurrentUserWithRole(request);
    if (!currentUserResult.user) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Failed to get user information'
        }
      }, { status: 401 });
    }

    const currentUser = currentUserResult.user;
    const storeId = currentUser.storeId;

    const supabase = createServerClient();
    const { searchParams } = new URL(request.url);
    
    const page = parseInt(searchParams.get('page') || '1');
    const limit = 50;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('audit_logs')
      .select('*, users(first_name, last_name, employee_id)', { count: 'exact' })
      .eq('store_id', storeId)
      .order('timestamp', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    const action = searchParams.get('action');
    const entityType = searchParams.get('entityType');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const userId = searchParams.get('userId');
    const entityName = searchParams.get('entityName');

    if (action) {
      // For exact match, use eq; for partial match, use ilike
      if (action.includes('_') || action === action.toUpperCase()) {
        // Likely a full action name
        query = query.eq('action', action);
      } else {
        query = query.ilike('action', `%${action}%`);
      }
    }
    if (entityType) {
      query = query.eq('entity_type', entityType);
    }
    if (dateFrom) {
      // Add time to start of day for proper filtering
      const fromDate = new Date(dateFrom);
      fromDate.setHours(0, 0, 0, 0);
      query = query.gte('timestamp', fromDate.toISOString());
    }
    if (dateTo) {
      // Add time to end of day for proper filtering
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999);
      query = query.lte('timestamp', toDate.toISOString());
    }
    if (userId) {
      query = query.eq('user_id', userId);
    }
    if (entityName) {
      query = query.ilike('entity_name', `%${entityName}%`);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    const logs = (data || []).map((log: any) => ({
      id: log.id,
      store_id: log.store_id,
      user_id: log.user_id,
      action: log.action,
      entity_type: log.entity_type,
      entity_id: log.entity_id,
      entity_name: log.entity_name,
      changes: log.changes,
      metadata: log.metadata,
      ip_address: log.ip_address,
      user_agent: log.user_agent,
      timestamp: log.timestamp,
      user: log.users ? {
        firstName: log.users.first_name,
        lastName: log.users.last_name,
        employeeId: log.users.employee_id
      } : undefined
    }));

    const totalPages = Math.ceil((count || 0) / limit);

    return NextResponse.json<ApiResponse<{ logs: any[], totalPages: number }>>({
      success: true,
      data: { logs, totalPages }
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
