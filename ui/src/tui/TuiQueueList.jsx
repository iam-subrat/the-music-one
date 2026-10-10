import s from './tui.module.css';

export default function TuiQueueList({ items, currentId, autoPilot }) {
  return <section className={s.panel} aria-label="Queue">
    <div className={s.panelLabel}>queue ({items.length}){autoPilot && <span className={s.queueAutoPilot}>[AI-DJ Active]</span>}</div>
    {!items.length ? <div className={`${s.logLine} ${s.mute}`}>Queue empty</div> : <table className={s.queueTable}>
      <thead><tr><th>#</th><th>title</th><th>by</th></tr></thead>
      <tbody>{items.map((item, index) => <tr key={item.id} className={item.id === currentId ? s.playing : undefined}>
        <td className={s.idx}>{String(index + 1).padStart(2, '0')}</td>
        <td>{item.title}<span className={s.queueArtist}> · {item.artist}</span>
          {item.resolve_status === 'resolving' && <span className={s.warn}> · Pending</span>}
          {item.resolve_status === 'failed' && <span className={s.err}> · Unavailable</span>}
        </td><td className={s.dim}>{item.profiles?.display_name || 'someone'}</td>
      </tr>)}</tbody>
    </table>}
  </section>;
}
