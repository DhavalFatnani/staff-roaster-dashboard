'use client';

import { useState, useEffect, useMemo } from 'react';
import { User } from '@/types';
import { CheckCircle2 } from 'lucide-react';

type ShiftPreference = 'morning' | 'evening' | null;
type ViewMode = 'templates' | 'all-staff';

export default function ShiftPreferencesPage() {
  const [users, setUsers] = useState<(User & { role?: any })[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [viewMode, setViewMode] = useState<ViewMode>('templates');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [selectedPreference, setSelectedPreference] = useState<ShiftPreference | 'all'>('all');
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [lastUpdatedUser, setLastUpdatedUser] = useState<string>('');
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'name' | 'role' | 'preference' | 'employeeId'>('preference');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/users?page=0');
      const result = await response.json();
      if (result.success) {
        const activeUsers = result.data.data.filter((u: User) => u.isActive && !u.deletedAt);
        setUsers(activeUsers);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleShiftPreferenceChange = async (userId: string, preference: ShiftPreference) => {
    setSaving(prev => ({ ...prev, [userId]: true }));
    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultShiftPreference: preference })
      });

      const result = await response.json();
      if (result.success) {
        setUsers(prev => prev.map(u => 
          u.id === userId 
            ? { ...u, defaultShiftPreference: preference as any }
            : u
        ));
        setLastUpdatedUser(userId);
        setShowSuccessToast(true);
        setTimeout(() => setShowSuccessToast(false), 2000);
      } else {
        alert(result.error?.message || 'Failed to update shift preference');
      }
    } catch (error) {
      console.error('Failed to update shift preference:', error);
      alert('Failed to update shift preference');
    } finally {
      setSaving(prev => ({ ...prev, [userId]: false }));
    }
  };

  const handleBulkUpdate = async (preference: ShiftPreference) => {
    if (selectedUserIds.size === 0) return;
    
    const userIds = Array.from(selectedUserIds);
    setSaving(prev => {
      const newState = { ...prev };
      userIds.forEach(id => newState[id] = true);
      return newState;
    });

    try {
      const promises = userIds.map(userId =>
        fetch(`/api/users/${userId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ defaultShiftPreference: preference })
        })
      );

      const results = await Promise.all(promises);
      const jsonResults = await Promise.all(results.map(r => r.json()));
      
      if (jsonResults.every(r => r.success)) {
        setUsers(prev => prev.map(u => 
          selectedUserIds.has(u.id)
            ? { ...u, defaultShiftPreference: preference as any }
            : u
        ));
        setSelectedUserIds(new Set());
        setBulkSelectMode(false);
        setShowSuccessToast(true);
        setTimeout(() => setShowSuccessToast(false), 2000);
      } else {
        alert('Some updates failed. Please try again.');
      }
    } catch (error) {
      console.error('Failed to bulk update:', error);
      alert('Failed to update preferences');
    } finally {
      setSaving(prev => {
        const newState = { ...prev };
        userIds.forEach(id => delete newState[id]);
        return newState;
      });
    }
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedUserIds.size === filteredUsers.length) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(filteredUsers.map(u => u.id)));
    }
  };

  // Role priority for sorting
  const ROLE_PRIORITY: Record<string, number> = {
    'Shift In Charge': 1,
    'Inventory Executive': 2,
    'Picker Packer (Warehouse)': 3,
    'Picker Packer (Ad-Hoc)': 4,
    'Store Manager': 5,
  };

  const usersByRole = useMemo(() => {
    const grouped = users.reduce((acc, user) => {
      const roleName = user.role?.name || 'No Role';
      if (!acc[roleName]) {
        acc[roleName] = [];
      }
      acc[roleName].push(user);
      return acc;
    }, {} as Record<string, (User & { role?: any })[]>);

    // Sort roles by priority
    return Object.keys(grouped)
      .sort((a, b) => (ROLE_PRIORITY[a] || 99) - (ROLE_PRIORITY[b] || 99))
      .reduce((acc, roleName) => {
        acc[roleName] = grouped[roleName];
        return acc;
      }, {} as Record<string, (User & { role?: any })[]>);
  }, [users]);

  // Filter and sort users
  const filteredUsers = useMemo(() => {
    let filtered = users.filter(user => {
      const matchesSearch = 
        (user.firstName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (user.lastName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (user.employeeId || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesRole = !selectedRole || user.roleId === selectedRole;
      const matchesPreference = 
        selectedPreference === 'all' || 
        user.defaultShiftPreference === selectedPreference;
      return matchesSearch && matchesRole && matchesPreference;
    });

    // Sort users
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          const nameA = `${a.firstName || ''} ${a.lastName || ''}`.trim().toLowerCase();
          const nameB = `${b.firstName || ''} ${b.lastName || ''}`.trim().toLowerCase();
          return nameA.localeCompare(nameB);
        case 'role':
          const roleA = (a.role?.name || '').toLowerCase();
          const roleB = (b.role?.name || '').toLowerCase();
          const priorityA = ROLE_PRIORITY[a.role?.name || ''] || 99;
          const priorityB = ROLE_PRIORITY[b.role?.name || ''] || 99;
          if (priorityA !== priorityB) return priorityA - priorityB;
          return roleA.localeCompare(roleB);
        case 'preference':
          const prefA = a.defaultShiftPreference || 'none';
          const prefB = b.defaultShiftPreference || 'none';
          const prefOrder = { 'morning': 1, 'evening': 2, 'none': 3 };
          if (prefOrder[prefA] !== prefOrder[prefB]) {
            return prefOrder[prefA] - prefOrder[prefB];
          }
          // Secondary sort by name
          const nameA2 = `${a.firstName || ''} ${a.lastName || ''}`.trim().toLowerCase();
          const nameB2 = `${b.firstName || ''} ${b.lastName || ''}`.trim().toLowerCase();
          return nameA2.localeCompare(nameB2);
        case 'employeeId':
          return (a.employeeId || '').localeCompare(b.employeeId || '');
        default:
          return 0;
      }
    });

    return filtered;
  }, [users, searchTerm, selectedRole, selectedPreference, sortBy]);


  // Get unique roles for filter
  const roles = useMemo(() => {
    return Array.from(new Set(users.map(u => ({ id: u.roleId, name: u.role?.name || 'No Role' }))))
      .filter((role, index, self) => index === self.findIndex(r => r.id === role.id))
      .sort((a, b) => (ROLE_PRIORITY[a.name] || 99) - (ROLE_PRIORITY[b.name] || 99));
  }, [users]);

  // Statistics
  const stats = useMemo(() => {
    const morning = users.filter(u => u.defaultShiftPreference === 'morning').length;
    const evening = users.filter(u => u.defaultShiftPreference === 'evening').length;
    const none = users.filter(u => !u.defaultShiftPreference).length;
    const total = users.length;
    return { morning, evening, none, total };
  }, [users]);

  // Get role color with subtle colors
  const getRoleColor = (roleName: string) => {
    const role = roleName.toLowerCase();
    if (role.includes('store manager')) return { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' };
    if (role.includes('shift in charge')) return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' };
    if (role.includes('inventory executive')) return { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' };
    if (role.includes('picker packer')) {
      if (role.includes('warehouse')) return { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' };
      return { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' };
    }
    return { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' };
  };

  const toggleRoleExpansion = (roleName: string, shift: 'morning' | 'evening') => {
    const key = `${shift}-${roleName}`;
    setExpandedRoles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };


  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading staff preferences...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 mb-1">Shift Preferences</h1>
            <p className="text-sm text-gray-500">Manage default shift assignments</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('templates')}
              className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
                viewMode === 'templates'
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              Templates
            </button>
            <button
              onClick={() => setViewMode('all-staff')}
              className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
                viewMode === 'all-staff'
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              All Staff
            </button>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="bg-white border-l-4 border-l-amber-400 border border-gray-200 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Morning</p>
                <p className="text-lg font-semibold text-gray-900">{stats.morning}</p>
                <p className="text-xs text-amber-600 mt-0.5">
                  {stats.total > 0 ? Math.round((stats.morning / stats.total) * 100) : 0}%
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white border-l-4 border-l-indigo-400 border border-gray-200 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Evening</p>
                <p className="text-lg font-semibold text-gray-900">{stats.evening}</p>
                <p className="text-xs text-indigo-600 mt-0.5">
                  {stats.total > 0 ? Math.round((stats.evening / stats.total) * 100) : 0}%
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white border-l-4 border-l-gray-400 border border-gray-200 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">No Preference</p>
                <p className="text-lg font-semibold text-gray-900">{stats.none}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {stats.total > 0 ? Math.round((stats.none / stats.total) * 100) : 0}%
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white border-l-4 border-l-blue-400 border border-gray-200 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Total Staff</p>
                <p className="text-lg font-semibold text-gray-900">{stats.total}</p>
                <p className="text-xs text-blue-600 mt-0.5">Active</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Templates View */}
      {viewMode === 'templates' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Morning Template */}
          <div className="bg-white rounded-xl border border-gray-200/60 overflow-hidden">
            <div className="bg-amber-50 border-b border-amber-200 px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-amber-900">Morning Shift</h2>
                  <p className="text-xs text-amber-700 mt-0.5">{stats.morning} staff</p>
                </div>
                <span className="text-xs font-medium text-amber-900 bg-amber-100 px-2 py-1 rounded">
                  {stats.morning}
                </span>
              </div>
            </div>
            <div className="p-3 max-h-[600px] overflow-y-auto">
              {users.filter(u => u.defaultShiftPreference === 'morning').length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <p className="text-sm text-gray-500">No staff assigned</p>
                  <p className="text-xs text-gray-400 mt-1">Assign from "All Staff" view</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {Object.entries(usersByRole).map(([roleName, roleUsers]) => {
                    const morningUsers = roleUsers.filter(u => u.defaultShiftPreference === 'morning');
                    if (morningUsers.length === 0) return null;
                    const isExpanded = expandedRoles.has(`morning-${roleName}`);
                    return (
                      <div key={roleName} className="mb-3">
                        <button
                          onClick={() => toggleRoleExpansion(roleName, 'morning')}
                          className="w-full bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-1.5 flex items-center justify-between hover:bg-amber-100 transition-colors"
                        >
                          <h3 className="text-sm font-bold text-amber-900">{roleName}</h3>
                          <span className="text-xs text-amber-700 ml-2">
                            {isExpanded ? '−' : '+'} {morningUsers.length}
                          </span>
                        </button>
                        {isExpanded && (
                          <div className="space-y-1">
                            {morningUsers.map(user => (
                              <div
                                key={user.id}
                                className="flex items-center justify-between p-2 bg-white rounded border border-gray-200 hover:bg-gray-50 transition-colors group"
                              >
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900 truncate">
                                    {user.firstName || ''} {user.lastName || ''}
                                  </p>
                                  <p className="text-xs text-gray-500 truncate">
                                    {user.employeeId}
                                  </p>
                                </div>
                                <button
                                  onClick={() => handleShiftPreferenceChange(user.id, null)}
                                  disabled={saving[user.id]}
                                  className="ml-2 px-2 py-1 text-xs font-medium bg-white text-gray-600 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 transition-all opacity-0 group-hover:opacity-100"
                                  title="Remove"
                                >
                                  {saving[user.id] ? '...' : '×'}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Evening Template */}
          <div className="bg-white rounded-xl border border-gray-200/60 overflow-hidden">
            <div className="bg-indigo-50 border-b border-indigo-200 px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-indigo-900">Evening Shift</h2>
                  <p className="text-xs text-indigo-700 mt-0.5">{stats.evening} staff</p>
                </div>
                <span className="text-xs font-medium text-indigo-900 bg-indigo-100 px-2 py-1 rounded">
                  {stats.evening}
                </span>
              </div>
            </div>
            <div className="p-3 max-h-[600px] overflow-y-auto">
              {users.filter(u => u.defaultShiftPreference === 'evening').length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <p className="text-sm text-gray-500">No staff assigned</p>
                  <p className="text-xs text-gray-400 mt-1">Assign from "All Staff" view</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {Object.entries(usersByRole).map(([roleName, roleUsers]) => {
                    const eveningUsers = roleUsers.filter(u => u.defaultShiftPreference === 'evening');
                    if (eveningUsers.length === 0) return null;
                    const isExpanded = expandedRoles.has(`evening-${roleName}`);
                    return (
                      <div key={roleName} className="mb-3">
                        <button
                          onClick={() => toggleRoleExpansion(roleName, 'evening')}
                          className="w-full bg-indigo-50 border border-indigo-200 rounded px-3 py-2 mb-1.5 flex items-center justify-between hover:bg-indigo-100 transition-colors"
                        >
                          <h3 className="text-sm font-bold text-indigo-900">{roleName}</h3>
                          <span className="text-xs text-indigo-700 ml-2">
                            {isExpanded ? '−' : '+'} {eveningUsers.length}
                          </span>
                        </button>
                        {isExpanded && (
                          <div className="space-y-1">
                            {eveningUsers.map(user => (
                              <div
                                key={user.id}
                                className="flex items-center justify-between p-2 bg-white rounded border border-gray-200 hover:bg-gray-50 transition-colors group"
                              >
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900 truncate">
                                    {user.firstName || ''} {user.lastName || ''}
                                  </p>
                                  <p className="text-xs text-gray-500 truncate">
                                    {user.employeeId}
                                  </p>
                                </div>
                                <button
                                  onClick={() => handleShiftPreferenceChange(user.id, null)}
                                  disabled={saving[user.id]}
                                  className="ml-2 px-2 py-1 text-xs font-medium bg-white text-gray-600 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 transition-all opacity-0 group-hover:opacity-100"
                                  title="Remove"
                                >
                                  {saving[user.id] ? '...' : '×'}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* All Staff View */}
      {viewMode === 'all-staff' && (
        <div className="bg-white rounded-xl border border-gray-200/60 overflow-hidden">
          {/* Filters and Bulk Actions */}
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            {/* Search and Filters Row */}
            <div className="flex flex-col lg:flex-row gap-3 mb-3">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Search by name or employee ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-gray-900 bg-white placeholder-gray-600"
                />
              </div>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-gray-900 bg-white w-full lg:w-40"
              >
                <option value="">All Roles</option>
                {roles.map(role => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
              <select
                value={selectedPreference === null ? 'none' : selectedPreference === 'all' ? 'all' : selectedPreference}
                onChange={(e) => {
                  const value = e.target.value;
                  setSelectedPreference(value === 'all' ? 'all' : value === 'none' ? null : value as ShiftPreference);
                }}
                className="px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-gray-900 bg-white w-full lg:w-40"
              >
                <option value="all">All Preferences</option>
                <option value="morning">Morning</option>
                <option value="evening">Evening</option>
                <option value="none">No Preference</option>
              </select>
            </div>

            {/* Sort Options */}
            <div className="flex flex-col sm:flex-row gap-3 mb-3 pb-3 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-gray-600">Sort by:</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                  className="px-2 py-1.5 text-xs border border-gray-300 rounded-md focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-gray-900 bg-white"
                >
                  <option value="preference">Preference</option>
                  <option value="name">Name</option>
                  <option value="role">Role</option>
                  <option value="employeeId">Employee ID</option>
                </select>
              </div>
            </div>

            {/* Bulk Actions */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setBulkSelectMode(!bulkSelectMode);
                    setSelectedUserIds(new Set());
                  }}
                  className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
                    bulkSelectMode
                      ? 'bg-gray-900 text-white'
                      : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {bulkSelectMode ? 'Cancel' : 'Bulk Select'}
                </button>
                {bulkSelectMode && selectedUserIds.size > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600">
                      {selectedUserIds.size} selected
                    </span>
                    <button
                      onClick={toggleSelectAll}
                      className="text-xs text-gray-700 hover:text-gray-900 font-medium"
                    >
                      {selectedUserIds.size === filteredUsers.length ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
                )}
              </div>
              {bulkSelectMode && selectedUserIds.size > 0 && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleBulkUpdate('morning')}
                    disabled={Object.values(saving).some(v => v)}
                    className="px-3 py-1.5 bg-amber-500 text-white rounded-md hover:bg-amber-600 disabled:opacity-50 font-medium text-xs"
                  >
                    Morning ({selectedUserIds.size})
                  </button>
                  <button
                    onClick={() => handleBulkUpdate('evening')}
                    disabled={Object.values(saving).some(v => v)}
                    className="px-3 py-1.5 bg-indigo-500 text-white rounded-md hover:bg-indigo-600 disabled:opacity-50 font-medium text-xs"
                  >
                    Evening ({selectedUserIds.size})
                  </button>
                  <button
                    onClick={() => handleBulkUpdate(null)}
                    disabled={Object.values(saving).some(v => v)}
                    className="px-3 py-1.5 bg-gray-500 text-white rounded-md hover:bg-gray-600 disabled:opacity-50 font-medium text-xs"
                  >
                    Clear ({selectedUserIds.size})
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Staff List - Table View */}
          <div className="p-4">
            {filteredUsers.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <p className="text-sm text-gray-500">No staff found</p>
                <p className="text-xs text-gray-400 mt-1">Try adjusting your filters</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {bulkSelectMode && (
                        <th className="px-4 py-3 text-left">
                          <input
                            type="checkbox"
                            checked={selectedUserIds.size === filteredUsers.length && filteredUsers.length > 0}
                            onChange={toggleSelectAll}
                            className="w-4 h-4 text-gray-900 rounded focus:ring-gray-400"
                          />
                        </th>
                      )}
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Employee ID</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Role</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Preference</th>
                      {!bulkSelectMode && (
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredUsers.map(user => {
                      const isSelected = selectedUserIds.has(user.id);
                      const isSaving = saving[user.id];
                      return (
                        <tr
                          key={user.id}
                          className={`hover:bg-gray-50 transition-colors ${
                            isSelected ? 'bg-blue-50' : ''
                          } ${isSaving ? 'opacity-50' : ''}`}
                        >
                          {bulkSelectMode && (
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleUserSelection(user.id)}
                                className="w-4 h-4 text-gray-900 rounded focus:ring-gray-400"
                              />
                            </td>
                          )}
                          <td className="px-4 py-3">
                            <div className="text-sm font-medium text-gray-900">
                              {user.firstName || ''} {user.lastName || ''}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-xs text-gray-600">{user.employeeId}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                              user.role?.name?.toLowerCase().includes('store manager') ? 'bg-red-100 text-red-700' :
                              user.role?.name?.toLowerCase().includes('shift in charge') ? 'bg-blue-100 text-blue-700' :
                              user.role?.name?.toLowerCase().includes('inventory executive') ? 'bg-purple-100 text-purple-700' :
                              user.role?.name?.toLowerCase().includes('warehouse') ? 'bg-green-100 text-green-700' :
                              user.role?.name?.toLowerCase().includes('picker packer') ? 'bg-orange-100 text-orange-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {user.role?.name || 'No Role'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {user.defaultShiftPreference ? (
                              <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                                user.defaultShiftPreference === 'morning'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-indigo-100 text-indigo-700'
                              }`}>
                                {user.defaultShiftPreference === 'morning' ? '🌅' : '🌙'} {user.defaultShiftPreference}
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-500">
                                No preference
                              </span>
                            )}
                          </td>
                          {!bulkSelectMode && (
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  onClick={() => handleShiftPreferenceChange(user.id, 'morning')}
                                  disabled={isSaving}
                                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                                    user.defaultShiftPreference === 'morning'
                                      ? 'bg-amber-500 text-white shadow-sm'
                                      : 'bg-amber-50 text-amber-700 border border-amber-300 hover:bg-amber-100'
                                  } disabled:opacity-50`}
                                  title="Set Morning"
                                >
                                  Morning
                                </button>
                                <button
                                  onClick={() => handleShiftPreferenceChange(user.id, 'evening')}
                                  disabled={isSaving}
                                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                                    user.defaultShiftPreference === 'evening'
                                      ? 'bg-indigo-500 text-white shadow-sm'
                                      : 'bg-indigo-50 text-indigo-700 border border-indigo-300 hover:bg-indigo-100'
                                  } disabled:opacity-50`}
                                  title="Set Evening"
                                >
                                  Evening
                                </button>
                                {user.defaultShiftPreference && (
                                  <button
                                    onClick={() => handleShiftPreferenceChange(user.id, null)}
                                    disabled={isSaving}
                                    className="px-2 py-1.5 bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 disabled:opacity-50 text-xs font-medium"
                                    title="Clear preference"
                                  >
                                    Clear
                                  </button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Success Toast */}
      {showSuccessToast && (
        <div className="fixed bottom-4 right-4 bg-slate-900 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-slide-up z-50">
          <CheckCircle2 className="w-4 h-4" />
          <span className="text-sm font-medium">Updated successfully</span>
        </div>
      )}
    </div>
  );
}
