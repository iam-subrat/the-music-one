import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { QueueItem } from '../lib/queue';
import { colors, spacing, radius, typography } from '../constants/theme';

interface Props {
  item: QueueItem;
  index?: number;
}

export default function QueueCard({ item, index }: Props) {
  const isPlaying = item.status === 'playing';
  const isPlayed = item.status === 'played';
  const isSkipped = item.status === 'skipped';
  const isResolving = item.resolve_status === 'resolving';
  const isFailed = item.resolve_status === 'failed';

  return (
    <View style={[
      styles.card,
      isPlaying && styles.playing,
      (isPlayed || isSkipped) && styles.played,
    ]}>
      {item.thumbnail_url
        ? <Image source={{ uri: item.thumbnail_url }} style={styles.thumb} />
        : <View style={[styles.thumb, { backgroundColor: colors.surfaceElevated }]} />
      }
      <View style={styles.meta}>
        <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.artist} numberOfLines={1}>{item.artist}</Text>
        <Text style={styles.by}>by {item.profiles?.display_name ?? 'someone'}</Text>
      </View>
      {isResolving && <Text style={styles.badge}>Resolving…</Text>}
      {isFailed && <Text style={[styles.badge, { color: colors.danger }]}>Failed</Text>}
      {index != null && <Text style={styles.pos}>#{index}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
  },
  playing: { borderColor: colors.primary },
  played: { opacity: 0.4 },
  thumb: { width: 48, height: 48, borderRadius: radius.sm },
  meta: { flex: 1, gap: 2 },
  title: { color: colors.text, fontSize: typography.body, fontWeight: '600' },
  artist: { color: colors.textMuted, fontSize: typography.small },
  by: { color: colors.textMuted, fontSize: typography.caption },
  badge: { color: colors.textMuted, fontSize: typography.caption },
  pos: { color: colors.textMuted, fontSize: typography.caption, minWidth: 24, textAlign: 'right' },
});
