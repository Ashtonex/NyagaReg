import React, { useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { 
  X, 
  Printer, 
  CheckCircle, 
  Tent, 
  Copy, 
  Smartphone,
  Globe
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

  const getReceiptText = () => {
    return (
      `*${settings.campName}*\n` +
      `*REGISTRATION CONFIRMED*\n\n` +
      `Attendee: *${attendee.fullName}*\n` +
      `Registration ID: *${attendee.registrationId}*\n` +
      `Amount Paid: *US$${attendee.amountPaid.toFixed(2)}*\n` +
      `Payment Status: *${attendee.paymentStatus}*\n` +
      (attendee.balance > 0 ? `Outstanding Balance: *US$${attendee.balance.toFixed(2)}*\n` : '') +
      `Venue: *${settings.venue}*\n\n` +
      `*Present this registration ID at camp check-in.*\n` +
      `_Transport and optional activities are separate from the standard camp fee._`
    );
  };

  const getCleanPhone = () => {
    if (!attendee.phoneNumber) return '';
    let digits = attendee.phoneNumber.replace(/\D/g, '');
    // Zimbabwean local phone conversion e.g. 0771234567 -> 263771234567 or 771234567 -> 263771234567
    if (digits.startsWith('0')) {
      digits = '263' + digits.slice(1);
    } else if (digits.length === 9 && digits.startsWith('7')) {
      digits = '263' + digits;
    }
    return digits;
  };

  const receiptText = getReceiptText();
  const encodedText = encodeURIComponent(receiptText);
  const phone = getCleanPhone();

  // 1. WhatsApp Web URL (trailing slash '/send/?' is required by WhatsApp Web router to keep query params)
  const whatsAppWebUrl = phone
    ? `https://web.whatsapp.com/send/?phone=${phone}&text=${encodedText}`
    : `https://web.whatsapp.com/send/?text=${encodedText}`;

  // 2. WhatsApp Universal Link (opens native WhatsApp app on Android/iOS/Windows without popup blocking)
  const whatsAppAppUrl = phone
    ? `https://wa.me/${phone}?text=${encodedText}`
    : `https://wa.me/?text=${encodedText}`;

  // Click handlers that ensure receipt text is copied to clipboard as backup
  const handleWhatsAppWebClick = async () => {
    try {
      await navigator.clipboard.writeText(receiptText);
      showToast('success', 'Opening WhatsApp Web. Pass text also copied to clipboard!', 'WhatsApp Web');
    } catch {
      showToast('info', 'Opening WhatsApp Web in new tab...', 'WhatsApp Web');
    }
  };

  const handleWhatsAppAppClick = async () => {
    try {
      await navigator.clipboard.writeText(receiptText);
      showToast('success', 'Opening WhatsApp. Pass text also copied to clipboard!', 'WhatsApp App');
    } catch {
      showToast('info', 'Launching WhatsApp...', 'WhatsApp App');
    }
  };

  // Copy plain text receipt to clipboard
  const handleCopyReceiptText = async () => {
    try {
      await navigator.clipboard.writeText(getReceiptText());
      showToast('success', 'E-Receipt text copied to clipboard! Paste into WhatsApp or SMS.', 'Copied');
    } catch (e) {
      showToast('error', 'Could not copy text to clipboard.');
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
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
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
            <div className="text-xs font-mono text-slate-400">
              {attendee.phoneNumber}
            </div>
          </div>

          {/* Financial summary box */}
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-xs space-y-1">
            <div className="flex justify-between text-slate-600">
              <span>Amount Paid:</span>
              <strong className="text-emerald-700 font-bold font-mono">
                US${attendee.amountPaid.toFixed(2)}
              </strong>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Payment Status:</span>
              <strong className="text-slate-900 font-bold">
                {attendee.paymentStatus}
              </strong>
            </div>
            {attendee.balance > 0 && (
              <div className="flex justify-between text-amber-700 font-semibold pt-1 border-t border-slate-200">
                <span>Balance Due:</span>
                <span className="font-mono font-bold">US${attendee.balance.toFixed(2)}</span>
              </div>
            )}
          </div>

          {/* Safe QR code - contains ONLY random verification token or ID */}
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

        {/* WhatsApp & Print Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-2">
          
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 text-center">
            Share E-Receipt / Pass
          </div>

          {/* WhatsApp Web & Native App Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <a
              href={whatsAppWebUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleWhatsAppWebClick}
              className="flex items-center justify-center space-x-1.5 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition active:scale-95 cursor-pointer no-underline text-center"
              title="Open directly in WhatsApp Web in browser"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>WhatsApp Web</span>
            </a>

            <a
              href={whatsAppAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleWhatsAppAppClick}
              className="flex items-center justify-center space-x-1.5 py-2 px-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-xs transition active:scale-95 cursor-pointer no-underline text-center"
              title="Open in WhatsApp application or mobile"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>WhatsApp App</span>
            </a>
          </div>

          {/* Copy Text & Print Pass Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleCopyReceiptText}
              className="flex items-center justify-center space-x-1.5 py-2 px-3 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-xl text-xs font-semibold transition active:scale-95 cursor-pointer"
              title="Copy receipt message text to clipboard"
            >
              <Copy className="w-3.5 h-3.5 text-slate-500" />
              <span>Copy Text</span>
            </button>

            <button
              onClick={handlePrintSingle}
              className="flex items-center justify-center space-x-1.5 py-2 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-xs transition active:scale-95 cursor-pointer"
              title="Print single pass"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Pass</span>
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
