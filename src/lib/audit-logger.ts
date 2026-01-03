/**
 * Audit logging helper
 * Creates audit log entries in the database for tracking system activity
 */

import { createServerClient } from './supabase';
import { NextRequest } from 'next/server';

export type AuditAction = 
  | 'CREATE_USER'
  | 'UPDATE_USER'
  | 'DELETE_USER'
  | 'ACTIVATE_USER'
  | 'DEACTIVATE_USER'
  | 'CREATE_ROSTER'
  | 'UPDATE_ROSTER'
  | 'DELETE_ROSTER'
  | 'PUBLISH_ROSTER'
  | 'CREATE_ROLE'
  | 'UPDATE_ROLE'
  | 'DELETE_ROLE'
  | 'CREATE_TASK'
  | 'UPDATE_TASK'
  | 'DELETE_TASK'
  | 'CREATE_SHIFT_DEFINITION'
  | 'UPDATE_SHIFT_DEFINITION'
  | 'DELETE_SHIFT_DEFINITION'
  | 'REORDER_SHIFT_DEFINITIONS'
  | 'BULK_IMPORT_USERS'
  | 'BULK_DEACTIVATE_USERS'
  | 'RECORD_ACTUALS'
  | 'CHECK_IN'
  | 'CHECK_OUT'
  | 'SUBSTITUTE_STAFF'
  | 'TESTING_ENVIRONMENT_TRIGGER'
  | 'TESTING_ENVIRONMENT_ENDED';

export type EntityType = 
  | 'user'
  | 'roster'
  | 'role'
  | 'task'
  | 'shift_definition'
  | 'shift'
  | 'settings';

interface CreateAuditLogParams {
  userId: string;
  storeId: string;
  action: AuditAction;
  entityType: EntityType;
  entityId: string;
  entityName?: string;
  changes?: Record<string, any>;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Check if test environment is active (by checking if test users exist)
 */
async function isTestModeActive(storeId: string): Promise<boolean> {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .like('employee_id', 'TEST-%')
      .eq('store_id', storeId)
      .is('deleted_at', null)
      .limit(1);

    if (error) {
      console.error('Error checking test mode:', error);
      return false; // Default to false on error to allow logging
    }

    return (data && data.length > 0) || false;
  } catch (error) {
    console.error('Error checking test mode:', error);
    return false; // Default to false on error to allow logging
  }
}

/**
 * Create an audit log entry
 * This function should be called from API routes after successful operations
 * 
 * During test mode, only TESTING_ENVIRONMENT_TRIGGER and TESTING_ENVIRONMENT_ENDED actions are logged.
 * All other actions are suppressed.
 */
export async function createAuditLog(params: CreateAuditLogParams): Promise<void> {
  try {
    // Always allow test session start/end events
    const isTestSessionEvent = 
      params.action === 'TESTING_ENVIRONMENT_TRIGGER' || 
      params.action === 'TESTING_ENVIRONMENT_ENDED';

    // Check if test mode is active (unless this is a test session event)
    if (!isTestSessionEvent) {
      const testModeActive = await isTestModeActive(params.storeId);
      if (testModeActive) {
        // Skip logging during test mode (except test session events)
        return;
      }
    }

    const supabase = createServerClient();
    
    const { error } = await supabase
      .from('audit_logs')
      .insert({
        store_id: params.storeId,
        user_id: params.userId,
        action: params.action,
        entity_type: params.entityType,
        entity_id: params.entityId,
        entity_name: params.entityName || null,
        changes: params.changes || null,
        metadata: params.metadata || null,
        ip_address: params.ipAddress || null,
        user_agent: params.userAgent || null,
        timestamp: new Date().toISOString()
      });

    if (error) {
      // Log error but don't throw - audit logging should not break the main operation
      console.error('Failed to create audit log:', error);
    }
  } catch (error) {
    // Log error but don't throw - audit logging should not break the main operation
    console.error('Error creating audit log:', error);
  }
}

/**
 * Extract IP address and user agent from request
 */
export function getRequestMetadata(request: NextRequest): {
  ipAddress: string | null;
  userAgent: string | null;
} {
  // Try to get IP from various headers (for proxies/load balancers)
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const ipAddress = forwardedFor?.split(',')[0]?.trim() || realIp || null;
  
  const userAgent = request.headers.get('user-agent') || null;
  
  return { ipAddress, userAgent };
}

/**
 * Helper to create audit log from API route
 * Extracts user info and request metadata automatically
 */
export async function logAuditAction(
  request: NextRequest,
  userId: string,
  storeId: string,
  action: AuditAction,
  entityType: EntityType,
  entityId: string,
  options?: {
    entityName?: string;
    changes?: Record<string, any>;
    metadata?: Record<string, any>;
  }
): Promise<void> {
    const { ipAddress, userAgent } = getRequestMetadata(request);
  
  await createAuditLog({
    userId,
    storeId,
    action,
    entityType,
    entityId,
    entityName: options?.entityName,
    changes: options?.changes,
    metadata: options?.metadata,
    ipAddress: ipAddress || undefined,
    userAgent: userAgent || undefined
  });
}

