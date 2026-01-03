'use client';

import { useState, useEffect } from 'react';
import { User, Role, CreateUserRequest, UpdateUserRequest } from '@/types';
import UserForm from '@/components/UserForm';
import StaffCard from '@/components/StaffCard';
import BulkImportModal from '@/components/BulkImportModal';
import DeleteUserConfirmModal from '@/components/DeleteUserConfirmModal';
import { usePermissions } from '@/hooks/usePermissions';
import { Plus, Upload, Users as UsersIcon } from 'lucide-react';
import { authenticatedFetch } from '@/lib/api-client';
import Modal from '@/components/Modal';
import Loader from '@/components/Loader';

export default function UserManagementPage() {
  const { canManageUsers, currentUser } = usePermissions();
  const [users, setUsers] = useState<(User & { role?: Role })[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUserForm, setShowUserForm] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [alert, setAlert] = useState<{ isOpen: boolean; message: string; type?: 'success' | 'error' | 'info' }>({ isOpen: false, message: '' });
  const [isBulkImporting, setIsBulkImporting] = useState(false);
  const [isAutoDeactivating, setIsAutoDeactivating] = useState(false);

  useEffect(() => {
    fetchAllData();
  }, []);

  async function fetchAllData() {
    try {
      // Parallelize API calls for faster loading
      const [usersRes, rolesRes] = await Promise.all([
        authenticatedFetch('/api/users?page=0&includeInactive=true'),
        authenticatedFetch('/api/roles')
      ]);

      // Process users response
      const usersResult = await usersRes.json();
      if (usersResult.success) {
        const allUsers = usersResult.data.data || [];
        setUsers(allUsers);
      } else {
        console.error('Failed to fetch users:', usersResult.error);
      }

      // Process roles response
      const rolesResult = await rolesRes.json();
      if (rolesResult.success) {
        setRoles(rolesResult.data);
      } else {
        console.error('Failed to fetch roles:', rolesResult.error);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  }

  const handleCreateUser = async (data: CreateUserRequest) => {
    try {
      const response = await authenticatedFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (result.success) {
        await fetchAllData();
        setShowUserForm(false);
        setAlert({ isOpen: true, message: 'User created successfully!', type: 'success' });
      } else {
        setAlert({ isOpen: true, message: result.error?.message || 'Failed to create user', type: 'error' });
      }
    } catch (error) {
      console.error('Failed to create user:', error);
      setAlert({ isOpen: true, message: 'Failed to create user', type: 'error' });
    }
  };

  const handleUpdateUser = async (data: UpdateUserRequest) => {
    if (!selectedUser) return;
    try {
      const response = await authenticatedFetch(`/api/users/${selectedUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (result.success) {
        await fetchAllData();
        setShowUserForm(false);
        setSelectedUser(null);
        setAlert({ isOpen: true, message: 'User updated successfully!', type: 'success' });
      } else {
        setAlert({ isOpen: true, message: result.error?.message || 'Failed to update user', type: 'error' });
      }
    } catch (error) {
      console.error('Failed to update user:', error);
      setAlert({ isOpen: true, message: 'Failed to update user', type: 'error' });
    }
  };

  const handleSubmit = async (data: CreateUserRequest | UpdateUserRequest) => {
    if (selectedUser) {
      await handleUpdateUser(data as UpdateUserRequest);
    } else {
      await handleCreateUser(data as CreateUserRequest);
    }
  };

  const handleToggleActive = async (user: User) => {
    try {
      const newStatus = !user.isActive;
      // Removed console.log for security - user actions logged server-side if needed
      
      const response = await authenticatedFetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: newStatus }),
      });
      const result = await response.json();
      if (result.success) {
        // User status updated successfully
        // Force refresh the user list
        await fetchAllData();
      } else {
        console.error('Failed to update user status:', result.error);
        setAlert({ isOpen: true, message: result.error?.message || 'Failed to update user status', type: 'error' });
      }
    } catch (error) {
      console.error('Failed to toggle user status:', error);
      setAlert({ isOpen: true, message: 'Failed to update user status', type: 'error' });
    }
  };

  const handleDeleteUser = async (user: User) => {
    setSelectedUser(user);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async (reassignTo?: string, confirmVacancy?: boolean) => {
    if (!selectedUser) return;
    try {
      const response = await authenticatedFetch(`/api/users/${selectedUser.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reassignTo, confirmVacancy }),
      });
      const result = await response.json();
      if (result.success) {
        await fetchAllData();
        setShowDeleteConfirm(false);
        setSelectedUser(null);
        setAlert({ isOpen: true, message: 'User deleted successfully!', type: 'success' });
      } else {
        setAlert({ isOpen: true, message: result.error?.message || 'Failed to delete user', type: 'error' });
      }
    } catch (error) {
      console.error('Failed to delete user:', error);
      setAlert({ isOpen: true, message: 'Failed to delete user', type: 'error' });
    }
  };

  const handleBulkImport = async (csvText: string) => {
    setIsBulkImporting(true);
    try {
      // Parse CSV
      const lines = csvText.trim().split('\n').filter(line => line.trim());
      if (lines.length < 2) {
        setAlert({ isOpen: true, message: 'CSV must have at least a header row and one data row', type: 'error' });
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim());
      const users = lines.slice(1).map((line, index) => {
        // Better CSV parsing that handles empty fields correctly
        const values: string[] = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        values.push(current.trim()); // Add last value
        
        // Ensure we have enough values (pad with empty strings if needed)
        while (values.length < headers.length) {
          values.push('');
        }
        
        const user: any = {};
        headers.forEach((header, idx) => {
          const value = (values[idx] || '').trim();
          
          // Parse specific fields
          if (header === 'weekOffsCount' || header === 'weekOffs') {
            // Handle week offs count (0-7) - for backward compatibility, also accept old "weekOffs" header
            const count = value ? parseInt(value) : 0;
            user.weekOffsCount = isNaN(count) ? 0 : Math.max(0, Math.min(7, count));
          } else if (header === 'experienceLevel' || header === 'ppType' || header === 'defaultShiftPreference') {
            user[header] = value || undefined;
          } else {
            user[header] = value;
          }
        });
        return user;
      });

      // Get role IDs from roles list to replace role names with IDs
      const roleMap = new Map(roles.map(r => [r.name.toLowerCase(), r.id]));
      
      // Transform users - replace role names with IDs if needed
      const transformedUsers = users.map((user: any) => {
        // If roleId looks like a name, try to find the ID
        if (user.roleId && !user.roleId.startsWith('role-') && !user.roleId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
          // Try exact match first
          let roleId = roleMap.get(user.roleId.toLowerCase());
          
          // Try partial match (e.g., "Store Manager" matches "Store Manager")
          if (!roleId) {
            for (const [roleName, id] of roleMap.entries()) {
              if (roleName.includes(user.roleId.toLowerCase()) || user.roleId.toLowerCase().includes(roleName)) {
                roleId = id;
                break;
              }
            }
          }
          
          if (roleId) {
            user.roleId = roleId;
          } else {
            throw new Error(`Role "${user.roleId}" not found. Available roles: ${Array.from(roleMap.keys()).join(', ')}`);
          }
        }
        
        // Ensure required fields
        if (!user.roleId) {
          throw new Error(`Role ID is required for user ${user.employeeId || user.firstName}`);
        }
        if (!user.experienceLevel) {
          user.experienceLevel = 'fresher'; // Default
        }
        // Ensure weekOffsCount is set (default to 0)
        if (user.weekOffsCount === undefined || user.weekOffsCount === null) {
          user.weekOffsCount = 0;
        }
        // Ensure lastName is set (default to empty string if missing)
        if (!user.lastName) {
          user.lastName = '';
        }
        
        return user;
      });

      // Call bulk import API
      const response = await authenticatedFetch('/api/users/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          users: transformedUsers,
          skipDuplicates: true
        }),
      });

      const result = await response.json();
      
      if (result.success) {
        const { created, skipped, errors } = result.data;
        let message = `Import completed: ${created} created`;
        if (skipped > 0) {
          message += `, ${skipped} skipped`;
        }
        if (errors.length > 0) {
          message += `, ${errors.length} errors\n\nErrors:\n`;
          // Show first 10 errors
          const errorList = errors.slice(0, 10).map((e: any) => 
            `Row ${e.row} (${e.employeeId || 'unknown'}): ${e.error}`
          ).join('\n');
          message += errorList;
          if (errors.length > 10) {
            message += `\n... and ${errors.length - 10} more errors`;
          }
        }
        setAlert({ isOpen: true, message, type: created > 0 ? 'success' : 'error' });
        
        if (created > 0) {
          await fetchAllData();
        }
        setShowBulkImport(false);
      } else {
        setAlert({ isOpen: true, message: result.error?.message || 'Import failed', type: 'error' });
      }
    } catch (error: any) {
      console.error('Bulk import error:', error);
      setAlert({ isOpen: true, message: 'Failed to import users: ' + error.message, type: 'error' });
    } finally {
      setIsBulkImporting(false);
    }
  };

  const filteredUsers = users.filter(user => {
    // Handle potential undefined/null values
    const firstName = user.firstName || '';
    const lastName = user.lastName || '';
    const employeeId = user.employeeId || '';
    
    const matchesSearch = 
      firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employeeId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = !filterRole || user.roleId === filterRole;
    const matchesStatus = 
      filterStatus === 'all' || 
      (filterStatus === 'active' && user.isActive) ||
      (filterStatus === 'inactive' && !user.isActive);
    
    return matchesSearch && matchesRole && matchesStatus;
  });

  const totalUsers = users.length;
  const activeUsers = users.filter(u => u.isActive).length;
  const inactiveUsers = users.filter(u => !u.isActive).length;

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <Loader size="lg" message="Loading users..." />
      </div>
    );
  }

  return (
    <div className="p-8 relative">
      {isBulkImporting && (
        <Loader fullScreen message="Importing users..." />
      )}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <h1 className="text-3xl font-bold">User Management</h1>
        {canManageUsers() && (
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setShowBulkImport(true)}
              className="btn-secondary"
            >
              Bulk Import
            </button>
            <button
              onClick={() => {
                setSelectedUser(null);
                setShowUserForm(true);
              }}
              className="btn-primary"
            >
              + Add User
            </button>
          </div>
        )}
      </div>

      <div className="mb-6">
        <div className="flex gap-4 mb-3">
          <input
            type="text"
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 input-base text-gray-900"
          />
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="input-base w-48 text-gray-900"
          >
            <option value="">All Roles</option>
            {roles.map(role => (
              <option key={role.id} value={role.id}>{role.name}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as 'all' | 'active' | 'inactive')}
            className="input-base w-48 text-gray-900"
          >
            <option value="all">All Status</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <UsersIcon className="w-4 h-4 text-gray-400" />
            <span>
              Showing <span className="font-semibold text-gray-900">{filteredUsers.length}</span> out of <span className="font-semibold text-gray-900">{totalUsers}</span> users
            </span>
          </div>
          {totalUsers > 0 && (
            <span className="text-gray-400">•</span>
          )}
          {totalUsers > 0 && (
            <span>
              {activeUsers} active, {inactiveUsers} inactive
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredUsers.map(user => (
          <StaffCard
            key={user.id}
            user={user}
            onEdit={(u) => {
              setSelectedUser(u);
              setShowUserForm(true);
            }}
            onDelete={handleDeleteUser}
            onToggleActive={handleToggleActive}
            canEdit={canManageUsers()}
            canDelete={canManageUsers()}
          />
        ))}
      </div>

      {showUserForm && (
        <UserForm
          user={selectedUser || undefined}
          roles={roles}
          onSubmit={handleSubmit}
          onCancel={() => {
            setShowUserForm(false);
            setSelectedUser(null);
          }}
          isOpen={showUserForm}
        />
      )}

      {showBulkImport && (
        <BulkImportModal
          isOpen={showBulkImport}
          onClose={() => setShowBulkImport(false)}
          onImport={handleBulkImport}
        />
      )}

      {showDeleteConfirm && selectedUser && (
        <DeleteUserConfirmModal
          isOpen={showDeleteConfirm}
          user={selectedUser}
          deleteResult={null}
          onConfirm={confirmDelete}
          onCancel={() => {
            setShowDeleteConfirm(false);
            setSelectedUser(null);
          }}
        />
      )}

      {/* Alert Modal */}
      <Modal
        isOpen={alert.isOpen}
        onClose={() => setAlert({ isOpen: false, message: '' })}
        message={alert.message}
        type={alert.type || 'info'}
        title={alert.type === 'success' ? 'Success' : alert.type === 'error' ? 'Error' : 'Information'}
      />
    </div>
  );
}
