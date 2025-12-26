'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { format, parseISO, startOfToday, formatISO, subDays, startOfMonth, endOfMonth } from 'date-fns';
import { 
  Activity, Filter, X, Eye, Clock, User, FileText, MapPin, Monitor, ChevronRight,
  UserPlus, UserMinus, UserCheck, Users, Calendar, CalendarCheck, Shield, ShieldCheck,
  ClipboardList, ClipboardCheck, Clock as ClockIcon, ArrowUpDown, Settings, Trash2,
  Plus, Edit, CheckCircle, AlertCircle, Info, Search
} from 'lucide-react';
import { authenticatedFetch } from '@/lib/api-client';

interface AuditLog {
  id: string;
  store_id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  entity_name: string | null;
  changes: any;
  metadata: any;
  ip_address: string | null;
  user_agent: string | null;
  timestamp: string;
  user?: {
    firstName: string;
    lastName: string;
    employeeId: string;
  };
}

// Action types for dropdown
const ACTION_TYPES = [
  { value: '', label: 'All Actions' },
  { value: 'CREATE_USER', label: 'Create User' },
  { value: 'UPDATE_USER', label: 'Update User' },
  { value: 'DELETE_USER', label: 'Delete User' },
  { value: 'ACTIVATE_USER', label: 'Activate User' },
  { value: 'DEACTIVATE_USER', label: 'Deactivate User' },
  { value: 'BULK_IMPORT_USERS', label: 'Bulk Import Users' },
  { value: 'BULK_DEACTIVATE_USERS', label: 'Bulk Deactivate Users' },
  { value: 'CREATE_ROSTER', label: 'Create Roster' },
  { value: 'UPDATE_ROSTER', label: 'Update Roster' },
  { value: 'DELETE_ROSTER', label: 'Delete Roster' },
  { value: 'PUBLISH_ROSTER', label: 'Publish Roster' },
  { value: 'CREATE_ROLE', label: 'Create Role' },
  { value: 'UPDATE_ROLE', label: 'Update Role' },
  { value: 'DELETE_ROLE', label: 'Delete Role' },
  { value: 'CREATE_TASK', label: 'Create Task' },
  { value: 'UPDATE_TASK', label: 'Update Task' },
  { value: 'DELETE_TASK', label: 'Delete Task' },
  { value: 'CREATE_SHIFT_DEFINITION', label: 'Create Shift' },
  { value: 'UPDATE_SHIFT_DEFINITION', label: 'Update Shift' },
  { value: 'DELETE_SHIFT_DEFINITION', label: 'Delete Shift' },
  { value: 'REORDER_SHIFT_DEFINITIONS', label: 'Reorder Shifts' },
];

// Entity types for dropdown
const ENTITY_TYPES = [
  { value: '', label: 'All Entities' },
  { value: 'user', label: 'User' },
  { value: 'roster', label: 'Roster' },
  { value: 'role', label: 'Role' },
  { value: 'task', label: 'Task' },
  { value: 'shift_definition', label: 'Shift Definition' },
  { value: 'shift', label: 'Shift' },
];

interface UserOption {
  id: string;
  name: string;
  employeeId: string;
  roleName?: string;
}

// Searchable User Dropdown Component
function UserSearchDropdown({
  label,
  value,
  users,
  loading,
  onChange,
  onClear
}: {
  label: string;
  value: string;
  users: UserOption[];
  loading: boolean;
  onChange: (userId: string) => void;
  onClear: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter users based on search term
  const filteredUsers = useMemo(() => {
    if (!searchTerm.trim()) return users;
    const search = searchTerm.toLowerCase();
    return users.filter(user => 
      user.name.toLowerCase().includes(search) ||
      user.employeeId.toLowerCase().includes(search) ||
      (user.roleName && user.roleName.toLowerCase().includes(search))
    );
  }, [users, searchTerm]);

  const selectedUser = users.find(u => u.id === value);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">{label}</label>
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          disabled={loading}
          className="w-full px-3 py-2 text-left border border-gray-300 rounded-md text-sm bg-white text-gray-900 disabled:bg-gray-50 disabled:text-gray-500 flex items-center justify-between"
        >
          <span className="truncate">
            {loading ? 'Loading users...' : selectedUser ? `${selectedUser.name} (${selectedUser.employeeId})` : 'All Users'}
          </span>
          <div className="flex items-center gap-1 ml-2 flex-shrink-0">
            {value && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClear();
                  setIsOpen(false);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <ChevronRight className={`w-4 h-4 text-gray-400 transform transition-transform ${isOpen ? 'rotate-90' : ''}`} />
          </div>
        </button>

        {isOpen && !loading && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-64 overflow-hidden flex flex-col">
            {/* Search Input */}
            <div className="p-2 border-b border-gray-200">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by name, ID, or role..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
              </div>
            </div>

            {/* User List */}
            <div className="overflow-y-auto max-h-56">
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setIsOpen(false);
                  setSearchTerm('');
                }}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                  !value ? 'bg-blue-50 text-blue-900 font-medium' : 'text-gray-900'
                }`}
              >
                All Users
              </button>
              {filteredUsers.length === 0 ? (
                <div className="px-3 py-4 text-sm text-gray-500 text-center">
                  No users found
                </div>
              ) : (
                filteredUsers.map(user => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => {
                      onChange(user.id);
                      setIsOpen(false);
                      setSearchTerm('');
                    }}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 border-t border-gray-100 ${
                      value === user.id ? 'bg-blue-50 text-blue-900 font-medium' : 'text-gray-900'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{user.name}</span>
                      <span className="text-gray-500 text-xs ml-2">{user.employeeId}</span>
                    </div>
                    {user.roleName && (
                      <div className="text-xs text-gray-500 mt-0.5">{user.roleName}</div>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ActivityLogsPage() {
  // Set default date to last 7 days to catch more logs
  const today = formatISO(startOfToday(), { representation: 'date' });
  const sevenDaysAgo = formatISO(subDays(startOfToday(), 7), { representation: 'date' });
  
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [filters, setFilters] = useState({
    action: '',
    entityType: '',
    dateFrom: sevenDaysAgo,
    dateTo: today,
    userId: '',
    entityName: ''
  });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  // Fetch users for dropdown - deferred to not block initial render
  useEffect(() => {
    // Defer user fetching to not block activity logs display
    const timer = setTimeout(() => {
      fetchUsers();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const fetchUsers = async () => {
    setUsersLoading(true);
    try {
      const response = await authenticatedFetch('/api/users?page=0&includeInactive=true');
      const result = await response.json();
      if (result.success) {
        // Filter out Picker Packer roles and map to user options
        const userOptions: UserOption[] = (result.data.data || [])
          .filter((u: any) => {
            const roleName = (u.role?.name || '').toLowerCase();
            // Exclude Picker Packer roles
            return !roleName.includes('picker packer') && !roleName.includes('pp');
          })
          .map((u: any) => ({
            id: u.id,
            name: `${u.firstName} ${u.lastName}`,
            employeeId: u.employeeId,
            roleName: u.role?.name
          }))
          .sort((a: UserOption, b: UserOption) => {
            // Sort by name for easier finding
            return a.name.localeCompare(b.name);
          });
        setUsers(userOptions);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setUsersLoading(false);
    }
  };

  // Quick date range presets
  const applyDateRange = (preset: 'today' | 'last7' | 'last30' | 'thisMonth' | 'all') => {
    const now = new Date();
    let from = '';
    let to = formatISO(now, { representation: 'date' });

    switch (preset) {
      case 'today':
        from = formatISO(startOfToday(), { representation: 'date' });
        to = formatISO(now, { representation: 'date' });
        break;
      case 'last7':
        from = formatISO(subDays(now, 7), { representation: 'date' });
        break;
      case 'last30':
        from = formatISO(subDays(now, 30), { representation: 'date' });
        break;
      case 'thisMonth':
        from = formatISO(startOfMonth(now), { representation: 'date' });
        to = formatISO(endOfMonth(now), { representation: 'date' });
        break;
      case 'all':
        from = '';
        to = '';
        break;
    }

    setPage(1); // Reset to first page when changing date range
    setFilters(prev => ({ ...prev, dateFrom: from, dateTo: to }));
  };

  // Get active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.action) count++;
    if (filters.entityType) count++;
    if (filters.userId) count++;
    if (filters.entityName) count++;
    if (filters.dateFrom && filters.dateTo) count++;
    return count;
  }, [filters]);

  // Clear individual filter
  const clearFilter = (filterName: keyof typeof filters) => {
    if (filterName === 'dateFrom' || filterName === 'dateTo') {
      setFilters({ ...filters, dateFrom: '', dateTo: '' });
    } else {
      setFilters({ ...filters, [filterName]: '' });
    }
    setPage(1);
  };

  useEffect(() => {
    fetchLogs();
  }, [page, filters]);

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        ...(filters.action && { action: filters.action }),
        ...(filters.entityType && { entityType: filters.entityType }),
        ...(filters.dateFrom && { dateFrom: filters.dateFrom }),
        ...(filters.dateTo && { dateTo: filters.dateTo }),
        ...(filters.userId && { userId: filters.userId }),
        ...(filters.entityName && { entityName: filters.entityName })
      });

      const response = await authenticatedFetch(`/api/activity-logs?${params}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: { message: `HTTP error! status: ${response.status}` } }));
        throw new Error(errorData.error?.message || `HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      if (result.success) {
        setLogs(result.data.logs || []);
        setTotalPages(result.data.totalPages || 1);
        setError(null);
      } else {
        const errorMsg = result.error?.message || 'Failed to fetch logs';
        setError(errorMsg);
        setLogs([]);
        console.error('Failed to fetch logs:', result.error);
      }
    } catch (error: any) {
      const errorMsg = error.message || 'Failed to fetch activity logs. Please try again.';
      setError(errorMsg);
      setLogs([]);
      console.error('Failed to fetch logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const getActionColor = (action: string) => {
    if (action.includes('CREATE')) return 'bg-green-100 text-green-800';
    if (action.includes('UPDATE')) return 'bg-blue-100 text-blue-800';
    if (action.includes('DELETE')) return 'bg-red-100 text-red-800';
    if (action.includes('PUBLISH')) return 'bg-purple-100 text-purple-800';
    return 'bg-gray-100 text-gray-800';
  };

  const formatChangeValue = (key: string, value: any, metadata?: any): string => {
    if (value === null || value === undefined || value === '') return 'None';
    
    // Handle shiftId and shift - check if it's a UUID and try to get shift name from metadata
    if (key === 'shiftId' || key === 'shift') {
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const stringValue = String(value);
      
      // If it's a UUID, try to get shift name from metadata
      if (uuidPattern.test(stringValue)) {
        // Try to get shift name from metadata
        if (metadata?.shiftName) {
          return metadata.shiftName;
        }
        // Return shortened ID if no name available
        return stringValue.substring(0, 8) + '...';
      }
      // If it's already a name (not a UUID), return as is
      return stringValue;
    }
    
    // Handle roleId - check if it's a UUID and try to get role name
    if (key === 'roleId' || key === 'role') {
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const stringValue = String(value);
      
      // If it's already a role name (not a UUID), return as is
      if (!uuidPattern.test(stringValue)) {
        return stringValue;
      }
      
      // If it's a UUID, try to get role name from metadata
      // Note: For role changes, the API should already be sending role names in the changes object
      // But if we still get a UUID, return shortened version
      return stringValue.substring(0, 8) + '...';
    }
    
    if (key === 'isActive') {
      return value === true || value === 'true' ? 'Active' : 'Inactive';
    }
    
    if (key === 'weekOffDays' && Array.isArray(value)) {
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      if (value.length === 0) return 'None';
      return value.map((d: number) => dayNames[d]).join(', ');
    }
    
    if (key === 'ppType') {
      if (value === 'warehouse') return 'Warehouse';
      if (value === 'adHoc') return 'Ad-Hoc';
      return String(value);
    }
    
    if (key === 'experienceLevel') {
      if (value === 'experienced') return 'Experienced';
      if (value === 'fresher') return 'Fresher';
      return String(value);
    }
    
    if (key === 'defaultShiftPreference') {
      if (!value) return 'None';
      const shiftName = String(value);
      if (shiftName.toLowerCase().includes('morning')) return 'Morning Shift';
      if (shiftName.toLowerCase().includes('evening')) return 'Evening Shift';
      return shiftName;
    }
    
    if (key === 'status') {
      return String(value).charAt(0).toUpperCase() + String(value).slice(1);
    }
    
    if (Array.isArray(value)) {
      if (value.length === 0) return 'None';
      return value.join(', ');
    }
    
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    
    return String(value);
  };

  const getFieldLabel = (key: string): string => {
    const labels: Record<string, string> = {
      firstName: 'First Name',
      lastName: 'Last Name',
      email: 'Email Address',
      phone: 'Phone Number',
      role: 'Role',
      roleId: 'Role',
      isActive: 'Active Status',
      weekOffsCount: 'Week Offs Count',
      weekOffDays: 'Week Off Days',
      defaultShiftPreference: 'Shift Preference',
      ppType: 'PP Type',
      experienceLevel: 'Experience Level',
      name: 'Name',
      description: 'Description',
      permissions: 'Permissions',
      status: 'Status',
      coverage: 'Coverage',
      slots: 'Slots',
      date: 'Date',
      shiftId: 'Shift',
      shift: 'Shift',
      startTime: 'Start Time',
      endTime: 'End Time',
      durationHours: 'Duration (Hours)',
      newOrder: 'New Order',
      display_order: 'Display Order',
      category: 'Category',
      requiredExperience: 'Required Experience',
      estimatedDuration: 'Estimated Duration',
      filledSlots: 'Filled Slots',
      taskAssignments: 'Task Assignments'
    };
    return labels[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
  };

  // Action-specific icon and color
  const getActionIcon = (action: string) => {
    if (action.includes('CREATE_USER') || action.includes('BULK_IMPORT_USERS')) return UserPlus;
    if (action.includes('UPDATE_USER')) return Edit;
    if (action.includes('DELETE_USER')) return Trash2;
    if (action.includes('DEACTIVATE_USER') || action.includes('BULK_DEACTIVATE_USERS')) return UserMinus;
    if (action.includes('ACTIVATE_USER')) return UserCheck;
    if (action.includes('CREATE_ROSTER')) return Calendar;
    if (action.includes('UPDATE_ROSTER')) return Edit;
    if (action.includes('DELETE_ROSTER')) return Trash2;
    if (action.includes('PUBLISH_ROSTER')) return CalendarCheck;
    if (action.includes('CREATE_ROLE')) return Shield;
    if (action.includes('UPDATE_ROLE')) return Edit;
    if (action.includes('DELETE_ROLE')) return Trash2;
    if (action.includes('CREATE_TASK')) return ClipboardList;
    if (action.includes('UPDATE_TASK')) return Edit;
    if (action.includes('DELETE_TASK')) return Trash2;
    if (action.includes('CREATE_SHIFT_DEFINITION')) return ClockIcon;
    if (action.includes('UPDATE_SHIFT_DEFINITION')) return Edit;
    if (action.includes('DELETE_SHIFT_DEFINITION')) return Trash2;
    if (action.includes('REORDER_SHIFT_DEFINITIONS')) return ArrowUpDown;
    return FileText;
  };

  const getActionTitle = (action: string, entityType: string, entityName: string | null) => {
    if (action.includes('CREATE_USER')) return `New User Created`;
    if (action.includes('UPDATE_USER')) return `User Updated`;
    if (action.includes('DELETE_USER')) return `User Deleted`;
    if (action.includes('DEACTIVATE_USER')) return `User Deactivated`;
    if (action.includes('ACTIVATE_USER')) return `User Activated`;
    if (action.includes('BULK_IMPORT_USERS')) return `Bulk User Import`;
    if (action.includes('BULK_DEACTIVATE_USERS')) return `Bulk User Deactivation`;
    if (action.includes('CREATE_ROSTER')) return `New Roster Created`;
    if (action.includes('UPDATE_ROSTER')) return `Roster Updated`;
    if (action.includes('DELETE_ROSTER')) return `Roster Deleted`;
    if (action.includes('PUBLISH_ROSTER')) return `Roster Published`;
    if (action.includes('CREATE_ROLE')) return `New Role Created`;
    if (action.includes('UPDATE_ROLE')) return `Role Updated`;
    if (action.includes('DELETE_ROLE')) return `Role Deleted`;
    if (action.includes('CREATE_TASK')) return `New Task Created`;
    if (action.includes('UPDATE_TASK')) return `Task Updated`;
    if (action.includes('DELETE_TASK')) return `Task Deleted`;
    if (action.includes('CREATE_SHIFT_DEFINITION')) return `New Shift Created`;
    if (action.includes('UPDATE_SHIFT_DEFINITION')) return `Shift Updated`;
    if (action.includes('DELETE_SHIFT_DEFINITION')) return `Shift Deleted`;
    if (action.includes('REORDER_SHIFT_DEFINITIONS')) return `Shifts Reordered`;
    return `${action} on ${entityType}`;
  };

  // Render action-specific content
  const renderActionSpecificContent = (log: AuditLog) => {
    const action = log.action;
    const changes = log.changes || {};
    const metadata = log.metadata || {};

    // USER ACTIONS
    if (action.includes('CREATE_USER')) {
      // Extract values from changes (for CREATE, we show the 'new' values)
      const getNewValue = (key: string) => {
        if (changes[key] && changes[key].new !== undefined) {
          return changes[key].new;
        }
        return null;
      };
      
      const roleName = metadata.role || getNewValue('roleId');
      const email = metadata.email || getNewValue('email');
      const employeeId = getNewValue('employeeId');
      const firstName = getNewValue('firstName');
      const lastName = getNewValue('lastName');
      const experienceLevel = metadata.experienceLevel || getNewValue('experienceLevel');
      const ppType = metadata.ppType || getNewValue('ppType');
      const defaultShiftPreference = metadata.defaultShiftPreference || getNewValue('defaultShiftPreference');
      const weekOffsCount = metadata.weekOffsCount !== undefined ? metadata.weekOffsCount : getNewValue('weekOffsCount');
      const isActive = metadata.isActive !== undefined ? metadata.isActive : (getNewValue('isActive') !== null ? getNewValue('isActive') : true);
      
      return (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <UserPlus className="w-5 h-5 text-green-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-green-900 mb-1">New User Account Created</h3>
                <p className="text-sm text-green-700">{log.entity_name || 'Unknown User'}</p>
              </div>
            </div>
          </div>
          
          {/* User Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {employeeId && (
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Employee ID</p>
                <p className="text-sm font-medium text-gray-900">{employeeId}</p>
              </div>
            )}
            
            {firstName && lastName && (
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Full Name</p>
                <p className="text-sm font-medium text-gray-900">{firstName} {lastName}</p>
              </div>
            )}
            
            {roleName && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="w-4 h-4 text-blue-600" />
                  <p className="text-xs font-semibold text-blue-700 uppercase">Role</p>
                </div>
                <p className="text-sm font-medium text-blue-900">{roleName}</p>
              </div>
            )}
            
            {email && (
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Email</p>
                <p className="text-sm text-gray-900 break-all">{email}</p>
              </div>
            )}
            
            {experienceLevel && (
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Experience Level</p>
                <p className="text-sm font-medium text-gray-900">
                  {experienceLevel === 'experienced' ? 'Experienced' : 
                   experienceLevel === 'fresher' ? 'Fresher' : 
                   experienceLevel}
                </p>
              </div>
            )}
            
            {ppType && (
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">PP Type</p>
                <p className="text-sm font-medium text-gray-900">
                  {ppType === 'warehouse' ? 'Warehouse' : 
                   ppType === 'adHoc' ? 'Ad-Hoc' : 
                   ppType}
                </p>
              </div>
            )}
            
            {defaultShiftPreference && (
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Default Shift Preference</p>
                <p className="text-sm font-medium text-gray-900">{defaultShiftPreference}</p>
              </div>
            )}
            
            {weekOffsCount !== null && weekOffsCount !== undefined && (
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Week Offs Count</p>
                <p className="text-sm font-medium text-gray-900">{weekOffsCount}</p>
              </div>
            )}
            
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Status</p>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
              }`}>
                {isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
          
          {/* Show all changes in a structured way */}
          {changes && Object.keys(changes).length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                <h4 className="text-sm font-semibold text-gray-900">All Created Fields</h4>
              </div>
              <div className="divide-y divide-gray-200">
                {Object.entries(changes)
                  .filter(([key]) => {
                    // Show fields that weren't already displayed prominently
                    const shownFields = ['employeeId', 'firstName', 'lastName', 'roleId', 'email', 'experienceLevel', 'ppType', 'defaultShiftPreference', 'weekOffsCount', 'isActive'];
                    return !shownFields.includes(key);
                  })
                  .map(([key, value]: [string, any]) => {
                    const displayValue = value?.new !== undefined ? value.new : value;
                    if (displayValue === null || displayValue === undefined || displayValue === '') return null;
                    
                    return (
                      <div key={key} className="px-4 py-3">
                        <p className="text-xs font-semibold text-gray-500 uppercase mb-1">{getFieldLabel(key)}</p>
                        <p className="text-sm text-gray-900">{formatChangeValue(key, displayValue)}</p>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (action.includes('UPDATE_USER')) {
      const changeCount = Object.keys(changes).length;
      return (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Edit className="w-5 h-5 text-blue-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-blue-900 mb-1">User Profile Updated</h3>
                <p className="text-sm text-blue-700">{log.entity_name || 'Unknown User'}</p>
                <p className="text-xs text-blue-600 mt-1">{changeCount} field{changeCount !== 1 ? 's' : ''} modified</p>
              </div>
            </div>
          </div>

          {/* Personal Information Changes */}
          {(changes.firstName || changes.lastName || changes.email || changes.phone) && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                <h4 className="text-sm font-semibold text-gray-900">Personal Information</h4>
              </div>
              <div className="divide-y divide-gray-200">
                {changes.firstName && (
                  <div className="px-4 py-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">First Name</p>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-1 bg-red-50 text-red-700 rounded text-sm border border-red-200">{formatChangeValue('firstName', changes.firstName.old, metadata)}</span>
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                      <span className="px-2 py-1 bg-green-50 text-green-700 rounded text-sm border border-green-200">{formatChangeValue('firstName', changes.firstName.new, metadata)}</span>
                    </div>
                  </div>
                )}
                {changes.lastName && (
                  <div className="px-4 py-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Last Name</p>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-1 bg-red-50 text-red-700 rounded text-sm border border-red-200">{formatChangeValue('lastName', changes.lastName.old, metadata)}</span>
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                      <span className="px-2 py-1 bg-green-50 text-green-700 rounded text-sm border border-green-200">{formatChangeValue('lastName', changes.lastName.new, metadata)}</span>
                    </div>
                  </div>
                )}
                {changes.email && (
                  <div className="px-4 py-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Email Address</p>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-1 bg-red-50 text-red-700 rounded text-sm border border-red-200 break-all">{formatChangeValue('email', changes.email.old, metadata)}</span>
                      <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="px-2 py-1 bg-green-50 text-green-700 rounded text-sm border border-green-200 break-all">{formatChangeValue('email', changes.email.new, metadata)}</span>
                    </div>
                  </div>
                )}
                {changes.phone && (
                  <div className="px-4 py-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Phone Number</p>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-1 bg-red-50 text-red-700 rounded text-sm border border-red-200">{formatChangeValue('phone', changes.phone.old, metadata)}</span>
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                      <span className="px-2 py-1 bg-green-50 text-green-700 rounded text-sm border border-green-200">{formatChangeValue('phone', changes.phone.new, metadata)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Role & Permissions Changes */}
          {(changes.role || changes.roleId) && (
            <div className="border border-purple-200 rounded-lg overflow-hidden bg-purple-50/30">
              <div className="bg-purple-50 px-4 py-2 border-b border-purple-200">
                <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-purple-600" />
                  Role & Permissions
                </h4>
              </div>
              <div className="px-4 py-3">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Role</p>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 bg-red-50 text-red-700 rounded text-sm border border-red-200">{formatChangeValue('role', changes.role?.old || changes.roleId?.old, metadata)}</span>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                  <span className="px-2 py-1 bg-green-50 text-green-700 rounded text-sm border border-green-200">{formatChangeValue('role', changes.role?.new || changes.roleId?.new, metadata)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Shift Preference Changes */}
          {changes.defaultShiftPreference && (
            <div className="border border-amber-200 rounded-lg overflow-hidden bg-amber-50/30">
              <div className="bg-amber-50 px-4 py-2 border-b border-amber-200">
                <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <ClockIcon className="w-4 h-4 text-amber-600" />
                  Shift Preferences
                </h4>
              </div>
              <div className="px-4 py-3">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Default Shift Preference</p>
                <div className="flex items-center gap-2">
                      <span className="px-2 py-1 bg-red-50 text-red-700 rounded text-sm border border-red-200">{formatChangeValue('defaultShiftPreference', changes.defaultShiftPreference.old, metadata)}</span>
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                      <span className="px-2 py-1 bg-green-50 text-green-700 rounded text-sm border border-green-200">{formatChangeValue('defaultShiftPreference', changes.defaultShiftPreference.new, metadata)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Week Offs Changes */}
          {(changes.weekOffsCount || changes.weekOffDays) && (
            <div className="border border-indigo-200 rounded-lg overflow-hidden bg-indigo-50/30">
              <div className="bg-indigo-50 px-4 py-2 border-b border-indigo-200">
                <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-indigo-600" />
                  Week Offs
                </h4>
              </div>
              <div className="divide-y divide-gray-200">
                {changes.weekOffsCount && (
                  <div className="px-4 py-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Week Offs Count</p>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-1 bg-red-50 text-red-700 rounded text-sm border border-red-200">{formatChangeValue('weekOffsCount', changes.weekOffsCount.old, metadata)}</span>
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                      <span className="px-2 py-1 bg-green-50 text-green-700 rounded text-sm border border-green-200">{formatChangeValue('weekOffsCount', changes.weekOffsCount.new, metadata)}</span>
                    </div>
                  </div>
                )}
                {changes.weekOffDays && (
                  <div className="px-4 py-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Week Off Days</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-1 bg-red-50 text-red-700 rounded text-sm border border-red-200">{formatChangeValue('weekOffDays', changes.weekOffDays.old, metadata)}</span>
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                      <span className="px-2 py-1 bg-green-50 text-green-700 rounded text-sm border border-green-200">{formatChangeValue('weekOffDays', changes.weekOffDays.new, metadata)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Other Changes */}
          {Object.entries(changes).filter(([key]) => 
            !['firstName', 'lastName', 'email', 'phone', 'role', 'roleId', 'defaultShiftPreference', 'weekOffsCount', 'weekOffDays'].includes(key)
          ).length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                <h4 className="text-sm font-semibold text-gray-900">Other Changes</h4>
              </div>
              <div className="divide-y divide-gray-200">
                {Object.entries(changes)
                  .filter(([key]) => !['firstName', 'lastName', 'email', 'phone', 'role', 'roleId', 'defaultShiftPreference', 'weekOffsCount', 'weekOffDays'].includes(key))
                  .map(([key, value]: [string, any]) => (
                    <div key={key} className="px-4 py-3">
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-2">{getFieldLabel(key)}</p>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-1 bg-red-50 text-red-700 rounded text-sm border border-red-200">{formatChangeValue(key, value.old, metadata)}</span>
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                        <span className="px-2 py-1 bg-green-50 text-green-700 rounded text-sm border border-green-200">{formatChangeValue(key, value.new, metadata)}</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (action.includes('DELETE_USER') || action.includes('DEACTIVATE_USER')) {
      const isDelete = action.includes('DELETE');
      return (
        <div className="space-y-4">
          <div className={`border rounded-lg p-4 ${isDelete ? 'bg-red-50 border-red-200' : 'bg-orange-50 border-orange-200'}`}>
            <div className="flex items-start gap-3">
              {isDelete ? <Trash2 className="w-5 h-5 text-red-600 mt-0.5" /> : <UserMinus className="w-5 h-5 text-orange-600 mt-0.5" />}
              <div className="flex-1">
                <h3 className={`font-semibold mb-1 ${isDelete ? 'text-red-900' : 'text-orange-900'}`}>
                  {isDelete ? 'User Account Deleted' : 'User Account Deactivated'}
                </h3>
                <p className={`text-sm ${isDelete ? 'text-red-700' : 'text-orange-700'}`}>{log.entity_name || 'Unknown User'}</p>
                {metadata.reason && (
                  <p className="text-xs text-gray-600 mt-2">{metadata.reason}</p>
                )}
                {metadata.autoDeactivated && (
                  <div className="mt-2 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-orange-600" />
                    <span className="text-xs text-orange-700">Auto-deactivated by system</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    // ROSTER ACTIONS
    if (action.includes('CREATE_ROSTER')) {
      return (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Calendar className="w-5 h-5 text-green-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-green-900 mb-1">New Roster Created</h3>
                <p className="text-sm text-green-700">{log.entity_name || 'Unknown Roster'}</p>
              </div>
            </div>
          </div>
          
          {metadata.shiftName && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-xs font-semibold text-blue-700 uppercase mb-1">Shift</p>
              <p className="text-sm font-medium text-blue-900">{metadata.shiftName}</p>
            </div>
          )}
          
          {metadata.totalSlots !== undefined && (
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Total Slots</p>
                <p className="text-lg font-semibold text-gray-900">{metadata.totalSlots}</p>
              </div>
              {metadata.filledSlots !== undefined && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Filled Slots</p>
                  <p className="text-lg font-semibold text-gray-900">{metadata.filledSlots}</p>
                </div>
              )}
            </div>
          )}

          {/* Task Assignments for New Roster */}
          {metadata.taskAssignments && (
            <div className="border border-blue-200 rounded-lg overflow-hidden bg-blue-50/30">
              <div className="bg-blue-50 px-4 py-3 border-b border-blue-200">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <User className="w-4 h-4 text-blue-600" />
                  Initial Task Assignments
                </h3>
              </div>
              <div className="px-4 py-3">
                <div className="space-y-2">
                  {metadata.taskAssignments.split('; ').map((assignment: string, idx: number) => (
                    <div key={idx} className="text-sm text-gray-900 bg-white rounded-lg p-3 border border-blue-100">
                      {assignment}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Show changes if available (for CREATE, these are the initial values) */}
          {changes && Object.keys(changes).filter(key => {
            // Skip shift/shiftId if we already show shiftName in metadata section above
            return key !== 'shift' && key !== 'shiftId';
          }).length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                <h4 className="text-sm font-semibold text-gray-900">Roster Details</h4>
              </div>
              <div className="divide-y divide-gray-200">
                {Object.entries(changes)
                  .filter(([key]) => key !== 'shift' && key !== 'shiftId') // Skip shift fields as they're shown in metadata
                  .map(([key, value]: [string, any]) => {
                    // For CREATE actions, show the 'new' value
                    const displayValue = value?.new !== undefined ? value.new : value;
                    if (displayValue === null || displayValue === undefined) return null;
                    
                    return (
                      <div key={key} className="px-4 py-3">
                        <p className="text-xs font-semibold text-gray-500 uppercase mb-1">{getFieldLabel(key)}</p>
                        <p className="text-sm text-gray-900">{formatChangeValue(key, displayValue, metadata)}</p>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (action.includes('UPDATE_ROSTER')) {
      return (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Edit className="w-5 h-5 text-blue-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-blue-900 mb-1">Roster Updated</h3>
                <p className="text-sm text-blue-700">{log.entity_name || 'Unknown Roster'}</p>
              </div>
            </div>
          </div>

          {changes.status && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                <h4 className="text-sm font-semibold text-gray-900">Status Change</h4>
              </div>
              <div className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                    changes.status.old === 'published' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'
                  }`}>{changes.status.old}</span>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                    changes.status.new === 'published' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'
                  }`}>{changes.status.new}</span>
                </div>
              </div>
            </div>
          )}

          {metadata.taskAssignments && (
            <div className="border border-blue-200 rounded-lg overflow-hidden bg-blue-50/30">
              <div className="bg-blue-50 px-4 py-3 border-b border-blue-200">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <User className="w-4 h-4 text-blue-600" />
                  Task Assignments
                </h3>
              </div>
              <div className="px-4 py-3">
                <div className="space-y-2">
                  {metadata.taskAssignments.split('; ').map((assignment: string, idx: number) => (
                    <div key={idx} className="text-sm text-gray-900 bg-white rounded-lg p-3 border border-blue-100">
                      {assignment}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    if (action.includes('DELETE_ROSTER')) {
      return (
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Trash2 className="w-5 h-5 text-red-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-red-900 mb-1">Roster Deleted</h3>
                <p className="text-sm text-red-700">{log.entity_name || 'Unknown Roster'}</p>
              </div>
            </div>
          </div>
          
          {metadata.totalSlots !== undefined && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Slots Affected</p>
              <p className="text-sm text-gray-900">{metadata.totalSlots} slot{metadata.totalSlots !== 1 ? 's' : ''} were removed</p>
            </div>
          )}
        </div>
      );
    }

    if (action.includes('PUBLISH_ROSTER')) {
      return (
        <div className="space-y-4">
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <CalendarCheck className="w-5 h-5 text-purple-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-purple-900 mb-1">Roster Published</h3>
                <p className="text-sm text-purple-700">{log.entity_name || 'Unknown Roster'}</p>
                <p className="text-xs text-purple-600 mt-1">Roster is now visible to all staff members</p>
              </div>
            </div>
          </div>
          
          {metadata.publishedAt && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Published At</p>
              <p className="text-sm text-gray-900">{format(parseISO(metadata.publishedAt), 'PPpp')}</p>
            </div>
          )}
        </div>
      );
    }

    // BULK ACTIONS
    if (action.includes('BULK_IMPORT_USERS')) {
      return (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Users className="w-5 h-5 text-green-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-green-900 mb-1">Bulk User Import</h3>
                <p className="text-sm text-green-700">{log.entity_name || 'Bulk Import Operation'}</p>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-4">
            {metadata.totalAttempted !== undefined && (
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Total Attempted</p>
                <p className="text-lg font-semibold text-gray-900">{metadata.totalAttempted}</p>
              </div>
            )}
            {metadata.created !== undefined && (
              <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                <p className="text-xs font-semibold text-green-700 uppercase mb-1">Successfully Created</p>
                <p className="text-lg font-semibold text-green-900">{metadata.created}</p>
              </div>
            )}
            {metadata.errorsCount !== undefined && metadata.errorsCount > 0 && (
              <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                <p className="text-xs font-semibold text-red-700 uppercase mb-1">Errors</p>
                <p className="text-lg font-semibold text-red-900">{metadata.errorsCount}</p>
              </div>
            )}
          </div>
        </div>
      );
    }

    if (action.includes('BULK_DEACTIVATE_USERS')) {
      return (
        <div className="space-y-4">
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Users className="w-5 h-5 text-orange-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-orange-900 mb-1">Bulk User Deactivation</h3>
                <p className="text-sm text-orange-700">{log.entity_name || 'Bulk Deactivation Operation'}</p>
              </div>
            </div>
          </div>
          
          {metadata.deactivatedCount !== undefined && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Users Deactivated</p>
              <p className="text-lg font-semibold text-gray-900">{metadata.deactivatedCount}</p>
            </div>
          )}
          
          {metadata.reason && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-xs font-semibold text-blue-700 uppercase mb-1">Reason</p>
              <p className="text-sm text-blue-900">{metadata.reason}</p>
            </div>
          )}
        </div>
      );
    }

    // ROLE ACTIONS
    if (action.includes('CREATE_ROLE')) {
      return (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-green-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-green-900 mb-1">New Role Created</h3>
                <p className="text-sm text-green-700">{log.entity_name || 'Unknown Role'}</p>
              </div>
            </div>
          </div>
          
          {metadata.permissions && (
            <div className="border border-purple-200 rounded-lg overflow-hidden bg-purple-50/30">
              <div className="bg-purple-50 px-4 py-2 border-b border-purple-200">
                <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-purple-600" />
                  Permissions
                </h4>
              </div>
              <div className="px-4 py-3">
                {Array.isArray(metadata.permissions) ? (
                  <div className="flex flex-wrap gap-2">
                    {metadata.permissions.map((perm: string, idx: number) => (
                      <span key={idx} className="px-2.5 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-medium">
                        {perm}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-900">{String(metadata.permissions)}</p>
                )}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (action.includes('UPDATE_ROLE')) {
      const changeCount = Object.keys(changes).length;
      return (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Edit className="w-5 h-5 text-blue-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-blue-900 mb-1">Role Updated</h3>
                <p className="text-sm text-blue-700">{log.entity_name || 'Unknown Role'}</p>
                <p className="text-xs text-blue-600 mt-1">{changeCount} field{changeCount !== 1 ? 's' : ''} modified</p>
              </div>
            </div>
          </div>

          {changes.name && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                <h4 className="text-sm font-semibold text-gray-900">Role Name</h4>
              </div>
              <div className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 bg-red-50 text-red-700 rounded text-sm border border-red-200">{changes.name.old}</span>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                  <span className="px-2 py-1 bg-green-50 text-green-700 rounded text-sm border border-green-200">{changes.name.new}</span>
                </div>
              </div>
            </div>
          )}

          {changes.permissions && (
            <div className="border border-purple-200 rounded-lg overflow-hidden bg-purple-50/30">
              <div className="bg-purple-50 px-4 py-2 border-b border-purple-200">
                <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-purple-600" />
                  Permissions Changed
                </h4>
              </div>
              <div className="px-4 py-3 space-y-3">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Previous Permissions</p>
                  <div className="flex flex-wrap gap-2">
                    {Array.isArray(changes.permissions.old) ? (
                      changes.permissions.old.map((perm: string, idx: number) => (
                        <span key={idx} className="px-2.5 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium">
                          {perm}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-gray-600">None</span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">New Permissions</p>
                  <div className="flex flex-wrap gap-2">
                    {Array.isArray(changes.permissions.new) ? (
                      changes.permissions.new.map((perm: string, idx: number) => (
                        <span key={idx} className="px-2.5 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                          {perm}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-gray-600">None</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {Object.entries(changes).filter(([key]) => !['name', 'permissions'].includes(key)).length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                <h4 className="text-sm font-semibold text-gray-900">Other Changes</h4>
              </div>
              <div className="divide-y divide-gray-200">
                {Object.entries(changes)
                  .filter(([key]) => !['name', 'permissions'].includes(key))
                  .map(([key, value]: [string, any]) => (
                    <div key={key} className="px-4 py-3">
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-2">{getFieldLabel(key)}</p>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-1 bg-red-50 text-red-700 rounded text-sm border border-red-200">{formatChangeValue(key, value.old, metadata)}</span>
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                        <span className="px-2 py-1 bg-green-50 text-green-700 rounded text-sm border border-green-200">{formatChangeValue(key, value.new, metadata)}</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (action.includes('DELETE_ROLE')) {
      return (
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Trash2 className="w-5 h-5 text-red-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-red-900 mb-1">Role Deleted</h3>
                <p className="text-sm text-red-700">{log.entity_name || 'Unknown Role'}</p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // TASK ACTIONS
    if (action.includes('CREATE_TASK')) {
      return (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <ClipboardList className="w-5 h-5 text-green-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-green-900 mb-1">New Task Created</h3>
                <p className="text-sm text-green-700">{log.entity_name || 'Unknown Task'}</p>
              </div>
            </div>
          </div>
          
          {metadata.category && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-xs font-semibold text-blue-700 uppercase mb-1">Category</p>
              <p className="text-sm font-medium text-blue-900">{metadata.category}</p>
            </div>
          )}
          
          {metadata.isActive !== undefined && (
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Status</p>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                metadata.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
              }`}>
                {metadata.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
          )}
        </div>
      );
    }

    if (action.includes('UPDATE_TASK')) {
      const changeCount = Object.keys(changes).length;
      return (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Edit className="w-5 h-5 text-blue-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-blue-900 mb-1">Task Updated</h3>
                <p className="text-sm text-blue-700">{log.entity_name || 'Unknown Task'}</p>
                <p className="text-xs text-blue-600 mt-1">{changeCount} field{changeCount !== 1 ? 's' : ''} modified</p>
              </div>
            </div>
          </div>

          {Object.keys(changes).length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                <h4 className="text-sm font-semibold text-gray-900">Changes</h4>
              </div>
              <div className="divide-y divide-gray-200">
                {Object.entries(changes).map(([key, value]: [string, any]) => (
                  <div key={key} className="px-4 py-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">{getFieldLabel(key)}</p>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-1 bg-red-50 text-red-700 rounded text-sm border border-red-200">{formatChangeValue(key, value.old)}</span>
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                      <span className="px-2 py-1 bg-green-50 text-green-700 rounded text-sm border border-green-200">{formatChangeValue(key, value.new)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (action.includes('DELETE_TASK')) {
      return (
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Trash2 className="w-5 h-5 text-red-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-red-900 mb-1">Task Deleted</h3>
                <p className="text-sm text-red-700">{log.entity_name || 'Unknown Task'}</p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // SHIFT ACTIONS
    if (action.includes('CREATE_SHIFT_DEFINITION')) {
      return (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <ClockIcon className="w-5 h-5 text-green-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-green-900 mb-1">New Shift Created</h3>
                <p className="text-sm text-green-700">{log.entity_name || 'Unknown Shift'}</p>
                {metadata.initialized && (
                  <span className="inline-flex items-center px-2 py-0.5 mt-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                    System Initialized
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            {metadata.startTime && (
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Start Time</p>
                <p className="text-sm font-medium text-gray-900">{metadata.startTime}</p>
              </div>
            )}
            {metadata.endTime && (
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">End Time</p>
                <p className="text-sm font-medium text-gray-900">{metadata.endTime}</p>
              </div>
            )}
          </div>
          
          {metadata.durationHours && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-xs font-semibold text-blue-700 uppercase mb-1">Duration</p>
              <p className="text-sm font-medium text-blue-900">{metadata.durationHours} hour{metadata.durationHours !== 1 ? 's' : ''}</p>
            </div>
          )}
        </div>
      );
    }

    if (action.includes('UPDATE_SHIFT_DEFINITION')) {
      const changeCount = Object.keys(changes).length;
      return (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Edit className="w-5 h-5 text-blue-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-blue-900 mb-1">Shift Updated</h3>
                <p className="text-sm text-blue-700">{log.entity_name || 'Unknown Shift'}</p>
                <p className="text-xs text-blue-600 mt-1">{changeCount} field{changeCount !== 1 ? 's' : ''} modified</p>
              </div>
            </div>
          </div>

          {Object.keys(changes).length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                <h4 className="text-sm font-semibold text-gray-900">Changes</h4>
              </div>
              <div className="divide-y divide-gray-200">
                {Object.entries(changes).map(([key, value]: [string, any]) => (
                  <div key={key} className="px-4 py-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">{getFieldLabel(key)}</p>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-1 bg-red-50 text-red-700 rounded text-sm border border-red-200">{formatChangeValue(key, value.old)}</span>
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                      <span className="px-2 py-1 bg-green-50 text-green-700 rounded text-sm border border-green-200">{formatChangeValue(key, value.new)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (action.includes('DELETE_SHIFT_DEFINITION')) {
      return (
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Trash2 className="w-5 h-5 text-red-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-red-900 mb-1">Shift Deleted</h3>
                <p className="text-sm text-red-700">{log.entity_name || 'Unknown Shift'}</p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (action.includes('REORDER_SHIFT_DEFINITIONS')) {
      return (
        <div className="space-y-4">
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <ArrowUpDown className="w-5 h-5 text-indigo-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-indigo-900 mb-1">Shifts Reordered</h3>
                <p className="text-sm text-indigo-700">{metadata.shiftCount || 0} shift{metadata.shiftCount !== 1 ? 's' : ''} reordered</p>
              </div>
            </div>
          </div>
          
          {changes.newOrder && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                <h4 className="text-sm font-semibold text-gray-900">New Order</h4>
              </div>
              <div className="px-4 py-3">
                <div className="flex items-center gap-2 flex-wrap">
                  {changes.newOrder.new.split(' → ').map((shift: string, idx: number) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="px-3 py-1 bg-indigo-100 text-indigo-800 rounded-lg text-sm font-medium">
                        {idx + 1}. {shift}
                      </span>
                      {idx < changes.newOrder.new.split(' → ').length - 1 && (
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    // Default fallback for other actions
    return null;
  };

  useEffect(() => {
    if (selectedLog) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [selectedLog]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedLog) {
        setSelectedLog(null);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [selectedLog]);

  return (
    <div className="p-8">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
            <Activity className="w-5 h-5 text-slate-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Activity Logs</h1>
            <p className="text-sm text-gray-500">Detailed system activity and audit trail</p>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
            {activeFilterCount > 0 && (
              <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                {activeFilterCount} active
              </span>
            )}
          </div>
          {activeFilterCount > 0 && (
            <button
              onClick={() => setFilters({ action: '', entityType: '', dateFrom: sevenDaysAgo, dateTo: today, userId: '', entityName: '' })}
              className="text-sm text-gray-600 hover:text-gray-900 font-medium"
            >
              Clear All
            </button>
          )}
        </div>

        {/* Quick Date Range Presets */}
        <div className="mb-4 pb-4 border-b border-gray-200">
          <label className="text-xs font-semibold text-gray-500 uppercase mb-2 block">Quick Date Ranges</label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => applyDateRange('today')}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
            >
              Today
            </button>
            <button
              onClick={() => applyDateRange('last7')}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
            >
              Last 7 Days
            </button>
            <button
              onClick={() => applyDateRange('last30')}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
            >
              Last 30 Days
            </button>
            <button
              onClick={() => applyDateRange('thisMonth')}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
            >
              This Month
            </button>
            <button
              onClick={() => applyDateRange('all')}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
            >
              All Time
            </button>
          </div>
        </div>

        {/* Filter Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          {/* Action Type Dropdown */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Action Type</label>
            <div className="relative">
              <select
            value={filters.action}
                onChange={(e) => {
                  setFilters({ ...filters, action: e.target.value });
                  setPage(1);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900 appearance-none pr-8"
              >
                {ACTION_TYPES.map(action => (
                  <option key={action.value} value={action.value}>{action.label}</option>
                ))}
              </select>
              {filters.action && (
                <button
                  onClick={() => clearFilter('action')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Entity Type Dropdown */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Entity Type</label>
            <div className="relative">
              <select
                value={filters.entityType}
                onChange={(e) => {
                  setFilters({ ...filters, entityType: e.target.value });
                  setPage(1);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900 appearance-none pr-8"
              >
                {ENTITY_TYPES.map(entity => (
                  <option key={entity.value} value={entity.value}>{entity.label}</option>
                ))}
              </select>
              {filters.entityType && (
                <button
                  onClick={() => clearFilter('entityType')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* User Searchable Dropdown */}
          <UserSearchDropdown
            label="Performed By"
            value={filters.userId}
            users={users}
            loading={usersLoading}
            onChange={(userId) => {
              setFilters({ ...filters, userId });
              setPage(1);
            }}
            onClear={() => clearFilter('userId')}
          />

          {/* Entity Name Search */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Entity Name</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
                placeholder="Search entity name..."
                value={filters.entityName}
                onChange={(e) => {
                  setFilters({ ...filters, entityName: e.target.value });
                  setPage(1);
                }}
                className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900 placeholder-gray-500"
              />
              {filters.entityName && (
                <button
                  onClick={() => clearFilter('entityName')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Date From */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Date From</label>
            <div className="relative">
          <input
            type="date"
            value={filters.dateFrom}
                onChange={(e) => {
                  setFilters({ ...filters, dateFrom: e.target.value });
                  setPage(1);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900 pr-8"
              />
              {filters.dateFrom && (
                <button
                  onClick={() => clearFilter('dateFrom')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Date To */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Date To</label>
            <div className="relative">
          <input
            type="date"
            value={filters.dateTo}
                onChange={(e) => {
                  setFilters({ ...filters, dateTo: e.target.value });
                  setPage(1);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900 pr-8"
              />
              {filters.dateTo && (
          <button
                  onClick={() => clearFilter('dateTo')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
              )}
            </div>
        </div>
        </div>

        {/* Active Filter Chips */}
        {activeFilterCount > 0 && (
          <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-200">
            <span className="text-xs font-semibold text-gray-500 uppercase">Active Filters:</span>
            {filters.action && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                Action: {ACTION_TYPES.find(a => a.value === filters.action)?.label || filters.action}
                <button onClick={() => clearFilter('action')} className="hover:text-blue-900">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {filters.entityType && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                Entity: {ENTITY_TYPES.find(e => e.value === filters.entityType)?.label || filters.entityType}
                <button onClick={() => clearFilter('entityType')} className="hover:text-blue-900">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {filters.userId && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                User: {users.find(u => u.id === filters.userId)?.name || 'Selected'}
                <button onClick={() => clearFilter('userId')} className="hover:text-blue-900">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {filters.entityName && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                Name: {filters.entityName}
                <button onClick={() => clearFilter('entityName')} className="hover:text-blue-900">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {(filters.dateFrom || filters.dateTo) && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                Date: {filters.dateFrom || '...'} to {filters.dateTo || '...'}
                <button onClick={() => clearFilter('dateFrom')} className="hover:text-blue-900">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Logs Table */}
      {loading ? (
        <div className="text-center py-12">
          <div className="loader-spinner loader-spinner-lg"></div>
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <Activity className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 text-lg mb-2">No activity logs found</p>
          <p className="text-gray-400 text-sm mb-4">
            {filters.dateFrom || filters.dateTo 
              ? `No logs found for the selected date range (${filters.dateFrom} to ${filters.dateTo})`
              : 'No activity logs have been recorded yet. Activity logs are created when users perform actions like creating, updating, or deleting records.'}
          </p>
          {activeFilterCount > 0 && (
            <button
              onClick={() => setFilters({ action: '', entityType: '', dateFrom: sevenDaysAgo, dateTo: today, userId: '', entityName: '' })}
              className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Timestamp</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">User</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Action</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Entity</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Details</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {format(parseISO(log.timestamp), 'MMM d, yyyy HH:mm:ss')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {log.user ? (
                        <>
                      <div className="text-sm font-medium text-gray-900">
                            {[log.user.firstName, log.user.lastName].filter(Boolean).join(' ') || 'Unknown User'}
                      </div>
                          {log.user.employeeId && (
                      <div className="text-xs text-gray-500">
                              {log.user.employeeId}
                      </div>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="text-sm font-medium text-gray-900">Unknown User</div>
                          <div className="text-xs text-gray-500">{log.user_id.substring(0, 8)}</div>
                        </>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getActionColor(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">{log.entity_type}</div>
                      {log.entity_name && (
                        <div className="text-xs text-gray-500">{log.entity_name}</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-2">
                        {/* Show summary if available */}
                        {log.metadata?.taskAssignments && (
                          <div className="text-xs text-gray-600 mb-2 max-w-md">
                            {log.metadata.taskAssignments.split('; ').slice(0, 2).map((assignment: string, idx: number) => (
                              <div key={idx} className="truncate">{assignment}</div>
                            ))}
                            {log.metadata.taskAssignments.split('; ').length > 2 && (
                              <div className="text-gray-500 italic">+{log.metadata.taskAssignments.split('; ').length - 2} more</div>
                            )}
                          </div>
                        )}
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors border border-blue-200 hover:border-blue-300"
                        >
                          <Eye className="w-4 h-4" />
                          View Details
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {log.ip_address || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900 disabled:opacity-50 disabled:bg-gray-50"
              >
                Previous
              </button>
              <span className="text-sm text-gray-700">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900 disabled:opacity-50 disabled:bg-gray-50"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {/* Details Modal */}
      {selectedLog && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto"
          onClick={() => setSelectedLog(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-3xl my-8 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
              <div className="flex items-center gap-3">
                {(() => {
                  const IconComponent = getActionIcon(selectedLog.action);
                  return (
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getActionColor(selectedLog.action)}`}>
                      <IconComponent className="w-5 h-5" />
                    </div>
                  );
                })()}
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    {getActionTitle(selectedLog.action, selectedLog.entity_type, selectedLog.entity_name)}
                  </h2>
                  <p className="text-sm text-gray-500">{selectedLog.action}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Close"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              {/* Action-Specific Content */}
              {renderActionSpecificContent(selectedLog) && (
                <div>
                  {renderActionSpecificContent(selectedLog)}
                </div>
              )}
              {/* Basic Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-gray-500" />
                    <span className="text-xs font-semibold text-gray-500 uppercase">Timestamp</span>
                  </div>
                  <p className="text-sm font-medium text-gray-900">
                    {format(parseISO(selectedLog.timestamp), 'PPpp')}
                  </p>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <User className="w-4 h-4 text-gray-500" />
                    <span className="text-xs font-semibold text-gray-500 uppercase">Performed By</span>
                  </div>
                  {selectedLog.user ? (
                    <>
                      <p className="text-sm font-medium text-gray-900">
                        {selectedLog.user.firstName} {selectedLog.user.lastName}
                      </p>
                      {selectedLog.user.employeeId && (
                        <p className="text-xs text-gray-500 mt-1">{selectedLog.user.employeeId}</p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm font-medium text-gray-900">Unknown User</p>
                  )}
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-gray-500" />
                    <span className="text-xs font-semibold text-gray-500 uppercase">Entity Type</span>
                  </div>
                  <p className="text-sm font-medium text-gray-900 capitalize">{selectedLog.entity_type}</p>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold text-gray-500 uppercase">Entity</span>
                  </div>
                  <p className="text-sm font-medium text-gray-900">
                    {selectedLog.entity_name || selectedLog.entity_id.substring(0, 8)}
                  </p>
                </div>
              </div>

              {/* Generic Changes Section (for actions without custom views) */}
              {selectedLog.changes && Object.keys(selectedLog.changes).length > 0 && !renderActionSpecificContent(selectedLog) && (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-blue-50 px-4 py-3 border-b border-gray-200">
                    <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                      <ChevronRight className="w-4 h-4" />
                      Changes Made
                    </h3>
                  </div>
                  <div className="divide-y divide-gray-200">
                    {Object.entries(selectedLog.changes).map(([key, value]: [string, any]) => {
                      if (value && typeof value === 'object' && 'old' in value && 'new' in value) {
                        const fieldLabel = getFieldLabel(key);
                        const oldVal = formatChangeValue(key, value.old);
                        const newVal = formatChangeValue(key, value.new);
                        
                        return (
                          <div key={key} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <p className="text-sm font-medium text-gray-900 mb-1">{fieldLabel}</p>
                                <div className="flex items-center gap-2 text-xs">
                                  <span className="px-2 py-1 bg-red-50 text-red-700 rounded border border-red-200">
                                    {oldVal}
                                  </span>
                                  <ChevronRight className="w-3 h-3 text-gray-400" />
                                  <span className="px-2 py-1 bg-green-50 text-green-700 rounded border border-green-200">
                                    {newVal}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })}
                  </div>
                </div>
              )}

              {/* Additional Metadata Section (for non-customized actions or extra metadata) */}
              {(() => {
                // Helper function to check if a value is meaningful
                const isMeaningfulValue = (value: any): boolean => {
                  if (value === null || value === undefined) return false;
                  if (typeof value === 'string' && (value.trim() === '' || value.toLowerCase() === 'n/a' || value.toLowerCase() === 'none')) return false;
                  if (typeof value === 'boolean' && value === false) {
                    // For some boolean fields, false might not be meaningful to display
                    return true; // We'll let the key exclusion handle this
                  }
                  if (Array.isArray(value) && value.length === 0) return false;
                  if (typeof value === 'object' && Object.keys(value).length === 0) return false;
                  return true;
                };

                const meaningfulEntries = Object.entries(selectedLog.metadata || {})
                  .filter(([key, value]) => {
                    // Filter out metadata already shown in action-specific views
                    const excludedKeys = [
                      'taskAssignments', 'role', 'email', 'isActive', 'shiftName', 'totalSlots', 
                      'filledSlots', 'publishedAt', 'totalAttempted', 'created', 'errorsCount', 'deactivatedCount', 
                      'reason', 'autoDeactivated', 'shiftCount', 'skipDuplicates', 'skipped',
                      'confirmVacancy', 'reassignTo', 'deletionReason', 'impactedRosters', 'affectedUsers',
                      'initialized', 'durationHours', 'startTime', 'endTime', 'category'
                    ];
                    return !excludedKeys.includes(key) && isMeaningfulValue(value);
                  });

                return meaningfulEntries.length > 0 ? (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-purple-50 px-4 py-3 border-b border-gray-200">
                      <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                        <Info className="w-4 h-4" />
                        Additional Information
                      </h3>
                    </div>
                    <div className="divide-y divide-gray-200">
                      {meaningfulEntries.map(([key, value]) => (
                        <div key={key} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                          <p className="text-xs font-semibold text-gray-500 uppercase mb-1">{getFieldLabel(key)}</p>
                          <p className="text-sm text-gray-900">
                            {typeof value === 'object' && value !== null ? JSON.stringify(value, null, 2) : String(value)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null;
              })()}

              {/* Technical Details */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <ChevronRight className="w-4 h-4" />
                    Technical Details
                  </h3>
                </div>
                <div className="divide-y divide-gray-200">
                  <div className="px-4 py-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Entity ID</p>
                    <p className="text-sm font-mono text-gray-900">{selectedLog.entity_id}</p>
                  </div>
                  {selectedLog.ip_address && (
                    <div className="px-4 py-3 flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-gray-400" />
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-gray-500 uppercase mb-1">IP Address</p>
                        <p className="text-sm font-mono text-gray-900">{selectedLog.ip_address}</p>
                      </div>
                    </div>
                  )}
                  {selectedLog.user_agent && (
                    <div className="px-4 py-3 flex items-center gap-2">
                      <Monitor className="w-4 h-4 text-gray-400" />
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-gray-500 uppercase mb-1">User Agent</p>
                        <p className="text-sm text-gray-900 break-all">{selectedLog.user_agent}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
