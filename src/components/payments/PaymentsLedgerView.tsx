import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CreditCard, Search } from 'lucide-react';
import { db } from '../../db/db';

export const PaymentsLedgerView: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterMethod, setFilterMethod] = useState<string>('all');

  const payments = useLiveQuery(() => db.payments.reverse().sortBy('paymentDateTime'), []);
  const attendees = useLiveQuery(() => db.attendees.toArray(), []);

  // Map attendee IDs to names & church
  const attendeeMap = useMemo(() => {
    const map = new Map<string, { name: string; church: string }>();
    if (attendees) {
      attendees.forEach(a => map.set(a.id, { name: a.fullName, church: a.churchAssembly }));
    }
    return map;
  }, [attendees]);

  // Aggregate totals
  const aggregates = useMemo(() => {
    if (!payments) return { total: 0, count: 0, byMethod: {} as Record<string, number> };
    let total = 0;
    const byMethod: Record<string, number> = {};

    payments.forEach(p => {
      const amt = Number(p.amount) || 0;
      total += amt;
      byMethod[p.paymentMethod] = (byMethod[p.paymentMethod] || 0) + amt;
    });

    return { total, count: payments.length, byMethod };
  }, [payments]);

  const filteredPayments = useMemo(() => {
    if (!payments) return [];
    let list = [...payments];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(p => {
        const att = attendeeMap.get(p.attendeeId);
        return (
          p.registrationId.toLowerCase().includes(q) ||
          (p.paymentReference && p.paymentReference.toLowerCase().includes(q)) ||
          (p.notes && p.notes.toLowerCase().includes(q)) ||
          (att && att.name.toLowerCase().includes(q))
        );
      });
    }

    if (filterMethod !== 'all') {
      list = list.filter(p => p.paymentMethod === filterMethod);
    }

    return list;
  }, [payments, searchQuery, filterMethod, attendeeMap]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center space-x-2">
            <CreditCard className="w-6 h-6 text-teal-600" />
            <span>Master Payment Transactions Ledger</span>
          </h2>
          <p className="text-xs text-slate-500">
            Append-only record of all cash, EcoCash, Zipit, bank, and card payments.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
            Total Collected: <strong className="text-emerald-700">US${aggregates.total.toFixed(2)}</strong> ({aggregates.count} txns)
          </span>
        </div>
      </div>

      {/* Payment Method Breakdown Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {['Cash', 'EcoCash / Mobile Money', 'Bank Transfer', 'Card', 'Other'].map(method => (
          <div key={method} className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs text-xs">
            <span className="text-[10px] uppercase font-bold text-slate-400 block truncate">{method}</span>
            <span className="text-base font-extrabold text-slate-900 block mt-0.5">
              US${(aggregates.byMethod[method] || 0).toFixed(2)}
            </span>
          </div>
        ))}
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search by Attendee Name, Reg ID (e.g. PC-0027), or Reference #..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50"
            />
          </div>

          <select
            value={filterMethod}
            onChange={e => setFilterMethod(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white focus:outline-none"
          >
            <option value="all">All Methods</option>
            <option value="Cash">Cash</option>
            <option value="EcoCash / Mobile Money">EcoCash / Mobile Money</option>
            <option value="Bank Transfer">Bank Transfer</option>
            <option value="Card">Card</option>
            <option value="Other">Other</option>
          </select>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
        {filteredPayments.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-xs">
            No payment transactions found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="p-3.5">Reg ID</th>
                  <th className="p-3.5">Attendee Name</th>
                  <th className="p-3.5">Amount (USD)</th>
                  <th className="p-3.5">Method</th>
                  <th className="p-3.5">Reference #</th>
                  <th className="p-3.5">Date & Time</th>
                  <th className="p-3.5">Staff</th>
                  <th className="p-3.5">Station</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPayments.map(p => {
                  const att = attendeeMap.get(p.attendeeId);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 transition">
                      <td className="p-3.5 font-mono font-bold text-teal-800">
                        {p.registrationId}
                      </td>
                      <td className="p-3.5 font-bold text-slate-900">
                        {att?.name || 'Attendee'}
                      </td>
                      <td className="p-3.5 font-extrabold text-emerald-700">
                        US${p.amount.toFixed(2)}
                      </td>
                      <td className="p-3.5">
                        <span className="font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-800">
                          {p.paymentMethod}
                        </span>
                      </td>
                      <td className="p-3.5 font-mono text-slate-600">
                        {p.paymentReference || '-'}
                      </td>
                      <td className="p-3.5 text-slate-500">
                        {p.paymentDateTime ? new Date(p.paymentDateTime).toLocaleString() : '-'}
                      </td>
                      <td className="p-3.5 text-slate-600 font-medium">
                        {p.recordedBy}
                      </td>
                      <td className="p-3.5 font-mono text-[10px] text-slate-400">
                        {p.stationId || 'STATION-A'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};
