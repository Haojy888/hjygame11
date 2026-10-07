import { FISH, fishLengthCm } from './FishTable.js';
import { UPGRADES, nextLevel, FUEL_PRICE } from './Gear.js';
import { FishPortrait } from './FishPortrait.js';
import { ORDERS, CHAPTERS, GROUNDS, matchesOrder } from './Orders.js';
import { STORY_TITLE, storyObjective, storyDialogue, storyJournal } from './Story.js';
import { BOATS } from './Boats.js';

// DOM for the fishing game, in the look of the rest of the HUD (ui/ui.css tokens, .tw-glass):
//   top right     purse and cooler / hold load
//   bottom centre the fight: line tension with its safe band, the fish's stamina, line out
//   centre        "!" when a fish takes the bait
//   panels        inventory (I / Tab) and the fish stand's offer
//   catch card    full screen: the world dims and blurs, the fish lies side-on in its own studio light
//                 (FishPortrait) with the species above and length, weight, value, record below
const CSS = /* css */`
.gm-purse { position: absolute; top: var(--tw-edge); right: var(--tw-edge); display: flex; gap: var(--tw-3); align-items: center;
	padding: var(--tw-2) var(--tw-4); border-radius: 999px; font: 500 var(--tw-fs-lg) var(--tw-font); color: var(--tw-ink); pointer-events: none;
	transition: transform var(--tw-med) var(--tw-ease), right var(--tw-slow) var(--tw-ease); }
.tw-root[data-panel='open'] .gm-purse { right: calc(var(--tw-panel-w) + 2 * var(--tw-3)); }
.tw-root.is-photo .gm-panel { display: none; }
.gm-purse.is-bump { animation: gm-bump 420ms var(--tw-ease); }
@keyframes gm-bump { 30% { transform: scale(1.08); } }
.gm-order { width: calc(228 * var(--tw-u)); max-width: calc(100vw - 2 * var(--tw-edge)); padding: var(--tw-2) var(--tw-3);
	border-radius: var(--tw-r-md); font: 500 var(--tw-fs-sm) var(--tw-font); line-height: 1.4; pointer-events: none; }
.gm-order-head, .gm-order-line { display: flex; align-items: baseline; justify-content: space-between; gap: var(--tw-2); }
.gm-order-head { color: var(--tw-ink-3); font-size: var(--tw-fs-xs); }
.gm-order-head b, .gm-order-line b { flex: none; color: var(--tw-sun); font-family: var(--tw-mono); font-weight: 600; }
.gm-order-line { margin-top: var(--tw-1); color: var(--tw-ink); font-weight: 600; }
.gm-order-line span { min-width: 0; }
.gm-order-hint, .gm-order-status { margin-top: 2px; color: var(--tw-ink-3); font-size: var(--tw-fs-xs); overflow-wrap: anywhere; }
.gm-order-status.is-ready { color: var(--tw-aqua); }
.gm-story-track { margin-top: var(--tw-2); padding-top: var(--tw-2); border-top: 1px solid var(--tw-line); color: #ccbcff;
	font-size: var(--tw-fs-xs); pointer-events: auto; }
.gm-story-track > summary { cursor: pointer; }
.gm-story-track p { margin: var(--tw-1) 0 0; color: var(--tw-ink-2); }
.gm-story-track .gm-order-hint { color: #ccbcff; }
.tw-root:has(.gm-catch.is-on) .gm-order { opacity: 0; visibility: hidden; }
.gm-money { font-family: var(--tw-mono); color: var(--tw-sun); font-weight: 600; }
.gm-cooler { display: flex; align-items: center; gap: var(--tw-2); color: var(--tw-ink-2); font-size: var(--tw-fs-md); }
.gm-cooler-bar { width: calc(64 * var(--tw-u)); height: calc(5 * var(--tw-u)); border-radius: 99px; background: var(--tw-fill-2); overflow: hidden; }
.gm-cooler-bar > span { display: block; height: 100%; width: 0; background: var(--tw-aqua); border-radius: inherit; transition: width var(--tw-med) var(--tw-ease); }
.gm-cooler.is-full .gm-cooler-bar > span { background: var(--tw-coral); }
.gm-fight { position: absolute; left: 50%; bottom: calc(max(calc(72 * var(--tw-u)), 13vh) + calc(58 * var(--tw-u))); transform: translateX(-50%);
	width: calc(360 * var(--tw-u)); padding: var(--tw-3) var(--tw-4); border-radius: var(--tw-r-lg); font: 500 var(--tw-fs-md) var(--tw-font); color: var(--tw-ink);
	opacity: 0; transition: opacity var(--tw-med) var(--tw-ease); pointer-events: none; }
.gm-fight.is-on { opacity: 1; }
.gm-fight-head { display: flex; justify-content: space-between; margin-bottom: var(--tw-2); }
.gm-fight-call { font-weight: 600; letter-spacing: 0.02em; }
.gm-fight-call.is-warn { color: var(--tw-coral); }
.gm-fight-call.is-good { color: var(--tw-aqua); }
.gm-fight-dist { font-family: var(--tw-mono); color: var(--tw-ink-2); }
.gm-tension { position: relative; height: calc(12 * var(--tw-u)); border-radius: 99px; background: var(--tw-fill-2); overflow: hidden; }
.gm-band { position: absolute; top: 0; bottom: 0; background: rgba(var(--tw-aqua-rgb), 0.28); border-left: 1px solid rgba(var(--tw-aqua-rgb), 0.6); border-right: 1px solid rgba(var(--tw-aqua-rgb), 0.6); }
.gm-danger { position: absolute; top: 0; bottom: 0; right: 0; width: 8%; background: rgba(255, 122, 133, 0.35); }
.gm-needle { position: absolute; top: -2px; bottom: -2px; width: 3px; margin-left: -1.5px; border-radius: 2px; background: var(--tw-ink); box-shadow: 0 0 8px rgba(255,255,255,0.6); }
.gm-needle.is-hot { background: var(--tw-coral); box-shadow: 0 0 10px var(--tw-coral); }
.gm-stamina { margin-top: var(--tw-2); display: flex; align-items: center; gap: var(--tw-2); color: var(--tw-ink-3); font-size: var(--tw-fs-sm); }
.gm-stamina-bar { flex: 1; height: calc(4 * var(--tw-u)); border-radius: 99px; background: var(--tw-fill-2); overflow: hidden; }
.gm-stamina-bar > span { display: block; height: 100%; background: var(--tw-sun); }
.gm-bite { position: absolute; left: 50%; top: 42%; transform: translate(-50%, -50%) scale(0.6); font: 800 calc(56 * var(--tw-u)) var(--tw-font);
	color: var(--tw-sun); text-shadow: 0 0 18px rgba(var(--tw-sun-rgb), 0.8), 0 2px 4px rgba(0,0,0,0.5); opacity: 0; pointer-events: none;
	transition: opacity 120ms, transform 200ms var(--tw-ease); }
.gm-bite.is-on { opacity: 1; transform: translate(-50%, -50%) scale(1); }
.gm-cast { position: absolute; left: 50%; top: 58%; transform: translateX(-50%); width: calc(140 * var(--tw-u)); height: calc(5 * var(--tw-u));
	border-radius: 99px; background: var(--tw-fill-2); overflow: hidden; opacity: 0; transition: opacity var(--tw-fast); pointer-events: none; }
.gm-cast.is-on { opacity: 1; }
.gm-cast > span { display: block; height: 100%; width: 0; background: linear-gradient(90deg, var(--tw-aqua), var(--tw-sun)); }
.gm-dot { position: absolute; left: 50%; top: 50%; width: 4px; height: 4px; margin: -2px; border-radius: 50%; background: rgba(255,255,255,0.7); box-shadow: 0 0 3px rgba(0,0,0,0.6); opacity: 0; pointer-events: none; }
.gm-dot.is-on { opacity: 1; }
.gm-rescue { position: absolute; top: calc(108 * var(--tw-u)); left: 50%; transform: translateX(-50%);
	width: calc(370 * var(--tw-u)); max-width: calc(100vw - 2 * var(--tw-edge)); padding: var(--tw-3) var(--tw-4);
	border-radius: var(--tw-r-lg); border: 1px solid rgba(var(--tw-sun-rgb), 0.45); color: var(--tw-ink);
	font: 500 var(--tw-fs-md) var(--tw-font); line-height: 1.5; pointer-events: auto; }
.gm-rescue[hidden] { display: none; }
.gm-rescue-title { color: var(--tw-sun); font-size: var(--tw-fs-lg); font-weight: 600; }
.gm-rescue p { margin: var(--tw-1) 0 var(--tw-2); color: var(--tw-ink-2); font-size: var(--tw-fs-sm); }
.gm-rescue-actions { display: flex; align-items: center; justify-content: space-between; gap: var(--tw-3); }
.gm-rescue-actions .gm-btn { flex: none; }
.gm-rescue progress { display: block; width: 100%; height: calc(5 * var(--tw-u)); margin-top: var(--tw-2);
	border: 0; border-radius: 99px; overflow: hidden; background: var(--tw-fill-2); accent-color: var(--tw-sun); }
.gm-rescue progress::-webkit-progress-bar { background: var(--tw-fill-2); }
.gm-rescue progress::-webkit-progress-value { background: var(--tw-sun); }
.gm-rescue progress::-moz-progress-bar { background: var(--tw-sun); }
.tw-root[data-panel='open'] .gm-rescue { left: calc((100vw - var(--tw-panel-w) - var(--tw-3)) / 2); }
.gm-panel { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -48%); width: calc(460 * var(--tw-u)); max-width: calc(100vw - 2 * var(--tw-edge)); max-height: 76vh; display: flex; flex-direction: column;
	padding: var(--tw-4) var(--tw-5); border-radius: var(--tw-r-lg); font: 500 var(--tw-fs-md) var(--tw-font); color: var(--tw-ink);
	opacity: 0; pointer-events: none; transition: opacity var(--tw-med) var(--tw-ease), transform var(--tw-slow) var(--tw-ease); }
.gm-panel.is-open { opacity: 1; pointer-events: auto; transform: translate(-50%, -50%); }
.gm-panel h2 { margin: 0 0 var(--tw-1); font-size: calc(17 * var(--tw-u)); font-weight: 600; }
.gm-panel p.gm-sub { margin: 0 0 var(--tw-3); color: var(--tw-ink-3); font-size: var(--tw-fs-sm); }
.gm-panel > h2, .gm-panel > .gm-sub, .gm-foot { flex-shrink: 0; }
.gm-list { min-height: 0; overflow: auto; overscroll-behavior: contain; scrollbar-gutter: stable; margin: 0 calc(-1 * var(--tw-2)); padding: 0 var(--tw-2); }
.gm-row { display: grid; grid-template-columns: 1fr auto auto auto; gap: var(--tw-3); align-items: center; padding: var(--tw-2) 0; border-bottom: 1px solid var(--tw-line); }
.gm-row .gm-kg, .gm-row .gm-val { font-family: var(--tw-mono); color: var(--tw-ink-2); }
.gm-row .gm-val { color: var(--tw-sun); }
.gm-row small { color: var(--tw-aqua); margin-left: var(--tw-1); }
.gm-empty { color: var(--tw-ink-3); padding: var(--tw-4) 0; text-align: center; }
.gm-foot { display: flex; justify-content: space-between; align-items: center; margin-top: var(--tw-3); gap: var(--tw-3); }
.gm-btn { font: 600 var(--tw-fs-md) var(--tw-font); color: #0b1418; background: var(--tw-aqua); border: 0; border-radius: 999px; padding: var(--tw-2) var(--tw-4); cursor: pointer; }
.gm-btn[disabled] { opacity: 0.4; cursor: default; }
.gm-btn.is-ghost { background: var(--tw-fill-2); color: var(--tw-ink); }
.gm-mini { font: 500 var(--tw-fs-sm) var(--tw-font); color: var(--tw-ink-2); background: var(--tw-fill); border: 1px solid var(--tw-line); border-radius: 999px; padding: 2px var(--tw-2); cursor: pointer; }
.gm-gauge { display: none; align-items: center; gap: var(--tw-2); color: var(--tw-ink-2); font-size: var(--tw-fs-md); }
.gm-gauge.is-on { display: flex; }
.gm-gauge b { font-family: var(--tw-mono); font-weight: 500; color: var(--tw-ink); }
.gm-fuel-bar > span { background: var(--tw-sun); }
.gm-fuel.is-low .gm-fuel-bar > span { background: var(--tw-coral); }
.gm-sonar-dots { letter-spacing: 1px; color: var(--tw-aqua); }
.gm-shop-row { display: grid; grid-template-columns: 1fr auto; gap: var(--tw-3); align-items: center; padding: var(--tw-2) 0; border-bottom: 1px solid var(--tw-line); }
.gm-shop-row small { display: block; color: var(--tw-ink-3); font-size: var(--tw-fs-sm); margin-top: 2px; }
.gm-shop-row .gm-have { color: var(--tw-ink-3); font-size: var(--tw-fs-sm); }
.gm-panel.gm-boats { width: calc(780 * var(--tw-u)); }
.gm-boat-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--tw-3); }
.gm-boat-card { min-width: 0; display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--tw-line); border-radius: var(--tw-r-md); background: var(--tw-fill); }
.gm-boat-card.is-current { border-color: var(--tw-aqua); }
.gm-boat-image { display: block; width: 100%; height: auto; aspect-ratio: 16 / 9; object-fit: contain; background: #162b38; }
.gm-boat-info { display: flex; flex: 1; flex-direction: column; gap: var(--tw-2); padding: var(--tw-3); }
.gm-boat-info h3 { margin: 0; font-size: var(--tw-fs-lg); }
.gm-boat-size { color: var(--tw-aqua); font: 500 var(--tw-fs-sm) var(--tw-mono); }
.gm-boat-info p { margin: 0; color: var(--tw-ink-2); font-size: var(--tw-fs-sm); line-height: 1.6; }
.gm-boat-info .gm-btn { margin-top: auto; width: 100%; white-space: normal; }
@media (max-width: 600px) { .gm-boat-grid { grid-template-columns: minmax(0, 1fr); } }
.gm-log { margin-top: var(--tw-3); color: var(--tw-ink-3); font-size: var(--tw-fs-sm); line-height: 1.5; }
.gm-order-offer { padding: var(--tw-3); margin-bottom: var(--tw-2); border: 1px solid var(--tw-line-2); border-radius: var(--tw-r-md); background: var(--tw-fill); }
.gm-order-offer .gm-order-head { color: var(--tw-ink-2); }
.gm-order-offer .gm-order-line { margin-top: var(--tw-2); }
.gm-order-offer .gm-order-hint, .gm-order-offer .gm-order-status { margin-top: var(--tw-1); }
.gm-order-goal { margin-top: var(--tw-1); color: var(--tw-ink-2); font-size: var(--tw-fs-sm); }
.gm-order-reward { margin-top: var(--tw-2); color: var(--tw-sun); font-size: var(--tw-fs-xs); line-height: 1.5; }
.gm-journey { margin: var(--tw-3) 0; padding: var(--tw-3); border: 1px solid var(--tw-line); border-radius: var(--tw-r-md); font-size: var(--tw-fs-sm); line-height: 1.5; }
.gm-journey > summary { cursor: pointer; color: var(--tw-ink); font-weight: 600; }
.gm-journey h3 { margin: 0 0 var(--tw-2); font-size: var(--tw-fs-md); }
.gm-story-journal > summary, .gm-story-dialogue h3 { color: #ccbcff; }
.gm-story-entry { margin-top: var(--tw-3); }
.gm-story-entry p, .gm-story-dialogue p { margin: var(--tw-1) 0 var(--tw-2); color: var(--tw-ink-2); line-height: 1.65; white-space: pre-line; overflow-wrap: anywhere; }
.gm-story-dialogue { margin: 0 0 var(--tw-3); padding: var(--tw-3); border: 1px solid rgba(184, 161, 255, 0.3); border-radius: var(--tw-r-md); background: var(--tw-fill); }
.gm-story-dialogue h3 { margin: 0; font-size: var(--tw-fs-sm); font-weight: 600; }
.gm-story-dialogue p { font-size: var(--tw-fs-sm); }
.gm-story-choices { display: flex; flex-wrap: wrap; gap: var(--tw-2); }
.gm-story-choice { padding: var(--tw-2) var(--tw-3); border-radius: var(--tw-r-md); color: var(--tw-ink); text-align: left; white-space: normal; line-height: 1.5; }
.gm-story-choice:hover { border-color: #ccbcff; background: var(--tw-fill-2); }
.gm-story-choice:focus-visible, .gm-story-track > summary:focus-visible { outline: 2px solid #ccbcff; outline-offset: 3px; }
.gm-chapter { padding: var(--tw-2) 0; border-bottom: 1px solid var(--tw-line); color: var(--tw-ink-3); }
.gm-chapter-head { display: flex; justify-content: space-between; gap: var(--tw-2); }
.gm-chapter-head span { flex: none; }
.gm-chapter small { display: block; margin-top: 2px; font-size: var(--tw-fs-xs); }
.gm-chapter.is-current { color: var(--tw-sun); }
.gm-chapter.is-complete { color: var(--tw-aqua); }
.gm-grounds { margin-top: var(--tw-2); color: var(--tw-ink-2); }
.gm-grounds > div { display: flex; justify-content: space-between; gap: var(--tw-2); padding-top: var(--tw-1); }
.gm-grounds .is-open { color: var(--tw-aqua); }
.gm-row.is-order-match > span:first-child { color: var(--tw-aqua); }
.gm-row.is-order-match small { white-space: nowrap; }
.gm-row .gm-cm { font-family: var(--tw-mono); color: var(--tw-ink-3); }
.gm-row.has-cm { grid-template-columns: 1fr auto auto auto auto; }

@media (min-width: 900px) and (max-width: 1240px) {
	.tw-root[data-panel='open'] .gm-purse {
		max-width: calc(100vw - var(--tw-panel-w) - 2 * var(--tw-3) - 240px);
		flex-wrap: wrap;
		justify-content: flex-end;
	}
}
@media (min-width: 900px) and (max-width: 1124px) {
	.tw-root[data-panel='open'] .gm-order { display: none; }
	.tw-root[data-panel='open'] .gm-panel {
		left: calc((100vw - var(--tw-panel-w) - var(--tw-3)) / 2);
	}
}
@media (max-width: 920px) {
	.tw-root:has(.gm-panel.is-open) .gm-order { display: none; }
}

/* catch card: full screen. The world dims and blurs; the fish lies side-on in its own studio light
   (FishPortrait, a WebGPU canvas) between the name above and the numbers below */
.gm-catch-scrim { position: absolute; inset: 0; pointer-events: none; opacity: 0; visibility: hidden;
	background: radial-gradient(70% 60% at 50% 50%, rgba(10, 22, 34, 0.55) 0%, rgba(4, 9, 15, 0.86) 100%);
	-webkit-backdrop-filter: blur(10px) saturate(0.8); backdrop-filter: blur(10px) saturate(0.8);
	transition: opacity 420ms var(--tw-ease), visibility 0s linear 420ms; }
.gm-catch-scrim.is-on { opacity: 1; visibility: visible; transition: opacity 420ms var(--tw-ease), visibility 0s; }
.gm-catch { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: clamp(6px, 1.4vh, 18px);
	padding: var(--tw-6) var(--tw-edge); color: #f4ead6; font: 500 var(--tw-fs-md) var(--tw-font); text-align: center;
	pointer-events: none; opacity: 0; visibility: hidden; transition: opacity 300ms var(--tw-ease), visibility 0s linear 300ms; }
.gm-catch.is-on { opacity: 1; visibility: visible; transition: opacity 300ms var(--tw-ease), visibility 0s; }
.gm-catch-top, .gm-catch-bottom { display: flex; flex-direction: column; align-items: center; opacity: 0; }
.gm-catch.is-on .gm-catch-top { animation: gm-rise 700ms var(--tw-ease) 120ms forwards; }
.gm-catch.is-on .gm-catch-bottom { animation: gm-rise 700ms var(--tw-ease) 520ms forwards; }
@keyframes gm-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
.gm-catch-eyebrow { display: flex; align-items: center; justify-content: center; min-height: calc(26 * var(--tw-u)); margin-bottom: var(--tw-2);
	font-size: var(--tw-fs-sm); font-weight: 700; letter-spacing: 0.32em; text-transform: uppercase; color: rgba(244, 234, 214, 0.62); }
.gm-badge { display: inline-flex; align-items: center; gap: 0.5em; padding: calc(4 * var(--tw-u)) calc(12 * var(--tw-u)); border-radius: 4px;
	letter-spacing: 0.22em; font-weight: 800; transform: scale(2.4) rotate(-8deg); opacity: 0; }
.gm-catch.is-on .gm-badge { animation: gm-stamp 520ms cubic-bezier(0.3, 1.5, 0.5, 1) 900ms forwards; }
.gm-badge.is-record { color: #2a1604; background: linear-gradient(100deg, #f3cf8a 0%, #d9a441 40%, #fff0cf 50%, #d9a441 60%, #f3cf8a 100%); background-size: 250% 100%;
	box-shadow: 0 0 0 2px rgba(42, 22, 4, 0.35) inset, 0 0 26px rgba(217, 164, 65, 0.55); }
.gm-catch.is-on .gm-badge.is-record { animation: gm-stamp 520ms cubic-bezier(0.3, 1.5, 0.5, 1) 900ms forwards, gm-shine 2.6s var(--tw-ease-io) 1.6s infinite; }
.gm-badge.is-new { color: #062420; background: #6fd6c6; box-shadow: 0 0 0 2px rgba(6, 36, 32, 0.3) inset, 0 0 22px rgba(111, 214, 198, 0.45); }
.gm-badge.is-plain { color: rgba(244, 234, 214, 0.8); background: none; box-shadow: inset 0 0 0 1px rgba(244, 234, 214, 0.35); }
@keyframes gm-stamp { 0% { transform: scale(2.4) rotate(-8deg); opacity: 0; } 70% { transform: scale(0.94) rotate(-3deg); opacity: 1; } 100% { transform: scale(1) rotate(-3deg); opacity: 1; } }
@keyframes gm-shine { 0% { background-position: 100% 0; } 100% { background-position: -150% 0; } }
.gm-catch h2 { margin: 0; font-family: 'Caveat Brush', 'Kalam', var(--tw-font); font-weight: 400; font-size: clamp(38px, 6.2vw, 92px); line-height: 1; letter-spacing: 0.01em;
	color: #fbf1dc; text-shadow: 0 2px 0 rgba(0, 0, 0, 0.35), 0 8px 30px rgba(0, 0, 0, 0.45); }
.gm-catch-sci { margin-top: calc(4 * var(--tw-u)); font-family: 'Kalam', var(--tw-font); font-style: italic; color: rgba(244, 234, 214, 0.66); font-size: clamp(13px, 1.3vw, 19px); }
.gm-catch-stage { position: relative; width: min(94vw, 1400px, calc(46vh * 2.4)); aspect-ratio: 2.4 / 1; }
.gm-catch-stage canvas { position: absolute; inset: 0; width: 100%; height: 100%;
	-webkit-mask-image: linear-gradient(90deg, transparent 0%, #000 14%, #000 86%, transparent 100%); mask-image: linear-gradient(90deg, transparent 0%, #000 14%, #000 86%, transparent 100%); }
/* the card owns the screen: the minimap and the settings rail step aside */
.tw-root:has(.gm-catch.is-on) .gm-map, .tw-root:has(.gm-catch.is-on) .tw-rail { opacity: 0; pointer-events: none; transition: opacity 300ms; }
.gm-catch-stage::before { content: ''; position: absolute; left: 12%; right: 12%; bottom: 6%; height: 16%; border-radius: 50%;
	background: radial-gradient(closest-side, rgba(0, 0, 0, 0.5), transparent); opacity: 0; }
.gm-catch.is-on .gm-catch-stage::before { animation: gm-fade 900ms var(--tw-ease) 350ms forwards; }
@keyframes gm-fade { to { opacity: 1; } }
.gm-splash { position: absolute; left: 50%; top: 52%; width: 0; height: 0; pointer-events: none; }
.gm-splash i { position: absolute; left: 0; top: 0; width: var(--s); height: var(--s); margin: calc(var(--s) / -2); border-radius: 50%;
	background: radial-gradient(circle at 35% 35%, rgba(255, 255, 255, 0.95), rgba(190, 235, 245, 0.55) 55%, transparent 72%); opacity: 0; }
.gm-catch.is-on .gm-splash i { animation: gm-drop 1100ms cubic-bezier(0.2, 0.7, 0.3, 1) var(--d) forwards; }
@keyframes gm-drop { 0% { opacity: 0; transform: translate(0, 0) scale(0.4); } 12% { opacity: 1; }
	100% { opacity: 0; transform: translate(var(--x), var(--y)) scale(1); } }
.gm-catch-stats { display: flex; justify-content: center; gap: clamp(8px, 1.6vw, 22px); margin-top: var(--tw-2); }
.gm-stat { min-width: clamp(96px, 11vw, 150px); padding: calc(10 * var(--tw-u)) calc(16 * var(--tw-u)) calc(9 * var(--tw-u)); border-radius: 6px;
	background: linear-gradient(180deg, rgba(232, 220, 192, 0.12), rgba(232, 220, 192, 0.05)); box-shadow: inset 0 0 0 1px rgba(214, 180, 110, 0.38), 0 10px 30px rgba(0, 0, 0, 0.25); }
.gm-stat span { display: block; font-size: var(--tw-fs-xs); font-weight: 700; letter-spacing: 0.22em; text-transform: uppercase; color: rgba(222, 190, 125, 0.9); }
.gm-stat b { display: block; margin-top: calc(4 * var(--tw-u)); font: 600 clamp(20px, 2.2vw, 32px) var(--tw-mono); color: #fbf1dc; white-space: nowrap; }
.gm-stat b small { font-size: 0.55em; font-weight: 500; color: rgba(244, 234, 214, 0.7); margin-left: 0.2em; }
.gm-stat i { display: block; white-space: nowrap; font-style: normal; font-family: var(--tw-mono); font-size: var(--tw-fs-sm); color: rgba(244, 234, 214, 0.5); margin-top: 2px; }
.gm-stat.is-value b { color: #f0c46a; }
.gm-catch-note { margin-top: var(--tw-3); min-height: 1.4em; color: rgba(244, 234, 214, 0.78); font-family: 'Kalam', var(--tw-font); font-size: clamp(14px, 1.25vw, 19px); line-height: 1.4; }
.gm-catch-note b { color: #f0c46a; font-weight: 700; }
.gm-catch-note.is-warn { color: #ff9a8a; }
.gm-catch-foot { display: flex; align-items: center; justify-content: center; gap: var(--tw-2); margin-top: var(--tw-3); color: rgba(244, 234, 214, 0.5); font-size: var(--tw-fs-sm); }
.gm-catch-foot kbd { font: 600 var(--tw-fs-xs) var(--tw-mono); color: #f4ead6; padding: 2px calc(6 * var(--tw-u)); border-radius: 4px; border: 1px solid rgba(244, 234, 214, 0.3); background: rgba(244, 234, 214, 0.08); }
.gm-catch-timer { width: calc(80 * var(--tw-u)); height: 2px; margin-left: var(--tw-2); border-radius: 2px; background: rgba(244, 234, 214, 0.15); overflow: hidden; }
.gm-catch-timer > span { display: block; height: 100%; width: 100%; background: rgba(244, 234, 214, 0.55); transform-origin: 0 50%; }
.gm-catch.is-on .gm-catch-timer > span { animation: gm-timer var(--gm-catch-ms, 9000ms) linear forwards; }
@keyframes gm-timer { from { transform: scaleX(1); } to { transform: scaleX(0); } }
@media (prefers-reduced-motion: reduce) {
	.gm-catch.is-on .gm-catch-top, .gm-catch.is-on .gm-catch-bottom { animation: none; opacity: 1; }
	.gm-catch.is-on .gm-badge, .gm-catch.is-on .gm-badge.is-record { animation: none; transform: rotate(-3deg); opacity: 1; }
	.gm-catch.is-on .gm-splash i { animation: none; }
}
@media (max-width: 640px) {
	.gm-catch-stage { width: 96vw; }
	.gm-catch-stats { gap: 6px; }
	.gm-stat { min-width: 0; padding: 8px 10px; }
}
@media (max-height: 700px) {
	.gm-catch { gap: 6px; padding-block: var(--tw-3); }
	.gm-catch-stage { width: min(94vw, 1400px, calc(36vh * 2.4)); }
}
`;

const h = ( tag, cls, html ) => {

	const e = document.createElement( tag );
	if ( cls ) e.className = cls;
	if ( html !== undefined ) e.innerHTML = html;
	return e;

};

export class GameHUD {

	constructor( ui, game ) {

		this.ui = ui;
		this.game = game;
		const style = h( 'style' );
		style.textContent = CSS;
		document.head.append( style );

		this.purse = h( 'div', 'gm-purse tw-glass', `<span class="gm-money">$0</span><span class="gm-cooler"><span class="gm-cooler-label">保温箱</span><span class="gm-cooler-bar"><span></span></span><span class="gm-cooler-kg">0 / 30 kg</span></span><span class="gm-gauge gm-fuel"><span>燃油</span><span class="gm-cooler-bar gm-fuel-bar"><span></span></span><b class="gm-fuel-l">40 L</b></span><span class="gm-gauge gm-sonar"><span>探鱼器</span><b class="gm-sonar-d">0 m</b><span class="gm-sonar-dots"></span></span>` );
		this.fuelEl = this.purse.querySelector( '.gm-fuel' );
		this.fuelBar = this.purse.querySelector( '.gm-fuel-bar > span' );
		this.fuelL = this.purse.querySelector( '.gm-fuel-l' );
		this.sonarEl = this.purse.querySelector( '.gm-sonar' );
		this.sonarD = this.purse.querySelector( '.gm-sonar-d' );
		this.sonarDots = this.purse.querySelector( '.gm-sonar-dots' );
		this.moneyEl = this.purse.querySelector( '.gm-money' );
		this.coolerEl = this.purse.querySelector( '.gm-cooler' );
		this.coolerBar = this.purse.querySelector( '.gm-cooler-bar > span' );
		this.coolerKg = this.purse.querySelector( '.gm-cooler-kg' );
		this.coolerLabel = this.purse.querySelector( '.gm-cooler-label' );

		this.fight = h( 'div', 'gm-fight tw-glass', `
			<div class="gm-fight-head"><span class="gm-fight-call">鱼上钩了！</span><span class="gm-fight-dist">0 m</span></div>
			<div class="gm-tension"><span class="gm-band"></span><span class="gm-danger"></span><span class="gm-needle"></span></div>
			<div class="gm-stamina"><span>鱼体力</span><span class="gm-stamina-bar"><span></span></span></div>` );
		this.fCall = this.fight.querySelector( '.gm-fight-call' );
		this.fDist = this.fight.querySelector( '.gm-fight-dist' );
		this.fBand = this.fight.querySelector( '.gm-band' );
		this.fNeedle = this.fight.querySelector( '.gm-needle' );
		this.fStam = this.fight.querySelector( '.gm-stamina-bar > span' );

		this.bite = h( 'div', 'gm-bite', '!' );
		this.cast = h( 'div', 'gm-cast', '<span></span>' );
		this.castBar = this.cast.firstChild;
		this.dot = h( 'div', 'gm-dot' );
		this.rescue = h( 'section', 'gm-rescue tw-glass tw-interactive', `
			<div class="gm-rescue-title" role="status">船只已翻覆</div>
			<p>免费回港，保留渔获、金币和任务进度；取消当前鱼线。按 Esc 可使用鼠标点击。</p>
			<div class="gm-rescue-actions"><span class="gm-rescue-hold">长按 X 2 秒</span><button type="button" class="gm-btn">救援回港</button></div>
			<progress max="1" value="0" aria-label="长按救援进度"></progress>` );
		this.rescue.hidden = true;
		this.rescueTitle = this.rescue.querySelector( '.gm-rescue-title' );
		this.rescueHold = this.rescue.querySelector( '.gm-rescue-hold' );
		this.rescueProgress = this.rescue.querySelector( 'progress' );
		this.rescue.querySelector( 'button' ).onclick = () => game.rescueToHarbor();
		this.catchScrim = h( 'div', 'gm-catch-scrim' );
		this.catchCard = h( 'div', 'gm-catch tw-glass' );
		this.catchOpen = false;
		const hud = ui.hud || ui.root;
		hud.append( this.catchScrim, this.purse, this.fight, this.bite, this.cast, this.dot, this.rescue, this.catchCard );
		this.orderCard = h( 'div', 'gm-order tw-glass' );
		( hud.querySelector( '.tw-tl' ) || hud ).append( this.orderCard );

		// panels (interactive)
		this.inv = h( 'div', 'gm-panel tw-glass tw-interactive' );
		this.stand = h( 'div', 'gm-panel tw-glass tw-interactive' );
		ui.root.append( this.inv, this.stand );
		this.invOpen = false;
		this.standOpen = false;
		this._last = {};
		game.state.onChange( () => this.refresh() );
		this.refresh();

	}

	toast( text, ms ) {

		this.ui.toast( text, ms );

	}

	refresh() {

		const s = this.game.state;
		const st = s.stats;
		this.moneyEl.textContent = `$${ s.money.toLocaleString() }`;
		const kg = s.holdKg;
		this.coolerLabel.textContent = s.upgrades.hold > 0 ? '鱼舱' : '保温箱';
		this.coolerKg.textContent = `${ kg.toFixed( 1 ) } / ${ st.holdKg } kg`;
		this.coolerBar.style.width = `${ Math.min( 100, kg / st.holdKg * 100 ) }%`;
		this.coolerEl.classList.toggle( 'is-full', kg > st.holdKg * 0.9 );
		if ( this._last.money !== undefined && this._last.money !== s.money ) {

			this.purse.classList.remove( 'is-bump' );
			void this.purse.offsetWidth;
			this.purse.classList.add( 'is-bump' );

		}

		this._last.money = s.money;
		this.renderOrderCard();
		const panel = this.invOpen ? this.inv : this.standOpen ? this.stand : null;
		const scrollTop = panel?.querySelector( '.gm-list' )?.scrollTop || 0;
		const journeyOpen = panel?.querySelector( 'details.gm-journey' )?.open || false;
		const storyOpen = panel?.querySelector( 'details.gm-story-journal' )?.open || false;
		if ( this.invOpen ) this.renderInventory();
		if ( this.standOpen ) this.vendor && this.vendor.kind === 'shop' ? this.renderShop() : this.renderStand();
		const journey = panel?.querySelector( 'details.gm-journey' );
		if ( journey ) journey.open = journeyOpen;
		const story = panel?.querySelector( 'details.gm-story-journal' );
		if ( story ) story.open = storyOpen;
		const list = panel?.querySelector( '.gm-list' );
		if ( list ) list.scrollTop = scrollTop;

	}

	renderOrderCard() {

		const trackOpen = this.orderCard.querySelector?.( '.gm-story-track' )?.open || false;
		const active = this.game.state.story?.stage > 0;
		const objective = active ? storyObjective( this.game.state ) : null;
		this.orderCard.innerHTML = this.orderMarkup( true ) + ( objective ? `<details class="gm-story-track tw-interactive" ${ trackOpen ? 'open' : '' }>
			<summary>☆ ${ objective.title } · I 日志</summary><p>${ objective.text }</p>${ objective.location ? '<div class="gm-order-hint">蓝紫色 ☆ 指向支线目标</div>' : '' }</details>` : '' );

	}

	storyJournalMarkup() {

		const s = this.game.state;
		if ( ! s.story?.stage ) return '';
		const objective = storyObjective( s );
		const entries = storyJournal( s ).map( ( entry ) => `<article class="gm-story-entry"><b>${ entry.title }</b><p>${ entry.text }</p></article>` ).join( '' );
		return `<details class="gm-journey gm-story-journal"><summary>☆ ${ STORY_TITLE } · ${ s.story.stage === 6 ? '已完成' : '进行中' }</summary>
			<div class="gm-story-entry"><b>${ objective.title }</b><p>${ objective.text }</p></div>${ entries }</details>`;

	}

	storyDialogueMarkup( kind ) {

		const dialogue = this.game.state.story ? storyDialogue( this.game.state, kind ) : null;
		if ( ! dialogue ) return '';
		return `<section class="gm-story-dialogue" aria-label="支线对话"><h3>☆ ${ STORY_TITLE }</h3><p>${ dialogue.text }</p>
			<div class="gm-story-choices">${ dialogue.choices.map( ( choice ) => `<button type="button" class="gm-mini gm-story-choice" data-story="${ choice.id }">${ choice.label }</button>` ).join( '' ) }</div></section>`;

	}

	bindStoryChoices() {

		for ( const button of this.stand.querySelectorAll( '[data-story]' ) ) button.onclick = () => this.game.talkStory( button.dataset.story );

	}

	orderMarkup( compact = false ) {

		const s = this.game.state, order = s.currentOrder;
		if ( ! order ) {

			return `<div class="gm-order-head"><span>航程 ${ ORDERS.length } / ${ ORDERS.length }</span><b>全部完成</b></div>
				<div class="gm-order-line">潮汐大师 · 全部完成</div>
				<div class="gm-order-hint">所有钓场已开放。继续钓鱼、出售渔获，挑战图鉴纪录吧！</div>`;

		}

		const chapter = CHAPTERS[ order.chapter ];
		const stock = s.inventory.filter( ( fish ) => matchesOrder( order, fish ) ).length;
		return `
			<div class="gm-order-head"><span>第 ${ order.chapter + 1 } 章 · ${ chapter.name }</span><b>${ s.orderIndex + 1 } / ${ ORDERS.length }</b></div>
			<div class="gm-order-line"><span>${ order.title }</span><b>+$${ order.reward }</b></div>
			<div class="gm-order-goal">${ FISH[ order.species ].name } ≥ ${ order.minKg } kg · ${ order.count } 条</div>
			<div class="gm-order-status ${ stock ? 'is-ready' : '' }">已交付 ${ s.orderDelivered } / ${ order.count } 条 · 仓内合格 ${ stock } 条</div>
			<div class="gm-order-hint">${ order.hint }</div>
			${ compact ? '' : `<div class="gm-order-hint">可分批卖给乔，交齐后领取任务奖金；每条鱼只计入一个任务。</div>
			<div class="gm-order-reward">本章完成奖励：${ chapter.rewardText }</div>` }`;

	}

	journeyMarkup( collapsible = false ) {

		const s = this.game.state;
		const chapters = CHAPTERS.map( ( chapter, i ) => {

			const count = chapter.end - chapter.start;
			const done = Math.max( 0, Math.min( count, s.orderIndex - chapter.start ) );
			const complete = done === count;
			const current = s.orderIndex >= chapter.start && ! complete;
			return `<div class="gm-chapter ${ complete ? 'is-complete' : current ? 'is-current' : '' }">
				<div class="gm-chapter-head"><b>第 ${ i + 1 } 章 · ${ chapter.name }</b><span>${ complete ? '已完成' : current ? `进行中 ${ done } / ${ count }` : '待开启' }</span></div>
				<small>${ chapter.rewardText }</small></div>`;

		} ).join( '' );
		const grounds = Object.entries( GROUNDS ).map( ( [ id, ground ] ) => {

			const open = s.isGroundUnlocked( id );
			const chapter = CHAPTERS.findIndex( ( c ) => c.end === ground.unlockAfter );
			return `<div><span>${ ground.name }</span><span class="${ open ? 'is-open' : '' }">${ open ? '已开放' : `完成第 ${ chapter + 1 } 章解锁` }</span></div>`;

		} ).join( '' );
		const content = `${ chapters }<div class="gm-grounds"><b>钓场通行</b>${ grounds }</div>${ s.legacyAccess ? '<div class="gm-order-hint">已保留旧存档钓场权限。</div>' : '' }`;
		const heading = `任务航程 · ${ s.orderIndex } / ${ ORDERS.length } 已完成`;
		return collapsible
			? `<details class="gm-journey"><summary>${ heading }</summary>${ content }</details>`
			: `<section class="gm-journey"><h3>${ heading }</h3>${ content }</section>`;

	}

	// per frame
	update( { fight, casting, power, bite, aiming, fuel = null, sonar = null, rescue = null } ) {

		const showRescue = !! rescue && ! this.game.worldMap?.open && ! this.invOpen && ! this.standOpen && ! this.catchOpen && ! this.ui.helpOpen && ! this.ui.photoMode;
		if ( ! showRescue && this.rescue.contains( document.activeElement ) ) document.activeElement.blur();
		this.rescue.hidden = ! showRescue;
		if ( showRescue ) {

			const title = rescue.capsized ? '船只已翻覆' : '准备救援回港';
			if ( this.rescueTitle.textContent !== title ) this.rescueTitle.textContent = title;
			const hold = Math.max( 0, Math.min( 1, rescue.hold ) );
			this.rescueHold.textContent = hold > 0 ? `继续按住 X · ${ ( ( 1 - hold ) * 2 ).toFixed( 1 ) } 秒` : '长按 X 2 秒';
			this.rescueProgress.value = hold;

		}

		// boat instruments in the purse: fuel while aboard, the fish finder when fitted
		this.fuelEl.classList.toggle( 'is-on', !! fuel );
		if ( fuel ) {

			this.fuelBar.style.width = `${ fuel.litres / fuel.tank * 100 }%`;
			this.fuelL.textContent = `${ fuel.litres.toFixed( 0 ) } L`;
			this.fuelEl.classList.toggle( 'is-low', fuel.litres < fuel.tank * 0.15 );

		}

		this.sonarEl.classList.toggle( 'is-on', !! sonar );
		if ( sonar ) {

			this.sonarD.textContent = `${ sonar.depth.toFixed( 1 ) } m`;
			const n = Math.round( sonar.fish * 4 );
			this.sonarDots.textContent = '●'.repeat( n ) + '○'.repeat( 4 - n );

		}


		this.fight.classList.toggle( 'is-on', !! fight );
		if ( fight ) {

			const T = Math.min( fight.tension, 1.05 );
			this.fNeedle.style.left = `${ T / 1.05 * 100 }%`;
			this.fNeedle.classList.toggle( 'is-hot', fight.tension > fight.band[ 1 ] );
			this.fBand.style.left = `${ fight.band[ 0 ] / 1.05 * 100 }%`;
			this.fBand.style.width = `${ ( fight.band[ 1 ] - fight.band[ 0 ] ) / 1.05 * 100 }%`;
			this.fStam.style.width = `${ fight.stamina * 100 }%`;
			this.fDist.textContent = `${ fight.distance.toFixed( 1 ) } m`;
			let call = '收线', cls = '';
			if ( fight.tension > 0.88 ) { call = '松手减压！'; cls = 'is-warn'; }
			else if ( fight.surge > 0.55 ) { call = '鱼正在冲刺！'; cls = 'is-warn'; }
			else if ( fight.tension < 0.15 ) { call = '鱼线松了！'; cls = 'is-warn'; }
			else if ( fight.tension >= fight.band[ 0 ] && fight.tension <= fight.band[ 1 ] ) { call = '张力合适'; cls = 'is-good'; }
			this.fCall.textContent = call;
			this.fCall.className = 'gm-fight-call ' + cls;

		}

		this.bite.classList.toggle( 'is-on', !! bite );
		this.cast.classList.toggle( 'is-on', !! casting );
		if ( casting ) this.castBar.style.width = `${ power * 100 }%`;
		this.dot.classList.toggle( 'is-on', !! aiming && ! this.invOpen && ! this.standOpen );

	}

	// ---- catch card
	// info: GameState.lastCatch ({ species, kg, cm, value, newSpecies, record, prevBestKg, prevBestCm, kept })
	showCatch( info, ms = 9000 ) {

		const f = FISH[ info.species ];
		const inch = info.cm / 2.54, lb = info.kg * 2.20462;
		const badge = info.record ? '<span class="gm-badge is-record">★ 刷新纪录</span>'
			: info.newSpecies ? '<span class="gm-badge is-new">新鱼种</span>' : '<span class="gm-badge is-plain">钓获</span>';
		let note;
		if ( ! info.kept ) note = `<div class="gm-catch-note is-warn">${ this.game.state.upgrades.hold > 0 ? '鱼舱' : '保温箱' }已满 · 已将鱼放生</div>`;
		else if ( info.record ) note = `<div class="gm-catch-note">原纪录 <b>${ info.prevBestKg.toFixed( 2 ) } kg</b> · ${ info.prevBestCm } cm，刷新了 ${ ( info.kg - info.prevBestKg ).toFixed( 2 ) } kg！</div>`;
		else if ( info.newSpecies ) note = '<div class="gm-catch-note">鱼类图鉴新增一个鱼种。</div>';
		else note = `<div class="gm-catch-note">个人最佳：${ info.prevBestKg.toFixed( 2 ) } kg · ${ info.prevBestCm } cm</div>`;
		// splash burst around the fish as it lands in view
		let drops = '';
		for ( let i = 0; i < 26; i ++ ) {

			const a = ( i / 26 ) * Math.PI * 2 + Math.random() * 0.3, r = 90 + Math.random() * 260;
			drops += `<i style="--s:${ ( 4 + Math.random() * 12 ).toFixed( 1 ) }px;--x:${ ( Math.cos( a ) * r * 1.8 ).toFixed( 0 ) }px;--y:${ ( Math.sin( a ) * r * 0.55 - 40 ).toFixed( 0 ) }px;--d:${ ( 250 + Math.random() * 220 ).toFixed( 0 ) }ms"></i>`;

		}

		const c = this.catchCard;
		c.style.setProperty( '--gm-catch-ms', `${ ms }ms` );
		c.innerHTML = `
			<div class="gm-catch-top">
				<div class="gm-catch-eyebrow">${ badge }</div>
				<h2>${ f.name }</h2>
				<div class="gm-catch-sci">${ f.sci || '' }</div>
			</div>
			<div class="gm-catch-stage"><canvas></canvas><div class="gm-splash">${ drops }</div></div>
			<div class="gm-catch-bottom">
				<div class="gm-catch-stats">
					<div class="gm-stat"><span>长度</span><b>${ info.cm }<small>cm</small></b><i>${ inch.toFixed( 1 ) } 英寸</i></div>
					<div class="gm-stat"><span>重量</span><b>${ info.kg < 1 ? info.kg.toFixed( 2 ) : info.kg.toFixed( 1 ) }<small>kg</small></b><i>${ lb.toFixed( 1 ) } 磅</i></div>
					<div class="gm-stat is-value"><span>价值</span><b>$${ info.value }</b><i>${ info.kept ? '已留存' : '已放生' }</i></div>
				</div>
				${ note }
				<div class="gm-catch-foot">点击鼠标或按 <kbd>E</kbd> 继续<span class="gm-catch-timer"><span></span></span></div>
			</div>`;
		// restart the entrance even when a card is already up
		c.classList.remove( 'is-on' );
		void c.offsetWidth;
		c.classList.add( 'is-on' );
		this.catchScrim.classList.add( 'is-on' );
		this.catchOpen = true;
		// the fish itself: the real model in a studio, drawn live into the stage canvas
		try {

			if ( ! this.portrait ) this.portrait = new FishPortrait();
			if ( this.portrait.attach( c.querySelector( '.gm-catch-stage canvas' ) ) ) this.portrait.show( info.species, info.kg );

		} catch ( e ) {

			console.warn( 'fish portrait unavailable', e );

		}

	}

	hideCatch() {

		this.catchCard.classList.remove( 'is-on' );
		this.catchScrim.classList.remove( 'is-on' );
		this.catchOpen = false;
		if ( this.portrait ) this.portrait.detach();

	}

	// ---- inventory
	toggleInventory( force ) {

		this.invOpen = force ?? ! this.invOpen;
		if ( this.invOpen ) {

			this.closeStand();
			this.renderInventory();
			releaseMouse();

		}

		this.inv.classList.toggle( 'is-open', this.invOpen );

	}

	renderInventory() {

		const s = this.game.state;
		const rows = s.inventory.map( ( f ) => `<div class="gm-row has-cm"><span>${ FISH[ f.species ].name }${ f.record ? '<small>纪录</small>' : '' }</span><span class="gm-cm">${ f.cm ?? Math.round( fishLengthCm( f.species, f.kg ) ) } cm</span><span class="gm-kg">${ f.kg.toFixed( 2 ) } kg</span><span class="gm-val">$${ f.value }</span><button class="gm-mini" data-release="${ f.id }">放生</button></div>` ).join( '' );
		const logged = Object.entries( s.log ).filter( ( [ k ] ) => FISH[ k ] ).map( ( [ k, v ] ) => `${ FISH[ k ].name }: 已捕获 ${ v.count } 条，最大 ${ v.bestKg.toFixed( 2 ) } kg · ${ v.bestCm ?? Math.round( fishLengthCm( k, v.bestKg ) ) } cm` ).join( '<br>' );
		this.inv.innerHTML = `
			<h2>${ s.upgrades.hold > 0 ? '鱼舱' : '保温箱' }</h2>
			<p class="gm-sub">共 ${ s.inventory.length } 条鱼 · 已装 ${ s.holdKg.toFixed( 1 ) } / ${ s.stats.holdKg } kg · 总价值 $${ s.holdValue }</p>
			<div class="gm-list">
				<div class="gm-order-offer">${ this.orderMarkup() }</div>
				${ this.journeyMarkup( true ) }
				${ this.storyJournalMarkup() }
				${ rows || '<div class="gm-empty">还没有渔获。去码头、海滩或船上抛竿吧。</div>' }
				${ logged ? `<div class="gm-log"><b>鱼类图鉴</b><br>${ logged }</div>` : '' }
			</div>
			<div class="gm-foot"><span class="gm-sub">去码头旁的鱼摊出售渔获</span><button class="gm-btn is-ghost" data-close>关闭 (I)</button></div>`;
		this.inv.querySelector( '[data-close]' ).onclick = () => this.toggleInventory( false );
		for ( const b of this.inv.querySelectorAll( '[data-release]' ) ) b.onclick = () => s.release( Number( b.dataset.release ) );

	}

	// ---- fish stand
	openStand( vendor ) {

		this.standOpen = true;
		this.boatView = false;
		this.vendor = vendor;
		this.toggleInventory( false );
		if ( vendor.kind === 'shop' ) this.renderShop();
		else this.renderStand();
		this.stand.classList.add( 'is-open' );
		releaseMouse();

	}

	closeStand() {

		this.standOpen = false;
		this.boatView = false;
		this.stand.classList.remove( 'gm-boats' );
		this.stand.classList.remove( 'is-open' );

	}

	renderStand() {

		const s = this.game.state;
		const v = this.vendor || { name: '鱼贩' };
		const order = s.currentOrder;
		const orderBox = `<div class="gm-order-offer">${ this.orderMarkup() }</div>`;
		const rows = s.inventory.map( ( f ) => {

			const matched = order && matchesOrder( order, f );
			return `<div class="gm-row has-cm ${ matched ? 'is-order-match' : '' }"><span>${ FISH[ f.species ].name }${ matched ? '<small>符合委托</small>' : '' }</span><span class="gm-cm">${ f.cm ?? Math.round( fishLengthCm( f.species, f.kg ) ) } cm</span><span class="gm-kg">${ f.kg.toFixed( 2 ) } kg</span><span class="gm-val">$${ f.value }</span><button class="gm-mini" data-sell="${ f.id }">出售</button></div>`;

		} ).join( '' );
		this.stand.innerHTML = `
			<h2>${ v.name }</h2>
			<p class="gm-sub">${ s.inventory.length ? v.greeting || '让我看看你钓到了什么。' : v.idle || '钓到鱼再来吧。' }</p>
			<div class="gm-list">${ this.storyDialogueMarkup( 'buyer' ) }${ orderBox }${ rows || '<div class="gm-empty">没有可出售的鱼。</div>' }${ this.journeyMarkup() }</div>
			<div class="gm-foot"><button class="gm-btn is-ghost" data-close>离开 (E)</button><button class="gm-btn" data-all ${ s.inventory.length ? '' : 'disabled' }>全部出售 · 鱼价 $${ s.holdValue }</button></div>`;
		this.stand.querySelector( '[data-close]' ).onclick = () => this.closeStand();
		this.stand.querySelector( '[data-all]' ).onclick = () => this.game.sellAll();
		for ( const b of this.stand.querySelectorAll( '[data-sell]' ) ) b.onclick = () => this.game.sell( [ Number( b.dataset.sell ) ] );
		this.bindStoryChoices();

	}

}

GameHUD.prototype.renderShop = function () {

	this.stand.classList?.toggle( 'gm-boats', !! this.boatView );
	if ( this.boatView ) return this.renderBoats();
	const s = this.game.state;
	const v = this.vendor;
	const rows = Object.entries( UPGRADES ).map( ( [ key, track ] ) => {

		const cur = track.levels[ s.upgrades[ key ] | 0 ];
		const next = nextLevel( s.upgrades, key );
		const btn = next
			? `<button class="gm-btn" data-buy="${ key }" ${ next.cost > s.money ? 'disabled' : '' }>$${ next.cost }</button>`
			: '<span class="gm-have">已升至最高级</span>';
		return `<div class="gm-shop-row"><span>${ track.name }: ${ next ? next.label : cur.label }<small>当前：${ cur.label }</small></span>${ btn }</div>`;

	} ).join( '' );
	const missing = s.stats.fuelL - s.fuelL;
	const litres = Math.min( missing, Math.floor( s.money / FUEL_PRICE ) );
	const full = missing <= 1e-3;
	const volume = litres < 0.01 ? '不足 0.01' : Number( litres.toFixed( 2 ) );
	const fuelLabel = full ? '已加满' : litres <= 0 ? '余额不足' : `${ litres >= missing ? '加满' : '加油' } ${ volume } 升 · $${ Math.ceil( litres * FUEL_PRICE ) }`;
	const fuelRow = `<div class="gm-shop-row"><span>柴油 · $${ FUEL_PRICE.toFixed( 2 ) } / 升<small>油箱：${ s.fuelL.toFixed( 1 ) } / ${ s.stats.fuelL } 升</small></span><button class="gm-btn" data-fuel ${ full || litres <= 0 ? 'disabled' : '' }>${ fuelLabel }</button></div>`;
	const boatSection = `<div class="gm-shop-row"><span>船只选择<small>当前：${ BOATS[ s.boatId ].name } · 两种船型均可免费使用</small></span><button class="gm-btn" data-boats>查看船只</button></div>`;
	this.stand.innerHTML = `
		<h2>${ v.name }</h2>
		<p class="gm-sub">${ v.greeting } · 你有 $${ s.money.toLocaleString() }</p>
		<div class="gm-list">${ this.storyDialogueMarkup( 'shop' ) }${ boatSection }${ fuelRow }${ rows }</div>
		<div class="gm-foot"><span class="gm-sub">升级购买后立即生效</span><button class="gm-btn is-ghost" data-close>离开 (E)</button></div>`;
	this.stand.querySelector( '[data-close]' ).onclick = () => this.closeStand();
	for ( const b of this.stand.querySelectorAll( '[data-buy]' ) ) b.onclick = () => this.game.buy( b.dataset.buy );
	const boatButton = this.stand.querySelector( '[data-boats]' );
	if ( boatButton ) boatButton.onclick = () => { this.boatView = true; this.renderShop(); this.stand.querySelector( '[data-shop]' ).focus(); };
	const f = this.stand.querySelector( '[data-fuel]' );
	if ( f ) f.onclick = () => this.game.refuel();
	this.bindStoryChoices();

};

GameHUD.prototype.renderBoats = function () {

	const currentId = this.game.state.boatId;
	const base = ( import.meta.env && import.meta.env.BASE_URL ) || '/';
	const cards = Object.values( BOATS ).map( ( boat ) => {

		const current = boat.id === currentId;
		return `<article class="gm-boat-card ${ current ? 'is-current' : '' }">
			<img class="gm-boat-image" src="${ base }images/boats/${ boat.id }.png" alt="${ boat.name }外观" width="640" height="360">
			<div class="gm-boat-info"><h3>${ boat.name }</h3>
			<div class="gm-boat-size">船长 ${ boat.length.toFixed( 1 ) } 米 · 船宽 ${ boat.beam.toFixed( 1 ) } 米</div>
			<p>${ boat.description }</p>
			<button class="gm-btn" data-boat="${ boat.id }" aria-label="${ current ? '当前船只：' : '免费换船并重新载入：' }${ boat.name }" ${ current ? 'disabled' : '' }>${ current ? '当前船只' : '免费换船 · 重新载入' }</button></div>
		</article>`;

	} ).join( '' );
	this.stand.innerHTML = `<h2>船只选择</h2><p class="gm-sub">玛尔塔 · 选一艘船出海</p>
		<div class="gm-list"><p class="gm-sub">换船后返回港口并重新载入。渔获、资金和进度保留，两艘船共用升级、鱼舱、油箱及剩余燃油。</p>
		<div class="gm-boat-grid">${ cards }</div></div>
		<div class="gm-foot"><button class="gm-btn is-ghost" data-shop>返回船具店</button><button class="gm-btn is-ghost" data-close>离开 (E)</button></div>`;
	this.stand.querySelector( '[data-shop]' ).onclick = () => { this.boatView = false; this.renderShop(); this.stand.querySelector( '[data-boats]' ).focus(); };
	this.stand.querySelector( '[data-close]' ).onclick = () => this.closeStand();
	for ( const button of this.stand.querySelectorAll( '[data-boat]' ) ) button.onclick = () => this.game.selectBoat( button.dataset.boat );

};

function releaseMouse() {

	try {

		if ( document.pointerLockElement && document.exitPointerLock ) document.exitPointerLock();

	} catch ( e ) { /* ignore */ }

}
