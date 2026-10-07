// Weather is generated locally: a steady stereo rain bed and short, low rolling thunder.
// The caller supplies SoundScape.above, so volume, mute, underwater filtering and limiter remain shared.
const bounded = ( value, fallback, max = 1 ) => Number.isFinite( value ) ? Math.min( max, Math.max( 0, value ) ) : fallback;

function noiseBuffer( context, seconds, brown = false ) {

	const count = Math.ceil( seconds * context.sampleRate );
	const buffer = context.createBuffer( 2, count, context.sampleRate );
	let seed = brown ? 0x714bee31 : 0x32bd890f;
	for ( let channel = 0; channel < 2; channel ++ ) {

		const data = buffer.getChannelData( channel );
		let low = 0;
		for ( let i = 0; i < count; i ++ ) {

			seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
			const white = ( seed >>> 0 ) / 2147483648 - 1;
			low = ( low + 0.02 * white ) / 1.02;
			data[ i ] = brown ? 3.5 * low + white * 0.035 : white;

		}
		if ( ! brown ) {

			// Overlap the loop's tail with its beginning at constant power. Playback wraps
			// to 50 ms, immediately after this overlap, without a silent dip or a hard seam.
			const overlap = Math.round( context.sampleRate * 0.05 );
			for ( let i = 0; i < overlap; i ++ ) {

				const angle = i / ( overlap - 1 ) * Math.PI / 2;
				data[ count - overlap + i ] = data[ count - overlap + i ] * Math.cos( angle ) + data[ i ] * Math.sin( angle );

			}

		}

	}
	return buffer;

}

export class WeatherAudio {

	constructor( context, destination ) {

		this.context = context;
		this.state = { rain: 0, sheltered: 0, underwater: false };
		this.rain = null;
		this.thunderBuffer = null;
		this.voices = [];
		this.disposed = false;
		this.output = context.createGain();
		this.output.gain.value = 0;
		this.output.connect( destination );
		this.document = globalThis.document;
		this._onVisibility = () => this._sync();
		this.document?.addEventListener( 'visibilitychange', this._onVisibility );
		context.addEventListener( 'statechange', this._onVisibility );
		this._sync();

	}

	get audible() {

		return ! this.disposed && this.context.state === 'running' && ! this.document?.hidden;

	}

	setWeather( { rain = 0, sheltered = 0, underwater = false } = {} ) {

		if ( this.disposed ) return;
		this.state = { rain: bounded( rain, 0 ), sheltered: bounded( sheltered, 0 ), underwater: !! underwater };
		this._sync();

	}

	_ramp( parameter, value, tau = 0.2 ) {

		if ( parameter._weatherTarget !== undefined && Math.abs( parameter._weatherTarget - value ) < 0.0001 ) return;
		parameter._weatherTarget = value;
		parameter.setTargetAtTime( value, this.context.currentTime, tau );

	}

	_sync() {

		if ( this.disposed ) return;
		const { rain, sheltered, underwater } = this.state;
		this._ramp( this.output.gain, this.audible ? 1 : 0, 0.025 );
		if ( ! this.audible || rain === 0 ) this.clearThunder( this.context.state !== 'running' );
		if ( rain > 0 && ! this.rain && this.audible ) this._startRain();
		if ( ! this.rain ) return;
		this._ramp( this.rain.gain.gain, 0.14 * rain ** 0.85 * ( 1 - 0.75 * sheltered ) * ( underwater ? 0.2 : 1 ), 0.25 );
		const cutoff = underwater ? 700 : 8200 - 5600 * sheltered;
		this._ramp( this.rain.lowpass.frequency, Math.min( cutoff, this.context.sampleRate * 0.45 ), 0.18 );

	}

	_startRain() {

		const c = this.context, src = c.createBufferSource(), highpass = c.createBiquadFilter(), lowpass = c.createBiquadFilter(), gain = c.createGain();
		src.buffer = noiseBuffer( c, 4 );
		src.loop = true;
		src.loopStart = 0.05;
		src.loopEnd = src.buffer.duration;
		highpass.type = 'highpass';
		highpass.frequency.value = 650;
		highpass.Q.value = 0.6;
		lowpass.type = 'lowpass';
		lowpass.frequency.value = Math.min( 8200, c.sampleRate * 0.45 );
		lowpass.Q.value = 0.5;
		gain.gain.value = 0;
		src.connect( highpass ).connect( lowpass ).connect( gain ).connect( this.output );
		src.start( c.currentTime, src.loopStart );
		this.rain = { src, highpass, lowpass, gain };

	}

	// Called after the visual scheduler's distance / 343 delay; no timers or queued bursts here.
	thunder( { strength = 1, distance = 800 } = {} ) {

		const power = bounded( strength, 1 ), metres = bounded( distance, 800, 20000 );
		if ( ! this.audible || this.state.rain <= 0 || power <= 0 || this.voices.length >= 2 ) return false;
		const c = this.context, now = c.currentTime;
		this.thunderBuffer ||= noiseBuffer( c, 12, true );
		const src = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain();
		src.buffer = this.thunderBuffer;
		src.playbackRate.value = 0.88 + Math.random() * 0.14;
		filter.type = 'lowpass';
		filter.frequency.value = Math.max( 180, 1800 / ( 1 + metres / 600 ) );
		filter.Q.value = 0.5;
		const duration = 7.5 + Math.min( 1.5, metres / 2000 );
		const peak = 0.7 * power / ( 1 + metres / 1200 ) * ( 1 - 0.35 * this.state.sheltered );
		gain.gain.value = 0;
		for ( const [ phase, amount ] of [ [ 0, 0 ], [ 0.005, 0.3 ], [ 0.025, 1 ], [ 0.1, 0.42 ], [ 0.22, 0.68 ], [ 0.38, 0.24 ], [ 0.54, 0.36 ], [ 0.82, 0.07 ], [ 1, 0 ] ] ) {

			gain.gain.linearRampToValueAtTime( peak * amount, now + phase * duration );

		}
		filter.frequency.setTargetAtTime( 160, now + duration * 0.3, duration * 0.35 );
		src.connect( filter ).connect( gain ).connect( this.output );
		const voice = { src, filter, gain, stopping: false };
		this.voices.push( voice );
		src.onended = () => {

			const i = this.voices.indexOf( voice );
			if ( i >= 0 ) this.voices.splice( i, 1 );
			for ( const node of [ src, filter, gain ] ) node.disconnect();

		};
		src.start( now, Math.random() * 0.6 );
		src.stop( now + duration + 0.05 );
		return true;

	}

	clearThunder( immediate = false ) {

		const now = this.context.currentTime;
		for ( const voice of this.voices ) {

			if ( voice.stopping && ! immediate ) continue;
			voice.stopping = true;
			const parameter = voice.gain.gain;
			if ( parameter.cancelAndHoldAtTime ) parameter.cancelAndHoldAtTime( now );
			else { parameter.cancelScheduledValues( now ); parameter.setValueAtTime( parameter.value, now ); }
			parameter.linearRampToValueAtTime( 0, now + ( immediate ? 0 : 0.05 ) );
			try { voice.src.stop( now + ( immediate ? 0 : 0.06 ) ); } catch ( e ) { /* already ended */ }

		}

	}

	dispose() {

		if ( this.disposed ) return;
		this.disposed = true;
		this.document?.removeEventListener( 'visibilitychange', this._onVisibility );
		this.context.removeEventListener( 'statechange', this._onVisibility );
		for ( const voice of [ ...this.voices, ...( this.rain ? [ this.rain ] : [] ) ] ) {

			voice.src.onended = null;
			try { voice.src.stop(); } catch ( e ) { /* already ended */ }
			for ( const node of Object.values( voice ) ) if ( node && typeof node.disconnect === 'function' ) node.disconnect();

		}
		this.voices.length = 0;
		this.rain = this.thunderBuffer = null;
		this.output.disconnect();

	}

}
