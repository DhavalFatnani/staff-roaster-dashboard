/**
 * Helper functions to transform Supabase data to match TypeScript types
 */

import { User, Role } from '@/types';

/**
 * Transform Supabase user data (snake_case) to TypeScript User type (camelCase)
 */
export function transformUser(data: any): User & { role?: Role } {
  if (!data) return data;
  
  return {
    id: data.id,
    employeeId: data.employee_id || data.employeeId,
    firstName: data.first_name || data.firstName,
    lastName: data.last_name || data.lastName,
    email: data.email,
    phone: data.phone,
    roleId: data.role_id || data.roleId,
    role: data.roles ? transformRole(data.roles) : data.role,
    storeId: data.store_id || data.storeId,
    experienceLevel: data.experience_level || data.experienceLevel,
    ppType: data.pp_type || data.ppType,
    weekOffsCount: data.week_offs_count !== undefined ? data.week_offs_count : (data.weekOffsCount !== undefined ? data.weekOffsCount : 0),
    defaultShiftPreference: data.default_shift_preference || data.defaultShiftPreference,
    isActive: data.is_active !== undefined ? data.is_active : data.isActive !== undefined ? data.isActive : true,
    passwordHash: data.password_hash || data.passwordHash,
    lastLoginAt: data.last_login_at ? new Date(data.last_login_at) : data.lastLoginAt,
    createdAt: data.created_at ? new Date(data.created_at) : data.createdAt || new Date(),
    createdBy: data.created_by || data.createdBy,
    updatedAt: data.updated_at ? new Date(data.updated_at) : data.updatedAt || new Date(),
    updatedBy: data.updated_by || data.updatedBy,
    deletedAt: data.deleted_at ? new Date(data.deleted_at) : data.deletedAt,
    deletedBy: data.deleted_by || data.deletedBy,
    deletionReason: data.deletion_reason || data.deletionReason,
  };
}

/**
 * Transform Supabase role data (snake_case) to TypeScript Role type (camelCase)
 */
export function transformRole(data: any): Role {
  if (!data) return data;
  
  return {
    id: data.id,
    name: data.name,
    description: data.description,
    permissions: data.permissions || [],
    defaultTaskPreferences: data.default_task_preferences || data.defaultTaskPreferences,
    defaultExperienceLevel: data.default_experience_level || data.defaultExperienceLevel,
    defaultPPType: data.default_pp_type || data.defaultPPType,
    isEditable: data.is_editable !== undefined ? data.is_editable : data.isEditable,
    isSystemRole: data.is_system_role !== undefined ? data.is_system_role : data.isSystemRole,
    createdAt: data.created_at ? new Date(data.created_at) : data.createdAt || new Date(),
    createdBy: data.created_by || data.createdBy,
    updatedAt: data.updated_at ? new Date(data.updated_at) : data.updatedAt || new Date(),
    updatedBy: data.updated_by || data.updatedBy,
  };
}

/**
 * Transform array of users
 */
export function transformUsers(data: any[]): (User & { role?: Role })[] {
  if (!data || !Array.isArray(data)) return [];
  return data.map(transformUser);
}

/**
 * Transform array of roles
 */
export function transformRoles(data: any[]): Role[] {
  if (!data || !Array.isArray(data)) return [];
  return data.map(transformRole);
}
