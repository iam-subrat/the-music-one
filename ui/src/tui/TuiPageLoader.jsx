import s from './tui.module.css';

export default function TuiPageLoader() {
  return (
    <div className={s.cubeLoader} role="status" aria-label="Loading">
      <span className={s.cube} aria-hidden="true">
        <span className={s.cubeFace} />
        <span className={s.cubeFace} />
        <span className={s.cubeFace} />
        <span className={s.cubeFace} />
        <span className={s.cubeFace} />
        <span className={s.cubeFace} />
      </span>
    </div>
  );
}
