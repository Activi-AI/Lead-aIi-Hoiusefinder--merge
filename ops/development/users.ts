import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// ============================================
// USER MANAGEMENT SYSTEM
// ============================================

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  salt: string;
  role: 'admin' | 'user';
  createdAt: string;
  lastLoginAt?: string;
}

export interface Session {
  userId: string;
  username: string;
  role: 'admin' | 'user';
  token: string;
  createdAt: number;
  expiresAt: number;
}

const DATA_DIR = '/root/lead-ai-mcp/data';
const USERS_FILE = join(DATA_DIR, 'users.json');

// In-memory storage
const users: Map<string, User> = new Map();
let currentSession: Session | null = null;
let usersLoaded = false;

// ============================================
// PASSWORD HASHING
// ============================================

function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const useSalt = salt || randomBytes(16).toString('hex');
  const hash = scryptSync(password, useSalt, 64).toString('hex');
  return { hash, salt: useSalt };
}

function verifyPassword(password: string, hash: string, salt: string): boolean {
  const { hash: newHash } = hashPassword(password, salt);
  const hashBuffer = Buffer.from(hash, 'hex');
  const newHashBuffer = Buffer.from(newHash, 'hex');
  return timingSafeEqual(hashBuffer, newHashBuffer);
}

// ============================================
// FILE OPERATIONS
// ============================================

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadUsers(): void {
  if (usersLoaded) return;

  try {
    if (existsSync(USERS_FILE)) {
      const data = readFileSync(USERS_FILE, 'utf8');
      const userList: User[] = JSON.parse(data);
      for (const user of userList) {
        users.set(user.username.toLowerCase(), user);
      }
      console.log(`[Auth] ${userList.length} User geladen`);
    }
  } catch (error) {
    console.error('[Auth] Fehler beim Laden der User:', error);
  }

  usersLoaded = true;
}

function saveUsers(): void {
  try {
    ensureDataDir();
    const userList = Array.from(users.values());
    writeFileSync(USERS_FILE, JSON.stringify(userList, null, 2));
  } catch (error) {
    console.error('[Auth] Fehler beim Speichern:', error);
  }
}

// ============================================
// USER OPERATIONS
// ============================================

export function createUser(username: string, password: string, role: 'admin' | 'user' = 'user'): { success: boolean; message: string } {
  loadUsers();

  const normalizedUsername = username.toLowerCase();
  if (users.has(normalizedUsername)) {
    return { success: false, message: 'Benutzername existiert bereits' };
  }

  if (password.length < 4) {
    return { success: false, message: 'Passwort muss mindestens 4 Zeichen haben' };
  }

  const { hash, salt } = hashPassword(password);
  const user: User = {
    id: randomBytes(8).toString('hex'),
    username: normalizedUsername,
    passwordHash: hash,
    salt,
    role,
    createdAt: new Date().toISOString(),
  };

  users.set(normalizedUsername, user);
  saveUsers();

  return { success: true, message: `User "${username}" erstellt (Rolle: ${role})` };
}

export function deleteUser(username: string): { success: boolean; message: string } {
  loadUsers();

  const normalizedUsername = username.toLowerCase();
  if (!users.has(normalizedUsername)) {
    return { success: false, message: 'User nicht gefunden' };
  }

  users.delete(normalizedUsername);
  saveUsers();

  return { success: true, message: `User "${username}" gelÃ¶scht` };
}

export function listUsers(): { username: string; role: string; lastLogin?: string }[] {
  loadUsers();
  return Array.from(users.values()).map(u => ({
    username: u.username,
    role: u.role,
    lastLogin: u.lastLoginAt,
  }));
}

// ============================================
// SESSION MANAGEMENT
// ============================================

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 Stunden

export function login(username: string, password: string): { success: boolean; message: string; session?: Session } {
  loadUsers();

  const normalizedUsername = username.toLowerCase();
  const user = users.get(normalizedUsername);

  if (!user) {
    return { success: false, message: 'UngÃ¼ltiger Benutzername oder Passwort' };
  }

  if (!verifyPassword(password, user.passwordHash, user.salt)) {
    return { success: false, message: 'UngÃ¼ltiger Benutzername oder Passwort' };
  }

  // Update last login
  user.lastLoginAt = new Date().toISOString();
  saveUsers();

  // Create session
  const now = Date.now();
  currentSession = {
    userId: user.id,
    username: user.username,
    role: user.role,
    token: randomBytes(32).toString('hex'),
    createdAt: now,
    expiresAt: now + SESSION_DURATION_MS,
  };

  return {
    success: true,
    message: `Willkommen, ${user.username}! (Rolle: ${user.role})`,
    session: currentSession,
  };
}

export function logout(): { success: boolean; message: string } {
  if (!currentSession) {
    return { success: false, message: 'Nicht eingeloggt' };
  }

  const username = currentSession.username;
  currentSession = null;

  return { success: true, message: `${username} abgemeldet` };
}

export function getSession(): Session | null {
  if (!currentSession) return null;

  // Check if session expired
  if (Date.now() > currentSession.expiresAt) {
    currentSession = null;
    return null;
  }

  return currentSession;
}

export function isLoggedIn(): boolean {
  return getSession() !== null;
}

export function requireAuth(): { authenticated: boolean; message?: string; user?: { username: string; role: string } } {
  const session = getSession();

  if (!session) {
    return {
      authenticated: false,
      message: 'Nicht eingeloggt. Bitte zuerst mit "auth_login" einloggen.',
    };
  }

  return {
    authenticated: true,
    user: { username: session.username, role: session.role },
  };
}

export function requireAdmin(): { authorized: boolean; message?: string } {
  const session = getSession();

  if (!session) {
    return { authorized: false, message: 'Nicht eingeloggt' };
  }

  if (session.role !== 'admin') {
    return { authorized: false, message: 'Admin-Rechte erforderlich' };
  }

  return { authorized: true };
}

// ============================================
// INITIALIZATION
// ============================================

export function initializeDefaultAdmin(): void {
  loadUsers();

  // Create default admin if no users exist
  if (users.size === 0) {
    const defaultPassword = 'admin123'; // User should change this!
    createUser('admin', defaultPassword, 'admin');
    console.log('[Auth] Default Admin erstellt: admin / admin123');
    console.log('[Auth] WICHTIG: Bitte Passwort Ã¤ndern!');
  }
}
