import React from 'react';
import * as XLSX from 'xlsx';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  FileSpreadsheet, 
  Download, 
  Users, 
  DollarSign, 
  UserCheck, 
  Clock, 
  Bus, 
  Utensils, 
  ShieldAlert, 
  FileText, 
  Compass 
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { db } from '../../db/db';
import { downloadBlob } from '../../db/syncEngine';

type ReportKey = 
  | 'all' 
  | 'paid' 
  | 'outstanding' 
  | 'transactions' 
  | 'checked_in' 
  | 'not_arrived' 
  | 'transport' 
  | 'dietary' 
  | 'activities'
  | 'emergency';

export const ReportsView: React.FC = () => {
  const { activeRole, showToast } = useApp();

  const attendees = useLiveQuery(() => db.attendees.toArray(), []);
  const payments = useLiveQuery(() => db.payments.toArray(), []);

  const isAdmin = activeRole === 'ADMIN';

  const reportDefinitions: { id: ReportKey; title: string; desc: string; icon: React.ReactNode; adminOnly?: boolean }[] = [
    { id: 'all', title: 'Complete Master Attendee Roster', desc: 'All registered attendees with demographic and payment status', icon: <Users className="w-5 h-5 text-teal-600" /> },
    { id: 'paid', title: 'Fully Paid Attendee List', desc: 'All attendees with $0 outstanding balance', icon: <DollarSign className="w-5 h-5 text-emerald-600" /> },
    { id: 'outstanding', title: 'Outstanding Balances Report', desc: 'Attendees with part-payment or unpaid balances', icon: <DollarSign className="w-5 h-5 text-amber-600" /> },
    { id: 'transactions', title: 'Payment Transaction Report', desc: 'Full audit ledger of all cash, EcoCash, card, and bank payments', icon: <FileText className="w-5 h-5 text-indigo-600" /> },
    { id: 'checked_in', title: 'Check-In & Gate Arrival List', desc: 'Attendees checked in at camp gate with arrival timestamps', icon: <UserCheck className="w-5 h-5 text-emerald-600" /> },
    { id: 'not_arrived', title: 'Not-Yet-Arrived List', desc: 'Active registered attendees who have not checked in at the gate', icon: <Clock className="w-5 h-5 text-slate-500" /> },
    { id: 'transport', title: 'Camp Transport List', desc: 'Attendees requiring bus transport from central pickup points', icon: <Bus className="w-5 h-5 text-sky-600" /> },
    { id: 'dietary', title: 'Dietary Requirements List', desc: 'Dietary requirements, allergies, and special catering needs', icon: <Utensils className="w-5 h-5 text-purple-600" /> },
    { id: 'activities', title: 'Optional Activities List', desc: 'Attendees who requested Quad bikes, Target shooting, etc.', icon: <Compass className="w-5 h-5 text-teal-600" /> },
    { id: 'emergency', title: 'Emergency Contact List', desc: 'Emergency contacts and confidential medical alerts (Admin only)', icon: <ShieldAlert className="w-5 h-5 text-rose-600" />, adminOnly: true },
  ];

  const handleExport = (key: ReportKey, format: 'xlsx' | 'csv') => {
    if (!attendees) return;

    let rows: any[] = [];
    let sheetTitle = 'Report';

    switch (key) {
      case 'all':
        sheetTitle = 'Master_Attendees';
        rows = attendees.map(a => ({
          'Registration ID': a.registrationId,
          'Full Name': a.fullName,
          'Gender': a.gender,
          'Age': a.age,
          'Phone Number': a.phoneNumber,
          'Church Assembly': a.churchAssembly,
          'Registration Status': a.registrationStatus,
          'Payment Status': a.paymentStatus,
          'Amount Due': a.amountDue,
          'Amount Paid': a.amountPaid,
          'Balance': a.balance,
          'Check-In Status': a.checkInStatus,
          'Check-In Time': `${a.checkInDate || ''} ${a.checkInTime || ''}`.trim()
        }));
        break;

      case 'paid':
        sheetTitle = 'Fully_Paid_Attendees';
        rows = attendees.filter(a => a.paymentStatus === 'Paid / Confirmed' && a.registrationStatus !== 'Cancelled').map(a => ({
          'Registration ID': a.registrationId,
          'Full Name': a.fullName,
          'Phone': a.phoneNumber,
          'Church': a.churchAssembly,
          'Amount Paid': a.amountPaid,
          'Check-In': a.checkInStatus
        }));
        break;

      case 'outstanding':
        sheetTitle = 'Outstanding_Balances';
        rows = attendees.filter(a => a.balance > 0 && a.registrationStatus !== 'Cancelled').map(a => ({
          'Registration ID': a.registrationId,
          'Full Name': a.fullName,
          'Phone': a.phoneNumber,
          'Church': a.churchAssembly,
          'Amount Due': a.amountDue,
          'Amount Paid': a.amountPaid,
          'Outstanding Balance': a.balance,
          'Payment Status': a.paymentStatus
        }));
        break;

      case 'transactions':
        sheetTitle = 'Payment_Transactions';
        rows = (payments || []).map(p => ({
          'Transaction ID': p.id.slice(0, 8),
          'Registration ID': p.registrationId,
          'Amount (USD)': p.amount,
          'Method': p.paymentMethod,
          'Reference': p.paymentReference || '',
          'Timestamp': p.paymentDateTime ? new Date(p.paymentDateTime).toLocaleString() : '',
          'Recorded By': p.recordedBy,
          'Notes': p.notes || ''
        }));
        break;

      case 'checked_in':
        sheetTitle = 'Check_In_Manifest';
        rows = attendees.filter(a => a.checkInStatus === 'Checked In' && a.registrationStatus !== 'Cancelled').map(a => ({
          'Registration ID': a.registrationId,
          'Full Name': a.fullName,
          'Church': a.churchAssembly,
          'Payment Status': a.paymentStatus,
          'Arrival Date': a.checkInDate || '',
          'Arrival Time': a.checkInTime || '',
          'Checked In By': a.checkedInBy || ''
        }));
        break;

      case 'not_arrived':
        sheetTitle = 'Not_Yet_Arrived';
        rows = attendees.filter(a => a.checkInStatus !== 'Checked In' && a.registrationStatus !== 'Cancelled').map(a => ({
          'Registration ID': a.registrationId,
          'Full Name': a.fullName,
          'Phone': a.phoneNumber,
          'Church': a.churchAssembly,
          'Payment Status': a.paymentStatus,
          'Transport Required': a.transportRequired ? 'Yes' : 'No'
        }));
        break;

      case 'transport':
        sheetTitle = 'Transport_Manifest';
        rows = attendees.filter(a => a.transportRequired && a.registrationStatus !== 'Cancelled').map(a => ({
          'Registration ID': a.registrationId,
          'Full Name': a.fullName,
          'Phone': a.phoneNumber,
          'Church': a.churchAssembly,
          'District': a.districtZone || '',
          'Emergency Phone': a.emergencyContactPhone
        }));
        break;

      case 'dietary':
        sheetTitle = 'Dietary_Manifest';
        rows = attendees.filter(a => (a.dietaryRequirements?.trim() || a.allergies?.trim()) && a.registrationStatus !== 'Cancelled').map(a => ({
          'Registration ID': a.registrationId,
          'Full Name': a.fullName,
          'Church': a.churchAssembly,
          'Dietary Requirements': a.dietaryRequirements || 'Standard',
          'Allergies': a.allergies || 'None'
        }));
        break;

      case 'activities':
        sheetTitle = 'Optional_Activities';
        rows = attendees.filter(a => a.optionalActivities && a.optionalActivities.length > 0 && a.registrationStatus !== 'Cancelled').map(a => ({
          'Registration ID': a.registrationId,
          'Full Name': a.fullName,
          'Phone': a.phoneNumber,
          'Activities': a.optionalActivities.join(', ')
        }));
        break;

      case 'emergency':
        sheetTitle = 'Emergency_Contact_List';
        rows = attendees.map(a => ({
          'Registration ID': a.registrationId,
          'Full Name': a.fullName,
          'Age': a.age,
          'Phone': a.phoneNumber,
          'Emergency Contact': a.emergencyContactName,
          'Emergency Phone': a.emergencyContactPhone,
          'Guardian (Minors)': a.parentGuardianName || '',
          'Guardian Phone': a.parentGuardianPhone || '',
          'Confidential Medical Notes': a.medicalNotes || 'None'
        }));
        break;
    }

    if (rows.length === 0) {
      showToast('warning', 'No records found for this report filter.');
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetTitle);

    const nowStr = new Date().toISOString().slice(0, 10);
    const filename = `Camp2026_${sheetTitle}_${nowStr}.${format}`;

    if (format === 'csv') {
      const csv = XLSX.utils.sheet_to_csv(worksheet);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      downloadBlob(blob, filename);
    } else {
      const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      downloadBlob(blob, filename);
    }

    showToast('success', `Exported ${rows.length} rows to ${filename}`);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* Title */}
      <div>
        <h2 className="text-xl font-black text-slate-900 flex items-center space-x-2">
          <FileSpreadsheet className="w-6 h-6 text-teal-600" />
          <span>Reports & Spreadsheet Exports</span>
        </h2>
        <p className="text-xs text-slate-500">
          Generate targeted operational rosters and export directly to Excel (XLSX) or CSV.
        </p>
      </div>

      {/* Reports Grid matching Section 17 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {reportDefinitions.map(report => {
          if (report.adminOnly && !isAdmin) return null;

          return (
            <div
              key={report.id}
              className="bg-white rounded-2xl p-5 shadow-xs border border-slate-200 flex flex-col justify-between hover:border-teal-300 transition"
            >
              <div className="space-y-2">
                <div className="flex items-center space-x-2.5">
                  <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                    {report.icon}
                  </div>
                  <h3 className="font-bold text-sm text-slate-900 leading-tight">
                    {report.title}
                  </h3>
                </div>
                <p className="text-xs text-slate-500">{report.desc}</p>
              </div>

              <div className="pt-4 mt-4 border-t border-slate-100 flex items-center space-x-2">
                <button
                  onClick={() => handleExport(report.id, 'xlsx')}
                  className="flex-1 flex items-center justify-center space-x-1.5 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition active:scale-95 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Excel (.xlsx)</span>
                </button>
                <button
                  onClick={() => handleExport(report.id, 'csv')}
                  className="flex-1 flex items-center justify-center space-x-1.5 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition active:scale-95 cursor-pointer"
                >
                  <span>CSV</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
};
