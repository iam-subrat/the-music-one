import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSkipVotes } from '../hooks/useSkipVotes';
import { castSkipVote, removeSkipVote } from '../lib/queue';
import { colors, spacing, radius, typography } from '../constants/theme';

interface Props {
  queueItemId: string;
  userId: string;
  sessionId: string;
  participantCount: number;
  onVoted?: () => void;
}

export default function SkipVoteButton({
  queueItemId,
  userId,
  sessionId,
  participantCount,
  onVoted,
}: Props) {
  const { count, hasVoted } = useSkipVotes(queueItemId, userId, sessionId);
  const threshold = Math.floor(participantCount / 2) + 1;

  async function handlePress() {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if (hasVoted) {
        await removeSkipVote(queueItemId);
      } else {
        const skipped = await castSkipVote(queueItemId, threshold);
        if (skipped) onVoted?.();
      }
    } catch { /* swallow */ }
  }

  return (
    <Pressable
      style={[styles.btn, hasVoted && styles.btnVoted]}
      onPress={handlePress}
    >
      <Text style={[styles.text, hasVoted && styles.textVoted]}>
        {'👎'} Skip ({count}/{threshold}){hasVoted ? ' ✓' : ''}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  btnVoted: {
    borderColor: colors.danger,
    backgroundColor: colors.danger + '22',
  },
  text: {
    color: colors.textMuted,
    fontSize: typography.small,
  },
  textVoted: {
    color: colors.danger,
  },
});
