import { useEffect } from 'react';
import { Scene } from './components/canvas/Scene';
import { Sidebar } from './components/ui/Sidebar';
import { BottomBar, LeereWeltHinweis } from './components/ui/BottomBar';
import { SliceChip } from './components/ui/SliceChip';
import { AnsichtChip } from './components/ui/AnsichtChip';
import { useBuildStore } from './store/useBuildStore';

export default function App() {
  // Build-Verwaltung starten: letzten aktiven Build laden, Autosave aktivieren
  useEffect(() => {
    void useBuildStore.getState().init();
  }, []);

  return (
    <div className="app">
      <Sidebar />
      {/* Kontextmenü unterdrücken — Rechtsklick ist zum Abbauen reserviert */}
      <main className="buehne" onContextMenu={(e) => e.preventDefault()}>
        <Scene />
        <LeereWeltHinweis />
        <div className="chips-oben">
          <AnsichtChip />
          <SliceChip />
        </div>
        <BottomBar />
      </main>
    </div>
  );
}
