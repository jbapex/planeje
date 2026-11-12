/** Same 24×34 world-pixel sheet and foot anchor as the office characters. */
export type RobotDirection='down'|'up'|'left'|'right';
const cache=new Map<string,{canvas:HTMLCanvasElement;ax:number;ay:number}>();
export function atlasSprite(dir:RobotDirection,walking:boolean,frame:number){
 const f=frame%(walking?4:2),key=dir+':'+walking+':'+f;
 const old=cache.get(key);if(old)return old;
 const canvas=document.createElement('canvas');canvas.width=24;canvas.height=34;
 const c=canvas.getContext('2d')!;c.imageSmoothingEnabled=false;
 if(dir==='left'){c.translate(24,0);c.scale(-1,1);}
 const edge='#443e56',metal='#ecebf4',shade='#a6a0b9',light='#ffffff',purple='#8b5ac8',dark='#312d49',glow='#d4b4ff';
 const r=(x:number,y:number,w:number,h:number,color:string)=>{c.fillStyle=color;c.fillRect(x,y,w,h);};
 const box=(x:number,y:number,w:number,h:number,color:string)=>{r(x+1,y,w-2,h,edge);r(x,y+1,w,h-2,edge);r(x+1,y+1,w-2,h-2,color);};
 const side=dir==='left'||dir==='right',step=walking?[0,1,0,-1][f]:0,bob=walking&&f%2?1:0;
 // Feet alternate as independent limbs; the profile stride also extends in x.
 const leg=(x:number,d:number,far=false)=>{const dx=side?d*2:0,dy=side?Math.abs(d):d;r(x+dx,25+dy,4,5,edge);r(x+dx+1,25+dy,2,3,far?shade:metal);r(x+dx-1,29+dy,5,2,far?'#726783':'#6c5387');r(x+dx,29+dy,3,1,shade);};
 leg(side?10:8,-step,true);leg(side?12:13,step);
 // Back arm, chest and front arm have opposite phases to the feet.
 const arm=(x:number,d:number,far=false)=>{const ay=18+bob+d;box(x,ay,4,7,far?shade:metal);r(x+1,ay+1,2,2,purple);r(x+1,ay+5,2,2,shade);};
 arm(side?8:3,step,true);
 box(side?9:7,18+bob,side?7:10,8,metal);r(side?10:8,19+bob,side?4:7,1,light);r(side?14:15,20+bob,1,4,shade);
 if(dir==='up'){r(9,20+bob,6,3,'#77658f');r(10,20+bob,1,2,shade);r(12,20+bob,1,2,shade);}
 else{r(side?13:10,21+bob,3,3,purple);r(side?14:11,21+bob,1,1,glow);}
 arm(side?14:17,-step);
 // Bevelled casing, one-pixel contact outlines and a top-left highlight.
 const hx=side?6:4,hw=side?13:16,hy=6+bob;
 box(hx,hy,hw,12,metal);r(hx+2,hy+1,hw-5,2,light);r(hx+hw-2,hy+3,1,7,shade);r(hx+2,hy+10,hw-4,1,shade);
 r(side?11:11,3+bob,2,3,shade);r(side?11:10,2+bob,side?2:4,2,purple);r(side?11:10,2+bob,1,1,glow);
 if(!side){r(2,10+bob,2,5,purple);r(20,10+bob,2,5,'#6f5495');}
 if(dir==='up'){
  r(7,10+bob,10,5,shade);r(8,10+bob,8,4,'#c9c1d7');r(9,11+bob,1,2,'#8f839f');r(12,11+bob,1,2,'#8f839f');r(15,11+bob,1,2,'#8f839f');
 }else if(side){
  r(14,9+bob,4,7,dark);r(14,9+bob,4,1,'#59516d');r(16,11+bob,2,walking||f===0?2:1,glow);r(14,15+bob,2,1,purple);
 }else{
  box(6,9+bob,12,8,dark);r(7,10+bob,10,1,'#514767');
  r(8,12+bob,2,walking||f===0?2:1,glow);r(14,12+bob,2,walking||f===0?2:1,glow);
  r(10,15+bob,4,1,'#a478df');r(9,14+bob,1,1,'#a478df');r(14,14+bob,1,1,'#a478df');
 }
 const sprite={canvas,ax:12,ay:31};cache.set(key,sprite);return sprite;
}
