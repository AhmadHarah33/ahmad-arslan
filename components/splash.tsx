// Cold-start splash: indigo screen, the Mars Technical mark builds up (planet,
// rings sweeping round it, the two moons settling in) and the wordmark fades in,
// then the screen fades into the app. Pure CSS (see the end of globals.css) plus
// one inline script, so it paints with the very first HTML.
//
// - Plays once per browser session and never on /print or /api pages (those
//   are rendered to PDF server-side and must not contain it).
// - It overlays the real page load; it is removed once the page has loaded AND
//   the animation has finished (+0.45s hold, measured from the animation's own
//   end, so a fast load can't cut it short). A slow load keeps it up longer.
// - The element is never removed from the DOM (React hydrates it); the script
//   only flips data-state: "" -> "out" -> "gone".
// - ?splash=1 forces it to play again, for design review.
//
// The Orbito splash this replaced is archived in brand/orbito.

const script = `(function(){try{
var d=document.getElementById('splash');if(!d)return;
var q=new URLSearchParams(location.search).get('splash');
var P=location.pathname,skip=P.indexOf('/print/')===0||P.indexOf('/api/')===0;
var seen=false;try{seen=sessionStorage.getItem('splashed')==='1';}catch(e){}
if(skip||(seen&&!q)){d.setAttribute('data-state','gone');return;}
try{sessionStorage.setItem('splashed','1');}catch(e){}
var loaded=false,played=false,done=false;
function out(){if(done)return;done=true;d.setAttribute('data-state','out');setTimeout(function(){d.setAttribute('data-state','gone');},650);}
function check(){if(loaded&&played)out();}
// "played" = the last animation (the second moon) has finished, plus a short hold,
// counted from when the splash itself started animating, not from navigation start.
var last=d.querySelector('.sp-moon2');
function hold(){setTimeout(function(){played=true;check();},450);}
if(last)last.addEventListener('animationend',hold);
setTimeout(function(){if(!played){played=true;check();}},3600); // no animation events (reduced motion)
function ready(){loaded=true;check();}
if(document.readyState==='complete')ready();else window.addEventListener('load',ready);
setTimeout(out,8000);
}catch(e){var s=document.getElementById('splash');if(s)s.setAttribute('data-state','gone');}})();`;

const W = "#FFFFFF";
const INDIGO = "#323490";
const LIME = "#BED631";

export function Splash() {
  return (
    <>
      <div id="splash" aria-hidden="true" suppressHydrationWarning>
        <svg className="sp-mark" viewBox="0 0 100 100" width="132" height="132">
          {/* rings (pathLength=100 so one dash value draws any of them) */}
          <ellipse className="sp-ring" pathLength="100" cx="50" cy="50" rx="43" ry="13.5" transform="rotate(-25 50 50)" fill="none" stroke={W} strokeWidth="3" />
          <ellipse className="sp-ring sp-inner" pathLength="100" cx="50" cy="50" rx="29" ry="9" transform="rotate(-25 50 50)" fill="none" stroke={W} strokeWidth="3.5" />
          <g className="sp-planet">
            <circle cx="50" cy="50" r="19" fill={INDIGO} />
            <circle cx="50" cy="50" r="15" fill={W} />
          </g>
          <g transform="rotate(-25 50 50)">
            <path className="sp-front" d="M7 50 A43 13.5 0 0 0 93 50" fill="none" stroke={W} strokeWidth="3" />
            <path className="sp-front sp-inner" d="M21 50 A29 9 0 0 0 79 50" fill="none" stroke={W} strokeWidth="3.5" />
          </g>
          <g className="sp-moon sp-moon1">
            <circle cx="76" cy="41.27" r="10" fill={INDIGO} />
            <circle cx="76" cy="41.27" r="6.8" fill={LIME} />
          </g>
          <g className="sp-moon sp-moon2">
            <circle cx="11.43" cy="62.89" r="7" fill={INDIGO} />
            <circle cx="11.43" cy="62.89" r="4.2" fill={W} />
          </g>
        </svg>
        <div className="sp-word">
          <span style={{ fontFamily: "var(--font-slab), serif", fontWeight: 700, fontSize: 30, letterSpacing: "0.1em", lineHeight: 0.95, color: W }}>
            MARS
          </span>
          <span style={{ fontFamily: "var(--font-manrope), sans-serif", fontWeight: 800, fontSize: 12, letterSpacing: "0.44em", marginTop: 6, color: LIME }}>
            TECHNICAL
          </span>
        </div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: script }} />
    </>
  );
}
