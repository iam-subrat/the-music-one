import PlatformLinks from './PlatformLinks';
import { preferredLink, PLATFORM_META } from '../lib/platform';
import s from '../styles/jam.module.css';

export default function PlayerLinks({ item, preferredPlatform, children }) {
  if (!item) return null;
  const links = item.platform_links ?? {};
  const preferred = preferredLink(links, preferredPlatform);
  const meta = preferred && PLATFORM_META[preferred.platform];
  return <details className={s.listenDetails}>
    <summary>Listen on other platforms</summary>
    {preferred && <a className={s.preferredBtn} href={preferred.url} target="_blank" rel="noopener noreferrer"
      style={{ '--platform-color': meta?.color }}>Open on {meta?.name || preferred.platform}</a>}
    <PlatformLinks platformLinks={links} query={`${item.title} ${item.artist}`} activePlatform={preferred?.platform} />
    {children}
  </details>;
}
