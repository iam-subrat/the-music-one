import { forwardRef, useEffect, useImperativeHandle } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, test, vi } from 'vitest';
import { IndependentPlaybackProvider, useIndependentPlayback } from './IndependentPlaybackContext';
import { JamPlaybackProvider } from './JamPlaybackContext';
const player = { pause: vi.fn(), play: vi.fn(), seek: vi.fn(), getTime: () => 12, getState: () => 2, getDuration: () => 180 };
vi.mock('../hooks/useMediaSession', () => ({ useMediaSession: vi.fn() }));
vi.mock('../components/YouTubeAutoPlayer', () => ({ default: forwardRef(({ videoId, onReady }, ref) => {
  useImperativeHandle(ref, () => player);
  useEffect(() => { onReady?.(); }, [videoId]);
  return <div data-testid="player" data-video={videoId} />;
}) }));
afterEach(() => { cleanup(); sessionStorage.clear(); vi.clearAllMocks(); vi.restoreAllMocks(); });
const session = { id: 'room', status: 'active', playback_mode: 'independent', playback_mode_version: 1 };
const items = [{ id: 'a', position: 1, status: 'queued', title: 'One' }, { id: 'b', position: 2, status: 'queued', title: 'Two' }];
function Probe({ surface = 'gui', room = session }) {
  const local = useIndependentPlayback(room, items, 'user');
  return <><span>{surface}: {local.state.item?.title}</span><button onClick={local.next}>next</button><button onClick={local.previous}>previous</button><button onClick={local.play}>play</button><button onClick={local.pause}>pause</button><button onClick={() => local.reset()}>leave</button></>;
}

test.each([4, 5, 5.1])('previous uses a five-second restart cutoff at %s seconds', async seconds => {
  vi.spyOn(player, 'getTime').mockReturnValue(seconds);
  render(<JamPlaybackProvider><IndependentPlaybackProvider resolveItem={async item => ({ video_id: item.id })}><Probe /></IndependentPlaybackProvider></JamPlaybackProvider>);
  await waitFor(() => expect(screen.getByTestId('player')).toHaveAttribute('data-video', 'a'));
  fireEvent.click(screen.getByRole('button', { name: 'next' }));
  await waitFor(() => expect(screen.getByTestId('player')).toHaveAttribute('data-video', 'b'));
  player.seek.mockClear();
  fireEvent.click(screen.getByRole('button', { name: 'previous' }));
  if (seconds > 5) {
    expect(player.seek).toHaveBeenCalledWith(0);
    expect(screen.getByTestId('player')).toHaveAttribute('data-video', 'b');
  } else {
    await waitFor(() => expect(screen.getByTestId('player')).toHaveAttribute('data-video', 'a'));
  }
});

test('next and previous preserve active or paused playback intent', async () => {
  render(<JamPlaybackProvider><IndependentPlaybackProvider resolveItem={async item => ({ video_id: item.id })}><Probe /></IndependentPlaybackProvider></JamPlaybackProvider>);
  await waitFor(() => expect(screen.getByTestId('player')).toHaveAttribute('data-video', 'a'));
  fireEvent.click(screen.getByRole('button', { name: 'play' }));
  player.play.mockClear();
  fireEvent.click(screen.getByRole('button', { name: 'next' }));
  await waitFor(() => expect(screen.getByTestId('player')).toHaveAttribute('data-video', 'b'));
  expect(player.play).toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'pause' }));
  player.play.mockClear();
  fireEvent.click(screen.getByRole('button', { name: 'previous' }));
  expect(player.play).not.toHaveBeenCalled();
});
test('joining is paused and changing surface retains one local player and cursor', async () => {
  const resolve = vi.fn(async item => ({ video_id: item.id }));
  const tree = surface => <JamPlaybackProvider><IndependentPlaybackProvider resolveItem={resolve}><Probe surface={surface} /></IndependentPlaybackProvider></JamPlaybackProvider>;
  const view = render(tree('gui'));
  await waitFor(() => expect(screen.getByText('gui: One')).toBeInTheDocument());
  await waitFor(() => expect(screen.getByTestId('player')).toHaveAttribute('data-video', 'a'));
  expect(player.play).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'next' }));
  await waitFor(() => expect(screen.getByTestId('player')).toHaveAttribute('data-video', 'b'));
  const mounted = screen.getByTestId('player');
  view.rerender(tree('tui'));
  expect(screen.getByTestId('player')).toBe(mounted);
  expect(screen.getByText('tui: Two')).toBeInTheDocument();
  expect(items.map(i => i.status)).toEqual(['queued', 'queued']);
});
test('a late resolver cannot restart playback after a mode change', async () => {
  let finish;
  const resolve = () => new Promise(r => { finish = r; });
  const tree = room => <JamPlaybackProvider><IndependentPlaybackProvider resolveItem={resolve}><Probe room={room} /></IndependentPlaybackProvider></JamPlaybackProvider>;
  const view = render(tree(session));
  view.rerender(tree({ ...session, playback_mode: 'dj', playback_mode_version: 2 }));
  await act(async () => { finish({ video_id: 'late' }); });
  expect(screen.queryByTestId('player')).not.toBeInTheDocument();
  expect(player.play).not.toHaveBeenCalled();
});

test('logout stops the player and removes every checkpoint for the signed-out user', async () => {
  const resolve = async item => ({ video_id: item.id });
  render(<JamPlaybackProvider><IndependentPlaybackProvider resolveItem={resolve}><Probe /></IndependentPlaybackProvider></JamPlaybackProvider>);
  await waitFor(() => expect(screen.getByTestId('player')).toBeInTheDocument());
  sessionStorage.setItem('musicone:independent:user:other-room', '{}');
  act(() => window.dispatchEvent(new Event('musicone:logout')));
  expect(screen.queryByTestId('player')).not.toBeInTheDocument();
  expect(Object.keys(sessionStorage).filter(key => key.startsWith('musicone:independent:user:'))).toEqual([]);
});

test('restores a checkpoint at its saved position without playing', async () => {
  sessionStorage.setItem('musicone:independent:user:room', JSON.stringify({ schema: 1, epoch: 1, itemId: 'b', time: 75, repeat: 'queue' }));
  render(<JamPlaybackProvider><IndependentPlaybackProvider resolveItem={async item => ({ video_id: item.id })}><Probe /></IndependentPlaybackProvider></JamPlaybackProvider>);
  await waitFor(() => expect(screen.getByTestId('player')).toHaveAttribute('data-video', 'b'));
  expect(player.seek).toHaveBeenCalledWith(75);
  expect(player.play).not.toHaveBeenCalled();
});

test('logout clears checkpoints even after leaving the room', async () => {
  render(<JamPlaybackProvider><IndependentPlaybackProvider resolveItem={async item => ({ video_id: item.id })}><Probe /></IndependentPlaybackProvider></JamPlaybackProvider>);
  await waitFor(() => expect(screen.getByTestId('player')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'leave' }));
  expect(sessionStorage.getItem('musicone:independent:user:room')).not.toBeNull();
  act(() => window.dispatchEvent(new Event('musicone:logout')));
  expect(sessionStorage.getItem('musicone:independent:user:room')).toBeNull();
});

test('known expiry stops loaded playback without a network update', async () => {
  const room = { ...session, expires_at: new Date(Date.now() + 200).toISOString() };
  render(<JamPlaybackProvider><IndependentPlaybackProvider resolveItem={async item => ({ video_id: item.id })}><Probe room={room} /></IndependentPlaybackProvider></JamPlaybackProvider>);
  await waitFor(() => expect(screen.getByTestId('player')).toBeInTheDocument());
  await waitFor(() => expect(screen.queryByTestId('player')).not.toBeInTheDocument());
});

test('a new selection checkpoints zero rather than the previous player position', async () => {
  render(<JamPlaybackProvider><IndependentPlaybackProvider resolveItem={async item => ({ video_id: item.id })}><Probe /></IndependentPlaybackProvider></JamPlaybackProvider>);
  await waitFor(() => expect(screen.getByTestId('player')).toHaveAttribute('data-video', 'a'));
  fireEvent.click(screen.getByRole('button', { name: 'next' }));
  await waitFor(() => expect(screen.getByTestId('player')).toHaveAttribute('data-video', 'b'));
  expect(JSON.parse(sessionStorage.getItem('musicone:independent:user:room'))).toMatchObject({ itemId: 'b', time: 0 });
});
