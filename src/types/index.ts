export type PaymentStatus = 'Awaiting Payment' | 'Part Paid' | 'Paid / Confirmed';
export type CheckInStatus = 'Not Checked In' | 'Checked In';
export type RegistrationStatus = 'Active' | 'Cancelled';
export type SyncStatus = 'Saved Locally' | 'Sync Pending' | 'Synced' | 'Sync Failed';
export type StaffRole = 'ADMIN' | 'REGISTRAR' | 'CHECKIN';

export interface PaymentTransaction {
  id: string; // UUID
  attendeeId: string; // UUID of attendee
  registrationId: string; // e.g. PC-0027
  amount: number;
  paymentDateTime: string; // ISO
  paymentMethod: 'Cash' | 'EcoCash / Mobile Money' | 'Bank Transfer' | 'Card' | 'Other';
  paymentReference?: string;
  recordedBy: string;
  notes?: string;
  createdAt: string; // ISO
  syncStatus: SyncStatus;
  stationId?: string;
}

export interface AuditEvent {
  id: string; // UUID
  attendeeId?: string;
  registrationId?: string;
  eventType: 
    | 'Registered' 
    | 'Payment recorded' 
    | 'Receipt generated' 
    | 'Checked in' 
    | 'Check-in reversed' 
    | 'Check-in override'
    | 'Registration cancelled' 
    | 'Record updated' 
    | 'Backup created' 
    | 'Backup restored' 
    | 'Sequence migrated'
    | 'Sync completed';
  description: string;
  staffMember: string;
  timestamp: string; // ISO
  metadata?: Record<string, any>;
}

export interface SequenceCounter {
  id: string; // 'reg_id_sequence'
  lastSequence: number; // e.g. 27
  prefix: string; // 'PC'
  padding: number; // 4
}

export interface Attendee {
  id: string; // Internal UUID
  registrationId: string; // e.g. PC-0001, PC-0027
  verificationToken: string; // Random non-sensitive token, e.g. pc26:verify:uuid
  fullName: string;
  gender: 'Male' | 'Female' | 'Other';
  age: number;
  phoneNumber: string;
  churchAssembly: string;
  districtZone?: string;

  // Emergency details
  emergencyContactName: string;
  emergencyContactPhone: string;

  // Minor consent (if age < adult threshold, default 18)
  parentGuardianName?: string;
  parentGuardianPhone?: string;
  consentConfirmed?: boolean;

  // Medical / Dietary (Confidential)
  dietaryRequirements?: string;
  allergies?: string;
  medicalNotes?: string;

  // Camp Options
  transportRequired: boolean;
  optionalActivities: string[]; // e.g. ['Quad bikes', 'Target shooting']

  // Payment Tracking
  amountDue: number; // Default $35
  amountPaid: number; // Calculated from payment history
  balance: number; // amountDue - amountPaid
  paymentStatus: PaymentStatus;

  // Receipts
  receiptIssued: boolean;
  receiptIssuedAt?: string | null;

  // Registration Metadata
  registrationDate: string; // ISO
  registeredBy: string;
  registrationStatus: RegistrationStatus;
  cancellationReason?: string | null;
  cancelledAt?: string | null;
  cancelledBy?: string | null;

  // Check-In Metadata
  checkInStatus: CheckInStatus;
  checkInDate?: string | null;
  checkInTime?: string | null;
  checkedInBy?: string | null;

  notes?: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
}

export interface AppSettings {
  id: string;
  campName: string; // 'Provincial Camp 2026'
  venue: string; // 'WildGeo Nyanga'
  totalCapacity: number; // 150
  standardCampFee: number; // 35
  currency: string; // 'USD'
  registrationIdPrefix: string; // 'PC'
  registrationIdPadding: number; // 4
  adultAgeThreshold: number; // 18
  stationId: string; // 'STATION-A'
  activeStaffName: string;
  activeStaffRole: StaffRole;
  notes?: string;
}

export interface SyncDeltaPack {
  packVersion: string;
  stationId: string;
  exportedAt: string;
  attendees: Attendee[];
  payments: PaymentTransaction[];
  auditLogs: AuditEvent[];
  sequenceCounter?: SequenceCounter;
}

export interface DatabaseBackup {
  backupVersion: string;
  appName: string;
  timestamp: string;
  settings: AppSettings;
  sequenceCounter?: SequenceCounter;
  attendees: Attendee[];
  payments: PaymentTransaction[];
  auditLogs: AuditEvent[];
}

export interface UserAccount {
  id: string;
  username: string;
  displayName: string;
  role: StaffRole;
  pin: string;
  accountCode: string; // e.g. 'ADMIN', 'ACC-A', 'ACC-B', 'ACC-C', 'ACC-D', 'GATE-1'
  stationId: string;
  avatarColor: string;
}

