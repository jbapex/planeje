import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { loadAtlasInbox, markAtlasInbox } from '@/lib/atlasApi';

export default function useAtlasInbox({ enabled = true } = {}) {
  const {user}=useAuth();const [state,setState]=useState({owner:null,items:[],worker:null,error:'',loading:true});
  const refresh=useCallback(async()=>{
    if(!user?.id || !enabled)return;
    const {data,error}=await supabase.from('atlas_settings').select('owner_id,enabled').eq('owner_id',user.id).maybeSingle();
    if(error||!data?.enabled){setState({owner:null,items:[],worker:null,error:'',loading:false});return;}
    try{const result=await loadAtlasInbox();setState({owner:user.id,items:result.items||[],worker:result.worker,error:'',loading:false});}
    catch(e){setState(s=>({...s,owner:user.id,error:e.message,loading:false}));}
  },[user?.id,enabled]);
  useEffect(()=>{let alive=true;setState({owner:null,items:[],worker:null,error:'',loading:true});
    if(user?.id && enabled)void refresh();const timer=setInterval(()=>{if(alive&&enabled&&!document.hidden)void refresh();},30000);
    return()=>{alive=false;clearInterval(timer);};},[refresh,user?.id,enabled]);
  const visible=state.owner===user?.id;
  return {...state,visible,items:visible?state.items:[],unread:visible?state.items.filter(i=>!i.read_at&&i.state==='open').length:0,refresh,
    mark:async(id,archive=false)=>{await markAtlasInbox(id,archive);await refresh();}};
}
