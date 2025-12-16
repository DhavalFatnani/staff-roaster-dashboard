/**
 * Validation functions for roster assignments, permissions, and business rules
 */

import {
  User,
  Role,
  Roster,
  RosterSlot,
  StoreSettings,
  Permission,
  PermissionCheckResult,
  ValidationResult,
  ValidationError,
  DeleteUserResult,
  ShiftType,
  ExperienceLevel
} from '@/types';
import { createServerClient } from '@/lib/supabase';

export function validateRosterAssignments(
  roster: Roster,
  storeSettings: StoreSettings,
  allUsers: User[],
  allRosters: Roster[]
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  if (roster.slots.length < storeSettings.minStaffPerShift) {
    errors.push({
      field: 'slots',
      message: `Minimum ${storeSettings.minStaffPerShift} staff required per shift`,
      code: 'MIN_STAFF_NOT_MET'
    });
  }

  if (roster.slots.length > storeSettings.maxStaffPerShift) {
    errors.push({
      field: 'slots',
      message: `Maximum ${storeSettings.maxStaffPerShift} staff allowed per shift`,
      code: 'MAX_STAFF_EXCEEDED'
    });
  }

  const userMap = new Map(allUsers.map(u => [u.id, u]));
  const userSlotsOnDate = new Map<string, RosterSlot[]>();
  const date = new Date(roster.date);
  const dayOfWeek = date.getDay();

  roster.slots.forEach(slot => {
    const user = userMap.get(slot.userId);
    if (!user) {
      errors.push({
        field: `slot-${slot.id}`,
        message: `User ${slot.userId} not found`,
        code: 'USER_NOT_FOUND'
      });
      return;
    }

    // Note: Week offs are now rotational (count-based), so we don't check specific days
    // The weekOffsCount is informational and actual days are managed rotationally

    const start = parseTime(slot.startTime);
    const end = parseTime(slot.endTime);
    const duration = (end - start + (end < start ? 24 : 0)) / 60;
    if (Math.abs(duration - 9) > 0.1) {
      errors.push({
        field: `slot-${slot.id}`,
        message: `Shift duration must be exactly 9 hours (got ${duration} hours)`,
        code: 'INVALID_SHIFT_DURATION'
      });
    }

    if (!userSlotsOnDate.has(slot.userId)) {
      userSlotsOnDate.set(slot.userId, []);
    }
    userSlotsOnDate.get(slot.userId)!.push(slot);
  });

  userSlotsOnDate.forEach((slots, userId) => {
    if (slots.length > 1) {
      const user = userMap.get(userId)!;
      errors.push({
        field: 'slots',
        message: `${user.firstName} ${user.lastName} is assigned to multiple slots on ${roster.date}`,
        code: 'DUPLICATE_ASSIGNMENT'
      });
    }
  });

  allRosters.forEach(otherRoster => {
    if (otherRoster.id === roster.id || otherRoster.date !== roster.date) {
      return;
    }

    roster.slots.forEach(slot => {
      const conflictingSlot = otherRoster.slots.find(s => s.userId === slot.userId);
      if (conflictingSlot) {
        const user = userMap.get(slot.userId)!;
        errors.push({
          field: `slot-${slot.id}`,
          message: `${user.firstName} ${user.lastName} is already assigned to ${otherRoster.shiftType} shift on ${roster.date}`,
          code: 'SHIFT_CONFLICT'
        });
      }
    });
  });

  const filledSlots = roster.slots.filter(s => s.userId && s.status !== 'cancelled').length;
  const coveragePercentage = (filledSlots / storeSettings.minStaffPerShift) * 100;
  
  if (coveragePercentage < 100) {
    warnings.push(`Coverage is ${coveragePercentage.toFixed(0)}% (${filledSlots}/${storeSettings.minStaffPerShift} required)`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings: warnings.length > 0 ? warnings : undefined
  };
}

function parseTime(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

export function canPerformAction(
  userId: string,
  action: Permission,
  target: { type: 'user' | 'role' | 'roster'; id?: string } | null,
  user: User & { role?: Role },
  targetUser?: User & { role?: Role },
  storeSettings?: StoreSettings
): PermissionCheckResult {
  if (!user.role) {
    return {
      allowed: false,
      reason: 'User role not found',
      requiredPermission: action
    };
  }

  const role = user.role;

  // Store Manager has all permissions (check by name only, not by permission)
  if (role.name === 'Store Manager') {
    if (action === Permission.DELETE_SM_USER || action === Permission.DEMOTE_SM_USER) {
      return {
        allowed: true,
        reason: 'Store Manager can perform this action (confirmation required)'
      };
    }
    return { allowed: true };
  }

  // Check if role has the specific permission
  if (role.permissions.includes(action)) {
    if (action === Permission.CRUD_USER && target?.type === 'user' && targetUser) {
      return canModifyUser(user, targetUser, storeSettings);
    }
    return { allowed: true };
  }

  if (role.name === 'Shift In Charge' && storeSettings) {
    if (storeSettings.siPermissions.includes(action)) {
      if (action === Permission.CRUD_USER && target?.type === 'user' && targetUser) {
        return canModifyUser(user, targetUser, storeSettings);
      }
      return { allowed: true };
    }
  }

  return {
    allowed: false,
    reason: `Role "${role.name}" does not have permission "${action}"`,
    requiredPermission: action
  };
}

function canModifyUser(
  requestingUser: User & { role?: Role },
  targetUser: User & { role?: Role },
  storeSettings?: StoreSettings
): PermissionCheckResult {
  const requestingRole = requestingUser.role;
  const targetRole = targetUser.role;

  if (!requestingRole || !targetRole) {
    return {
      allowed: false,
      reason: 'User roles not found'
    };
  }

  if (requestingRole.name === 'Store Manager') {
    return { allowed: true };
  }

  if (requestingRole.name === 'Shift In Charge' && targetRole.name === 'Store Manager') {
    if (storeSettings?.siCanModifySM) {
      return {
        allowed: true,
        reason: 'SI can modify SM (override enabled in settings)'
      };
    }
    return {
      allowed: false,
      reason: 'Shift In Charge cannot modify Store Manager accounts'
    };
  }

  if (requestingRole.name === 'Shift In Charge') {
    if (targetRole.name === 'Picker Packer (Ad-Hoc)' || targetRole.name === 'Picker Packer (Warehouse)') {
      return { allowed: true };
    }
    if (targetRole.name !== 'Shift In Charge' && targetRole.name !== 'Store Manager') {
      return { allowed: true };
    }
  }

  // Inventory Executive can modify staff (but not SM, SI, or other IE)
  if (requestingRole.name === 'Inventory Executive') {
    if (targetRole.name === 'Picker Packer (Ad-Hoc)' || targetRole.name === 'Picker Packer (Warehouse)') {
      return { allowed: true };
    }
    // IE can modify other staff but not SM, SI, or other IE
    if (targetRole.name !== 'Store Manager' && 
        targetRole.name !== 'Shift In Charge' && 
        targetRole.name !== 'Inventory Executive') {
      return { allowed: true };
    }
  }

  return {
    allowed: false,
    reason: `User role "${requestingRole.name}" cannot modify "${targetRole.name}"`
  };
}

export async function canDeleteUser(
  userId: string,
  requestingUserId: string,
  allUsers: (User & { role?: Role })[],
  allRosters: Roster[],
  storeSettings?: StoreSettings
): Promise<DeleteUserResult> {
  const userToDelete = allUsers.find(u => u.id === userId);
  const requestingUser = allUsers.find(u => u.id === requestingUserId);

  if (!userToDelete || !requestingUser) {
    return {
      allowed: false,
      reason: 'User not found',
      impactedRosters: [],
      canReassign: false
    };
  }

  const permissionCheck = canPerformAction(
    requestingUserId,
    Permission.CRUD_USER,
    { type: 'user', id: userId },
    requestingUser,
    userToDelete,
    storeSettings
  );

  if (!permissionCheck.allowed) {
    return {
      allowed: false,
      reason: permissionCheck.reason || 'Permission denied',
      impactedRosters: [],
      canReassign: false
    };
  }

  if (userToDelete.role?.name === 'Store Manager') {
    const smUsers = allUsers.filter(
      u => u.role?.name === 'Store Manager' && u.isActive && !u.deletedAt
    );
    if (smUsers.length <= 1) {
      return {
        allowed: false,
        reason: 'Cannot delete the last Store Manager. At least one SM must exist.',
        impactedRosters: [],
        canReassign: false
      };
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const impactedRosters: DeleteUserResult['impactedRosters'] = [];
  
  allRosters.forEach(roster => {
    const rosterDate = new Date(roster.date);
    rosterDate.setHours(0, 0, 0, 0);
    
    if (rosterDate >= today && roster.status !== 'archived') {
      const userSlots = roster.slots.filter(s => s.userId === userId);
      userSlots.forEach(slot => {
        impactedRosters.push({
          rosterId: roster.id,
          date: roster.date,
          shiftType: roster.shiftType,
          slotId: slot.id
        });
      });
    }
  });

  return {
    allowed: true,
    impactedRosters,
    canReassign: impactedRosters.length > 0
  };
}

export function validateEmail(email?: string, allowEmpty: boolean = false): ValidationResult {
  const errors: ValidationError[] = [];
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (allowEmpty && (!email || email.trim() === '')) {
    // Email is optional
    return {
      valid: true,
      errors: []
    };
  }

  if (!email || !email.trim()) {
    if (!allowEmpty) {
      errors.push({
        field: 'email',
        message: 'Email is required',
        code: 'EMAIL_REQUIRED'
      });
    }
  } else if (!emailRegex.test(email)) {
    errors.push({
      field: 'email',
      message: 'Invalid email format',
      code: 'INVALID_EMAIL'
    });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function validateWeekOffsCount(weekOffsCount: number): ValidationResult {
  const errors: ValidationError[] = [];

  if (weekOffsCount === undefined || weekOffsCount === null) {
    // Default to 0 if not provided
    return {
      valid: true,
      errors: []
    };
  }

  if (!Number.isInteger(weekOffsCount)) {
    errors.push({
      field: 'weekOffsCount',
      message: 'Week offs count must be an integer',
      code: 'INVALID_WEEK_OFFS_COUNT_TYPE'
    });
    return {
      valid: false,
      errors
    };
  }

  if (weekOffsCount < 0 || weekOffsCount > 7) {
    errors.push({
      field: 'weekOffsCount',
      message: `Week offs count must be between 0 and 7 (got ${weekOffsCount})`,
      code: 'INVALID_WEEK_OFFS_COUNT_RANGE'
    });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function validateEmployeeId(
  employeeId: string,
  existingUsers: User[],
  excludeUserId?: string
): ValidationResult {
  const errors: ValidationError[] = [];

  if (!employeeId || employeeId.trim().length === 0) {
    errors.push({
      field: 'employeeId',
      message: 'Employee ID is required',
      code: 'EMPLOYEE_ID_REQUIRED'
    });
    return { valid: false, errors };
  }

  const duplicate = existingUsers.find(
    u => u.employeeId.toLowerCase() === employeeId.toLowerCase() && 
         u.id !== excludeUserId && 
         !u.deletedAt
  );

  if (duplicate) {
    errors.push({
      field: 'employeeId',
      message: `Employee ID "${employeeId}" already exists`,
      code: 'EMPLOYEE_ID_DUPLICATE'
    });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
