import { useEffect } from 'react';
import {
  clearSaveEditorPulse,
  touchSaveEditorPulse,
} from '../game/saveSync';

const PULSE_MS = 4000;

/** Heartbeat so an open game tab pauses auto-save while this editor is active. */
export function useSaveEditorPulse(): void {
  useEffect(() => {
    touchSaveEditorPulse();
    const id = setInterval(touchSaveEditorPulse, PULSE_MS);
    const stop = () => clearSaveEditorPulse();
    window.addEventListener('beforeunload', stop);
    return () => {
      clearInterval(id);
      window.removeEventListener('beforeunload', stop);
      stop();
    };
  }, []);
}
