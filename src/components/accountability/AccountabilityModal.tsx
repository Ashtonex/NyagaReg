import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  X, 
  FileSpreadsheet, 
  FileText, 
  DollarSign, 
  Users, 
  CreditCard, 
  ShieldCheck, 
  Smartphone
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { db } from '../../db/db';
import { exportAccountabilityExcel, generateAccountabilityPDF } from '../../db/syncEngine';


export const AccountabilityModal: React.FC = () => {
  const { 
    isAccountabilityOpen, 
    closeAccountability, 
    accountabilityTargetAccount, 
    currentAccount, 
    allAccounts, 
    showToast 
  } = useApp();

  const [selectedAccountId, setSelectedAccountId] = useState<string>(() => {
    return accountabilityTargetAccount?.id || currentAccount.id;
  });

  const activeAccount = useMemo(() => {
    return allAccounts.find(a => a.id === selectedAccountId) || accountabilityTargetAccount || currentAccount;
  }, [selectedAccountId, allAccounts, accountabilityTargetAccount, currentAccount]);

  const attendees = useLiveQuery(() => db.attendees.toArray(), []);
  const payments = useLiveQuery(() => db.payments.toArray(), []);

  // Filter for the selected registrar
  const staffAttendees = useMemo(() => {
    if (!attendees) return [];
    return attendees.filter(a => 
      a.registeredBy === activeAccount.displayName || 
      a.registeredBy === activeAccount.accountCode ||
      a.registeredBy === activeAccount.username
    );
  }, [attendees, activeAccount]);

  const staffPayments = useMemo(() => {
    if (!payments) return [];
    return payments.filter(p => 
      p.recordedBy === activeAccount.displayName || 
      p.recordedBy === activeAccount.accountCode ||
      p.recordedBy === activeAccount.username
    );
  }, [payments, activeAccount]);

  // Financial aggregates for this registrar
  const financialTotals = useMemo(() => {
    let cash = 0;
    let ecocash = 0;
    let bank = 0;
    let other = 0;

    staffPayments.forEach(p => {
      const amt = Number(p.amount) || 0;
      if (p.paymentMethod === 'Cash') cash += amt;
      else if (p.paymentMethod === 'EcoCash / Mobile Money') ecocash += amt;
      else if (p.paymentMethod === 'Bank Transfer') bank += amt;
      else other += amt;
    });

    const totalMonies = cash + ecocash + bank + other;
    const totalBalance = staffAttendees.reduce((sum, a) => sum + (a.balance || 0), 0);

    return { cash, ecocash, bank, other, totalMonies, totalBalance };
  }, [staffPayments, staffAttendees]);

  if (!isAccountabilityOpen) return null;

  const handleDownloadPDF = () => {
    try {
      generateAccountabilityPDF(activeAccount, attendees || [], payments || []);
      showToast('success', `Accountability PDF generated for ${activeAccount.displayName}`);
    } catch (err: any) {
      console.error('Failed to generate PDF:', err);
      showToast('error', `PDF generation failed: ${err.message}`);
    }
  };

  const handleDownloadExcel = () => {
    try {
      exportAccountabilityExcel(activeAccount, attendees || [], payments || []);
      showToast('success', `Accountability Excel spreadsheet generated for ${activeAccount.displayName}`);
    } catch (err: any) {
      console.error('Failed to export Excel:', err);
      showToast('error', `Excel export failed: ${err.message}`);
    }
  };

  const isMasterAdmin = currentAccount.role === 'ADMIN';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="relative bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
        
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/20 border border-teal-500/40 text-teal-400 flex items-center justify-center font-bold">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-bold leading-tight">Registrar Accountability Register</h2>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 font-bold border border-teal-500/30">
                  {activeAccount.accountCode}
                </span>
              </div>
              <p className="text-xs text-slate-400">Provincial Camp 2026 • Official Cash Handover & Audit Roster</p>
            </div>
          </div>

          <button
            onClick={closeAccountability}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Scrollable Body */}
        <div className="p-6 space-y-6 overflow-y-auto grow">
          
          {/* Account Selector Bar for Master Admin */}
          {isMasterAdmin && (
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600">Select Registrar:</span>
                <select
                  value={selectedAccountId}
                  onChange={e => setSelectedAccountId(e.target.value)}
                  className="text-xs font-bold text-slate-800 bg-white border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  {allAccounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.displayName} ({acc.accountCode}) — {acc.role}
                    </option>
                  ))}
                </select>
              </div>

              <div className="text-xs text-slate-500">
                Viewing live records recorded by: <b className="text-slate-800">{activeAccount.displayName}</b>
              </div>
            </div>
          )}

          {/* Accountability Summary KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            
            {/* 1. Cash On Hand (Highlighted) */}
            <div className="p-4 rounded-xl bg-emerald-50 border-2 border-emerald-500/50 shadow-xs">
              <div className="flex items-center justify-between text-emerald-800 mb-1">
                <span className="text-[11px] font-extrabold uppercase tracking-wider">Physical Cash</span>
                <DollarSign className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-black text-emerald-950 font-mono">
                US${financialTotals.cash.toFixed(2)}
              </div>
              <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-tight mt-1">
                Must hand over to Admin
              </div>
            </div>

            {/* 2. EcoCash / Mobile */}
            <div className="p-4 rounded-xl bg-sky-50 border border-sky-200">
              <div className="flex items-center justify-between text-sky-800 mb-1">
                <span className="text-[11px] font-extrabold uppercase tracking-wider">EcoCash / Digital</span>
                <Smartphone className="w-4 h-4 text-sky-600" />
              </div>
              <div className="text-2xl font-black text-sky-950 font-mono">
                US${financialTotals.ecocash.toFixed(2)}
              </div>
              <div className="text-[10px] font-semibold text-sky-700 mt-1">
                Direct verified mobile
              </div>
            </div>

            {/* 3. Bank / Other */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center justify-between text-slate-700 mb-1">
                <span className="text-[11px] font-extrabold uppercase tracking-wider">Bank / Other</span>
                <CreditCard className="w-4 h-4 text-slate-500" />
              </div>
              <div className="text-2xl font-black text-slate-900 font-mono">
                US${(financialTotals.bank + financialTotals.other).toFixed(2)}
              </div>
              <div className="text-[10px] font-semibold text-slate-500 mt-1">
                Bank & card receipts
              </div>
            </div>

            {/* 4. Total Registered Attendees */}
            <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-200">
              <div className="flex items-center justify-between text-indigo-800 mb-1">
                <span className="text-[11px] font-extrabold uppercase tracking-wider">People Registered</span>
                <Users className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="text-2xl font-black text-indigo-950 font-mono">
                {staffAttendees.length}
              </div>
              <div className="text-[10px] font-semibold text-indigo-700 mt-1">
                Total Monies: US${financialTotals.totalMonies.toFixed(2)}
              </div>
            </div>

          </div>

          {/* Detailed Attendees Roster Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-800 flex items-center space-x-2">
                <span>Registrations by {activeAccount.displayName}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-mono">
                  {staffAttendees.length} records
                </span>
              </h3>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto max-h-72">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-900 text-white font-bold sticky top-0 z-10">
                    <tr>
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">Reg ID</th>
                      <th className="py-2.5 px-3">Attendee Name</th>
                      <th className="py-2.5 px-3">Phone</th>
                      <th className="py-2.5 px-3">Church / Assembly</th>
                      <th className="py-2.5 px-3">Payment Method</th>
                      <th className="py-2.5 px-3">Reference</th>
                      <th className="py-2.5 px-3 text-right">Amount Paid</th>
                      <th className="py-2.5 px-3 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {staffAttendees.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-400 font-medium">
                          No attendee registrations recorded by {activeAccount.displayName} yet.
                        </td>
                      </tr>
                    ) : (
                      staffAttendees.map((att, idx) => {
                        const attPayment = staffPayments.find(p => p.attendeeId === att.id);
                        return (
                          <tr key={att.id} className="hover:bg-slate-50 transition">
                            <td className="py-2 px-3 text-slate-400 font-mono">{idx + 1}</td>
                            <td className="py-2 px-3 font-mono font-bold text-teal-700">{att.registrationId}</td>
                            <td className="py-2 px-3 font-bold text-slate-900">{att.fullName}</td>
                            <td className="py-2 px-3 text-slate-600 font-mono">{att.phoneNumber}</td>
                            <td className="py-2 px-3 text-slate-600">{att.churchAssembly}</td>
                            <td className="py-2 px-3">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                                {attPayment?.paymentMethod || (att.amountPaid > 0 ? 'Recorded' : 'Unpaid')}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-slate-500 font-mono text-[11px]">
                              {attPayment?.paymentReference || '-'}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700">
                              US${att.amountPaid.toFixed(2)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-slate-500">
                              US${att.balance.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Physical Cash Handover Certificate Section */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center space-x-1.5">
              <ShieldCheck className="w-4 h-4 text-teal-600" />
              <span>Official Cash Handover & Sign-Off Block</span>
            </h4>
            <p className="text-xs text-slate-600">
              This section is included in the downloaded PDF for physical verification and cash handover during camp operations.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200">
              <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-2">
                <span className="text-[11px] font-bold text-slate-700 block">
                  Registrar Handover Confirmation:
                </span>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  "I hereby confirm that I registered the {staffAttendees.length} attendees above and handed over <b>US${financialTotals.cash.toFixed(2)}</b> in physical cash."
                </p>
                <div className="pt-2">
                  <div className="h-6 border-b border-dashed border-slate-300"></div>
                  <div className="text-[10px] text-slate-400 mt-1 flex justify-between">
                    <span>{activeAccount.displayName} Signature</span>
                    <span>Date</span>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-2">
                <span className="text-[11px] font-bold text-slate-700 block">
                  Master Admin Reconciliation:
                </span>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  "I hereby acknowledge receipt and reconciliation of <b>US${financialTotals.cash.toFixed(2)}</b> in cash and verified the attendee records."
                </p>
                <div className="pt-2">
                  <div className="h-6 border-b border-dashed border-slate-300"></div>
                  <div className="text-[10px] text-slate-400 mt-1 flex justify-between">
                    <span>Master Admin Signature</span>
                    <span>Date</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Modal Footer with Download PDF and Download Excel Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 bg-slate-50 border-t border-slate-200 shrink-0">
          <div className="text-xs text-slate-500">
            Accountability Register: <span className="font-semibold text-slate-700">{activeAccount.displayName}</span>
          </div>

          <div className="flex items-center space-x-3">
            {/* Excel Download */}
            <button
              onClick={handleDownloadExcel}
              className="flex items-center space-x-1.5 px-4 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-bold rounded-lg shadow-2xs transition active:scale-95"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Download Excel (.xlsx)</span>
            </button>

            {/* PDF Download Button */}
            <button
              onClick={handleDownloadPDF}
              className="flex items-center space-x-1.5 px-5 py-2 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-lg shadow-sm transition active:scale-95"
            >
              <FileText className="w-4 h-4" />
              <span>Download Accountability PDF</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
