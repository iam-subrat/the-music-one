import React from 'react';
import { View, Text, Pressable, Linking, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../constants/theme';

export default function OdesliAttribution() {
  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>
        Song matching powered by{' '}
        <Text
          style={styles.link}
          onPress={() => Linking.openURL('https://odesli.co/')}
          accessibilityRole="link"
        >
          Songlink/Odesli
        </Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  text: {
    color: colors.textMuted,
    fontSize: typography.caption,
    textAlign: 'center',
  },
  link: {
    color: colors.text,
    textDecorationLine: 'underline',
  },
});
