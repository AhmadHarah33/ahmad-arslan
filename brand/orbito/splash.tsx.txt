// Cold-start splash: the Orbito mark centred on the canvas for about two and a half seconds,
// then a soft fade into the app. Pure CSS + one inline script (no client JS
// bundle), so it paints with the very first HTML.
//
// - Plays once per browser session and never on /print or /api pages (those
//   are rendered to PDF server-side and must not contain it).
// - Always the light version (Paper background, ink ring), in either app theme.
// - It overlays the real page load; it is removed at max(load, ~2.5s), so it
//   never makes a fast load slower and never hides a slow one.
// - The element is never removed from the DOM (React hydrates it); the script
//   only flips data-state: "" -> "out" -> "gone".
// - ?splash=draw|orbit|breathe forces it to play with that motion, for design
//   review. Default motion is DEFAULT_MOTION.

export const DEFAULT_MOTION = "draw";

const script = `(function(){try{
var d=document.getElementById('splash');if(!d)return;
var q=new URLSearchParams(location.search).get('splash');
var P=location.pathname,skip=P.indexOf('/print/')===0||P.indexOf('/api/')===0;
var seen=false;try{seen=sessionStorage.getItem('splashed')==='1';}catch(e){}
if(skip||(seen&&!q)){d.setAttribute('data-state','gone');return;}
if(q==='draw'||q==='orbit'||q==='breathe')d.setAttribute('data-motion',q);
try{sessionStorage.setItem('splashed','1');}catch(e){}
var MIN=2500,done=false;
function out(){if(done)return;done=true;d.setAttribute('data-state','out');setTimeout(function(){d.setAttribute('data-state','gone');},650);}
function ready(){var t=Math.max(0,MIN-performance.now());setTimeout(out,t);}
if(document.readyState==='complete')ready();else window.addEventListener('load',ready);
setTimeout(out,6000);
}catch(e){var s=document.getElementById('splash');if(s)s.setAttribute('data-state','gone');}})();`;

export function Splash() {
  return (
    <>
      <div id="splash" data-motion={DEFAULT_MOTION} aria-hidden="true" suppressHydrationWarning>
        <svg className="sp-mark" viewBox="0 0 100 100" width="112" height="112">
          <circle className="sp-track" cx="50" cy="50" r="36" fill="none" strokeWidth="19" />
          <path
            className="sp-arc"
            d="M50 14 A36 36 0 1 1 18.82 32"
            fill="none"
            strokeWidth="19"
            strokeLinecap="round"
          />
          <g className="sp-moon">
            <circle cx="50" cy="14" r="12" />
          </g>
        </svg>
      </div>
      <script dangerouslySetInnerHTML={{ __html: script }} />
    </>
  );
}
