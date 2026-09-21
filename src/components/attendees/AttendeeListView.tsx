import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  Search, 
  Filter, 
  Printer, 
  Receipt, 
  CreditCard, 
  Users, 
  FileSpreadsheet, 
  ChevronRight, 
  ArrowUpDown 
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { db } from '../../db/db';
import { exportAttendeesToSpreadsheet } from '../../db/syncEngine';

export const AttendeeListView: React.FC = () => {
  const { openReceipt, openPayment, openProfile, openPrintBatch, showToast } = useApp();

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<'registrationId' | 'fullName' | 'amountPaid' | 'balance'>('registrationId');
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  const attendees = useLiveQuery(() => db.attendees.toArray(), []);

  const filteredAttendees = useMemo(() => {
    if (!attendees) return [];

    let list = [...attendees];

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(a =>
        a.registrationId.toLowerCase().includes(q) ||
        a.fullName.toLowerCase().includes(q) ||
        a.phoneNumber.toLowerCase().includes(q) ||
        a.churchAssembly.toLowerCase().includes(q)
      );
    }

    // Filter categories matching Section 14
    switch (filterCategory) {
      case 'paid':
        list = list.filter(a => a.paymentStatus === 'Paid / Confirmed' && a.registrationStatus !== 'Cancelled');
        break;
      case 'part_paid':
        list = list.filter(a => a.paymentStatus === 'Part Paid' && a.registrationStatus !== 'Cancelled');
        break;
      case 'unpaid':
        list = list.filter(a => a.paymentStatus === 'Awaiting Payment' && a.registrationStatus !== 'Cancelled');
        break;
      case 'checked_in':
        list = list.filter(a => a.checkInStatus === 'Checked In' && a.registrationStatus !== 'Cancelled');
        break;
      case 'not_arrived':
        list = list.filter(a => a.checkInStatus !== 'Checked In' && a.registrationStatus !== 'Cancelled');
        break;
      case 'transport':
        list = list.filter(a => a.transportRequired && a.registrationStatus !== 'Cancelled');
        break;
      case 'minors':
        list = list.filter(a => a.age < 18 && a.registrationStatus !== 'Cancelled');
        break;
      case 'cancelled':
        list = list.filter(a => a.registrationStatus === 'Cancelled');
        break;
      default:
        break;
    }

    // Sorting
    list.sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (typeof valA === 'string') {
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortAsc ? (valA - valB) : (valB - valA);
    });

    return list;
  }, [attendees, searchQuery, filterCategory, sortField, sortAsc]);

  const handleSelectAll = () => {
    if (!filteredAttendees) return;
    if (selectedIds.size === filteredAttendees.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAttendees.map(a => a.id)));
    }
  };

  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleBatchPrint = () => {
    if (!attendees) return;
    const selected = attendees.filter(a => selectedIds.has(a.id));
    if (selected.length === 0) {
      showToast('warning', 'Please select at least one attendee to print passes');
      return;
    }
    openPrintBatch(selected);
  };

  const handleExportSpreadsheet = async () => {
    try {
      await exportAttendeesToSpreadsheet('xlsx');
      showToast('success', 'Exported attendee spreadsheet successfully');
    } catch (err: any) {
      showToast('error', `Export failed: ${err.message || err}`);
    }
  };

  const toggleSort = (field: 'registrationId' | 'fullName' | 'amountPaid' | 'balance') => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* Top Header & Export */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center space-x-2">
            <Users className="w-6 h-6 text-teal-600" />
            <span>Attendee Directory</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
              {filteredAttendees.length}
            </span>
          </h2>
          <p className="text-xs text-slate-500">
            Search, manage registrations, issue receipts, and batch-print passes.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {selectedIds.size > 0 && (
            <button
              onClick={handleBatchPrint}
              className="flex items-center space-x-1.5 px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow transition active:scale-95 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print {selectedIds.size} Passes</span>
            </button>
          )}

          <button
            onClick={handleExportSpreadsheet}
            className="flex items-center space-x-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition active:scale-95 cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-4 space-y-4">
        
        {/* Search row */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Search by Name, Reg ID (e.g. PC-0001), Phone, or Church Assembly..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50"
          />
        </div>

        {/* Filter Pills matching Section 14 */}
        <div className="flex items-center space-x-1 overflow-x-auto pb-1 text-xs font-medium">
          <span className="text-slate-400 flex items-center pr-2">
            <Filter className="w-3.5 h-3.5 mr-1" />
            Filter:
          </span>
          {[
            { id: 'all', label: 'All' },
            { id: 'paid', label: 'Paid' },
            { id: 'part_paid', label: 'Part Paid' },
            { id: 'unpaid', label: 'Awaiting Payment' },
            { id: 'checked_in', label: 'Checked In' },
            { id: 'not_arrived', label: 'Not Checked In' },
            { id: 'transport', label: 'Transport Required' },
            { id: 'minors', label: 'Minors' },
            { id: 'cancelled', label: 'Cancelled' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilterCategory(f.id)}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition cursor-pointer ${
                filterCategory === f.id
                  ? 'bg-teal-600 text-white font-bold shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Attendees Table / List */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
        
        {filteredAttendees.length === 0 ? (
          <div className="text-center py-12 text-slate-400 space-y-2">
            <Users className="w-8 h-8 mx-auto text-slate-300" />
            <p className="text-sm font-medium">No attendees match your search or filter criteria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="p-3.5 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.size > 0 && selectedIds.size === filteredAttendees.length}
                      onChange={handleSelectAll}
                      className="rounded text-teal-600 focus:ring-teal-500"
                    />
                  </th>
                  <th 
                    onClick={() => toggleSort('registrationId')} 
                    className="p-3.5 cursor-pointer hover:text-slate-900"
                  >
                    <div className="flex items-center space-x-1">
                      <span>Reg ID</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th 
                    onClick={() => toggleSort('fullName')} 
                    className="p-3.5 cursor-pointer hover:text-slate-900"
                  >
                    <div className="flex items-center space-x-1">
                      <span>Attendee Name</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="p-3.5 hidden md:table-cell">Church / Assembly</th>
                  <th 
                    onClick={() => toggleSort('amountPaid')} 
                    className="p-3.5 cursor-pointer hover:text-slate-900"
                  >
                    <div className="flex items-center space-x-1">
                      <span>Paid</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th 
                    onClick={() => toggleSort('balance')} 
                    className="p-3.5 cursor-pointer hover:text-slate-900"
                  >
                    <div className="flex items-center space-x-1">
                      <span>Balance</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="p-3.5">Payment Status</th>
                  <th className="p-3.5">Check-In Status</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAttendees.map(a => {
                  const isSelected = selectedIds.has(a.id);
                  const isCancelled = a.registrationStatus === 'Cancelled';

                  return (
                    <tr
                      key={a.id}
                      onClick={() => openProfile(a)}
                      className={`hover:bg-slate-50 transition cursor-pointer ${
                        isSelected ? 'bg-teal-50/40' : isCancelled ? 'bg-slate-50/80 text-slate-400 opacity-70' : ''
                      }`}
                    >
                      <td className="p-3.5 text-center" onClick={e => handleToggleSelect(a.id, e)}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="rounded text-teal-600 focus:ring-teal-500"
                        />
                      </td>
                      <td className={`p-3.5 font-mono font-bold ${isCancelled ? 'text-slate-400 line-through' : 'text-teal-800'}`}>
                        {a.registrationId}
                      </td>
                      <td className={`p-3.5 font-bold ${isCancelled ? 'text-slate-500' : 'text-slate-900'}`}>
                        <div className="flex items-center space-x-2">
                          <span>{a.fullName}</span>
                          {isCancelled && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-slate-200 text-slate-600">
                              CANCELLED
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] font-normal text-slate-400 md:hidden">
                          {a.churchAssembly} • {a.phoneNumber}
                        </div>
                      </td>
                      <td className="p-3.5 text-slate-600 hidden md:table-cell">
                        {a.churchAssembly}
                      </td>
                      <td className="p-3.5 font-bold text-slate-900">
                        US${a.amountPaid.toFixed(2)}
                      </td>
                      <td className="p-3.5 font-bold">
                        <span className={a.balance > 0 ? 'text-amber-700' : 'text-slate-400'}>
                          US${a.balance.toFixed(2)}
                        </span>
                      </td>
                      <td className="p-3.5">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                          isCancelled
                            ? 'bg-slate-200 text-slate-600'
                            : a.paymentStatus === 'Paid / Confirmed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : a.paymentStatus === 'Part Paid'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-rose-100 text-rose-800'
                        }`}>
                          {a.paymentStatus}
                        </span>
                      </td>
                      <td className="p-3.5">
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                          isCancelled
                            ? 'bg-slate-100 text-slate-500'
                            : a.checkInStatus === 'Checked In'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-600'
                        }`}>
                          {a.checkInStatus}
                        </span>
                      </td>
                      <td className="p-3.5 text-right space-x-1" onClick={e => e.stopPropagation()}>
                        <button
                          title="View Receipt"
                          onClick={() => openReceipt(a)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-teal-700 hover:bg-teal-50 transition cursor-pointer"
                        >
                          <Receipt className="w-4 h-4" />
                        </button>
                        <button
                          title="Add Payment"
                          onClick={() => openPayment(a)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-amber-700 hover:bg-amber-50 transition cursor-pointer"
                        >
                          <CreditCard className="w-4 h-4" />
                        </button>
                        <button
                          title="Open Profile"
                          onClick={() => openProfile(a)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 transition cursor-pointer"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
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
