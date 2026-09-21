import React, { useState, useEffect } from 'react';
import { Settings, Save, Shield, Tent, Radio, Hash } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { db, updateSettings, setRegistrationSequenceCounter } from '../../db/db';

export const SettingsView: React.FC = () => {
  const { settings, refreshSettings, activeRole, showToast } = useApp();

  const [campName, setCampName] = useState<string>(settings.campName || 'Provincial Camp 2026');
  const [venue, setVenue] = useState<string>(settings.venue || 'WildGeo Nyanga');
  const [standardCampFee, setStandardCampFee] = useState<number>(settings.standardCampFee || 35);
  const [currency, setCurrency] = useState<string>(settings.currency || 'USD');
  const [totalCapacity, setTotalCapacity] = useState<number>(settings.totalCapacity || 150);
  const [stationId, setStationId] = useState<string>(settings.stationId || 'STATION-A');
  const [registrationIdPrefix, setRegistrationIdPrefix] = useState<string>(settings.registrationIdPrefix || 'PC');
  const [registrationIdPadding, setRegistrationIdPadding] = useState<number>(settings.registrationIdPadding || 4);
  const [adultAgeThreshold, setAdultAgeThreshold] = useState<number>(settings.adultAgeThreshold || 18);
  const [activeStaffName, setActiveStaffName] = useState<string>(settings.activeStaffName || 'Admin');
  const [notes, setNotes] = useState<string>(settings.notes || 'WildGeo Nyanga. Transport & optional activities are separate.');

  // Sequence Migration State
  const [currentSequence, setCurrentSequence] = useState<number>(0);
  const [newSequenceNumber, setNewSequenceNumber] = useState<number | ''>('');
  const [sequenceMigrationReason, setSequenceMigrationReason] = useState<string>('');

  const [isSaving, setIsSaving] = useState<boolean>(false);
  const isAdmin = activeRole === 'ADMIN';

  useEffect(() => {
    loadSequence();
  }, []);

  const loadSequence = async () => {
    const seq = await db.sequences.get('reg_id_sequence');
    if (seq) {
      setCurrentSequence(seq.lastSequence);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await updateSettings({
        campName: campName.trim(),
        venue: venue.trim(),
        standardCampFee,
        currency: currency.trim(),
        totalCapacity,
        stationId: stationId.trim().toUpperCase(),
        registrationIdPrefix: registrationIdPrefix.trim().toUpperCase(),
        registrationIdPadding,
        adultAgeThreshold,
        activeStaffName: activeStaffName.trim(),
        notes: notes.trim()
      });
      await refreshSettings();
      showToast('success', 'Camp settings updated successfully');
    } catch (err: any) {
      showToast('error', `Failed to save settings: ${err.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleMigrateSequence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      showToast('error', 'Only administrators can migrate the registration ID sequence counter.');
      return;
    }
    const nextSeq = typeof newSequenceNumber === 'number' ? newSequenceNumber : 0;
    if (nextSeq <= 0) {
      showToast('error', 'Please enter a valid sequence number greater than zero.');
      return;
    }
    if (!sequenceMigrationReason.trim()) {
      showToast('error', 'Please provide a reason for migrating the sequence counter.');
      return;
    }

    try {
      await setRegistrationSequenceCounter(nextSeq, sequenceMigrationReason.trim());
      await loadSequence();
      setNewSequenceNumber('');
      setSequenceMigrationReason('');
      showToast('success', `Sequence migrated successfully. Next ID will start at #${nextSeq}`);
    } catch (err: any) {
      showToast('error', `Migration failed: ${err.message || err}`);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* Title */}
      <div>
        <h2 className="text-xl font-black text-slate-900 flex items-center space-x-2">
          <Settings className="w-6 h-6 text-teal-600" />
          <span>Admin Settings & Configuration</span>
        </h2>
        <p className="text-xs text-slate-500">
          Configure event details, registration fees, ID counters, and station identifiers.
        </p>
      </div>

      <form onSubmit={handleSaveSettings} className="bg-white rounded-2xl p-6 shadow-xs border border-slate-200 space-y-6">
        
        {/* Section 1: Event Details */}
        <div>
          <div className="border-b border-slate-200 pb-2 mb-4 flex items-center space-x-2">
            <Tent className="w-4 h-4 text-teal-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">1. Camp Information</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Camp Name</label>
              <input
                type="text"
                required
                value={campName}
                onChange={e => setCampName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Venue Location</label>
              <input
                type="text"
                required
                value={venue}
                onChange={e => setVenue(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Standard Camp Fee</label>
              <div className="flex space-x-2">
                <input
                  type="number"
                  min="0"
                  required
                  value={standardCampFee}
                  onChange={e => setStandardCampFee(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <input
                  type="text"
                  value={currency}
                  onChange={e => setCurrency(e.target.value)}
                  className="w-20 px-2 py-2 border border-slate-300 rounded-lg text-xs font-bold uppercase text-center bg-slate-50"
                />
              </div>
              <span className="text-[10px] text-slate-400">Includes accommodation, 6 meals, core programme. Excludes transport & optional activities.</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Total Capacity Target</label>
              <input
                type="number"
                min="1"
                required
                value={totalCapacity}
                onChange={e => setTotalCapacity(parseInt(e.target.value, 10) || 150)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <span className="text-[10px] text-slate-400">Default: 150. Requires Admin override to exceed.</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Adult Age Threshold</label>
              <input
                type="number"
                min="1"
                max="30"
                value={adultAgeThreshold}
                onChange={e => setAdultAgeThreshold(parseInt(e.target.value, 10) || 18)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <span className="text-[10px] text-slate-400">Attendees under this age are classified as minors requiring guardian consent.</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Device Station ID</label>
              <input
                type="text"
                value={stationId}
                onChange={e => setStationId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold uppercase focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Registration ID Format */}
        <div>
          <div className="border-b border-slate-200 pb-2 mb-4 flex items-center space-x-2">
            <Radio className="w-4 h-4 text-teal-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              2. Registration ID Format (Default: PC-0001)
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">ID Prefix</label>
              <input
                type="text"
                required
                value={registrationIdPrefix}
                onChange={e => setRegistrationIdPrefix(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-teal-500 uppercase"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Zero Padding Digits</label>
              <input
                type="number"
                min="3"
                max="6"
                value={registrationIdPadding}
                onChange={e => setRegistrationIdPadding(parseInt(e.target.value, 10) || 4)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <span className="text-[10px] text-slate-400">4 digits formats as PC-0001 to PC-0150.</span>
            </div>
          </div>
        </div>

        {/* Section 3: Staff & Disclaimer */}
        <div>
          <div className="border-b border-slate-200 pb-2 mb-4 flex items-center space-x-2">
            <Shield className="w-4 h-4 text-teal-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">3. Staff Profile & Receipt Notices</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Default Staff Name</label>
              <input
                type="text"
                value={activeStaffName}
                onChange={e => setActiveStaffName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Receipt Notice</label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <span className="text-[10px] text-slate-400">Disclosed on smartphone and printed receipts.</span>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div>
          <button
            type="submit"
            disabled={isSaving}
            className="w-full sm:w-auto px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow transition active:scale-98 cursor-pointer flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Saving Settings...' : 'Save Camp Configuration'}</span>
          </button>
        </div>

      </form>

      {/* Section 4: Durable Sequence Counter Migration (Admin Only) */}
      {isAdmin && (
        <div className="bg-white rounded-2xl p-6 shadow-xs border border-slate-200 space-y-4">
          <div className="flex items-center space-x-2">
            <Hash className="w-5 h-5 text-indigo-600" />
            <h3 className="font-bold text-sm text-slate-900">
              Durable Sequence Counter Manager (Protected Admin Feature)
            </h3>
          </div>
          <p className="text-xs text-slate-500">
            Current highest recorded sequence number is <strong>#{currentSequence}</strong> (Next ID: <strong>{registrationIdPrefix}-{String(currentSequence + 1).padStart(registrationIdPadding, '0')}</strong>).
            Sequence migration allows shifting the ID sequence counter with an audited reason.
          </p>

          <form onSubmit={handleMigrateSequence} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Set Next Sequence #</label>
                <input
                  type="number"
                  min="1"
                  placeholder={`e.g. ${currentSequence + 10}`}
                  value={newSequenceNumber}
                  onChange={e => setNewSequenceNumber(e.target.value ? parseInt(e.target.value, 10) : '')}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Audit Log Migration Reason *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Reconciled with remote workbook batch #2"
                  value={sequenceMigrationReason}
                  onChange={e => setSequenceMigrationReason(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
                />
              </div>
            </div>

            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold cursor-pointer"
            >
              Migrate Sequence Counter
            </button>
          </form>
        </div>
      )}

    </div>
  );
};
