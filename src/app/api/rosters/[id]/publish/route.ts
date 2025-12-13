/**
 * API route to publish a roster
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth-helpers';
import { ApiResponse, Roster } from '@/types';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Verify authentication
    const authResult = await requireAuth(request);
    if (authResult.error) {
      return authResult.error;
    }

    const supabase = createServerClient();
    
    // Get current user
    const { data: currentUser } = await supabase
      .from('users')
      .select('id')
      .limit(1)
      .single();

    if (!currentUser) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'No user found'
        }
      }, { status: 401 });
    }

    // Update roster status to published
    const { data, error } = await supabase
      .from('rosters')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
        published_by: currentUser.id,
        updated_by: currentUser.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', params.id)
      .select()
      .single();

    if (error) throw error;

    // Update all slots to published
    await supabase
      .from('roster_slots')
      .update({ status: 'published' })
      .eq('roster_id', params.id)
      .eq('status', 'draft');

    return NextResponse.json<ApiResponse<Roster>>({
      success: true,
      data: data as any
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
