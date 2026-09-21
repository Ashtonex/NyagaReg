import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import confetti from 'canvas-confetti';
import { 
  Camera, 
  Search, 
  CheckCircle2, 
  AlertOctagon, 
  X, 
  UserCheck, 
  AlertCircle, 
  DollarSign, 
  Building, 
  Phone 
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { db, parseQrVerificationToken, logAuditEvent } from '../../db/db';
import type { Attendee } from '../../types';

export const CheckInScannerView: React.FC = () => {
  const { activeStaffName, activeRole, showToast, openPayment } = useApp();

  // Scanner state
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);

  // Search & Found Attendee state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<Attendee[]>([]);
  const [scannedAttendee, setScannedAttendee] = useState<Attendee | null>(null);
  const [isProcessingCheckIn, setIsProcessingCheckIn] = useState<boolean>(false);

  // Duplicate Check-In Alert state
  const [duplicateAlert, setDuplicateAlert] = useState<boolean>(false);
  const [checkInSuccess, setCheckInSuccess] = useState<boolean>(false);

  // Admin Override Modal state
  const [showOverrideModal, setShowOverrideModal] = useState<boolean>(false);
  const [overrideReason, setOverrideReason] = useState<string>('');

  useEffect(() => {
    return () => {
      stopCameraScanner();
    };
  }, []);

  const startCameraScanner = async () => {
    setScannerError(null);
    setDuplicateAlert(false);
    setCheckInSuccess(false);

    try {
      if (!html5QrCodeRef.current) {
        html5QrCodeRef.current = new Html5Qrcode('qr-reader-container');
      }

      await html5QrCodeRef.current.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 }
        },
        onScanSuccess,
        onScanFailure
      );
      setIsScanning(true);
    } catch (err: any) {
      console.error('Camera access error:', err);
      setScannerError('Could not access camera. Please allow camera permissions or use manual search below.');
      setIsScanning(false);
    }
  };

  const stopCameraScanner = async () => {
    if (html5QrCodeRef.current && isScanning) {
      try {
        await html5QrCodeRef.current.stop();
      } catch (err) {
        console.error('Error stopping scanner:', err);
      }
      setIsScanning(false);
    }
  };

  const onScanSuccess = async (decodedText: string) => {
    await stopCameraScanner();

    // Parse verification token safely
    const { token, isToken, isDirectRegId } = parseQrVerificationToken(decodedText);

    let attendee: Attendee | undefined;

    if (isToken) {
      attendee = await db.attendees.where('verificationToken').equals(token).first();
    } else if (isDirectRegId) {
      attendee = await db.attendees.where('registrationId').equals(token).first();
    } else {
      // Fallback search by token or registrationId
      attendee = await db.attendees.where('verificationToken').equals(decodedText).first();
      if (!attendee) {
        attendee = await db.attendees.where('registrationId').equals(decodedText).first();
      }
    }

    if (!attendee) {
      showToast('error', 'Unrecognized or unknown QR code. Attendee record not found.');
      return;
    }

    if (attendee.registrationStatus === 'Cancelled') {
      showToast('error', `Registration ${attendee.registrationId} (${attendee.fullName}) was CANCELLED. Check-in denied.`);
      return;
    }

    handleAttendeeFound(attendee);
  };

  const onScanFailure = () => {
    // Normal frame scanning misses
  };

  const handleAttendeeFound = (attendee: Attendee) => {
    setScannedAttendee(attendee);
    setCheckInSuccess(false);

    // Duplicate Check-In detection!
    if (attendee.checkInStatus === 'Checked In') {
      setDuplicateAlert(true);
    } else {
      setDuplicateAlert(false);
    }
  };

  // Real-time manual search
  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    const q = query.trim().toLowerCase();
    const results = await db.attendees
      .filter(a => 
        a.registrationId.toLowerCase().includes(q) ||
        a.fullName.toLowerCase().includes(q) ||
        a.phoneNumber.toLowerCase().includes(q) ||
        a.churchAssembly.toLowerCase().includes(q)
      )
      .limit(6)
      .toArray();

    setSearchResults(results);
  };

  const handleCheckIn = async (overrideReasonText?: string) => {
    if (!scannedAttendee) return;
    setIsProcessingCheckIn(true);

    try {
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10);
      const timeStr = now.toTimeString().slice(0, 5);

      const updated: Partial<Attendee> = {
        checkInStatus: 'Checked In',
        checkInDate: dateStr,
        checkInTime: timeStr,
        checkedInBy: activeStaffName,
        updatedAt: now.toISOString(),
        syncStatus: 'Saved Locally'
      };

      await db.attendees.update(scannedAttendee.id, updated);

      if (overrideReasonText) {
        await logAuditEvent(
          'Check-in override',
          `Admin check-in override for ${scannedAttendee.fullName} (${scannedAttendee.registrationId}). Reason: ${overrideReasonText}`,
          scannedAttendee.registrationId,
          scannedAttendee.id,
          { overrideReason: overrideReasonText, originalTime: `${scannedAttendee.checkInDate} ${scannedAttendee.checkInTime}` }
        );
      } else {
        await logAuditEvent(
          'Checked in',
          `Checked in ${scannedAttendee.fullName} at ${dateStr} ${timeStr}`,
          scannedAttendee.registrationId,
          scannedAttendee.id
        );
      }

      // Refresh attendee
      const refreshed = await db.attendees.get(scannedAttendee.id);
      setScannedAttendee(refreshed || null);
      setDuplicateAlert(false);
      setCheckInSuccess(true);
      setShowOverrideModal(false);
      setOverrideReason('');

      confetti({
        particleCount: 60,
        spread: 60,
        origin: { y: 0.7 }
      });

      showToast('success', `${scannedAttendee.fullName} (${scannedAttendee.registrationId}) CHECKED IN!`, 'Gate Arrival Confirmed');
    } catch (err: any) {
      console.error('Check-in error:', err);
      showToast('error', `Failed to check in: ${err.message || err}`);
    } finally {
      setIsProcessingCheckIn(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      
      {/* Title & Mode */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center space-x-2">
            <UserCheck className="w-6 h-6 text-teal-600" />
            <span>CHECK-IN MODE</span>
          </h2>
          <p className="text-xs text-slate-500">
            Offline QR scanner and gate arrival verification.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-[11px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full border border-emerald-300">
            Staff: {activeStaffName} ({activeRole})
          </span>
        </div>
      </div>

      {/* Primary Scanner Action Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6 text-center space-y-4">
        
        {/* Camera Viewport */}
        <div 
          id="qr-reader-container" 
          className={`w-full max-w-sm mx-auto overflow-hidden rounded-2xl border-2 ${
            isScanning ? 'border-teal-500 bg-black min-h-[260px]' : 'hidden'
          }`}
        />

        {scannerError && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span>{scannerError}</span>
          </div>
        )}

        {!isScanning ? (
          <button
            onClick={startCameraScanner}
            className="w-full sm:w-auto min-w-[240px] py-4 px-6 bg-teal-600 hover:bg-teal-700 text-white rounded-2xl text-base font-black shadow-lg shadow-teal-600/20 transition active:scale-98 cursor-pointer inline-flex items-center justify-center space-x-3"
          >
            <Camera className="w-6 h-6" />
            <span>SCAN QR</span>
          </button>
        ) : (
          <button
            onClick={stopCameraScanner}
            className="py-2.5 px-5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition active:scale-95 cursor-pointer inline-flex items-center space-x-2"
          >
            <X className="w-4 h-4" />
            <span>Cancel Camera Scan</span>
          </button>
        )}

        {/* Manual Search Option */}
        <div className="pt-2 border-t border-slate-100">
          <label className="block text-xs font-semibold text-slate-500 mb-1.5 text-left">
            SEARCH ATTENDEE (Offline Manual Search):
          </label>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search by Full Name, Registration ID (e.g. PC-0027), Phone, or Church..."
              value={searchQuery}
              onChange={e => handleSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50"
            />
          </div>

          {/* Real-time search dropdown results */}
          {searchResults.length > 0 && (
            <div className="mt-2 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden divide-y divide-slate-100 text-left">
              {searchResults.map(a => (
                <div
                  key={a.id}
                  onClick={() => {
                    handleAttendeeFound(a);
                    setSearchResults([]);
                    setSearchQuery('');
                  }}
                  className="p-3 hover:bg-teal-50 cursor-pointer flex items-center justify-between transition"
                >
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-mono font-bold text-xs text-teal-800 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200">
                        {a.registrationId}
                      </span>
                      <span className="font-bold text-xs text-slate-900">{a.fullName}</span>
                      <span className="text-[11px] text-slate-500">({a.churchAssembly})</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      Phone: {a.phoneNumber} • Status: <strong>{a.paymentStatus}</strong>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      a.checkInStatus === 'Checked In' 
                        ? 'bg-emerald-100 text-emerald-800' 
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      {a.checkInStatus}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Scanned Attendee Card matching Section 10 */}
      {scannedAttendee && (
        <div className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-2">
          
          {/* Card Header */}
          <div className="flex items-center justify-between px-6 py-3 bg-slate-900 text-white">
            <div className="flex items-center space-x-2">
              <span className="font-mono text-xs font-bold text-teal-400 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                {scannedAttendee.registrationId}
              </span>
              <span className="text-xs font-semibold text-slate-300">Attendee Record</span>
            </div>
            <button
              onClick={() => {
                setScannedAttendee(null);
                setDuplicateAlert(false);
                setCheckInSuccess(false);
              }}
              className="p-1 rounded-md text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* DUPLICATE CHECK-IN WARNING ALERT (Section 11) */}
          {duplicateAlert && (
            <div className="bg-rose-50 border-b-2 border-rose-300 p-4 sm:p-5 text-rose-950 flex items-start space-x-3">
              <AlertOctagon className="w-8 h-8 text-rose-600 flex-shrink-0 mt-0.5 animate-bounce" />
              <div className="flex-1">
                <h3 className="text-sm font-black uppercase tracking-wider text-rose-900">
                  ALREADY CHECKED IN
                </h3>
                <p className="text-xs font-semibold mt-0.5 text-rose-800">
                  {scannedAttendee.fullName} ({scannedAttendee.registrationId}) has already checked in.
                </p>
                <div className="mt-1 font-mono text-xs font-bold bg-white/90 p-2 rounded-lg border border-rose-200 inline-block">
                  Original Check-In: {scannedAttendee.checkInDate} at {scannedAttendee.checkInTime} by {scannedAttendee.checkedInBy || 'Gate Staff'}
                </div>
                <p className="text-[11px] text-rose-700 mt-1">
                  Do not create a second check-in. Only an Administrator can override with a recorded reason.
                </p>

                {activeRole === 'ADMIN' && (
                  <div className="mt-2.5">
                    <button
                      onClick={() => setShowOverrideModal(true)}
                      className="px-3.5 py-1.5 bg-rose-700 hover:bg-rose-800 text-white rounded-lg text-xs font-bold shadow cursor-pointer"
                    >
                      Admin Override Check-In
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* CHECK-IN SUCCESSFUL BANNER */}
          {checkInSuccess && (
            <div className="bg-emerald-50 border-b border-emerald-200 p-4 text-emerald-950 flex items-center space-x-3">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 flex-shrink-0" />
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-emerald-900">
                  CHECK-IN SUCCESSFUL
                </h3>
                <p className="text-xs text-emerald-800">
                  Arrival confirmed for {scannedAttendee.fullName} ({scannedAttendee.registrationId}).
                </p>
              </div>
            </div>
          )}

          {/* Attendee Details Body */}
          <div className="p-6 space-y-4">
            
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-xl font-black text-slate-900">{scannedAttendee.fullName}</h3>
                <p className="text-xs text-slate-500 flex items-center space-x-1.5 mt-0.5">
                  <Building className="w-3.5 h-3.5 text-slate-400" />
                  <span>{scannedAttendee.churchAssembly}</span>
                  {scannedAttendee.districtZone && <span>• {scannedAttendee.districtZone}</span>}
                </p>
                <p className="text-xs text-slate-500 flex items-center space-x-1.5 mt-0.5">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <span>{scannedAttendee.phoneNumber}</span>
                </p>
              </div>

              <div className="text-right">
                <span className={`inline-block text-xs font-black uppercase tracking-wider px-3 py-1 rounded-full ${
                  scannedAttendee.paymentStatus === 'Paid / Confirmed'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : scannedAttendee.paymentStatus === 'Part Paid'
                      ? 'bg-amber-100 text-amber-800 border border-amber-200'
                      : 'bg-rose-100 text-rose-800 border border-rose-200'
                }`}>
                  {scannedAttendee.paymentStatus}
                </span>
              </div>
            </div>

            {/* Financial Status Box */}
            <div className="grid grid-cols-3 gap-2 bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Camp Fee</span>
                <span className="text-xs font-bold text-slate-800">US${scannedAttendee.amountDue.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Amount Paid</span>
                <span className="text-xs font-bold text-emerald-600">US${scannedAttendee.amountPaid.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Outstanding</span>
                <span className={`text-xs font-bold ${scannedAttendee.balance > 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                  US${scannedAttendee.balance.toFixed(2)}
                </span>
              </div>
            </div>

            {/* If balance outstanding, offer Quick Payment button */}
            {scannedAttendee.balance > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs">
                <div className="text-amber-900 font-medium">
                  Outstanding balance of <strong>US${scannedAttendee.balance.toFixed(2)}</strong> remaining.
                </div>
                <button
                  onClick={() => openPayment(scannedAttendee)}
                  className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg transition active:scale-95 cursor-pointer flex items-center space-x-1"
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  <span>Collect Payment</span>
                </button>
              </div>
            )}

            {/* Check-In Action Button */}
            {scannedAttendee.checkInStatus !== 'Checked In' ? (
              <div className="pt-2">
                <button
                  onClick={() => handleCheckIn()}
                  disabled={isProcessingCheckIn}
                  className="w-full py-4 px-6 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-lg font-black tracking-wide shadow-lg shadow-emerald-600/20 transition active:scale-98 cursor-pointer flex items-center justify-center space-x-3 disabled:opacity-50"
                >
                  <CheckCircle2 className="w-6 h-6" />
                  <span>{isProcessingCheckIn ? 'RECORDING CHECK-IN...' : 'CHECK IN'}</span>
                </button>
              </div>
            ) : (
              <div className="p-3 bg-slate-100 rounded-xl text-center text-xs font-semibold text-slate-600">
                Gate Arrival Recorded on {scannedAttendee.checkInDate} at {scannedAttendee.checkInTime} by {scannedAttendee.checkedInBy || 'Gate Staff'}
              </div>
            )}

          </div>

        </div>
      )}

      {/* Admin Override Modal with required Reason */}
      {showOverrideModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-rose-900 flex items-center space-x-2">
              <AlertOctagon className="w-5 h-5 text-rose-600" />
              <span>Admin Check-In Override</span>
            </h3>
            <p className="text-xs text-slate-600">
              An override creates an immutable audit entry recording your Admin identity, timestamp, and reason.
            </p>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Reason for Override: *
              </label>
              <textarea
                rows={3}
                required
                placeholder="e.g. Scanned accidentally earlier during wristband distribution test; attendee is arriving now."
                value={overrideReason}
                onChange={e => setOverrideReason(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-rose-500 focus:outline-none"
              />
            </div>
            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => {
                  setShowOverrideModal(false);
                  setOverrideReason('');
                }}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!overrideReason.trim()) {
                    showToast('error', 'Please provide a reason for the override.');
                    return;
                  }
                  handleCheckIn(overrideReason.trim());
                }}
                className="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Confirm & Log Override
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
