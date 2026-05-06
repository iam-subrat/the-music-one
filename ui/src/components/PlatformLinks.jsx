import { PLATFORM_META } from '../lib/platform';
import s from '../styles/jam.module.css';

/**
 * Renders a grid of branded platform pills.
 *
 * @param {object}   platformLinks  – The song's stored platform_links map
 * @param {string}   query          – Encoded search query ("Title Artist")
 * @param {string}   [activePlatform] – Key of the platform already shown as primary CTA (excluded)
 */
export default function PlatformLinks({ platformLinks = {}, query, activePlatform }) {
  const links = Object.entries(PLATFORM_META).map(([key, meta]) => {
    const directUrl = platformLinks?.[key];
    return {
      key,
      meta,
      url: directUrl || meta.searchUrl(query),
      isDirect: !!directUrl,
    };
  });

  return (
    <div className={s.platformGrid}>
      {links.map(({ key, meta, url, isDirect }) => {
        const isActive = key === activePlatform;
        const iconSrc = meta.iconSvgUrl || meta.iconUrl;
        return (
          <a
            key={key}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={`${s.platformPill} ${isActive ? s.platformPillActive : ''} ${!isDirect ? s.platformPillSearch : ''}`}
            style={{ '--platform-color': meta.color }}
            title={isDirect ? `Open on ${meta.name}` : `Search "${query}" on ${meta.name}`}
          >
            {iconSrc && (
              <img
                src={iconSrc}
                alt=""
                className={s.platformIcon}
                width={14}
                height={14}
                onError={e => { e.currentTarget.style.display = 'none'; }}
              />
            )}
            <span className={s.platformName}>{meta.name}</span>
            {!isDirect && <span className={s.platformSearchTag}>search</span>}
          </a>
        );
      })}
    </div>
  );
}
