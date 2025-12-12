'use client';

import { useEffect, useState } from 'react';
import { format, subDays, parseISO, startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import { Users, Calendar, BarChart3, Zap, Download, Filter } from 'lucide-react';

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
    byShiftType: Record<string, number>;
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
}

type TimePeriod = '7d' | '30d' | '90d' | 'custom';

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('30d');
  const [customStartDate, setCustomStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [customEndDate, setCustomEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'staff' | 'rosters' | 'coverage' | 'activity'>('all');

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
      
      const [usersRes, rostersRes, logsRes] = await Promise.all([
        fetch('/api/users?page=0'),
        fetch('/api/rosters'),
        fetch('/api/activity-logs?page=1')
      ]);

      const usersData = await usersRes.json();
      const rostersData = await rostersRes.json();
      const logsData = await logsRes.json();

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
      const byShiftType: Record<string, number> = {};
      const trendsMap: Record<string, number> = {};
      const coverageTrendsMap: Record<string, { total: number; sum: number }> = {};

      rosters.forEach((roster: any) => {
        const status = roster.status || 'draft';
        byStatus[status] = (byStatus[status] || 0) + 1;

        const shiftType = roster.shiftType || roster.shift_type || 'unknown';
        byShiftType[shiftType] = (byShiftType[shiftType] || 0) + 1;

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
          const shiftType = roster.shiftType || roster.shift_type || 'unknown';
          if (!coverageByShift[shiftType]) {
            coverageByShift[shiftType] = [];
          }
          coverageByShift[shiftType].push(roster.coverage.coveragePercentage);
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
          byShiftType,
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
        }
      });
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    } finally {
      setLoading(false);
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
    return (
      <div className="space-y-3">
        {data.map((item, idx) => {
          const percentage = total > 0 ? (item.value / total) * 100 : 0;
          return (
            <div key={idx}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-700">{item.label}</span>
                <div className="flex items-center gap-2">
                  {showPercentage && <span className="text-xs text-gray-500">{percentage.toFixed(1)}%</span>}
                  <span className="text-sm font-semibold text-gray-900">{item.value}</span>
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className={`${color} h-2.5 rounded-full transition-all`}
                  style={{ width: `${(item.value / maxValue) * 100}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const PieChart = ({ data, colors }: { data: Array<{ label: string; value: number }>, colors: string[] }) => {
    const total = data.reduce((sum, item) => sum + item.value, 0);
    if (total === 0) return <p className="text-gray-500 text-sm">No data</p>;

    let currentAngle = 0;
    const segments = data.map((item, idx) => {
      const percentage = (item.value / total) * 100;
      const angle = (percentage / 100) * 360;
      const startAngle = currentAngle;
      currentAngle += angle;
      return { ...item, percentage, startAngle, angle };
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
                  fill={colors[idx % colors.length]}
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
                style={{ backgroundColor: colors[idx % colors.length] }}
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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading analytics...</p>
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
    .map(([label, value]) => ({ label, value }));

  const statusData = Object.entries(data.rosters.byStatus)
    .map(([label, value]) => ({ label, value }));

  const shiftTypeData = Object.entries(data.rosters.byShiftType)
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
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
                  colors={['#f59e0b', '#6366f1', '#6b7280']}
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
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Rosters by Shift Type</h2>
              {shiftTypeData.length > 0 ? (
                <BarChart
                  data={shiftTypeData}
                  maxValue={Math.max(...shiftTypeData.map(d => d.value), 1)}
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
            {Object.keys(data.coverage.byShift).length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200/60 p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Average Coverage by Shift Type</h2>
                <div className="space-y-4">
                  {Object.entries(data.coverage.byShift).map(([shift, coverage]) => (
                    <div key={shift} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <span className="text-sm font-medium text-gray-700 capitalize">{shift}</span>
                      <div className="flex items-center gap-3">
                        <div className="w-32 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full"
                            style={{ width: `${coverage}%` }}
                          />
                        </div>
                        <span className="text-lg font-bold text-blue-600 w-16 text-right">{coverage.toFixed(1)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white rounded-xl border border-gray-200/60 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Coverage Trends</h2>
              <LineChart data={data.rosters.coverageTrends.map(d => ({ date: d.date, coverage: d.coverage }))} label="Coverage %" yLabel="Coverage %" />
            </div>
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
    </div>
  );
}
