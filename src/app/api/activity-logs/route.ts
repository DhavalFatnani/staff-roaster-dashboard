import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { ApiResponse } from '@/types';

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const { searchParams } = new URL(request.url);
    
    const page = parseInt(searchParams.get('page') || '1');
    const limit = 50;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('audit_logs')
      .select('*, users(first_name, last_name, employee_id)', { count: 'exact' })
      .order('timestamp', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    const action = searchParams.get('action');
    const entityType = searchParams.get('entityType');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const userId = searchParams.get('userId');

    if (action) {
      query = query.ilike('action', `%${action}%`);
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
