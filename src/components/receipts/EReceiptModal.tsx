import React, { useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { 
  X, 
  Printer, 
  CheckCircle, 
  Tent, 
  Copy, 
  Smartphone,
  Globe,
  Image as ImageIcon,
  Share2,
  Download,
  ExternalLink,
  Loader2
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { Attendee } from '../../types';
import { 
  downloadAttendeeReceiptPDF, 
  openAttendeeReceiptPDFInNewTab,
  downloadPassImage, 
  copyPassImageToClipboard,
  sharePassImage 
} from './passGenerator';

interface EReceiptModalProps {
  attendee: Attendee | null;
  onClose: () => void;
  onPrint?: (attendee: Attendee) => void;
}

export const EReceiptModal: React.FC<EReceiptModalProps> = ({ attendee, onClose, onPrint }) => {
  const { settings, showToast } = useApp();
  const receiptCardRef = useRef<HTMLDivElement>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  if (!attendee) return null;

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const canCopyImage = typeof navigator !== 'undefined' && !!navigator.clipboard && typeof ClipboardItem !== 'undefined';

  const safePaid = Number(attendee.amountPaid || 0);
  const safeDue = Number(attendee.amountDue || 35);
  const safeBalance = Number(attendee.balance !== undefined ? attendee.balance : Math.max(0, safeDue - safePaid));

  const getReceiptText = () => {
    return (
      `*${settings.campName || 'Provincial Camp 2026'}*\n` +
      `*OFFICIAL REGISTRATION RECEIPT & PASS*\n\n` +
      `Attendee: *${attendee.fullName}*\n` +
      `Registration ID: *${attendee.registrationId}*\n` +
      `Amount Paid: *US$${safePaid.toFixed(2)}*\n` +
      `Payment Status: *${attendee.paymentStatus}*\n` +
      (safeBalance > 0 ? `Outstanding Balance: *US$${safeBalance.toFixed(2)}*\n` : '') +
      `Church Assembly: *${attendee.churchAssembly || 'General'}*\n` +
      `Venue: *${settings.venue || 'WildGeo Nyanga'}*\n\n` +
      `*Present this registration ID or QR code at camp check-in.*\n` +
      `_Transport and optional activities are separate from the standard camp fee._`
    );
  };

  const getCleanPhone = () => {
    if (!attendee.phoneNumber) return '';
    let digits = attendee.phoneNumber.replace(/\D/g, '');
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

  // WhatsApp Web & App URLs
  const whatsAppWebUrl = phone
    ? `https://web.whatsapp.com/send/?phone=${phone}&text=${encodedText}`
    : `https://web.whatsapp.com/send/?text=${encodedText}`;

  const whatsAppAppUrl = phone
    ? `https://wa.me/${phone}?text=${encodedText}`
    : `https://wa.me/?text=${encodedText}`;

  // 1. Direct PDF Download
  const handleDownloadPDF = () => {
    try {
      setIsGeneratingPdf(true);
      downloadAttendeeReceiptPDF(attendee, settings, qrCanvasRef.current);
      showToast('success', `PDF Receipt for ${attendee.registrationId} downloaded!`, 'PDF Download');
    } catch (err: any) {
      console.error('PDF Generation Error:', err);
      // Fallback: try opening in new tab
      try {
        openAttendeeReceiptPDFInNewTab(attendee, settings, qrCanvasRef.current);
        showToast('info', 'PDF opened in new tab for saving / printing.', 'PDF Opened');
      } catch (fallbackErr: any) {
        showToast('error', `Failed to generate PDF: ${err.message || err}`);
      }
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // 2. Open PDF in New Tab
  const handleViewPDF = () => {
    try {
      openAttendeeReceiptPDFInNewTab(attendee, settings, qrCanvasRef.current);
      showToast('info', 'PDF pass opened in new tab.', 'PDF Preview');
    } catch (err: any) {
      console.error('PDF Preview Error:', err);
      showToast('error', `Could not open PDF: ${err.message || err}`);
    }
  };

  // 3. Direct PNG Image Download
  const handleDownloadImage = async () => {
    try {
      setIsGeneratingImage(true);
      await downloadPassImage(attendee, settings, qrCanvasRef.current);
      showToast('success', `Pass image (.png) for ${attendee.registrationId} saved!`, 'Image Saved');
    } catch (err: any) {
      console.error('Image Generation Error:', err);
      showToast('error', `Failed to generate image: ${err.message || err}`);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // 4. Copy PNG Image to Clipboard (Ideal for WhatsApp Web Ctrl+V)
  const handleCopyImageToClipboard = async () => {
    try {
      setIsGeneratingImage(true);
      const copied = await copyPassImageToClipboard(attendee, settings, qrCanvasRef.current);
      if (copied) {
        showToast('success', 'Pass image copied to clipboard! Paste directly into WhatsApp (Ctrl+V).', 'Image Copied');
      } else {
        // Fallback to downloading
        await downloadPassImage(attendee, settings, qrCanvasRef.current);
        showToast('info', 'Clipboard image copy unavailable; pass downloaded instead.', 'Image Downloaded');
      }
    } catch (err: any) {
      console.error('Copy image error:', err);
      showToast('error', 'Could not copy image to clipboard.');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // 5. Mobile Web Share (directly into WhatsApp / Photos)
  const handleShareImage = async () => {
    try {
      setIsSharing(true);
      const res = await sharePassImage(attendee, settings, qrCanvasRef.current);
      if (res.shared) {
        showToast('success', 'Pass image shared successfully!', 'Shared');
      } else if (res.downloaded) {
        showToast('info', 'Pass image saved to Downloads folder.', 'Image Saved');
      }
    } catch (err: any) {
      console.error('Share Error:', err);
      showToast('error', `Share failed: ${err.message || err}`);
    } finally {
      setIsSharing(false);
    }
  };

  // WhatsApp click handlers
  const handleWhatsAppWebClick = async () => {
    try {
      await navigator.clipboard.writeText(receiptText);
      showToast('success', 'Opening WhatsApp Web. Pass text copied to clipboard!', 'WhatsApp Web');
    } catch {
      showToast('info', 'Opening WhatsApp Web...', 'WhatsApp Web');
    }
  };

  const handleWhatsAppAppClick = async () => {
    try {
      await navigator.clipboard.writeText(receiptText);
      showToast('success', 'Launching WhatsApp. Pass text copied to clipboard!', 'WhatsApp App');
    } catch {
      showToast('info', 'Launching WhatsApp...', 'WhatsApp App');
    }
  };

  // Copy plain text receipt to clipboard
  const handleCopyReceiptText = async () => {
    try {
      await navigator.clipboard.writeText(getReceiptText());
      showToast('success', 'E-Receipt text copied to clipboard! Paste into SMS or messaging apps.', 'Copied');
    } catch {
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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="relative bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-4 max-h-[95vh] flex flex-col">
        
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900 text-white flex-shrink-0">
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold uppercase tracking-wider">Official E-Receipt / Pass</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Container */}
        <div className="overflow-y-auto flex-1">
          {/* Printable & Shareable Pass Card */}
          <div ref={receiptCardRef} className="p-5 text-center bg-white space-y-3">
            {/* Header */}
            <div className="border-b border-slate-200 pb-2.5">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-teal-50 text-teal-700 mb-1.5">
                <Tent className="w-5 h-5" />
              </div>
              <h2 className="text-base font-black tracking-tight text-slate-900 uppercase">
                {settings.campName || 'Provincial Camp 2026'}
              </h2>
              <div className="inline-block px-2.5 py-0.5 mt-1 rounded-full text-[10px] font-bold tracking-wider uppercase bg-emerald-100 text-emerald-800">
                REGISTRATION CONFIRMED
              </div>
            </div>

            {/* Attendee Details */}
            <div className="space-y-0.5">
              <div className="text-lg font-extrabold text-slate-900 leading-tight">
                {attendee.fullName}
              </div>
              <div className="font-mono text-base font-black text-teal-700 tracking-wider">
                {attendee.registrationId}
              </div>
              <div className="text-xs text-slate-600 font-medium">
                {attendee.churchAssembly}
              </div>
              {attendee.phoneNumber && (
                <div className="text-xs font-mono text-slate-500">
                  {attendee.phoneNumber}
                </div>
              )}
            </div>

            {/* Financial summary box */}
            <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200 text-xs space-y-1">
              <div className="flex justify-between text-slate-600">
                <span>Amount Paid:</span>
                <strong className="text-emerald-700 font-bold font-mono">
                  US${safePaid.toFixed(2)}
                </strong>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Payment Status:</span>
                <strong className="text-slate-900 font-bold">
                  {attendee.paymentStatus}
                </strong>
              </div>
              {safeBalance > 0 && (
                <div className="flex justify-between text-amber-700 font-semibold pt-1 border-t border-slate-200">
                  <span>Balance Due:</span>
                  <span className="font-mono font-bold">US${safeBalance.toFixed(2)}</span>
                </div>
              )}
            </div>

            {/* High-definition QR Code Canvas */}
            <div className="flex flex-col items-center justify-center p-3 bg-white border border-slate-200 rounded-xl shadow-xs">
              <QRCodeCanvas
                ref={qrCanvasRef}
                id={`receipt-qr-${attendee.registrationId}`}
                value={attendee.verificationToken || attendee.registrationId}
                size={160}
                level="M"
                includeMargin={true}
                className="rounded-lg max-w-full"
              />
              <p className="text-[11px] font-bold text-slate-700 mt-2">
                Present this QR code at camp check-in.
              </p>
              <p className="text-[9px] font-mono text-slate-400">
                ID: {attendee.registrationId}
              </p>
            </div>

            {/* Footer Notes */}
            <div className="text-[10px] text-slate-500 space-y-0.5 border-t border-slate-200 pt-2.5">
              <p className="font-semibold text-slate-700">Venue: {settings.venue}</p>
              <p>Transport & optional activities are separate from standard fee.</p>
            </div>
          </div>

          {/* Action Panel: Download PDF, Save Image, Share, WhatsApp & Print */}
          <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-3">
            
            {/* Section 1: Official PDF & Image Files */}
            <div className="space-y-1.5">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 text-center">
                1. Official Receipt & Pass Files
              </div>

              {/* PDF Row: Download & View in New Tab */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleDownloadPDF}
                  disabled={isGeneratingPdf}
                  className="flex items-center justify-center space-x-1.5 py-2.5 px-2.5 bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs transition active:scale-95 cursor-pointer"
                  title="Download official PDF receipt file directly"
                >
                  {isGeneratingPdf ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  <span>Download PDF</span>
                </button>

                <button
                  onClick={handleViewPDF}
                  className="flex items-center justify-center space-x-1.5 py-2.5 px-2.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 rounded-xl text-xs font-bold shadow-xs transition active:scale-95 cursor-pointer"
                  title="Open official PDF in browser tab to view, print, or share"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-teal-700" />
                  <span>View / Print PDF</span>
                </button>
              </div>

              {/* Image Row: Download PNG & Copy for WhatsApp */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleDownloadImage}
                  disabled={isGeneratingImage}
                  className="flex items-center justify-center space-x-1.5 py-2.5 px-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs transition active:scale-95 cursor-pointer"
                  title="Download high-resolution pass image (.png)"
                >
                  {isGeneratingImage ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ImageIcon className="w-3.5 h-3.5" />
                  )}
                  <span>Save PNG Pass</span>
                </button>

                {canCopyImage ? (
                  <button
                    onClick={handleCopyImageToClipboard}
                    disabled={isGeneratingImage}
                    className="flex items-center justify-center space-x-1.5 py-2.5 px-2.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 rounded-xl text-xs font-bold transition active:scale-95 cursor-pointer"
                    title="Copy PNG image to clipboard to paste directly into WhatsApp Web (Ctrl+V)"
                  >
                    <Copy className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Copy Image (Ctrl+V)</span>
                  </button>
                ) : (
                  <button
                    onClick={handleDownloadImage}
                    className="flex items-center justify-center space-x-1.5 py-2.5 px-2.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-xl text-xs font-semibold transition active:scale-95 cursor-pointer"
                    title="Download pass image"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-500" />
                    <span>Download Image</span>
                  </button>
                )}
              </div>

              {/* Mobile Native Share Pass Button */}
              {canShare && (
                <button
                  onClick={handleShareImage}
                  disabled={isSharing}
                  className="w-full flex items-center justify-center space-x-1.5 py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs transition active:scale-95 cursor-pointer"
                  title="Share pass image directly to WhatsApp or messaging apps"
                >
                  {isSharing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Share2 className="w-3.5 h-3.5" />
                  )}
                  <span>Share Pass to WhatsApp / Apps</span>
                </button>
              )}
            </div>

            {/* Section 2: WhatsApp Messaging & Print */}
            <div className="space-y-1.5 pt-2 border-t border-slate-200">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 text-center">
                2. WhatsApp Chat & Print Options
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
                  title="Open in WhatsApp application on phone or desktop"
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
                  className="flex items-center justify-center space-x-1.5 py-2 px-3 bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 rounded-xl text-xs font-bold shadow-xs transition active:scale-95 cursor-pointer"
                  title="Print single pass"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-600" />
                  <span>Print Pass</span>
                </button>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
};
