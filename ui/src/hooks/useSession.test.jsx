import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { useSession } from './useSession';
import { api } from '../lib/api';
vi.mock('../lib/api', () => ({ api: vi.fn(), setPlaybackModeVersion: vi.fn() }));
vi.mock('../lib/sse', () => ({ openSSE: vi.fn(() => () => {}) }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.resetAllMocks(); });
const room = { id: 'room', invite_code: 'ABC123', playback_mode_version: 0 };

test('expired rooms are ended even when the server still reports active', async () => {
  api.mockResolvedValue({ ok: true, json: async () => ({ ...room, status: 'active', expires_at: '2020-01-01T00:00:00Z' }) });
  const { result } = renderHook(() => useSession('ABC123'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.session.status).toBe('ended');
  expect(result.current.session.expired).toBe(true);
});

test('an open room ends at its expiry without a server event', async () => {
  vi.useFakeTimers();
  const expires_at = new Date(Date.now() + 1000).toISOString();
  api.mockResolvedValue({ ok: true, json: async () => ({ ...room, status: 'active', expires_at }) });
  const { result } = renderHook(() => useSession('ABC123'));
  await act(async () => {});
  expect(result.current.session.status).toBe('active');
  await act(async () => { vi.advanceTimersByTime(1000); });
  expect(result.current.session.status).toBe('ended');
  expect(result.current.session.expired).toBe(true);
});

test('heartbeats renew the deadline without relying on realtime delivery', async () => {
  vi.useFakeTimers();
  const now = Date.now();
  api.mockResolvedValueOnce({ ok: true, json: async () => ({ ...room, status: 'active', expires_at: new Date(now + 60000).toISOString() }) });
  api.mockResolvedValue({ ok: true, json: async () => ({ expires_at: new Date(now + 120000).toISOString() }) });
  const { result } = renderHook(() => useSession('ABC123'));
  await act(async () => {});
  await act(async () => { vi.advanceTimersByTime(30000); });
  expect(api).toHaveBeenCalledWith('/sessions/room/heartbeat', { method: 'POST' });
  await act(async () => { vi.advanceTimersByTime(30000); });
  expect(result.current.session.status).toBe('active');
  expect(result.current.session.expires_at).toBe(new Date(now + 120000).toISOString());
});

test('server failures are not reported as missing rooms', async () => {
  api.mockResolvedValue({ ok: false, status: 500 });
  const { result } = renderHook(() => useSession('ABC123'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toBe('Could not load the room. Please try again.');
});

test('only a 404 is reported as a missing room', async () => {
  api.mockResolvedValue({ ok: false, status: 404 });
  const { result } = renderHook(() => useSession('ABC123'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.session).toBeNull();
  expect(result.current.error).toBeNull();
});

test('failed refresh keeps the loaded room and retry clears the error', async () => {
  api.mockResolvedValueOnce({ ok: true, json: async () => room });
  const { result } = renderHook(() => useSession('ABC123'));
  await waitFor(() => expect(result.current.session).toEqual(room));
  api.mockResolvedValueOnce({ ok: false, status: 503 });
  await act(async () => { await result.current.refresh(); });
  expect(result.current.session).toEqual(room);
  expect(result.current.error).toBeTruthy();
  api.mockResolvedValueOnce({ ok: true, json: async () => room });
  await act(async () => { await result.current.refresh(); });
  expect(result.current.error).toBeNull();
});

test('network errors settle loading and are retryable', async () => {
  api.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  const { result } = renderHook(() => useSession('ABC123'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toBeTruthy();
  api.mockResolvedValueOnce({ ok: true, json: async () => room });
  await act(async () => { await result.current.refresh(); });
  expect(result.current.session).toEqual(room);
  expect(result.current.error).toBeNull();
});

test('late responses from a previous room cannot overwrite the current room', async () => {
  let resolveOld;
  api.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }));
  const nextRoom = { ...room, id: 'next', invite_code: 'NEXT12' };
  api.mockResolvedValueOnce({ ok: true, json: async () => nextRoom });
  const { result, rerender } = renderHook(({ code }) => useSession(code), { initialProps: { code: 'ABC123' } });
  rerender({ code: 'NEXT12' });
  await waitFor(() => expect(result.current.session).toEqual(nextRoom));
  await act(async () => { resolveOld({ ok: true, json: async () => room }); });
  expect(result.current.session).toEqual(nextRoom);
});
