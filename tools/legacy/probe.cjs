const fs = require('fs');
const { SRC, BUILD } = require('../_paths.cjs');
const src = SRC;
let s = fs.readFileSync(src, 'utf8');

/* headless throttles rAF, so the layout tween freezes mid-flight; drive it with timers */
const shim = '<scr' + 'ipt>\n(function(){\n' +
  '  window.requestAnimationFrame = function(cb){\n' +
  '    return setTimeout(function(){ cb(performance.now()); }, 16);\n' +
  '  };\n})();\n</scr' + 'ipt>\n';
s = s.replace('<scr' + 'ipt>', shim + '<scr' + 'ipt>');

const js = [
  'setTimeout(function(){',
  '  var st=document.createElement("div"); st.id="probeStatus";',
  '  st.style.cssText="position:fixed;left:50%;top:8px;transform:translateX(-50%);z-index:99999;"',
  '    +"padding:8px 14px;border-radius:8px;font:12px monospace;"',
  '    +"background:#111;color:#0f0;border:1px solid #0f0";',
  '  function say(t,ok){ st.textContent=t; st.style.color=ok?"#0f0":"#f66";',
  '    st.style.borderColor=ok?"#0f0":"#f66";',
  '    st.style.background=ok?"#0a1a0a":"#1a0a0a";',
  '    document.body.appendChild(st); }',
  '  function tab(m){ var b=document.querySelector("#tabs button[data-mode="+m+"]");',
  '    if(!b) throw new Error("no tab "+m); b.click(); }',
  '  try{',
  '    var h=(location.hash||"").replace("#","");',
  '    if(h==="emo"){',
  '      document.querySelector("#lensTabs button[data-lens=emotion]").click();',
  '      say("OK emo lens");',
  '    } else if(h==="focus"){',
  '      var cv=document.querySelector("canvas");',
  '      cv.setPointerCapture=function(){}; cv.releasePointerCapture=function(){};',
  '      var X=355, Y=271, opt={bubbles:true,cancelable:true,pointerId:1,pointerType:"mouse",isPrimary:true,clientX:X,clientY:Y,button:0,buttons:1};',
  '      cv.dispatchEvent(new PointerEvent("pointerdown",opt));',
  '      cv.dispatchEvent(new PointerEvent("pointerup",Object.assign({},opt,{buttons:0})));',
  '      say("focus dispatched @"+X+","+Y);',
  '    } else if(h==="gen"){',
  '      tab("gen"); say("OK gen");',
  '    } else if(h==="zone"){',
  '      tab("zone"); say("OK zone");',
  '    } else if(h==="quotes"){',
  '      document.getElementById("btnQuotes").click(); say("OK quotes");',
  '    } else if(h==="emofocus"){',
  '      document.querySelector("#lensTabs button[data-lens=emotion]").click();',
  '      tab("gen"); say("OK emo + gen");',
  '    } else { say("OK (no hash)"); }',
  '  }catch(e){ say("PROBE-ERR "+e.message,false); }',
  '},900);'
].join('\n');
const inject = '<scr' + 'ipt>\n' + js + '\n</scr' + 'ipt>';
s = s.replace('</body>', inject + '\n</body>');
fs.writeFileSync(BUILD + '/probe.html', s);
console.log('probe written bytes=' + s.length);
