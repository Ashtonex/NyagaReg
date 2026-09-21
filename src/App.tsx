import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Navbar } from './components/layout/Navbar';
import { Navigation, type TabType } from './components/layout/Navigation';
import { ToastContainer } from './components/common/ToastContainer';
import { DashboardView } from './components/dashboard/DashboardView';
import { CheckInScannerView } from './components/checkin/CheckInScannerView';
import { AttendeeListView } from './components/attendees/AttendeeListView';
import { PaymentsLedgerView } from './components/payments/PaymentsLedgerView';
import { ReportsView } from './components/reports/ReportsView';
import { SyncAndBackupView } from './components/admin/SyncAndBackupView';
import { SettingsView } from './components/admin/SettingsView';
import { RegistrationFormModal } from './components/registration/RegistrationFormModal';
import { EReceiptModal } from './components/receipts/EReceiptModal';
import { PrintPassesModal } from './components/receipts/PrintPassesModal';
import { PaymentModal } from './components/payments/PaymentModal';
import { AttendeeProfileModal } from './components/attendees/AttendeeProfileModal';
import { AccountSwitcherModal } from './components/auth/AccountSwitcherModal';
import { AccountabilityModal } from './components/accountability/AccountabilityModal';
import type { Attendee } from './types';


const MainContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [singlePrintAttendee, setSinglePrintAttendee] = useState<Attendee | null>(null);

  const {
    receiptAttendee,
    closeReceipt,
    paymentAttendee,
    closePayment,
    profileAttendee,
    closeProfile,
    printBatchAttendees,
    closePrintBatch,
    isNewRegOpen,
    closeNewReg,
    openReceipt,
    openPayment
  } = useApp();

  const handleOpenPrintSingle = (attendee: Attendee) => {
    setSinglePrintAttendee(attendee);
  };

  const handleClosePrintSingle = () => {
    setSinglePrintAttendee(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20 md:pb-8 flex flex-col">
      <Navbar />
      <Navigation activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="flex-1">
        {activeTab === 'dashboard' && <DashboardView onNavigate={setActiveTab} />}
        {activeTab === 'checkin' && <CheckInScannerView />}
        {activeTab === 'register' && (
          <div className="max-w-3xl mx-auto py-6 px-4">
            <RegistrationFormModal isOpen={true} onClose={() => setActiveTab('attendees')} />
          </div>
        )}
        {activeTab === 'attendees' && <AttendeeListView />}
        {activeTab === 'payments' && <PaymentsLedgerView />}
        {activeTab === 'reports' && <ReportsView />}
        {activeTab === 'sync' && <SyncAndBackupView />}
        {activeTab === 'settings' && <SettingsView />}
      </main>

      {/* Global Modals */}
      <RegistrationFormModal isOpen={isNewRegOpen} onClose={closeNewReg} />

      <EReceiptModal
        attendee={receiptAttendee}
        onClose={closeReceipt}
        onPrint={handleOpenPrintSingle}
      />

      <PaymentModal
        attendee={paymentAttendee}
        onClose={closePayment}
      />

      <AttendeeProfileModal
        attendee={profileAttendee}
        onClose={closeProfile}
        onOpenPayment={openPayment}
        onOpenReceipt={openReceipt}
        onOpenPrintSingle={handleOpenPrintSingle}
      />

      {/* Batch Print Passes Modal (3-4 per A4 sheet) */}
      <PrintPassesModal
        attendees={printBatchAttendees}
        onClose={closePrintBatch}
      />

      {/* Single Print Pass Modal (3-4 per A4 format) */}
      {singlePrintAttendee && (
        <PrintPassesModal
          attendees={[singlePrintAttendee]}
          onClose={handleClosePrintSingle}
        />
      )}

      {/* Staff Account Switcher PIN Modal */}
      <AccountSwitcherModal />

      {/* Registrar Accountability Register & Handover PDF Modal */}
      <AccountabilityModal />

      {/* Global Notifications */}
      <ToastContainer />
    </div>
  );
};


export function App() {
  return (
    <AppProvider>
      <MainContent />
    </AppProvider>
  );
}

export default App;
