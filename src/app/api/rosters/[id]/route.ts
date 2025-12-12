import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { ApiResponse } from '@/types';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerClient();
    
    // Delete roster slots first
    await supabase
      .from('roster_slots')
      .delete()
      .eq('roster_id', params.id);

    // Delete roster
    const { error } = await supabase
      .from('rosters')
      .delete()
      .eq('id', params.id);

    if (error) throw error;

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
