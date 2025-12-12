/**
 * Type definitions for the Staff Roster Dashboard
 * Based on schema.cursor
 */

// ============================================================================
// Core Enums
// ============================================================================

export enum UserRole {
  STORE_MANAGER = 'STORE_MANAGER',
  SHIFT_IN_CHARGE = 'SHIFT_IN_CHARGE',
  INVENTORY_EXECUTIVE = 'INVENTORY_EXECUTIVE',
  PICKER_PACKER = 'PICKER_PACKER',
  SYSTEM_ADMIN = 'SYSTEM_ADMIN'
}

export enum ExperienceLevel {
  EXPERIENCED = 'experienced',
  FRESHER = 'fresher'
}

export enum PPType {
  WAREHOUSE = 'warehouse',
  AD_HOC = 'adHoc'
}

export enum ShiftType {
  MORNING = 'morning',
  EVENING = 'evening'
}

export enum Permission {
  CRUD_USER = 'CRUD_USER',
  CRUD_ROLE = 'CRUD_ROLE',
  VIEW_ALL_STAFF = 'VIEW_ALL_STAFF',
  VIEW_OWN_STAFF = 'VIEW_OWN_STAFF',
  ASSIGN_SHIFT = 'ASSIGN_SHIFT',
  CREATE_ROSTER = 'CREATE_ROSTER',
  MODIFY_ROSTER = 'MODIFY_ROSTER',
  PUBLISH_ROSTER = 'PUBLISH_ROSTER',
  DELETE_ROSTER = 'DELETE_ROSTER',
  VIEW_ROSTER = 'VIEW_ROSTER',
  ASSIGN_TASK = 'ASSIGN_TASK',
  MODIFY_TASK = 'MODIFY_TASK',
  MANAGE_SETTINGS = 'MANAGE_SETTINGS',
  MANAGE_SHIFT_DEFINITIONS = 'MANAGE_SHIFT_DEFINITIONS',
  MANAGE_ROSTER_TEMPLATES = 'MANAGE_ROSTER_TEMPLATES',
  EXPORT_ROSTER = 'EXPORT_ROSTER',
  SHARE_ROSTER = 'SHARE_ROSTER',
  VIEW_AUDIT_LOG = 'VIEW_AUDIT_LOG',
  VIEW_REPORTS = 'VIEW_REPORTS',
  DELETE_SM_USER = 'DELETE_SM_USER',
  DEMOTE_SM_USER = 'DEMOTE_SM_USER',
  MANAGE_AD_HOC_PP = 'MANAGE_AD_HOC_PP'
}

export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  PUBLISH = 'PUBLISH',
  EXPORT = 'EXPORT',
  SHARE = 'SHARE',
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  PERMISSION_CHANGE = 'PERMISSION_CHANGE',
  ROLE_ASSIGN = 'ROLE_ASSIGN',
  ROLE_REVOKE = 'ROLE_REVOKE'
}

// ============================================================================
// User & Role Models
// ============================================================================

export interface Role {
  id: string;
  name: string;
  description?: string;
  permissions: Permission[];
  defaultTaskPreferences?: string[];
  defaultExperienceLevel?: ExperienceLevel;
  defaultPPType?: PPType;
  isEditable: boolean;
  isSystemRole: boolean;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy?: string;
}

export interface User {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  email?: string; // Optional - can be added later for SM, SI, IE
  phone?: string;
  roleId: string;
  role?: Role;
  storeId: string;
  experienceLevel: ExperienceLevel;
  ppType?: PPType;
  weekOffsCount: number; // Number of days off per week (0-7), rotational
  defaultShiftPreference?: ShiftType;
  isActive: boolean;
  passwordHash?: string;
  lastLoginAt?: Date;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy?: string;
  deletedAt?: Date;
  deletedBy?: string;
  deletionReason?: string;
}

// ============================================================================
// Roster Models
// ============================================================================

export interface ShiftDefinition {
  id: string;
  storeId: string;
  shiftType: ShiftType;
  startTime: string;
  endTime: string;
  durationHours: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Task {
  id: string;
  name: string;
  description?: string;
  category: string;
  requiredExperience?: ExperienceLevel;
  estimatedDuration?: number;
  isActive: boolean;
}

export interface RosterSlot {
  id: string;
  rosterId: string;
  userId: string;
  user?: User;
  shiftType: ShiftType;
  date: string;
  assignedTasks: string[];
  startTime: string;
  endTime: string;
  status: 'draft' | 'published' | 'cancelled';
  notes?: string;
}

export interface CoverageMetrics {
  totalSlots: number;
  filledSlots: number;
  vacantSlots: number;
  coveragePercentage: number;
  minRequiredStaff: number;
  actualStaff: number;
  warnings: string[];
}

export interface Roster {
  id: string;
  storeId: string;
  date: string;
  shiftType: ShiftType;
  slots: RosterSlot[];
  coverage: CoverageMetrics;
  status: 'draft' | 'published' | 'archived';
  publishedAt?: Date;
  publishedBy?: string;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy?: string;
  templateId?: string;
}

// ============================================================================
// Store & Settings Models
// ============================================================================

export interface StoreSettings {
  minStaffPerShift: number;
  maxStaffPerShift: number;
  requireCoverageValidation: boolean;
  allowOverlap: boolean;
  defaultShiftDuration: number;
  weekStartDay: number;
  enableAuditLog: boolean;
  enableEmailNotifications: boolean;
  enableSlackNotifications: boolean;
  slackWebhookUrl?: string;
  emailFromAddress?: string;
  siPermissions: Permission[];
  siCanDeleteStaff: boolean;
  siCanModifySM: boolean;
  siCanPublishRoster: boolean;
}

export interface Store {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  timezone: string;
  settings: StoreSettings;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Audit & Activity Models
// ============================================================================

export interface AuditLog {
  id: string;
  storeId: string;
  userId: string;
  user?: User;
  action: AuditAction;
  entityType: 'user' | 'role' | 'roster' | 'shift' | 'task' | 'settings' | 'template';
  entityId: string;
  entityName?: string;
  changes?: Record<string, { old: any; new: any }>;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface CreateUserRequest {
  employeeId: string;
  firstName: string;
  lastName: string;
  email?: string; // Optional for SM, SI, IE roles
  phone?: string;
  roleId: string;
  experienceLevel: ExperienceLevel;
  ppType?: PPType;
  weekOffsCount: number; // Number of days off per week (0-7)
  defaultShiftPreference?: ShiftType;
  isActive?: boolean; // Default to true
  sendInvite?: boolean;
}

export interface UpdateUserRequest {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  roleId?: string;
  experienceLevel?: ExperienceLevel;
  ppType?: PPType;
  weekOffsCount?: number; // Number of days off per week (0-7)
  defaultShiftPreference?: ShiftType;
  isActive?: boolean;
}

export interface CreateRoleRequest {
  name: string;
  description?: string;
  permissions: Permission[];
  defaultTaskPreferences?: string[];
  defaultExperienceLevel?: ExperienceLevel;
  defaultPPType?: PPType;
}

export interface UpdateRoleRequest {
  name?: string;
  description?: string;
  permissions?: Permission[];
  defaultTaskPreferences?: string[];
  defaultExperienceLevel?: ExperienceLevel;
  defaultPPType?: PPType;
  isEditable?: boolean;
}

export interface BulkImportUserRequest {
  users: Omit<CreateUserRequest, 'sendInvite'>[];
  skipDuplicates?: boolean;
  defaultRoleId?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings?: string[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  requiredPermission?: Permission;
}

export interface DeleteUserResult {
  allowed: boolean;
  reason?: string;
  impactedRosters: Array<{
    rosterId: string;
    date: string;
    shiftType: ShiftType;
    slotId: string;
  }>;
  canReassign: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
