import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, test, vi } from 'vitest';
import QueueList from './QueueList';

vi.mock('../hooks/useSkipVotes', () => ({ useSkipVotes: () => ({ count: 0, hasVoted: false }) }));
vi.mock('../lib/flags', () => ({ FLAGS: { VOTE_TO_SKIP: true } }));
const song = { id: 'a', title: 'Dreams', artist: 'Fleetwood Mac', status: 'queued', position: 1, profiles: { display_name: 'Alex' } };
afterEach(cleanup);

test('both modes render the same queue row; personal play never exposes room voting', () => {
  const { container, unmount } = render(<QueueList items={[song]} showAdd={false} participantCount={2} />);
  const rowClass = container.querySelector('[data-queue-item="a"]').className;
  unmount();
  const local = { state: { item: song }, select: vi.fn() };
  const view = render(<QueueList items={[song]} showAdd={false} local={local} participantCount={2} />);
  expect(view.container.querySelector('[data-queue-item="a"]').className).toBe(rowClass);
  expect(screen.getByText('by Alex')).toBeVisible();
  expect(screen.queryByRole('button', { name: /skip/i })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Play Dreams' }));
  expect(local.select).toHaveBeenCalledWith(song);
});

test('previously played songs retain normal styling and voting when repeating the queue', () => {
  const view = render(<QueueList items={[{ ...song, status: 'played' }]} repeatMode="queue" showAdd={false} participantCount={3} />);
  const playedClass = view.container.querySelector('[data-queue-item="a"]').className;
  expect(screen.getByRole('button', { name: /skip/i })).toBeInTheDocument();
  view.rerender(<QueueList items={[song]} repeatMode="queue" showAdd={false} participantCount={3} />);
  expect(view.container.querySelector('[data-queue-item="a"]').className).toBe(playedClass);
});

test('removes a majority-skipped queued song', () => {
  const view = render(<QueueList items={[song]} repeatMode="none" showAdd={false} participantCount={3} />);
  expect(screen.getByRole('button', { name: /skip/i })).toBeInTheDocument();
  view.rerender(<QueueList items={[{ ...song, status: 'skipped' }]} repeatMode="none" showAdd={false} participantCount={3} />);
  expect(screen.queryByText(song.title)).not.toBeInTheDocument();
});
