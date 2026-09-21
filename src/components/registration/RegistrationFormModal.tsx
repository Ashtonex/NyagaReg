import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { 
  X, 
  UserPlus, 
  AlertTriangle, 
  CheckCircle2, 
  DollarSign, 
  ShieldAlert, 
  Receipt, 
  ArrowRight, 
  Plus 
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { 
  db, 
  getNextRegistrationId, 
  computePaymentStatus, 
  createVerificationToken, 
  logAuditEvent,
  syncPersistentJsonDb
} from '../../db/db';
import type { Attendee, PaymentTransaction } from '../../types';

interface RegistrationFormModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RegistrationFormModal: React.FC<RegistrationFormModalProps> = ({ isOpen, onClose }) => {
  const { settings, activeStaffName, activeRole, showToast, openReceipt, openProfile } = useApp();

  // Form State
  const [registrationId, setRegistrationId] = useState<string>('');
  const [fullName, setFullName] = useState<string>('');
  const [gender, setGender] = useState<'Male' | 'Female' | 'Other'>('Male');
  const [age, setAge] = useState<number | ''>('');
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [churchAssembly, setChurchAssembly] = useState<string>('');
  const [districtZone, setDistrictZone] = useState<string>('');

  // Emergency & Minors
  const [emergencyContactName, setEmergencyContactName] = useState<string>('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState<string>('');
  const [parentGuardianName, setParentGuardianName] = useState<string>('');
  const [parentGuardianPhone, setParentGuardianPhone] = useState<string>('');
  const [consentConfirmed, setConsentConfirmed] = useState<boolean>(false);

  // Medical & Dietary (Confidential)
  const [dietaryRequirements, setDietaryRequirements] = useState<string>('');
  const [allergies, setAllergies] = useState<string>('');
  const [medicalNotes, setMedicalNotes] = useState<string>('');

  // Camp Options
  const [transportRequired, setTransportRequired] = useState<boolean>(false);
  const [quadBikes, setQuadBikes] = useState<boolean>(false);
  const [targetShooting, setTargetShooting] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>('');

  // Payment State
  const [amountDue, setAmountDue] = useState<number>(settings.standardCampFee || 35);
  const [initialAmountPaid, setInitialAmountPaid] = useState<number | ''>(35);
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'EcoCash / Mobile Money' | 'Bank Transfer' | 'Card' | 'Other'>('Cash');
  const [paymentReference, setPaymentReference] = useState<string>('');
  const [paymentNotes, setPaymentNotes] = useState<string>('');

  // Validation / Warning States
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [duplicateConfirmed, setDuplicateConfirmed] = useState<boolean>(false);
  const [capacityWarning, setCapacityWarning] = useState<string | null>(null);
  const [capacityOverrideReason, setCapacityOverrideReason] = useState<string>('');

  // Success Confirmation View
  const [createdAttendee, setCreatedAttendee] = useState<Attendee | null>(null);

  // Load next ID and check capacity on open
  useEffect(() => {
    if (isOpen) {
      resetForm();
      loadNextId();
      checkCapacity();
    }
  }, [isOpen]);

  const loadNextId = async () => {
    try {
      const next = await getNextRegistrationId();
      setRegistrationId(next);
    } catch (err) {
      console.error('Error fetching next ID:', err);
    }
  };

  const checkCapacity = async () => {
    const activeCount = await db.attendees.where('registrationStatus').equals('Active').count();
    const maxCapacity = settings.totalCapacity || 150;
    if (activeCount >= maxCapacity) {
      setCapacityWarning(`Camp capacity reached (${activeCount} / ${maxCapacity} active attendees). Administrator override required.`);
    } else {
      setCapacityWarning(null);
    }
  };

  const resetForm = () => {
    setFullName('');
    setGender('Male');
    setAge('');
    setPhoneNumber('');
    setChurchAssembly('');
    setDistrictZone('');
    setEmergencyContactName('');
    setEmergencyContactPhone('');
    setParentGuardianName('');
    setParentGuardianPhone('');
    setConsentConfirmed(false);
    setDietaryRequirements('');
    setAllergies('');
    setMedicalNotes('');
    setTransportRequired(false);
    setQuadBikes(false);
    setTargetShooting(false);
    setNotes('');
    setAmountDue(settings.standardCampFee || 35);
    setInitialAmountPaid(settings.standardCampFee || 35);
    setPaymentMethod('Cash');
    setPaymentReference('');
    setPaymentNotes('');
    setDuplicateWarning(null);
    setDuplicateConfirmed(false);
    setCapacityOverrideReason('');
    setCreatedAttendee(null);
  };

  const handleCheckDuplicates = async () => {
    if (!fullName.trim() && !phoneNumber.trim()) return;
    const existing = await db.attendees
      .filter(a => {
        if (a.registrationStatus === 'Cancelled') return false;
        const nameMatch = fullName.trim() !== '' && a.fullName.toLowerCase() === fullName.trim().toLowerCase();
        const phoneMatch = phoneNumber.trim() !== '' && a.phoneNumber.replace(/\s+/g, '') === phoneNumber.trim().replace(/\s+/g, '');
        return Boolean(nameMatch || phoneMatch);
      })
      .first();

    if (existing) {
      setDuplicateWarning(
        `Notice: Possible duplicate detected. "${existing.fullName}" (${existing.registrationId}) is already registered with phone ${existing.phoneNumber}.`
      );
    } else {
      setDuplicateWarning(null);
    }
  };

  const paidVal = typeof initialAmountPaid === 'number' ? initialAmountPaid : 0;
  const balanceVal = Math.max(0, amountDue - paidVal);
  const excessVal = paidVal > amountDue ? paidVal - amountDue : 0;
  const paymentStatus = computePaymentStatus(amountDue, paidVal);
  const isMinor = typeof age === 'number' && age < (settings.adultAgeThreshold || 18);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fullName.trim()) {
      showToast('error', 'Please enter attendee full name.');
      return;
    }
    if (!phoneNumber.trim()) {
      showToast('error', 'Please enter phone / WhatsApp number.');
      return;
    }
    if (paidVal < 0) {
      showToast('error', 'Payment amount cannot be negative.');
      return;
    }

    // Payment Reference validation for non-cash
    if (paidVal > 0 && paymentMethod !== 'Cash' && !paymentReference.trim()) {
      if (activeRole !== 'ADMIN') {
        showToast('error', 'Payment reference is required for non-cash payments.');
        return;
      }
    }

    // Duplicate confirmation
    if (duplicateWarning && !duplicateConfirmed) {
      showToast('warning', 'Please confirm that this is a legitimate duplicate registration before saving.');
      return;
    }

    // Capacity override validation
    if (capacityWarning) {
      if (activeRole !== 'ADMIN') {
        showToast('error', 'Camp capacity limit reached (150). Only an Administrator can authorize registrations beyond capacity.');
        return;
      }
      if (!capacityOverrideReason.trim()) {
        showToast('error', 'Please enter an administrator audit reason for overriding camp capacity.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const now = new Date();
      const isoNow = now.toISOString();
      const attendeeId = crypto.randomUUID();
      const verificationToken = createVerificationToken();

      const optionalActs: string[] = [];
      if (quadBikes) optionalActs.push('Quad bikes');
      if (targetShooting) optionalActs.push('Target shooting');

      const newAttendee: Attendee = {
        id: attendeeId,
        registrationId,
        verificationToken,
        fullName: fullName.trim(),
        gender,
        age: typeof age === 'number' ? age : 20,
        phoneNumber: phoneNumber.trim(),
        churchAssembly: churchAssembly.trim() || 'Assembly',
        districtZone: districtZone.trim(),
        emergencyContactName: emergencyContactName.trim(),
        emergencyContactPhone: emergencyContactPhone.trim(),
        parentGuardianName: isMinor ? parentGuardianName.trim() : undefined,
        parentGuardianPhone: isMinor ? parentGuardianPhone.trim() : undefined,
        consentConfirmed: isMinor ? consentConfirmed : undefined,
        dietaryRequirements: dietaryRequirements.trim(),
        allergies: allergies.trim(),
        medicalNotes: medicalNotes.trim(),
        transportRequired,
        optionalActivities: optionalActs,
        amountDue,
        amountPaid: paidVal,
        balance: balanceVal,
        paymentStatus,
        receiptIssued: paidVal > 0,
        receiptIssuedAt: paidVal > 0 ? isoNow : null,
        registrationDate: isoNow,
        registeredBy: activeStaffName,
        registrationStatus: 'Active',
        checkInStatus: 'Not Checked In',
        checkInDate: null,
        checkInTime: null,
        checkedInBy: null,
        notes: notes.trim(),
        createdAt: isoNow,
        updatedAt: isoNow,
        syncStatus: 'Saved Locally'
      };

      await db.attendees.add(newAttendee);

      // Append-only payment ledger transaction
      if (paidVal > 0) {
        const paymentTx: PaymentTransaction = {
          id: crypto.randomUUID(),
          attendeeId: newAttendee.id,
          registrationId: newAttendee.registrationId,
          amount: paidVal,
          paymentDateTime: isoNow,
          paymentMethod,
          paymentReference: paymentReference.trim() || undefined,
          recordedBy: activeStaffName,
          notes: paymentNotes.trim() || (excessVal > 0 ? `Overpayment of $${excessVal} recorded.` : 'Initial registration payment'),
          createdAt: isoNow,
          syncStatus: 'Saved Locally',
          stationId: settings.stationId
        };
        await db.payments.add(paymentTx);
        await logAuditEvent('Payment recorded', `Payment recorded: US$${paidVal.toFixed(2)} via ${paymentMethod}`, newAttendee.registrationId, newAttendee.id);
      }

      await logAuditEvent(
        'Registered', 
        `Registered ${newAttendee.fullName} (${newAttendee.registrationId}). Status: ${paymentStatus}.${capacityWarning ? ` [CAPACITY OVERRIDE REASON: ${capacityOverrideReason}]` : ''}`,
        newAttendee.registrationId,
        newAttendee.id
      );

      // Immediately sync to persistent JSON database in localStorage
      await syncPersistentJsonDb();

      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });

      showToast('success', `${newAttendee.fullName} registered successfully with ID ${newAttendee.registrationId}!`, 'Registration Complete');
      setCreatedAttendee(newAttendee);
    } catch (err: any) {
      console.error('Registration failed:', err);
      showToast('error', `Failed to save registration: ${err.message || err}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <div className="relative bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden my-6">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center border border-teal-500/30">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base">New Attendee Registration</h3>
              <p className="text-xs text-slate-400">Provincial Camp 2026 • WildGeo Nyanga</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success Screen matching Section 8 */}
        {createdAttendee ? (
          <div className="p-6 sm:p-8 text-center space-y-6 animate-in fade-in">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                REGISTRATION SUCCESSFUL
              </span>
              <h2 className="text-2xl font-black text-slate-900 mt-2">
                {createdAttendee.fullName}
              </h2>
              <div className="mt-1 flex items-center justify-center space-x-3">
                <span className="text-sm text-slate-500">Registration ID:</span>
                <span className="font-mono text-xl font-black text-teal-700 bg-teal-50 px-3 py-1 rounded-lg border border-teal-200">
                  {createdAttendee.registrationId}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Payment Status: <strong className="uppercase text-slate-800">{createdAttendee.paymentStatus}</strong> (US${createdAttendee.amountPaid.toFixed(2)} of US${createdAttendee.amountDue.toFixed(2)})
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <button
                onClick={() => {
                  const att = createdAttendee;
                  onClose();
                  openReceipt(att);
                }}
                className="flex items-center justify-center space-x-2 py-3 px-4 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-bold shadow transition active:scale-95 cursor-pointer"
              >
                <Receipt className="w-4 h-4" />
                <span>Generate Receipt</span>
              </button>

              <button
                onClick={() => {
                  resetForm();
                  loadNextId();
                  checkCapacity();
                }}
                className="flex items-center justify-center space-x-2 py-3 px-4 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-sm font-bold shadow transition active:scale-95 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>New Registration</span>
              </button>

              <button
                onClick={() => {
                  const att = createdAttendee;
                  onClose();
                  openProfile(att);
                }}
                className="flex items-center justify-center space-x-2 py-3 px-4 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-bold transition cursor-pointer"
              >
                <ArrowRight className="w-4 h-4" />
                <span>View Attendee</span>
              </button>
            </div>
          </div>
        ) : (
          /* Registration Form */
          <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
            
            {/* Warning banners */}
            {duplicateWarning && (
              <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 space-y-2">
                <div className="flex items-start space-x-2 font-medium">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <span>{duplicateWarning}</span>
                </div>
                <label className="flex items-center space-x-2 cursor-pointer pt-1 font-semibold text-amber-950">
                  <input
                    type="checkbox"
                    checked={duplicateConfirmed}
                    onChange={e => setDuplicateConfirmed(e.target.checked)}
                    className="rounded text-amber-600 focus:ring-amber-500"
                  />
                  <span>Confirm this is a verified separate attendee (Allow Duplicate)</span>
                </label>
              </div>
            )}

            {capacityWarning && (
              <div className="p-3.5 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-900 space-y-2">
                <div className="flex items-start space-x-2 font-bold">
                  <ShieldAlert className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                  <span>{capacityWarning}</span>
                </div>
                {activeRole === 'ADMIN' ? (
                  <div className="pt-1">
                    <label className="block text-[11px] font-bold text-rose-950 mb-1">
                      Administrator Capacity Override Reason: *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Authorized guest speaker, VIP attendee, organizing executive"
                      value={capacityOverrideReason}
                      onChange={e => setCapacityOverrideReason(e.target.value)}
                      className="w-full px-3 py-1.5 border border-rose-300 rounded-lg text-xs bg-white"
                    />
                  </div>
                ) : (
                  <p className="text-[11px] text-rose-700 italic">
                    Contact an Administrator to authorize registration above capacity.
                  </p>
                )}
              </div>
            )}

            {/* SECTION 1: Personal Details */}
            <div>
              <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">1. Personal Information</h4>
                <span className="font-mono font-bold text-xs bg-teal-50 text-teal-800 px-2 py-0.5 rounded border border-teal-200">
                  Durable ID: {registrationId || '...'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Simeon Chikwanha"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    onBlur={handleCheckDuplicates}
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Gender</label>
                  <select
                    value={gender}
                    onChange={e => setGender(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Age <span className="text-slate-400 font-normal">(Under {settings.adultAgeThreshold || 18} requires guardian consent)</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="110"
                    placeholder="e.g. 24"
                    value={age}
                    onChange={e => setAge(e.target.value ? parseInt(e.target.value, 10) : '')}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Phone / WhatsApp Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. +263 77 123 4567"
                    value={phoneNumber}
                    onChange={e => setPhoneNumber(e.target.value)}
                    onBlur={handleCheckDuplicates}
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Church / Assembly</label>
                  <input
                    type="text"
                    placeholder="e.g. Harare Central Assembly"
                    value={churchAssembly}
                    onChange={e => setChurchAssembly(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">District / Zone</label>
                  <input
                    type="text"
                    placeholder="e.g. Harare East"
                    value={districtZone}
                    onChange={e => setDistrictZone(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
            </div>

            {/* SECTION 2: Emergency & Minors */}
            <div>
              <div className="border-b border-slate-200 pb-2 mb-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">2. Emergency Contact & Minor Consent</h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Emergency Contact Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Mary Chikwanha"
                    value={emergencyContactName}
                    onChange={e => setEmergencyContactName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Emergency Phone</label>
                  <input
                    type="text"
                    placeholder="e.g. +263 77 987 6543"
                    value={emergencyContactPhone}
                    onChange={e => setEmergencyContactPhone(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                {isMinor && (
                  <div className="sm:col-span-2 bg-amber-50 border border-amber-200 rounded-xl p-3.5 space-y-3">
                    <span className="text-xs font-bold text-amber-900 uppercase">Minor Guardian Consent (Age &lt; {settings.adultAgeThreshold || 18})</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-amber-950 mb-1">Parent/Guardian Name</label>
                        <input
                          type="text"
                          placeholder="Guardian Name"
                          value={parentGuardianName}
                          onChange={e => setParentGuardianName(e.target.value)}
                          className="w-full px-3 py-1.5 border border-amber-300 rounded-lg text-xs focus:outline-none bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-amber-950 mb-1">Parent/Guardian Phone</label>
                        <input
                          type="text"
                          placeholder="Guardian Phone"
                          value={parentGuardianPhone}
                          onChange={e => setParentGuardianPhone(e.target.value)}
                          className="w-full px-3 py-1.5 border border-amber-300 rounded-lg text-xs focus:outline-none bg-white"
                        />
                      </div>
                    </div>
                    <label className="flex items-center space-x-2 text-xs font-semibold text-amber-950 cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={consentConfirmed}
                        onChange={e => setConsentConfirmed(e.target.checked)}
                        className="rounded text-amber-600 focus:ring-amber-500"
                      />
                      <span>Parental / Guardian Consent Confirmed: Yes</span>
                    </label>
                  </div>
                )}
              </div>
            </div>

            {/* SECTION 3: Medical & Dietary */}
            <div>
              <div className="border-b border-slate-200 pb-2 mb-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">3. Medical & Dietary (Confidential)</h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Dietary Requirements</label>
                  <input
                    type="text"
                    placeholder="e.g. Vegetarian, Halal, No pork"
                    value={dietaryRequirements}
                    onChange={e => setDietaryRequirements(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Allergies</label>
                  <input
                    type="text"
                    placeholder="e.g. Peanuts, Penicillin"
                    value={allergies}
                    onChange={e => setAllergies(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Relevant Medical Notes <span className="text-slate-400 font-normal">(Confidential; never encoded in QR code or exposed to Gate Check-In staff)</span>
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Asthmatic, carries inhaler. Mild allergy."
                    value={medicalNotes}
                    onChange={e => setMedicalNotes(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
            </div>

            {/* SECTION 4: Camp Options */}
            <div>
              <div className="border-b border-slate-200 pb-2 mb-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">4. Camp Options & Logistics</h4>
              </div>

              <div className="space-y-3">
                <label className="flex items-center space-x-3 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition">
                  <input
                    type="checkbox"
                    checked={transportRequired}
                    onChange={e => setTransportRequired(e.target.checked)}
                    className="rounded text-teal-600 focus:ring-teal-500 w-4 h-4"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-slate-800 block">Camp Transport Required</span>
                    <span className="text-slate-500">Handled separately from standard camp fee.</span>
                  </div>
                </label>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <span className="text-xs font-bold text-slate-700 block">Optional Activities Requested:</span>
                  <div className="flex flex-wrap gap-4 pt-1">
                    <label className="flex items-center space-x-2 text-xs font-medium text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={quadBikes}
                        onChange={e => setQuadBikes(e.target.checked)}
                        className="rounded text-teal-600 focus:ring-teal-500"
                      />
                      <span>Quad Bikes</span>
                    </label>
                    <label className="flex items-center space-x-2 text-xs font-medium text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={targetShooting}
                        onChange={e => setTargetShooting(e.target.checked)}
                        className="rounded text-teal-600 focus:ring-teal-500"
                      />
                      <span>Target Shooting</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* SECTION 5: Payment */}
            <div className="bg-teal-50/70 border border-teal-200/90 rounded-2xl p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-teal-200/60 pb-2">
                <div className="flex items-center space-x-2 text-teal-900 font-bold text-xs uppercase tracking-wider">
                  <DollarSign className="w-4 h-4" />
                  <span>5. Payment Details</span>
                </div>
                <div className="text-xs font-bold px-2.5 py-0.5 rounded bg-white border border-teal-200 text-teal-900">
                  Status: <strong className="uppercase">{paymentStatus}</strong>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-teal-950 mb-1">Standard Camp Fee (USD)</label>
                  <input
                    type="number"
                    min="0"
                    value={amountDue}
                    onChange={e => setAmountDue(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-teal-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-teal-950 mb-1">
                    Initial Amount Paid (USD)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0"
                    value={initialAmountPaid}
                    onChange={e => setInitialAmountPaid(e.target.value ? parseFloat(e.target.value) : '')}
                    className="w-full px-3 py-2 border border-teal-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-teal-950 mb-1">Payment Method</label>
                  <select
                    value={paymentMethod}
                    onChange={e => setPaymentMethod(e.target.value as any)}
                    className="w-full px-3 py-2 border border-teal-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="Cash">Cash</option>
                    <option value="EcoCash / Mobile Money">EcoCash / Mobile Money</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Card">Card</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-teal-950 mb-1">
                    Payment Reference {paymentMethod !== 'Cash' && <span className="text-rose-600">*</span>}
                  </label>
                  <input
                    type="text"
                    placeholder={paymentMethod === 'Cash' ? 'e.g. Receipt # or CASH-01' : 'Approval / Transaction Ref (Required)'}
                    value={paymentReference}
                    onChange={e => setPaymentReference(e.target.value)}
                    className="w-full px-3 py-2 border border-teal-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-teal-950 mb-1">Payment Notes</label>
                  <input
                    type="text"
                    placeholder="Optional remarks about payment transaction"
                    value={paymentNotes}
                    onChange={e => setPaymentNotes(e.target.value)}
                    className="w-full px-3 py-1.5 border border-teal-300 rounded-lg text-xs bg-white focus:outline-none"
                  />
                </div>
              </div>

              {/* Excess / Balance notification */}
              {excessVal > 0 && (
                <div className="p-2.5 bg-amber-100 border border-amber-300 rounded-xl text-xs font-semibold text-amber-950">
                  ⚠️ Excess Payment Notice: Attendee is paying US${excessVal.toFixed(2)} above standard fee. Flagged for review.
                </div>
              )}

              <div className="flex items-center justify-between text-xs pt-2 border-t border-teal-200 text-teal-900 font-medium">
                <span>Fee: <strong>US${amountDue.toFixed(2)}</strong></span>
                <span>Paid: <strong>US${paidVal.toFixed(2)}</strong></span>
                <span className={balanceVal > 0 ? 'text-amber-800 font-bold' : 'text-emerald-800 font-bold'}>
                  Balance: <strong>US${balanceVal.toFixed(2)}</strong>
                </span>
              </div>
            </div>

            {/* General Staff Notes */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Staff Notes (Optional)</label>
              <input
                type="text"
                placeholder="Any special operational remarks..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none"
              />
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 px-4 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-teal-600/20 transition active:scale-98 cursor-pointer flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                <UserPlus className="w-5 h-5" />
                <span>{isSubmitting ? 'Saving Registration...' : 'SAVE REGISTRATION'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
