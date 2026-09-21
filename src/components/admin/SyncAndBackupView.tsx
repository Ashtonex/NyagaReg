import React, { useState, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  RefreshCw, 
  Download, 
  Upload, 
  Database, 
  FileSpreadsheet, 
  CheckCircle2, 
  Trash2, 
  Sparkles, 
  Radio, 
  ShieldAlert 
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { db, seedDemoData, removeDemoData, clearAllDatabaseRecords } from '../../db/db';
import { 
  createSyncDeltaPack, 
  mergeSyncDeltaPack, 
  createDatabaseBackup, 
  restoreDatabaseBackup, 
  exportAttendeesToSpreadsheet, 
  importAttendeesFromSpreadsheet, 
  downloadBlob,
  downloadJsonDatabaseFile,
  exportFullExcelDatabase,
  restoreJsonDatabaseFromFile,
  type SyncMergeResult
} from '../../db/syncEngine';
import type { DatabaseBackup } from '../../types';

export const SyncAndBackupView: React.FC = () => {
  const { settings, activeRole, showToast } = useApp();

  const [mergeSummary, setMergeSummary] = useState<SyncMergeResult | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Restore Modal State (Section 16)
  const [pendingRestoreBackup, setPendingRestoreBackup] = useState<DatabaseBackup | null>(null);
  const [createBackupFirst, setCreateBackupFirst] = useState<boolean>(true);

  const fileInputSyncRef = useRef<HTMLInputElement>(null);
  const fileInputBackupRef = useRef<HTMLInputElement>(null);
  const fileInputSpreadsheetRef = useRef<HTMLInputElement>(null);
  const fileInputJsonRef = useRef<HTMLInputElement>(null);

  const attendees = useLiveQuery(() => db.attendees.toArray(), []);
  const payments = useLiveQuery(() => db.payments.toArray(), []);


  const isAdmin = activeRole === 'ADMIN';

  // 1. Export Administrare Sync Delta Pack (.adminpack / JSON)
  const handleExportSyncPack = async () => {
    setIsProcessing(true);
    try {
      const pack = await createSyncDeltaPack();
      const json = JSON.stringify(pack, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const nowStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
      const filename = `Administrare_${settings.stationId}_Sync_${nowStr}.adminpack`;
      downloadBlob(blob, filename);
      showToast('success', `Sync pack exported with ${pack.attendees.length} attendees & ${pack.payments.length} payments`);
    } catch (err: any) {
      showToast('error', `Failed to export sync pack: ${err.message || err}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // 2. Import Administrare Sync Pack
  const handleImportSyncPackFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const text = ev.target?.result as string;
        const pack = JSON.parse(text);
        setIsProcessing(true);
        const result = await mergeSyncDeltaPack(pack);
        setMergeSummary(result);
        showToast('success', `Sync complete: +${result.attendeesAdded} added, ${result.attendeesUpdated} updated, +${result.paymentsAdded} payments merged.`);
      } catch (err: any) {
        showToast('error', `Sync import failed: ${err.message || err}`);
      } finally {
        setIsProcessing(false);
        if (fileInputSyncRef.current) fileInputSyncRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  // 3. Export Full Database Backup (Section 16: timestamped ProvincialCamp_Backup_YYYY-MM-DD_HHMM)
  const handleExportFullBackup = async () => {
    setIsProcessing(true);
    try {
      const backup = await createDatabaseBackup();
      const json = JSON.stringify(backup, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const datePart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const timePart = `${pad(now.getHours())}${pad(now.getMinutes())}`;
      const filename = `ProvincialCamp_Backup_${datePart}_${timePart}.json`;

      downloadBlob(blob, filename);
      showToast('success', `Full database backup exported (${backup.attendees.length} records) as ${filename}`);
    } catch (err: any) {
      showToast('error', `Backup failed: ${err.message || err}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadJsonFile = async () => {
    setIsProcessing(true);
    try {
      await downloadJsonDatabaseFile();
      showToast('success', 'Full camp database downloaded as camp_database.json');
    } catch (err: any) {
      showToast('error', `Failed to download JSON: ${err.message || err}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadFullExcel = async () => {
    setIsProcessing(true);
    try {
      await exportFullExcelDatabase();
      showToast('success', 'Complete database exported as multi-sheet Excel (.xlsx)');
    } catch (err: any) {
      showToast('error', `Failed to export Excel: ${err.message || err}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRestoreJsonFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window.confirm('Restore database from this JSON file? Existing local records will be synchronized.')) {
      if (fileInputJsonRef.current) fileInputJsonRef.current.value = '';
      return;
    }

    setIsProcessing(true);
    try {
      const count = await restoreJsonDatabaseFromFile(file);
      showToast('success', `Restored ${count} attendees from JSON database file.`);
    } catch (err: any) {
      showToast('error', `Restore failed: ${err.message || err}`);
    } finally {
      setIsProcessing(false);
      if (fileInputJsonRef.current) fileInputJsonRef.current.value = '';
    }
  };


  // 4. Restore Full Database Backup with explicit safeguards (Section 16)
  const handleSelectBackupFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const backup: DatabaseBackup = JSON.parse(text);
        if (!backup.appName || !Array.isArray(backup.attendees)) {
          showToast('error', 'Invalid backup file structure.');
          return;
        }
        setPendingRestoreBackup(backup);
      } catch (err: any) {
        showToast('error', `Error reading backup file: ${err.message || err}`);
      } finally {
        if (fileInputBackupRef.current) fileInputBackupRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmRestore = async () => {
    if (!pendingRestoreBackup) return;
    setIsProcessing(true);

    try {
      if (createBackupFirst) {
        await handleExportFullBackup();
      }

      await restoreDatabaseBackup(pendingRestoreBackup);
      showToast('success', `Database restored successfully. (${pendingRestoreBackup.attendees.length} attendees)`);
      setPendingRestoreBackup(null);
    } catch (err: any) {
      showToast('error', `Restore failed: ${err.message || err}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // 5. Spreadsheet Import
  const handleImportSpreadsheetFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsProcessing(true);
      const res = await importAttendeesFromSpreadsheet(file);
      showToast('success', `Spreadsheet imported: ${res.imported} new records added, ${res.skipped} skipped.`);
      if (res.duplicateWarnings.length > 0) {
        showToast('warning', `Duplicate warnings: ${res.duplicateWarnings.slice(0, 3).join(', ')}`);
      }
    } catch (err: any) {
      showToast('error', `Spreadsheet import failed: ${err.message || err}`);
    } finally {
      setIsProcessing(false);
      if (fileInputSpreadsheetRef.current) fileInputSpreadsheetRef.current.value = '';
    }
  };

  // 6. Test Data Tools matching Section 21
  const handleSeedDemo = async () => {
    try {
      await seedDemoData();
      showToast('success', 'Demo attendees seeded (PC-0001 to PC-0004)');
    } catch (err: any) {
      showToast('error', `Error seeding demo data: ${err.message || err}`);
    }
  };

  const handleRemoveDemo = async () => {
    const confirm = window.confirm('Remove demo test records (PC-0001 through PC-0004)? This will not affect real attendees.');
    if (!confirm) return;

    try {
      const count = await removeDemoData();
      showToast('info', `Removed ${count} demo attendee records from database.`);
    } catch (err: any) {
      showToast('error', `Error removing demo data: ${err.message || err}`);
    }
  };

  const handleClearAll = async () => {
    const confirm = window.confirm('DANGER: This will delete all attendee records and payment ledgers from this device. Are you sure?');
    if (!confirm) return;

    try {
      await clearAllDatabaseRecords();
      showToast('warning', 'All attendee and payment records cleared from database.');
    } catch (err: any) {
      showToast('error', `Error clearing data: ${err.message || err}`);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* Title */}
      <div>
        <h2 className="text-xl font-black text-slate-900 flex items-center space-x-2">
          <RefreshCw className="w-6 h-6 text-teal-600" />
          <span>BACKUP / SYNC</span>
        </h2>
        <p className="text-xs text-slate-500">
          Multi-device offline synchronization, Google Sheets export/import, and database snapshots.
        </p>
      </div>

      {/* Sync Merge Summary Banner */}
      {mergeSummary && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-xs text-emerald-950 space-y-2 animate-in fade-in">
          <div className="flex items-center space-x-2 font-bold text-sm text-emerald-900">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <span>Sync Reconciliation Report</span>
          </div>
          <div className="grid grid-cols-3 gap-2 py-2">
            <div className="bg-white p-2.5 rounded-xl border border-emerald-200 text-center">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">New Attendees</span>
              <span className="text-base font-black text-emerald-700">+{mergeSummary.attendeesAdded}</span>
            </div>
            <div className="bg-white p-2.5 rounded-xl border border-emerald-200 text-center">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Records Updated</span>
              <span className="text-base font-black text-teal-700">{mergeSummary.attendeesUpdated}</span>
            </div>
            <div className="bg-white p-2.5 rounded-xl border border-emerald-200 text-center">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Payments Merged</span>
              <span className="text-base font-black text-emerald-700">+{mergeSummary.paymentsAdded}</span>
            </div>
          </div>
          {mergeSummary.conflicts.length > 0 && (
            <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900">
              <span className="font-bold block mb-1">Collision Warnings:</span>
              <ul className="list-disc list-inside space-y-0.5">
                {mergeSummary.conflicts.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* SECTION 0: LOCAL JSON DATABASE & EXCEL WORKBOOK */}
      <div className="bg-gradient-to-br from-teal-900 to-slate-900 text-white rounded-2xl p-6 shadow-md border border-teal-800/60 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-md bg-teal-500/20 text-teal-300 text-[10px] font-bold uppercase tracking-wider mb-2 border border-teal-500/30">
              <Database className="w-3 h-3" />
              <span>Offline Database Engine</span>
            </div>
            <h3 className="text-lg font-black tracking-tight text-white">
              Persistent Camp Database (JSON & Multi-Sheet Excel)
            </h3>
            <p className="text-xs text-slate-300 mt-1 max-w-xl">
              All registrations and payments are saved permanently into local IndexedDB and mirrored to a persistent local JSON store in localStorage. You can download the JSON database file or the complete Excel workbook anytime.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-xs font-mono font-bold bg-slate-800 text-teal-300 px-3 py-1.5 rounded-lg border border-slate-700">
              {attendees?.length || 0} Attendees • {payments?.length || 0} Payments
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          {/* Download JSON Database */}
          <button
            onClick={handleDownloadJsonFile}
            className="flex items-center justify-center space-x-2 p-3 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-bold transition shadow-sm active:scale-95 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Download JSON Database</span>
          </button>

          {/* Download Full Excel */}
          <button
            onClick={handleDownloadFullExcel}
            className="flex items-center justify-center space-x-2 p-3 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition shadow-sm active:scale-95 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Download Full Excel (.xlsx)</span>
          </button>

          {/* Restore JSON Database */}
          <button
            onClick={() => fileInputJsonRef.current?.click()}
            className="flex items-center justify-center space-x-2 p-3 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-xl text-xs font-bold transition shadow-sm active:scale-95 cursor-pointer"
          >
            <Upload className="w-4 h-4 text-teal-400" />
            <span>Restore from JSON File</span>
          </button>
          <input
            ref={fileInputJsonRef}
            type="file"
            accept=".json"
            onChange={handleRestoreJsonFile}
            className="hidden"
          />
        </div>
      </div>

      {/* SECTION 1: ADMINISTRARAE MULTI-DEVICE OFFLINE SYNC */}
      <div className="bg-white rounded-2xl p-6 shadow-xs border border-slate-200 space-y-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center font-bold">
                <Radio className="w-4 h-4" />
              </div>
              <h3 className="font-bold text-base text-slate-900">
                Administrare Multi-Device Offline Sync
              </h3>
            </div>
            <p className="text-xs text-slate-500">
              Transfer registrations, payments, and check-ins between staff devices over Bluetooth, Local Wi-Fi, AirDrop, or WhatsApp without losing records.
            </p>
          </div>
          <span className="text-xs font-mono font-bold bg-teal-50 text-teal-800 px-3 py-1 rounded-lg border border-teal-200">
            Station: {settings.stationId}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          {/* Export Sync Pack */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col justify-between space-y-3">
            <div>
              <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider">
                1. Export Sync Delta Pack
              </h4>
              <p className="text-xs text-slate-500 mt-1">
                Generates an <code>.adminpack</code> file with your station's latest records to share with other staff devices.
              </p>
            </div>
            <button
              onClick={handleExportSyncPack}
              disabled={isProcessing}
              className="w-full py-2.5 px-4 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow-xs transition active:scale-98 cursor-pointer flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>SYNC NOW / Export Pack</span>
            </button>
          </div>

          {/* Import Sync Pack */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col justify-between space-y-3">
            <div>
              <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider">
                2. Merge Peer Sync Pack
              </h4>
              <p className="text-xs text-slate-500 mt-1">
                Select an <code>.adminpack</code> received from another registrar or gate device to safely merge without overwriting existing data.
              </p>
            </div>
            <div>
              <input
                ref={fileInputSyncRef}
                type="file"
                accept=".adminpack,.json"
                onChange={handleImportSyncPackFile}
                className="hidden"
              />
              <button
                onClick={() => fileInputSyncRef.current?.click()}
                disabled={isProcessing}
                className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold shadow-xs transition active:scale-98 cursor-pointer flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                <span>Import & Merge Sync Pack</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: GOOGLE SHEETS & EXCEL */}
      <div className="bg-white rounded-2xl p-6 shadow-xs border border-slate-200 space-y-4">
        <div className="flex items-center space-x-2">
          <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
          <h3 className="font-bold text-base text-slate-900">
            Google Sheets & Excel Movement
          </h3>
        </div>
        <p className="text-xs text-slate-500">
          Export registration tables formatted for direct upload to Google Drive / Google Sheets, or import approved spreadsheet files.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <button
            onClick={() => exportAttendeesToSpreadsheet('xlsx')}
            className="p-3 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-900 flex items-center justify-center space-x-2 transition cursor-pointer"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            <span>EXPORT XLSX</span>
          </button>

          <button
            onClick={() => exportAttendeesToSpreadsheet('csv')}
            className="p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 flex items-center justify-center space-x-2 transition cursor-pointer"
          >
            <Download className="w-4 h-4 text-slate-600" />
            <span>EXPORT CSV</span>
          </button>

          <div>
            <input
              ref={fileInputSpreadsheetRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleImportSpreadsheetFile}
              className="hidden"
            />
            <button
              onClick={() => fileInputSpreadsheetRef.current?.click()}
              className="w-full p-3 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 flex items-center justify-center space-x-2 transition cursor-pointer"
            >
              <Upload className="w-4 h-4 text-slate-600" />
              <span>IMPORT CSV/XLSX</span>
            </button>
          </div>
        </div>
      </div>

      {/* SECTION 3: FULL DATABASE BACKUP & RESTORE (Section 16) */}
      {isAdmin && (
        <div className="bg-white rounded-2xl p-6 shadow-xs border border-slate-200 space-y-4">
          <div className="flex items-center space-x-2">
            <Database className="w-5 h-5 text-indigo-600" />
            <h3 className="font-bold text-base text-slate-900">
              Full Database Backup & Safe Restore
            </h3>
          </div>
          <p className="text-xs text-slate-500">
            Create an absolute snapshot including attendees, payments, audit events, settings, sequence counters, and sync metadata.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <button
              onClick={handleExportFullBackup}
              className="p-3 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl text-xs font-bold text-indigo-950 flex items-center justify-center space-x-2 transition cursor-pointer"
            >
              <Download className="w-4 h-4 text-indigo-600" />
              <span>BACKUP DATA (.json)</span>
            </button>

            <div>
              <input
                ref={fileInputBackupRef}
                type="file"
                accept=".json"
                onChange={handleSelectBackupFile}
                className="hidden"
              />
              <button
                onClick={() => fileInputBackupRef.current?.click()}
                className="w-full p-3 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl text-xs font-bold text-rose-950 flex items-center justify-center space-x-2 transition cursor-pointer"
              >
                <Upload className="w-4 h-4 text-rose-600" />
                <span>RESTORE BACKUP</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 4: TEST DATA & DEMO MANAGER (Section 21) */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <h3 className="font-bold text-sm text-slate-900">
              Demo Data Manager
            </h3>
          </div>
          <span className="text-xs text-slate-500">
            Active Records: <strong>{attendees?.length || 0} attendees</strong>, <strong>{payments?.length || 0} payments</strong>
          </span>
        </div>

        <p className="text-xs text-slate-500">
          Manage sample development records (PC-0001 Fully Paid, PC-0002 Part Paid, PC-0003 Awaiting Payment, PC-0004 Checked In).
        </p>

        <div className="flex flex-wrap gap-3 pt-1">
          <button
            onClick={handleRemoveDemo}
            className="px-4 py-2 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-xl text-xs font-bold text-amber-900 transition cursor-pointer"
          >
            REMOVE DEMO DATA
          </button>

          <button
            onClick={handleSeedDemo}
            className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl text-xs font-medium text-slate-700 transition cursor-pointer"
          >
            Seed 4 Demo Attendees
          </button>

          {isAdmin && (
            <button
              onClick={handleClearAll}
              className="px-4 py-2 bg-rose-100 hover:bg-rose-200 border border-rose-300 rounded-xl text-xs font-bold text-rose-800 transition cursor-pointer flex items-center space-x-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear All Database Records</span>
            </button>
          )}
        </div>
      </div>

      {/* Prominent Restore Warning Modal (Section 16) */}
      {pendingRestoreBackup && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center space-x-2.5 text-rose-700 font-bold text-base">
              <ShieldAlert className="w-6 h-6 flex-shrink-0" />
              <span>Confirm Database Restoration</span>
            </div>

            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-950 space-y-2">
              <p className="font-bold">
                WARNING: Restoring will replace the active local IndexedDB database with records from:
              </p>
              <div className="font-mono text-[11px] bg-white/80 p-2 rounded border border-rose-200">
                Backup Timestamp: {pendingRestoreBackup.timestamp}<br />
                Attendees: {pendingRestoreBackup.attendees.length}<br />
                Payments: {pendingRestoreBackup.payments?.length || 0}
              </div>
              <p>
                Any local registrations made since this backup was generated will be replaced. Never silently overwrite data.
              </p>
            </div>

            <label className="flex items-center space-x-2 text-xs font-semibold text-slate-800 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={createBackupFirst}
                onChange={e => setCreateBackupFirst(e.target.checked)}
                className="rounded text-teal-600 focus:ring-teal-500"
              />
              <span>Create backup of current active database before restoring (Recommended)</span>
            </label>

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setPendingRestoreBackup(null)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRestore}
                disabled={isProcessing}
                className="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white rounded-xl text-xs font-bold shadow transition cursor-pointer disabled:opacity-50"
              >
                {isProcessing ? 'Restoring...' : 'Authorize & Restore Database'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
