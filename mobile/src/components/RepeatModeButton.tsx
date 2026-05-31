import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius, typography } from '../constants/theme';

type RepeatMode = 'none' | 'song' | 'queue';

interface Props {
  mode: RepeatMode;
  onChange: (mode: RepeatMode) => void;
}

const NEXT: Record<RepeatMode, RepeatMode> = { none: 'song', song: 'queue', queue: 'none' };
const LABEL: Record<RepeatMode, string> = {
  none: '🔁 Repeat',
  song: '🔂 Song ✓',
  queue: '🔁 Queue ✓',
};

export default function RepeatModeButton({ mode, onChange }: Props) {
  return (
    <Pressable
      style={[styles.btn, mode !== 'none' && styles.btnActive]}
      onPress={() => onChange(NEXT[mode])}
    >
      <Text style={[styles.text, mode !== 'none' && styles.textActive]}>
        {LABEL[mode]}
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
  btnActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '22',
  },
  text: {
    color: colors.textMuted,
    fontSize: typography.small,
  },
  textActive: {
    color: colors.primary,
  },
});
