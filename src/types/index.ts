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
  MANAGE_AD_HOC_PP = 'MANAGE_AD_HOC_PP',
  RECORD_ACTUALS = 'RECORD_ACTUALS',
  VIEW_ACTUALS = 'VIEW_ACTUALS'
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
  ROLE_REVOKE = 'ROLE_REVOKE',
  RECORD_ACTUALS = 'RECORD_ACTUALS',
  CHECK_IN = 'CHECK_IN',
  CHECK_OUT = 'CHECK_OUT',
  SUBSTITUTE_STAFF = 'SUBSTITUTE_STAFF'
}

export enum AttendanceStatus {
  PRESENT = 'present',
  ABSENT = 'absent',
  LATE = 'late',
  LEFT_EARLY = 'left_early',
  SUBSTITUTED = 'substituted'
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
  weekOffDays?: number[]; // Array of day numbers (0=Sunday, 1=Monday, ..., 6=Saturday) for weekoff preference template
  defaultShiftPreference?: string; // Shift name (e.g., "Morning Shift", "Evening Shift")
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
  name: string; // Shift name (e.g., "Morning Shift", "Evening Shift", "Night Shift")
  startTime: string;
  endTime: string;
  durationHours: number;
  isActive: boolean;
  displayOrder?: number; // For custom ordering
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

export interface RosterSlotActuals {
  actualUserId?: string; // Who actually worked (if different from planned)
  actualUser?: User; // Populated on fetch
  actualStartTime?: string; // Actual check-in time
  actualEndTime?: string; // Actual check-out time
  actualTasksCompleted?: string[]; // Tasks actually completed
  attendanceStatus?: AttendanceStatus; // Attendance status
  substitutionReason?: string; // Reason for substitution if applicable
  actualNotes?: string; // Notes about what actually happened
  checkedInAt?: Date; // When staff checked in
  checkedOutAt?: Date; // When staff checked out
  checkedInBy?: string; // Who recorded check-in (user_id if self, manager_id if manual)
  checkedOutBy?: string; // Who recorded check-out
}

export interface RosterSlot {
  id: string;
  rosterId: string;
  userId: string;
  user?: User;
  shiftId: string; // Reference to ShiftDefinition.id
  shift?: ShiftDefinition; // Populated on fetch
  date: string;
  assignedTasks: string[];
  startTime: string;
  endTime: string;
  status: 'draft' | 'published' | 'cancelled';
  notes?: string;
  // Actuals tracking
  actuals?: RosterSlotActuals;
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
  shiftId: string; // Reference to ShiftDefinition.id
  shift?: ShiftDefinition; // Populated on fetch
  slots: RosterSlot[];
  coverage: CoverageMetrics;
  status: 'draft' | 'published' | 'archived';
  publishedAt?: Date;
  publishedBy?: string;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy?: string;
  updatedByUser?: { firstName: string; lastName: string; employeeId: string };
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
  weekOffDays?: number[]; // Array of day numbers (0=Sunday, 1=Monday, ..., 6=Saturday)
  defaultShiftPreference?: string; // Shift name (e.g., "Morning Shift", "Evening Shift")
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
  weekOffDays?: number[]; // Array of day numbers (0=Sunday, 1=Monday, ..., 6=Saturday)
  defaultShiftPreference?: string; // Shift name (e.g., "Morning Shift", "Evening Shift")
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

export interface CreateShiftRequest {
  name: string; // Shift name
  startTime: string; // HH:mm format
  endTime: string; // HH:mm format
  isActive?: boolean;
}

export interface UpdateShiftRequest {
  name?: string; // Shift name
  startTime?: string; // HH:mm format
  endTime?: string; // HH:mm format
  isActive?: boolean;
}

export interface CreateTaskRequest {
  name: string;
  description?: string;
  category: string;
  requiredExperience?: ExperienceLevel;
  estimatedDuration?: number; // minutes
  isActive?: boolean;
}

export interface UpdateTaskRequest {
  name?: string;
  description?: string;
  category?: string;
  requiredExperience?: ExperienceLevel;
  estimatedDuration?: number; // minutes
  isActive?: boolean;
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

// ============================================================================
// Actuals Tracking Request/Response Types
// ============================================================================

export interface CheckInRequest {
  slotId?: string; // Optional - will auto-find slot for current user if not provided
  actualStartTime?: string; // Optional - defaults to current time
  notes?: string;
}

export interface CheckOutRequest {
  slotId?: string; // Optional - will auto-find slot for current user if not provided
  actualEndTime?: string; // Optional - defaults to current time
  notes?: string;
}

export interface RecordActualsRequest {
  slotId: string;
  actualUserId?: string; // Who actually worked (for substitutions)
  actualStartTime?: string;
  actualEndTime?: string;
  actualTasksCompleted?: string[];
  attendanceStatus?: AttendanceStatus;
  substitutionReason?: string;
  actualNotes?: string;
}

export interface BulkRecordActualsRequest {
  actuals: RecordActualsRequest[];
}

export interface ActualsComparison {
  slotId: string;
  planned: {
    userId: string;
    userName?: string;
    startTime: string;
    endTime: string;
    tasks: string[];
  };
  actual: {
    userId?: string;
    userName?: string;
    startTime?: string;
    endTime?: string;
    tasks?: string[];
    attendanceStatus?: AttendanceStatus;
  };
  deviations: {
    userChanged: boolean;
    timeDeviation?: number; // Minutes difference
    tasksChanged: boolean;
    hasActuals: boolean;
  };
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
    shiftType: string; // Changed from ShiftType enum to string to support shift names
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

export interface ExportOptions {
  includeContactInfo?: boolean;
  includeTasks?: boolean;
  includeMetadata?: boolean;
  format?: 'csv' | 'pdf';
  dateRange?: {
    start: Date;
    end: Date;
  };
}
