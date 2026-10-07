import { Vector3 } from '../engine/math/index.js';

const clamp = ( v, lo, hi ) => Math.max( lo, Math.min( hi, v ) );
const approach = ( value, target, dt ) => {

	const next = value + ( target - value ) * ( 1 - Math.exp( - dt * 1.2 ) );
	return Math.abs( next - target ) < 0.001 ? target : next;

};

// Weather timing is simulation time: returning from another tab never catches up missed strikes.
export class Weather {

	constructor( { sky, clouds = null, haze = null, environment = null, terrain = null,
		rainFx = null, lightning = null, audio = null, random = Math.random } ) {

		Object.assign( this, { sky, clouds, haze, environment, terrain, rainFx, lightning, audio, random } );
		this.rain = false;
		this.thunderstorm = false;
		this.rainIntensity = 0;
		this.overcast = 0;
		this.flash = 0;
		this._cloudCoverage = clouds?.coverage.value ?? 0.49;
		this._haze = haze?.density.value ?? 1;
		this._pendingThunder = [];
		this._strikeIn = 2;
		this._flashAge = Infinity;
		this._active = true;
		this._direction = new Vector3();

	}

	setRain( on ) {

		this.rain = !! on;
		if ( ! this.rain ) { this.thunderstorm = false; this._clearLightning(); }
		this._applyClouds();

	}

	setThunderstorm( on ) {

		this.thunderstorm = !! on;
		if ( this.thunderstorm ) { this.rain = true; this._strikeIn = 2; }
		else this._clearLightning();
		this._applyClouds();

	}

	setCloudCoverage( value ) {

		this._cloudCoverage = clamp( value, 0, 1 );
		this._applyClouds();

	}

	setHaze( value ) {

		this._haze = clamp( value, 0, 4 );
		this._applyHaze();

	}

	_applyClouds() {

		// Changing coverage invalidates the cloud renderer's history. Change once per user action,
		// and fade the weather lighting independently instead of rebuilding clouds every frame.
		if ( this.clouds ) this.clouds.coverage.value = this.rain
			? Math.max( this._cloudCoverage, this.thunderstorm ? 0.96 : 0.82 ) : this._cloudCoverage;
		if ( this.environment ) this.environment.timer = 0;

	}

	_applyHaze() {

		if ( this.haze ) this.haze.density.value = this._haze + Math.max( 0, 3.5 - this._haze ) * this.overcast;

	}

	_clearLightning() {

		this.flash = 0;
		this._flashAge = Infinity;
		this._pendingThunder.length = 0;
		this.sky.lightningFlash.value = 0;
		this.lightning?.clear();
		this.audio?.clearThunder();

	}

	update( dt, camera, { active = true } = {} ) {

		dt = Number.isFinite( dt ) ? clamp( dt, 0, 0.1 ) : 0;
		if ( ! active ) {

			if ( this._active ) this._clearLightning();
			this._active = false;
			this._strikeIn = Math.max( 2, this._strikeIn );
			return;

		}
		this._active = true;
		this.rainIntensity = approach( this.rainIntensity, this.rain ? ( this.thunderstorm ? 1 : 0.58 ) : 0, dt );
		this.overcast = approach( this.overcast, this.rain ? ( this.thunderstorm ? 1 : 0.65 ) : 0, dt );
		this.sky.overcast.value = this.overcast;
		this._applyHaze();

		for ( let i = this._pendingThunder.length - 1; i >= 0; i -- ) {

			const event = this._pendingThunder[ i ];
			event.delay -= dt;
			if ( event.delay <= 0 ) {

				this.audio?.thunder( { strength: 0.8, distance: event.distance } );
				this._pendingThunder.splice( i, 1 );

			}

		}
		this._flashAge += dt;
		if ( this.thunderstorm ) {

			this._strikeIn -= dt;
			if ( this._strikeIn <= 0 ) {

				this._strike( camera );
				this._strikeIn = 8 + this.random() * 8;

			}

		}
		// One smooth, brief flash, rather than a sequence of rapid full-screen strobes.
		const age = this._flashAge;
		if ( this.flash > 0 && age >= 0.48 ) this.lightning?.clear();
		this.flash = age < 0.48 ? Math.sin( Math.PI * clamp( age / 0.48, 0, 1 ) ) ** 2 : 0;
		this.sky.lightningFlash.value = this.flash;

	}

	_strike( camera ) {

		camera.getWorldDirection( this._direction );
		const heading = Math.atan2( this._direction.x, this._direction.z );
		// Prefer a strike in view, but only place it over open water.
		for ( let i = 0; i < 12; i ++ ) {

			const angle = heading + ( this.random() - 0.5 ) * ( i < 6 ? 1.15 : Math.PI * 2 );
			const distance = 450 + this.random() * 450;
			const position = new Vector3( camera.position.x + Math.sin( angle ) * distance, 0.3,
				camera.position.z + Math.cos( angle ) * distance );
			if ( this.terrain && this.terrain.heightAt( position.x, position.z ) >= - 1 ) continue;
			this.lightning?.strike( position, { height: 180 + this.random() * 100, seed: this.random() * 100000 } );
			this._flashAge = 0.035;
			this._pendingThunder.push( { delay: position.distanceTo( camera.position ) / 343, distance } );
			return;

		}

	}

	updateEffects( dt, camera, { windSpeed, windDirection, underwater = false, boat = null } ) {

		this.rainFx?.update( dt, camera, { intensity: this._active ? this.rainIntensity : 0,
			windSpeed, windDirection, underwater, boat, flash: this.flash } );
		this.lightning?.update( dt, camera, { intensity: underwater ? 0 : this.flash } );
		this.audio?.setWeather( { rain: this._active ? this.rainIntensity : 0,
			sheltered: this.rainFx?.sheltered ?? 0, underwater } );

	}

	// Only called after App has copied fresh atmosphere readback values into these handles.
	applyLighting( frame ) {

		frame.sunColor.value.multiplyScalar( 1 - this.overcast * 0.86 );
		frame.skyIrradiance.value.multiplyScalar( 1 - this.overcast * 0.38 );
		frame.horizonColor.value.multiplyScalar( 1 - this.overcast * 0.45 );
		// Environment intensity affects live material shading, never the source sky cube or clouds.
		frame.envIntensity.value = 1 + this.flash * 2;

	}

}
