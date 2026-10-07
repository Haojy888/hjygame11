import { MAP_BOUNDS } from './Minimap.js';
import { WORLD } from '../world/WorldLayout.js';
import { STAND } from './FishStand.js';
import { CHANDLERY } from './Chandlery.js';

const CSS = `
.gm-worldmap { position: absolute; inset: 0; z-index: 90; display: grid; place-items: center; pointer-events: auto;
	background: rgba(3,12,22,.76); color: var(--tw-ink); font: 500 var(--tw-fs-md) var(--tw-font); }
.gm-worldmap[hidden] { display: none; }
.gm-worldmap-card { max-width: 96vw; max-height: 94vh; overflow: auto; padding: var(--tw-4); border-radius: var(--tw-r-lg); }
.gm-worldmap header { display: flex; align-items: center; justify-content: space-between; gap: var(--tw-4); margin-bottom: var(--tw-3); }
.gm-worldmap h2 { margin: 0; font-size: var(--tw-fs-lg); }
.gm-worldmap header p, .gm-worldmap footer { margin: 5px 0 0; color: var(--tw-ink-3); font-size: var(--tw-fs-sm); }
.gm-worldmap-body { display: grid; grid-template-columns: auto minmax(200px,250px); gap: var(--tw-4); }
.gm-worldmap-view { width: min(65vh,650px,calc(94vw - 320px)); height: min(65vh,650px,calc(94vw - 320px)); background: #0b2c48; border: 1px solid var(--tw-line); border-radius: var(--tw-r-md); overflow: hidden; }
.gm-worldmap canvas { display: block; width: 100%; height: 100%; }
.gm-worldmap-list { margin: 0; padding: 0; list-style: none; max-height: 65vh; overflow: auto; }
.gm-worldmap-list li { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--tw-line); }
.gm-worldmap-list i { font-style: normal; width: 20px; text-align: center; font-weight: 700; }
.gm-worldmap-list span { flex: 1; }
.gm-worldmap-list small { color: var(--tw-ink-3); white-space: nowrap; font: 500 var(--tw-fs-xs) var(--tw-mono); }
.gm-worldmap footer { max-width: 850px; line-height: 1.6; margin-top: var(--tw-3); }
.gm-map-label { display: block; }
@media (max-width: 820px) {
	.gm-worldmap-body { grid-template-columns: 1fr; }
	.gm-worldmap-view { width: min(56vh,85vw); height: min(56vh,85vw); }
	.gm-worldmap-list { max-height: 130px; }
}`;

// Same north-up projection as the minimap bake. Out-of-chart positions stay on its edge.
export function mapPoint( position ) {

	const { x, z, extent, size } = MAP_BOUNDS;
	const px = ( position.x - x ) / extent * size, py = ( position.z - z ) / extent * size;
	return { x: Math.max( 12, Math.min( size - 12, px ) ), y: Math.max( 12, Math.min( size - 12, py ) ), edge: px < 0 || py < 0 || px > size || py > size };

}

export function mapLocations( game ) {

	const entries = [
		{ id: 'harbor', icon: '港', label: '港口码头', x: WORLD.pier.x, z: WORLD.pier.zEnd, color: '#f4d28c' },
		{ id: 'joe', icon: '乔', label: '乔 · 鱼摊', x: STAND.x, z: STAND.z, color: '#ffd284' },
		{ id: 'marta', icon: '玛', label: '玛尔塔 · 船具店', x: CHANDLERY.x, z: CHANDLERY.z, color: '#83ded0' },
		{ id: 'coast', icon: '1', label: '近岸浅滩', x: 20, z: - 15, color: '#89ded9' },
	];
	if ( game.state.isGroundUnlocked( 'reef' ) ) entries.push( { id: 'reef', icon: '2', label: '珊瑚礁钓场', x: WORLD.reef.center.x, z: WORLD.reef.center.z, color: '#89ded9' } );
	if ( game.state.isGroundUnlocked( 'deep' ) ) entries.push( { id: 'deep', icon: '3', label: '远海深水钓场', x: 55, z: 450, color: '#89ded9' } );
	if ( game.minimap?._goalPos ) entries.push( { id: 'task', icon: '◇', label: '当前主线目标', ...game.minimap._goalPos, color: '#ffd284' } );
	if ( game.storyTarget ) entries.push( { id: 'story', icon: '☆', label: '当前剧情目标', ...game.storyTarget, color: '#c6b4ff' } );
	if ( game.app.boatCtl ) entries.push( { id: 'boat', icon: '船', label: '你的船', ...game.app.boatCtl.position, color: '#d8edf5' } );
	entries.push( { id: 'player', icon: '▲', label: '你的位置', ...game.app.player.position, color: '#fff' } );
	return entries;

}

export class WorldMap {

	constructor( ui, game, minimap ) {

		this.ui = ui;
		this.game = game;
		this.minimap = minimap;
		this.open = false;
		this._refresh = 0;
		const style = document.createElement( 'style' );
		style.textContent = CSS;
		document.head.append( style );
		this.el = document.createElement( 'div' );
		this.el.className = 'gm-worldmap tw-interactive';
		this.el.hidden = true;
		this.el.innerHTML = `<section class="gm-worldmap-card tw-glass" role="dialog" aria-modal="true" aria-labelledby="gm-worldmap-title">
			<header><div><h2 id="gm-worldmap-title">潮汐海岸 · 地图</h2><p>北方朝上 · 地点旁显示与你的距离</p></div><button type="button" class="gm-btn is-ghost">关闭 (M / Esc)</button></header>
			<div class="gm-worldmap-body"><div class="gm-worldmap-view"><canvas width="640" height="640" role="img" aria-label="岛屿、海湾与你的实时位置；地点和距离见右侧列表"></canvas></div><ul class="gm-worldmap-list"></ul></div>
			<footer>数字 1–3 为已开放钓场；◇ 主线目标，☆ 剧情目标。边缘标记表示目标在当前地图范围外。查看地图时暂停钓鱼计时；海浪和船只漂流继续。</footer></section>`;
		this.canvas = this.el.querySelector( 'canvas' );
		this.ctx = this.canvas.getContext( '2d' );
		this.list = this.el.querySelector( 'ul' );
		this.closeButton = this.el.querySelector( 'button' );
		this.closeButton.onclick = () => this.toggle( false );
		ui.root.append( this.el );
		// A pointer-lock request made before M can resolve after the map has opened.
		document.addEventListener( 'pointerlockchange', () => {

			if ( ! this.open ) return;
			try { if ( document.pointerLockElement ) document.exitPointerLock?.(); } catch { /* Already unlocked. */ }
			this.closeButton.focus();

		} );
		for ( const type of [ 'mousedown', 'pointerdown', 'click', 'wheel' ] ) this.el.addEventListener( type, ( event ) => event.stopPropagation() );
		window.addEventListener( 'keydown', ( event ) => this.onKey( event ), true );
		window.addEventListener( 'keyup', ( event ) => {

			if ( this.open || this._closingKey === event.code ) {

				event.stopImmediatePropagation();
				if ( this._closingKey === event.code ) this._closingKey = null;

			}

		}, true );

	}

	onKey( event ) {

		if ( event.ctrlKey || event.metaKey || event.altKey || event.isComposing ) return;
		const typing = event.target?.isContentEditable || [ 'INPUT', 'TEXTAREA', 'SELECT' ].includes( event.target?.tagName );
		if ( typing ) return;
		if ( this.open ) {

			if ( ! event.repeat && ( event.code === 'KeyM' || event.code === 'Escape' ) ) {

				this._closingKey = event.code;
				this.toggle( false );

			}
			if ( event.code === 'Tab' ) this.closeButton.focus();
			// Enter/Space activate the focused close button, while all game/UI shortcuts stay here.
			if ( ! [ 'Enter', 'Space' ].includes( event.code ) ) event.preventDefault();
			event.stopImmediatePropagation();

		} else if ( event.code === 'KeyM' && ! event.repeat && this.toggle( true ) ) {

			event.preventDefault();
			event.stopImmediatePropagation();

		}

	}

	toggle( force = ! this.open ) {

		if ( force === this.open ) return this.open;
		const game = this.game, input = game.app.input, ui = this.ui;
		if ( force && ( ui._start || ui.helpOpen || ui._photo || game.guide?.open || game.hud?.catchOpen || game.landing?.card || input.focused === false || input.enabled === false ) ) return false;
		this.open = force;
		this.el.hidden = ! force;
		ui._worldMapOpen = force;
		input.clear();
		if ( force ) {

			this._inputEnabled = input.enabled;
			input.enabled = false;
			game.hud?.toggleInventory( false );
			game.hud?.closeStand();
			ui.togglePanel?.( false );
			try { if ( document.pointerLockElement ) document.exitPointerLock?.(); } catch { /* Already unlocked. */ }
			this.closeButton.focus();
			this._refresh = 0;
			this.update( 0 );

		} else {

			input.enabled = this._inputEnabled;
			this.closeButton.blur();

		}
		return this.open;

	}

	update( dt ) {

		if ( ! this.open ) return;
		this._refresh -= dt;
		if ( this._refresh > 0 ) return;
		this._refresh = 0.2;
		const ctx = this.ctx, size = MAP_BOUNDS.size;
		ctx.clearRect( 0, 0, size, size );
		if ( this.minimap._bake.done ) ctx.drawImage( this.minimap.canvas, 0, 0 );
		else {

			ctx.fillStyle = '#0b2c48'; ctx.fillRect( 0, 0, size, size );
			ctx.fillStyle = '#d8edf5'; ctx.font = '20px sans-serif'; ctx.fillText( '正在绘制海岸…', 235, 280 );

		}
		ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
		const entries = mapLocations( this.game ), player = this.game.app.player;
		for ( const entry of entries ) {

			const point = mapPoint( entry );
			ctx.save(); ctx.translate( point.x, point.y );
			ctx.fillStyle = '#112638'; ctx.strokeStyle = entry.color; ctx.lineWidth = 2;
			ctx.beginPath(); ctx.arc( 0, 0, 10, 0, Math.PI * 2 ); ctx.fill(); ctx.stroke();
			ctx.fillStyle = entry.color;
			if ( entry.id === 'player' ) ctx.rotate( player.mode === 'boat' ? Math.PI - this.game.app.boatCtl.getYaw() : - player.yaw );
			ctx.fillText( entry.icon, 0, 0 ); ctx.restore();

		}
		ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif'; ctx.fillText( '北 ↑', 50, 28 );
		ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo( 22, 604 ); ctx.lineTo( 72, 604 ); ctx.stroke();
		ctx.font = '14px sans-serif'; ctx.fillText( '100 米', 47, 620 );
		this.list.innerHTML = entries.map( ( entry ) => {

			const distance = Math.round( Math.hypot( entry.x - player.position.x, entry.z - player.position.z ) );
			return `<li><i style="color:${ entry.color }">${ entry.icon }</i><span>${ entry.label }</span><small>${ entry.id === 'player' ? '当前位置' : distance + ' 米' }${ mapPoint( entry ).edge ? ' · 图外' : '' }</small></li>`;

		} ).join( '' );

	}

}
