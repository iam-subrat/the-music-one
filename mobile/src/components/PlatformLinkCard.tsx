import React from 'react';
import { Pressable, View, Text, StyleSheet, Linking, Image } from 'react-native';
import { colors, radius, spacing, typography } from '../constants/theme';

interface Props {
  platformKey: string;
  name: string;
  color: string;
  iconUrl: string | null;
  href: string;
  isDirect: boolean;
}

export default function PlatformLinkCard({ platformKey: _platformKey, name, color, iconUrl, href, isDirect }: Props) {
  return (
    <Pressable
      style={({ pressed }) => [styles.card, { opacity: pressed ? 0.7 : 1, borderColor: isDirect ? color : colors.border }]}
      onPress={() => Linking.openURL(href)}
      accessibilityLabel={`${isDirect ? 'Open' : 'Search'} on ${name}`}
    >
      <View style={styles.iconWrap}>
        {iconUrl ? (
          <Image source={{ uri: iconUrl }} style={styles.icon} />
        ) : (
          <Text style={[styles.fallback, { color }]}>{name.slice(0, 2)}</Text>
        )}
      </View>
      <Text style={styles.name} numberOfLines={1}>{name}</Text>
      <View style={[styles.badge, isDirect ? { backgroundColor: color + '33' } : styles.searchBadge]}>
        <Text style={[styles.badgeText, { color: isDirect ? color : colors.textMuted }]}>
          {isDirect ? 'Open ↗' : 'Search ↗'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: '45%',
    maxWidth: '50%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    margin: spacing.xs,
    alignItems: 'center',
    gap: 6,
  },
  iconWrap: { width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },
  icon: { width: 28, height: 28 },
  fallback: { fontSize: 14, fontWeight: '700' },
  name: { color: colors.text, fontSize: typography.small, textAlign: 'center' },
  badge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  searchBadge: { backgroundColor: colors.surfaceElevated },
  badgeText: { fontSize: typography.caption },
});
