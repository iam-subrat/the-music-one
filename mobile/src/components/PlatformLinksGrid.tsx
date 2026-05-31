import React from 'react';
import { View, StyleSheet } from 'react-native';
import { PLATFORM_META } from '../lib/platform';
import PlatformLinkCard from './PlatformLinkCard';
import { spacing } from '../constants/theme';

interface Props {
  platformLinks: Record<string, string | undefined>;
  searchQuery: string;
}

export default function PlatformLinksGrid({ platformLinks, searchQuery }: Props) {
  return (
    <View style={styles.grid}>
      {Object.entries(PLATFORM_META).map(([key, p]) => {
        const directUrl = platformLinks[key];
        const href = directUrl ?? p.searchUrl(searchQuery);
        const iconUrl = p.iconSvgUrl ?? p.iconUrl ?? null;
        return (
          <PlatformLinkCard
            key={key}
            platformKey={key}
            name={p.name}
            color={p.color}
            iconUrl={iconUrl}
            href={href}
            isDirect={!!directUrl}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -spacing.xs,
  },
});
