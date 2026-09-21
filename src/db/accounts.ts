import type { UserAccount } from '../types';

export const HARDCODED_ACCOUNTS: UserAccount[] = [
  {
    id: 'account-admin',
    username: 'admin',
    displayName: 'Master Admin',
    role: 'ADMIN',
    pin: '2026',
    accountCode: 'ADMIN',
    stationId: 'HQ-ADMIN',
    avatarColor: 'bg-indigo-600'
  },
  {
    id: 'account-a',
    username: 'registrar_a',
    displayName: 'Account A (Tinashe)',
    role: 'REGISTRAR',
    pin: '1001',
    accountCode: 'ACC-A',
    stationId: 'DESK-A',
    avatarColor: 'bg-emerald-600'
  },
  {
    id: 'account-b',
    username: 'registrar_b',
    displayName: 'Account B (Rudo)',
    role: 'REGISTRAR',
    pin: '1002',
    accountCode: 'ACC-B',
    stationId: 'DESK-B',
    avatarColor: 'bg-blue-600'
  },
  {
    id: 'account-c',
    username: 'registrar_c',
    displayName: 'Account C (Farai)',
    role: 'REGISTRAR',
    pin: '1003',
    accountCode: 'ACC-C',
    stationId: 'DESK-C',
    avatarColor: 'bg-amber-600'
  },
  {
    id: 'account-d',
    username: 'registrar_d',
    displayName: 'Account D (Chipo)',
    role: 'REGISTRAR',
    pin: '1004',
    accountCode: 'ACC-D',
    stationId: 'DESK-D',
    avatarColor: 'bg-purple-600'
  },
  {
    id: 'account-gate1',
    username: 'gate_1',
    displayName: 'Gate Staff 1',
    role: 'CHECKIN',
    pin: '3001',
    accountCode: 'GATE-1',
    stationId: 'GATE-NORTH',
    avatarColor: 'bg-rose-600'
  }
];

export const DEFAULT_ACCOUNT = HARDCODED_ACCOUNTS[0]; // Master Admin

export function findAccountById(id: string): UserAccount | undefined {
  return HARDCODED_ACCOUNTS.find(a => a.id === id);
}

export function findAccountByUsername(username: string): UserAccount | undefined {
  return HARDCODED_ACCOUNTS.find(a => a.username.toLowerCase() === username.toLowerCase());
}

export function verifyAccountPin(account: UserAccount, pin: string): boolean {
  return account.pin === pin || pin === '2026'; // Master Admin PIN 2026 can unlock any account
}

export function getAllRegistrarAccounts(): UserAccount[] {
  return HARDCODED_ACCOUNTS.filter(a => a.role === 'REGISTRAR');
}
