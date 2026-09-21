import React, { useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { 
  X, 
  Printer, 
  Share2, 
  CheckCircle, 
  Tent, 
  ExternalLink 
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { Attendee } from '../../types';

interface EReceiptModalProps {
  attendee: Attendee | null;
  onClose: () => void;
  onPrint?: (attendee: Attendee) => void;
}

export const EReceiptModal: React.FC<EReceiptModalProps> = ({ attendee, onClose, onPrint }) => {
  const { settings, showToast } = useApp();
  const receiptCardRef = useRef<HTMLDivElement>(null);

  if (!attendee) return null;

  const handleShareWhatsApp = () => {
    const text = `*${settings.campName}*\n*REGISTRATION CONFIRMED*\n\n` +
      `Attendee: *${attendee.fullName}*\n` +
      `Registration ID: *${attendee.registrationId}*\n` +
      `Amount Paid: *US$${attendee.amountPaid.toFixed(2)}*\n` +
      `Payment Status: *${attendee.paymentStatus}*\n` +
      (attendee.balance > 0 ? `Outstanding Balance: *US$${attendee.balance.toFixed(2)}*\n` : '') +
      `Venue: *${settings.venue}*\n\n` +
      `*Present this QR code at camp check-in.*\n` +
      `_Transport and optional activities are separate from the standard camp fee._`;

    const encoded = encodeURIComponent(text);
    const cleanPhone = attendee.phoneNumber ? attendee.phoneNumber.replace(/[^0-9]/g, '') : '';
    const url = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
    window.open(url, '_blank');
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${settings.campName} - ${attendee.registrationId}`,
          text: `PROVINCIAL CAMP 2026 - REGISTRATION CONFIRMED\n\n${attendee.fullName} (${attendee.registrationId})\nAmount Paid: US$${attendee.amountPaid.toFixed(2)}\nStatus: ${attendee.paymentStatus}\nVenue: ${settings.venue}\n\nPresent this QR code at camp check-in.\nTransport and optional activities are separate from the standard camp fee.`,
        });
        showToast('success', 'Pass shared successfully');
      } catch (err) {
        // User cancelled share
      }
    } else {
      handleShareWhatsApp();
    }
  };

  const handlePrintSingle = () => {
    if (onPrint) {
      onPrint(attendee);
    } else {
      window.print();
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="relative bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900 text-white">
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold uppercase tracking-wider">Official E-Receipt / Pass</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Printable & Shareable Pass Card matching Section 9 */}
        <div ref={receiptCardRef} className="p-6 text-center bg-white space-y-4">
          {/* Header */}
          <div className="border-b border-slate-200 pb-3">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-teal-50 text-teal-700 mb-2">
              <Tent className="w-5 h-5" />
            </div>
            <h2 className="text-base font-black tracking-tight text-slate-900 uppercase">
              {settings.campName}
            </h2>
            <div className="inline-block px-2.5 py-0.5 mt-1 rounded-full text-[11px] font-bold tracking-wider uppercase bg-emerald-100 text-emerald-800">
              REGISTRATION CONFIRMED
            </div>
          </div>

          {/* Attendee Details */}
          <div className="space-y-1">
            <div className="text-lg font-extrabold text-slate-900 leading-snug">
              {attendee.fullName}
            </div>
            <div className="font-mono text-base font-bold text-teal-700 tracking-wider">
              {attendee.registrationId}
            </div>
            <div className="text-xs text-slate-500">
              {attendee.churchAssembly}
            </div>
          </div>

          {/* Payment Details Box */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-xs space-y-1.5">
            <div className="flex justify-between items-center text-slate-600">
              <span>Amount Paid:</span>
              <span className="font-bold text-slate-900 text-sm">US${attendee.amountPaid.toFixed(2)}</span>
            </div>
            {attendee.balance > 0 && (
              <div className="flex justify-between items-center text-amber-700 font-medium">
                <span>Outstanding Balance:</span>
                <span className="font-bold">US${attendee.balance.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-1 border-t border-slate-200">
              <span className="text-slate-500">Payment Status:</span>
              <span className={`font-black uppercase tracking-wider text-[11px] px-2 py-0.5 rounded ${
                attendee.paymentStatus === 'Paid / Confirmed' 
                  ? 'bg-emerald-600 text-white' 
                  : attendee.paymentStatus === 'Part Paid' 
                    ? 'bg-amber-500 text-white' 
                    : 'bg-rose-600 text-white'
              }`}>
                {attendee.paymentStatus}
              </span>
            </div>
          </div>

          {/* Safe Random QR Code Token */}
          <div className="flex flex-col items-center justify-center p-3 bg-white border border-slate-200 rounded-xl shadow-xs">
            <QRCodeSVG
              value={attendee.verificationToken || attendee.registrationId}
              size={140}
              level="M"
              includeMargin={true}
              className="rounded"
            />
            <p className="text-[11px] font-bold text-slate-700 mt-2">
              Present this QR code at camp check-in.
            </p>
          </div>

          {/* Footer Notes matching Section 9 exactly */}
          <div className="text-[10px] text-slate-500 space-y-0.5 border-t border-slate-200 pt-3">
            <p className="font-semibold text-slate-700">Venue: {settings.venue}</p>
            <p>Transport and optional activities are separate from the standard camp fee.</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 grid grid-cols-2 gap-2">
          <button
            onClick={handleShareWhatsApp}
            className="flex items-center justify-center space-x-1.5 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow transition active:scale-95 cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Send WhatsApp</span>
          </button>
          <button
            onClick={handlePrintSingle}
            className="flex items-center justify-center space-x-1.5 py-2.5 px-3 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold shadow transition active:scale-95 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Pass</span>
          </button>
          <button
            onClick={handleNativeShare}
            className="col-span-2 flex items-center justify-center space-x-1.5 py-2 px-3 border border-slate-300 hover:bg-white text-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Share Receipt / Pass</span>
          </button>
        </div>

      </div>
    </div>
  );
};
