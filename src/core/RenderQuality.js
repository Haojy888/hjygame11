export const QUALITY_PRESETS = {
	balanced: { label: '自动平衡', adaptive: true, scale: 1, min: 0.65, max: 1 },
	smooth: { label: '优先流畅', adaptive: true, scale: 0.8, min: 0.5, max: 0.85 },
	native: { label: '原生清晰', adaptive: false, scale: 1, min: 1, max: 1 },
	manual: { label: '手动', adaptive: false, scale: 1, min: 0.5, max: 1 },
};
const SAVE_KEY = 'tidewater.graphics.v1';

export function renderScale( value ) {

	return Number.isFinite( value ) ? Math.max( 0.5, Math.min( 1, Math.round( value * 20 ) / 20 ) ) : 1;

}

export function normalizeGraphics( value ) {

	const preset = Object.hasOwn( QUALITY_PRESETS, value?.preset ) ? value.preset : 'balanced';
	return { preset, targetFPS: value?.targetFPS === 30 ? 30 : 60,
		renderScale: preset === 'manual' ? renderScale( value?.renderScale ) : QUALITY_PRESETS[ preset ].scale };

}

function safeStorage() {

	try { return globalThis.localStorage; } catch { return null; }

}

export function loadGraphics( storage = safeStorage() ) {

	try { return normalizeGraphics( JSON.parse( storage?.getItem( SAVE_KEY ) || 'null' ) ); } catch { return normalizeGraphics( null ); }

}

export function saveGraphics( value, storage = safeStorage() ) {

	try { storage?.setItem( SAVE_KEY, JSON.stringify( normalizeGraphics( value ) ) ); } catch { /* Keep playing when settings storage is blocked. */ }

}

// A one-second frame-time window, two slow windows to lower, eight good ones to recover.
// Two settling seconds after each change keep target allocation and TAA resets infrequent.
// ponytail: frame pacing includes CPU and display limits; use GPU timestamps for a separate GPU budget if needed.
export class AdaptiveResolution {

	constructor() { this.reset(); }
	reset() { this.settle = 2; this.time = 0; this.frames = 0; this.slow = 0; this.fast = 0; }

	update( dt, scale, targetFPS, min, max ) {

		if ( ! Number.isFinite( dt ) || dt <= 0 || dt > 0.5 ) { this.reset(); return scale; }
		if ( this.settle > 0 ) { this.settle -= dt; return scale; }
		this.time += dt; this.frames ++;
		if ( this.time < 1 ) return scale;
		const fps = this.frames / this.time, elapsed = this.time;
		this.time = 0; this.frames = 0;
		this.slow = fps < targetFPS * 0.84 ? this.slow + elapsed : 0;
		this.fast = fps >= targetFPS * 0.96 ? this.fast + elapsed : 0;
		let next = scale;
		if ( this.slow >= 2 ) next = renderScale( Math.max( min, scale - ( fps < targetFPS * 0.6 ? 0.1 : 0.05 ) ) );
		else if ( this.fast >= 8 ) next = renderScale( Math.min( max, scale + 0.05 ) );
		if ( next !== scale ) this.reset();
		return next;

	}

}
