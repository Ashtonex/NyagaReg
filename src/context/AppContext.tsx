import React, { createContext, useContext, useEffect, useState } from 'react';
import { db, DEFAULT_SETTINGS, getSettings, removeDemoData } from '../db/db';
import type { AppSettings, Attendee, StaffRole } from '../types';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  title?: string;
}

interface AppContextType {
  settings: AppSettings;
  isOnline: boolean;
  activeRole: StaffRole;
  activeStaffName: string;
  setActiveRole: (role: StaffRole, name?: string) => void;
  refreshSettings: () => Promise<void>;
  toasts: Toast[];
  showToast: (type: Toast['type'], message: string, title?: string) => void;
  dismissToast: (id: string) => void;

  // Global modals
  receiptAttendee: Attendee | null;
  openReceipt: (attendee: Attendee) => void;
  closeReceipt: () => void;

  paymentAttendee: Attendee | null;
  openPayment: (attendee: Attendee) => void;
  closePayment: () => void;

  profileAttendee: Attendee | null;
  openProfile: (attendee: Attendee) => void;
  closeProfile: () => void;

  printBatchAttendees: Attendee[] | null;
  openPrintBatch: (attendees: Attendee[]) => void;
  closePrintBatch: () => void;

  isNewRegOpen: boolean;
  openNewReg: () => void;
  closeNewReg: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [activeRole, setActiveRoleState] = useState<StaffRole>('ADMIN');
  const [activeStaffName, setActiveStaffNameState] = useState<string>('Admin');
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Modals state
  const [receiptAttendee, setReceiptAttendee] = useState<Attendee | null>(null);
  const [paymentAttendee, setPaymentAttendee] = useState<Attendee | null>(null);
  const [profileAttendee, setProfileAttendee] = useState<Attendee | null>(null);
  const [printBatchAttendees, setPrintBatchAttendees] = useState<Attendee[] | null>(null);
  const [isNewRegOpen, setIsNewRegOpen] = useState<boolean>(false);

  const refreshSettings = async () => {
    try {
      const s = await getSettings();
      setSettings(s);
      setActiveRoleState(s.activeStaffRole || 'ADMIN');
      setActiveStaffNameState(s.activeStaffName || 'Admin');
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  };

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showToast('info', 'Device is now ONLINE. Changes will sync if configured.', 'Online');
    };
    const handleOffline = () => {
      setIsOnline(false);
      showToast('warning', 'Device is OFFLINE. Offline mode is active; all data is safely saved in local IndexedDB.', 'Offline Mode');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial load: ensure no mock data persists
    refreshSettings().then(async () => {
      await removeDemoData();
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const setActiveRole = async (role: StaffRole, name?: string) => {
    setActiveRoleState(role);
    const newName = name || (role === 'ADMIN' ? 'Admin' : role === 'REGISTRAR' ? 'Registrar 1' : 'Gate Staff 1');
    setActiveStaffNameState(newName);
    await db.settings.put({
      ...settings,
      activeStaffRole: role,
      activeStaffName: newName
    });
  };

  const showToast = (type: Toast['type'], message: string, title?: string) => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, { id, type, message, title }]);
    setTimeout(() => {
      dismissToast(id);
    }, 4500);
  };

  const dismissToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  return (
    <AppContext.Provider
      value={{
        settings,
        isOnline,
        activeRole,
        activeStaffName,
        setActiveRole,
        refreshSettings,
        toasts,
        showToast,
        dismissToast,
        receiptAttendee,
        openReceipt: setReceiptAttendee,
        closeReceipt: () => setReceiptAttendee(null),
        paymentAttendee,
        openPayment: setPaymentAttendee,
        closePayment: () => setPaymentAttendee(null),
        profileAttendee,
        openProfile: setProfileAttendee,
        closeProfile: () => setProfileAttendee(null),
        printBatchAttendees,
        openPrintBatch: setPrintBatchAttendees,
        closePrintBatch: () => setPrintBatchAttendees(null),
        isNewRegOpen,
        openNewReg: () => setIsNewRegOpen(true),
        closeNewReg: () => setIsNewRegOpen(false)
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
