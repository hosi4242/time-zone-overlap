(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.TZO_REFERENCE = factory();
})(globalThis, function () {
  "use strict";
  var STEP = 15 * 60 * 1000;
  var MIN = 60 * 1000;
  function fmt(tz) { return new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", { timeZone: tz, hourCycle: "h23", year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit" }); }
  var cache = new Map(); var boundaryCache = new Map();
  function parts(ms,tz) { var f=cache.get(tz); if(!f){f=fmt(tz);cache.set(tz,f);} var a=f.formatToParts(new Date(ms)),o={}; for(var i=0;i<a.length;i++) if(a[i].type!=="literal") o[a[i].type]=Number(a[i].value); return {y:o.year,m:o.month,d:o.day,hh:o.hour,mm:o.minute,ss:o.second}; }
  function key(p){return p.y+"-"+String(p.m).padStart(2,"0")+"-"+String(p.d).padStart(2,"0");}
  function mins(p){return p.hh*60+p.mm;}
  function nextDate(s){var a=s.split("-").map(Number),d=new Date(Date.UTC(a[0],a[1]-1,a[2]+1));return d.getUTCFullYear()+"-"+String(d.getUTCMonth()+1).padStart(2,"0")+"-"+String(d.getUTCDate()).padStart(2,"0");}
  function boundary(tz,date){var ck=tz+"|"+date;if(boundaryCache.has(ck))return boundaryCache.get(ck);var a=date.split("-").map(Number), target=date, start=Date.UTC(a[0],a[1]-1,a[2])-48*3600000, end=Date.UTC(a[0],a[1]-1,a[2])+72*3600000; for(var t=start;t<=end;t+=MIN) if(key(parts(t,tz))===target){boundaryCache.set(ck,t);return t;} throw new RangeError("reference boundary failed "+tz+" "+date);}
  function working(m,s){ if(s.start===s.end) throw new RangeError("equal schedule"); var w=s.start<s.end ? m>=s.start&&m<s.end : m>=s.start||m<s.end; if(s.lunch && m>=720&&m<780) w=false; return w; }
  function tail(anchor,date,s,b0,b1){if(s.start<=s.end||s.end===0)return b1;var d2=nextDate(nextDate(date)), e=boundary(anchor.tz,d2),last=-1;for(var t=b1;t<e;t+=STEP){var p=parts(t,anchor.tz);if(key(p)===nextDate(date)&&mins(p)<s.end)last=t;}return last<0?b1:last+STEP;}
  function run(state){var a=state.date,b1=nextDate(a), b0=boundary(state.cities[0].tz,a), bEnd=boundary(state.cities[0].tz,b1), end=tail(state.cities[0],a,state.schedules[0],b0,bEnd), n=Math.floor((end-b0)/STEP), slots=[], ranges=[], startRun=null;
    for(var i=0;i<n;i++){var t=b0+i*STEP, ap=parts(t,state.cities[0].tz), ad=key(ap), ins=state.schedules[0].start>state.schedules[0].end ? ((ad===a&&mins(ap)>=state.schedules[0].start)||(ad===b1&&mins(ap)<state.schedules[0].end)) : t>=b0&&t<bEnd; var ok=ins; for(var c=0;c<state.cities.length&&ok;c++){var p=parts(t,state.cities[c].tz); if(!working(mins(p),state.schedules[c]))ok=false;} slots.push({t:t,inSession:ins,overlap:ok}); if(ok&&startRun===null)startRun=t; if(!ok&&startRun!==null){ranges.push({startUtc:startRun,endUtc:t});startRun=null;}}
    if(startRun!==null)ranges.push({startUtc:startRun,endUtc:b0+n*STEP});
    return {baseStartUtc:b0,baseEndUtc:bEnd,tailEndUtc:end,baseSlotCount:Math.floor((bEnd-b0)/STEP),gridSlotCount:n,overlapRanges:ranges}; }
  return { run:run, localParts:parts };
});
