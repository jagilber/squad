/**
 * Tests for Session Resume — null-guard and edge-case audit
 *
 * Validates:
 * - loadLatestSession returns null for empty dirs
 * - loadSessionById returns null for invalid IDs
 * - Malformed JSON files are skipped gracefully
 * - Sessions without id field are handled
 * - 24hr threshold is respected
 *
 * TDD: RED → GREEN
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createSession,
  saveSession,
  listSessions,
  loadLatestSession,
  loadSessionById,
} from '@bradygaster/squad-cli/shell/session-store';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

describe('SessionStore — resume null-guard audit', () => {
  const tmpRoot = join(import.meta.dirname ?? '.', '__session-test-tmp__');
  const sessionsDir = join(tmpRoot, '.squad', 'sessions');

  beforeEach(() => {
    if (existsSync(tmpRoot)) {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
    mkdirSync(sessionsDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tmpRoot)) {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  describe('createSession', () => {
    it('should create a session with a valid UUID id', () => {
      const session = createSession();
      expect(session.id).toBeDefined();
      expect(session.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('should never create a session with null or empty id', () => {
      for (let i = 0; i < 10; i++) {
        const session = createSession();
        expect(session.id).toBeTruthy();
        expect(session.id).not.toBe('');
        expect(session.id).not.toBe('null');
        expect(session.id).not.toBe('undefined');
      }
    });

    it('should initialize with empty messages array', () => {
      const session = createSession();
      expect(session.messages).toEqual([]);
    });
  });

  describe('loadLatestSession', () => {
    it('should return null when no sessions directory exists', () => {
      const nonExistent = join(tmpRoot, 'does-not-exist');
      expect(loadLatestSession(nonExistent)).toBeNull();
    });

    it('should return null when sessions directory is empty', () => {
      expect(loadLatestSession(tmpRoot)).toBeNull();
    });

    it('should return null when all sessions are older than 24h', () => {
      const session = createSession();
      const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      session.lastActiveAt = oldDate;
      session.createdAt = oldDate;

      const filePath = join(sessionsDir, `20240101_000000_${session.id}.json`);
      writeFileSync(filePath, JSON.stringify(session), 'utf-8');

      expect(loadLatestSession(tmpRoot)).toBeNull();
    });

    it('should return a valid session within 24h window', () => {
      const session = createSession();
      saveSession(tmpRoot, session);

      const loaded = loadLatestSession(tmpRoot);
      expect(loaded).not.toBeNull();
      expect(loaded!.id).toBe(session.id);
    });
  });

  describe('loadSessionById', () => {
    it('should return null for non-existent session ID', () => {
      expect(loadSessionById(tmpRoot, 'non-existent-id')).toBeNull();
    });

    it('should return null for empty string session ID', () => {
      expect(loadSessionById(tmpRoot, '')).toBeNull();
    });

    it('should return a saved session by its ID', () => {
      const session = createSession();
      saveSession(tmpRoot, session);

      const loaded = loadSessionById(tmpRoot, session.id);
      expect(loaded).not.toBeNull();
      expect(loaded!.id).toBe(session.id);
    });
  });

  describe('listSessions', () => {
    it('should return empty array when no sessions exist', () => {
      expect(listSessions(tmpRoot)).toEqual([]);
    });

    it('should skip malformed JSON files gracefully', () => {
      writeFileSync(join(sessionsDir, 'bad-file.json'), 'NOT VALID JSON', 'utf-8');
      const sessions = listSessions(tmpRoot);
      expect(sessions).toEqual([]);
    });

    it('should list sessions sorted by most recent first', () => {
      const s1 = createSession();
      const s2 = createSession();

      // Make s1 older
      s1.lastActiveAt = new Date(Date.now() - 60000).toISOString();
      writeFileSync(join(sessionsDir, `a_${s1.id}.json`), JSON.stringify(s1), 'utf-8');
      writeFileSync(join(sessionsDir, `b_${s2.id}.json`), JSON.stringify(s2), 'utf-8');

      const sessions = listSessions(tmpRoot);
      expect(sessions).toHaveLength(2);
      expect(sessions[0]!.id).toBe(s2.id);
      expect(sessions[1]!.id).toBe(s1.id);
    });

    it('should skip non-JSON files', () => {
      writeFileSync(join(sessionsDir, 'notes.txt'), 'hello', 'utf-8');
      const session = createSession();
      saveSession(tmpRoot, session);

      const sessions = listSessions(tmpRoot);
      expect(sessions).toHaveLength(1);
      expect(sessions[0]!.id).toBe(session.id);
    });
  });

  describe('saveSession', () => {
    it('should save and reload a session', () => {
      const session = createSession();
      session.messages.push({
        role: 'user',
        content: 'hello',
        timestamp: new Date(),
      } as any);

      saveSession(tmpRoot, session);
      const loaded = loadSessionById(tmpRoot, session.id);
      expect(loaded).not.toBeNull();
      expect(loaded!.messages).toHaveLength(1);
    });

    it('should overwrite same session file on re-save', () => {
      const session = createSession();
      saveSession(tmpRoot, session);
      saveSession(tmpRoot, session);

      const sessions = listSessions(tmpRoot);
      expect(sessions).toHaveLength(1);
    });
  });
});
