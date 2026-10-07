import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, test, vi } from 'vitest';
import PlaybackModeControl from './PlaybackModeControl';
afterEach(cleanup);
const session = { id: 'room', status: 'active', host_user_id: 'host', playback_mode: 'independent', playback_mode_version: 1 };
test('participants see the room mode but cannot change it', () => {
  render(<PlaybackModeControl session={session} userId="guest" enabled />);
  expect(screen.getByRole('button', { name: 'DJ-led' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Shared Queue' })).toHaveAttribute('aria-pressed', 'true');
});
test('host is shown the playback interruption before confirming', () => {
  const changeMode = vi.fn();
  render(<PlaybackModeControl session={session} userId="host" enabled changeMode={changeMode} />);
  fireEvent.click(screen.getByRole('button', { name: 'DJ-led' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('pause');
  expect(changeMode).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
