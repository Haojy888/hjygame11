// CPU seakeeping regression. The real controller receives a travelling, directional
// JONSWAP wave superposition through the same delayed {height,nx,nz,floor} contract.
// This is a reproducible stress sea derived from game presets, not a GPU FFT replay.
import assert from 'node:assert/strict';
import { Vector3 } from '../src/engine/index.js';
import { BoatController } from '../src/player/BoatController.js';
import { BoatModel } from '../src/world/BoatModel.js';
import { OffshoreBoatModel } from '../src/world/OffshoreBoatModel.js';
import { Colliders } from '../src/world/Colliders.js';

const G = 9.81, TAU = Math.PI * 2, DEG = 180 / Math.PI;
const full = process.argv.includes( '--full' );
// src/ui/AppUI.js SEA. Shore surf is amplitude (H/2), independent of offshore FFT energy.
const seas = [
	{ name: 'Breezy', wind: 7, fetch: 120, swell: 0.48 },
	{ name: 'Choppy', wind: 12, fetch: 300, swell: 0.68 },
	{ name: 'Storm', wind: 20, fetch: 900, swell: 1.0 },
];
const headings = [ [ 'head', - Math.PI / 2 ], [ 'beam', 0 ], [ 'quarter', - Math.PI / 4 ] ];

function waveSystem( wind, fetchKm, scale, angle, bins, fade, seed ) {

	// OceanFFT.updateSpectrumUniforms / jonswap / shortWavesFade (deep water).
	const peak = 22 * ( wind * fetchKm * 1000 / ( G * G ) ) ** - 0.33;
	const alpha = 0.076 * ( G * fetchKm * 1000 / ( wind * wind ) ) ** - 0.22;
	const low = Math.max( peak * 0.5, Math.sqrt( G * TAU / 733 ) );
	const high = peak * 6;
	const spectrum = ( omega ) => {

		const sigma = omega <= peak ? 0.07 : 0.09;
		const r = Math.exp( - ( ( omega - peak ) ** 2 ) / ( 2 * sigma * sigma * peak * peak ) );
		const k = omega * omega / G;
		return scale * alpha * G * G * omega ** - 5 * Math.exp( - 1.25 * ( peak / omega ) ** 4 ) * 3.3 ** r * Math.exp( - fade * fade * k * k );

	};
	const random = () => { seed = ( Math.imul( seed, 1664525 ) + 1013904223 ) >>> 0; return seed / 4294967296; };
	const waves = [];
	for ( let i = 0; i < bins; i ++ ) {

		const w0 = low * ( high / low ) ** ( i / bins ), w1 = low * ( high / low ) ** ( ( i + 1 ) / bins );
		let energy = 0, weightedOmega = 0;
		// Quadrature preserves the narrow enhanced peak even with a compact component count.
		for ( let j = 0; j < 24; j ++ ) {

			const omega = w0 + ( j + 0.5 ) * ( w1 - w0 ) / 24;
			const e = spectrum( omega ) * ( w1 - w0 ) / 24;
			energy += e; weightedOmega += omega * e;

		}
		const omega = weightedOmega / energy, k = omega * omega / G;
		const direction = angle + ( random() - 0.5 ) * 0.6;
		const kx = Math.cos( direction ) * k, kz = Math.sin( direction ) * k;
		waves.push( { omega, kx, kz, amplitude: Math.sqrt( 2 * energy ), phase: random() * TAU,
			cx: ( Math.cos( kx * 0.35 ) - 1 ) / 0.35, sx: - Math.sin( kx * 0.35 ) / 0.35,
			cz: ( Math.cos( kz * 0.35 ) - 1 ) / 0.35, sz: - Math.sin( kz * 0.35 ) / 0.35 } );

	}
	return { waves, period: TAU / peak };

}

function makeSea( preset, angle ) {

	const local = waveSystem( preset.wind, preset.fetch, 1, angle, 18, 0.01, 1337 );
	const swell = waveSystem( 6, 1200, preset.swell, angle - Math.PI / 9, 12, 0.1, 7019 );
	const waves = [ ...local.waves, ...swell.waves ];
	return waterField( waves, local.period );

}

function resonanceSea( period ) {

	// A 0.9m-height short beam sea brackets the large hull's ~2.92s natural roll period,
	// crossing a 1.5m-height, 11.59s swell. The amplitudes below are H/2, not wave heights.
	const waves = [ [ 0.45, period, 0, 0.7 ], [ 0.75, 11.59, 0.2, 1.1 ] ].map( ( [ amplitude, seconds, direction, phase ] ) => {

		const omega = TAU / seconds, k = omega * omega / G;
		const kx = Math.cos( direction ) * k, kz = Math.sin( direction ) * k;
		return { amplitude, omega, kx, kz, phase,
			cx: ( Math.cos( kx * 0.35 ) - 1 ) / 0.35, sx: - Math.sin( kx * 0.35 ) / 0.35,
			cz: ( Math.cos( kz * 0.35 ) - 1 ) / 0.35, sz: - Math.sin( kz * 0.35 ) / 0.35 };

	} );
	return waterField( waves, period );

}

function waterField( waves, period ) {

	return {
		// Significant wave height Hs=4*sqrt(variance); sinusoid amplitude is half its wave height.
		height: 4 * Math.sqrt( waves.reduce( ( sum, w ) => sum + w.amplitude * w.amplitude / 2, 0 ) ),
		period,
		sample( x, z, time, out, index ) {

			let height = 0, gx = 0, gz = 0;
			// Ease in wave energy over 20s, avoiding an artificial spawn-time water teleport.
			const ramp = Math.min( 1, time / 20 );
			for ( const w of waves ) {

				const phase = w.kx * x + w.kz * z - w.omega * time + w.phase;
				const c = Math.cos( phase ) * w.amplitude * ramp, s = Math.sin( phase ) * w.amplitude * ramp;
				height += c;
				// Exact 0.35m forward differences, matching WaterQuery's GPU normal calculation.
				gx += c * w.cx + s * w.sx;
				gz += c * w.cz + s * w.sz;

			}
			const length = Math.hypot( gx, 1, gz );
			out[ index ] = height; out[ index + 1 ] = - gx / length; out[ index + 2 ] = - gz / length;
			out[ index + 3 ] = - 500; // Sea floor, NOT vertical velocity: controller derives that from time / gradients.

		},
	};

}

function makeQuery( sea ) {

	return {
		count: 1, cpuValid: false, version: 0, resultTime: 0, latency: 0.05, pending: null, issued: 0,
		points: new Float32Array( 256 ), cpu: new Float32Array( 256 ), resultInputs: new Float32Array( 256 ),
		allocate( name, count ) { const start = this.count; this.count += count; return start; },
		setPoint( slot, x, z ) { this.points[ slot * 4 ] = x; this.points[ slot * 4 + 1 ] = z; },
		update( frame, time ) {

			if ( this.pending && frame >= this.pending.ready ) {

				const p = this.pending;
				this.cpu.set( p.values ); this.resultInputs.set( p.points ); this.resultTime = p.time;
				this.latency += ( Math.min( time - p.time, 0.25 ) - this.latency ) * 0.2;
				this.cpuValid = true; this.version ++; this.pending = null;

			}
			if ( ! this.pending ) {

				const values = new Float32Array( this.count * 4 ), points = this.points.slice( 0, this.count * 4 );
				for ( let i = 0; i < this.count; i ++ ) sea.sample( points[ i * 4 ], points[ i * 4 + 1 ], time, values, i * 4 );
				this.pending = { values, points, time, ready: frame + 1 + this.issued ++ % 3 };

			}

		},
	};

}

const models = [ new BoatModel(), new OffshoreBoatModel() ];
const terrain = { heightAt: () => - 500 }, colliders = new Colliders();
const records = [], side = new Vector3(), forward = new Vector3(), up = new Vector3();
const resonance = [ 2.5, 3, 3.5, 4 ].map( ( period ) => ( { name: `Resonance ${ period }s`, period } ) );
for ( const preset of [ ...seas, ...resonance ] ) for ( const [ heading, angle ] of headings ) for ( const mode of [ 'drift', 'cruise', 'turn' ] ) for ( const model of models ) {

	if ( ! full && ( preset.name === 'Storm' || model.profileId === 'coastal' && ( preset.name !== 'Breezy' || mode !== 'cruise' ) ) ) continue;
	if ( preset.period && ( heading !== 'beam' || mode !== 'drift' || model.profileId !== 'offshore' ) ) continue;
	const sea = preset.period ? resonanceSea( preset.period ) : makeSea( preset, angle ), query = makeQuery( sea );
	const boat = new BoatController( { model, query, terrain, colliders } );
	boat.position.set( 200, 0, 200 ); boat.moored = false; boat.driven = mode !== 'drift';
	const record = { sea: preset.name, hull: model.profileId, heading, mode, hs: sea.height, period: sea.period,
		roll: 0, pitch: 0, minUp: 1, sumRoll2: 0, samples: 0, capsize: false, reset: false, finite: true, maxSpeed: 0 };
	// A silent safety reset must not count as surviving the sea.
	const reset = boat.reset.bind( boat );
	boat.reset = () => { record.reset = true; reset(); };
	let time = 0;
	const duration = full || preset.name === 'Choppy' && heading === 'quarter' && mode === 'drift' ? 180 : 60;
	for ( let frame = 0; time < duration; frame ++ ) {

		// A periodic slow frame also exercises the fixed physics step and delayed readback.
		const dt = frame % 180 === 179 ? 1 / 15 : preset.period ? 1 / 30 : 1 / 60;
		time += dt;
		const steer = mode === 'turn' && time > 40 ? Math.sin( ( time - 40 ) * TAU / 45 ) * 0.7 : 0;
		boat.setInput( mode === 'drift' ? 0 : 0.7, steer, dt );
		boat.queueQueries(); query.update( frame, time ); boat.update( dt );
		record.finite &&= boat.isFinite(); record.capsize ||= boat.capsized;
		up.set( 0, 1, 0 ).applyQuaternion( boat.quaternion );
		record.minUp = Math.min( record.minUp, up.y );
		if ( time < 20 ) continue;
		side.set( 1, 0, 0 ).applyQuaternion( boat.quaternion );
		forward.set( 0, 0, 1 ).applyQuaternion( boat.quaternion );
		// Signed heel about the current forward axis; atan2 also distinguishes an inverted hull.
		const roll = Math.atan2( side.y, up.y ) * DEG;
		const pitch = Math.asin( Math.max( - 1, Math.min( 1, forward.y ) ) ) * DEG;
		record.roll = Math.max( record.roll, Math.abs( roll ) ); record.pitch = Math.max( record.pitch, Math.abs( pitch ) );
		record.sumRoll2 += roll * roll; record.samples ++;
		record.maxSpeed = Math.max( record.maxSpeed, boat.speed );

	}
	record.rmsRoll = Math.sqrt( record.sumRoll2 / record.samples );
	delete record.sumRoll2; delete record.samples;
	records.push( record );

}

console.table( records.map( ( r ) => ( { sea: r.sea, hull: r.hull, heading: r.heading, mode: r.mode,
	Hs: r.hs.toFixed( 2 ), Tp: r.period.toFixed( 1 ), roll: r.roll.toFixed( 1 ), pitch: r.pitch.toFixed( 1 ), rmsRoll: r.rmsRoll.toFixed( 1 ), capsize: r.capsize, reset: r.reset } ) ) );
for ( const r of records ) {

	const label = [ r.sea, r.hull, r.heading, r.mode ].join( '/' );
	assert.ok( r.finite && ! r.reset, label + ': all states must remain finite without safety teleporting' );
	if ( r.hull === 'offshore' || r.sea === 'Breezy' && r.mode === 'cruise' ) {

		assert.ok( ! r.capsize, label + ': normal operation must remain stable in the tested sea' );
		assert.ok( r.minUp > 0, label + ': no brief inversion may hide inside the capsize debounce' );
		assert.ok( r.roll < ( r.sea === 'Storm' ? 60 : 45 ) && r.pitch < 30, label + ': roll/pitch must stay within the stress-sea operating envelope' );

	}

}
console.log( `Seakeeping passed: ${ records.length } scenarios; wind sea + swell, head/beam/quartering, drift/cruise/turn, asynchronous water results and slow frames. --full adds the three-minute matrix and extreme storm diagnostics.` );
