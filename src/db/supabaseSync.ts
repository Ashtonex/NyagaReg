import type { Attendee, PaymentTransaction, AuditEvent, SequenceCounter } from '../types';
import { db, syncPersistentJsonDb } from './db';
import { getSupabaseClient } from './supabase';

/**
 * Converts an application Attendee object to a Supabase snake_case table row.
 */
export function attendeeToRow(a: Attendee): Record<string, any> {
  return {
    id: a.id,
    registration_id: a.registrationId,
    verification_token: a.verificationToken,
    full_name: a.fullName,
    gender: a.gender,
    age: a.age,
    phone_number: a.phoneNumber || '',
    church_assembly: a.churchAssembly || '',
    district_zone: a.districtZone || '',
    emergency_contact_name: a.emergencyContactName || '',
    emergency_contact_phone: a.emergencyContactPhone || '',
    parent_guardian_name: a.parentGuardianName || '',
    parent_guardian_phone: a.parentGuardianPhone || '',
    consent_confirmed: a.consentConfirmed ?? false,
    dietary_requirements: a.dietaryRequirements || '',
    allergies: a.allergies || '',
    medical_notes: a.medicalNotes || '',
    transport_required: a.transportRequired ?? false,
    optional_activities: a.optionalActivities || [],
    amount_due: Number(a.amountDue ?? 35),
    amount_paid: Number(a.amountPaid ?? 0),
    balance: Number(a.balance ?? 0),
    payment_status: a.paymentStatus,
    receipt_issued: a.receiptIssued ?? false,
    receipt_issued_at: a.receiptIssuedAt || null,
    registration_date: a.registrationDate,
    registered_by: a.registeredBy,
    registration_status: a.registrationStatus,
    cancellation_reason: a.cancellationReason || null,
    cancelled_at: a.cancelledAt || null,
    cancelled_by: a.cancelledBy || null,
    check_in_status: a.checkInStatus,
    check_in_date: a.checkInDate || null,
    check_in_time: a.checkInTime || null,
    checked_in_by: a.checkedInBy || null,
    notes: a.notes || '',
    created_at: a.createdAt || new Date().toISOString(),
    updated_at: a.updatedAt || new Date().toISOString(),
    sync_status: 'Synced'
  };
}

/**
 * Converts a Supabase snake_case table row back to an application Attendee.
 */
export function rowToAttendee(row: any): Attendee {
  return {
    id: row.id,
    registrationId: row.registration_id,
    verificationToken: row.verification_token,
    fullName: row.full_name,
    gender: row.gender,
    age: Number(row.age) || 20,
    phoneNumber: row.phone_number || '',
    churchAssembly: row.church_assembly || '',
    districtZone: row.district_zone || '',
    emergencyContactName: row.emergency_contact_name || '',
    emergencyContactPhone: row.emergency_contact_phone || '',
    parentGuardianName: row.parent_guardian_name || '',
    parentGuardianPhone: row.parent_guardian_phone || '',
    consentConfirmed: Boolean(row.consent_confirmed),
    dietaryRequirements: row.dietary_requirements || '',
    allergies: row.allergies || '',
    medicalNotes: row.medical_notes || '',
    transportRequired: Boolean(row.transport_required),
    optionalActivities: Array.isArray(row.optional_activities) ? row.optional_activities : [],
    amountDue: Number(row.amount_due ?? 35),
    amountPaid: Number(row.amount_paid ?? 0),
    balance: Number(row.balance ?? 0),
    paymentStatus: row.payment_status,
    receiptIssued: Boolean(row.receipt_issued),
    receiptIssuedAt: row.receipt_issued_at || null,
    registrationDate: row.registration_date,
    registeredBy: row.registered_by,
    registrationStatus: row.registration_status,
    cancellationReason: row.cancellation_reason || null,
    cancelledAt: row.cancelled_at || null,
    cancelledBy: row.cancelled_by || null,
    checkInStatus: row.check_in_status,
    checkInDate: row.check_in_date || null,
    checkInTime: row.check_in_time || null,
    checkedInBy: row.checked_in_by || null,
    notes: row.notes || '',
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
    syncStatus: 'Synced'
  };
}

/**
 * Converts an application PaymentTransaction to a Supabase snake_case row.
 */
export function paymentToRow(p: PaymentTransaction): Record<string, any> {
  return {
    id: p.id,
    attendee_id: p.attendeeId,
    registration_id: p.registrationId,
    amount: Number(p.amount),
    payment_date_time: p.paymentDateTime,
    payment_method: p.paymentMethod,
    payment_reference: p.paymentReference || '',
    recorded_by: p.recordedBy,
    station_id: p.stationId || '',
    notes: p.notes || '',
    created_at: p.createdAt || new Date().toISOString(),
    sync_status: 'Synced'
  };
}

/**
 * Converts a Supabase payment row back to an application PaymentTransaction.
 */
export function rowToPayment(row: any): PaymentTransaction {
  return {
    id: row.id,
    attendeeId: row.attendee_id,
    registrationId: row.registration_id,
    amount: Number(row.amount),
    paymentDateTime: row.payment_date_time,
    paymentMethod: row.payment_method,
    paymentReference: row.payment_reference || '',
    recordedBy: row.recorded_by,
    stationId: row.station_id || '',
    notes: row.notes || '',
    createdAt: row.created_at || new Date().toISOString(),
    syncStatus: 'Synced'
  };
}

/**
 * Pushes all local records (attendees, payments, sequence counter, audit logs)
 * to Supabase cloud database.
 */
export async function pushAllLocalToSupabase(): Promise<{
  attendeesPushed: number;
  paymentsPushed: number;
  success: boolean;
  message: string;
}> {
  const client = getSupabaseClient();
  if (!client) {
    return { attendeesPushed: 0, paymentsPushed: 0, success: false, message: 'Supabase is not configured.' };
  }

  try {
    const attendees = await db.attendees.toArray();
    const payments = await db.payments.toArray();
    const sequence = await db.sequences.get('reg_id_sequence');
    const auditLogs = await db.auditLogs.toArray();

    // 1. Push Attendees in chunks
    if (attendees.length > 0) {
      const rows = attendees.map(attendeeToRow);
      const chunkSize = 100;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const { error } = await client.from('attendees').upsert(chunk, { onConflict: 'id' });
        if (error) throw new Error(`Error pushing attendees: ${error.message}`);
      }
    }

    // 2. Push Payments in chunks
    if (payments.length > 0) {
      const pRows = payments.map(paymentToRow);
      const chunkSize = 100;
      for (let i = 0; i < pRows.length; i += chunkSize) {
        const chunk = pRows.slice(i, i + chunkSize);
        const { error } = await client.from('payments').upsert(chunk, { onConflict: 'id' });
        if (error) throw new Error(`Error pushing payments: ${error.message}`);
      }
    }

    // 3. Push Sequence Counter
    if (sequence) {
      await client.from('sequences').upsert({
        id: sequence.id,
        last_sequence: sequence.lastSequence,
        prefix: sequence.prefix,
        padding: sequence.padding
      }, { onConflict: 'id' });
    }

    // 4. Push Audit Logs
    if (auditLogs.length > 0) {
      const logRows = auditLogs.map(l => ({
        id: l.id,
        attendee_id: l.attendeeId || null,
        registration_id: l.registrationId || null,
        event_type: l.eventType,
        description: l.description,
        staff_member: l.staffMember,
        timestamp: l.timestamp,
        metadata: l.metadata || {}
      }));
      const chunkSize = 100;
      for (let i = 0; i < logRows.length; i += chunkSize) {
        const chunk = logRows.slice(i, i + chunkSize);
        await client.from('audit_logs').upsert(chunk, { onConflict: 'id' });
      }
    }

    // Mark local records as synced
    await db.attendees.where('syncStatus').equals('Saved Locally').modify({ syncStatus: 'Synced' });
    await syncPersistentJsonDb();

    return {
      attendeesPushed: attendees.length,
      paymentsPushed: payments.length,
      success: true,
      message: `Pushed ${attendees.length} attendees and ${payments.length} payments to Supabase.`
    };
  } catch (err: any) {
    console.error('Push error:', err);
    return { attendeesPushed: 0, paymentsPushed: 0, success: false, message: err.message || String(err) };
  }
}

/**
 * Pulls all records from Supabase and merges them into the local IndexedDB.
 */
export async function pullAllSupabaseToLocal(): Promise<{
  attendeesPulled: number;
  paymentsPulled: number;
  success: boolean;
  message: string;
}> {
  const client = getSupabaseClient();
  if (!client) {
    return { attendeesPulled: 0, paymentsPulled: 0, success: false, message: 'Supabase is not configured.' };
  }

  try {
    // 1. Fetch payments
    const { data: remotePayments, error: pErr } = await client
      .from('payments')
      .select('*')
      .order('created_at', { ascending: true });

    if (pErr) throw new Error(`Error fetching payments: ${pErr.message}`);

    let paymentsCount = 0;
    if (Array.isArray(remotePayments)) {
      for (const pRow of remotePayments) {
        const p = rowToPayment(pRow);
        const existing = await db.payments.get(p.id);
        if (!existing) {
          await db.payments.add(p);
          paymentsCount++;
        }
      }
    }

    // 2. Fetch attendees
    const { data: remoteAttendees, error: aErr } = await client
      .from('attendees')
      .select('*')
      .order('registration_id', { ascending: true });

    if (aErr) throw new Error(`Error fetching attendees: ${aErr.message}`);

    let attendeesCount = 0;
    if (Array.isArray(remoteAttendees)) {
      for (const aRow of remoteAttendees) {
        const incoming = rowToAttendee(aRow);
        const local = await db.attendees.get(incoming.id);

        if (!local) {
          await db.attendees.add(incoming);
          attendeesCount++;
        } else {
          // Check-in union: Checked In status takes absolute precedence
          let checkIn = local.checkInStatus;
          let checkDate = local.checkInDate;
          let checkTime = local.checkInTime;
          let checkBy = local.checkedInBy;

          if (incoming.checkInStatus === 'Checked In' && local.checkInStatus !== 'Checked In') {
            checkIn = 'Checked In';
            checkDate = incoming.checkInDate;
            checkTime = incoming.checkInTime;
            checkBy = incoming.checkedInBy;
          }

          // Last write wins for demographics
          const incomingIsNewer = !local.updatedAt || (incoming.updatedAt && incoming.updatedAt >= local.updatedAt);
          const base = incomingIsNewer ? incoming : local;

          // Re-aggregate payments
          const allPayments = await db.payments.where('attendeeId').equals(local.id).toArray();
          const paidTotal = allPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
          const due = base.amountDue || 35;
          const bal = Math.max(0, due - paidTotal);

          await db.attendees.put({
            ...base,
            amountPaid: paidTotal,
            balance: bal,
            paymentStatus: paidTotal >= due ? 'Paid / Confirmed' : paidTotal > 0 ? 'Part Paid' : 'Awaiting Payment',
            checkInStatus: checkIn,
            checkInDate: checkDate,
            checkInTime: checkTime,
            checkedInBy: checkBy,
            syncStatus: 'Synced'
          });
          attendeesCount++;
        }
      }
    }

    // 3. Fetch sequence counter
    const { data: seqRow } = await client.from('sequences').select('*').eq('id', 'reg_id_sequence').maybeSingle();
    if (seqRow) {
      const localSeq = await db.sequences.get('reg_id_sequence');
      if (!localSeq || seqRow.last_sequence > localSeq.lastSequence) {
        await db.sequences.put({
          id: seqRow.id,
          lastSequence: seqRow.last_sequence,
          prefix: seqRow.prefix,
          padding: seqRow.padding
        });
      }
    }

    await syncPersistentJsonDb();

    return {
      attendeesPulled: attendeesCount,
      paymentsPulled: paymentsCount,
      success: true,
      message: `Synchronized ${attendeesCount} attendees and ${paymentsCount} payments from cloud.`
    };
  } catch (err: any) {
    console.error('Pull error:', err);
    return { attendeesPulled: 0, paymentsPulled: 0, success: false, message: err.message || String(err) };
  }
}

/**
 * Realtime upsert of a single attendee to Supabase.
 */
export async function syncSingleAttendeeToSupabase(attendee: Attendee): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const row = attendeeToRow(attendee);
    const { error } = await client.from('attendees').upsert(row, { onConflict: 'id' });
    if (error) {
      console.warn('Could not sync attendee to Supabase:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase attendee push failed (will sync later when online):', err);
    return false;
  }
}

/**
 * Realtime insert of a single payment to Supabase.
 */
export async function syncSinglePaymentToSupabase(payment: PaymentTransaction): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const row = paymentToRow(payment);
    const { error } = await client.from('payments').upsert(row, { onConflict: 'id' });
    if (error) {
      console.warn('Could not sync payment to Supabase:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase payment push failed (will sync later when online):', err);
    return false;
  }
}

/**
 * Realtime update of sequence counter to Supabase.
 */
export async function syncSequenceToSupabase(sequence: SequenceCounter): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    await client.from('sequences').upsert({
      id: sequence.id,
      last_sequence: sequence.lastSequence,
      prefix: sequence.prefix,
      padding: sequence.padding
    }, { onConflict: 'id' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Realtime insert of an audit log event to Supabase.
 */
export async function syncAuditLogToSupabase(log: AuditEvent): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    await client.from('audit_logs').upsert({
      id: log.id,
      attendee_id: log.attendeeId || null,
      registration_id: log.registrationId || null,
      event_type: log.eventType,
      description: log.description,
      staff_member: log.staffMember,
      timestamp: log.timestamp,
      metadata: log.metadata || {}
    }, { onConflict: 'id' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Sets up Supabase Realtime channel subscription.
 * When another device (e.g. desktop) inserts or updates an attendee or payment,
 * it immediately updates the local IndexedDB, firing useLiveQuery everywhere!
 */
export function initSupabaseRealtime(
  onUpdate?: (tableName: string, payload: any) => void
): (() => void) | null {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const channel = client
      .channel('camp_live_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendees' }, async (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const incoming = rowToAttendee(payload.new);
          await db.attendees.put(incoming);
          await syncPersistentJsonDb();
          if (onUpdate) onUpdate('attendees', payload);
        } else if (payload.eventType === 'DELETE') {
          if (payload.old?.id) {
            await db.attendees.delete(payload.old.id);
            await syncPersistentJsonDb();
            if (onUpdate) onUpdate('attendees', payload);
          }
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, async (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const incoming = rowToPayment(payload.new);
          await db.payments.put(incoming);
          await syncPersistentJsonDb();
          if (onUpdate) onUpdate('payments', payload);
        }
      })
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  } catch (err) {
    console.warn('Could not initialize Supabase Realtime subscription:', err);
    return null;
  }
}

/**
 * Ready-to-run PostgreSQL SQL script for the Supabase SQL Editor.
 * Includes tables, indexes, Row Level Security, and Realtime replication.
 */
export function generateSupabaseSqlSchema(): string {
  return `-- ==========================================================
-- PROVINCIAL CAMP 2026 REGISTRATION SYSTEM - SUPABASE SCHEMA
-- Paste this entire script into:
-- Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ==========================================================

-- 1. Attendees Table
CREATE TABLE IF NOT EXISTS public.attendees (
    id TEXT PRIMARY KEY,
    registration_id TEXT UNIQUE NOT NULL,
    verification_token TEXT NOT NULL,
    full_name TEXT NOT NULL,
    gender TEXT NOT NULL,
    age INTEGER NOT NULL,
    phone_number TEXT DEFAULT '',
    church_assembly TEXT DEFAULT '',
    district_zone TEXT DEFAULT '',
    emergency_contact_name TEXT DEFAULT '',
    emergency_contact_phone TEXT DEFAULT '',
    parent_guardian_name TEXT DEFAULT '',
    parent_guardian_phone TEXT DEFAULT '',
    consent_confirmed BOOLEAN DEFAULT FALSE,
    dietary_requirements TEXT DEFAULT '',
    allergies TEXT DEFAULT '',
    medical_notes TEXT DEFAULT '',
    transport_required BOOLEAN DEFAULT FALSE,
    optional_activities JSONB DEFAULT '[]'::jsonb,
    amount_due NUMERIC(10, 2) DEFAULT 35.00,
    amount_paid NUMERIC(10, 2) DEFAULT 0.00,
    balance NUMERIC(10, 2) DEFAULT 35.00,
    payment_status TEXT NOT NULL,
    receipt_issued BOOLEAN DEFAULT FALSE,
    receipt_issued_at TIMESTAMPTZ,
    registration_date TIMESTAMPTZ NOT NULL,
    registered_by TEXT NOT NULL,
    registration_status TEXT NOT NULL DEFAULT 'Active',
    cancellation_reason TEXT,
    cancelled_at TIMESTAMPTZ,
    cancelled_by TEXT,
    check_in_status TEXT NOT NULL DEFAULT 'Not Checked In',
    check_in_date TEXT,
    check_in_time TEXT,
    checked_in_by TEXT,
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    sync_status TEXT DEFAULT 'Synced'
);

-- 2. Payments Ledger Table
CREATE TABLE IF NOT EXISTS public.payments (
    id TEXT PRIMARY KEY,
    attendee_id TEXT NOT NULL,
    registration_id TEXT NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    payment_date_time TIMESTAMPTZ NOT NULL,
    payment_method TEXT NOT NULL,
    payment_reference TEXT DEFAULT '',
    recorded_by TEXT NOT NULL,
    station_id TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    sync_status TEXT DEFAULT 'Synced'
);

-- 3. Sequences Table (Durable Sequence Counter)
CREATE TABLE IF NOT EXISTS public.sequences (
    id TEXT PRIMARY KEY,
    last_sequence INTEGER NOT NULL DEFAULT 0,
    prefix TEXT NOT NULL DEFAULT 'PC',
    padding INTEGER NOT NULL DEFAULT 4
);

-- Initial Sequence Seed
INSERT INTO public.sequences (id, last_sequence, prefix, padding)
VALUES ('reg_id_sequence', 0, 'PC', 4)
ON CONFLICT (id) DO NOTHING;

-- 4. Audit Logs Table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id TEXT PRIMARY KEY,
    attendee_id TEXT,
    registration_id TEXT,
    event_type TEXT NOT NULL,
    description TEXT NOT NULL,
    staff_member TEXT NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- 5. Indexes for Instant Lookups
CREATE INDEX IF NOT EXISTS idx_attendees_reg_id ON public.attendees(registration_id);
CREATE INDEX IF NOT EXISTS idx_attendees_full_name ON public.attendees(full_name);
CREATE INDEX IF NOT EXISTS idx_attendees_check_in ON public.attendees(check_in_status);
CREATE INDEX IF NOT EXISTS idx_payments_attendee_id ON public.payments(attendee_id);
CREATE INDEX IF NOT EXISTS idx_payments_reg_id ON public.payments(registration_id);

-- 6. Enable Row Level Security (RLS) & Allow Camp Staff (Anon) Full Access
ALTER TABLE public.attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read-write for attendees"
ON public.attendees FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow public read-write for payments"
ON public.payments FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow public read-write for sequences"
ON public.sequences FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow public read-write for audit_logs"
ON public.audit_logs FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- 7. Enable Realtime Replication for Live Multi-Device Sync
ALTER PUBLICATION supabase_realtime ADD TABLE public.attendees;
ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sequences;
`;
}
