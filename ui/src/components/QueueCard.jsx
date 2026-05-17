import s from '../styles/jam.module.css';

export default function QueueCard({ item, index }) {
  const statusCls =
    item.status === 'played' ? s.queueCardPlayed
    : item.status === 'skipped' ? s.queueCardSkipped
    : item.resolve_status === 'resolving' ? s.queueCardResolving
    : item.resolve_status === 'failed' ? s.queueCardFailed
    : '';

  return (
    <div className={`${s.queueCard} ${statusCls}`}>
      {item.thumbnail_url
        ? <img className={s.queueThumb} src={item.thumbnail_url} alt="" />
        : <div className={s.queueThumb} />}
      <div className={s.queueMeta}>
        <div className={s.queueTitle} title={item.title}>{item.title}</div>
        <div className={s.queueArtist} title={item.artist}>{item.artist}</div>
        <div className={s.queueBy}>by {item.profiles?.display_name || 'someone'}</div>
      </div>
      {item.resolve_status === 'resolving' && (
        <span className={s.resolvingBadge}>Resolving…</span>
      )}
      {item.resolve_status === 'failed' && (
        <span className={s.failedBadge}>Failed</span>
      )}
      {index != null && <div className={s.queuePos}>#{index}</div>}
    </div>
  );
}
