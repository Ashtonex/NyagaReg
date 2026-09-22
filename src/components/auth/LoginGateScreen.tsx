import React, { useState } from 'react';
import { 
  Lock, 
  Tent, 
  Shield, 
  KeyRound, 
  User, 
  Eye, 
  EyeOff, 
  AlertCircle, 
  ArrowRight,
  UserCheck
} from 'lucide-react';
import { authenticateStaff, HARDCODED_ACCOUNTS } from '../../db/accounts';
import type { UserAccount } from '../../types';
import type { TabType } from '../layout/Navigation';

interface LoginGateScreenProps {
  onLoginSuccess: (account: UserAccount, redirectTab: TabType) => void;
}

export const LoginGateScreen: React.FC<LoginGateScreenProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanUser = username.trim();
    const cleanPass = password.trim();

    if (!cleanUser) {
      setErrorMsg('Please enter your username.');
      return;
    }

    if (!cleanPass) {
      setErrorMsg('Please enter your password.');
      return;
    }

    setIsSubmitting(true);

    try {
      const account = authenticateStaff(cleanUser, cleanPass);
      if (!account) {
        setErrorMsg('Invalid username or password. Please verify and try again.');
        setIsSubmitting(false);
        return;
      }

      // Redirection:
      // Registrars (Berthia, Nicole, Ruvarashe) -> Attendees Directory (with Check-In & Registration)
      // Master Admin -> Dashboard
      const redirectTab: TabType = account.role === 'REGISTRAR' ? 'attendees' : 'dashboard';

      onLoginSuccess(account, redirectTab);
    } catch (err: any) {
      setErrorMsg('Authentication error. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950 flex flex-col justify-center items-center p-4 sm:p-6 text-slate-100">
      <div className="w-full max-w-md">
        
        {/* Camp Branding Header */}
        <div className="text-center mb-6 space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-teal-500 to-emerald-400 shadow-xl shadow-teal-500/20 text-white mb-2 ring-4 ring-teal-500/20">
            <Tent className="w-8 h-8" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white uppercase">
            Provincial Camp 2026
          </h1>
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-800/80 text-teal-300 border border-slate-700">
            <Shield className="w-3.5 h-3.5 text-teal-400" />
            <span>WildGeo Nyanga • Staff Access Portal</span>
          </div>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-200/80 text-slate-900 animate-in fade-in zoom-in-95 duration-200">
          
          <div className="border-b border-slate-100 pb-4 mb-5">
            <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
              <Lock className="w-5 h-5 text-teal-600" />
              <span>Staff Sign-In</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Enter your assigned username and confidential password to access your station.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* Username Input Field */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={e => {
                    setUsername(e.target.value);
                    setErrorMsg('');
                  }}
                  placeholder="e.g. Berthia, Nicole, Ruvarashe, or Admin"
                  autoFocus
                  autoComplete="username"
                  className="w-full py-3 pl-10 pr-4 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition shadow-2xs"
                />
              </div>

              {/* Quick Select Chips */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                <span className="text-[10px] text-slate-400 font-semibold self-center mr-1">Select:</span>
                {HARDCODED_ACCOUNTS.map(acc => (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => {
                      setUsername(acc.displayName);
                      setErrorMsg('');
                    }}
                    className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition cursor-pointer ${
                      username.toLowerCase() === acc.username.toLowerCase() || username.toLowerCase() === acc.displayName.toLowerCase()
                        ? 'bg-teal-700 text-white border-teal-700 shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                    }`}
                  >
                    {acc.displayName}
                  </button>
                ))}
              </div>
            </div>

            {/* Password Input Field (Masked with Eye Toggle) */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center justify-between">
                <span>Password</span>
                <span className="text-[10px] text-slate-400 font-normal">Confidential</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <KeyRound className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={e => {
                    setPassword(e.target.value);
                    setErrorMsg('');
                  }}
                  placeholder="Enter your confidential password"
                  autoComplete="current-password"
                  className="w-full py-3 pl-10 pr-11 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition shadow-2xs"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition cursor-pointer"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center space-x-2 text-xs text-rose-700 font-semibold animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Sign In Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center space-x-2 py-3.5 px-5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold rounded-xl shadow-lg shadow-teal-600/20 transition active:scale-[0.98] cursor-pointer disabled:opacity-50 mt-2"
            >
              <UserCheck className="w-4 h-4" />
              <span>{isSubmitting ? 'Authenticating...' : 'Sign In to Station'}</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </button>

          </form>

          {/* Footer Note */}
          <div className="mt-5 pt-4 border-t border-slate-100 text-center">
            <p className="text-[11px] text-slate-400">
              Authorized camp registration & check-in personnel only. All access is logged.
            </p>
          </div>

        </div>

      </div>
    </div>
  );
};
