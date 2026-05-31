import React from 'react';
import { View, Text, Pressable, StyleSheet, Share, Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { colors, spacing, radius, typography } from '../constants/theme';
import { WEB_BASE } from '../constants/config';

interface Props {
  code: string;
}

export default function InviteBadge({ code }: Props) {
  const url = `${WEB_BASE}/jam/${code}`;

  async function handleCopy() {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await Clipboard.setStringAsync(url);
    Alert.alert('Copied!', 'Invite link copied to clipboard');
  }

  async function handleShare() {
    await Share.share({ message: `Join my MusicOne jam session: ${url}` });
  }

  return (
    <View style={styles.badge}>
      <Text style={styles.label}>Invite: </Text>
      <Text style={styles.code}>{code}</Text>
      <Pressable style={styles.btn} onPress={handleCopy}>
        <Text style={styles.btnText}>Copy</Text>
      </Pressable>
      <Pressable style={styles.btn} onPress={handleShare}>
        <Text style={styles.btnText}>Share</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  label: { color: colors.textMuted, fontSize: typography.small },
  code: { color: colors.text, fontSize: typography.body, fontWeight: '700', letterSpacing: 2 },
  btn: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  btnText: { color: colors.text, fontSize: typography.caption },
});
