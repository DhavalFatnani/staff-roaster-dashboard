/**
 * Client-side permission checking hook
 * Checks if current user has specific permissions
 */

import { useState, useEffect } from 'react';
import { User, Role, Permission } from '@/types';
import { authenticatedFetch } from '@/lib/api-client';

export function usePermissions() {
  const [currentUser, setCurrentUser] = useState<(User & { role?: Role }) | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  async function fetchCurrentUser() {
    try {
      const { data: { session } } = await (await import('@/lib/supabase')).supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }

      const response = await authenticatedFetch(`/api/users/${session.user.id}`);
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          setCurrentUser(result.data);
        }
      }
    } catch (error) {
      console.error('Failed to fetch current user:', error);
    } finally {
      setLoading(false);
    }
  }

  /**
   * Check if user has a specific permission
   */
  function hasPermission(permission: Permission): boolean {
    if (!currentUser?.role) return false;
    
    // Store Manager has all permissions
    if (currentUser.role.name === 'Store Manager') {
      return true;
    }

    // Check if role has the permission
    return currentUser.role.permissions.includes(permission);
  }

  /**
   * Check if user has any of the specified permissions
   */
  function hasAnyPermission(permissions: Permission[]): boolean {
    return permissions.some(permission => hasPermission(permission));
  }

  /**
   * Check if user has all of the specified permissions
   */
  function hasAllPermissions(permissions: Permission[]): boolean {
    return permissions.every(permission => hasPermission(permission));
  }

  /**
   * Check if user can perform CRUD operations on users
   */
  function canManageUsers(): boolean {
    return hasPermission(Permission.CRUD_USER);
  }

  /**
   * Check if user can manage roles
   */
  function canManageRoles(): boolean {
    return hasPermission(Permission.CRUD_ROLE);
  }

  /**
   * Check if user can create rosters
   */
  function canCreateRoster(): boolean {
    return hasPermission(Permission.CREATE_ROSTER);
  }

  /**
   * Check if user can modify rosters
   */
  function canModifyRoster(): boolean {
    return hasPermission(Permission.MODIFY_ROSTER);
  }

  /**
   * Check if user can publish rosters
   */
  function canPublishRoster(): boolean {
    return hasPermission(Permission.PUBLISH_ROSTER);
  }

  /**
   * Check if user can view rosters
   */
  function canViewRoster(): boolean {
    return hasPermission(Permission.VIEW_ROSTER);
  }

  return {
    currentUser,
    loading,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    canManageUsers,
    canManageRoles,
    canCreateRoster,
    canModifyRoster,
    canPublishRoster,
    canViewRoster,
    isStoreManager: currentUser?.role?.name === 'Store Manager',
  };
}

