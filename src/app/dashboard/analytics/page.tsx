'use client';

import { useEffect, useState } from 'react';
import { format, subDays, parseISO, startOfDay, endOfDay, isWithinInterval, getDay } from 'date-fns';
import { Users, Calendar, BarChart3, Zap, Download, Filter, AlertTriangle, UserX } from 'lucide-react';
import { authenticatedFetch } from '@/lib/api-client';
import Modal, { ConfirmModal } from '@/components/Modal';

interface AnalyticsData {
  staff: {
    total: number;
    active: number;
    inactive: number;
    byRole: Record<string, number>;
    byExperience: Record<string, number>;
    byShiftPreference: Record<string, number>;
  };
  rosters: {
    total: number;
    byStatus: Record<string, number>;
    byShift: Record<string, number>; // Shift name -> count
    published: number;
    draft: number;
    archived: number;
    trends: Array<{ date: string; count: number }>;
    coverageTrends: Array<{ date: string; coverage: number }>;
  };
  coverage: {
    average: number;
    min: number;
    max: number;
    byShift: Record<string, number>;
  };
  activity: {
    totalActions: number;
    byAction: Record<string, number>;
    byEntity: Record<string, number>;
    trends: Array<{ date: string; count: number }>;
  };
  extraWork: {
    totalOccurrences: number; // Total number of times staff were assigned on weekoff
    uniqueStaffCount: number; // Number of unique staff who were extra worked
    byStaff: Array<{ userId: string; userName: string; occurrences: number }>; // Breakdown by staff
  };
  inactiveStaff: {
    count: number; // Number of active staff not assigned to any roster
    byStaff: Array<{ userId: string; userName: string; daysSinceLastAssignment: number; autoDeactivated: boolean }>; // Breakdown by staff
  };
}

type TimePeriod = '7d' | '30d' | '90d' | 'custom';

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('30d');
  const [customStartDate, setCustomStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [customEndDate, setCustomEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'staff' | 'rosters' | 'coverage' | 'activity'>('all');
  const [autoDeactivating, setAutoDeactivating] = useState(false);
  const [alert, setAlert] = useState<{ isOpen: boolean; message: string; type?: 'success' | 'error' | 'info' }>({ isOpen: false, message: '' });
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean }>({ isOpen: false });

  const getDateRange = () => {
    const end = new Date();
    let start: Date;
    
    switch (timePeriod) {
      case '7d':
        start = subDays(end, 7);
        break;
      case '30d':
        start = subDays(end, 30);
        break;
      case '90d':
        start = subDays(end, 90);
        break;
      case 'custom':
        start = new Date(customStartDate);
        end.setTime(new Date(customEndDate).getTime());
        break;
      default:
        start = subDays(end, 30);
    }
    
    return { start: startOfDay(start), end: endOfDay(end) };
  };

  useEffect(() => {
    fetchAnalytics();
  }, [timePeriod, customStartDate, customEndDate]);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const { start, end } = getDateRange();
      
      const [usersRes, rostersRes, shiftsRes, logsRes] = await Promise.all([
        authenticatedFetch('/api/users?page=0'),
        authenticatedFetch('/api/rosters'),
        authenticatedFetch('/api/shift-definitions'),
        authenticatedFetch('/api/activity-logs?page=1')
      ]);

      const usersData = await usersRes.json();
      const rostersData = await rostersRes.json();
      const shiftsData = await shiftsRes.json();
      const logsData = await logsRes.json();

      // Create shift map for lookups
      const shiftsMap = new Map();
      if (shiftsData.success) {
        (shiftsData.data || []).forEach((shift: any) => {
          shiftsMap.set(shift.id, shift.name || shift.shift_type || 'Unknown');
        });
      }

      const users = usersData.success ? (usersData.data.data || []) : [];
      const allRosters = rostersData.success ? (rostersData.data || []) : [];
      const allLogs = logsData.success ? (logsData.data.logs || []) : [];

      // Filter rosters by date range
      const rosters = allRosters.filter((roster: any) => {
        const rosterDate = roster.date ? new Date(roster.date) : new Date(roster.createdAt);
        return isWithinInterval(rosterDate, { start, end });
      });

      // Filter logs by date range
      const logs = allLogs.filter((log: any) => {
        if (!log.timestamp) return false;
        try {
          const logDate = typeof log.timestamp === 'string' ? parseISO(log.timestamp) : new Date(log.timestamp);
          return isWithinInterval(logDate, { start, end });
        } catch {
          return false;
        }
      });

      // Process staff analytics
      const byRole: Record<string, number> = {};
      const byExperience: Record<string, number> = {};
      const byShiftPreference: Record<string, number> = {};

      users.forEach((user: any) => {
        const roleName = user.role?.name || 'No Role';
        byRole[roleName] = (byRole[roleName] || 0) + 1;

        const exp = user.experienceLevel || 'unknown';
        byExperience[exp] = (byExperience[exp] || 0) + 1;

        const pref = user.defaultShiftPreference || 'none';
        byShiftPreference[pref] = (byShiftPreference[pref] || 0) + 1;
      });

      // Process roster analytics
      const byStatus: Record<string, number> = {};
      const byShift: Record<string, number> = {};
      const trendsMap: Record<string, number> = {};
      const coverageTrendsMap: Record<string, { total: number; sum: number }> = {};

      rosters.forEach((roster: any) => {
        const status = roster.status || 'draft';
        byStatus[status] = (byStatus[status] || 0) + 1;

        const shiftName = roster.shift?.name || 
                         shiftsMap.get(roster.shiftId) || 
                         roster.shiftType || 
                         roster.shift_type || 
                         'Unknown Shift';
        byShift[shiftName] = (byShift[shiftName] || 0) + 1;

        const rosterDate = roster.date || roster.createdAt;
        if (rosterDate) {
          try {
            const date = new Date(rosterDate);
            const dateStr = format(date, 'yyyy-MM-dd');
            trendsMap[dateStr] = (trendsMap[dateStr] || 0) + 1;

            if (roster.coverage?.coveragePercentage !== undefined) {
              if (!coverageTrendsMap[dateStr]) {
                coverageTrendsMap[dateStr] = { total: 0, sum: 0 };
              }
              coverageTrendsMap[dateStr].total++;
              coverageTrendsMap[dateStr].sum += roster.coverage.coveragePercentage;
            }
          } catch (e) {
            // Skip invalid dates
          }
        }
      });

      const trends = Object.entries(trendsMap)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));

      const coverageTrends = Object.entries(coverageTrendsMap)
        .map(([date, data]) => ({ 
          date, 
          coverage: data.total > 0 ? data.sum / data.total : 0 
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Process coverage analytics
      const coverageValues: number[] = [];
      const coverageByShift: Record<string, number[]> = {};

      rosters.forEach((roster: any) => {
        if (roster.coverage?.coveragePercentage !== undefined) {
          coverageValues.push(roster.coverage.coveragePercentage);
          const shiftName = roster.shift?.name || 
                           shiftsMap.get(roster.shiftId) || 
                           (roster as any).shiftType || 
                           (roster as any).shift_type || 
                           'Unknown Shift';
          if (!coverageByShift[shiftName]) {
            coverageByShift[shiftName] = [];
          }
          coverageByShift[shiftName].push(roster.coverage.coveragePercentage);
        }
      });

      const averageCoverage = coverageValues.length > 0
        ? coverageValues.reduce((a, b) => a + b, 0) / coverageValues.length
        : 0;

      const minCoverage = coverageValues.length > 0 ? Math.min(...coverageValues) : 0;
      const maxCoverage = coverageValues.length > 0 ? Math.max(...coverageValues) : 0;

      const coverageByShiftAvg: Record<string, number> = {};
      Object.entries(coverageByShift).forEach(([shift, values]) => {
        coverageByShiftAvg[shift] = values.reduce((a, b) => a + b, 0) / values.length;
      });

      // Process activity analytics
      const byAction: Record<string, number> = {};
      const byEntity: Record<string, number> = {};
      const activityTrendsMap: Record<string, number> = {};

      logs.forEach((log: any) => {
        const action = log.action || 'UNKNOWN';
        byAction[action] = (byAction[action] || 0) + 1;

        const entity = log.entity_type || 'unknown';
        byEntity[entity] = (byEntity[entity] || 0) + 1;

        if (log.timestamp) {
          try {
            const logDate = typeof log.timestamp === 'string' ? parseISO(log.timestamp) : new Date(log.timestamp);
            const dateStr = format(logDate, 'yyyy-MM-dd');
            activityTrendsMap[dateStr] = (activityTrendsMap[dateStr] || 0) + 1;
          } catch (e) {
            // Skip invalid dates
          }
        }
      });

      const activityTrends = Object.entries(activityTrendsMap)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Calculate extra work analytics (staff assigned on their weekoff day)
      const extraWorkMap = new Map<string, { userName: string; occurrences: number }>();
      let totalExtraWorkOccurrences = 0;

      rosters.forEach((roster: any) => {
        if (!roster.date || !roster.slots) return;
        
        try {
          const rosterDate = new Date(roster.date);
          const dayOfWeek = getDay(rosterDate); // 0 = Sunday, 6 = Saturday
          
          roster.slots.forEach((slot: any) => {
            if (!slot.userId || !slot.user) return;
            
            const user = slot.user;
            const userWeekOffDays = user.weekOffDays || [];
            
            // Check if this user has a weekoff on this day
            if (userWeekOffDays.includes(dayOfWeek)) {
              totalExtraWorkOccurrences++;
              
              if (!extraWorkMap.has(user.id)) {
                extraWorkMap.set(user.id, {
                  userName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.employeeId || 'Unknown',
                  occurrences: 0
                });
              }
              
              const staffData = extraWorkMap.get(user.id)!;
              staffData.occurrences++;
            }
          });
        } catch (e) {
          // Skip invalid dates
        }
      });

      const extraWorkByStaff = Array.from(extraWorkMap.entries())
        .map(([userId, data]) => ({
          userId,
          userName: data.userName,
          occurrences: data.occurrences
        }))
        .sort((a, b) => b.occurrences - a.occurrences);

      // Calculate inactive staff (active but not assigned to any roster recently)
      const userLastAssignmentMap = new Map<string, Date>();
      const allUserIds = new Set(users.map((u: any) => u.id));

      // Find last assignment date for each user from all rosters (not just date range)
      allRosters.forEach((roster: any) => {
        if (!roster.slots) return;
        roster.slots.forEach((slot: any) => {
          if (slot.userId && allUserIds.has(slot.userId)) {
            try {
              const rosterDate = new Date(roster.date || roster.createdAt);
              const currentLastDate = userLastAssignmentMap.get(slot.userId);
              if (!currentLastDate || rosterDate > currentLastDate) {
                userLastAssignmentMap.set(slot.userId, rosterDate);
              }
            } catch (e) {
              // Skip invalid dates
            }
          }
        });
      });

      // Calculate days since last assignment for each user
      const today = new Date();
      const inactiveStaffList: Array<{ userId: string; userName: string; daysSinceLastAssignment: number; autoDeactivated: boolean }> = [];
      
      // Only show active staff who haven't been assigned recently, or recently auto-deactivated staff
      users.forEach((user: any) => {
        // Skip deleted users
        if (user.deletedAt) return;

        const lastAssignment = userLastAssignmentMap.get(user.id);
        let daysSinceLastAssignment: number;
        
        if (!lastAssignment) {
          // User never assigned - use created date
          try {
            const createdDate = user.createdAt ? new Date(user.createdAt) : new Date(0);
            daysSinceLastAssignment = Math.floor((today.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
          } catch {
            daysSinceLastAssignment = 999;
          }
        } else {
          daysSinceLastAssignment = Math.floor((today.getTime() - lastAssignment.getTime()) / (1000 * 60 * 60 * 24));
        }

        // Only show active staff who haven't been assigned to rosters
        // Also show recently auto-deactivated staff (inactive but eligible for auto-deactivation)
        const isEligible = daysSinceLastAssignment > 30;
        
        // Show: (1) Active staff not in rosters, or (2) Recently auto-deactivated staff (to show they were deactivated)
        const shouldShow = (user.isActive && isEligible) || 
                          (!user.isActive && isEligible); // Show all inactive eligible staff (likely auto-deactivated)

        if (!shouldShow) return;

        const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.employeeId || 'Unknown';
        const autoDeactivated = !user.isActive && isEligible;
        
        inactiveStaffList.push({
          userId: user.id,
          userName,
          daysSinceLastAssignment,
          autoDeactivated
        });
      });

      // Sort by days since last assignment (most inactive first)
      inactiveStaffList.sort((a, b) => b.daysSinceLastAssignment - a.daysSinceLastAssignment);

      setData({
        staff: {
          total: users.length,
          active: users.filter((u: any) => u.isActive && !u.deletedAt).length,
          inactive: users.filter((u: any) => !u.isActive || u.deletedAt).length,
          byRole,
          byExperience,
          byShiftPreference
        },
        rosters: {
          total: rosters.length,
          byStatus,
          byShift,
          published: byStatus.published || 0,
          draft: byStatus.draft || 0,
          archived: byStatus.archived || 0,
          trends,
          coverageTrends
        },
        coverage: {
          average: averageCoverage,
          min: minCoverage,
          max: maxCoverage,
          byShift: coverageByShiftAvg
        },
        activity: {
          totalActions: logs.length,
          byAction,
          byEntity,
          trends: activityTrends
        },
        extraWork: {
          totalOccurrences: totalExtraWorkOccurrences,
          uniqueStaffCount: extraWorkMap.size,
          byStaff: extraWorkByStaff
        },
        inactiveStaff: {
          count: inactiveStaffList.length,
          byStaff: inactiveStaffList
        }
      });
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAutoDeactivate = () => {
    if (!data) return;
    setConfirmModal({ isOpen: true });
  };

  const confirmAutoDeactivate = async () => {
    if (!data) return;

    setAutoDeactivating(true);
    try {
      // Only include active staff (not already deactivated)
      const eligibleUserIds = data.inactiveStaff.byStaff
        .filter(s => s.daysSinceLastAssignment > 30 && !s.autoDeactivated)
        .map(s => s.userId);

      if (eligibleUserIds.length === 0) {
        setAlert({ isOpen: true, message: 'No staff members are eligible for auto-deactivation.', type: 'info' });
        setConfirmModal({ isOpen: false });
        setAutoDeactivating(false);
        return;
      }

      const response = await authenticatedFetch('/api/users/auto-deactivate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userIds: eligibleUserIds }),
      });

      const result = await response.json();
      if (result.success) {
        setAlert({ isOpen: true, message: `Successfully auto-deactivated ${result.data.deactivatedCount} staff member(s).`, type: 'success' });
        setConfirmModal({ isOpen: false });
        // Refresh analytics data
        fetchAnalytics();
      } else {
        setAlert({ isOpen: true, message: `Failed to auto-deactivate staff: ${result.error?.message || 'Unknown error'}`, type: 'error' });
        setConfirmModal({ isOpen: false });
      }
    } catch (error: any) {
      console.error('Auto-deactivation error:', error);
      setAlert({ isOpen: true, message: `Failed to auto-deactivate staff: ${error.message || 'Unknown error'}`, type: 'error' });
      setConfirmModal({ isOpen: false });
    } finally {
      setAutoDeactivating(false);
    }
  };

  const exportToCSV = () => {
    if (!data) return;

    const rows: string[][] = [
      ['Analytics Report', format(new Date(), 'yyyy-MM-dd HH:mm:ss')],
      ['Time Period', timePeriod === 'custom' ? `${customStartDate} to ${customEndDate}` : timePeriod],
      [],
      ['Staff Analytics'],
      ['Total Staff', data.staff.total.toString()],
      ['Active Staff', data.staff.active.toString()],
      ['Inactive Staff', data.staff.inactive.toString()],
      [],
      ['Roster Analytics'],
      ['Total Rosters', data.rosters.total.toString()],
      ['Published', data.rosters.published.toString()],
      ['Draft', data.rosters.draft.toString()],
      ['Archived', data.rosters.archived.toString()],
      [],
      ['Coverage Analytics'],
      ['Average Coverage', `${data.coverage.average.toFixed(1)}%`],
      ['Min Coverage', `${data.coverage.min.toFixed(1)}%`],
      ['Max Coverage', `${data.coverage.max.toFixed(1)}%`],
      [],
      ['Activity Analytics'],
      ['Total Actions', data.activity.totalActions.toString()],
      [],
      ['Extra Work Analytics'],
      ['Total Occurrences', data.extraWork.totalOccurrences.toString()],
      ['Unique Staff Affected', data.extraWork.uniqueStaffCount.toString()],
      [],
      ['Extra Work by Staff'],
      ['Staff Name', 'Occurrences'],
      ...data.extraWork.byStaff.map(staff => [staff.userName, staff.occurrences.toString()]),
    ];

    const csvContent = rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const BarChart = ({ data, maxValue, color = 'bg-blue-500', showPercentage = false }: { 
    data: Array<{ label: string; value: number }>, 
    maxValue: number, 
    color?: string,
    showPercentage?: boolean
  }) => {
    const total = data.reduce((sum, item) => sum + item.value, 0);
    const safeMaxValue = Math.max(maxValue, 1); // Prevent division by zero
    return (
      <div className="space-y-3">
        {data.map((item, idx) => {
          const percentage = total > 0 ? (item.value / total) * 100 : 0;
          const barWidth = Math.min((item.value / safeMaxValue) * 100, 100); // Cap at 100%
          const exceedsMax = item.value > safeMaxValue;
          
          return (
            <div key={idx}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-700">{item.label}</span>
                <div className="flex items-center gap-2">
                  {showPercentage && <span className="text-xs text-gray-500">{percentage.toFixed(1)}%</span>}
                  <span className={`text-sm font-semibold ${exceedsMax ? 'text-red-600' : 'text-gray-900'}`}>
                    {item.value}
                    {exceedsMax && <span className="text-xs text-red-500 ml-1">⚠</span>}
                  </span>
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5 relative overflow-hidden">
                <div
                  className={`${exceedsMax ? 'bg-red-500' : color} h-2.5 rounded-full transition-all`}
                  style={{ width: `${barWidth}%` }}
                />
                {exceedsMax && (
                  <div className="absolute right-0 top-0 w-1 h-2.5 bg-red-600" title="Value exceeds chart scale" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const PieChart = ({ data, colors, colorMap }: { 
    data: Array<{ label: string; value: number }>, 
    colors?: string[],
    colorMap?: Record<string, string>
  }) => {
    const total = data.reduce((sum, item) => sum + item.value, 0);
    if (total === 0) return <p className="text-gray-500 text-sm">No data</p>;

    // Use colorMap if provided, otherwise fall back to colors array
    const getColor = (label: string, index: number) => {
      if (colorMap && colorMap[label]) return colorMap[label];
      if (colors) return colors[index % colors.length];
      return '#6b7280'; // Default gray
    };

    let currentAngle = 0;
    const segments = data.map((item, idx) => {
      const percentage = (item.value / total) * 100;
      const angle = (percentage / 100) * 360;
      const startAngle = currentAngle;
      currentAngle += angle;
      return { ...item, percentage, startAngle, angle, color: getColor(item.label, idx) };
    });

    return (
      <div className="flex items-center gap-6">
        <div className="relative w-32 h-32">
          <svg viewBox="0 0 100 100" className="transform -rotate-90">
            {segments.map((segment, idx) => {
              const largeArcFlag = segment.angle > 180 ? 1 : 0;
              const x1 = 50 + 50 * Math.cos((segment.startAngle * Math.PI) / 180);
              const y1 = 50 + 50 * Math.sin((segment.startAngle * Math.PI) / 180);
              const x2 = 50 + 50 * Math.cos(((segment.startAngle + segment.angle) * Math.PI) / 180);
              const y2 = 50 + 50 * Math.sin(((segment.startAngle + segment.angle) * Math.PI) / 180);
              
              return (
                <path
                  key={idx}
                  d={`M 50 50 L ${x1} ${y1} A 50 50 0 ${largeArcFlag} 1 ${x2} ${y2} Z`}
                  fill={segment.color}
                  stroke="white"
                  strokeWidth="0.5"
                />
              );
            })}
          </svg>
        </div>
        <div className="flex-1 space-y-2">
          {segments.map((segment, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded"
                style={{ backgroundColor: segment.color }}
              />
              <span className="text-sm text-gray-700">{segment.label}</span>
              <span className="text-sm text-gray-500 ml-auto">{segment.value} ({segment.percentage.toFixed(1)}%)</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const LineChart = ({ data, label, yLabel = 'Count' }: { 
    data: Array<{ date: string; count?: number; coverage?: number }>, 
    label: string,
    yLabel?: string
  }) => {
    if (data.length === 0) return <p className="text-gray-500 text-sm">No data available</p>;
    
    const values = data.map(d => d.count ?? d.coverage ?? 0);
    const maxValue = Math.max(...values, 1);
    const minDate = data[0]?.date || '';
    const maxDate = data[data.length - 1]?.date || '';

    const formatDate = (dateStr: string) => {
      try {
        return format(new Date(dateStr), 'MMM d');
      } catch {
        return dateStr;
      }
    };

    return (
      <div className="relative h-64">
        <svg viewBox="0 0 400 200" className="w-full h-full">
          {data.length > 1 && (
            <polyline
              fill="none"
              stroke="#3b82f6"
              strokeWidth="2"
              points={data.map((d, idx) => {
                const value = d.count ?? d.coverage ?? 0;
                const x = (idx / (data.length - 1 || 1)) * 380 + 10;
                const y = 180 - (value / maxValue) * 160;
                return `${x},${y}`;
              }).join(' ')}
            />
          )}
          {data.map((d, idx) => {
            const value = d.count ?? d.coverage ?? 0;
            const x = data.length > 1 ? (idx / (data.length - 1)) * 380 + 10 : 200;
            const y = 180 - (value / maxValue) * 160;
            return (
              <circle
                key={idx}
                cx={x}
                cy={y}
                r="3"
                fill="#3b82f6"
              />
            );
          })}
        </svg>
        <div className="absolute bottom-0 left-0 right-0 flex justify-between text-xs text-gray-500 px-2">
          <span>{formatDate(minDate)}</span>
          <span>{formatDate(maxDate)}</span>
        </div>
        <div className="absolute top-0 right-0 text-xs text-gray-500 px-2 bg-white/80 rounded">
          Max: {maxValue.toFixed(1)}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center py-12">
          <div className="loader-spinner loader-spinner-lg"></div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8">
        <div className="text-center py-12">
          <p className="text-gray-500">Failed to load analytics data</p>
        </div>
      </div>
    );
  }

  const roleData = Object.entries(data.staff.byRole)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  const experienceData = Object.entries(data.staff.byExperience)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  const shiftPreferenceData = Object.entries(data.staff.byShiftPreference)
    .map(([label, value]) => ({ 
      label: label === 'none' ? 'No Preferences' : label, 
      value 
    }))
    .sort((a, b) => {
      // Sort "No Preferences" to the end
      if (a.label === 'No Preferences') return 1;
      if (b.label === 'No Preferences') return -1;
      return a.label.localeCompare(b.label);
    });

  const statusData = Object.entries(data.rosters.byStatus)
    .map(([label, value]) => ({ label, value }));

  const shiftData = Object.entries(data.rosters.byShift)
    .map(([label, value]) => ({ label, value }));

  const actionData = Object.entries(data.activity.byAction)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const entityData = Object.entries(data.activity.byEntity)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  const activeRate = data.staff.total > 0 ? (data.staff.active / data.staff.total) * 100 : 0;
  const publishRate = data.rosters.total > 0 ? (data.rosters.published / data.rosters.total) * 100 : 0;

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header with Filters */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-1">Analytics Dashboard</h1>
              <p className="text-sm text-gray-500">Comprehensive insights into your staff roster system</p>
            </div>
            <button
              onClick={exportToCSV}
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium shadow-sm"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm p-4 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <label className="text-sm font-medium text-gray-700">Time Period:</label>
              <select
                value={timePeriod}
                onChange={(e) => setTimePeriod(e.target.value as TimePeriod)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900"
              >
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
                <option value="90d">Last 90 Days</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>

            {timePeriod === 'custom' && (
              <>
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700">From:</label>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700">To:</label>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900"
                  />
                </div>
              </>
            )}

            <div className="flex items-center gap-2 ml-auto">
              <label className="text-sm font-medium text-gray-700">Category:</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value as any)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900"
              >
                <option value="all">All</option>
                <option value="staff">Staff</option>
                <option value="rosters">Rosters</option>
                <option value="coverage">Coverage</option>
                <option value="activity">Activity</option>
              </select>
            </div>
          </div>
        </div>

        {/* Key Insights */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-gray-200/60 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-gray-500 font-medium">Total Staff</p>
              <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-slate-600" />
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900 mb-1">{data.staff.total}</p>
            <p className="text-xs text-gray-500">
              {data.staff.active} active ({activeRate.toFixed(1)}%)
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200/60 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-gray-500 font-medium">Total Rosters</p>
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Calendar className="w-5 h-5 text-blue-600" />
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900 mb-1">{data.rosters.total}</p>
            <p className="text-xs text-gray-500">
              {data.rosters.published} published ({publishRate.toFixed(1)}%)
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200/60 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-gray-500 font-medium">Avg Coverage</p>
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-green-600" />
              </div>
            </div>
            <p className="text-3xl font-bold text-slate-700 mb-1">{data.coverage.average.toFixed(1)}%</p>
            <p className="text-xs text-gray-500">
              Range: {data.coverage.min.toFixed(1)}% - {data.coverage.max.toFixed(1)}%
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200/60 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-gray-500 font-medium">Total Actions</p>
              <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                <Zap className="w-5 h-5 text-amber-600" />
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900 mb-1">{data.activity.totalActions}</p>
            <p className="text-xs text-gray-500">In selected period</p>
          </div>
          <div className="bg-white rounded-xl border border-amber-200/60 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-gray-500 font-medium">Extra Work</p>
              <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
            </div>
            <p className="text-3xl font-bold text-amber-700 mb-1">{data.extraWork.totalOccurrences}</p>
            <p className="text-xs text-gray-500">
              {data.extraWork.uniqueStaffCount} staff affected
            </p>
          </div>
          <div className="bg-white rounded-xl border border-red-200/60 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-gray-500 font-medium">Inactive Staff</p>
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                <UserX className="w-5 h-5 text-red-600" />
              </div>
            </div>
            <p className="text-3xl font-bold text-red-700 mb-1">{data.inactiveStaff.count}</p>
            <p className="text-xs text-gray-500">
              Not in rosters
            </p>
          </div>
        </div>

        {/* Staff Analytics */}
        {(selectedCategory === 'all' || selectedCategory === 'staff') && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div className="bg-white rounded-xl border border-gray-200/60 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Staff by Role</h2>
              {roleData.length > 0 ? (
                <BarChart
                  data={roleData}
                  maxValue={Math.max(...roleData.map(d => d.value), 1)}
                  color="bg-blue-500"
                  showPercentage
                />
              ) : (
                <p className="text-gray-500 text-sm">No data available</p>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200/60 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Staff by Experience Level</h2>
              {experienceData.length > 0 ? (
                <PieChart
                  data={experienceData}
                  colors={['#3b82f6', '#10b981', '#f59e0b', '#ef4444']}
                />
              ) : (
                <p className="text-gray-500 text-sm">No data available</p>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200/60 p-6 shadow-sm lg:col-span-2">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Shift Preferences</h2>
              {shiftPreferenceData.length > 0 ? (
                <PieChart
                  data={shiftPreferenceData}
                  colorMap={{
                    'No Preferences': '#9ca3af', // Gray-400
                    'Morning Shift': '#f59e0b', // Amber-500
                    'Evening Shift': '#6366f1', // Indigo-500
                    'Night Shift': '#4b5563' // Gray-600
                  }}
                />
              ) : (
                <p className="text-gray-500 text-sm">No data available</p>
              )}
            </div>
          </div>
        )}

        {/* Roster Analytics */}
        {(selectedCategory === 'all' || selectedCategory === 'rosters') && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div className="bg-white rounded-xl border border-gray-200/60 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Roster Status Distribution</h2>
              {statusData.length > 0 ? (
                <PieChart
                  data={statusData}
                  colors={['#f59e0b', '#10b981', '#6b7280']}
                />
              ) : (
                <p className="text-gray-500 text-sm">No data available</p>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200/60 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Rosters by Shift</h2>
              {shiftData.length > 0 ? (
                <BarChart
                  data={shiftData}
                  maxValue={Math.max(...shiftData.map((d: any) => d.value), 1)}
                  color="bg-indigo-500"
                  showPercentage
                />
              ) : (
                <p className="text-gray-500 text-sm">No data available</p>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200/60 p-6 shadow-sm lg:col-span-2">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Roster Creation Trends</h2>
              <LineChart data={data.rosters.trends.map(d => ({ date: d.date, count: d.count }))} label="Rosters Created" />
            </div>
          </div>
        )}

        {/* Coverage Analytics */}
        {(selectedCategory === 'all' || selectedCategory === 'coverage') && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {Object.keys(data.coverage.byShift).length > 0 && (() => {
              const coverageEntries = Object.entries(data.coverage.byShift);
              const maxCoverage = Math.max(...coverageEntries.map(([_, val]) => val), 100);
              const normalizedMax = Math.max(maxCoverage, 100); // At least 100% for proper scaling
              
              return (
                <div className="bg-white rounded-xl border border-gray-200/60 p-6 shadow-sm">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Average Coverage by Shift Type</h2>
                  <div className="space-y-4">
                    {coverageEntries.map(([shift, coverage]) => {
                      const barWidth = Math.min((coverage / normalizedMax) * 100, 100);
                      const exceedsMax = coverage > normalizedMax;
                      
                      return (
                        <div key={shift} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                          <span className="text-sm font-medium text-gray-700 capitalize">{shift}</span>
                          <div className="flex items-center gap-3">
                            <div className="w-32 bg-gray-200 rounded-full h-2 relative overflow-hidden">
                              <div
                                className={`h-2 rounded-full ${exceedsMax ? 'bg-red-500' : 'bg-blue-600'}`}
                                style={{ width: `${barWidth}%` }}
                              />
                              {exceedsMax && (
                                <div className="absolute right-0 top-0 w-1 h-2 bg-red-600" title="Value exceeds chart scale" />
                              )}
                            </div>
                            <span className={`text-lg font-bold w-20 text-right ${exceedsMax ? 'text-red-600' : 'text-blue-600'}`}>
                              {coverage.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    {maxCoverage > 100 && (
                      <p className="text-xs text-gray-500 mt-2">
                        * Bars capped at 100% width. Values may exceed 100% coverage.
                      </p>
                    )}
                  </div>
                </div>
              );
            })()}

            <div className="bg-white rounded-xl border border-gray-200/60 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Coverage Trends</h2>
              <LineChart data={data.rosters.coverageTrends.map(d => ({ date: d.date, coverage: d.coverage }))} label="Coverage %" yLabel="Coverage %" />
            </div>
          </div>
        )}

        {/* Extra Work Analytics */}
        {(selectedCategory === 'all' || selectedCategory === 'activity') && data.extraWork.totalOccurrences > 0 && (
          <div className="mb-8">
            <div className="bg-white rounded-xl border border-amber-200/60 p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <h2 className="text-lg font-semibold text-gray-900">Extra Work Analysis</h2>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                Staff assigned to tasks on their preferred weekoff days
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <p className="text-sm text-amber-700 font-medium mb-1">Total Occurrences</p>
                  <p className="text-2xl font-bold text-amber-900">{data.extraWork.totalOccurrences}</p>
                  <p className="text-xs text-amber-600 mt-1">Times staff worked on weekoff</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <p className="text-sm text-amber-700 font-medium mb-1">Affected Staff</p>
                  <p className="text-2xl font-bold text-amber-900">{data.extraWork.uniqueStaffCount}</p>
                  <p className="text-xs text-amber-600 mt-1">Unique staff members</p>
                </div>
              </div>

              {data.extraWork.byStaff.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Breakdown by Staff</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Staff Name</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Occurrences</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Percentage</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {data.extraWork.byStaff.map((staff, idx) => {
                          const percentage = data.extraWork.totalOccurrences > 0
                            ? (staff.occurrences / data.extraWork.totalOccurrences) * 100
                            : 0;
                          return (
                            <tr key={staff.userId} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm text-gray-900">{staff.userName}</td>
                              <td className="px-4 py-3 text-sm font-semibold text-amber-700">{staff.occurrences}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 bg-gray-200 rounded-full h-2">
                                    <div
                                      className="bg-amber-500 h-2 rounded-full"
                                      style={{ width: `${percentage}%` }}
                                    />
                                  </div>
                                  <span className="text-xs text-gray-600 w-12 text-right">
                                    {percentage.toFixed(1)}%
                                  </span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Inactive Staff Analytics */}
        {(selectedCategory === 'all' || selectedCategory === 'staff') && data.inactiveStaff.count > 0 && (
          <div className="bg-white rounded-xl border border-red-200/60 shadow-sm p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Inactive Staff (Not in Rosters)</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Active staff members who haven't been assigned to any roster
                </p>
              </div>
              <button
                onClick={handleAutoDeactivate}
                disabled={autoDeactivating}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {autoDeactivating ? 'Deactivating...' : 'Auto-Deactivate (>30 days)'}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                <p className="text-xs text-red-700 font-medium mb-1">Total Inactive Staff</p>
                <p className="text-2xl font-bold text-red-900">{data.inactiveStaff.count}</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
                <p className="text-xs text-amber-700 font-medium mb-1">Eligible for Auto-Deactivation</p>
                <p className="text-2xl font-bold text-amber-900">
                  {data.inactiveStaff.byStaff.filter(s => s.daysSinceLastAssignment > 30).length}
                </p>
                <p className="text-xs text-amber-600 mt-1">(Not in rosters for 30+ days)</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <p className="text-xs text-gray-700 font-medium mb-1">Auto-Deactivated</p>
                <p className="text-2xl font-bold text-gray-900">
                  {data.inactiveStaff.byStaff.filter(s => s.autoDeactivated).length}
                </p>
              </div>
            </div>

            {data.inactiveStaff.byStaff.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Staff Not Assigned to Rosters</h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Staff Name</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Days Since Last Assignment</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Status</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {data.inactiveStaff.byStaff.map((staff) => {
                        const isEligible = staff.daysSinceLastAssignment > 30;
                        return (
                          <tr key={staff.userId} className={`hover:bg-gray-50 ${staff.autoDeactivated ? 'bg-red-50' : ''}`}>
                            <td className="px-4 py-3 text-sm text-gray-900">{staff.userName}</td>
                            <td className="px-4 py-3">
                              <span className={`text-sm font-semibold ${isEligible ? 'text-red-700' : 'text-amber-700'}`}>
                                {staff.daysSinceLastAssignment} days
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {staff.autoDeactivated ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200">
                                  Auto-Deactivated
                                </span>
                              ) : isEligible ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
                                  Eligible
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200">
                                  Active
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Activity Analytics */}
        {(selectedCategory === 'all' || selectedCategory === 'activity') && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div className="bg-white rounded-xl border border-gray-200/60 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Actions</h2>
              {actionData.length > 0 ? (
                <BarChart
                  data={actionData}
                  maxValue={Math.max(...actionData.map(d => d.value), 1)}
                  color="bg-green-500"
                  showPercentage
                />
              ) : (
                <p className="text-gray-500 text-sm">No data available</p>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200/60 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Activity by Entity Type</h2>
              {entityData.length > 0 ? (
                <BarChart
                  data={entityData}
                  maxValue={Math.max(...entityData.map(d => d.value), 1)}
                  color="bg-purple-500"
                  showPercentage
                />
              ) : (
                <p className="text-gray-500 text-sm">No data available</p>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200/60 p-6 shadow-sm lg:col-span-2">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Activity Trends</h2>
              <LineChart data={data.activity.trends.map(d => ({ date: d.date, count: d.count }))} label="Actions" />
            </div>
          </div>
        )}
      </div>

      {/* Alert Modal */}
      <Modal
        isOpen={alert.isOpen}
        onClose={() => setAlert({ isOpen: false, message: '' })}
        message={alert.message}
        type={alert.type || 'info'}
        title={alert.type === 'success' ? 'Success' : alert.type === 'error' ? 'Error' : 'Information'}
      />

      {/* Confirm Auto-Deactivate Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ isOpen: false })}
        onConfirm={confirmAutoDeactivate}
        title="Auto-Deactivate Staff"
        message="Are you sure you want to auto-deactivate staff who haven't been assigned to any roster for 30+ days? This action cannot be undone."
        type="warning"
        confirmText="Yes, Deactivate"
        cancelText="Cancel"
        confirmButtonStyle="danger"
        isLoading={autoDeactivating}
      />
    </div>
  );
}
