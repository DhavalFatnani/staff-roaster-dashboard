/**
 * API route to check if an email exists in auth.users
 * Useful for debugging password reset issues
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { ApiResponse } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Email is required'
        }
      }, { status: 400 });
    }

    const supabase = createServerClient();

    // List all users and find by email
    // Note: This requires admin access (service role key)
    const { data: users, error: listError } = await supabase.auth.admin.listUsers();

    if (listError) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: {
          code: 'AUTH_ERROR',
          message: `Failed to check email: ${listError.message}`
        }
      }, { status: 500 });
    }

    const user = users?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());

    if (!user) {
      return NextResponse.json<ApiResponse<{
        exists: false;
        message: 'Email not found in auth.users';
      }>>({
        success: true,
        data: {
          exists: false,
          message: 'Email not found in auth.users'
        }
      });
    }

    // Check if email is confirmed
    return NextResponse.json<ApiResponse<{
      exists: true;
      email: string;
      emailConfirmed: boolean;
      userId: string;
      createdAt: string;
    }>>({
      success: true,
      data: {
        exists: true,
        email: user.email || '',
        emailConfirmed: !!user.email_confirmed_at,
        userId: user.id,
        createdAt: user.created_at || ''
      }
    });
  } catch (error: any) {
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to check email'
      }
    }, { status: 500 });
  }
}

