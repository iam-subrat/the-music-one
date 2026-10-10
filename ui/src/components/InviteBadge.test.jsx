import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import InviteBadge from './InviteBadge';

vi.mock('./Toast', () => ({ useToast: () => vi.fn() }));
const writeText = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  writeText.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetAllMocks(); });

async function copy() {
  await act(async () => fireEvent.click(screen.getByRole('button')));
}

test('confirms copying and restores the Copy icon after two seconds', async () => {
  render(<InviteBadge code="ROOM" />);
  await copy();
  expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/jam/ROOM`);
  expect(screen.getByRole('button', { name: 'Invite link copied' })).toBeVisible();
  act(() => vi.advanceTimersByTime(2000));
  expect(screen.getByRole('button', { name: 'Copy invite link' })).toBeVisible();
});

test('another successful copy restarts the confirmation timeout', async () => {
  render(<InviteBadge code="ROOM" />);
  await copy();
  act(() => vi.advanceTimersByTime(1500));
  await copy();
  act(() => vi.advanceTimersByTime(1500));
  expect(screen.getByRole('button', { name: 'Invite link copied' })).toBeVisible();
  act(() => vi.advanceTimersByTime(500));
  expect(screen.getByRole('button', { name: 'Copy invite link' })).toBeVisible();
});

test('clears the reset timer on unmount', async () => {
  const view = render(<InviteBadge code="ROOM" />);
  await copy();
  expect(vi.getTimerCount()).toBe(1);
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

test('does not confirm a failed clipboard write', async () => {
  writeText.mockRejectedValueOnce(new Error('Clipboard denied'));
  render(<InviteBadge code="ROOM" />);
  await copy();
  expect(screen.getByRole('button', { name: 'Copy invite link' })).toBeVisible();
  expect(vi.getTimerCount()).toBe(0);
});
