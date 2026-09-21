import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  X, 
  Receipt, 
  Printer, 
  CreditCard, 
  CheckCircle2, 
  RotateCcw, 
  Ban, 
  Edit3, 
  ShieldAlert, 
  History 
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { db, logAuditEvent, syncPersistentJsonDb } from '../../db/db';
import { syncSingleAttendeeToSupabase } from '../../db/supabaseSync';
import type { Attendee } from '../../types';

interface AttendeeProfileModalProps {
  attendee: Attendee | null;
  onClose: () => void;
  onOpenPayment: (attendee: Attendee) => void;
  onOpenReceipt: (attendee: Attendee) => void;
  onOpenPrintSingle: (attendee: Attendee) => void;
}

export const AttendeeProfileModal: React.FC<AttendeeProfileModalProps> = ({
  attendee,
  onClose,
  onOpenPayment,
  onOpenReceipt,
  onOpenPrintSingle
}) => {
  const { activeRole, activeStaffName, showToast } = useApp();
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editedNotes, setEditedNotes] = useState<string>(attendee?.notes || '');
  const [editedPhone, setEditedPhone] = useState<string>(attendee?.phoneNumber || '');
  const [editedChurch, setEditedChurch] = useState<string>(attendee?.churchAssembly || '');

  // Cancel & Undo Modal states
  const [showCancelModal, setShowCancelModal] = useState<boolean>(false);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [showUndoModal, setShowUndoModal] = useState<boolean>(false);
  const [undoReason, setUndoReason] = useState<string>('');

  // Live Query of Audit Trail for this attendee
  const auditLogs = useLiveQuery(
    () => (attendee ? db.auditLogs.where('registrationId').equals(attendee.registrationId).reverse().sortBy('timestamp') : []),
    [attendee?.registrationId]
  );

  if (!attendee) return null;

  const isMinor = attendee.age < 18;
  const isAdmin = activeRole === 'ADMIN';
  const isCancelled = attendee.registrationStatus === 'Cancelled';

  const handleCheckIn = async () => {
    if (isCancelled) {
      showToast('error', 'Cannot check in a cancelled attendee registration.');
      return;
    }

    try {
      const now = new Date();
      await db.attendees.update(attendee.id, {
        checkInStatus: 'Checked In',
        checkInDate: now.toISOString().slice(0, 10),
        checkInTime: now.toTimeString().slice(0, 5),
        checkedInBy: activeStaffName,
        updatedAt: now.toISOString()
      });
      await logAuditEvent('Checked in', `Checked in ${attendee.fullName} from profile view`, attendee.registrationId, attendee.id);
      await syncPersistentJsonDb();
      db.attendees.get(attendee.id).then(a => a && syncSingleAttendeeToSupabase(a)).catch(console.warn);
      showToast('success', `${attendee.fullName} marked as Checked In!`);
      onClose();
    } catch (err: any) {
      showToast('error', `Failed to check in: ${err.message || err}`);
    }
  };

  const handleUndoCheckIn = async () => {
    if (!isAdmin) {
      showToast('error', 'Only administrators can undo a completed check-in.');
      return;
    }
    if (!undoReason.trim()) {
      showToast('error', 'Please provide an administrator audit reason for reversing check-in.');
      return;
    }

    try {
      const now = new Date();
      await db.attendees.update(attendee.id, {
        checkInStatus: 'Not Checked In',
        checkInDate: null,
        checkInTime: null,
        checkedInBy: null,
        updatedAt: now.toISOString()
      });
      await logAuditEvent(
        'Check-in reversed', 
        `Check-in reversed for ${attendee.fullName} (${attendee.registrationId}). Reason: ${undoReason.trim()}`, 
        attendee.registrationId, 
        attendee.id,
        { undoReason: undoReason.trim() }
      );
      await syncPersistentJsonDb();
      db.attendees.get(attendee.id).then(a => a && syncSingleAttendeeToSupabase(a)).catch(console.warn);
      showToast('info', `Check-in reversed for ${attendee.fullName}`);
      setShowUndoModal(false);
      setUndoReason('');
      onClose();
    } catch (err: any) {
      showToast('error', `Failed to reverse check-in: ${err.message || err}`);
    }
  };

  const handleCancelRegistration = async () => {
    if (!isAdmin) {
      showToast('error', 'Only administrators can cancel registrations.');
      return;
    }
    if (!cancelReason.trim()) {
      showToast('error', 'Please provide a reason for cancelling this registration.');
      return;
    }

    try {
      const now = new Date().toISOString();
      await db.attendees.update(attendee.id, {
        registrationStatus: 'Cancelled',
        cancellationReason: cancelReason.trim(),
        cancelledAt: now,
        cancelledBy: activeStaffName,
        updatedAt: now
      });
      await logAuditEvent(
        'Registration cancelled', 
        `Registration cancelled for ${attendee.fullName} (${attendee.registrationId}). Reason: ${cancelReason.trim()}`,
        attendee.registrationId,
        attendee.id,
        { cancellationReason: cancelReason.trim() }
      );
      await syncPersistentJsonDb();
      db.attendees.get(attendee.id).then(a => a && syncSingleAttendeeToSupabase(a)).catch(console.warn);
      showToast('warning', `Registration ${attendee.registrationId} marked as Cancelled`);
      setShowCancelModal(false);
      setCancelReason('');
      onClose();
    } catch (err: any) {
      showToast('error', `Error cancelling registration: ${err.message || err}`);
    }
  };

  const handleSaveEdits = async () => {
    try {
      const now = new Date().toISOString();
      await db.attendees.update(attendee.id, {
        phoneNumber: editedPhone.trim(),
        churchAssembly: editedChurch.trim(),
        notes: editedNotes.trim(),
        updatedAt: now
      });
      await logAuditEvent('Record updated', `Updated contact details for ${attendee.fullName}`, attendee.registrationId, attendee.id);
      await syncPersistentJsonDb();
      db.attendees.get(attendee.id).then(a => a && syncSingleAttendeeToSupabase(a)).catch(console.warn);
      showToast('success', 'Attendee details updated successfully');
      setIsEditing(false);
    } catch (err: any) {
      showToast('error', `Error updating details: ${err.message || err}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="relative bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden my-6">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
          <div className="flex items-center space-x-3">
            <span className={`font-mono text-sm font-black px-2.5 py-1 rounded-lg border ${
              isCancelled ? 'bg-slate-800 text-slate-400 border-slate-700 line-through' : 'bg-slate-800 text-teal-400 border-slate-700'
            }`}>
              {attendee.registrationId}
            </span>
            <div>
              <h3 className="font-bold text-base leading-tight flex items-center space-x-2">
                <span>{attendee.fullName}</span>
                {isCancelled && (
                  <span className="text-[10px] uppercase font-bold bg-rose-950 text-rose-300 border border-rose-800 px-2 py-0.5 rounded">
                    Cancelled
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400">{attendee.churchAssembly}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          
          {/* Cancellation Banner if cancelled */}
          {isCancelled && (
            <div className="p-3.5 bg-slate-100 border border-slate-300 rounded-xl text-xs text-slate-700 space-y-1">
              <span className="font-bold text-slate-900 block">Registration Cancelled</span>
              <p>Reason: <strong>{attendee.cancellationReason || 'No reason specified'}</strong></p>
              <p className="text-slate-500">Cancelled by {attendee.cancelledBy || 'Admin'} on {attendee.cancelledAt ? new Date(attendee.cancelledAt).toLocaleString() : ''}</p>
            </div>
          )}

          {/* Status Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
            <div className="flex items-center space-x-2">
              <span className="text-slate-500 font-medium">Payment:</span>
              <span className={`font-bold px-2 py-0.5 rounded ${
                attendee.paymentStatus === 'Paid / Confirmed'
                  ? 'bg-emerald-100 text-emerald-800'
                  : attendee.paymentStatus === 'Part Paid'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-rose-100 text-rose-800'
              }`}>
                {attendee.paymentStatus} (US${attendee.amountPaid.toFixed(2)} / US${attendee.amountDue.toFixed(2)})
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-slate-500 font-medium">Check-In:</span>
              <span className={`font-bold px-2 py-0.5 rounded ${
                attendee.checkInStatus === 'Checked In'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-slate-200 text-slate-700'
              }`}>
                {attendee.checkInStatus}
              </span>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              onClick={() => onOpenReceipt(attendee)}
              className="p-2.5 bg-teal-50 hover:bg-teal-100 text-teal-800 rounded-xl text-xs font-bold border border-teal-200 flex flex-col items-center justify-center space-y-1 transition active:scale-95 cursor-pointer"
            >
              <Receipt className="w-4 h-4 text-teal-600" />
              <span>Receipt</span>
            </button>
            <button
              onClick={() => onOpenPrintSingle(attendee)}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold border border-slate-300 flex flex-col items-center justify-center space-y-1 transition active:scale-95 cursor-pointer"
            >
              <Printer className="w-4 h-4 text-slate-600" />
              <span>Print Pass</span>
            </button>
            <button
              onClick={() => onOpenPayment(attendee)}
              disabled={isCancelled}
              className="p-2.5 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded-xl text-xs font-bold border border-amber-200 flex flex-col items-center justify-center space-y-1 transition active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <CreditCard className="w-4 h-4 text-amber-600" />
              <span>+ Payment</span>
            </button>
            
            {attendee.checkInStatus === 'Checked In' ? (
              <button
                onClick={() => setShowUndoModal(true)}
                className="p-2.5 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-xl text-xs font-bold flex flex-col items-center justify-center space-y-1 transition active:scale-95 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4 text-rose-600" />
                <span>Undo Check-In</span>
              </button>
            ) : (
              <button
                onClick={handleCheckIn}
                disabled={isCancelled}
                className="p-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold flex flex-col items-center justify-center space-y-1 transition active:scale-95 cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Check In</span>
              </button>
            )}
          </div>

          {/* Attendee Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Personal Details</span>
              <p>Gender: <strong>{attendee.gender}</strong></p>
              <p>Age: <strong>{attendee.age} years</strong> {isMinor && <span className="text-amber-700 font-semibold">(Minor)</span>}</p>
              <p>Phone: <strong>{attendee.phoneNumber}</strong></p>
              <p>District: <strong>{attendee.districtZone || 'N/A'}</strong></p>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Emergency & Guardians</span>
              <p>Contact: <strong>{attendee.emergencyContactName || 'N/A'}</strong></p>
              <p>Phone: <strong>{attendee.emergencyContactPhone || 'N/A'}</strong></p>
              {isMinor && (
                <>
                  <p className="pt-1 border-t border-slate-200">Guardian: <strong>{attendee.parentGuardianName || 'N/A'}</strong></p>
                  <p>Guardian Phone: <strong>{attendee.parentGuardianPhone || 'N/A'}</strong></p>
                  <p>Consent: <strong>{attendee.consentConfirmed ? 'Confirmed Yes' : 'Pending'}</strong></p>
                </>
              )}
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1 sm:col-span-2">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Camp Options & Logistics</span>
              <p>Transport Required: <strong>{attendee.transportRequired ? 'Yes (Bus pickup)' : 'No (Self-arranged)'}</strong></p>
              <p>Optional Activities: <strong>{(attendee.optionalActivities || []).join(', ') || 'None'}</strong></p>
              <p>Dietary Requirements: <strong>{attendee.dietaryRequirements || 'Standard'}</strong></p>
              <p>Allergies: <strong>{attendee.allergies || 'None reported'}</strong></p>
            </div>

            {/* Confidential Medical Notes (Admin Only) */}
            {isAdmin && attendee.medicalNotes && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-1 sm:col-span-2">
                <span className="text-[10px] uppercase font-bold text-rose-800 flex items-center space-x-1">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>Confidential Medical Information (Admin Only)</span>
                </span>
                <p className="text-rose-950 font-medium">{attendee.medicalNotes}</p>
              </div>
            )}
          </div>

          {/* Random Non-Sensitive QR Verification Token */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
            <div className="space-y-1 text-xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Safe Non-Sensitive QR Token</span>
              <p className="font-mono text-xs text-slate-700 bg-white px-2 py-1 rounded border border-slate-200 inline-block">
                {attendee.verificationToken}
              </p>
              <p className="text-[10px] text-slate-500">
                Random verification token. No personal, phone, or medical data is encoded.
              </p>
            </div>
            <QRCodeSVG value={attendee.verificationToken || attendee.registrationId} size={72} />
          </div>

          {/* Audit Event Activity History Ledger (Section 5) */}
          <div>
            <div className="flex items-center space-x-2 border-b border-slate-200 pb-2 mb-3">
              <History className="w-4 h-4 text-slate-500" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Audit Trail History</h4>
            </div>

            {(!auditLogs || auditLogs.length === 0) ? (
              <p className="text-xs text-slate-400 italic">No audit records recorded yet.</p>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {auditLogs.map(log => (
                  <div key={log.id} className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-[11px] space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800">{log.eventType}</span>
                      <span className="text-slate-400 text-[10px]">
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-slate-600">{log.description}</p>
                    <p className="text-[10px] text-slate-400">Staff: {log.staffMember}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Edit Details Section */}
          {isEditing ? (
            <div className="p-4 bg-teal-50 border border-teal-200 rounded-xl space-y-3">
              <h4 className="text-xs font-bold text-teal-950 uppercase">Edit Attendee Details</h4>
              <div>
                <label className="block text-xs font-semibold text-teal-950 mb-1">Phone Number</label>
                <input
                  type="text"
                  value={editedPhone}
                  onChange={e => setEditedPhone(e.target.value)}
                  className="w-full px-3 py-1.5 border border-teal-300 rounded-lg text-xs bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-teal-950 mb-1">Church / Assembly</label>
                <input
                  type="text"
                  value={editedChurch}
                  onChange={e => setEditedChurch(e.target.value)}
                  className="w-full px-3 py-1.5 border border-teal-300 rounded-lg text-xs bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-teal-950 mb-1">Staff Notes</label>
                <textarea
                  rows={2}
                  value={editedNotes}
                  onChange={e => setEditedNotes(e.target.value)}
                  className="w-full px-3 py-1.5 border border-teal-300 rounded-lg text-xs bg-white"
                />
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={handleSaveEdits}
                  className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold cursor-pointer"
                >
                  Save Changes
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-200">
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center space-x-1 text-teal-700 hover:text-teal-900 font-semibold cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit Attendee Details</span>
              </button>

              {isAdmin && !isCancelled && (
                <button
                  onClick={() => setShowCancelModal(true)}
                  className="flex items-center space-x-1 text-rose-600 hover:text-rose-800 font-semibold cursor-pointer"
                >
                  <Ban className="w-3.5 h-3.5" />
                  <span>Cancel Registration</span>
                </button>
              )}
            </div>
          )}

        </div>

      </div>

      {/* Undo Check-In Reason Modal */}
      {showUndoModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-slate-900">Undo Gate Check-In</h3>
            <p className="text-xs text-slate-600">
              Please enter an administrator audit reason for reversing the check-in of {attendee.fullName}.
            </p>
            <textarea
              rows={3}
              required
              placeholder="e.g. Scanned wrong QR code by mistake; attendee is arriving on later bus."
              value={undoReason}
              onChange={e => setUndoReason(e.target.value)}
              className="w-full p-2.5 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-teal-500 focus:outline-none"
            />
            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setShowUndoModal(false)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleUndoCheckIn}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Confirm Reversal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Registration Reason Modal (Section 14) */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-rose-900 flex items-center space-x-2">
              <Ban className="w-5 h-5 text-rose-600" />
              <span>Cancel Registration</span>
            </h3>
            <p className="text-xs text-slate-600">
              Cancellation marks the attendee as cancelled while preserving the registration ID ({attendee.registrationId}), payment history, and audit log.
            </p>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Reason for Cancellation: *
              </label>
              <textarea
                rows={3}
                required
                placeholder="e.g. Attendee unable to travel due to work commitments; fee refund handled."
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-rose-500 focus:outline-none"
              />
            </div>
            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setShowCancelModal(false)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Keep Active
              </button>
              <button
                onClick={handleCancelRegistration}
                className="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
