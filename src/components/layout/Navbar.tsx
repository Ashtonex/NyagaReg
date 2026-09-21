import React from 'react';
import { 
  Wifi, 
  WifiOff, 
  UserPlus, 
  Tent, 
  ChevronDown, 
  ShieldCheck, 
  Database,
  FileSpreadsheet
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { downloadJsonDatabaseFile, exportFullExcelDatabase } from '../../db/syncEngine';

export const Navbar: React.FC = () => {
  const { 
    isOnline, 
    settings, 
    currentAccount, 
    openAccountSwitch, 
    openAccountability, 
    openNewReg,
    showToast 
  } = useApp();

  const handleDownloadJson = async () => {
    try {
      await downloadJsonDatabaseFile();
      showToast('success', 'Full database JSON downloaded successfully.', 'Database Saved');
    } catch (err: any) {
      showToast('error', `JSON export failed: ${err.message}`);
    }
  };

  const handleDownloadExcel = async () => {
    try {
      await exportFullExcelDatabase();
      showToast('success', 'Full database Excel (.xlsx) downloaded successfully.', 'Excel Export');
    } catch (err: any) {
      showToast('error', `Excel export failed: ${err.message}`);
    }
  };

  const isMasterAdmin = currentAccount.role === 'ADMIN';

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
                  {currentAccount.stationId || settings.stationId}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium hidden sm:block">
                {settings.campName} • {settings.venue}
              </p>
            </div>
          </div>

          {/* Right Controls */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            
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
              <span className="hidden md:inline">{isOnline ? 'ONLINE' : 'OFFLINE MODE'}</span>
            </div>

            {/* Quick DB Download Buttons (JSON & Excel) */}
            <div className="hidden lg:flex items-center space-x-1 bg-slate-800/80 p-1 rounded-lg border border-slate-700">
              <button
                onClick={handleDownloadJson}
                className="flex items-center space-x-1 px-2 py-1 rounded text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-700 transition"
                title="Download local JSON Database file for permanent backup"
              >
                <Database className="w-3.5 h-3.5 text-teal-400" />
                <span>JSON DB</span>
              </button>
              <button
                onClick={handleDownloadExcel}
                className="flex items-center space-x-1 px-2 py-1 rounded text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-700 transition"
                title="Download full multi-sheet Excel spreadsheet"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                <span>XLSX</span>
              </button>
            </div>

            {/* Accountability Register (for Admin) */}
            {isMasterAdmin && (
              <button
                onClick={() => openAccountability()}
                className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-700/60 text-indigo-300 text-xs font-bold transition shadow-xs"
                title="View and download individual Registrar Accountability Registers"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                <span className="hidden md:inline">Accountability</span>
                <span className="md:hidden">Register</span>
              </button>
            )}

            {/* Staff Account Switcher Pill */}
            <button
              onClick={openAccountSwitch}
              className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-slate-600 rounded-lg px-2.5 py-1.5 transition text-left shadow-xs"
              title="Click to Switch Staff Account"
            >
              <div className={`w-6 h-6 rounded-md ${currentAccount.avatarColor} text-white flex items-center justify-center text-[10px] font-bold shadow-xs shrink-0`}>
                {currentAccount.accountCode.slice(0, 3)}
              </div>
              <div className="hidden sm:flex flex-col">
                <span className="text-xs font-bold text-slate-100 flex items-center space-x-1 leading-tight">
                  <span className="truncate max-w-[110px]">{currentAccount.displayName}</span>
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </span>
                <span className="text-[10px] text-slate-400 font-medium leading-none mt-0.5">
                  {currentAccount.role}
                </span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 sm:hidden" />
            </button>

            {/* + New Registration Button */}
            {currentAccount.role !== 'CHECKIN' && (
              <button
                onClick={openNewReg}
                className="flex items-center space-x-1.5 bg-teal-600 hover:bg-teal-500 text-white text-xs sm:text-sm font-bold px-3 py-1.5 rounded-lg shadow-sm transition active:scale-95 shrink-0"
              >
                <UserPlus className="w-4 h-4" />
                <span className="hidden md:inline">+ New Attendee</span>
                <span className="md:hidden">+ Add</span>
              </button>
            )}

          </div>
        </div>
      </div>
    </header>
  );
};
