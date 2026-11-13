import { PLATFORMS } from '../data';
import { useApp } from '../App';

export default function PlatPick() {
  const { visible, primary, setPrimary } = useApp();
  return (
    <div className="platpick" role="radiogroup" aria-label="Platform">
      {visible.map((p) => {
        const info = PLATFORMS.find((x) => x.id === p)!;
        return (
          <button key={p} role="radio" aria-checked={p === primary} className={p === primary ? 'on' : ''} style={{ ['--pc' as string]: `var(--p-${p})` }} onClick={() => setPrimary(p)}>
            {info.short}
          </button>
        );
      })}
    </div>
  );
}
