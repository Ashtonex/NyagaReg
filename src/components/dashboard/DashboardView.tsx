import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  Users, 
  DollarSign, 
  UserCheck, 
  Clock, 
  Bus, 
  Utensils, 
  Compass, 
  CheckCircle2, 
  UserPlus, 
  QrCode, 
  Sparkles 
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { db } from '../../db/db';

interface DashboardViewProps {
  onNavigate: (tab: any) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const { settings, openNewReg } = useApp();

  const attendees = useLiveQuery(() => db.attendees.toArray(), []);

  // Compute live aggregates matching Section 13
  const stats = React.useMemo(() => {
    if (!attendees) {
      return {
        total: 0,
        capacity: settings.totalCapacity || 150,
        remaining: settings.totalCapacity || 150,
        fullyPaid: 0,
        partPaid: 0,
        unpaid: 0,
        expectedRevenue: 0,
        collectedRevenue: 0,
        outstandingRevenue: 0,
        checkedIn: 0,
        notArrived: 0,
        male: 0,
        female: 0,
        minors: 0,
        transport: 0,
        dietary: 0,
        activities: 0
      };
    }

    // Only count active registrations toward capacity
    const activeAttendees = attendees.filter(a => a.registrationStatus !== 'Cancelled');
    const total = activeAttendees.length;
    const capacity = settings.totalCapacity || 150;
    const remaining = Math.max(0, capacity - total);

    let fullyPaid = 0;
    let partPaid = 0;
    let unpaid = 0;
    let expectedRevenue = 0;
    let collectedRevenue = 0;
    let outstandingRevenue = 0;
    let checkedIn = 0;
    let notArrived = 0;
    let male = 0;
    let female = 0;
    let minors = 0;
    let transport = 0;
    let dietary = 0;
    let activities = 0;

    for (const a of activeAttendees) {
      expectedRevenue += a.amountDue || 35;
      collectedRevenue += a.amountPaid || 0;
      outstandingRevenue += a.balance || 0;

      if (a.paymentStatus === 'Paid / Confirmed') fullyPaid++;
      else if (a.paymentStatus === 'Part Paid') partPaid++;
      else unpaid++;

      if (a.checkInStatus === 'Checked In') checkedIn++;
      else notArrived++;

      if (a.gender === 'Male') male++;
      else if (a.gender === 'Female') female++;

      if (a.age < (settings.adultAgeThreshold || 18)) minors++;
      if (a.transportRequired) transport++;
      if (a.dietaryRequirements && a.dietaryRequirements.trim()) dietary++;
      if (a.optionalActivities && a.optionalActivities.length > 0) activities++;
    }

    return {
      total,
      capacity,
      remaining,
      fullyPaid,
      partPaid,
      unpaid,
      expectedRevenue,
      collectedRevenue,
      outstandingRevenue,
      checkedIn,
      notArrived,
      male,
      female,
      minors,
      transport,
      dietary,
      activities
    };
  }, [attendees, settings.totalCapacity, settings.adultAgeThreshold]);

  const capacityPercent = Math.min(100, Math.round((stats.total / stats.capacity) * 100));
  const checkInPercent = stats.total > 0 ? Math.round((stats.checkedIn / stats.total) * 100) : 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* Welcome & Quick Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-2xl p-6 shadow-xl border border-slate-700">
        <div>
          <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wider uppercase bg-teal-500/20 text-teal-300 border border-teal-500/30 mb-2">
            <Sparkles className="w-3 h-3" />
            <span>Operational Console</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight">{settings.campName}</h1>
          <p className="text-xs text-slate-300 mt-1">
            Venue: <strong>{settings.venue}</strong> • Total Capacity: <strong>{settings.totalCapacity} Attendees</strong>
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => onNavigate('checkin')}
            className="flex items-center space-x-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs sm:text-sm font-bold shadow-lg shadow-emerald-600/20 transition active:scale-95 cursor-pointer"
          >
            <QrCode className="w-4 h-4" />
            <span>Scan / Check-In</span>
          </button>
          <button
            onClick={openNewReg}
            className="flex items-center space-x-2 py-2.5 px-4 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs sm:text-sm font-bold shadow-lg shadow-teal-600/20 transition active:scale-95 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ Register</span>
          </button>
        </div>
      </div>

      {/* CAPACITY & ATTENDANCE METER */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Capacity Card */}
        <div className="bg-white rounded-2xl p-6 shadow-xs border border-slate-200 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-900 flex items-center space-x-2">
              <Users className="w-4 h-4 text-teal-600" />
              <span>Camp Capacity Meter</span>
            </h3>
            <span className="text-xs font-mono font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
              {capacityPercent}% Filled
            </span>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs text-slate-600 font-medium">
              <span>Registered: <strong>{stats.total} / {stats.capacity}</strong></span>
              <span>Remaining Spaces: <strong className={stats.remaining <= 15 ? 'text-rose-600' : 'text-emerald-600'}>{stats.remaining}</strong></span>
            </div>
            {/* Progress Bar */}
            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-500 ${
                  capacityPercent >= 95 ? 'bg-rose-500' : capacityPercent >= 80 ? 'bg-amber-500' : 'bg-teal-600'
                }`}
                style={{ width: `${capacityPercent}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-center">
            <div className="p-2 bg-emerald-50 rounded-xl">
              <span className="text-[10px] uppercase font-bold text-emerald-800 block">Fully Paid</span>
              <span className="text-lg font-black text-emerald-700">{stats.fullyPaid}</span>
            </div>
            <div className="p-2 bg-amber-50 rounded-xl">
              <span className="text-[10px] uppercase font-bold text-amber-800 block">Part Paid</span>
              <span className="text-lg font-black text-amber-700">{stats.partPaid}</span>
            </div>
            <div className="p-2 bg-rose-50 rounded-xl">
              <span className="text-[10px] uppercase font-bold text-rose-800 block">Awaiting</span>
              <span className="text-lg font-black text-rose-700">{stats.unpaid}</span>
            </div>
          </div>
        </div>

        {/* Gate Check-In Progress Card */}
        <div className="bg-white rounded-2xl p-6 shadow-xs border border-slate-200 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-900 flex items-center space-x-2">
              <UserCheck className="w-4 h-4 text-emerald-600" />
              <span>Camp Arrival & Check-In Progress</span>
            </h3>
            <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              {checkInPercent}% Arrived
            </span>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs text-slate-600 font-medium">
              <span>Checked In at Gate: <strong>{stats.checkedIn}</strong></span>
              <span>Not Yet Arrived: <strong>{stats.notArrived}</strong></span>
            </div>
            {/* Progress Bar */}
            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${checkInPercent}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span className="text-xs font-semibold text-slate-700">Checked In</span>
              </div>
              <span className="text-lg font-black text-slate-900">{stats.checkedIn}</span>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Clock className="w-5 h-5 text-slate-400" />
                <span className="text-xs font-semibold text-slate-700">Not Yet Arrived</span>
              </div>
              <span className="text-lg font-black text-slate-600">{stats.notArrived}</span>
            </div>
          </div>
        </div>

      </div>

      {/* FINANCIAL OVERVIEW */}
      <div className="bg-white rounded-2xl p-6 shadow-xs border border-slate-200 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm text-slate-900 flex items-center space-x-2">
            <DollarSign className="w-4 h-4 text-emerald-600" />
            <span>Financial & Revenue Overview</span>
          </h3>
          <span className="text-xs text-slate-400 font-medium">Standard Fee: US${settings.standardCampFee || 35}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-xs uppercase font-bold text-slate-500 block">Expected Revenue</span>
            <span className="text-2xl font-black text-slate-900 mt-1 block">
              US${stats.expectedRevenue.toFixed(2)}
            </span>
            <span className="text-[11px] text-slate-400">Total active registered fees</span>
          </div>

          <div className="p-4 bg-emerald-50/80 border border-emerald-200 rounded-xl">
            <span className="text-xs uppercase font-bold text-emerald-800 block">Amount Collected</span>
            <span className="text-2xl font-black text-emerald-700 mt-1 block">
              US${stats.collectedRevenue.toFixed(2)}
            </span>
            <span className="text-[11px] text-emerald-600">
              {stats.expectedRevenue > 0 ? Math.round((stats.collectedRevenue / stats.expectedRevenue) * 100) : 0}% collected
            </span>
          </div>

          <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xl">
            <span className="text-xs uppercase font-bold text-amber-800 block">Outstanding Balance</span>
            <span className="text-2xl font-black text-amber-700 mt-1 block">
              US${stats.outstandingRevenue.toFixed(2)}
            </span>
            <span className="text-[11px] text-amber-600">Remaining to collect</span>
          </div>
        </div>
      </div>

      {/* OPERATIONAL & LOGISTICAL TOTALS */}
      <div className="bg-white rounded-2xl p-6 shadow-xs border border-slate-200 space-y-4">
        <h3 className="font-bold text-sm text-slate-900 flex items-center space-x-2">
          <Compass className="w-4 h-4 text-purple-600" />
          <span>Operational Logistics & Demographics</span>
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 text-center">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Male</span>
            <span className="text-lg font-black text-slate-800">{stats.male}</span>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Female</span>
            <span className="text-lg font-black text-slate-800">{stats.female}</span>
          </div>
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <span className="text-[10px] uppercase font-bold text-amber-800 block">Minors</span>
            <span className="text-lg font-black text-amber-700">{stats.minors}</span>
          </div>
          <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl">
            <span className="text-[10px] uppercase font-bold text-sky-800 block flex items-center justify-center space-x-1">
              <Bus className="w-3 h-3" />
              <span>Transport</span>
            </span>
            <span className="text-lg font-black text-sky-700">{stats.transport}</span>
          </div>
          <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl">
            <span className="text-[10px] uppercase font-bold text-purple-800 block flex items-center justify-center space-x-1">
              <Utensils className="w-3 h-3" />
              <span>Dietary</span>
            </span>
            <span className="text-lg font-black text-purple-700">{stats.dietary}</span>
          </div>
          <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl">
            <span className="text-[10px] uppercase font-bold text-teal-800 block">Activities</span>
            <span className="text-lg font-black text-teal-700">{stats.activities}</span>
          </div>
        </div>
      </div>

    </div>
  );
};
