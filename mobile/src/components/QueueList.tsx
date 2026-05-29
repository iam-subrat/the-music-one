import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { QueueItem } from '../lib/queue';
import QueueCard from './QueueCard';
import AddSongForm from './AddSongForm';
import { colors, spacing, typography } from '../constants/theme';

interface Props {
  items: QueueItem[];
  sessionId: string;
  onAdded?: (item: QueueItem) => void;
}

export default function QueueList({ items, sessionId, onAdded }: Props) {
  const queued = items.filter((i) => i.status === 'queued');

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Queue ({queued.length})</Text>
      <AddSongForm sessionId={sessionId} onAdded={onAdded} />
      {queued.length === 0
        ? <Text style={styles.empty}>Queue is empty — add a song!</Text>
        : queued.map((item, idx) => <QueueCard key={item.id} item={item} index={idx + 1} />)
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
