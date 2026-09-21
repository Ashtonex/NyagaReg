import Dexie, { type Table } from 'dexie';
import type { AppSettings, Attendee, AuditEvent, PaymentStatus, PaymentTransaction, SequenceCounter } from '../types';

export class CampDatabase extends Dexie {
  attendees!: Table<Attendee, string>;
  payments!: Table<PaymentTransaction, string>;
  auditLogs!: Table<AuditEvent, string>;
  settings!: Table<AppSettings, string>;
  sequences!: Table<SequenceCounter, string>;

  constructor() {
    super('AdministrareCampDB');
    this.version(2).stores({
      attendees: 'id, registrationId, verificationToken, fullName, phoneNumber, churchAssembly, paymentStatus, checkInStatus, registrationStatus, updatedAt, syncStatus',
      payments: 'id, attendeeId, registrationId, paymentDateTime, recordedBy, syncStatus',
      auditLogs: 'id, attendeeId, registrationId, eventType, staffMember, timestamp',
      settings: 'id',
      sequences: 'id'
    });
  }
}

export const db = new CampDatabase();

export const DEFAULT_SETTINGS: AppSettings = {
  id: 'current_settings',
  campName: 'Provincial Camp 2026',
  venue: 'WildGeo Nyanga',
  totalCapacity: 150,
  standardCampFee: 35,
  currency: 'USD',
  registrationIdPrefix: 'PC',
  registrationIdPadding: 4,
  adultAgeThreshold: 18,
  stationId: 'STATION-A',
  activeStaffName: 'Admin',
  activeStaffRole: 'ADMIN',
  notes: 'WildGeo Nyanga. Transport & optional activities are separate.'
};

export async function getSettings(): Promise<AppSettings> {
  const settings = await db.settings.get('current_settings');
  if (!settings) {
    await db.settings.put(DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  }
  return settings;
}

export async function updateSettings(newSettings: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const updated = { ...current, ...newSettings };
  await db.settings.put(updated);
  return updated;
}

export function computePaymentStatus(amountDue: number, amountPaid: number): PaymentStatus {
  if (amountPaid <= 0) return 'Awaiting Payment';
  if (amountPaid < amountDue) return 'Part Paid';
  return 'Paid / Confirmed';
}

/**
 * Creates a safe, non-sensitive random verification token for QR codes.
 * Contains ZERO personal, medical, phone, or payment data.
 * Format: pc26:verify:<uuid>
 */
export function createVerificationToken(): string {
  return `pc26:verify:${crypto.randomUUID()}`;
}

/**
 * Parses or verifies a scanned QR string.
 * Supports format "pc26:verify:<uuid>" or direct registrationId "PC-0027"
 */
export function parseQrVerificationToken(scannedText: string): { token: string; isToken: boolean; isDirectRegId: boolean } {
  const trimmed = scannedText.trim();
  if (trimmed.startsWith('pc26:verify:')) {
    return { token: trimmed, isToken: true, isDirectRegId: false };
  }
  // Legacy / Direct token format "PC:PC-0027:..."
  if (trimmed.startsWith('PC:') && trimmed.split(':').length >= 2) {
    const parts = trimmed.split(':');
    return { token: parts[1], isToken: false, isDirectRegId: true };
  }
  if (/^PC-\d{4}$/i.test(trimmed)) {
    return { token: trimmed.toUpperCase(), isToken: false, isDirectRegId: true };
  }
  return { token: trimmed, isToken: false, isDirectRegId: false };
}

/**
 * Durable Registration Sequence Counter inside IndexedDB.
 * Never recycles cancelled/deleted IDs automatically.
 * Increments sequentially and ensures zero duplicate IDs.
 */
export async function getNextRegistrationId(): Promise<string> {
  const settings = await getSettings();
  const prefix = settings.registrationIdPrefix || 'PC';
  const padding = settings.registrationIdPadding || 4;

  let counter = await db.sequences.get('reg_id_sequence');
  if (!counter) {
    counter = {
      id: 'reg_id_sequence',
      lastSequence: 0,
      prefix,
      padding
    };
    await db.sequences.put(counter);
  }

  // Find all used numbers across attendees and audit events to guarantee uniqueness
  const existingAttendees = await db.attendees.toArray();
  const existingAudits = await db.auditLogs.toArray();
  const usedNumbers = new Set<number>();

  const extractNumber = (regId?: string) => {
    if (!regId) return;
    const match = regId.match(new RegExp(`^${prefix}-(\\d+)`, 'i'));
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num)) usedNumbers.add(num);
    }
  };

  existingAttendees.forEach(a => extractNumber(a.registrationId));
  existingAudits.forEach(a => extractNumber(a.registrationId));

  let candidate = counter.lastSequence + 1;
  while (usedNumbers.has(candidate)) {
    candidate++;
  }

  // Update durable counter in IndexedDB
  counter.lastSequence = candidate;
  counter.prefix = prefix;
  counter.padding = padding;
  await db.sequences.put(counter);

  const paddedNum = String(candidate).padStart(padding, '0');
  return `${prefix}-${paddedNum}`;
}

/**
 * Allows administrators to set or migrate the sequence counter explicitly.
 */
export async function setRegistrationSequenceCounter(nextSequence: number, reason: string): Promise<void> {
  const settings = await getSettings();
  const counter: SequenceCounter = {
    id: 'reg_id_sequence',
    lastSequence: Math.max(0, nextSequence - 1),
    prefix: settings.registrationIdPrefix || 'PC',
    padding: settings.registrationIdPadding || 4
  };
  await db.sequences.put(counter);
  await logAuditEvent('Sequence migrated', `Sequence counter migrated to next ID #${nextSequence}. Reason: ${reason}`);
}

/**
 * Records an immutable audit event in IndexedDB.
 */
export async function logAuditEvent(
  eventType: AuditEvent['eventType'],
  description: string,
  registrationId?: string,
  attendeeId?: string,
  metadata?: Record<string, any>
): Promise<void> {
  const settings = await getSettings();
  const event: AuditEvent = {
    id: crypto.randomUUID(),
    attendeeId,
    registrationId,
    eventType,
    description,
    staffMember: settings.activeStaffName || 'Staff',
    timestamp: new Date().toISOString(),
    metadata
  };
  await db.auditLogs.add(event);
}

/**
 * Seeds exactly the 4 test attendees defined in Section 21:
 * PC-0001: Fully Paid, Not checked in
 * PC-0002: Part Paid, Not checked in
 * PC-0003: Awaiting Payment, Not checked in
 * PC-0004: Fully Paid, Checked in
 */
export async function seedDemoData(): Promise<void> {
  const now = new Date();
  const isoNow = now.toISOString();

  // Check if PC-0001 already exists
  const existing = await db.attendees.where('registrationId').equals('PC-0001').first();
  if (existing) return;

  const demoAttendees: Attendee[] = [
    {
      id: crypto.randomUUID(),
      registrationId: 'PC-0001',
      verificationToken: createVerificationToken(),
      fullName: 'Simeon Chikwanha',
      gender: 'Male',
      age: 24,
      phoneNumber: '+263 77 123 4567',
      churchAssembly: 'Harare Central Assembly',
      districtZone: 'Harare East',
      emergencyContactName: 'Mary Chikwanha',
      emergencyContactPhone: '+263 77 987 6543',
      dietaryRequirements: 'None',
      allergies: 'None',
      medicalNotes: '',
      transportRequired: true,
      optionalActivities: ['Quad bikes'],
      amountDue: 35,
      amountPaid: 35,
      balance: 0,
      paymentStatus: 'Paid / Confirmed',
      receiptIssued: true,
      receiptIssuedAt: isoNow,
      registrationDate: isoNow,
      registeredBy: 'Admin',
      registrationStatus: 'Active',
      checkInStatus: 'Not Checked In',
      checkInDate: null,
      checkInTime: null,
      checkedInBy: null,
      notes: 'Demo Attendee 1 (Fully Paid)',
      createdAt: isoNow,
      updatedAt: isoNow,
      syncStatus: 'Saved Locally'
    },
    {
      id: crypto.randomUUID(),
      registrationId: 'PC-0002',
      verificationToken: createVerificationToken(),
      fullName: 'Grace Nyoni',
      gender: 'Female',
      age: 17,
      phoneNumber: '+263 71 234 5678',
      churchAssembly: 'Bulawayo Faith Chapel',
      districtZone: 'Bulawayo North',
      emergencyContactName: 'Patrick Nyoni',
      emergencyContactPhone: '+263 71 876 5432',
      parentGuardianName: 'Patrick Nyoni',
      parentGuardianPhone: '+263 71 876 5432',
      consentConfirmed: true,
      dietaryRequirements: 'Vegetarian',
      allergies: 'Peanuts',
      medicalNotes: 'Carries EpiPen for severe peanut allergy',
      transportRequired: false,
      optionalActivities: ['Target shooting'],
      amountDue: 35,
      amountPaid: 20,
      balance: 15,
      paymentStatus: 'Part Paid',
      receiptIssued: true,
      receiptIssuedAt: isoNow,
      registrationDate: isoNow,
      registeredBy: 'Admin',
      registrationStatus: 'Active',
      checkInStatus: 'Not Checked In',
      checkInDate: null,
      checkInTime: null,
      checkedInBy: null,
      notes: 'Demo Attendee 2 (Part Paid)',
      createdAt: isoNow,
      updatedAt: isoNow,
      syncStatus: 'Saved Locally'
    },
    {
      id: crypto.randomUUID(),
      registrationId: 'PC-0003',
      verificationToken: createVerificationToken(),
      fullName: 'David Mutasa',
      gender: 'Male',
      age: 30,
      phoneNumber: '+263 73 345 6789',
      churchAssembly: 'Mutare Tabernacle',
      districtZone: 'Manicaland',
      emergencyContactName: 'Ruth Mutasa',
      emergencyContactPhone: '+263 73 765 4321',
      dietaryRequirements: 'No pork',
      allergies: 'None',
      medicalNotes: '',
      transportRequired: true,
      optionalActivities: [],
      amountDue: 35,
      amountPaid: 0,
      balance: 35,
      paymentStatus: 'Awaiting Payment',
      receiptIssued: false,
      receiptIssuedAt: null,
      registrationDate: isoNow,
      registeredBy: 'Admin',
      registrationStatus: 'Active',
      checkInStatus: 'Not Checked In',
      checkInDate: null,
      checkInTime: null,
      checkedInBy: null,
      notes: 'Demo Attendee 3 (Awaiting Payment)',
      createdAt: isoNow,
      updatedAt: isoNow,
      syncStatus: 'Saved Locally'
    },
    {
      id: crypto.randomUUID(),
      registrationId: 'PC-0004',
      verificationToken: createVerificationToken(),
      fullName: 'Tariro Moyo',
      gender: 'Female',
      age: 22,
      phoneNumber: '+263 77 456 7890',
      churchAssembly: 'Gweru Assembly',
      districtZone: 'Midlands',
      emergencyContactName: 'Ethel Moyo',
      emergencyContactPhone: '+263 77 654 3210',
      dietaryRequirements: 'None',
      allergies: 'None',
      medicalNotes: '',
      transportRequired: false,
      optionalActivities: ['Quad bikes', 'Target shooting'],
      amountDue: 35,
      amountPaid: 35,
      balance: 0,
      paymentStatus: 'Paid / Confirmed',
      receiptIssued: true,
      receiptIssuedAt: isoNow,
      registrationDate: isoNow,
      registeredBy: 'Admin',
      registrationStatus: 'Active',
      checkInStatus: 'Checked In',
      checkInDate: isoNow.slice(0, 10),
      checkInTime: '14:15',
      checkedInBy: 'Gate 1',
      notes: 'Demo Attendee 4 (Fully Paid & Checked In)',
      createdAt: isoNow,
      updatedAt: isoNow,
      syncStatus: 'Saved Locally'
    }
  ];

  await db.attendees.bulkAdd(demoAttendees);

  // Demo payment ledger entries
  const demoPayments: PaymentTransaction[] = [
    {
      id: crypto.randomUUID(),
      attendeeId: demoAttendees[0].id,
      registrationId: 'PC-0001',
      amount: 35,
      paymentDateTime: isoNow,
      paymentMethod: 'Cash',
      paymentReference: 'CASH-001',
      recordedBy: 'Admin',
      notes: 'Full registration fee paid',
      createdAt: isoNow,
      syncStatus: 'Saved Locally'
    },
    {
      id: crypto.randomUUID(),
      attendeeId: demoAttendees[1].id,
      registrationId: 'PC-0002',
      amount: 20,
      paymentDateTime: isoNow,
      paymentMethod: 'EcoCash / Mobile Money',
      paymentReference: 'MP260921.1120.H45678',
      recordedBy: 'Admin',
      notes: 'Initial deposit. $15 balance due',
      createdAt: isoNow,
      syncStatus: 'Saved Locally'
    },
    {
      id: crypto.randomUUID(),
      attendeeId: demoAttendees[3].id,
      registrationId: 'PC-0004',
      amount: 35,
      paymentDateTime: isoNow,
      paymentMethod: 'Cash',
      paymentReference: 'CASH-004',
      recordedBy: 'Admin',
      notes: 'Full payment received',
      createdAt: isoNow,
      syncStatus: 'Saved Locally'
    }
  ];

  await db.payments.bulkAdd(demoPayments);
  await logAuditEvent('Registered', 'Demo attendees seeded for testing');
}

/**
 * Removes ONLY the development demo records (identified by Demo Attendee in notes) without touching real records.
 */
export async function removeDemoData(): Promise<number> {
  const demoAttendees = await db.attendees
    .filter(a => Boolean(a.notes && a.notes.includes('Demo Attendee')))
    .toArray();
  const demoIds = demoAttendees.map(a => a.id);
  const demoRegIds = demoAttendees.map(a => a.registrationId);

  if (demoIds.length > 0) {
    await db.attendees.where('id').anyOf(demoIds).delete();
    await db.payments.where('registrationId').anyOf(demoRegIds).delete();
    await logAuditEvent('Registration cancelled', `Removed ${demoIds.length} demo records safely from database`);
    await syncPersistentJsonDb();
  }
  return demoIds.length;
}

export const PERSISTENT_JSON_DB_KEY = 'administrare_persistent_camp_database_json';

/**
 * Serializes the current IndexedDB state to a JSON structure in localStorage.
 * Runs in background after every change to prevent any data loss on browser refresh.
 */
export async function syncPersistentJsonDb(): Promise<void> {
  try {
    const settings = await getSettings();
    const sequence = await db.sequences.get('reg_id_sequence');
    const attendees = await db.attendees.toArray();
    const payments = await db.payments.toArray();
    const auditLogs = await db.auditLogs.toArray();

    const dbPayload = {
      backupVersion: '2.0',
      appName: 'Administrare - Provincial Camp 2026',
      timestamp: new Date().toISOString(),
      settings,
      sequenceCounter: sequence,
      attendees,
      payments,
      auditLogs
    };

    localStorage.setItem(PERSISTENT_JSON_DB_KEY, JSON.stringify(dbPayload));
  } catch (err) {
    console.warn('Failed to sync persistent JSON database to localStorage:', err);
  }
}

/**
 * Hydrates IndexedDB from the localStorage JSON mirror if IndexedDB is empty.
 * Returns true if records were restored.
 */
export async function hydrateFromPersistentJsonDb(): Promise<boolean> {
  try {
    const count = await db.attendees.count();
    if (count > 0) return false;

    const raw = localStorage.getItem(PERSISTENT_JSON_DB_KEY);
    if (!raw) return false;

    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.attendees) || data.attendees.length === 0) return false;

    await db.transaction('rw', [db.attendees, db.payments, db.auditLogs, db.settings, db.sequences], async () => {
      if (data.settings) await db.settings.put(data.settings);
      if (data.sequenceCounter) await db.sequences.put(data.sequenceCounter);
      if (data.attendees?.length) await db.attendees.bulkPut(data.attendees);
      if (data.payments?.length) await db.payments.bulkPut(data.payments);
      if (data.auditLogs?.length) await db.auditLogs.bulkPut(data.auditLogs);
    });

    console.info(`Hydrated ${data.attendees.length} attendees from persistent JSON database mirror.`);
    return true;
  } catch (err) {
    console.error('Failed to hydrate from persistent JSON database:', err);
    return false;
  }
}

export async function clearAllDatabaseRecords(): Promise<void> {
  await db.attendees.clear();
  await db.payments.clear();
  await db.auditLogs.clear();
  await db.sequences.clear();
  localStorage.removeItem(PERSISTENT_JSON_DB_KEY);
  await logAuditEvent('Backup restored', 'All database records cleared by administrator');
}

