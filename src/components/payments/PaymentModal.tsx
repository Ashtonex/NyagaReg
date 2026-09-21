import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  X, 
  DollarSign, 
  Plus, 
  History, 
  CreditCard, 
  Calendar, 
  User 
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { db, computePaymentStatus, logAuditEvent, syncPersistentJsonDb } from '../../db/db';
import { syncSinglePaymentToSupabase, syncSingleAttendeeToSupabase } from '../../db/supabaseSync';
import type { Attendee, PaymentTransaction } from '../../types';

interface PaymentModalProps {
  attendee: Attendee | null;
  onClose: () => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({ attendee, onClose }) => {
  const { settings, activeStaffName, activeRole, showToast } = useApp();

  const [amount, setAmount] = useState<number | ''>('');
  const [method, setMethod] = useState<'Cash' | 'EcoCash / Mobile Money' | 'Bank Transfer' | 'Card' | 'Other'>('Cash');
  const [reference, setReference] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Live query of attendee's payment transactions
  const payments = useLiveQuery(
    () => (attendee ? db.payments.where('attendeeId').equals(attendee.id).reverse().sortBy('paymentDateTime') : []),
    [attendee?.id]
  );

  // Auto-fill suggested remaining balance
  useEffect(() => {
    if (attendee && attendee.balance > 0) {
      setAmount(attendee.balance);
    } else {
      setAmount('');
    }
  }, [attendee]);

  if (!attendee) return null;

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const paymentVal = typeof amount === 'number' ? amount : 0;
    if (paymentVal <= 0) {
      showToast('error', 'Payment amount must be greater than zero.');
      return;
    }

    // Reference requirement for non-cash methods
    if (method !== 'Cash' && !reference.trim() && activeRole !== 'ADMIN') {
      showToast('error', 'Payment reference is required for non-cash transactions.');
      return;
    }

    setIsSubmitting(true);
    try {
      const now = new Date().toISOString();
      const newTx: PaymentTransaction = {
        id: crypto.randomUUID(),
        attendeeId: attendee.id,
        registrationId: attendee.registrationId,
        amount: paymentVal,
        paymentDateTime: now,
        paymentMethod: method,
        paymentReference: reference.trim() || undefined,
        recordedBy: activeStaffName,
        notes: notes.trim(),
        createdAt: now,
        syncStatus: 'Saved Locally',
        stationId: settings.stationId
      };

      await db.payments.add(newTx);

      // Recalculate total amount paid from all transactions
      const allPayments = await db.payments.where('attendeeId').equals(attendee.id).toArray();
      const newTotalPaid = allPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      const newBalance = Math.max(0, attendee.amountDue - newTotalPaid);
      const newStatus = computePaymentStatus(attendee.amountDue, newTotalPaid);

      await db.attendees.update(attendee.id, {
        amountPaid: newTotalPaid,
        balance: newBalance,
        paymentStatus: newStatus,
        receiptIssued: true,
        receiptIssuedAt: now,
        updatedAt: now
      });

      await logAuditEvent(
        'Payment recorded',
        `Payment recorded: US$${paymentVal.toFixed(2)} via ${method}. Total Paid: US$${newTotalPaid.toFixed(2)}. Status: ${newStatus}`,
        attendee.registrationId,
        attendee.id
      );

      // Immediately sync to persistent JSON database in localStorage
      await syncPersistentJsonDb();

      // Push real-time to Supabase cloud database if configured
      syncSinglePaymentToSupabase(newTx).catch(console.warn);
      db.attendees.get(attendee.id).then(updated => {
        if (updated) syncSingleAttendeeToSupabase(updated).catch(console.warn);
      }).catch(console.warn);

      showToast('success', `Payment of US$${paymentVal.toFixed(2)} recorded for ${attendee.fullName}`);
      setAmount('');
      setReference('');
      setNotes('');
    } catch (err: any) {
      console.error('Failed to add payment:', err);
      showToast('error', `Error recording payment: ${err.message || err}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="relative bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden my-6">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center border border-teal-500/30">
              <CreditCard className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base">Record Payment</h3>
              <p className="text-xs text-slate-400">{attendee.fullName} ({attendee.registrationId})</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[85vh] overflow-y-auto">
          
          {/* Attendee Balance Overview */}
          <div className="grid grid-cols-3 gap-2 bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Fee Due</span>
              <span className="text-sm font-extrabold text-slate-800">US${attendee.amountDue.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Paid</span>
              <span className="text-sm font-extrabold text-emerald-600">US${attendee.amountPaid.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Balance</span>
              <span className={`text-sm font-extrabold ${attendee.balance > 0 ? 'text-amber-600' : 'text-slate-500'}`}>
                US${attendee.balance.toFixed(2)}
              </span>
            </div>
          </div>

          {/* New Payment Form */}
          <form onSubmit={handleAddPayment} className="bg-teal-50/70 border border-teal-200 rounded-xl p-4 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-teal-900 flex items-center space-x-1.5">
              <Plus className="w-4 h-4 text-teal-600" />
              <span>Add Transaction</span>
            </h4>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-teal-950 mb-1">Amount (USD) *</label>
                <input
                  type="number"
                  min="0.5"
                  step="any"
                  required
                  value={amount}
                  onChange={e => setAmount(e.target.value ? parseFloat(e.target.value) : '')}
                  className="w-full px-3 py-2 border border-teal-300 rounded-lg text-sm bg-white font-bold focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-teal-950 mb-1">Method</label>
                <select
                  value={method}
                  onChange={e => setMethod(e.target.value as any)}
                  className="w-full px-3 py-2 border border-teal-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="Cash">Cash</option>
                  <option value="EcoCash / Mobile Money">EcoCash / Mobile Money</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Card">Card</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-semibold text-teal-950 mb-1">
                  Reference # {method !== 'Cash' && <span className="text-rose-600">*</span>}
                </label>
                <input
                  type="text"
                  placeholder={method === 'Cash' ? 'e.g. Receipt # or CASH-02' : 'Transaction Ref (Required)'}
                  value={reference}
                  onChange={e => setReference(e.target.value)}
                  className="w-full px-3 py-1.5 border border-teal-300 rounded-lg text-xs bg-white focus:outline-none"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-semibold text-teal-950 mb-1">Notes</label>
                <input
                  type="text"
                  placeholder="Optional payment remarks"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full px-3 py-1.5 border border-teal-300 rounded-lg text-xs bg-white focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold shadow transition active:scale-98 cursor-pointer disabled:opacity-50 flex items-center justify-center space-x-1.5"
            >
              <DollarSign className="w-4 h-4" />
              <span>{isSubmitting ? 'Recording...' : 'Record Payment'}</span>
            </button>
          </form>

          {/* Payment History Ledger (Append-only) */}
          <div>
            <div className="flex items-center space-x-2 border-b border-slate-200 pb-2 mb-3">
              <History className="w-4 h-4 text-slate-500" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Payment History Ledger</h4>
            </div>

            {(!payments || payments.length === 0) ? (
              <p className="text-xs text-slate-400 italic text-center py-4">No payments recorded yet for this attendee.</p>
            ) : (
              <div className="space-y-2">
                {payments.map(p => (
                  <div key={p.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 text-sm">US${p.amount.toFixed(2)}</span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-200 text-slate-800">
                        {p.paymentMethod}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-500 text-[11px] pt-1">
                      <span className="flex items-center space-x-1">
                        <Calendar className="w-3 h-3" />
                        <span>{p.paymentDateTime ? new Date(p.paymentDateTime).toLocaleString() : 'N/A'}</span>
                      </span>
                      <span className="flex items-center space-x-1">
                        <User className="w-3 h-3" />
                        <span>Staff: {p.recordedBy}</span>
                      </span>
                    </div>
                    {p.paymentReference && (
                      <div className="text-[10px] text-slate-600 font-mono">
                        Ref: {p.paymentReference}
                      </div>
                    )}
                    {p.notes && (
                      <div className="text-[11px] text-slate-500 italic">
                        "{p.notes}"
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
};
