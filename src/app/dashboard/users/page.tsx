'use client';

import { useState, useEffect } from 'react';
import { User, Role, CreateUserRequest, UpdateUserRequest } from '@/types';
import UserForm from '@/components/UserForm';
import StaffCard from '@/components/StaffCard';
import BulkImportModal from '@/components/BulkImportModal';
import DeleteUserConfirmModal from '@/components/DeleteUserConfirmModal';
import { Plus, Upload, Users as UsersIcon } from 'lucide-react';

export default function UserManagementPage() {
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

  useEffect(() => {
    fetchUsers();
    fetchRoles();
  }, []);

  async function fetchUsers() {
    try {
      // Fetch all users including inactive for user management page
      // Always use includeInactive=true to show all users (active + inactive)
      const response = await fetch('/api/users?page=0&includeInactive=true');
      const result = await response.json();
      if (result.success) {
        // Ensure we're getting all users
        const allUsers = result.data.data || [];
        const activeCount = allUsers.filter((u: any) => u.isActive).length;
        const inactiveCount = allUsers.filter((u: any) => !u.isActive).length;
        // Removed console.log for security - user counts logged server-side if needed
        setUsers(allUsers);
      } else {
        console.error('Failed to fetch users:', result.error);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchRoles() {
    try {
      const response = await fetch('/api/roles');
      const result = await response.json();
      if (result.success) {
        setRoles(result.data);
      }
    } catch (error) {
      console.error('Failed to fetch roles:', error);
    }
  }

  const handleCreateUser = async (data: CreateUserRequest) => {
    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (result.success) {
        await fetchUsers();
        setShowUserForm(false);
      } else {
        alert(result.error?.message || 'Failed to create user');
      }
    } catch (error) {
      console.error('Failed to create user:', error);
      alert('Failed to create user');
    }
  };

  const handleUpdateUser = async (data: UpdateUserRequest) => {
    if (!selectedUser) return;
    try {
      const response = await fetch(`/api/users/${selectedUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (result.success) {
        await fetchUsers();
        setShowUserForm(false);
        setSelectedUser(null);
      } else {
        alert(result.error?.message || 'Failed to update user');
      }
    } catch (error) {
      console.error('Failed to update user:', error);
      alert('Failed to update user');
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
      
      const response = await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: newStatus }),
      });
      const result = await response.json();
      if (result.success) {
        // User status updated successfully
        // Force refresh the user list
        await fetchUsers();
      } else {
        console.error('Failed to update user status:', result.error);
        alert(result.error?.message || 'Failed to update user status');
      }
    } catch (error) {
      console.error('Failed to toggle user status:', error);
      alert('Failed to update user status');
    }
  };

  const handleDeleteUser = async (user: User) => {
    setSelectedUser(user);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async (reassignTo?: string, confirmVacancy?: boolean) => {
    if (!selectedUser) return;
    try {
      const response = await fetch(`/api/users/${selectedUser.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reassignTo, confirmVacancy }),
      });
      const result = await response.json();
      if (result.success) {
        await fetchUsers();
        setShowDeleteConfirm(false);
        setSelectedUser(null);
      } else {
        alert(result.error?.message || 'Failed to delete user');
      }
    } catch (error) {
      console.error('Failed to delete user:', error);
      alert('Failed to delete user');
    }
  };

  const handleBulkImport = async (csvText: string) => {
    try {
      // Parse CSV
      const lines = csvText.trim().split('\n').filter(line => line.trim());
      if (lines.length < 2) {
        alert('CSV must have at least a header row and one data row');
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
      const response = await fetch('/api/users/bulk-import', {
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
        alert(message);
        
        if (created > 0) {
          await fetchUsers();
        }
        setShowBulkImport(false);
      } else {
        alert(result.error?.message || 'Import failed');
      }
    } catch (error: any) {
      console.error('Bulk import error:', error);
      alert('Failed to import users: ' + error.message);
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
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">User Management</h1>
        <div className="flex gap-3">
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
            canEdit={true}
            canDelete={true}
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
    </div>
  );
}
