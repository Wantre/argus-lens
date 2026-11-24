// Recherche vocale via Web Speech API (si disponible). Le micro est masqué sinon.
import { toast } from './dom.js';

export function createVoice(onText) {
  const SR = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
  if (!SR) return { supported: false, toggle() {} };
  let rec = null;
  return {
    supported: true,
    toggle(btn) {
      if (rec) { rec.stop(); return; }
      rec = new SR();
      rec.lang = 'fr-FR';
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      btn.classList.add('listening');
      btn.setAttribute('aria-pressed', 'true');
      rec.onresult = (e) => {
        const r = e.results[e.results.length - 1];
        onText(r[0].transcript, r.isFinal);
      };
      rec.onerror = (e) => { toast(e.error === 'not-allowed' ? 'Micro refusé par le navigateur' : `Reconnaissance vocale indisponible (${e.error})`, { kind: 'error' }); };
      rec.onend = () => { btn.classList.remove('listening'); btn.setAttribute('aria-pressed', 'false'); rec = null; };
      try { rec.start(); toast('Je vous écoute, Monsieur'); } catch { rec = null; }
    },
  };
}
