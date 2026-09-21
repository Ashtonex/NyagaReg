import React, { useState } from 'react';
import { 
  X, 
  Shield, 
  UserCheck, 
  Lock, 
  Check, 
  KeyRound,
  AlertCircle
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { UserAccount } from '../../types';

export const AccountSwitcherModal: React.FC = () => {
  const { 
    isAccountSwitchOpen, 
    closeAccountSwitch, 
    allAccounts, 
    currentAccount, 
    switchAccount 
  } = useApp();

  const [selectedAccountId, setSelectedAccountId] = useState<string>(currentAccount.id);
  const [pin, setPin] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  if (!isAccountSwitchOpen) return null;

  const targetAccount = allAccounts.find(a => a.id === selectedAccountId) || allAccounts[0];

  const handleSelectAccount = (acc: UserAccount) => {
    setSelectedAccountId(acc.id);
    setPin('');
    setErrorMsg('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin.trim()) {
      setErrorMsg('Please enter your 4-digit PIN');
      return;
    }

    const success = switchAccount(selectedAccountId, pin.trim());
    if (!success) {
      setErrorMsg('Invalid PIN. Please check and try again.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="relative bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
          <div className="flex items-center space-x-2">
            <Shield className="w-5 h-5 text-teal-400" />
            <div>
              <h2 className="text-base font-bold leading-tight">Switch Staff Account</h2>
              <p className="text-xs text-slate-400">Provincial Camp 2026 Registration Staff</p>
            </div>
          </div>
          <button
            onClick={closeAccountSwitch}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Account Selection Cards */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Select Your Staff Account
            </label>
            <div className="grid grid-cols-1 gap-2 max-h-56 overflow-y-auto pr-1">
              {allAccounts.map(acc => {
                const isSelected = acc.id === selectedAccountId;
                const isCurrent = acc.id === currentAccount.id;

                return (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => handleSelectAccount(acc)}
                    className={`flex items-center justify-between p-3 rounded-xl border text-left transition ${
                      isSelected
                        ? 'border-teal-600 bg-teal-50/80 shadow-xs ring-2 ring-teal-500/20'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`w-9 h-9 rounded-lg ${acc.avatarColor} text-white flex items-center justify-center font-bold text-sm shadow-xs`}>
                        {acc.accountCode.slice(0, 3)}
                      </div>
                      <div>
                        <div className="flex items-center space-x-1.5">
                          <span className="text-sm font-bold text-slate-900">{acc.displayName}</span>
                          {isCurrent && (
                            <span className="text-[10px] uppercase font-extrabold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800">
                              Active
                            </span>
                          )}
                        </div>
                        <div className="flex items-center space-x-2 text-xs text-slate-500">
                          <span className="font-semibold text-slate-600">{acc.role}</span>
                          <span>•</span>
                          <span>{acc.stationId}</span>
                        </div>
                      </div>
                    </div>

                    {isSelected && (
                      <div className="w-6 h-6 rounded-full bg-teal-600 text-white flex items-center justify-center">
                        <Check className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* PIN Entry Field */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center space-x-1.5">
                <Lock className="w-3.5 h-3.5 text-teal-600" />
                <span>Enter 4-Digit Staff PIN for {targetAccount.displayName}</span>
              </label>
            </div>

            <div className="relative">
              <input
                type="password"
                maxLength={6}
                value={pin}
                onChange={e => {
                  setPin(e.target.value);
                  setErrorMsg('');
                }}
                placeholder="Enter PIN (e.g. 1001, 2026)"
                autoFocus
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            </div>

            {errorMsg && (
              <div className="flex items-center space-x-1.5 text-xs text-rose-600 font-medium">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="text-[11px] text-slate-500 flex items-center justify-between pt-1">
              <span>PINs: Admin: <b>2026</b> | Acc A: <b>1001</b> | Acc B: <b>1002</b></span>
              <span className="text-slate-400 font-mono">Master Override: 2026</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end space-x-3 pt-2">
            <button
              type="button"
              onClick={closeAccountSwitch}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center space-x-1.5 bg-teal-600 hover:bg-teal-500 text-white text-sm font-bold px-5 py-2 rounded-lg shadow-sm transition active:scale-95"
            >
              <UserCheck className="w-4 h-4" />
              <span>Unlock & Switch Account</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
