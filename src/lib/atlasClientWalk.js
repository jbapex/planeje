/** Pure illustrative motion: one company avatar per current client, no presence inference. */
export const CLIENT_WALK_PATHS={
 jb:[[98,129],[205,129],[205,195],[98,195]],
 apice:[[405,129],[512,129],[512,195],[405,195]],
 unclassified:[[64,306],[544,306],[544,342],[64,342]],
};
export const clientAvatarSeed=id=>[...String(id)].reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,7);
export function clientWalkers(clients,now=Date.now(),{reducedMotion=false}={}) {
 const unique=[...new Map(clients.map(c=>[c.id,c])).values()],time=Number.isFinite(now)?Math.max(0,now/1000):0;
 return Object.entries(CLIENT_WALK_PATHS).flatMap(([operation,path])=>{
  const group=unique.filter(c=>(CLIENT_WALK_PATHS[c.operation]?c.operation:'unclassified')===operation).sort((a,b)=>a.id.localeCompare(b.id));
  const lengths=path.map((p,i)=>Math.hypot(path[(i+1)%path.length][0]-p[0],path[(i+1)%path.length][1]-p[1])),total=lengths.reduce((a,b)=>a+b,0);
  return group.map((c,i)=>{
   const seed=clientAvatarSeed(c.id),phase=(time+(seed%19)/3)%14,moving=!reducedMotion&&phase<12;
   const travel=reducedMotion?0:Math.floor((time+(seed%19)/3)/14)*12+Math.min(phase,12);
   let distance=(i/group.length*total+travel*11)%total,segment=0;
   while(segment<lengths.length-1&&distance>lengths[segment])distance-=lengths[segment++];
   const a=path[segment],b=path[(segment+1)%path.length],f=distance/lengths[segment],dx=b[0]-a[0],dy=b[1]-a[1];
   return {id:c.id,name:String(c.empresa||'Cliente'),initials:String(c.empresa||'Cliente').split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase(),logo_url:c.logo_url||null,operation,seed,x:a[0]+dx*f,y:a[1]+dy*f,dir:dx>0?'right':dx<0?'left':dy>0?'down':'up',pose:moving?'walk':'stand',frame:moving?Math.floor(time*7+seed)%4:0};
  });
 });
}
export function pickClientWalker(walkers,x,y) {
 return [...walkers].sort((a,b)=>b.y-a.y).find(c=>x>=c.x-13&&x<=c.x+13&&y>=c.y-57&&y<=c.y+3)?.id||null;
}
