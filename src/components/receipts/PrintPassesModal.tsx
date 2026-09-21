import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Printer, X, Scissors, Tent } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { Attendee } from '../../types';

interface PrintPassesModalProps {
  attendees: Attendee[] | null;
  onClose: () => void;
}

export const PrintPassesModal: React.FC<PrintPassesModalProps> = ({ attendees, onClose }) => {
  const { settings } = useApp();

  if (!attendees || attendees.length === 0) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-xs flex flex-col items-center justify-start p-2 sm:p-6 print:p-0 print:bg-white">
      
      {/* Screen Control Bar (Hidden when printing) */}
      <div className="no-print bg-slate-900 text-white rounded-2xl p-4 max-w-2xl w-full mb-4 shadow-xl border border-slate-800 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-base flex items-center space-x-2">
            <Printer className="w-5 h-5 text-teal-400" />
            <span>Print Passes ({attendees.length} pass{attendees.length > 1 ? 'es' : ''})</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Compact ticket strip format (3–4 passes per A4 sheet with cut lines).
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={handlePrint}
            className="flex items-center space-x-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-sm font-bold shadow transition active:scale-95 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print Now</span>
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Printable Area - 3 to 4 Passes Per Sheet */}
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl p-4 sm:p-6 print:p-0 print:shadow-none print:max-w-none print:w-full space-y-4">
        {attendees.map((attendee, index) => (
          <div key={attendee.id} className="print-pass-card border-2 border-dashed border-slate-300 rounded-xl p-4 bg-white relative">
            
            {/* Cut indicator line */}
            <div className="flex items-center justify-between mb-2 text-[10px] text-slate-400 font-mono tracking-widest no-print">
              <span className="flex items-center space-x-1">
                <Scissors className="w-3 h-3" />
                <span>CUT HERE</span>
              </span>
              <span>PASS #{index + 1} OF {attendees.length}</span>
            </div>

            {/* Pass Content Grid */}
            <div className="flex items-center justify-between space-x-4">
              {/* Left Column: Camp details & Attendee Name */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-1.5 text-teal-700 mb-1">
                  <Tent className="w-4 h-4 flex-shrink-0" />
                  <span className="text-xs font-black uppercase tracking-tight">{settings.campName}</span>
                </div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded inline-block mb-1.5">
                  Registration Confirmed
                </div>

                <div className="text-base font-extrabold text-slate-900 truncate">
                  {attendee.fullName}
                </div>
                <div className="text-xs text-slate-600 truncate">
                  {attendee.churchAssembly}
                </div>

                <div className="mt-2 flex items-center space-x-3 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase font-medium">Reg ID</span>
                    <span className="font-mono font-black text-sm text-teal-800">{attendee.registrationId}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase font-medium">Paid</span>
                    <span className="font-bold text-slate-900">US${attendee.amountPaid.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase font-medium">Status</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      attendee.paymentStatus === 'Paid / Confirmed'
                        ? 'bg-emerald-100 text-emerald-800'
                        : attendee.paymentStatus === 'Part Paid'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                    }`}>
                      {attendee.paymentStatus}
                    </span>
                  </div>
                </div>

                <div className="mt-2 text-[9px] text-slate-500">
                  Venue: <strong>{settings.venue}</strong> • Transport and optional activities separate.
                </div>
              </div>

              {/* Right Column: High-contrast QR Code */}
              <div className="flex-shrink-0 flex flex-col items-center justify-center p-2 bg-slate-50 border border-slate-200 rounded-lg">
                <QRCodeSVG
                  value={attendee.verificationToken || attendee.registrationId}
                  size={100}
                  level="M"
                  includeMargin={true}
                />
                <span className="text-[9px] font-bold text-slate-600 mt-1 uppercase tracking-tight">
                  Scan at Gate
                </span>
              </div>
            </div>

            {/* Subtle scissor cut guide for print */}
            {index < attendees.length - 1 && (
              <div className="print-only pt-3 text-[8px] text-slate-400 flex items-center space-x-2">
                <Scissors className="w-2.5 h-2.5" />
                <span className="tracking-widest">------------------------------------------------------------------------------------------------------------------------</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
