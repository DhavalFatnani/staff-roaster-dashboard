/**
 * API route for task CRUD operations
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { ApiResponse, Task } from '@/types';

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('is_active', true)
      .order('category', { ascending: true })
      .order('name', { ascending: true });

    if (error) throw error;

    const tasks: Task[] = (data || []).map((t: any) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      requiredExperience: t.required_experience,
      estimatedDuration: t.estimated_duration,
      isActive: t.is_active
    }));

    return NextResponse.json<ApiResponse<Task[]>>({
      success: true,
      data: tasks
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
    const supabase = createServerClient();
    const body = await request.json();

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        name: body.name,
        description: body.description,
        category: body.category,
        required_experience: body.requiredExperience,
        estimated_duration: body.estimatedDuration,
        is_active: body.isActive !== undefined ? body.isActive : true
      })
      .select()
      .single();

    if (error) throw error;

    const task: Task = {
      id: data.id,
      name: data.name,
      description: data.description,
      category: data.category,
      requiredExperience: data.required_experience,
      estimatedDuration: data.estimated_duration,
      isActive: data.is_active
    };

    return NextResponse.json<ApiResponse<Task>>({
      success: true,
      data: task
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
