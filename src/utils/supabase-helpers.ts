/**
 * Helper functions to transform Supabase data to match TypeScript types
 */

import { User, Role } from '@/types';

/**
 * Transform Supabase user data (snake_case) to TypeScript User type (camelCase)
 */
export function transformUser(data: any): User & { role?: Role } {
  if (!data) {
    throw new Error('Invalid user data: data is null or undefined');
  }
  
  if (!data.id) {
    throw new Error('Invalid user data: missing id');
  }
  
  try {
    return {
      id: data.id,
      employeeId: data.employee_id || data.employeeId || '',
      firstName: data.first_name || data.firstName || '',
      lastName: data.last_name || data.lastName || '',
      email: data.email,
      phone: data.phone,
      roleId: data.role_id || data.roleId || '',
      role: data.roles ? transformRole(data.roles) : data.role,
      storeId: data.store_id || data.storeId || '',
      experienceLevel: (data.experience_level || data.experienceLevel || 'fresher') as any,
      ppType: data.pp_type || data.ppType,
      weekOffsCount: data.week_offs_count !== undefined ? data.week_offs_count : (data.weekOffsCount !== undefined ? data.weekOffsCount : 0),
      weekOffDays: data.week_offs ? (Array.isArray(data.week_offs) ? data.week_offs : []) : (data.weekOffDays || undefined),
      defaultShiftPreference: data.default_shift_preference || data.defaultShiftPreference,
      isActive: data.is_active !== undefined ? data.is_active : data.isActive !== undefined ? data.isActive : true,
      passwordHash: data.password_hash || data.passwordHash,
      lastLoginAt: data.last_login_at ? new Date(data.last_login_at) : (data.lastLoginAt ? new Date(data.lastLoginAt) : undefined),
      createdAt: data.created_at ? new Date(data.created_at) : (data.createdAt ? new Date(data.createdAt) : new Date()),
      createdBy: data.created_by || data.createdBy || '',
      updatedAt: data.updated_at ? new Date(data.updated_at) : (data.updatedAt ? new Date(data.updatedAt) : new Date()),
      updatedBy: data.updated_by || data.updatedBy,
      deletedAt: data.deleted_at ? new Date(data.deleted_at) : (data.deletedAt ? new Date(data.deletedAt) : undefined),
      deletedBy: data.deleted_by || data.deletedBy,
      deletionReason: data.deletion_reason || data.deletionReason,
    };
  } catch (error) {
    console.error('Error transforming user:', error, data);
    throw error;
  }
}

/**
 * Transform Supabase role data (snake_case) to TypeScript Role type (camelCase)
 */
export function transformRole(data: any): Role {
  if (!data || !data.id) {
    throw new Error('Invalid role data: missing id');
  }
  
  try {
    return {
      id: data.id,
      name: data.name || '',
      description: data.description,
      permissions: data.permissions || [],
      defaultTaskPreferences: data.default_task_preferences || data.defaultTaskPreferences,
      defaultExperienceLevel: data.default_experience_level || data.defaultExperienceLevel,
      defaultPPType: data.default_pp_type || data.defaultPPType,
      isEditable: data.is_editable !== undefined ? data.is_editable : (data.isEditable !== undefined ? data.isEditable : true),
      isSystemRole: data.is_system_role !== undefined ? data.is_system_role : (data.isSystemRole !== undefined ? data.isSystemRole : false),
      createdAt: data.created_at ? new Date(data.created_at) : (data.createdAt ? new Date(data.createdAt) : new Date()),
      createdBy: data.created_by || data.createdBy || '',
      updatedAt: data.updated_at ? new Date(data.updated_at) : (data.updatedAt ? new Date(data.updatedAt) : new Date()),
      updatedBy: data.updated_by || data.updatedBy,
    };
  } catch (error) {
    console.error('Error transforming role:', error, data);
    throw error;
  }
}

/**
 * Transform array of users
 */
export function transformUsers(data: any[]): (User & { role?: Role })[] {
  if (!data || !Array.isArray(data)) return [];
  return data
    .filter(item => item && item.id) // Filter out invalid items
    .map(item => {
      try {
        return transformUser(item);
      } catch (error) {
        console.error('Error transforming user in array:', error, item);
        return null;
      }
    })
    .filter((user): user is User & { role?: Role } => user !== null);
}

/**
 * Transform array of roles
 */
export function transformRoles(data: any[]): Role[] {
  if (!data || !Array.isArray(data)) return [];
  return data
    .filter(item => item && item.id) // Filter out invalid items
    .map(item => {
      try {
        return transformRole(item);
      } catch (error) {
        console.error('Error transforming role in array:', error, item);
        return null;
      }
    })
    .filter((role): role is Role => role !== null);
}

/**
 * Transform slot actuals data from snake_case to camelCase
 */
export function transformSlotActuals(data: any, actualUser?: any): any {
  if (!data) return undefined;
  
  return {
    actualUserId: data.actual_user_id || data.actualUserId,
    actualUser: actualUser ? transformUser(actualUser) : undefined,
    actualStartTime: data.actual_start_time || data.actualStartTime,
    actualEndTime: data.actual_end_time || data.actualEndTime,
    actualTasksCompleted: data.actual_tasks_completed || data.actualTasksCompleted || [],
    attendanceStatus: data.attendance_status || data.attendanceStatus,
    substitutionReason: data.substitution_reason || data.substitutionReason,
    actualNotes: data.actual_notes || data.actualNotes,
    checkedInAt: data.checked_in_at ? new Date(data.checked_in_at) : (data.checkedInAt ? new Date(data.checkedInAt) : undefined),
    checkedOutAt: data.checked_out_at ? new Date(data.checked_out_at) : (data.checkedOutAt ? new Date(data.checkedOutAt) : undefined),
    checkedInBy: data.checked_in_by || data.checkedInBy,
    checkedOutBy: data.checked_out_by || data.checkedOutBy,
  };
}
