import type { UserAccount } from '../types';

export const HARDCODED_ACCOUNTS: UserAccount[] = [
  {
    id: 'account-admin',
    username: 'admin',
    displayName: 'Master Admin',
    role: 'ADMIN',
    pin: 'K9#mX4$w26',
    accountCode: 'ADMIN',
    stationId: 'HQ-ADMIN',
    avatarColor: 'bg-indigo-600'
  },
  {
    id: 'account-berthia',
    username: 'berthia',
    displayName: 'Berthia',
    role: 'REGISTRAR',
    pin: 'B#94kM7!x',
    accountCode: 'ACC-BERTHIA',
    stationId: 'DESK-BERTHIA',
    avatarColor: 'bg-emerald-600'
  },
  {
    id: 'account-nicole',
    username: 'nicole',
    displayName: 'Nicole',
    role: 'REGISTRAR',
    pin: 'N#82vP5!q',
    accountCode: 'ACC-NICOLE',
    stationId: 'DESK-NICOLE',
    avatarColor: 'bg-blue-600'
  },
  {
    id: 'account-ruvarashe',
    username: 'ruvarashe',
    displayName: 'Ruvarashe',
    role: 'REGISTRAR',
    pin: 'R#73wL9!z',
    accountCode: 'ACC-RUVARASHE',
    stationId: 'DESK-RUVARASHE',
    avatarColor: 'bg-purple-600'
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
  return account.pin === pin.trim() || pin.trim() === '2026'; // Master PIN 2026 can unlock any account
}

export function authenticateStaff(nameOrId: string, pin: string): UserAccount | null {
  const query = nameOrId.trim().toLowerCase();
  const account = HARDCODED_ACCOUNTS.find(a => 
    a.id === nameOrId ||
    a.username.toLowerCase() === query ||
    a.displayName.toLowerCase() === query ||
    a.displayName.toLowerCase().includes(query) ||
    a.accountCode.toLowerCase() === query
  );
  if (!account) return null;
  if (verifyAccountPin(account, pin)) {
    return account;
  }
  return null;
}

export function getAllRegistrarAccounts(): UserAccount[] {
  return HARDCODED_ACCOUNTS.filter(a => a.role === 'REGISTRAR');
}
