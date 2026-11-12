import { useCallback, useEffect, useRef, useState } from 'react';
import { connectAtlasVoice } from '@/lib/atlasApi';
import { AtlasVoiceSession } from '@/lib/atlasVoiceSession';

export default function useAtlasVoice(atlas, userId) {
  const atlasRef = useRef(atlas);
  atlasRef.current = atlas;
  const engine = useRef(null);
  const levelRef = useRef(0);
  const levelsRef = useRef({ input: 0, output: 0 });
  const observedJobs=useRef(new Map());
  const [state, setState] = useState({ status: 'idle', error: '', subtitle: '', muted: false, needsPlay: false });
  useEffect(() => {
    const session = new AtlasVoiceSession({ connect: connectAtlasVoice, consult: (message) => atlasRef.current.send(undefined, message), onChange: setState, onLevel: (level, levels) => { levelRef.current = level; levelsRef.current = levels || { input: level, output: level }; } });
    engine.current = session;
    const leave = () => session.stop();
    window.addEventListener('pagehide', leave);
    return () => { session.onChange = () => {}; session.stop(); window.removeEventListener('pagehide', leave); };
  }, [userId, atlas.clientId]);
  useEffect(() => { if (!atlas.base?.enabled || atlas.gateError) engine.current?.stop(); }, [atlas.base?.enabled, atlas.gateError]);
  useEffect(()=>{
    for(const job of atlas.jobs||[]) {
      const prior=observedJobs.current.get(job.id);
      if(['queued','running'].includes(prior)&&job.status==='completed')engine.current?.announceMission(job);
      observedJobs.current.set(job.id,job.status);
    }
  },[atlas.jobs]);
  const stop = useCallback(() => engine.current?.stop(), []);
  return { ...state, levelRef, levelsRef, active: state.status !== 'idle', start: () => engine.current?.start(atlas.clientId), stop, mute: () => engine.current?.toggleMute(), interrupt: () => engine.current?.interrupt(), play: () => engine.current?.play() };
}
