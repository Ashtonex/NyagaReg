import React, { useState } from 'react';
import { 
  Lock, 
  Tent, 
  Shield, 
  KeyRound, 
  AlertCircle, 
  ArrowRight,
  UserCheck,
  Check
} from 'lucide-react';
import { HARDCODED_ACCOUNTS, verifyAccountPin, findAccountById } from '../../db/accounts';
import type { UserAccount } from '../../types';
import type { TabType } from '../layout/Navigation';

interface LoginGateScreenProps {
  onLoginSuccess: (account: UserAccount, redirectTab: TabType) => void;
}

export const LoginGateScreen: React.FC<LoginGateScreenProps> = ({ onLoginSuccess }) => {
  const [selectedAccountId, setSelectedAccountId] = useState<string>(HARDCODED_ACCOUNTS[0].id);
  const [pin, setPin] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const selectedAccount = findAccountById(selectedAccountId) || HARDCODED_ACCOUNTS[0];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!pin.trim()) {
      setErrorMsg('Please enter your 4-digit security PIN.');
      return;
    }

    setIsSubmitting(true);

    try {
      const isValid = verifyAccountPin(selectedAccount, pin.trim());
      if (!isValid) {
        setErrorMsg('Incorrect PIN for this staff member. Please check and try again.');
        setIsSubmitting(false);
        return;
      }

      // Determine proper redirection page based on role:
      // - Registrar -> attendees (directory and register)
      // - Check-In Gate Staff -> checkin (QR camera scanner)
      // - Admin -> dashboard (camp metrics & accountability)
      let redirectTab: TabType = 'dashboard';
      if (selectedAccount.role === 'REGISTRAR') {
        redirectTab = 'attendees';
      } else if (selectedAccount.role === 'CHECKIN') {
        redirectTab = 'checkin';
      } else {
        redirectTab = 'dashboard';
      }

      onLoginSuccess(selectedAccount, redirectTab);
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
              Select your name and enter your PIN to be redirected to your station.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            
            {/* Staff Member Selection */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                Select Your Name / Station
              </label>

              <div className="grid grid-cols-1 gap-2 max-h-56 overflow-y-auto pr-1">
                {HARDCODED_ACCOUNTS.map(acc => {
                  const isSelected = acc.id === selectedAccountId;
                  return (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => {
                        setSelectedAccountId(acc.id);
                        setPin('');
                        setErrorMsg('');
                      }}
                      className={`flex items-center justify-between p-3 rounded-2xl border text-left transition ${
                        isSelected
                          ? 'border-teal-600 bg-teal-50/90 shadow-xs ring-2 ring-teal-500/30'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className={`w-10 h-10 rounded-xl ${acc.avatarColor} text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0`}>
                          {acc.accountCode.slice(0, 3)}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-slate-900 leading-tight">
                            {acc.displayName}
                          </div>
                          <div className="flex items-center space-x-2 text-xs text-slate-500 mt-0.5">
                            <span className="font-semibold text-teal-700">{acc.role}</span>
                            <span>•</span>
                            <span>{acc.stationId}</span>
                          </div>
                        </div>
                      </div>

                      {isSelected && (
                        <div className="w-6 h-6 rounded-full bg-teal-600 text-white flex items-center justify-center shrink-0">
                          <Check className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* PIN Entry Field (Masked Password Input) */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center justify-between">
                <span className="flex items-center space-x-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-teal-600" />
                  <span>Enter 4-Digit Security PIN</span>
                </span>
                <span className="text-[10px] text-slate-400 font-normal">Confidential</span>
              </label>

              <div className="relative">
                <input
                  type="password"
                  maxLength={4}
                  value={pin}
                  onChange={e => {
                    setPin(e.target.value);
                    setErrorMsg('');
                  }}
                  placeholder="••••"
                  autoFocus
                  className="w-full py-3 px-4 bg-white border border-slate-300 rounded-xl text-slate-900 font-mono text-center text-2xl tracking-[0.4em] focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 shadow-2xs"
                />
              </div>

              {errorMsg && (
                <div className="flex items-center space-x-1.5 text-xs text-rose-600 font-semibold pt-1 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}
            </div>

            {/* Sign In Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center space-x-2 py-3.5 px-5 bg-teal-600 hover:bg-teal-500 text-white text-sm font-bold rounded-2xl shadow-lg shadow-teal-600/20 transition active:scale-[0.98] cursor-pointer"
            >
              <UserCheck className="w-4 h-4" />
              <span>Sign In to Station</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </button>

          </form>

          {/* Footer Note */}
          <div className="mt-5 pt-4 border-t border-slate-100 text-center">
            <p className="text-[11px] text-slate-400">
              Authorized registration & gate check-in personnel only. All access is audited and logged locally.
            </p>
          </div>

        </div>

      </div>
    </div>
  );
};
