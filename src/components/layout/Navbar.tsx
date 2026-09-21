import React from 'react';
import { 
  Wifi, 
  WifiOff, 
  Shield, 
  UserPlus, 
  Tent 
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { StaffRole } from '../../types';

export const Navbar: React.FC = () => {
  const { 
    isOnline, 
    settings, 
    activeRole, 
    activeStaffName, 
    setActiveRole, 
    openNewReg 
  } = useApp();

  const handleRoleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const role = e.target.value as StaffRole;
    setActiveRole(role);
  };

  return (
    <header className="sticky top-0 z-40 bg-slate-900 text-white shadow-md border-b border-slate-800 no-print">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Camp Title */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-500 to-emerald-400 flex items-center justify-center shadow-lg shadow-teal-500/20 text-white">
              <Tent className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg tracking-tight text-white">Administrare</span>
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-teal-500/20 text-teal-300 border border-teal-500/30">
                  {settings.stationId}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium hidden sm:block">
                {settings.campName} • {settings.venue}
              </p>
            </div>
          </div>

          {/* Right Controls */}
          <div className="flex items-center space-x-2 sm:space-x-4">
            {/* Online / Offline status badge */}
            <div 
              title={isOnline ? 'Online - internet connected' : 'Offline - local IndexedDB is active'}
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                isOnline 
                  ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800/60' 
                  : 'bg-amber-950/80 text-amber-300 border-amber-800/60 animate-pulse'
              }`}
            >
              {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{isOnline ? 'ONLINE' : 'OFFLINE MODE'}</span>
              <span className="sm:hidden">{isOnline ? 'ON' : 'OFF'}</span>
            </div>

            {/* Staff Role Switcher */}
            <div className="flex items-center space-x-1.5 bg-slate-800/90 border border-slate-700/80 rounded-lg px-2 py-1">
              <Shield className="w-3.5 h-3.5 text-teal-400" />
              <select
                value={activeRole}
                onChange={handleRoleChange}
                className="bg-transparent text-xs font-medium text-slate-200 focus:outline-none cursor-pointer pr-1"
              >
                <option value="ADMIN" className="bg-slate-900 text-white">Admin ({activeStaffName})</option>
                <option value="REGISTRAR" className="bg-slate-900 text-white">Registrar</option>
                <option value="CHECKIN" className="bg-slate-900 text-white">Gate / Check-In</option>
              </select>
            </div>

            {/* + New Registration Button */}
            {activeRole !== 'CHECKIN' && (
              <button
                onClick={openNewReg}
                className="flex items-center space-x-1.5 bg-teal-600 hover:bg-teal-500 text-white text-xs sm:text-sm font-semibold px-3 py-1.5 rounded-lg shadow transition active:scale-95"
              >
                <UserPlus className="w-4 h-4" />
                <span className="hidden sm:inline">+ New Attendee</span>
                <span className="sm:hidden">+ Register</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
