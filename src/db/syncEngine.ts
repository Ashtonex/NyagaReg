import * as XLSX from 'xlsx';
import type { Attendee, AuditEvent, DatabaseBackup, PaymentTransaction, SyncDeltaPack } from '../types';
import { computePaymentStatus, createVerificationToken, db, getSettings, logAuditEvent } from './db';

export interface SyncMergeResult {
  attendeesAdded: number;
  attendeesUpdated: number;
  paymentsAdded: number;
  conflicts: string[];
}

/**
 * Creates an Administrare delta sync pack containing records modified since a given timestamp,
 * or all records if no timestamp is provided.
 */
export async function createSyncDeltaPack(sinceTimestamp?: string): Promise<SyncDeltaPack> {
  const settings = await getSettings();
  const sequence = await db.sequences.get('reg_id_sequence');

  let attendees: Attendee[];
  let payments: PaymentTransaction[];
  let auditLogs: AuditEvent[];

  if (sinceTimestamp) {
    attendees = await db.attendees
      .filter(a => !a.updatedAt || a.updatedAt >= sinceTimestamp)
      .toArray();
    payments = await db.payments
      .filter(p => !p.paymentDateTime || p.paymentDateTime >= sinceTimestamp)
      .toArray();
    auditLogs = await db.auditLogs
      .filter(l => !l.timestamp || l.timestamp >= sinceTimestamp)
      .toArray();
  } else {
    attendees = await db.attendees.toArray();
    payments = await db.payments.toArray();
    auditLogs = await db.auditLogs.toArray();
  }

  const pack: SyncDeltaPack = {
    packVersion: 'administrare-v2.0',
    stationId: settings.stationId,
    exportedAt: new Date().toISOString(),
    attendees,
    payments,
    auditLogs,
    sequenceCounter: sequence
  };

  // Mark exported attendees as Synced
  const ids = attendees.map(a => a.id);
  if (ids.length > 0) {
    await db.attendees.where('id').anyOf(ids).modify({ syncStatus: 'Synced' });
  }

  await logAuditEvent(
    'Sync completed', 
    `Exported sync delta pack with ${attendees.length} attendees and ${payments.length} payments`
  );
  return pack;
}

/**
 * Merges an incoming Administrare SyncDeltaPack into the local IndexedDB.
 */
export async function mergeSyncDeltaPack(pack: SyncDeltaPack): Promise<SyncMergeResult> {
  const result: SyncMergeResult = {
    attendeesAdded: 0,
    attendeesUpdated: 0,
    paymentsAdded: 0,
    conflicts: []
  };

  if (!pack || !pack.packVersion || !Array.isArray(pack.attendees)) {
    throw new Error('Invalid Administrare sync pack format.');
  }

  // 1. Merge payments first (append-only ledger)
  if (Array.isArray(pack.payments)) {
    for (const incomingPayment of pack.payments) {
      const existing = await db.payments.get(incomingPayment.id);
      if (!existing) {
        await db.payments.add({
          ...incomingPayment,
          syncStatus: 'Synced'
        });
        result.paymentsAdded++;
      }
    }
  }

  // 2. Merge attendees
  for (const incoming of pack.attendees) {
    const existingById = await db.attendees.get(incoming.id);
    const existingByRegId = await db.attendees.where('registrationId').equals(incoming.registrationId).first();

    if (!existingById && !existingByRegId) {
      // Completely new attendee
      await db.attendees.add({
        ...incoming,
        syncStatus: 'Synced'
      });
      result.attendeesAdded++;
    } else {
      const current = existingById || existingByRegId!;

      // Guard against collision where two different UUIDs were assigned the same human registration ID
      if (existingByRegId && existingByRegId.id !== incoming.id) {
        result.conflicts.push(`ID collision on ${incoming.registrationId}: Local "${current.fullName}" vs Incoming "${incoming.fullName}". Retained local record.`);
        continue;
      }

      // Check-in union resolution: Checked In always takes precedence
      let resolvedCheckIn = current.checkInStatus;
      let resolvedDate = current.checkInDate;
      let resolvedTime = current.checkInTime;
      let resolvedBy = current.checkedInBy;

      if (incoming.checkInStatus === 'Checked In') {
        if (current.checkInStatus !== 'Checked In') {
          resolvedCheckIn = 'Checked In';
          resolvedDate = incoming.checkInDate;
          resolvedTime = incoming.checkInTime;
          resolvedBy = incoming.checkedInBy;
        } else {
          // Both checked in - choose earlier arrival timestamp
          const curTime = `${current.checkInDate || ''} ${current.checkInTime || ''}`;
          const inTime = `${incoming.checkInDate || ''} ${incoming.checkInTime || ''}`;
          if (inTime < curTime) {
            resolvedDate = incoming.checkInDate;
            resolvedTime = incoming.checkInTime;
            resolvedBy = incoming.checkedInBy;
          }
        }
      }

      // Cancellation status resolution: Cancelled status preserved if either cancelled
      const resolvedRegStatus = (current.registrationStatus === 'Cancelled' || incoming.registrationStatus === 'Cancelled')
        ? 'Cancelled'
        : 'Active';

      // Last-Write-Wins for demographic fields
      const incomingIsNewer = !current.updatedAt || (incoming.updatedAt && incoming.updatedAt >= current.updatedAt);
      const baseRecord = incomingIsNewer ? incoming : current;

      // Recalculate financial balance from combined payments
      const allPayments = await db.payments.where('attendeeId').equals(current.id).toArray();
      const totalPaid = allPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      const amountDue = baseRecord.amountDue || 35;
      const balance = Math.max(0, amountDue - totalPaid);
      const paymentStatus = computePaymentStatus(amountDue, totalPaid);

      const merged: Attendee = {
        ...baseRecord,
        id: current.id,
        registrationId: current.registrationId,
        amountDue,
        amountPaid: totalPaid,
        balance,
        paymentStatus,
        checkInStatus: resolvedCheckIn,
        checkInDate: resolvedDate,
        checkInTime: resolvedTime,
        checkedInBy: resolvedBy,
        registrationStatus: resolvedRegStatus,
        syncStatus: 'Synced',
        updatedAt: new Date().toISOString()
      };

      await db.attendees.put(merged);
      result.attendeesUpdated++;
    }
  }

  // 3. Merge Audit Events
  if (Array.isArray(pack.auditLogs)) {
    for (const log of pack.auditLogs) {
      const existing = await db.auditLogs.get(log.id);
      if (!existing) {
        await db.auditLogs.add(log);
      }
    }
  }

  // 4. Update Sequence Counter if peer has higher sequence
  if (pack.sequenceCounter) {
    const localCounter = await db.sequences.get('reg_id_sequence');
    if (!localCounter || pack.sequenceCounter.lastSequence > localCounter.lastSequence) {
      await db.sequences.put(pack.sequenceCounter);
    }
  }

  await logAuditEvent('Sync completed', `Merged sync pack from station ${pack.stationId}: +${result.attendeesAdded} added, ${result.attendeesUpdated} updated, +${result.paymentsAdded} payments.`);
  return result;
}

/**
 * Creates a complete database snapshot file for backup.
 */
export async function createDatabaseBackup(): Promise<DatabaseBackup> {
  const settings = await getSettings();
  const sequence = await db.sequences.get('reg_id_sequence');
  const attendees = await db.attendees.toArray();
  const payments = await db.payments.toArray();
  const auditLogs = await db.auditLogs.toArray();

  const backup: DatabaseBackup = {
    backupVersion: '2.0',
    appName: 'Administrare - Provincial Camp 2026',
    timestamp: new Date().toISOString(),
    settings,
    sequenceCounter: sequence,
    attendees,
    payments,
    auditLogs
  };

  await logAuditEvent('Backup created', `Database backup generated with ${attendees.length} attendees.`);
  return backup;
}

/**
 * Restores the complete database from a backup JSON.
 */
export async function restoreDatabaseBackup(backup: DatabaseBackup): Promise<void> {
  if (!backup || !backup.appName || !Array.isArray(backup.attendees)) {
    throw new Error('Invalid backup file. Missing required Administrare structures.');
  }

  await db.transaction('rw', [db.attendees, db.payments, db.auditLogs, db.settings, db.sequences], async () => {
    await db.attendees.clear();
    await db.payments.clear();
    await db.auditLogs.clear();

    if (backup.settings) {
      await db.settings.put(backup.settings);
    }
    if (backup.sequenceCounter) {
      await db.sequences.put(backup.sequenceCounter);
    }
    if (backup.attendees && backup.attendees.length > 0) {
      await db.attendees.bulkAdd(backup.attendees);
    }
    if (backup.payments && backup.payments.length > 0) {
      await db.payments.bulkAdd(backup.payments);
    }
    if (backup.auditLogs && backup.auditLogs.length > 0) {
      await db.auditLogs.bulkAdd(backup.auditLogs);
    }
  });

  await logAuditEvent('Backup restored', `Restored database backup from ${backup.timestamp}. Total attendees: ${backup.attendees.length}`);
}

/**
 * Export attendees to Google Sheets compatible XLSX or CSV.
 */
export async function exportAttendeesToSpreadsheet(format: 'xlsx' | 'csv'): Promise<void> {
  const attendees = await db.attendees.toArray();
  const sorted = attendees.sort((a, b) => a.registrationId.localeCompare(b.registrationId));

  const rows = sorted.map(a => ({
    'Registration ID': a.registrationId,
    'Full Name': a.fullName,
    'Gender': a.gender,
    'Age': a.age,
    'Phone / WhatsApp': a.phoneNumber,
    'Church / Assembly': a.churchAssembly,
    'District / Zone': a.districtZone || '',
    'Registration Status': a.registrationStatus,
    'Payment Status': a.paymentStatus,
    'Amount Due (USD)': a.amountDue,
    'Amount Paid (USD)': a.amountPaid,
    'Balance (USD)': a.balance,
    'Receipt Issued': a.receiptIssued ? 'Yes' : 'No',
    'Check-In Status': a.checkInStatus,
    'Check-In Date': a.checkInDate || '',
    'Check-In Time': a.checkInTime || '',
    'Checked In By': a.checkedInBy || '',
    'Emergency Contact': a.emergencyContactName,
    'Emergency Phone': a.emergencyContactPhone,
    'Parent/Guardian (Minors)': a.parentGuardianName || '',
    'Guardian Phone': a.parentGuardianPhone || '',
    'Parental Consent': a.consentConfirmed ? 'Yes' : 'No',
    'Transport Required': a.transportRequired ? 'Yes' : 'No',
    'Optional Activities': (a.optionalActivities || []).join(', '),
    'Dietary Requirements': a.dietaryRequirements || '',
    'Allergies': a.allergies || '',
    'Medical Notes (Confidential)': a.medicalNotes || '',
    'Registration Date': a.registrationDate ? a.registrationDate.split('T')[0] : '',
    'Registered By': a.registeredBy,
    'Notes': a.notes || ''
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendees');

  const nowStr = new Date().toISOString().slice(0, 10);
  const filename = `ProvincialCamp_2026_Attendees_${nowStr}.${format}`;

  if (format === 'csv') {
    const csvOutput = XLSX.utils.sheet_to_csv(worksheet);
    const blob = new Blob([csvOutput], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, filename);
  } else {
    const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    downloadBlob(blob, filename);
  }
}

/**
 * Import attendees from an uploaded CSV or XLSX file with duplicate detection safeguards.
 */
export async function importAttendeesFromSpreadsheet(file: File): Promise<{ imported: number; skipped: number; duplicateWarnings: string[] }> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

  let imported = 0;
  let skipped = 0;
  const duplicateWarnings: string[] = [];
  const now = new Date().toISOString();

  for (const row of rows) {
    const regId = String(row['Registration ID'] || row['Reg ID'] || row['ID'] || '').trim();
    const fullName = String(row['Full Name'] || row['Name'] || '').trim();

    if (!regId || !fullName) {
      skipped++;
      continue;
    }

    // Safeguard 1: Duplicate Registration ID
    const existing = await db.attendees.where('registrationId').equals(regId).first();
    if (existing) {
      duplicateWarnings.push(`Skipped duplicate Registration ID ${regId} (${fullName})`);
      skipped++;
      continue;
    }

    const amountDue = Number(row['Amount Due (USD)'] || row['Amount Due'] || 35);
    const amountPaid = Number(row['Amount Paid (USD)'] || row['Amount Paid'] || 0);
    const balance = Math.max(0, amountDue - amountPaid);
    const paymentStatus = computePaymentStatus(amountDue, amountPaid);

    const checkInRaw = String(row['Check-In Status'] || row['Status'] || '').toUpperCase();
    const isCheckedIn = checkInRaw.includes('CHECKED IN') || checkInRaw.includes('YES');

    const newAttendee: Attendee = {
      id: crypto.randomUUID(),
      registrationId: regId,
      verificationToken: createVerificationToken(),
      fullName,
      gender: (['Male', 'Female'].includes(row['Gender']) ? row['Gender'] : 'Male') as any,
      age: Number(row['Age']) || 20,
      phoneNumber: String(row['Phone / WhatsApp'] || row['Phone'] || '').trim(),
      churchAssembly: String(row['Church / Assembly'] || row['Church'] || '').trim(),
      districtZone: String(row['District / Zone'] || row['District'] || '').trim(),
      emergencyContactName: String(row['Emergency Contact'] || '').trim(),
      emergencyContactPhone: String(row['Emergency Phone'] || '').trim(),
      parentGuardianName: String(row['Parent/Guardian (Minors)'] || row['Parent Name'] || '').trim(),
      parentGuardianPhone: String(row['Guardian Phone'] || '').trim(),
      consentConfirmed: String(row['Parental Consent'] || '').toLowerCase() === 'yes',
      dietaryRequirements: String(row['Dietary Requirements'] || '').trim(),
      allergies: String(row['Allergies'] || '').trim(),
      medicalNotes: String(row['Medical Notes (Confidential)'] || row['Medical Notes'] || '').trim(),
      transportRequired: String(row['Transport Required'] || '').toLowerCase() === 'yes',
      optionalActivities: String(row['Optional Activities'] || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean),
      amountDue,
      amountPaid,
      balance,
      paymentStatus,
      receiptIssued: String(row['Receipt Issued'] || '').toLowerCase() === 'yes',
      receiptIssuedAt: amountPaid > 0 ? now : null,
      registrationDate: now,
      registeredBy: 'Import',
      registrationStatus: 'Active',
      checkInStatus: isCheckedIn ? 'Checked In' : 'Not Checked In',
      checkInDate: isCheckedIn ? (row['Check-In Date'] || now.slice(0, 10)) : null,
      checkInTime: isCheckedIn ? (row['Check-In Time'] || '12:00') : null,
      checkedInBy: isCheckedIn ? (row['Checked In By'] || 'Import') : null,
      notes: String(row['Notes'] || ''),
      createdAt: now,
      updatedAt: now,
      syncStatus: 'Saved Locally'
    };

    await db.attendees.add(newAttendee);

    if (amountPaid > 0) {
      await db.payments.add({
        id: crypto.randomUUID(),
        attendeeId: newAttendee.id,
        registrationId: newAttendee.registrationId,
        amount: amountPaid,
        paymentDateTime: now,
        paymentMethod: 'Other',
        paymentReference: 'IMPORT',
        recordedBy: 'Import',
        createdAt: now,
        syncStatus: 'Saved Locally'
      });
    }

    imported++;
  }

  await logAuditEvent('Record updated', `Imported spreadsheet: +${imported} records added, ${skipped} skipped.`);
  return { imported, skipped, duplicateWarnings };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
