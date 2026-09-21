import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Attendee, AuditEvent, DatabaseBackup, PaymentTransaction, SyncDeltaPack, UserAccount } from '../types';
import { computePaymentStatus, createVerificationToken, db, getSettings, logAuditEvent, syncPersistentJsonDb } from './db';


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

  await syncPersistentJsonDb();
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

/**
 * Downloads the full database as a portable camp_database.json file.
 */
export async function downloadJsonDatabaseFile(): Promise<void> {
  const backup = await createDatabaseBackup();
  const jsonStr = JSON.stringify(backup, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const dateStr = new Date().toISOString().slice(0, 10);
  downloadBlob(blob, `camp_database_${dateStr}.json`);
}

/**
 * Restores the complete database from an uploaded JSON database file.
 */
export async function restoreJsonDatabaseFromFile(file: File): Promise<number> {
  const text = await file.text();
  const backup = JSON.parse(text);
  await restoreDatabaseBackup(backup);
  return backup.attendees?.length || 0;
}

/**
 * Exports the complete database into a multi-sheet Excel file (.xlsx)
 * Sheets: Attendees, Payment Ledger, Registrar Breakdown, Camp Summary
 */
export async function exportFullExcelDatabase(): Promise<void> {
  const settings = await getSettings();
  const attendees = await db.attendees.toArray();
  const payments = await db.payments.toArray();
  const auditLogs = await db.auditLogs.toArray();

  const workbook = XLSX.utils.book_new();

  // 1. Attendees Sheet
  const attendeeRows = attendees.map(a => ({
    'Reg ID': a.registrationId,
    'Full Name': a.fullName,
    'Gender': a.gender,
    'Age': a.age,
    'Phone': a.phoneNumber,
    'Church': a.churchAssembly,
    'District': a.districtZone || '',
    'Amount Due ($)': a.amountDue,
    'Amount Paid ($)': a.amountPaid,
    'Balance ($)': a.balance,
    'Payment Status': a.paymentStatus,
    'Registered By': a.registeredBy,
    'Registration Date': a.registrationDate ? a.registrationDate.slice(0, 10) : '',
    'Check-In Status': a.checkInStatus,
    'Check-In Date': a.checkInDate || '',
    'Checked In By': a.checkedInBy || '',
    'Emergency Contact': a.emergencyContactName,
    'Emergency Phone': a.emergencyContactPhone,
    'Dietary': a.dietaryRequirements || '',
    'Allergies': a.allergies || '',
    'Transport': a.transportRequired ? 'Yes' : 'No',
    'Registration Status': a.registrationStatus
  }));
  const wsAttendees = XLSX.utils.json_to_sheet(attendeeRows);
  XLSX.utils.book_append_sheet(workbook, wsAttendees, 'Attendees');

  // 2. Payments Ledger Sheet
  const paymentRows = payments.map(p => ({
    'Transaction ID': p.id.slice(0, 8),
    'Reg ID': p.registrationId,
    'Amount ($)': p.amount,
    'Payment Date': p.paymentDateTime ? p.paymentDateTime.slice(0, 19).replace('T', ' ') : '',
    'Method': p.paymentMethod,
    'Reference': p.paymentReference || '',
    'Recorded By': p.recordedBy,
    'Station': p.stationId || '',
    'Notes': p.notes || ''
  }));
  const wsPayments = XLSX.utils.json_to_sheet(paymentRows);
  XLSX.utils.book_append_sheet(workbook, wsPayments, 'Payment Ledger');

  // 3. Registrar Breakdown Sheet
  const registrarMap = new Map<string, { count: number; cash: number; digital: number; total: number }>();
  attendees.forEach(a => {
    const reg = a.registeredBy || 'Unknown';
    if (!registrarMap.has(reg)) {
      registrarMap.set(reg, { count: 0, cash: 0, digital: 0, total: 0 });
    }
    registrarMap.get(reg)!.count++;
  });
  payments.forEach(p => {
    const reg = p.recordedBy || 'Unknown';
    if (!registrarMap.has(reg)) {
      registrarMap.set(reg, { count: 0, cash: 0, digital: 0, total: 0 });
    }
    const rec = registrarMap.get(reg)!;
    const amt = Number(p.amount) || 0;
    rec.total += amt;
    if (p.paymentMethod === 'Cash') {
      rec.cash += amt;
    } else {
      rec.digital += amt;
    }
  });
  const registrarRows: any[] = [];
  registrarMap.forEach((val, key) => {
    registrarRows.push({
      'Registrar / Staff': key,
      'Registrations Count': val.count,
      'Physical Cash ($)': val.cash,
      'Digital / Bank ($)': val.digital,
      'Total Monies Recorded ($)': val.total
    });
  });
  const wsRegistrars = XLSX.utils.json_to_sheet(registrarRows);
  XLSX.utils.book_append_sheet(workbook, wsRegistrars, 'Staff Breakdown');

  // 4. Camp Summary
  const totalDue = attendees.reduce((acc, a) => acc + (a.amountDue || 0), 0);
  const totalPaid = attendees.reduce((acc, a) => acc + (a.amountPaid || 0), 0);
  const totalCash = payments.filter(p => p.paymentMethod === 'Cash').reduce((acc, p) => acc + (p.amount || 0), 0);
  const totalDigital = totalPaid - totalCash;
  const checkedInCount = attendees.filter(a => a.checkInStatus === 'Checked In').length;

  const summaryRows = [
    { 'Metric': 'Camp Name', 'Value': settings.campName },
    { 'Metric': 'Venue', 'Value': settings.venue },
    { 'Metric': 'Total Capacity', 'Value': settings.totalCapacity },
    { 'Metric': 'Total Active Attendees', 'Value': attendees.filter(a => a.registrationStatus === 'Active').length },
    { 'Metric': 'Checked-In Count', 'Value': checkedInCount },
    { 'Metric': 'Total Expected Monies ($)', 'Value': totalDue },
    { 'Metric': 'Total Monies Collected ($)', 'Value': totalPaid },
    { 'Metric': 'Total Physical Cash ($)', 'Value': totalCash },
    { 'Metric': 'Total Digital / Bank Transfers ($)', 'Value': totalDigital },
    { 'Metric': 'Total Outstanding Balance ($)', 'Value': Math.max(0, totalDue - totalPaid) }
  ];
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(workbook, wsSummary, 'Camp Summary');

  // 5. Audit Trail Sheet
  const auditRows = auditLogs.map(l => ({
    'Timestamp': l.timestamp ? l.timestamp.slice(0, 19).replace('T', ' ') : '',
    'Event': l.eventType,
    'Staff': l.staffMember,
    'Reg ID': l.registrationId || '',
    'Description': l.description
  }));
  const wsAudit = XLSX.utils.json_to_sheet(auditRows);
  XLSX.utils.book_append_sheet(workbook, wsAudit, 'Audit Trail');

  const nowStr = new Date().toISOString().slice(0, 10);
  const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });

  const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  downloadBlob(blob, `ProvincialCamp_2026_FullDatabase_${nowStr}.xlsx`);
}

/**
 * Generates an official, print-ready Registrar Accountability Register PDF.
 * Uses jsPDF and jspdf-autotable to list all attendees registered by the specified staff,
 * calculate the exact physical cash they must hand over, and provide physical handover signature blocks.
 */
export function generateAccountabilityPDF(
  account: UserAccount,
  attendees: Attendee[],
  payments: PaymentTransaction[]
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const dateStr = new Date().toISOString().slice(0, 10);
  const timeStr = new Date().toLocaleTimeString();

  // Filter attendees & payments for this specific registrar
  const staffAttendees = attendees.filter(a => 
    a.registeredBy === account.displayName || 
    a.registeredBy === account.accountCode ||
    a.registeredBy === account.username
  );

  const staffPayments = payments.filter(p => 
    p.recordedBy === account.displayName || 
    p.recordedBy === account.accountCode ||
    p.recordedBy === account.username
  );

  // Financial totals
  let cashTotal = 0;
  let ecocashTotal = 0;
  let bankTotal = 0;
  let otherTotal = 0;

  staffPayments.forEach(p => {
    const amt = Number(p.amount) || 0;
    if (p.paymentMethod === 'Cash') cashTotal += amt;
    else if (p.paymentMethod === 'EcoCash / Mobile Money') ecocashTotal += amt;
    else if (p.paymentMethod === 'Bank Transfer') bankTotal += amt;
    else otherTotal += amt;
  });

  const totalCollected = cashTotal + ecocashTotal + bankTotal + otherTotal;
  const totalBalance = staffAttendees.reduce((acc, a) => acc + (a.balance || 0), 0);

  // Header Banner
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, 210, 24, 'F');

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('PROVINCIAL CAMP 2026 — REGISTRAR ACCOUNTABILITY REGISTER', 14, 11);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text(`Official Handover & Audit Register • Generated: ${dateStr} ${timeStr}`, 14, 18);

  // Registrar Metadata Info Box
  doc.setFillColor(241, 245, 249); // slate-100
  doc.roundedRect(14, 28, 182, 18, 2, 2, 'F');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Registrar Account:', 18, 35);
  doc.setFont('helvetica', 'normal');
  doc.text(`${account.displayName} (${account.accountCode})`, 50, 35);

  doc.setFont('helvetica', 'bold');
  doc.text('Station / Desk:', 18, 41);
  doc.setFont('helvetica', 'normal');
  doc.text(`${account.stationId}`, 50, 41);

  doc.setFont('helvetica', 'bold');
  doc.text('Registrations Handled:', 120, 35);
  doc.setFont('helvetica', 'normal');
  doc.text(`${staffAttendees.length} Attendees`, 162, 35);

  doc.setFont('helvetica', 'bold');
  doc.text('Date of Register:', 120, 41);
  doc.setFont('helvetica', 'normal');
  doc.text(`${dateStr}`, 162, 41);

  // Financial Accountability Summary Cards
  // 1. Cash Card (Highlighted)
  doc.setFillColor(236, 253, 245); // emerald-50
  doc.setDrawColor(16, 185, 129); // emerald-500
  doc.roundedRect(14, 49, 43, 20, 2, 2, 'FD');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(4, 120, 87); // emerald-700
  doc.text('PHYSICAL CASH ON HAND', 17, 54);
  doc.setFontSize(12);
  doc.text(`US$${cashTotal.toFixed(2)}`, 17, 62);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.text('MUST HAND OVER TO ADMIN', 17, 66);

  // 2. EcoCash / Mobile
  doc.setFillColor(240, 249, 255); // sky-50
  doc.setDrawColor(14, 165, 233);
  doc.roundedRect(60, 49, 43, 20, 2, 2, 'FD');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(3, 105, 161);
  doc.text('ECOCASH / MOBILE MONEY', 63, 54);
  doc.setFontSize(12);
  doc.text(`US$${ecocashTotal.toFixed(2)}`, 63, 62);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.text('Verified digital transfers', 63, 66);

  // 3. Bank / Other
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(148, 163, 184);
  doc.roundedRect(106, 49, 43, 20, 2, 2, 'FD');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text('BANK TRANSFERS / OTHER', 109, 54);
  doc.setFontSize(12);
  doc.text(`US$${(bankTotal + otherTotal).toFixed(2)}`, 109, 62);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.text('Bank & card payments', 109, 66);

  // 4. Total Collected
  doc.setFillColor(245, 243, 255); // indigo-50
  doc.setDrawColor(129, 140, 248);
  doc.roundedRect(152, 49, 44, 20, 2, 2, 'FD');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(79, 70, 229);
  doc.text('TOTAL MONIES RECORDED', 155, 54);
  doc.setFontSize(12);
  doc.text(`US$${totalCollected.toFixed(2)}`, 155, 62);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`Balance due: US$${totalBalance.toFixed(2)}`, 155, 66);

  // Attendees Table
  const tableRows = staffAttendees.map((a, idx) => {
    // Find matching payment for this attendee
    const attPayment = staffPayments.find(p => p.attendeeId === a.id);
    return [
      String(idx + 1),
      a.registrationId,
      a.fullName,
      a.phoneNumber,
      a.churchAssembly.slice(0, 16),
      a.registrationDate ? a.registrationDate.slice(5, 10) : '',
      attPayment ? attPayment.paymentMethod.replace(' / Mobile Money', '') : (a.amountPaid > 0 ? 'Recorded' : 'Unpaid'),
      attPayment?.paymentReference || '-',
      `$${a.amountPaid.toFixed(2)}`,
      `$${a.balance.toFixed(2)}`
    ];
  });

  autoTable(doc, {
    startY: 73,
    head: [['#', 'Reg ID', 'Full Name', 'Phone Number', 'Church Assembly', 'Date', 'Method', 'Reference', 'Paid', 'Balance']],
    body: tableRows.length > 0 ? tableRows : [['-', '-', 'No registrations recorded under this account yet', '-', '-', '-', '-', '-', '$0.00', '$0.00']],
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontSize: 7.5,
      fontStyle: 'bold',
      halign: 'left',
      cellPadding: 1.8
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [30, 41, 59],
      cellPadding: 1.8
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252]
    },
    columnStyles: {
      0: { cellWidth: 7, halign: 'center' },
      1: { cellWidth: 17, fontStyle: 'bold' },
      2: { cellWidth: 34 },
      3: { cellWidth: 24 },
      4: { cellWidth: 26 },
      5: { cellWidth: 14 },
      6: { cellWidth: 20 },
      7: { cellWidth: 20 },
      8: { cellWidth: 12, halign: 'right', fontStyle: 'bold' },
      9: { cellWidth: 12, halign: 'right' }
    }
  });

  // Handover & Reconcile Signatures
  let finalY = (doc as any).lastAutoTable?.finalY || 160;
  if (finalY > 225) {
    doc.addPage();
    finalY = 20;
  } else {
    finalY += 10;
  }

  // Formal Handover Declaration
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, finalY, 182, 38, 2, 2, 'FD');

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('FORMAL CASH HANDOVER & RECONCILIATION CERTIFICATE', 18, finalY + 6);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(
    `I, the undersigned Registrar, certify that the ${staffAttendees.length} attendees listed above were registered by me, and I have handed over`,
    18, finalY + 11
  );
  doc.text(
    `the exact physical cash amount of US$${cashTotal.toFixed(2)} to the Master Admin for Provincial Camp 2026 funds.`,
    18, finalY + 15
  );

  // Registrar Signature Line
  doc.setFont('helvetica', 'bold');
  doc.text('Registrar Signature:', 18, finalY + 24);
  doc.line(48, finalY + 24, 98, finalY + 24);
  doc.setFont('helvetica', 'normal');
  doc.text(`Date: _________________`, 18, finalY + 31);

  // Master Admin Signature Line
  doc.setFont('helvetica', 'bold');
  doc.text('Master Admin Signature:', 108, finalY + 24);
  doc.line(144, finalY + 24, 190, finalY + 24);
  doc.setFont('helvetica', 'normal');
  doc.text(`Date: _________________`, 108, finalY + 31);

  // Save PDF
  const filename = `Accountability_Register_${account.accountCode}_${dateStr}.pdf`;
  doc.save(filename);
}

/**
 * Exports registrar register to a dedicated Excel file (.xlsx)
 */
export function exportAccountabilityExcel(
  account: UserAccount,
  attendees: Attendee[],
  payments: PaymentTransaction[]
): void {
  const staffAttendees = attendees.filter(a => 
    a.registeredBy === account.displayName || 
    a.registeredBy === account.accountCode ||
    a.registeredBy === account.username
  );

  const staffPayments = payments.filter(p => 
    p.recordedBy === account.displayName || 
    p.recordedBy === account.accountCode ||
    p.recordedBy === account.username
  );

  const rows = staffAttendees.map((a, idx) => {
    const attPayment = staffPayments.find(p => p.attendeeId === a.id);
    return {
      '#': idx + 1,
      'Registration ID': a.registrationId,
      'Full Name': a.fullName,
      'Phone Number': a.phoneNumber,
      'Church Assembly': a.churchAssembly,
      'Registration Date': a.registrationDate ? a.registrationDate.slice(0, 10) : '',
      'Payment Method': attPayment?.paymentMethod || (a.amountPaid > 0 ? 'Recorded' : 'Unpaid'),
      'Payment Reference': attPayment?.paymentReference || '',
      'Amount Due (USD)': a.amountDue,
      'Amount Paid (USD)': a.amountPaid,
      'Balance (USD)': a.balance,
      'Check-In Status': a.checkInStatus,
      'Registrar': account.displayName
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Registrar Register');

  const dateStr = new Date().toISOString().slice(0, 10);
  const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  downloadBlob(blob, `Accountability_Register_${account.accountCode}_${dateStr}.xlsx`);
}

