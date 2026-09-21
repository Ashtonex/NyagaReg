import React from 'react';
import { 
  LayoutDashboard, 
  UserPlus, 
  QrCode, 
  Users, 
  CreditCard, 
  FileSpreadsheet, 
  RefreshCw, 
  Settings 
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export type TabType = 'dashboard' | 'register' | 'checkin' | 'attendees' | 'payments' | 'reports' | 'sync' | 'settings';

interface NavigationProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export const Navigation: React.FC<NavigationProps> = ({ activeTab, onTabChange }) => {
  const { activeRole } = useApp();

  const navItems: { id: TabType; label: string; icon: React.ReactNode; roles?: string[] }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
    { id: 'checkin', label: 'Scan & Check-In', icon: <QrCode className="w-5 h-5 text-emerald-400" /> },
    { id: 'register', label: 'Register', icon: <UserPlus className="w-5 h-5" />, roles: ['ADMIN', 'REGISTRAR'] },
    { id: 'attendees', label: 'Attendees', icon: <Users className="w-5 h-5" /> },
    { id: 'payments', label: 'Payments', icon: <CreditCard className="w-5 h-5" />, roles: ['ADMIN', 'REGISTRAR'] },
    { id: 'reports', label: 'Reports', icon: <FileSpreadsheet className="w-5 h-5" />, roles: ['ADMIN'] },
    { id: 'sync', label: 'Sync & Backup', icon: <RefreshCw className="w-5 h-5" />, roles: ['ADMIN', 'REGISTRAR'] },
    { id: 'settings', label: 'Settings', icon: <Settings className="w-5 h-5" />, roles: ['ADMIN'] },
  ];

  const visibleItems = navItems.filter(item => !item.roles || item.roles.includes(activeRole));

  return (
    <>
      {/* Desktop / Tablet Navigation Tab Bar */}
      <nav className="hidden md:flex border-b border-slate-200 bg-white shadow-xs no-print sticky top-16 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full flex space-x-1 overflow-x-auto py-2">
          {visibleItems.map(item => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-teal-50 text-teal-800 border border-teal-200/80 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                }`}
              >
                <span className={isActive ? 'text-teal-700' : 'text-slate-400'}>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 shadow-lg no-print flex items-center justify-around py-1.5 px-2 safe-area-pb">
        {visibleItems.slice(0, 5).map(item => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`flex flex-col items-center justify-center py-1 px-2 rounded-lg transition-colors min-w-[54px] ${
                isActive ? 'text-teal-700 font-semibold' : 'text-slate-500'
              }`}
            >
              <div className={`p-1 rounded-md ${isActive ? 'bg-teal-50 text-teal-700' : 'text-slate-500'}`}>
                {item.icon}
              </div>
              <span className="text-[10px] tracking-tight truncate max-w-[64px]">{item.label}</span>
            </button>
          );
        })}
        {/* If there are more than 5, allow jumping to sync/settings */}
        {visibleItems.length > 5 && (
          <button
            onClick={() => onTabChange(visibleItems.find(i => i.id === 'sync' || i.id === 'reports') ? 'sync' : 'settings')}
            className={`flex flex-col items-center justify-center py-1 px-2 rounded-lg transition-colors min-w-[54px] ${
              activeTab === 'sync' || activeTab === 'reports' || activeTab === 'settings' ? 'text-teal-700 font-semibold' : 'text-slate-500'
            }`}
          >
            <div className={`p-1 rounded-md ${activeTab === 'sync' || activeTab === 'reports' || activeTab === 'settings' ? 'bg-teal-50 text-teal-700' : 'text-slate-500'}`}>
              <RefreshCw className="w-5 h-5" />
            </div>
            <span className="text-[10px] tracking-tight">More</span>
          </button>
        )}
      </nav>
    </>
  );
};
