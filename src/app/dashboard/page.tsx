'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { format, isToday, isTomorrow, parseISO, startOfToday, addDays } from 'date-fns';
import { Users, CheckCircle2, FileText, Calendar, TrendingUp, AlertCircle, Plus, ArrowRight, BarChart3, Settings2, Activity } from 'lucide-react';
import { authenticatedFetch } from '@/lib/api-client';

interface RosterSummary {
  id: string;
  date: string;
  shiftType: string;
  status: string;
  staffCount: number;
  coverage: number;
  dateFormatted?: string;
}

export default function DashboardPage() {
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalRosters: 0,
    publishedRosters: 0,
    activeUsers: 0,
    draftRosters: 0,
    todayRosters: 0,
    upcomingRosters: 0
  });
  const [recentRosters, setRecentRosters] = useState<RosterSummary[]>([]);
  const [upcomingRosters, setUpcomingRosters] = useState<RosterSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [usersRes, rostersRes] = await Promise.all([
        authenticatedFetch('/api/users?page=0'),
        authenticatedFetch('/api/rosters')
      ]);
      
      if (!usersRes.ok) {
        console.error('Failed to fetch users:', usersRes.status, usersRes.statusText);
      }
      if (!rostersRes.ok) {
        console.error('Failed to fetch rosters:', rostersRes.status, rostersRes.statusText);
      }
      
      // Parallelize JSON parsing for better performance
      const [usersData, rostersData] = await Promise.all([
        usersRes.ok ? usersRes.json() : Promise.resolve({ success: false }),
        rostersRes.ok ? rostersRes.json() : Promise.resolve({ success: false })
      ]);
      
      if (usersData.success) {
        const users = usersData.data?.data || [];
        setStats(prev => ({
          ...prev,
          totalUsers: users.length,
          activeUsers: users.filter((u: any) => u.isActive && !u.deletedAt).length
        }));
      }
      
      if (rostersData.success) {
        const rosters = rostersData.data || [];
        const today = startOfToday().toISOString().split('T')[0];
        const next7DaysSet = new Set(Array.from({ length: 7 }, (_, i) => 
          format(addDays(new Date(), i), 'yyyy-MM-dd')
        ));

        // Single pass through rosters for better performance
        let todayCount = 0;
        let publishedCount = 0;
        let draftCount = 0;
        const upcomingList: RosterSummary[] = [];
        const allRecent: Array<{roster: any, timestamp: number}> = [];

        for (const r of rosters) {
          // Count stats
          if (r.status === 'published') publishedCount++;
          if (r.status === 'draft') draftCount++;
          if (r.date === today) todayCount++;

          // Build upcoming list (max 5) - pre-format data
          if (next7DaysSet.has(r.date) && r.date !== today && upcomingList.length < 5) {
            const shiftName = r.shift?.name || (r as any).shiftType || (r as any).shift_type || 'Unknown Shift';
            const dateStr = r.date || r.createdAt || '';
            let formattedDate = '';
            try {
              const date = parseISO(dateStr);
              formattedDate = format(date, 'EEEE, MMMM d');
            } catch {
              formattedDate = dateStr;
            }
            const slots = r.slots || [];
            upcomingList.push({
              id: r.id,
              date: dateStr,
              shiftType: shiftName,
              status: r.status || 'draft',
              staffCount: slots.filter((s: any) => s.userId).length,
              coverage: r.coverage?.coveragePercentage || 0,
              dateFormatted: formattedDate
            } as RosterSummary & { dateFormatted?: string });
          }

          // Collect all rosters with timestamp for sorting
          try {
            const dateStr = r.date || r.createdAt || '';
            const timestamp = dateStr ? new Date(dateStr).getTime() : 0;
            if (timestamp > 0) {
              allRecent.push({ roster: r, timestamp });
            }
          } catch {
            // Skip invalid dates
          }
        }

        // Sort by timestamp and take top 5, then format
        const recent = allRecent
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, 5)
          .map(({ roster: r }) => {
            const shiftName = r.shift?.name || (r as any).shiftType || (r as any).shift_type || 'Unknown Shift';
            const slots = r.slots || [];
            return {
              id: r.id,
              date: r.date || r.createdAt || '',
              shiftType: shiftName,
              status: r.status || 'draft',
              staffCount: slots.filter((s: any) => s.userId).length,
              coverage: r.coverage?.coveragePercentage || 0
            };
          });

        setUpcomingRosters(upcomingList);
        setRecentRosters(recent);
        
        setStats(prev => ({
          ...prev,
          totalRosters: rosters.length,
          publishedRosters: publishedCount,
          draftRosters: draftCount,
          todayRosters: todayCount,
          upcomingRosters: upcomingList.length
        }));
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      setError('Failed to load dashboard data. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      published: 'bg-green-100 text-green-700 border-green-200',
      draft: 'bg-yellow-100 text-yellow-700 border-yellow-200',
      archived: 'bg-gray-100 text-gray-700 border-gray-200'
    };
    return styles[status as keyof typeof styles] || styles.draft;
  };

  const getShiftBadge = (shift: string) => {
    return shift === 'morning' 
      ? 'bg-amber-100 text-amber-700 border-amber-200'
      : 'bg-indigo-100 text-indigo-700 border-indigo-200';
  };

  // Memoize today's date string to avoid recalculating on every render
  const todayDateStr = useMemo(() => format(new Date(), 'EEEE, MMMM d'), []);

  // Memoize today's rosters to avoid filtering on every render
  const todaysRosters = useMemo(() => {
    return recentRosters.filter(r => {
      try {
        return isToday(parseISO(r.date));
      } catch {
        return false;
      }
    });
  }, [recentRosters]);

  const formatRosterDate = (dateStr: string) => {
    try {
      const date = parseISO(dateStr);
      if (isToday(date)) return 'Today';
      if (isTomorrow(date)) return 'Tomorrow';
      return format(date, 'MMM d');
    } catch {
      return dateStr;
    }
  };

  const publishRate = useMemo(() => {
    return stats.totalRosters > 0 
      ? Math.round((stats.publishedRosters / stats.totalRosters) * 100) 
      : 0;
  }, [stats.totalRosters, stats.publishedRosters]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {todayDateStr}
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Overview of your staff roster operations
              </p>
            </div>
            <Link
              href="/dashboard/roster"
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Create Roster
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}
        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200/60 p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <p className="text-gray-500 text-sm font-medium">Total Staff</p>
              <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-slate-600" />
              </div>
            </div>
            {loading ? (
              <div className="h-8 w-20 loader-skeleton"></div>
            ) : (
              <>
                <p className="text-3xl font-bold text-gray-900 mb-1">{stats.totalUsers}</p>
                <p className="text-gray-500 text-xs">
                  {stats.activeUsers} active
                </p>
              </>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200/60 p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <p className="text-gray-500 text-sm font-medium">Published</p>
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
            </div>
            {loading ? (
              <div className="h-8 w-20 loader-skeleton"></div>
            ) : (
              <>
                <p className="text-3xl font-bold text-gray-900 mb-1">{stats.publishedRosters}</p>
                <p className="text-gray-500 text-xs">
                  {publishRate}% publish rate
                </p>
              </>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200/60 p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <p className="text-gray-500 text-sm font-medium">Drafts</p>
              <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                <FileText className="w-5 h-5 text-amber-600" />
              </div>
            </div>
            {loading ? (
              <div className="h-8 w-20 loader-skeleton"></div>
            ) : (
              <>
                <p className="text-3xl font-bold text-gray-900 mb-1">{stats.draftRosters}</p>
                <p className="text-gray-500 text-xs">
                  Needs attention
                </p>
              </>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200/60 p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <p className="text-gray-500 text-sm font-medium">Upcoming</p>
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Calendar className="w-5 h-5 text-blue-600" />
              </div>
            </div>
            {loading ? (
              <div className="h-8 w-20 loader-skeleton"></div>
            ) : (
              <>
                <p className="text-3xl font-bold text-gray-900 mb-1">{stats.upcomingRosters}</p>
                <p className="text-gray-500 text-xs">
                  Next 7 days
                </p>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Today's Schedule */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200/60 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Today's Schedule</h2>
                <Link 
                  href="/dashboard/rosters"
                  className="text-sm text-slate-600 hover:text-slate-900 font-medium flex items-center gap-1"
                >
                  View All
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              
              {loading ? (
                <div className="space-y-3">
                  {[1, 2].map(i => (
                    <div key={i} className="h-16 loader-skeleton rounded-lg"></div>
                  ))}
                </div>
              ) : todaysRosters.length > 0 ? (
                <div className="space-y-3">
                  {todaysRosters.map(roster => (
                      <Link
                        key={roster.id}
                        href={`/dashboard/roster?date=${roster.date}&shift=${roster.shiftType}`}
                        className="block p-4 border border-gray-200/60 rounded-lg hover:border-slate-300 hover:bg-slate-50/50 transition-all group"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${
                              roster.shiftType === 'morning' ? 'bg-amber-500' : 'bg-slate-600'
                            }`} />
                            <div>
                              <p className="font-medium text-gray-900 group-hover:text-slate-700">
                                {roster.shiftType}
                              </p>
                              <p className="text-sm text-gray-500">
                                {roster.staffCount} staff assigned
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-1 text-xs font-medium rounded border ${getStatusBadge(roster.status)}`}>
                              {roster.status}
                            </span>
                            {roster.coverage > 0 && (
                              <span className="text-sm font-semibold text-gray-700">
                                {Math.round(roster.coverage)}%
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>
                    ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500 text-sm mb-3">No rosters scheduled for today</p>
                  <Link
                    href="/dashboard/roster"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Create Today's Roster
                  </Link>
                </div>
              )}
            </div>

            {/* Upcoming Rosters */}
            {upcomingRosters.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200/60 p-6 mt-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">Upcoming Rosters</h2>
                  <Link 
                    href="/dashboard/rosters"
                    className="text-sm text-slate-600 hover:text-slate-900 font-medium flex items-center gap-1"
                  >
                    View All
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
                <div className="space-y-2">
                  {upcomingRosters.map(roster => (
                    <Link
                      key={roster.id}
                      href={`/dashboard/roster?date=${roster.date}&shift=${roster.shiftType}`}
                      className="flex items-center justify-between p-3 border border-gray-200/60 rounded-lg hover:border-slate-300 hover:bg-slate-50/50 transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-[75px] h-12 rounded-lg flex items-center justify-center text-sm font-semibold ${
                          roster.shiftType === 'morning' 
                            ? 'bg-amber-50 text-amber-700 border border-amber-200/60' 
                            : 'bg-[rgb(255,237,213)] text-slate-700 border border-slate-200/60'
                        }`}>
                          {formatRosterDate(roster.date)}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 group-hover:text-slate-700">
                            {roster.shiftType}
                          </p>
                          <p className="text-xs text-gray-500">
                            {(roster as any).dateFormatted || roster.date}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 text-xs font-medium rounded border ${getStatusBadge(roster.status)}`}>
                          {roster.status}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Sidebar */}
          <div className="space-y-6">
            {/* Quick Stats */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200/60 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Stats</h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Total Rosters</span>
                  <span className="text-lg font-bold text-gray-900">{stats.totalRosters}</span>
                </div>
                <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Published</span>
                  <span className="text-lg font-bold text-green-600">{stats.publishedRosters}</span>
                </div>
                <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Drafts</span>
                  <span className="text-lg font-bold text-amber-600">{stats.draftRosters}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Active Staff</span>
                  <span className="text-lg font-bold text-slate-700">{stats.activeUsers}</span>
                </div>
              </div>
            </div>

            {/* Action Items */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200/60 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Action Items</h2>
              <div className="space-y-3">
                {stats.draftRosters > 0 && (
                  <Link
                    href="/dashboard/rosters?status=draft"
                    className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200/60 rounded-lg hover:bg-amber-100/50 transition-colors group"
                  >
                    <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900 group-hover:text-amber-900">
                        {stats.draftRosters} draft roster{stats.draftRosters !== 1 ? 's' : ''} need attention
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Review and publish pending rosters</p>
                    </div>
                  </Link>
                )}
                {stats.todayRosters === 0 && (
                  <Link
                    href="/dashboard/roster"
                    className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200/60 rounded-lg hover:bg-blue-100/50 transition-colors group"
                  >
                    <Calendar className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900 group-hover:text-blue-900">
                        No roster for today
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Create today's roster</p>
                    </div>
                  </Link>
                )}
                {stats.upcomingRosters === 0 && (
                  <Link
                    href="/dashboard/roster"
                    className="flex items-start gap-3 p-3 bg-slate-50 border border-slate-200/60 rounded-lg hover:bg-slate-100/50 transition-colors group"
                  >
                    <FileText className="w-5 h-5 text-slate-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900 group-hover:text-slate-900">
                        Plan ahead
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Create rosters for upcoming days</p>
                    </div>
                  </Link>
                )}
                {stats.draftRosters === 0 && stats.todayRosters > 0 && (
                  <div className="flex items-start gap-3 p-3 bg-green-50 border border-green-200/60 rounded-lg">
                    <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        All caught up!
                      </p>
                      <p className="text-xs text-gray-500 mt-1">No pending actions</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Links */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200/60 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Links</h2>
              <div className="space-y-1">
                <Link
                  href="/dashboard/analytics"
                  className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 transition-colors group"
                >
                  <BarChart3 className="w-4 h-4 text-gray-500 group-hover:text-gray-700" />
                  <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">Analytics</span>
                  <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 ml-auto" />
                </Link>
                <Link
                  href="/dashboard/users"
                  className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 transition-colors group"
                >
                  <Users className="w-4 h-4 text-gray-500 group-hover:text-gray-700" />
                  <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">Manage Staff</span>
                  <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 ml-auto" />
                </Link>
                <Link
                  href="/dashboard/shift-preferences"
                  className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 transition-colors group"
                >
                  <Settings2 className="w-4 h-4 text-gray-500 group-hover:text-gray-700" />
                  <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">Shift Preferences</span>
                  <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 ml-auto" />
                </Link>
                <Link
                  href="/dashboard/activity-logs"
                  className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 transition-colors group"
                >
                  <Activity className="w-4 h-4 text-gray-500 group-hover:text-gray-700" />
                  <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">Activity Logs</span>
                  <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 ml-auto" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
