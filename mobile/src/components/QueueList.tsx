import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { QueueItem } from '../lib/queue';
import QueueCard from './QueueCard';
import AddSongForm from './AddSongForm';
import { colors, spacing, typography } from '../constants/theme';

export function getUpcoming(items: QueueItem[], repeatMode: string): QueueItem[] {
  if (repeatMode !== 'queue') return items.filter((i) => i.status === 'queued');
  const playing = items.find((i) => i.status === 'playing');
  const eligible = items.filter((i) => i.status !== 'skipped' && i.status !== 'playing');
  if (!playing) return eligible;
  const after = eligible.filter((i) => i.position > playing.position);
  const before = eligible.filter((i) => i.position < playing.position);
  return [...after, ...before];
}

interface Props {
  items: QueueItem[];
  sessionId: string;
  repeatMode?: 'none' | 'song' | 'queue';
  onAdded?: (item: QueueItem) => void;
}

export default function QueueList({ items, sessionId, repeatMode = 'none', onAdded }: Props) {
  const upcoming = getUpcoming(items, repeatMode);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Queue ({upcoming.length})</Text>
      <AddSongForm sessionId={sessionId} onAdded={onAdded} />
      {upcoming.length === 0
        ? <Text style={styles.empty}>Queue is empty — add a song!</Text>
        : upcoming.map((item, idx) => <QueueCard key={item.id} item={item} index={idx + 1} />)
      }
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  label: {
    color: colors.textMuted,
    fontSize: typography.small,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  empty: {
    color: colors.textMuted,
    fontSize: typography.small,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
});
