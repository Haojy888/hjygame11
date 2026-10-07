// Exercise real weather generation and SoundScape routing without a browser, fetches or speakers.
import assert from 'node:assert/strict';
import { SoundScape } from '../src/audio/SoundScape.js';

class Param {

	constructor( value = 0 ) { this.value = value; this.events = []; }
	setTargetAtTime( value, time, tau ) { this.value = value; this.events.push( [ 'target', value, time, tau ] ); }
	setValueAtTime( value, time ) { this.value = value; this.events.push( [ 'set', value, time ] ); }
	linearRampToValueAtTime( value, time ) { this.value = value; this.events.push( [ 'linear', value, time ] ); }
	cancelAndHoldAtTime( time ) { this.events.push( [ 'hold', this.value, time ] ); }
	cancelScheduledValues( time ) { this.events.push( [ 'cancel', this.value, time ] ); }

}

class Node {

	constructor( context, kind ) {

		this.context = context;
		this.kind = kind;
		this.connections = [];
		for ( const name of [ 'gain', 'frequency', 'Q', 'pan', 'threshold', 'knee', 'ratio', 'attack', 'release', 'playbackRate' ] ) this[ name ] = new Param();
		context.nodes.push( this );

	}
	connect( node ) { this.connections.push( node ); return node; }
	disconnect() { this.connections.length = 0; this.disconnected = true; }
	start( time = 0, offset = 0 ) { assert.equal( this.started, undefined ); this.started = time; this.offset = offset; }
	stop( time = this.context.currentTime ) { this.stopAt = time; }

}

class Context extends EventTarget {

	constructor() {

		super();
		this.currentTime = 5;
		this.sampleRate = 12000;
		this.state = 'running';
		this.nodes = [];
		this.buffers = [];
		this.destination = new Node( this, 'destination' );

	}
	createGain() { return new Node( this, 'gain' ); }
	createBiquadFilter() { return new Node( this, 'filter' ); }
	createPanner() { return new Node( this, 'panner' ); }
	createDynamicsCompressor() { return new Node( this, 'limiter' ); }
	createBufferSource() { return new Node( this, 'source' ); }
	createBuffer( channels, length, sampleRate ) {

		const data = Array.from( { length: channels }, () => new Float32Array( length ) );
		const buffer = { duration: length / sampleRate, sampleRate, numberOfChannels: channels, length, getChannelData: channel => data[ channel ] };
		this.buffers.push( buffer );
		return buffer;

	}
	advance( seconds ) {

		this.currentTime += seconds;
		for ( const node of this.nodes ) if ( node.kind === 'source' && ! node.ended && node.stopAt <= this.currentTime ) {

			node.ended = true;
			node.onended?.();

		}

	}
	setState( state ) { this.state = state; this.dispatchEvent( new Event( 'statechange' ) ); }
	async resume() { this.setState( 'running' ); }
	async close() { this.setState( 'closed' ); }

}

const oldContext = globalThis.AudioContext, oldDocument = globalThis.document;
const doc = new EventTarget();
doc.hidden = false;
globalThis.AudioContext = Context;
globalThis.document = doc;
const audio = new SoundScape();
audio._want = () => null; // Existing recorded ambience is outside this weather synthesis test.
try {

	assert.equal( audio.ctx, null, 'construction does not bypass browser audio gesture requirements' );
	audio.setWeather( { rain: 0.8 } );
	assert.equal( audio.ctx, null, 'weather settings do not create an AudioContext before the gesture' );
	assert.equal( audio.thunder( { strength: 1 } ), false, 'thunder before resume is dropped, not queued' );
	assert.equal( await audio.resume(), true );
	const c = audio.ctx, weather = audio.weatherAudio, rain = weather.rain;
	assert.ok( rain, 'the saved rain setting starts after user audio resume' );
	assert.ok( weather.output.connections.includes( audio.above ), 'weather follows the existing underwater/above-water bus' );
	assert.ok( audio.aboveOut.connections.includes( audio.master ) && audio.master.connections.includes( audio.limiter ) );
	assert.equal( rain.src.loop, true );
	assert.equal( rain.src.loopStart, 0.05 );
	assert.equal( rain.src.offset, rain.src.loopStart );
	assert.equal( rain.src.loopEnd, rain.src.buffer.duration );
	const channel = rain.src.buffer.getChannelData( 0 ), overlap = Math.round( c.sampleRate * 0.05 );
	assert.equal( channel.at( - 1 ), channel[ overlap - 1 ], 'the overlap joins the exact sample before the loop restart' );
	assert.ok( channel.every( Number.isFinite ) );
	assert.notDeepEqual( channel, rain.src.buffer.getChannelData( 1 ), 'rain is stereo, not duplicate mono hiss' );
	const nodes = c.nodes.length, events = rain.gain.gain.events.length;
	for ( let frame = 0; frame < 600; frame ++ ) audio.setWeather( { rain: 0.8 } );
	assert.equal( c.nodes.length, nodes, 'per-frame weather updates reuse the existing audio nodes' );
	assert.equal( rain.gain.gain.events.length, events, 'unchanged rain does not grow the automation timeline' );
	const openLevel = rain.gain.gain.value;
	audio.setWeather( { rain: 0.8, sheltered: 1 } );
	assert.ok( rain.gain.gain.value < openLevel / 2, 'the cabin attenuates direct rain' );
	assert.equal( rain.lowpass.frequency.value, 2600 );
	audio.setWeather( { rain: 0.8, sheltered: 1, underwater: true } );
	assert.equal( rain.lowpass.frequency.value, 700 );
	assert.ok( rain.gain.gain.value < openLevel / 10, 'submerged rain is quieter as well as filtered' );
	audio.setWeather( { rain: 1 } );
	assert.equal( audio.thunder( { strength: 0, distance: 200 } ), false );
	assert.equal( audio.thunder( { strength: 1, distance: 200 } ), true );
	assert.equal( audio.thunder( { strength: 1, distance: 2000 } ), true );
	const [ close, far ] = weather.voices;
	const peak = voice => Math.max( ...voice.gain.gain.events.filter( e => e[ 0 ] === 'linear' ).map( e => e[ 1 ] ) );
	assert.ok( peak( far ) < peak( close ), 'distant thunder is softer' );
	assert.ok( far.filter.frequency.events.at( - 1 )[ 1 ] <= close.filter.frequency.events.at( - 1 )[ 1 ] );
	const occupiedNodes = c.nodes.length;
	assert.equal( audio.thunder(), false, 'the third thunder is dropped while two voices are playing' );
	assert.equal( c.nodes.length, occupiedNodes, 'polyphony limit does not allocate an inaudible third voice' );
	const rumble = weather.thunderBuffer.getChannelData( 0 );
	const changes = data => {

		let sum = 0;
		for ( let i = 1; i < 10000; i ++ ) sum += ( data[ i ] - data[ i - 1 ] ) ** 2;
		return Math.sqrt( sum / 9999 );

	};
	assert.ok( changes( rumble ) < changes( channel ) * 0.2, 'the thunder source contains low rolling energy distinct from rain' );
	assert.ok( rumble.every( Number.isFinite ) );
	audio.clearThunder();
	assert.ok( weather.voices.every( v => v.stopping && v.src.stopAt <= c.currentTime + 0.061 ) );
	c.advance( 0.1 );
	assert.equal( weather.voices.length, 0 );
	assert.ok( close.src.disconnected && close.filter.disconnected && close.gain.disconnected, 'stopped thunder releases all voice nodes' );
	assert.equal( audio.thunder(), true );
	audio.setMuted( true );
	assert.equal( audio.master.gain.value, 0, 'mute uses the shared master for rain and thunder' );
	assert.equal( audio.thunder(), false );
	c.advance( 0.1 );
	assert.equal( weather.voices.length, 0, 'muting cancels thunder instead of replaying it on unmute' );
	audio.setMuted( false );
	audio.setMasterVolume( 0.25 );
	assert.equal( audio.master.gain.value, 0.0625 );
	audio.setMasterVolume( 0 );
	assert.equal( audio.thunder(), false );
	audio.setMasterVolume( 0.8 );
	assert.equal( audio.thunder(), true );
	doc.hidden = true;
	doc.dispatchEvent( new Event( 'visibilitychange' ) );
	assert.equal( weather.output.gain.value, 0, 'the weather bus becomes silent in a hidden tab' );
	assert.equal( audio.thunder(), false );
	c.advance( 0.1 );
	doc.hidden = false;
	doc.dispatchEvent( new Event( 'visibilitychange' ) );
	assert.equal( weather.output.gain.value, 1 );
	assert.equal( weather.voices.length, 0, 'returning to the tab does not replay old thunder' );
	assert.equal( weather.rain, rain, 'rain resumes from the same continuous bed' );
	assert.equal( audio.thunder(), true );
	c.setState( 'suspended' );
	assert.ok( weather.voices.every( v => v.src.stopAt === c.currentTime ), 'suspending a context cannot preserve a thunder tail for later replay' );
	c.advance( 0 );
	assert.equal( audio.thunder(), false );
	assert.equal( weather.output.gain.value, 0 );
	c.setState( 'running' );
	assert.equal( audio.thunder(), true );
	audio.setWeather( { rain: 0 } );
	assert.equal( rain.gain.gain.value, 0 );
	assert.equal( audio.thunder(), false, 'turning weather off rejects delayed thunder callbacks' );
	c.advance( 0.1 );
	assert.equal( weather.voices.length, 0 );
	audio.setWeather( { rain: NaN, sheltered: Infinity } );
	assert.deepEqual( weather.state, { rain: 0, sheltered: 0, underwater: false } );
	audio.setWeather( { rain: 9, sheltered: - 2 } );
	assert.equal( weather.state.rain, 1 );
	assert.equal( weather.state.sheltered, 0 );
	assert.equal( c.buffers.length, 2, 'noise buffers are cached across weather toggles and thunder events' );
	audio.dispose();
	assert.equal( weather.disposed, true );
	assert.equal( rain.src.disconnected, true );
	assert.equal( weather.output.disconnected, true );
	assert.equal( weather.voices.length, 0 );
	assert.equal( c.state, 'closed' );
	doc.hidden = true;
	doc.dispatchEvent( new Event( 'visibilitychange' ) );
	assert.equal( audio.thunder(), false );
	assert.equal( audio.weatherAudio, null );
	assert.equal( await audio.resume(), false, 'disposed audio cannot recreate weather resources' );

} finally {

	audio.dispose();
	if ( oldContext === undefined ) delete globalThis.AudioContext;
	else globalThis.AudioContext = oldContext;
	if ( oldDocument === undefined ) delete globalThis.document;
	else globalThis.document = oldDocument;

}
console.log( 'Weather audio passed: gesture gating, shared mix, continuous stereo rain, rumble, limits, fades, visibility and cleanup.' );
