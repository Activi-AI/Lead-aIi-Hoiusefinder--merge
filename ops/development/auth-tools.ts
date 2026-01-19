import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  login,
  logout,
  getSession,
  createUser,
  deleteUser,
  listUsers,
  requireAdmin,
  initializeDefaultAdmin,
} from './users.js';

export function registerAuthTools(server: McpServer) {

  // Initialize default admin on startup
  initializeDefaultAdmin();

  // ============================================
  // TOOL: Login
  // ============================================
  server.tool(
    'auth_login',
    {
      username: z.string().describe('Benutzername'),
      password: z.string().describe('Passwort'),
    },
    async ({ username, password }) => {
      const result = login(username, password);

      if (result.success) {
        return {
          content: [{
            type: 'text',
            text: `â ${result.message}\n\nSession gÃ¼ltig fÃ¼r 24 Stunden.`,
          }],
        };
      }

      return {
        content: [{
          type: 'text',
          text: `â ${result.message}`,
        }],
      };
    }
  );

  // ============================================
  // TOOL: Logout
  // ============================================
  server.tool(
    'auth_logout',
    {},
    async () => {
      const result = logout();
      return {
        content: [{
          type: 'text',
          text: result.success ? `â ${result.message}` : `â ${result.message}`,
        }],
      };
    }
  );

  // ============================================
  // TOOL: Session Status
  // ============================================
  server.tool(
    'auth_status',
    {},
    async () => {
      const session = getSession();

      if (!session) {
        return {
          content: [{
            type: 'text',
            text: 'â Nicht eingeloggt\n\nBitte mit "auth_login" einloggen.',
          }],
        };
      }

      const expiresIn = Math.round((session.expiresAt - Date.now()) / 1000 / 60);

      return {
        content: [{
          type: 'text',
          text: [
            'â EINGELOGGT',
            '',
            `ð¤ User: ${session.username}`,
            `ð Rolle: ${session.role}`,
            `â±ï¸ Session lÃ¤uft ab in: ${expiresIn} Minuten`,
          ].join('\n'),
        }],
      };
    }
  );

  // ============================================
  // TOOL: User erstellen (Admin only)
  // ============================================
  server.tool(
    'auth_create_user',
    {
      username: z.string().describe('Benutzername fÃ¼r neuen User'),
      password: z.string().describe('Passwort fÃ¼r neuen User'),
      role: z.enum(['admin', 'user']).optional().describe('Rolle (default: user)'),
    },
    async ({ username, password, role }) => {
      const auth = requireAdmin();
      if (!auth.authorized) {
        return {
          content: [{
            type: 'text',
            text: `â ${auth.message}`,
          }],
        };
      }

      const result = createUser(username, password, role || 'user');
      return {
        content: [{
          type: 'text',
          text: result.success ? `â ${result.message}` : `â ${result.message}`,
        }],
      };
    }
  );

  // ============================================
  // TOOL: User lÃ¶schen (Admin only)
  // ============================================
  server.tool(
    'auth_delete_user',
    {
      username: z.string().describe('Benutzername des zu lÃ¶schenden Users'),
    },
    async ({ username }) => {
      const auth = requireAdmin();
      if (!auth.authorized) {
        return {
          content: [{
            type: 'text',
            text: `â ${auth.message}`,
          }],
        };
      }

      const session = getSession();
      if (session && session.username === username.toLowerCase()) {
        return {
          content: [{
            type: 'text',
            text: 'â Du kannst dich nicht selbst lÃ¶schen!',
          }],
        };
      }

      const result = deleteUser(username);
      return {
        content: [{
          type: 'text',
          text: result.success ? `â ${result.message}` : `â ${result.message}`,
        }],
      };
    }
  );

  // ============================================
  // TOOL: User auflisten (Admin only)
  // ============================================
  server.tool(
    'auth_list_users',
    {},
    async () => {
      const auth = requireAdmin();
      if (!auth.authorized) {
        return {
          content: [{
            type: 'text',
            text: `â ${auth.message}`,
          }],
        };
      }

      const userList = listUsers();

      if (userList.length === 0) {
        return {
          content: [{
            type: 'text',
            text: 'ð Keine User vorhanden',
          }],
        };
      }

      const text = [
        'ð REGISTRIERTE USER',
        '',
        ...userList.map(u =>
          `â¢ ${u.username} (${u.role})${u.lastLogin ? ` - Letzter Login: ${u.lastLogin}` : ''}`
        ),
      ].join('\n');

      return {
        content: [{
          type: 'text',
          text,
        }],
      };
    }
  );
}
