import React, { createContext, useContext, useEffect, useState } from 'react';
import { db, DEFAULT_SETTINGS, getSettings, hydrateFromPersistentJsonDb, syncPersistentJsonDb } from '../db/db';
import { DEFAULT_ACCOUNT, findAccountById, HARDCODED_ACCOUNTS, verifyAccountPin } from '../db/accounts';
import { getSupabaseConfig, getSupabaseClient } from '../db/supabase';
import { pullAllSupabaseToLocal, pushAllLocalToSupabase, initSupabaseRealtime } from '../db/supabaseSync';
import type { AppSettings, Attendee, StaffRole, UserAccount } from '../types';

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

  // Staff Account & Scoping
  currentAccount: UserAccount;
  allAccounts: UserAccount[];
  switchAccount: (accountId: string, pin: string) => boolean;
  quickSwitchAccountByAdmin: (accountId: string) => void;
  activeRegistrarFilter: string; // 'ALL' or specific accountCode / displayName
  setActiveRegistrarFilter: (filter: string) => void;

  // Authentication & Session Gate
  isAuthenticated: boolean;
  loginStaff: (account: UserAccount) => void;
  logoutStaff: () => void;

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

  isAccountSwitchOpen: boolean;
  openAccountSwitch: () => void;
  closeAccountSwitch: () => void;

  isAccountabilityOpen: boolean;
  accountabilityTargetAccount: UserAccount | null;
  openAccountability: (account?: UserAccount) => void;
  closeAccountability: () => void;

  // Cloud Database Sync (Supabase)
  cloudSyncStatus: 'connected' | 'offline' | 'syncing' | 'unconfigured';
  isCloudConnected: boolean;
  syncWithCloud: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  // Load saved user account or fallback to Master Admin
  const [currentAccount, setCurrentAccount] = useState<UserAccount>(() => {
    try {
      const savedId = localStorage.getItem('administrare_active_account_id');
      if (savedId) {
        const found = findAccountById(savedId);
        if (found) return found;
      }
    } catch (e) {
      // Local storage unavailable
    }
    return DEFAULT_ACCOUNT;
  });

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    try {
      const session = sessionStorage.getItem('administrare_auth_session');
      return Boolean(session);
    } catch (e) {
      return false;
    }
  });

  const [activeRole, setActiveRoleState] = useState<StaffRole>(currentAccount.role);
  const [activeStaffName, setActiveStaffNameState] = useState<string>(currentAccount.displayName);
  const [activeRegistrarFilter, setActiveRegistrarFilter] = useState<string>('ALL');
  const [toasts, setToasts] = useState<Toast[]>([]);

  const loginStaff = (account: UserAccount) => {
    setCurrentAccount(account);
    setActiveRoleState(account.role);
    setActiveStaffNameState(account.displayName);
    setIsAuthenticated(true);
    try {
      sessionStorage.setItem('administrare_auth_session', account.id);
      localStorage.setItem('administrare_active_account_id', account.id);
    } catch (e) {}
  };

  const logoutStaff = () => {
    setIsAuthenticated(false);
    try {
      sessionStorage.removeItem('administrare_auth_session');
    } catch (e) {}
  };


  // Modals state
  const [receiptAttendee, setReceiptAttendee] = useState<Attendee | null>(null);
  const [paymentAttendee, setPaymentAttendee] = useState<Attendee | null>(null);
  const [profileAttendee, setProfileAttendee] = useState<Attendee | null>(null);
  const [printBatchAttendees, setPrintBatchAttendees] = useState<Attendee[] | null>(null);
  const [isNewRegOpen, setIsNewRegOpen] = useState<boolean>(false);
  const [isAccountSwitchOpen, setIsAccountSwitchOpen] = useState<boolean>(false);
  const [isAccountabilityOpen, setIsAccountabilityOpen] = useState<boolean>(false);
  const [accountabilityTargetAccount, setAccountabilityTargetAccount] = useState<UserAccount | null>(null);

  const refreshSettings = async () => {
    try {
      const s = await getSettings();
      setSettings(s);
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  };

  const [cloudSyncStatus, setCloudSyncStatus] = useState<'connected' | 'offline' | 'syncing' | 'unconfigured'>(() => {
    const cfg = getSupabaseConfig();
    return cfg.enabled && cfg.url ? 'offline' : 'unconfigured';
  });

  const syncWithCloud = async () => {
    const client = getSupabaseClient();
    if (!client) {
      showToast('warning', 'Supabase Cloud DB is not configured yet. Go to Sync & Backup to configure.', 'Cloud DB');
      return;
    }
    setCloudSyncStatus('syncing');
    showToast('info', 'Synchronizing with Cloud Database...', 'Cloud Sync');
    try {
      const pushRes = await pushAllLocalToSupabase();
      const pullRes = await pullAllSupabaseToLocal();
      if (pushRes.success && pullRes.success) {
        setCloudSyncStatus('connected');
        showToast('success', `Cloud sync complete! Pushed ${pushRes.attendeesPushed} and pulled ${pullRes.attendeesPulled} records.`, 'Synced');
      } else {
        showToast('warning', `Sync noticed: ${pushRes.message || pullRes.message}`);
        setCloudSyncStatus('connected');
      }
    } catch (err: any) {
      setCloudSyncStatus('offline');
      showToast('error', `Cloud sync error: ${err.message || err}`);
    }
  };

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showToast('info', 'Device is now ONLINE. Changes will sync if configured.', 'Online');
      // Auto reconnect cloud if configured
      const cfg = getSupabaseConfig();
      if (cfg.enabled && cfg.url) {
        pullAllSupabaseToLocal().then(res => {
          if (res.success) setCloudSyncStatus('connected');
        }).catch(() => {});
      }
    };
    const handleOffline = () => {
      setIsOnline(false);
      setCloudSyncStatus('offline');
      showToast('warning', 'Device is OFFLINE. Offline mode is active; all data is safely saved in local IndexedDB.', 'Offline Mode');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    let unsubscribeRealtime: (() => void) | null = null;

    // Initial safe hydration from persistent JSON DB if IndexedDB is empty
    hydrateFromPersistentJsonDb().then(async (restored) => {
      if (restored) {
        showToast('info', 'Database automatically restored from persistent local JSON mirror.', 'Data Restored');
      }
      await refreshSettings();
      await syncPersistentJsonDb();

      // Connect to Supabase Cloud DB if credentials exist
      const cfg = getSupabaseConfig();
      if (cfg.enabled && cfg.url && cfg.anonKey) {
        setCloudSyncStatus('syncing');
        pullAllSupabaseToLocal().then(res => {
          if (res.success) {
            setCloudSyncStatus('connected');
            unsubscribeRealtime = initSupabaseRealtime((table) => {
              showToast('info', `Cloud update synced (${table})`, 'Live Sync');
            });
          } else {
            setCloudSyncStatus('offline');
          }
        }).catch(() => {
          setCloudSyncStatus('offline');
        });
      } else {
        setCloudSyncStatus('unconfigured');
      }
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (unsubscribeRealtime) unsubscribeRealtime();
    };
  }, []);

  const switchAccount = (accountId: string, pin: string): boolean => {
    const target = findAccountById(accountId);
    if (!target) {
      showToast('error', 'Account not found.');
      return false;
    }

    const isValid = verifyAccountPin(target, pin);
    if (!isValid) {
      showToast('error', 'Incorrect 4-digit PIN for ' + target.displayName, 'Access Denied');
      return false;
    }

    setCurrentAccount(target);
    setActiveRoleState(target.role);
    setActiveStaffNameState(target.displayName);
    try {
      localStorage.setItem('administrare_active_account_id', target.id);
    } catch (e) {
      // Ignore
    }

    db.settings.put({
      ...settings,
      activeStaffRole: target.role,
      activeStaffName: target.displayName,
      stationId: target.stationId
    }).catch(console.error);

    showToast('success', `Switched to ${target.displayName} (${target.accountCode})`, 'Account Active');
    setIsAccountSwitchOpen(false);
    return true;
  };

  const quickSwitchAccountByAdmin = (accountId: string) => {
    const target = findAccountById(accountId);
    if (!target) return;
    setCurrentAccount(target);
    setActiveRoleState(target.role);
    setActiveStaffNameState(target.displayName);
    try {
      localStorage.setItem('administrare_active_account_id', target.id);
    } catch (e) {
      // Ignore
    }
    showToast('info', `Switched view to ${target.displayName}`);
  };

  const setActiveRole = async (role: StaffRole, name?: string) => {
    setActiveRoleState(role);
    const newName = name || (role === 'ADMIN' ? 'Master Admin' : role === 'REGISTRAR' ? 'Registrar' : 'Gate Staff');
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

  const openAccountability = (account?: UserAccount) => {
    setAccountabilityTargetAccount(account || currentAccount);
    setIsAccountabilityOpen(true);
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
        currentAccount,
        allAccounts: HARDCODED_ACCOUNTS,
        switchAccount,
        quickSwitchAccountByAdmin,
        activeRegistrarFilter,
        setActiveRegistrarFilter,
        isAuthenticated,
        loginStaff,
        logoutStaff,
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
        closeNewReg: () => setIsNewRegOpen(false),
        isAccountSwitchOpen,
        openAccountSwitch: () => setIsAccountSwitchOpen(true),
        closeAccountSwitch: () => setIsAccountSwitchOpen(false),
        isAccountabilityOpen,
        accountabilityTargetAccount,
        openAccountability,
        closeAccountability: () => {
          setIsAccountabilityOpen(false);
          setAccountabilityTargetAccount(null);
        },
        cloudSyncStatus,
        isCloudConnected: cloudSyncStatus === 'connected',
        syncWithCloud
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
