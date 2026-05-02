import s from '../styles/jam.module.css';

export default function QueueCard({ item, index }) {
  const cls = item.status === 'played' ? s.queueCardPlayed : item.status === 'skipped' ? s.queueCardSkipped : '';
  return (
    <div className={`${s.queueCard} ${cls}`}>
      {item.thumbnail_url
        ? <img className={s.queueThumb} src={item.thumbnail_url} alt="" />
        : <div className={s.queueThumb} />}
      <div className={s.queueMeta}>
        <div className={s.queueTitle}>{item.title}</div>
        <div className={s.queueArtist}>{item.artist}</div>
        <div className={s.queueBy}>by {item.profiles?.display_name || 'someone'}</div>
      </div>
      {index != null && <div className={s.queuePos}>#{index}</div>}
    </div>
  );
}
