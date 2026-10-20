import { G } from '../core/Globals.js';
import { subjectVisible } from './FieldCamera.js';
import { SECRET_SITES, NIGHT_TRAIL, advanceTide, secretNight, secretHint } from './Secrets.js';
import { SecretsWorld } from '../world/SecretsWorld.js';

export class SecretsController {

	constructor( game, world = null ) {

		this.game = game; this.world = world || new SecretsWorld( game.app );
		this.tide = Number.isFinite( G.seaLevel.value ) ? G.seaLevel.value : 0; this.stormAge = 0; this.wasStorm = false; this._state = game.state.secrets;

	}

	get conditions() { return { tide: this.tide, night: secretNight( this.game.hour ), storm: !! this.game.app.weather?.thunderstorm }; }
	available() {

		const g = this.game, a = g.app, ui = a.ui?.ui, input = a.input;
		return ! a.freeCam && ! g.worldMap?.open && ! ui?.helpOpen && ! ui?.panelOpen && ! ui?._photo && ! ui?._start && ! g.guide?.open
			&& ! g.hud?.invOpen && ! g.hud?.standOpen && ! g.hud?.catchOpen && ! g.fight && ! g.landing && ! g.rescueHold && ! g._cardDismissed
			&& ! a.boatCtl?.capsized && ! input.down?.( 'KeyX' ) && input.enabled !== false && input.focused !== false && ! input.interrupted;

	}

	// Called before player physics: water and the moving hatch share this frame's pose.
	prepare( dt ) {

		const step = Number.isFinite( dt ) ? Math.min( 0.1, Math.max( 0, dt ) ) : 0;
		const g = this.game, s = g.state.secrets, c = this.conditions;
		if ( this._state !== s ) { this._state = s; this.stormAge = 0; this.wasStorm = false; }
		this.tide = advanceTide( this.tide, g.hour, step ); G.seaLevel.value = this.tide;
		if ( c.storm ) {

			if ( ! this.wasStorm && s.stormCleared ) g.state.secretEvent( 'storm-start' );
			if ( this.available() ) this.stormAge += step;
			if ( this.stormAge >= 10 && ! s.stormSeen ) g.state.secretEvent( 'storm-seen' );

		} else {

			this.stormAge = 0;
			if ( s.stormSeen && ! s.stormCleared ) g.state.secretEvent( 'storm-clear' );

		}
		this.wasStorm = c.storm;
		this.world.update( step, { low: this.tide <= - 0.35, night: c.night, revealed: ! c.storm && s.stormCleared }, g.app.player, g.app.camera );

	}

	point( id ) {

		return id === 'night' ? this.world.trail[ Math.min( this.game.state.secrets.nightStep, NIGHT_TRAIL.length - 1 ) ] : this.world.points.get( id );

	}
	hint( id ) { return secretHint( id, this.game.state.secrets, this.conditions ); }

	update() {

		const g = this.game, a = g.app, s = g.state.secrets, c = this.conditions, p = a.player;
		if ( ! this.available() || g.rod.equipped || p.busy || p.climbing || ! [ 'walk', 'swim' ].includes( p.mode ) ) return;
		for ( const site of SECRET_SITES ) {

			const point = this.point( site.id );
			if ( p.position.distanceToSquared( point ) > 4 ** 2 || ! subjectVisible( a, point, 4, 0.5, p.position ) ) continue;
			const found = s.found.includes( site.id );
			const ready = site.id === 'tide' ? this.tide <= - 0.35 : site.id === 'night' ? c.night : ! c.storm && s.stormCleared && this.world.opening > 0.95;
			p.prompt = { key: found ? '已记录' : ready ? 'G' : '等待', text: found ? `${ site.keepsake } · I 查看见闻` : ready ? site.id === 'night' ? `读取发光石痕 ${ s.nightStep + 1 } / ${ NIGHT_TRAIL.length }` : `记录${ site.name } · ${ site.keepsake }` : this.hint( site.id ) };
			if ( ! found && ready && a.input.hit( 'KeyG' ) ) {

				const saved = g.state.secretEvent( site.id === 'night' ? 'trail' : 'record', site.id === 'night' ? { index: s.nightStep } : { id: site.id } );
				g.toast( ! saved ? '见闻未能保存 · 请检查站点存储空间，再试一次' : g.state.secrets.found.includes( site.id ) ? `已收藏${ site.keepsake } · I 阅读见闻，M 可继续探索` : `微光指向下一道石痕 · ${ g.state.secrets.nightStep } / ${ NIGHT_TRAIL.length } · M 查看方向`, 5000 );

			}
			return;

		}

	}

}
