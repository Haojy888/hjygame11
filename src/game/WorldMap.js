import { MAP_BOUNDS } from './Minimap.js';
import { WORLD } from '../world/WorldLayout.js';
import { STAND } from './FishStand.js';
import { CHANDLERY } from './Chandlery.js';
import { WRECK_SITE, CAVE_SITE, expeditionObjective } from './Expedition.js';
import { SURVEY_SITES } from './MarineSurvey.js';
import { STATION, STATION_STEPS, SALVAGE, EVENT_SITES, EVENT_TYPES, RESTORATION_SITES, restorationReady } from './Voyage.js';
import { storyObjective } from './Story.js';
import { seaJournalObjective } from './SeaJournal.js';
import { matchesOrder } from './Orders.js';
import { FISH } from './FishTable.js';
import { SECRET_SITES } from './Secrets.js';

const CSS = `
.gm-worldmap { position: absolute; inset: 0; z-index: 90; display: grid; place-items: center; pointer-events: auto;
	background: rgba(3,12,22,.76); color: var(--tw-ink); font: 500 var(--tw-fs-md) var(--tw-font); }
.gm-worldmap[hidden] { display: none; }
.gm-worldmap-card { max-width: 96vw; max-height: 94vh; overflow: auto; padding: var(--tw-4); border-radius: var(--tw-r-lg); color-scheme: dark; }
.gm-worldmap-card, .gm-worldmap-list { scrollbar-width: thin; scrollbar-color: #587483 transparent; }
.gm-worldmap header { display: flex; align-items: center; justify-content: space-between; gap: var(--tw-4); margin-bottom: var(--tw-3); }
.gm-worldmap h2 { margin: 0; font-size: var(--tw-fs-lg); }
.gm-worldmap header p, .gm-worldmap footer { margin: 5px 0 0; color: var(--tw-ink-3); font-size: var(--tw-fs-sm); }
.gm-worldmap-body { display: grid; grid-template-columns: auto minmax(200px,250px); gap: var(--tw-4); }
.gm-worldmap-view { width: min(65vh,650px,calc(94vw - 320px)); height: min(65vh,650px,calc(94vw - 320px)); background: #0b2c48; border: 1px solid var(--tw-line); border-radius: var(--tw-r-md); overflow: hidden; }
.gm-worldmap canvas { display: block; width: 100%; height: 100%; cursor: crosshair; }
.gm-worldmap-list { margin: 0; padding: 0; list-style: none; max-height: 65vh; overflow: auto; }
.gm-worldmap-list li { border-bottom: 1px solid var(--tw-line); }
.gm-map-place { display: flex; align-items: center; gap: 8px; width: 100%; padding: 10px 5px; border: 0; border-radius: 6px; background: transparent; color: inherit; font: inherit; text-align: left; }
button.gm-map-place { cursor: pointer; }
button.gm-map-place:hover { background: var(--tw-fill-2); }
.gm-map-place[aria-pressed='true'] { background: rgba(var(--tw-aqua-rgb),.13); box-shadow: inset 3px 0 var(--tw-aqua); }
.gm-worldmap button:focus-visible, .gm-worldmap select:focus-visible { outline: 2px solid var(--tw-aqua); outline-offset: 2px; }
.gm-worldmap-tools { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
.gm-worldmap-tools label { color: var(--tw-ink-2); font-size: var(--tw-fs-sm); }
.gm-worldmap-tools select { margin-left: 8px; padding: 6px; color: var(--tw-ink); background: #142a37; border: 1px solid var(--tw-line-2); border-radius: 6px; font: inherit; }
.gm-worldmap-search { display: flex; align-items: center; gap: 12px; margin: 0 0 12px; }
.gm-worldmap-search input { min-width: 0; flex: 1; padding: 8px 10px; color: var(--tw-ink); background: #142a37; border: 1px solid var(--tw-line-2); border-radius: 6px; font: inherit; }
.gm-worldmap-search input:focus-visible { outline: 2px solid var(--tw-aqua); outline-offset: 2px; }
.gm-map-count { color: var(--tw-ink-2); white-space: nowrap; font-size: var(--tw-fs-sm); }
.gm-worldmap-navigation { margin: 0 0 12px; max-width: 850px; color: var(--tw-aqua); font-size: var(--tw-fs-sm); line-height: 1.6; }
.gm-worldmap-list i { font-style: normal; width: 20px; text-align: center; font-weight: 700; }
.gm-worldmap-list span { flex: 1; }
.gm-worldmap-list small { color: var(--tw-ink-2); white-space: nowrap; font: 500 var(--tw-fs-xs) var(--tw-mono); }
.gm-worldmap footer { max-width: 850px; line-height: 1.6; margin-top: var(--tw-3); }
@media (max-width: 820px) {
	.gm-worldmap-body { grid-template-columns: 1fr; }
	.gm-worldmap-view { width: min(56vh,85vw); height: min(56vh,85vw); }
	.gm-worldmap-list { max-height: 130px; }
}`;

const LOCATION_HINTS = {
	harbor: '靠近船舷按 E 登船，上岸后可找商贩交谈',
	joe: '上岸靠近乔按 E，出售渔获或交谈',
	marta: '上岸靠近玛尔塔按 E，补给燃油、升级或交谈',
	boat: '靠近船舷按 E 登船，再到舵位按 E 掌舵',
	wreck: 'P 取景、G 拍照；调查故事时跟随 ⚓ 目标',
	cave: '岩洞两端可通行 · P 取景、G 拍照',
	abyss: 'L 开灯，放慢速度观察巨章；P 取景、G 拍照',
};

// Same north-up projection as the minimap bake. Out-of-chart positions stay on its edge.
export function mapPoint( position ) {

	const { x, z, extent, size } = MAP_BOUNDS;
	const px = ( position.x - x ) / extent * size, py = ( position.z - z ) / extent * size;
	return { x: Math.max( 12, Math.min( size - 12, px ) ), y: Math.max( 12, Math.min( size - 12, py ) ), edge: px < 0 || py < 0 || px > size || py > size };

}

// Horizontal distance guides travel; target height distinguishes a dive from arrival above it.
export function navigationInfo( destination, position ) {

	if ( ! destination || ! [ destination.x, destination.z, position?.x, position?.z ].every( Number.isFinite ) ) return null;
	const dx = destination.x - position.x, dz = destination.z - position.z;
	const distance = Math.hypot( dx, dz ), bearing = ( Math.atan2( dx, - dz ) * 180 / Math.PI + 360 ) % 360;
	const direction = [ '北', '东北', '东', '东南', '南', '西南', '西', '西北' ][ Math.round( bearing / 45 ) % 8 ];
	const depth = destination.underwater !== false && Number.isFinite( destination.y ) && destination.y < - 2 ? Math.round( - destination.y ) : null;
	const vertical = Number.isFinite( position.y ) ? position.y - destination.y : Infinity;
	const nearby = distance <= 8, arrived = nearby && ( depth === null || Math.abs( vertical ) <= 3 );
	const hint = nearby && depth !== null && ! arrived
		? vertical > 0 ? '已到目标上方 · C 下潜 · L 开灯' : '目标在上方 · Space 上浮接近'
		: arrived ? '已到附近 · ' + ( destination.hint || '按 M 可更换目的地' ) : destination.hint || '跟随小地图上的 ⌖ 前往';
	const metrics = `${ Math.round( distance ) } 米 · ${ direction } ${ Math.round( bearing ) % 360 }°${ depth === null ? '' : ` · 水下约 ${ depth } 米` }`;
	return { destination, distance, bearing, depth, nearby, arrived, metrics, hint };

}

export function locationGroup( entry ) {

	if ( [ 'harbor', 'joe', 'marta', 'boat', 'player' ].includes( entry.id ) ) return 'harbor';
	if ( [ 'task', 'story', 'seaJournal', 'expedition', 'voyage', 'radio-event' ].includes( entry.id ) || entry.id.startsWith( 'restore-' ) ) return 'tasks';
	return 'explore';

}

// Repeat clicks cycle through nearby overlapping markers; a lone selected marker cancels.
export function mapSelection( entries, x, y, selectedId, radius = 18 ) {

	const hits = entries.filter( ( entry ) => entry.id !== 'player' ).map( ( entry ) => ( { id: entry.id, distance: Math.hypot( mapPoint( entry ).x - x, mapPoint( entry ).y - y ) } ) )
		.filter( ( hit ) => hit.distance <= radius ).sort( ( a, b ) => a.distance - b.distance );
	if ( ! hits.length ) return undefined;
	const index = hits.findIndex( ( hit ) => hit.id === selectedId );
	return hits.length === 1 && index === 0 ? null : hits[ ( index + 1 ) % hits.length ].id;

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
	if ( game.state.isGroundUnlocked( 'deep' ) ) entries.push( { id: 'abyss', icon: '☉', label: '深海遗迹 · 沉睡古神', x: WORLD.abyss.center.x, z: WORLD.abyss.center.z, underwater: true, color: '#adcfb0' } );
	if ( game.minimap?._goalPos && game.state.currentOrder ) {

		const order = game.state.currentOrder, stock = game.state.inventory.filter( ( fish ) => matchesOrder( order, fish ) ).length;
		const remaining = Math.max( 0, order.count - game.state.orderDelivered - stock );
		entries.push( { id: 'task', icon: '◇', label: '主线 · ' + order.title, ...game.minimap._goalPos, color: '#ffd284',
			hint: remaining === 0 ? '渔获已齐 · 上岸靠近乔按 E，出售合格渔获交付订单' : `${ FISH[ order.species ].name } ≥ ${ order.minKg } 公斤 · 还需钓 ${ remaining } 条。${ order.hint }` } );

	}
	if ( game.storyTarget ) {

		const objective = storyObjective( game.state );
		entries.push( { id: 'story', icon: '☆', label: '剧情 · ' + objective.title, hint: objective.text, ...game.storyTarget, color: '#c6b4ff' } );

	}
	const journalTarget = game.seaJournalTarget;
	if ( game.state.isGroundUnlocked( 'reef' ) ) entries.push( { id: 'wreck', icon: '⚓', label: '归潮号沉船', ...WRECK_SITE, underwater: true, color: '#d8c095' }, { id: 'cave', icon: '洞', label: '潮光岩洞 · 两端可通行', ...CAVE_SITE, underwater: true, color: '#96bfc7' } );
	const expedition = game.expeditionTarget;
	if ( game.state.voyage && game.state.isGroundUnlocked( 'reef' ) ) {

		const voyage = game.state.voyage;
		const event = voyage.event?.accepted ? voyage.event : null;
		const seconds = event ? Math.ceil( event.remaining ) : 0;
		const eventHint = event ? `剩余 ${ Math.floor( seconds / 60 ) }:${ String( seconds % 60 ).padStart( 2, '0' ) } · ${ EVENT_TYPES[ event.type ].task }` : '';
		const haulHint = game.state.boatId !== 'offshore' ? '绳已挂好 · 先到玛尔塔处换远海大船，再驶近目标起吊'
			: game.app.weather?.thunderstorm ? '绳已挂好 · 等雷暴过去，船身平稳后长按 G 起吊' : '绳已挂好 · 驾船驶入目标 12 米内，停稳并等船身平稳，长按 G 起吊';
		entries.push( { id: 'station', icon: '▤', label: '海湾七号 · ' + ( voyage.station >= 4 ? '正在播报' : '失联观测站' ), ...( game.voyage?.world?.stationLadder || STATION ), underwater: false,
			hint: '控制台旁有金色踏棍的登台梯 · 下水靠近，按住 W 或空格攀爬；也可在船上停稳后操作控制台', color: '#96d7cc' } );
		if ( game.voyageTarget ) entries.push( { id: 'voyage', icon: '▤', label: '电台 · ' + ( voyage.station > 0 && voyage.station < 5 ? [ '', '读取浮标编号', '调查海床记录器', '修复观测站控制台', '回港向乔汇报' ][ voyage.station ] : event ? EVENT_TYPES[ event.type ].name : '驾驶大船起吊' ), ...game.voyageTarget, underwater: voyage.station === 2,
			hint: voyage.station > 0 && voyage.station < 5 ? STATION_STEPS[ voyage.station ] : event ? eventHint : haulHint, color: '#f1d88e' } );
		if ( event ) entries.push( { id: 'radio-event', icon: '讯', label: EVENT_TYPES[ event.type ].name, ...EVENT_SITES[ event.site ], underwater: false, hint: eventHint, color: '#f1d88e' } );
		if ( voyage.station > 0 ) for ( const item of SALVAGE ) if ( ! voyage.salvaged.includes( item.id ) ) entries.push( { id: 'salvage-' + item.id, icon: '钩', label: item.name + ( voyage.hooked === item.id ? ' · 已挂绳，回船起吊' : ' · 潜水挂绳 / 大船起吊' ), x: item.x, z: item.z, ...game.voyage?.world?.salvage?.get( item.id )?.point,
			underwater: voyage.hooked !== item.id, hint: voyage.hooked === item.id ? haulHint : voyage.hooked ? '已有另一件物品挂绳 · 先回大船完成起吊，再来挂绳' : '下潜靠近物件，收竿并面向它按 G 挂绳；再回远海大船起吊', color: '#c5b78e' } );
		const r = voyage.restoration;
		if ( r?.active ) for ( const site of RESTORATION_SITES ) entries.push( { id: 'restore-' + site.id, icon: '♧', label: site.name + ( r.done.includes( site.id ) ? ' · 已复苏，可回访' : restorationReady( r, site.id ) ? ' · 潜水长按 G' : ' · 先清理两处废弃物' ), x: site.x, z: site.z, ...game.voyage?.world?.restoration?.sites.get( site.id )?.point, underwater: true, hint: r.done.includes( site.id ) ? '复苏潜点 · 可按 P 拍照留念' : restorationReady( r, site.id ) ? '收竿，面向目标长按 G 作业' : '先清理幽灵网与沙地废弃物', color: r.done.includes( site.id ) ? '#81b9ab' : '#b7e8a0' } );
		if ( r?.active && ! r.reported && r.done.length === RESTORATION_SITES.length ) entries.push( { id: 'restore-report', icon: '♧', label: '海湾复苏 · 回港向玛尔塔汇报', x: CHANDLERY.x, z: CHANDLERY.z, hint: '靠近玛尔塔按 E，领取行动谢礼', color: '#b7e8a0' } );

	}
	if ( game.state.isGroundUnlocked( 'reef' ) ) for ( const site of SURVEY_SITES ) {

		const point = game.app.reef?.surveySubjects?.find( ( s ) => s.id === site.id )?.point || site;
		const photographed = !! game.state.fieldPhotos?.[ site.id ];
		entries.push( { id: 'survey-' + site.id, icon: '◉', label: site.name + ( photographed ? ' · 照片已收录' : ' · 生态观察潜点' ), x: point.x, y: point.y, z: point.z, underwater: true, hint: photographed ? '照片已收录 · 按 I 查看图鉴；调查集齐后回玛尔塔处领取谢礼' : '潜到生物附近 · P 取景，面向目标按 G 拍照', color: '#d2e8a7' } );

	}
	if ( expedition ) entries.push( { id: 'expedition', icon: '⚓', label: '归潮号 · ' + expeditionObjective( game.state ).title, hint: expeditionObjective( game.state ).text, ...expedition, color: '#ffe6af' } );
	if ( journalTarget ) entries.push( { id: 'seaJournal', icon: '◎', label: `${ seaJournalObjective( game.state ).title }${ journalTarget.y < - 4 ? ` · 水下约 ${ Math.round( - journalTarget.y ) } 米` : '' }`, hint: seaJournalObjective( game.state ).text, ...journalTarget, color: '#8fe5ce' } );
	if ( game.app.boatCtl ) entries.push( { id: 'boat', icon: '船', label: '你的船', ...game.app.boatCtl.position, underwater: false, color: '#d8edf5' } );
	if ( game.secrets && game.state.secrets ) for ( const site of SECRET_SITES ) entries.push( {
		id: 'secret-' + site.id, icon: '✧', label: site.name + ( game.state.secrets.found.includes( site.id ) ? ' · 已记录' : ' · 环境见闻' ),
		...game.secrets.point( site.id ), underwater: site.id === 'storm', hint: game.secrets.hint( site.id ), color: '#b3e1c5',
	} );
	entries.push( ...( game.landmarks?.locations() || [] ) );
	entries.push( { id: 'player', icon: '▲', label: '你的位置', ...game.app.player.position, color: '#fff' } );
	return entries.map( ( entry ) => {

		if ( entry.underwater && ! Number.isFinite( entry.y ) ) {

			const floor = game.app.terrainData?.heightAt( entry.x, entry.z );
			if ( Number.isFinite( floor ) ) entry.y = floor + 1;

		}
		entry.hint ||= LOCATION_HINTS[ entry.id ];
		return entry;

	} );

}

export class WorldMap {

	constructor( ui, game, minimap ) {

		this.ui = ui;
		this.game = game;
		this.minimap = minimap;
		this.open = false;
		this.selectedId = null;
		this.navigation = null;
		this._refresh = 0;
		const style = document.createElement( 'style' );
		style.textContent = CSS;
		document.head.append( style );
		this.el = document.createElement( 'div' );
		this.el.className = 'gm-worldmap tw-interactive';
		this.el.hidden = true;
		this.el.innerHTML = `<section class="gm-worldmap-card tw-glass" role="dialog" aria-modal="true" aria-labelledby="gm-worldmap-title">
			<header><div><h2 id="gm-worldmap-title">潮汐海岸 · 地图</h2><p>北方朝上 · 点击地点或列表开始导航</p></div><button type="button" class="gm-btn is-ghost">关闭 (M / Esc)</button></header>
			<div class="gm-worldmap-tools"><label>地点分类<select aria-label="地点分类"><option value="all">全部地点</option><option value="tasks">当前任务</option><option value="explore">钓场与探索</option><option value="harbor">港口与船只</option></select></label><button type="button" class="gm-btn is-ghost gm-map-clear" disabled>取消导航</button></div>
			<div class="gm-worldmap-search"><input type="search" aria-label="搜索地点或任务" placeholder="搜索地点、任务或操作提示" autocomplete="off" maxlength="80"><span class="gm-map-count" role="status"></span></div>
			<p class="gm-worldmap-navigation">选择目的地后，关闭地图即可跟随小地图上的 ⌖ 前往。</p>
			<div class="gm-worldmap-body"><div class="gm-worldmap-view"><canvas width="640" height="640" role="img" aria-label="岛屿、海湾与你的实时位置；地点和距离见右侧列表"></canvas></div><ul class="gm-worldmap-list"></ul></div>
			<footer>数字 1–3 为已开放钓场；◇ 主线，☆ 剧情，◎ 航海见闻，⚓ 归潮号，◉ 生态潜点，♧ 海湾复苏，▤ 电台航程，钩为打捞物。重复点击可切换重叠标记。虚线为直线方位参考，航行需绕开陆地；边缘标记表示图外目标。查看地图时暂停钓鱼，安静观察会中断；海浪和船只漂流继续。</footer></section>`;
		this.canvas = this.el.querySelector( 'canvas' );
		this.ctx = this.canvas.getContext( '2d' );
		this.list = this.el.querySelector( 'ul' );
		this.closeButton = this.el.querySelector( 'button' );
		this.closeButton.onclick = () => this.toggle( false );
		this.clearButton = this.el.querySelector( '.gm-map-clear' );
		this.clearButton.onclick = () => { this.selectDestination( null ); this.closeButton.focus(); };
		this.filter = this.el.querySelector( 'select' );
		this.filter.onchange = () => { this._refresh = 0; this.update( 0 ); };
		this.search = this.el.querySelector( 'input' );
		this.search.oninput = () => { this._refresh = 0; this.update( 0 ); };
		this.countLabel = this.el.querySelector( '.gm-map-count' );
		this.navigationLabel = this.el.querySelector( '.gm-worldmap-navigation' );
		this.list.addEventListener( 'click', ( event ) => {

			const id = event.target.closest( '[data-map-id]' )?.dataset.mapId;
			if ( id ) this.selectDestination( id === this.selectedId ? null : id );

		} );
		this.canvas.onclick = ( event ) => {

			const rect = this.canvas.getBoundingClientRect();
			const x = ( event.clientX - rect.left ) / rect.width * MAP_BOUNDS.size, y = ( event.clientY - rect.top ) / rect.height * MAP_BOUNDS.size;
			const id = mapSelection( mapLocations( this.game ), x, y, this.selectedId, 18 * MAP_BOUNDS.size / rect.width );
			if ( id === undefined ) return;
			this.selectDestination( id );
			if ( id ) this.list.querySelector( `[data-map-id="${ id }"]` )?.scrollIntoView?.( { block: 'nearest' } );

		};
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

		const modified = event.ctrlKey || event.metaKey || event.altKey;
		const typing = event.target?.isContentEditable || [ 'INPUT', 'TEXTAREA' ].includes( event.target?.tagName );
		if ( ! this.open && ( modified || event.isComposing || typing || event.target?.tagName === 'SELECT' ) ) return;
		if ( this.open ) {

			if ( event.isComposing ) { event.stopImmediatePropagation(); return; }
			if ( event.code === 'Escape' && event.target === this.search && this.search.value ) {

				this.search.value = ''; this.search.oninput();
				event.preventDefault(); event.stopImmediatePropagation(); return;

			}
			if ( ! modified && ! event.repeat && ( event.code === 'KeyM' && ! typing || event.code === 'Escape' ) ) {

				this._closingKey = event.code;
				this.toggle( false );

			}
			if ( event.code === 'Tab' ) {

				const controls = [ ...this.el.querySelectorAll( 'button:not([disabled]), select, input' ) ];
				const index = controls.indexOf( document.activeElement );
				const next = index < 0 ? event.shiftKey ? controls.length - 1 : 0 : ( index + ( event.shiftKey ? - 1 : 1 ) + controls.length ) % controls.length;
				controls[ next ]?.focus();

			}
			// Keep text editing, IME and native controls inside the dialog.
			if ( event.code === 'Tab' || ! typing && ! modified && ! [ 'Enter', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End' ].includes( event.code ) ) event.preventDefault();
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
			if ( this.el.contains( document.activeElement ) ) document.activeElement.blur();

		}
		return this.open;

	}

	selectDestination( id ) {

		const destination = id && mapLocations( this.game ).find( ( entry ) => entry.id === id && id !== 'player' );
		if ( id && ! destination ) return false;
		this.selectedId = id;
		this.navigation = navigationInfo( destination, this.game.app.player.position );
		this._refresh = 0;
		this.update( 0 );
		return true;

	}

	update( dt ) {

		if ( ! this.open && ! this.selectedId ) return;
		this._refresh -= dt;
		if ( this._refresh > 0 ) return;
		this._refresh = 0.2;
		const entries = mapLocations( this.game ), player = this.game.app.player;
		this.navigation = navigationInfo( entries.find( ( entry ) => entry.id === this.selectedId ), player.position );
		if ( ! this.navigation ) this.selectedId = null;
		if ( ! this.open ) return;
		this.clearButton.disabled = ! this.navigation;
		this.navigationLabel.textContent = this.navigation ? `⌖ ${ this.navigation.destination.label } · ${ this.navigation.metrics } · ${ this.navigation.hint }` : '选择目的地后，关闭地图即可跟随小地图上的 ⌖ 前往。';
		const ctx = this.ctx, size = MAP_BOUNDS.size;
		ctx.clearRect( 0, 0, size, size );
		if ( this.minimap._bake.done ) ctx.drawImage( this.minimap.canvas, 0, 0 );
		else {

			ctx.fillStyle = '#0b2c48'; ctx.fillRect( 0, 0, size, size );
			ctx.fillStyle = '#d8edf5'; ctx.font = '20px sans-serif'; ctx.fillText( '正在绘制海岸…', 235, 280 );

		}
		ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
		if ( this.navigation ) {

			const from = mapPoint( player.position ), to = mapPoint( this.navigation.destination );
			ctx.save(); ctx.strokeStyle = '#9ff4df'; ctx.lineWidth = 2; ctx.setLineDash( [ 7, 6 ] );
			ctx.beginPath(); ctx.moveTo( from.x, from.y ); ctx.lineTo( to.x, to.y ); ctx.stroke(); ctx.restore();

		}
		const ordered = [ ...entries ].sort( ( a, b ) => Number( a.id === this.selectedId ) - Number( b.id === this.selectedId ) );
		for ( const entry of ordered ) {

			const point = mapPoint( entry );
			ctx.save(); ctx.translate( point.x, point.y );
			if ( entry.id === this.selectedId ) {

				ctx.strokeStyle = '#9ff4df'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc( 0, 0, 17, 0, Math.PI * 2 ); ctx.stroke();

			}
			ctx.fillStyle = '#112638'; ctx.strokeStyle = entry.color; ctx.lineWidth = 2;
			ctx.beginPath(); ctx.arc( 0, 0, 10, 0, Math.PI * 2 ); ctx.fill(); ctx.stroke();
			ctx.fillStyle = entry.color;
			if ( entry.id === 'player' ) ctx.rotate( player.mode === 'boat' ? Math.PI - this.game.app.boatCtl.getYaw() : - player.yaw );
			ctx.fillText( entry.icon, 0, 0 ); ctx.restore();

		}
		ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif'; ctx.fillText( '北 ↑', 50, 28 );
		ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo( 22, 604 ); ctx.lineTo( 72, 604 ); ctx.stroke();
		ctx.font = '14px sans-serif'; ctx.fillText( '100 米', 47, 620 );
		const query = this.search.value.trim().toLowerCase();
		const visible = entries.filter( ( entry ) => ( this.filter.value === 'all' || locationGroup( entry ) === this.filter.value ) && `${ entry.label } ${ entry.hint || '' }`.toLowerCase().includes( query ) );
		const countText = `${ visible.length } / ${ entries.length } 个地点`;
		if ( this.countLabel.textContent !== countText ) this.countLabel.textContent = countText;
		// Do not rebuild focused controls or reset scroll as distances change.
		const listKey = JSON.stringify( visible.map( ( entry ) => [ entry.id, entry.label ] ) );
		if ( listKey !== this._listKey ) {

			const focusedId = document.activeElement?.dataset?.mapId;
			this._listKey = listKey;
			this.list.innerHTML = visible.map( ( entry ) => {

				const tag = entry.id === 'player' ? 'div' : 'button';
				return `<li><${ tag } class="gm-map-place"${ tag === 'button' ? ` type="button" data-map-id="${ entry.id }" aria-pressed="false"` : '' }><i style="color:${ entry.color }">${ entry.icon }</i><span>${ entry.label }</span><small data-map-distance="${ entry.id }"></small></${ tag }></li>`;

			} ).join( '' ) || '<li class="gm-map-place">没有匹配地点 · 可清空搜索或更换分类</li>';
			if ( focusedId ) ( this.list.querySelector( `[data-map-id="${ focusedId }"]` ) || ( query ? this.search : this.filter ) ).focus();

		}
		for ( const entry of visible ) {

			const distance = Math.round( Math.hypot( entry.x - player.position.x, entry.z - player.position.z ) );
			this.list.querySelector( `[data-map-distance="${ entry.id }"]` ).textContent = `${ entry.id === 'player' ? '当前位置' : distance + ' 米' }${ mapPoint( entry ).edge ? ' · 图外' : '' }`;
			this.list.querySelector( `[data-map-id="${ entry.id }"]` )?.setAttribute( 'aria-pressed', String( entry.id === this.selectedId ) );

		}

	}

}
