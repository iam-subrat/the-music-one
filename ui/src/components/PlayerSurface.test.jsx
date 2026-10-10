import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, test, vi } from 'vitest';
import IndependentPlayer from './IndependentPlayer';
import RepeatMenu from './RepeatMenu';

afterEach(cleanup);

test('a loaded personal song has operational navigation before playback starts', () => {
  const local = { state: { item: { id: 'a', title: 'Dreams', artist: 'Fleetwood Mac', platform_links: {} }, repeat: 'none' },
    getTime: () => 0, getDuration: () => 180, getState: () => 5, play: vi.fn(), previous: vi.fn(), next: vi.fn(), repeat: vi.fn() };
  render(<IndependentPlayer local={local} />);
  expect(screen.queryByText('Your playback')).not.toBeInTheDocument();
  expect(screen.getByText('Ready')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Previous track' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next track' }));
  expect(local.previous).toHaveBeenCalledTimes(1);
  expect(local.next).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Play playback' }));
  expect(local.play).toHaveBeenCalledTimes(1);
});

test('a cued personal player stays Ready even when the iframe reports paused', () => {
  const local = { state: { item: { id: 'a', title: 'Dreams', artist: 'Fleetwood Mac' }, repeat: 'none', started: false },
    getTime: () => 0, getDuration: () => 180, getState: () => 2 };
  render(<IndependentPlayer local={local} />);
  expect(screen.getByText('Ready')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Next track' })).toBeEnabled();
});

test('navigation stays visible while audio plays even without the started flag', () => {
  const local = { state: { item: { id: 'a', title: 'Dreams', artist: 'Fleetwood Mac' }, repeat: 'none', started: false },
    getTime: () => 12, getDuration: () => 180, getState: () => 1 };
  render(<IndependentPlayer local={local} />);
  expect(screen.getByRole('button', { name: 'Pause playback' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Previous track' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Next track' })).toBeEnabled();
  const status = screen.getByRole('status');
  expect(status).toHaveTextContent('Playing');
  expect(status.querySelectorAll('[aria-hidden="true"] i')).toHaveLength(3);
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
