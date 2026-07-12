import { useUiStore } from '../../store/useUiStore';

/** Umschalter 3D-Orbit ↔ 2D-Draufsicht, oben rechts in der Bühne. */
export function AnsichtChip() {
  const ansicht = useUiStore((s) => s.ansicht);
  const setAnsicht = useUiStore((s) => s.setAnsicht);

  return (
    <div className="segment ansicht-chip">
      <button className={ansicht === '3d' ? 'aktiv' : ''} onClick={() => setAnsicht('3d')} title="3D-Ansicht">
        3D
      </button>
      <button
        className={ansicht === '2d' ? 'aktiv' : ''}
        onClick={() => setAnsicht('2d')}
        title="2D-Draufsicht"
      >
        2D
      </button>
    </div>
  );
}
