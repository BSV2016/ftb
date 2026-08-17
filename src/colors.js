export const COMMON_COLORS = [
  ['Grün', '#15803D'], ['Schwarz', '#111111'], ['Weiß', '#FFFFFF'], ['Rot', '#B91C1C'],
  ['Blau', '#1D4ED8'], ['Gelb', '#FACC15'], ['Orange', '#EA580C'], ['Violett', '#7E22CE'],
  ['Türkis', '#0F766E'], ['Grau', '#64748B'], ['Dunkelblau', '#16324F'], ['Gold', '#D4A017'],
];
export function normalizeHex(value) { const v=String(value||'').trim().toUpperCase(); return /^#[0-9A-F]{6}$/.test(v)?v:null; }
function rgb(hex){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255)}
function lum(hex){return rgb(hex).map(c=>c<=.03928?c/12.92:Math.pow((c+.055)/1.055,2.4)).reduce((s,c,i)=>s+c*[.2126,.7152,.0722][i],0)}
export function contrast(a,b){const[x,y]=[lum(a),lum(b)].sort((m,n)=>n-m);return(x+.05)/(y+.05)}
export function textOn(bg){return contrast(bg,'#FFFFFF')>=contrast(bg,'#111111')?'#FFFFFF':'#111111'}
export function validatePalette(primary,secondary,accent){const colors=[primary,secondary,accent].map(normalizeHex);if(colors.some(x=>!x))return{ok:false,error:'Ungültige Farbe.'};const[p,s,a]=colors;if(contrast(p,s)<3)return{ok:false,error:'Primär- und Sekundärfarbe sind zu ähnlich.'};return{ok:true,colors,textPrimary:textOn(p),textAccent:textOn(a)}}
export function tickerPalette(primary){const yellow='#FACC15';if(contrast(primary,yellow)<1.7)return{background:'#B42318',text:'#FFFFFF'};return{background:yellow,text:'#111111'}}
