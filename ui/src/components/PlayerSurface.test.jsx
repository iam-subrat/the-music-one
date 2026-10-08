import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, test, vi } from 'vitest';
import IndependentPlayer from './IndependentPlayer';
import RepeatMenu from './RepeatMenu';

afterEach(cleanup);

test('personal playback is ready with just Play, without a redundant heading', () => {
  const local = { state: { item: { id: 'a', title: 'Dreams', artist: 'Fleetwood Mac', platform_links: {} }, repeat: 'none' },
    getTime: () => 0, getDuration: () => 180, getState: () => 5, play: vi.fn(), repeat: vi.fn() };
  render(<IndependentPlayer local={local} />);
  expect(screen.queryByText('Your playback')).not.toBeInTheDocument();
  expect(screen.getByText('Ready')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Previous track' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Next track' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Play playback' }));
  expect(local.play).toHaveBeenCalledTimes(1);
});

test('a cued personal player stays Ready even when the iframe reports paused', () => {
  const local = { state: { item: { id: 'a', title: 'Dreams', artist: 'Fleetwood Mac' }, repeat: 'none', started: false },
    getTime: () => 0, getDuration: () => 180, getState: () => 2 };
  render(<IndependentPlayer local={local} />);
  expect(screen.getByText('Ready')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Next track' })).not.toBeInTheDocument();
});

test('repeat menu supports keyboard selection, Escape and focus restoration', () => {
  const change = vi.fn();
  render(<RepeatMenu value="none" onChange={change} />);
  const trigger = screen.getByRole('button', { name: 'Repeat: Off' });
  fireEvent.click(trigger);
  expect(screen.getByRole('menuitemradio', { name: 'Off' })).toHaveFocus();
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });
  expect(screen.getByRole('menuitemradio', { name: 'Song' })).toHaveFocus();
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'Song' }));
  expect(change).toHaveBeenCalledWith('song');
  expect(trigger).toHaveFocus();
  fireEvent.click(trigger);
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});
