/* ============================================================================
   scope-viz.js — shared SCOPE visualisation suite
   Renders from the "market view" shape the server sends to the instructor
   console (see control.html): a market m has
     m.marketId, m.phase, m.week, m.rounds, m.weekTotal, m.nextTotal,
     m.history[] (each {total, ordR, ordW, ordD, ordM, served?, lost?}),
     m.scores {serviceLevel, chainProfit[2], bestChain, ranked[{id,chain,bot,name,profit,inv}]},
     m.nodes[] (each {id, tier, chain, inv, profit, seat{bot,name}, submittedOrder, submittedAlloc, ordersIn}),
     m.cfg
   The same functions drive the live console and the self-contained big-screen
   demo, so the projector preview is faithful to the real thing.
   ==========================================================================*/
(function (root) {
  var C1 = "#2f6fb0", C2 = "#d0443f", NAVY = "#0b1b3f", RED = "#E60028",
      GREEN = "#1f8a5a", AMBER = "#c77700", PURPLE = "#7a4fd0";
  var TN = { S: "Supplier", M: "Manufacturer", D: "Distributor", W: "Wholesaler", R: "Retailer" };
  var ICONS = {
    S: '<path d="M12 3.2l8 5.4-3 10.2H7l-3-10.2z"/><path d="M4 8.6h16M9 3.2L6.5 8.6 12 18.8 17.5 8.6 15 3.2"/>',
    M: '<path d="M3 20.5V10l5 3.1V10l5 3.1V6.6l5 3.1v7.8z"/><path d="M2.5 20.5h19"/><path d="M17.2 6.6V3.6h3"/><rect x="7" y="16" width="3.4" height="4.5"/>',
    D: '<path d="M2 6.5h11.4v9.6H2z"/><path d="M13.4 9.4h4.1l3.5 3.5v3.2h-7.6z"/><circle cx="6" cy="18.2" r="1.7"/><circle cx="17.4" cy="18.2" r="1.7"/>',
    W: '<path d="M3 20.6V9.6l9-4.9 9 4.9v11z"/><path d="M2.5 20.6h19"/><path d="M8 20.6v-7.2h8v7.2"/><path d="M8 16.4h8"/>',
    R: '<path d="M4.2 9.6h15.6V20.6H4.2z"/><path d="M3.6 9.6l1.3-5h14.2l1.3 5"/><path d="M3.6 9.6c0 1.3 1.1 2.4 2.6 2.4s2.6-1.1 2.6-2.4c0 1.3 1.1 2.4 2.6 2.4s2.6-1.1 2.6-2.4c0 1.3 1.1 2.4 2.6 2.4s2.6-1.1 2.6-2.4"/><path d="M9.4 20.6v-5.4h5.2v5.4"/>'
  };
  function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];}); }
  function money(v){ v=Math.round(v||0); return (v<0?"-$":"$")+Math.abs(v).toLocaleString(); }
  function moneyK(v){ v=Math.round(v||0); var a=Math.abs(v), s=(v<0?"-$":"$"); return a>=1000 ? s+(a/1000).toFixed(1).replace(/\.0$/,'')+"k" : s+a; }
  function isC1(n){ return n.chain===1||n.chain===0; }   // control convention: chain 1 = top/blue
  function tierIcon(t,color,size,x,y){ var sc=(size||22)/24; return '<g transform="translate('+x+' '+y+') scale('+sc+')" fill="none" stroke="'+color+'" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+(ICONS[t]||"")+'</g>'; }

  /* ---- per-node history (server sends only current state; we accumulate) ---- */
  var HIST = {};        // marketId -> { len, hasOrd, nodes:{ id:{inv:[],ord:[]} } }
  var METRIC = 'stock'; // 'stock' | 'orders' — which metric the map bars show
  function orderVal(n){  // opportunistic: use a per-node order field if the server sends one
    if(typeof n.order==='number') return n.order;
    if(n.order && typeof n.order.own==='number') return n.order.own+(n.order.cross||0);
    if(typeof n.lastOrder==='number') return n.lastOrder;
    if(typeof n.orderQty==='number') return n.orderQty;
    return null;
  }
  function record(m){
    if(!m||!m.marketId||!m.history) return;
    var len=m.history.length, s=HIST[m.marketId];
    if(!s || len<s.len){ s={len:0,hasOrd:false,nodes:{}}; HIST[m.marketId]=s; }   // fresh / reset
    if(len>s.len){ (m.nodes||[]).forEach(function(n){ var e=s.nodes[n.id]=(s.nodes[n.id]||{inv:[],ord:[]});
      e.inv.push(Math.round(n.inv||0)); var ov=orderVal(n); if(ov!=null){ e.ord.push(Math.round(ov)); s.hasOrd=true; } else e.ord.push(null);
      if(e.inv.length>40){ e.inv.shift(); e.ord.shift(); } }); s.len=len; }
  }
  function nodeHist(m,id,key){ var s=HIST[m.marketId], e=s&&s.nodes[id]; if(!e)return []; return (key==='ord'?e.ord:e.inv); }
  function marketHasOrders(m){ var s=HIST[m.marketId]; return !!(s&&s.hasOrd); }

  /* ---- network map with per-node live bars (inventory history) ---- */
  function boardSVG(m, opts){
    opts=opts||{};
    var nodes=m.nodes||[], W=980, H=500, colX=[112,306,500,694,872], yTop=178, yBot=394, roff=50, NW=112, NH=90;
    var meId=opts.me||null, focus=opts.focus||null, big=opts.big;
    function pos(n){ if(n.tier==="R"){var mine=nodes.filter(function(x){return x.tier==="R"&&x.chain===n.chain;});var k=mine.indexOf(n);var base=isC1(n)?yTop:yBot;var off=mine.length>1?(k===0?-roff:roff):0;return{x:colX[4],y:base+off};} return{x:colX[{S:0,M:1,D:2,W:3}[n.tier]],y:isC1(n)?yTop:yBot}; }
    function barsSVG(n,leftX,rightX,base,accent){ var K=12;
      var useOrd=(METRIC==='orders' && marketHasOrders(m));
      var ser=nodeHist(m,n.id, useOrd?'ord':'inv').filter(function(v){return v!=null;});
      if(!ser.length && useOrd) ser=nodeHist(m,n.id,'inv').filter(function(v){return v!=null;});   // graceful fallback
      if(!ser.length)return ''; ser=ser.slice(-K);
      var mv=1; ser.forEach(function(v){ if(v>mv)mv=v; });
      var x0=leftX+12,x1=rightX-12,availW=x1-x0,HB=17,pitch=availW/K,bw=Math.max(2.4,pitch-1.5),out='',L=ser.length;
      ser.forEach(function(v,i){ var bh=Math.max(0.8,(v/mv)*HB),slot=K-L+i,bx=x0+slot*pitch+(pitch-bw)/2,last=(i===L-1);
        out+='<rect x="'+bx.toFixed(1)+'" y="'+(base-bh).toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+bh.toFixed(1)+'" rx="1" fill="'+accent+'" opacity="'+(last?0.95:(0.32+0.4*(i/K))).toFixed(2)+'"/>'; });
      out+='<line x1="'+x0.toFixed(1)+'" y1="'+base+'" x2="'+x1.toFixed(1)+'" y2="'+base+'" stroke="'+accent+'" stroke-width="0.8" opacity="0.22"/>';
      return out;
    }
    var conn=null;
    if(focus){ conn={}; conn[focus]=1; var fn=nodes.filter(function(x){return x.id===focus;})[0];
      if(fn){ var upT={M:"S",D:"M",W:"D",R:"W"}[fn.tier], dnT={S:"M",M:"D",D:"W",W:"R"}[fn.tier];
        nodes.forEach(function(x){ if((upT&&x.tier===upT)||(dnT&&x.tier===dnT))conn[x.id]=1; }); } }
    var s='<svg viewBox="0 0 '+W+' '+H+'" width="100%" style="font-family:Montserrat;display:block">';
    s+='<rect x="0" y="70" width="'+W+'" height="210" rx="16" fill="#f2f7fc"/><rect x="0" y="286" width="'+W+'" height="210" rx="16" fill="#fdf4f4"/>';
    s+='<text x="16" y="63" font-size="11" font-weight="800" fill="'+C1+'" letter-spacing=".08em">CHAIN 1</text><text x="16" y="281" font-size="11" font-weight="800" fill="'+C2+'" letter-spacing=".08em">CHAIN 2</text>';
    [["S","Supplier"],["M","Manufacturer"],["D","Distributor"],["W","Wholesaler"],["R","Retailer"]].forEach(function(hd,i){ s+=tierIcon(hd[0],NAVY,34,colX[i]-17,12)+'<text x="'+colX[i]+'" y="58" text-anchor="middle" font-size="16" font-weight="800" fill="'+NAVY+'">'+hd[1]+'</text>'; });
    // links
    nodes.forEach(function(n){ if(n.tier==="S")return; var upT={M:"S",D:"M",W:"D",R:"W"}[n.tier];
      nodes.filter(function(u){return u.tier===upT;}).forEach(function(u){ var pa=pos(n),pb=pos(u),own=(u.chain===n.chain);
        var active=!conn||(conn[n.id]&&conn[u.id]); var op=own?(active?0.5:0.08):(active?0.55:0.06);
        s+='<line x1="'+pa.x+'" y1="'+pa.y+'" x2="'+pb.x+'" y2="'+pb.y+'" stroke="'+(own?(isC1(u)?C1:C2):"#aab4c4")+'" stroke-width="'+(own?2.6:1.5)+'" '+(own?'':'stroke-dasharray="5 5" ')+'opacity="'+op+'"/>';
      });
    });
    // nodes
    nodes.forEach(function(n){ var p=pos(n),accent=isC1(n)?C1:C2,me=(n.id===meId),inv=Math.round(n.inv||0),hc=inv<=0?"#e5484d":inv<300?"#f5a623":"#2fa96a";
      var dimmed=(conn&&!conn[n.id]),left=p.x-NW/2,right=p.x+NW/2,top=p.y-NH/2;
      var submitted=(m.phase==="order")?(n.submittedOrder||n.tier==="S"||(n.seat&&n.seat.bot)):(m.phase==="ship")?(n.submittedAlloc||n.ordersIn===0||(n.seat&&n.seat.bot)):false;
      var stroke=me?NAVY:(submitted?GREEN:accent), sw=me?3:(submitted?2.4:1.4);
      var tip=esc(n.id)+' · '+(TN[n.tier]||n.tier)+' · on hand '+inv+' · profit '+money(n.profit);
      s+='<g opacity="'+(dimmed?0.22:1)+'"><title>'+tip+'</title>'
        +'<rect x="'+left+'" y="'+top+'" width="'+NW+'" height="'+NH+'" rx="14" fill="#fff" stroke="'+stroke+'" stroke-width="'+sw+'"/>'
        +'<rect x="'+left+'" y="'+top+'" width="'+NW+'" height="6" rx="3" fill="'+accent+'"/>'
        +tierIcon(n.tier,accent,28,left+9,top+9)
        +'<text x="'+(right-12)+'" y="'+(top+25)+'" text-anchor="end" font-size="18" font-weight="800" fill="'+accent+'">'+esc(n.id)+'</text>'
        +'<text x="'+(left+13)+'" y="'+(top+(big?56:51))+'" font-size="'+(big?34:27)+'" font-weight="800" fill="#0f1024">'+inv+'</text>'
        +(big?'':'<text x="'+(left+14)+'" y="'+(top+61)+'" font-size="9" font-weight="700" fill="#9aa3b5" letter-spacing=".05em">ON HAND</text>')
        +'<circle cx="'+(right-15)+'" cy="'+(top+50)+'" r="'+(big?7:6)+'" fill="'+hc+'"/>'
        +barsSVG(n,left,right,top+84,accent)
        +((n.seat&&!n.seat.bot&&n.seat.name)?'<text x="'+p.x+'" y="'+(top-6)+'" text-anchor="middle" font-size="11" font-weight="700" fill="#5a6178">'+esc((n.seat.name||"").split(" ")[0])+'</text>':'')
        +(me?'<text x="'+p.x+'" y="'+(top-6)+'" text-anchor="middle" font-size="11" font-weight="800" fill="'+NAVY+'">YOU</text>':'')+'</g>';
    });
    return s+'</svg>';
  }

  /* ---- chart helpers ---- */
  function variance(a){ if(!a||a.length<2)return 0; var mn=a.reduce(function(x,y){return x+y;},0)/a.length; return a.reduce(function(x,y){return x+(y-mn)*(y-mn);},0)/a.length; }
  function lineChart(series, maxV, nx, o){ o=o||{}; var W=o.W||470,H=o.H||170,pad=26;
    var s='<svg viewBox="0 0 '+W+' '+H+'" width="100%" style="font-family:Montserrat;display:block">';
    s+='<line x1="'+pad+'" y1="'+(H-pad)+'" x2="'+(W-pad)+'" y2="'+(H-pad)+'" stroke="#e0e5f0"/><line x1="'+pad+'" y1="'+(pad*0.5)+'" x2="'+pad+'" y2="'+(H-pad)+'" stroke="#e0e5f0"/>';
    (series||[]).forEach(function(se){ if(!se.vals||!se.vals.length)return; var p=se.vals.map(function(v,i){return (pad+(i/Math.max(1,nx-1))*(W-2*pad))+","+(H-pad-(v/(maxV||1))*(H-1.5*pad));}).join(" ");
      s+='<polyline points="'+p+'" fill="none" stroke="'+se.col+'" stroke-width="'+(se.w||1.8)+'"/>'; });
    if(o.xlabel) s+='<text x="'+(W/2)+'" y="'+(H-4)+'" text-anchor="middle" font-size="9" fill="#8a8ea6">'+esc(o.xlabel)+'</text>';
    return s+'</svg>';
  }
  function barRow(label, aVal, bVal, fmt){ var mx=Math.max(Math.abs(aVal),Math.abs(bVal),1); fmt=fmt||function(v){return v;};
    return '<div class="viz-brow"><div class="viz-blab">'+esc(label)+'</div>'
      +'<div class="viz-bpair"><div class="viz-bar"><i style="width:'+(Math.abs(aVal)/mx*100).toFixed(0)+'%;background:'+C1+'"></i><span>'+fmt(aVal)+'</span></div>'
      +'<div class="viz-bar"><i style="width:'+(Math.abs(bVal)/mx*100).toFixed(0)+'%;background:'+C2+'"></i><span>'+fmt(bVal)+'</span></div></div></div>';
  }

  /* ---- analytics dashboard (per market) ---- */
  function bwRatio(m){ var h=m.history||[]; if(h.length<3)return 0; var fo=h.map(function(x){return x.ordM||0;});
    var hasDem=h.some(function(x){return x.dem1!=null;});
    var cd=h.map(function(x){return hasDem?(x.dem1||0):(x.total||0);});   // compare to same-chain demand when available
    var vd=variance(cd)||1; return variance(fo)/vd; }
  function analyticsHTML(m){
    var h=m.history||[], nx=h.length, sc=m.scores||{chainProfit:[0,0],serviceLevel:0,ranked:[]};
    if(nx<1) return '<div class="viz-card"><div class="viz-h">Analytics</div><div class="viz-sub">No data yet — start the game and advance a few weeks.</div></div>';
    var mx=1; h.forEach(function(x){ mx=Math.max(mx, x.total||0, x.ordR||0, x.ordW||0, x.ordD||0, x.ordM||0); });
    var svc=h.map(function(x){ var d=(x.served||0)+(x.lost||0); return d>0?Math.round((x.served||0)/d*100):100; });
    var hasSvc=h.some(function(x){return x.served!=null;});
    var amp='<div class="viz-card"><div class="viz-h">Order amplification <span class="viz-leg"><b style="color:'+NAVY+'">demand</b> · <b style="color:'+RED+'">R</b> · <b style="color:'+GREEN+'">W</b> · <b style="color:'+AMBER+'">D</b> · <b style="color:'+PURPLE+'">M</b></span></div>'
      +lineChart([{vals:h.map(function(x){return x.total||0;}),col:NAVY,w:2.4},{vals:h.map(function(x){return x.ordR||0;}),col:RED},{vals:h.map(function(x){return x.ordW||0;}),col:GREEN},{vals:h.map(function(x){return x.ordD||0;}),col:AMBER},{vals:h.map(function(x){return x.ordM||0;}),col:PURPLE}],mx,nx,{H:190,xlabel:"Week →  (orders amplify upstream = bullwhip)"})+'</div>';
    var kpi='<div class="viz-kpis">'
      +kpiTile(sc.serviceLevel+'%','Service level')
      +kpiTile(money(sc.chainProfit[0]),'Chain 1',C1)
      +kpiTile(money(sc.chainProfit[1]),'Chain 2',C2)
      +kpiTile(bwRatio(m).toFixed(1)+'×','Bullwhip ratio',RED)+'</div>';
    var svcCard = hasSvc ? '<div class="viz-card"><div class="viz-h">Service level (fill rate %)</div>'+lineChart([{vals:svc,col:GREEN,w:2.4}],100,nx,{H:150})+'</div>' : '';
    return '<div class="viz-anl">'+kpi+amp+svcCard+'</div>';
  }
  function kpiTile(v,k,col){ return '<div class="viz-kpi"><div class="viz-kv"'+(col?' style="color:'+col+'"':'')+'>'+esc(v)+'</div><div class="viz-kk">'+esc(k)+'</div></div>'; }

  /* ---- compare across markets ---- */
  function marketAgg(m){ var sc=m.scores||{chainProfit:[0,0],serviceLevel:0}; var lost=(m.history||[]).reduce(function(a,x){return a+(x.lost||0);},0);
    return { id:m.marketId, c1:sc.chainProfit[0]||0, c2:sc.chainProfit[1]||0, total:(sc.chainProfit[0]||0)+(sc.chainProfit[1]||0), svc:sc.serviceLevel||0, lost:Math.round(lost), bw:bwRatio(m), lead:((sc.chainProfit[0]||0)>=(sc.chainProfit[1]||0)?1:2) }; }
  function compareHTML(markets, order){
    var rows=(order||Object.keys(markets)).map(function(id){return marketAgg(markets[id]);});
    if(!rows.length) return '';
    var t='<div class="viz-card"><div class="viz-h">Markets side by side <span class="viz-leg">higher profit &amp; service better; lower lost sales &amp; bullwhip better</span></div>'
      +'<table class="viz-tbl"><thead><tr><th>Market</th><th>Total profit</th><th>Chain 1</th><th>Chain 2</th><th>Service</th><th>Lost</th><th>Bullwhip</th><th>Leader</th></tr></thead><tbody>';
    rows.forEach(function(r){ t+='<tr><td><b>'+esc(r.id)+'</b></td><td>'+money(r.total)+'</td><td style="color:'+C1+'">'+money(r.c1)+'</td><td style="color:'+C2+'">'+money(r.c2)+'</td><td>'+r.svc+'%</td><td>'+r.lost.toLocaleString()+'</td><td>'+r.bw.toFixed(1)+'×</td><td>Chain '+r.lead+'</td></tr>'; });
    t+='</tbody></table></div>';
    var a1=rows.reduce(function(a,r){return a+r.c1;},0), a2=rows.reduce(function(a,r){return a+r.c2;},0);
    var led1=rows.filter(function(r){return r.lead===1;}).length, led2=rows.filter(function(r){return r.lead===2;}).length;
    var agg='<div class="viz-card"><div class="viz-h">Chain 1 vs Chain 2 <span class="viz-leg">aggregate across all markets · <b style="color:'+C1+'">blue = C1</b> · <b style="color:'+C2+'">red = C2</b></span></div>'
      +barRow('Total profit',a1,a2,money)
      +barRow('Markets led',led1,led2,function(v){return v;})
      +'</div>';
    return t+agg;
  }

  /* ---- winners / leaderboard across markets ---- */
  function allPlayers(markets, order){ var out=[]; (order||Object.keys(markets)).forEach(function(id){ var m=markets[id]; ((m.scores&&m.scores.ranked)||[]).forEach(function(p){ out.push({id:p.id,chain:p.chain,bot:p.bot,name:p.name,profit:p.profit,inv:p.inv,market:id}); }); }); out.sort(function(a,b){return b.profit-a.profit;}); return out; }
  function winnersHTML(markets, order, opts){
    opts=opts||{}; var ord=order||Object.keys(markets); var players=allPlayers(markets,ord);
    if(!players.length) return '<div class="viz-card"><div class="viz-h">Winners</div><div class="viz-sub">No results yet.</div></div>';
    var best=players[0];
    // best chain overall
    var c1=0,c2=0,perMkt=[]; ord.forEach(function(id){ var a=marketAgg(markets[id]); c1+=a.c1; c2+=a.c2; perMkt.push(a); });
    var bestMkt=perMkt.slice().sort(function(a,b){return b.total-a.total;})[0];
    var banner='<div class="viz-winbanner"><div class="viz-wtitle">🏆 Standings</div>'
      +'<div class="viz-wline">Best player: <b>'+esc(best.id)+'</b>'+(best.bot?' <span class="viz-tag">bot</span>':' ('+esc(best.name||"")+')')+' — '+money(best.profit)+'</div>'
      +'<div class="viz-wline">Best chain: <b>Chain '+(c1>=c2?1:2)+'</b> ('+money(Math.max(c1,c2))+') · Best market: <b>'+esc(bestMkt.id)+'</b> ('+money(bestMkt.total)+')</div></div>';
    var rows=players.slice(0,opts.limit||40).map(function(p,i){
      var col=(p.chain===0)?C1:C2;   // scores.ranked uses 0-based chain (0 = Chain 1)
      return '<tr'+(i===0?' class="viz-rank1"':'')+'><td>'+(i+1)+'</td><td>'+esc(p.market)+'</td><td style="color:'+col+';font-weight:800">'+esc(p.id)+'</td><td>'+(p.bot?'<span class="viz-tag">bot</span>':esc(p.name||"—"))+'</td><td>'+money(p.profit)+'</td><td>'+Math.round(p.inv||0)+'</td></tr>';
    }).join("");
    return '<div class="viz-card">'+banner+'<div class="viz-h" style="margin-top:14px;">All players ranked</div>'
      +'<table class="viz-tbl"><thead><tr><th>#</th><th>Market</th><th>Role</th><th>Player</th><th>Profit</th><th>Inv</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
  }

  /* ---- projector "big screen" (dark, large) ---- */
  function fmtLeft(sec){ sec=Math.max(0,Math.round(sec)); var mn=Math.floor(sec/60), s=sec%60; return mn+":"+(s<10?"0":"")+s; }
  function marketPanel(m){
    var sc=m.scores||{chainProfit:[0,0],serviceLevel:0,ranked:[]};
    var ordOn=(METRIC==='orders'&&marketHasOrders(m));
    var h=m.history||[], mx=1; h.forEach(function(x){ mx=Math.max(mx,x.total||0,x.ordR||0,x.ordM||0); });
    var amp=lineChart([{vals:h.map(function(x){return x.total||0;}),col:"#cfe0ff",w:2.6},{vals:h.map(function(x){return x.ordR||0;}),col:"#ff8a9c",w:1.8},{vals:h.map(function(x){return x.ordM||0;}),col:"#c9b6ff",w:2.2}],mx,h.length,{W:600,H:120});
    var lead=((sc.ranked)||[]).slice(0,6).map(function(p,i){ var col=(p.chain===0)?"#7fb0e6":"#f28f8a";
      return '<div class="bs-lbrow'+(i===0?' top':'')+'"><span class="bs-rk">'+(i+1)+'</span><span class="bs-rl" style="color:'+col+'">'+esc(p.id)+'</span><span class="bs-nm">'+(p.bot?'bot':esc((p.name||"").split(" ")[0]||"-"))+'</span><span class="bs-pf">'+money(p.profit)+'</span></div>'; }).join("")||'<div class="bs-mut" style="padding:8px;">No players yet.</div>';
    return '<div class="bs-mkt">'
      +'<div class="bs-mkth"><span class="bs-mklabel">Market '+esc(m.marketId)+'</span>'
        +'<span class="bs-mkwk">wk '+m.week+'/'+m.rounds+'</span>'
        +'<span class="bs-phase '+m.phase+'">'+esc(m.phase)+'</span>'
        +'<span class="bs-mtimer" data-deadline="'+(m.deadline==null?'null':m.deadline)+'" data-phase="'+esc(m.phase)+'"></span>'
      +'</div>'
      +'<div class="bs-mkkpis">'
        +'<div class="bs-kpi big"><div class="bs-kv">'+(m.weekTotal||0)+'</div><div class="bs-kk">Demand</div></div>'
        +'<div class="bs-kpi"><div class="bs-kv">'+sc.serviceLevel+'%</div><div class="bs-kk">Service</div></div>'
        +'<div class="bs-kpi"><div class="bs-kv" style="color:#3f7fbf">'+moneyK(sc.chainProfit[0])+'</div><div class="bs-kk">Chain 1</div></div>'
        +'<div class="bs-kpi"><div class="bs-kv" style="color:#d0605c">'+moneyK(sc.chainProfit[1])+'</div><div class="bs-kk">Chain 2</div></div>'
        +'<div class="bs-kpi"><div class="bs-kv" style="color:#d0605c">'+bwRatio(m).toFixed(1)+'x</div><div class="bs-kk">Bullwhip</div></div>'
      +'</div>'
      +'<div class="bs-mkmap">'+boardSVG(m,{big:true})+'</div>'
      +'<div class="bs-mkamp"><div class="bs-cardh">Order amplification'+(ordOn?' <span class="bs-mut">(map bars show orders)</span>':'')+'</div>'+amp+'</div>'
      +'<div class="bs-mkamp"><div class="bs-cardh">Leaderboard</div><div class="bs-lb">'+lead+'</div></div>'
    +'</div>';
  }
  function bigScreenHTML(markets, order){
    var ord=(order||Object.keys(markets)).filter(function(id){return markets[id];});
    ord.forEach(function(id){ record(markets[id]); });
    var n=ord.length;
    var header='<div class="bs-top2"><div class="bs-brand"><span class="bs-logo"></span> SCOPE <span class="bs-sub">live board</span></div>'
      +'<div class="bs-tgs"><span class="bs-mut" style="color:#aab3e0;">Map bars:</span><span class="bs-seg"><button class="bs-tg'+(METRIC==='stock'?' on':'')+'" data-metric="stock">Stock</button><button class="bs-tg'+(METRIC==='orders'?' on':'')+'" data-metric="orders">Orders</button></span></div></div>';
    if(!n) return '<div class="bs-wrap2">'+header+'<div class="bs-mkt" style="text-align:center;padding:60px;">Start a game to light up the big screen.</div></div>';
    var maxPanel=(n===1?780:n===2?720:620), gridMax=Math.min(1860, n*maxPanel+(n-1)*18);
    var panels=ord.map(function(id){ return marketPanel(markets[id]); }).join("");
    return '<div class="bs-wrap2">'+header+'<div class="bs-grid" style="grid-template-columns:repeat('+n+',minmax(0,1fr));max-width:'+gridMax+'px;">'+panels+'</div></div>';
  }

  /* ---- CSS (injected once) ---- */
  function injectCSS(){
    if(document.getElementById("viz-css")) return;
    var css=
    ".viz-card{background:#fff;border:1px solid #e8ecf3;border-radius:16px;padding:16px;margin-bottom:14px;}"
    +".viz-h{font-size:14px;font-weight:800;color:"+NAVY+";margin-bottom:10px;display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap;}"
    +".viz-leg{font-size:11px;font-weight:600;color:#8a8ea6;}"
    +".viz-sub{font-size:12.5px;color:#5a6178;}"
    +".viz-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px;}"
    +".viz-kpi{background:#f6f8fd;border:1px solid #e8ecf3;border-radius:12px;padding:12px;text-align:center;}"
    +".viz-kv{font-size:22px;font-weight:800;color:"+NAVY+";}.viz-kk{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#8a8ea6;font-weight:700;margin-top:2px;}"
    +".viz-tbl{width:100%;border-collapse:collapse;font-size:13px;}"
    +".viz-tbl th,.viz-tbl td{padding:8px 8px;text-align:right;border-bottom:1px solid #eef1f7;white-space:nowrap;}"
    +".viz-tbl th:first-child,.viz-tbl td:first-child,.viz-tbl th:nth-child(2),.viz-tbl td:nth-child(2){text-align:left;}"
    +".viz-tbl th{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#8a8ea6;}"
    +".viz-tbl tr.viz-rank1 td{background:#fff5f7;font-weight:800;}"
    +".viz-tag{background:#eef1f8;color:#7a8199;border-radius:20px;padding:2px 8px;font-size:10px;font-weight:700;}"
    +".viz-brow{display:grid;grid-template-columns:120px 1fr;gap:12px;align-items:center;margin:9px 0;}"
    +".viz-blab{font-size:12.5px;font-weight:700;color:"+NAVY+";}"
    +".viz-bpair{display:grid;gap:5px;}"
    +".viz-bar{position:relative;background:#f1f4fa;border-radius:7px;height:22px;overflow:hidden;}"
    +".viz-bar i{position:absolute;left:0;top:0;bottom:0;border-radius:7px;display:block;}"
    +".viz-bar span{position:absolute;right:8px;top:0;line-height:22px;font-size:12px;font-weight:800;color:"+NAVY+";}"
    +".viz-winbanner{background:linear-gradient(135deg,"+NAVY+",#33338a);color:#fff;border-radius:14px;padding:16px 18px;}"
    +".viz-wtitle{font-size:13px;font-weight:800;letter-spacing:.02em;opacity:.85;}"
    +".viz-wline{font-size:15px;font-weight:600;margin-top:5px;}.viz-wline b{font-weight:800;}"
    /* big screen */
    +".bs-open{overflow:hidden;}"
    +"#viz-bigscreen{position:fixed;inset:0;z-index:9999;background:radial-gradient(1200px 600px at 80% -10%,#12127e 0%,#00042e 55%,#00021c 100%);color:#fff;overflow:auto;display:none;}"
    +"#viz-bigscreen.show{display:block;}"
    +".bs-wrap{max-width:1680px;margin:0 auto;padding:22px 26px 30px;font-family:Montserrat,system-ui,sans-serif;}"
    +".bs-top{display:flex;align-items:center;gap:18px;flex-wrap:wrap;margin-bottom:16px;padding-right:104px;}"
    +".bs-brand{font-size:30px;font-weight:800;letter-spacing:-.01em;display:flex;align-items:center;gap:10px;}"
    +".bs-logo{width:22px;height:22px;border-radius:5px;background:"+RED+";box-shadow:0 0 0 5px rgba(230,0,40,.22);}"
    +".bs-brand .bs-sub{font-size:14px;font-weight:600;color:#aab3e0;text-transform:uppercase;letter-spacing:.16em;}"
    +".bs-chips{display:flex;gap:8px;flex-wrap:wrap;}"
    +".bs-chip{cursor:pointer;font-size:14px;font-weight:700;padding:7px 15px;border-radius:100px;background:rgba(255,255,255,.09);color:#c9cff0;border:1px solid rgba(255,255,255,.14);}"
    +".bs-chip.on{background:#fff;color:"+NAVY+";}"
    +".bs-tgs{display:flex;gap:8px;align-items:center;}"
    +".bs-seg{display:inline-flex;background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.16);border-radius:100px;padding:3px;}"
    +".bs-tg{cursor:pointer;font-size:13px;font-weight:700;padding:6px 13px;border-radius:100px;background:transparent;color:#c9cff0;border:0;font-family:inherit;}"
    +".bs-seg .bs-tg.on{background:#fff;color:"+NAVY+";}"
    +".bs-tg.cyc{background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.16);color:#c9cff0;}"
    +".bs-tg.cyc.on{background:"+C1+";border-color:"+C1+";color:#fff;}"
    +".bs-week{margin-left:auto;font-size:20px;font-weight:700;color:#e7ebff;}.bs-week b{font-size:26px;}"
    +".bs-phase{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;padding:4px 10px;border-radius:100px;margin-left:8px;vertical-align:middle;}"
    +".bs-phase.order{background:#fff3cd;color:#8a5a00;}.bs-phase.ship{background:#d1e7ff;color:#0b4f9e;}.bs-phase.ended{background:#e8e8ef;color:#333;}.bs-phase.lobby{background:#e6f6ee;color:"+GREEN+";}"
    +".bs-main{display:grid;grid-template-columns:1.55fr 1fr;gap:18px;align-items:start;}"
    +"@media(max-width:1080px){.bs-main{grid-template-columns:1fr;}}"
    +".bs-mapcard,.bs-side>div,.bs-amp{background:rgba(255,255,255,.97);border-radius:18px;padding:14px 16px;box-shadow:0 30px 60px -30px rgba(0,0,30,.7);}"
    +".bs-cardh{font-size:14px;font-weight:800;color:"+NAVY+";margin-bottom:8px;}"
    +".bs-mut{font-size:11.5px;font-weight:600;color:#8a8ea6;}"
    +".bs-side{display:grid;gap:14px;}"
    +".bs-kpis{display:grid;grid-template-columns:1fr 1fr;gap:10px;background:transparent!important;box-shadow:none!important;padding:0!important;}"
    +".bs-kpi{background:rgba(255,255,255,.97);border-radius:14px;padding:14px;text-align:center;box-shadow:0 30px 60px -30px rgba(0,0,30,.7);}"
    +".bs-kv{font-size:30px;font-weight:800;color:"+NAVY+";font-variant-numeric:tabular-nums;}.bs-kk{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#8a8ea6;font-weight:700;}"
    +".bs-lbh{font-size:13px;font-weight:800;color:"+NAVY+";margin-bottom:2px;}"
    +".bs-lb{display:grid;gap:6px;}"
    +".bs-lbrow{display:grid;grid-template-columns:26px 54px 1fr auto;align-items:center;gap:8px;font-size:15px;padding:6px 8px;border-radius:10px;background:#f6f8fd;}"
    +".bs-lbrow.top{background:#fff5e6;}"
    +".bs-rk{font-weight:800;color:#8a8ea6;}.bs-rl{font-weight:800;}.bs-nm{color:#333;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}"
    +".bs-mk{color:#9aa3b5;font-weight:700;font-size:11px;margin-left:6px;}"
    +".bs-pf{font-weight:800;color:"+NAVY+";font-variant-numeric:tabular-nums;}"
    +".bs-amp{margin-top:18px;}"
    +".bs-closebtn{position:fixed;top:16px;right:18px;z-index:3;cursor:pointer;font-size:14px;font-weight:700;padding:8px 15px;border-radius:100px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.24);color:#fff;font-family:inherit;}"
    +".bs-wrap2{max-width:1900px;margin:0 auto;padding:16px 22px 26px;font-family:Montserrat,system-ui,sans-serif;}"
    +".bs-top2{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:14px;padding-right:110px;}"
    +".bs-grid{display:grid;gap:18px;margin:0 auto;align-items:start;}"
    +"@media(max-width:900px){.bs-grid{grid-template-columns:1fr!important;max-width:640px!important;}}"
    +".bs-mkt{background:rgba(255,255,255,.97);border-radius:18px;padding:14px 15px 16px;box-shadow:0 30px 60px -30px rgba(0,0,30,.7);display:flex;flex-direction:column;gap:11px;min-width:0;}"
    +".bs-mkth{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}"
    +".bs-mklabel{font-size:18px;font-weight:800;color:"+NAVY+";white-space:nowrap;}"
    +".bs-mkwk{font-size:12px;font-weight:700;color:#8a8ea6;white-space:nowrap;}"
    +".bs-mtimer{margin-left:auto;font-size:16px;font-weight:800;color:"+NAVY+";font-variant-numeric:tabular-nums;}"
    +".bs-mtimer.low{color:"+RED+";}.bs-mtimer.nolimit{color:#9aa3b5;font-size:12.5px;font-weight:700;}"
    +".bs-mkkpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;}"
    +".bs-mkkpis .bs-kpi{background:#f6f8fd;border-radius:11px;padding:7px 3px;text-align:center;box-shadow:none;min-width:0;}"
    +".bs-mkkpis .bs-kpi.big{background:#eaf1ff;}"
    +".bs-mkkpis .bs-kv{font-size:16px;font-weight:800;color:"+NAVY+";white-space:nowrap;}.bs-mkkpis .bs-kpi.big .bs-kv{font-size:21px;}"
    +".bs-mkkpis .bs-kk{font-size:8px;text-transform:uppercase;letter-spacing:.02em;color:#8a8ea6;font-weight:700;margin-top:2px;line-height:1.15;}"
    +".bs-mkamp .bs-cardh{font-size:12.5px;margin-bottom:3px;}.bs-mkamp .bs-lb{gap:5px;}"
    +".viz-anl{display:block;}";
    var st=document.createElement("style"); st.id="viz-css"; st.textContent=css; document.head.appendChild(st);
  }

  /* ---- big-screen controller (overlay lifecycle) ---- */
  var BS={ el:null, get:null, clock:null };
  function bsClock(){ if(!BS.el||!BS.el.classList.contains("show")) return;
    Array.prototype.forEach.call(BS.el.querySelectorAll(".bs-mtimer"),function(el){
      var ph=el.getAttribute("data-phase"), dl=el.getAttribute("data-deadline");
      if(ph!=="order"&&ph!=="ship"){ el.textContent=""; el.className="bs-mtimer"; return; }
      if(dl==null||dl==="null"||dl===""){ el.textContent="⏱ no limit"; el.className="bs-mtimer nolimit"; return; }
      var left=Math.round((+dl-Date.now())/1000);
      el.textContent="⏱ "+(left<=0?"0:00":fmtLeft(left)); el.className="bs-mtimer"+(left<=15?" low":"");
    });
  }
  function ensureOverlay(){ if(BS.el) return BS.el; injectCSS(); var d=document.createElement("div"); d.id="viz-bigscreen"; document.body.appendChild(d); BS.el=d;
    d.addEventListener("click",function(e){ var cl=function(s){ return e.target.closest&&e.target.closest(s); };
      var mt=cl("[data-metric]"); if(mt){ METRIC=mt.getAttribute("data-metric"); paintBS(); return; }
      var x=cl("[data-bs-close]"); if(x){ closeBS(); } });
    document.addEventListener("keydown",function(e){ if(e.key==="Escape"&&BS.el&&BS.el.classList.contains("show")) closeBS(); });
    return d;
  }
  function paintBS(){ if(!BS.el||!BS.get) return; var d=BS.get()||{}, markets=d.markets||{}, order=d.order||[];
    BS.el.innerHTML='<button data-bs-close class="bs-closebtn">Close &times;</button>'+bigScreenHTML(markets,order);
    bsClock();
  }
  function openBS(getState){ ensureOverlay(); BS.get=getState;
    document.body.classList.add("bs-open"); BS.el.classList.add("show"); paintBS();
    if(BS.clock)clearInterval(BS.clock); BS.clock=setInterval(bsClock,1000); }
  function refreshBS(){ if(BS.el&&BS.el.classList.contains("show")) paintBS(); }
  function closeBS(){ if(BS.clock){clearInterval(BS.clock);BS.clock=null;} if(BS.el)BS.el.classList.remove("show"); document.body.classList.remove("bs-open"); }
  function bsOpen(){ return !!(BS.el&&BS.el.classList.contains("show")); }

  root.VIZ={ record:record, boardSVG:boardSVG, analyticsHTML:analyticsHTML, compareHTML:compareHTML, winnersHTML:winnersHTML, bigScreenHTML:bigScreenHTML, injectCSS:injectCSS, openBigScreen:openBS, refreshBigScreen:refreshBS, closeBigScreen:closeBS, bigScreenOpen:bsOpen,
    setMetric:function(mm){ METRIC=mm; if(BS.el&&BS.el.classList.contains("show"))paintBS(); }, getMetric:function(){ return METRIC; }, hasOrders:marketHasOrders,
    esc:esc, money:money, colors:{C1:C1,C2:C2,NAVY:NAVY,RED:RED} };
})(window);
