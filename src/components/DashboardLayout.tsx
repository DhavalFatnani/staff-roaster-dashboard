'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { User } from '@/types';
import { 
  LayoutDashboard, Calendar, FileText, Settings2, Users, Shield, 
  BarChart3, Activity, ChevronLeft, ChevronRight, User as UserIcon, 
  LogOut, Menu
} from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, group: 'main' },
    { name: 'Roster Builder', href: '/dashboard/roster', icon: Calendar, group: 'main' },
    { name: 'All Rosters', href: '/dashboard/rosters', icon: FileText, group: 'main' },
    { name: 'Shift Preferences', href: '/dashboard/shift-preferences', icon: Settings2, group: 'main' },
    { name: 'Users', href: '/dashboard/users', icon: Users, group: 'management' },
    { name: 'Roles', href: '/dashboard/roles', icon: Shield, group: 'management' },
    { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3, group: 'reports' },
    { name: 'Activity Logs', href: '/dashboard/activity-logs', icon: Activity, group: 'reports' },
  ];

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  async function fetchCurrentUser() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push('/login');
      return;
    }

    const { data } = await supabase
      .from('users')
      .select('*, roles(*)')
      .eq('id', session.user.id)
      .single();

    if (data) {
      setCurrentUser(data as any);
    }
    setLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  const mainNav = navigation.filter(n => n.group === 'main');
  const managementNav = navigation.filter(n => n.group === 'management');
  const reportsNav = navigation.filter(n => n.group === 'reports');

  const isActive = (href: string) => {
    if (!pathname) return false;
    if (href === '/dashboard') {
      return pathname === '/dashboard';
    }
    return pathname.startsWith(href);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-20'} bg-white border-r border-gray-200/60 transition-all duration-300 flex flex-col shadow-sm`}>
        {/* Logo/Header */}
        <div className="h-16 border-b border-gray-200/60 flex items-center justify-between px-4">
          {sidebarOpen ? (
            <Link href="/dashboard" className="text-base font-semibold text-gray-900 tracking-tight">
              Staff Roster
            </Link>
          ) : (
            <Link href="/dashboard" className="flex items-center justify-center w-8 h-8">
              <BarChart3 className="w-5 h-5 text-gray-700" />
            </Link>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
            aria-label="Toggle sidebar"
          >
            {sidebarOpen ? (
              <ChevronLeft className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4">
          {/* Main */}
          <div className="px-2 mb-6">
            {sidebarOpen && (
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-3">
                Main
              </p>
            )}
            {mainNav.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg mb-1 transition-all ${
                    isActive(item.href)
                      ? 'bg-slate-100 text-slate-900 font-medium'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${isActive(item.href) ? 'text-slate-700' : 'text-gray-500'}`} />
                  {sidebarOpen && <span className="text-sm">{item.name}</span>}
                </Link>
              );
            })}
          </div>

          {/* Management */}
          <div className="px-2 mb-6">
            {sidebarOpen && (
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-3">
                Management
              </p>
            )}
            {managementNav.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg mb-1 transition-all ${
                    isActive(item.href)
                      ? 'bg-slate-100 text-slate-900 font-medium'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${isActive(item.href) ? 'text-slate-700' : 'text-gray-500'}`} />
                  {sidebarOpen && <span className="text-sm">{item.name}</span>}
                </Link>
              );
            })}
          </div>

          {/* Reports */}
          <div className="px-2">
            {sidebarOpen && (
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-3">
                Reports
              </p>
            )}
            {reportsNav.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg mb-1 transition-all ${
                    isActive(item.href)
                      ? 'bg-slate-100 text-slate-900 font-medium'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${isActive(item.href) ? 'text-slate-700' : 'text-gray-500'}`} />
                  {sidebarOpen && <span className="text-sm">{item.name}</span>}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* User Profile - At Bottom */}
        {currentUser && (
          <div className="border-t border-gray-200/60 p-3">
            <div className="relative">
              <button 
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${
                  showProfileMenu 
                    ? 'bg-slate-100' 
                    : 'hover:bg-gray-50'
                }`}
              >
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-white font-medium text-xs flex-shrink-0 shadow-sm">
                  {(currentUser.firstName?.[0] || '').toUpperCase()}
                  {(currentUser.lastName?.[0] || '').toUpperCase()}
                </div>
                {sidebarOpen && (
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {currentUser.firstName || ''} {currentUser.lastName || ''}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {currentUser.role?.name || 'No Role'}
                    </p>
                  </div>
                )}
                {sidebarOpen && (
                  <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${showProfileMenu ? 'rotate-90' : ''}`} />
                )}
              </button>
              
              {/* Dropdown Menu */}
              {showProfileMenu && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setShowProfileMenu(false)}
                  />
                  <div className={`absolute ${sidebarOpen ? 'left-64' : 'left-20'} bottom-16 w-64 bg-white rounded-lg shadow-xl border border-gray-200/60 z-50`}>
                    <div className="p-4 border-b border-gray-200/60">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-white font-semibold shadow-sm">
                          {(currentUser.firstName?.[0] || '').toUpperCase()}
                          {(currentUser.lastName?.[0] || '').toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 truncate text-sm">
                            {currentUser.firstName || ''} {currentUser.lastName || ''}
                          </p>
                          <p className="text-xs text-gray-500 truncate">
                            {currentUser.employeeId || 'No ID'}
                          </p>
                          {currentUser.role && (
                            <p className="text-xs text-gray-600 mt-0.5">
                              {currentUser.role.name}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="p-2">
                      <Link
                        href="/dashboard/profile"
                        onClick={() => setShowProfileMenu(false)}
                        className="flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md transition-colors"
                      >
                        <UserIcon className="w-4 h-4 text-gray-500" />
                        <span>View Profile</span>
                      </Link>
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors mt-1"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Logout</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 overflow-auto bg-gray-50/50">{children}</main>
      </div>
    </div>
  );
}
