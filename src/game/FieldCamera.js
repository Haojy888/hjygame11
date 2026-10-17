import { Vector3 } from '../engine/index.js';
import { FIELD_SUBJECTS } from './Expedition.js';

export function subjectVisible( app, point, range, cone = 0.7 ) {

	const camera = app.camera, from = camera?.position;
	if ( ! from || ! point || ! [ from.x, from.y, from.z, point.x, point.y, point.z ].every( Number.isFinite ) ) return false;
	const direction = new Vector3().subVectors( point, from ), distance = direction.length();
	if ( distance < 0.4 || distance > range || camera.getWorldDirection( new Vector3() ).dot( direction.normalize() ) < cone ) return false;
	const ndc = point.clone().project( camera );
	if ( Math.abs( ndc.x ) > 0.78 || Math.abs( ndc.y ) > 0.75 || ndc.z < 0 || ndc.z > 1 ) return false;
	if ( app.colliders?.raycast( from, direction, distance ) < distance - 0.65 ) return false;
	if ( app.terrainData ) for ( let i = 1; i < 10; i ++ ) {

		const p = from.clone().lerp( point, i / 10 ), ground = app.terrainData.heightAt( p.x, p.z );
		if ( ! Number.isFinite( ground ) || ground + 0.1 > p.y ) return false;

	}
	return true;

}

export function fieldSubjects( app ) {

	const subjects = [], fish = app.reef?.fish;
	for ( const group of fish?.groups || [] ) if ( [ 'turtle', 'eagleRay' ].includes( group.sp.model ) ) {

		const point = new Vector3().fromArray( fish.pos, group.offset * 3 );
		subjects.push( { id: group.sp.model, point } );

	}
	if ( app.deepBeast?.creaturePosition ) subjects.push( { id: 'elder', point: app.deepBeast.creaturePosition.clone().add( new Vector3( 0, 6, 0 ) ) } );
	const world = app.wreckScene;
	if ( world ) {

		subjects.push( { id: 'wreck', point: world.position.clone().add( new Vector3( 0, 2, 0 ) ) }, { id: 'cave', point: world.cavePosition.clone().add( new Vector3( 0, 3, - 8 ) ) } );
		for ( const p of world.jellyPositions ) subjects.push( { id: 'jelly', point: p.clone().add( new Vector3( 0, 0.8, 0 ) ) } );

	}
	return subjects;

}

export class FieldCamera {

	constructor( game ) { this.game = game; this.pending = null; this.cooldown = 0; }

	canUse() {

		const g = this.game, app = g.app, ui = app.ui?.ui, input = app.input;
		return !! ( ui?._photo && ! app.freeCam && app.player.mode === 'swim' && app.camera.position.y < - 1
			&& ! g.worldMap?.open && ! ui.helpOpen && ! ui.panelOpen && ! ui._start && ! g.guide?.open
			&& ! g.hud?.invOpen && ! g.hud?.standOpen && ! g.hud?.catchOpen && ! g.fight && ! g.landing
			&& ! g.rescueHold && ! input.down?.( 'KeyX' ) && ! app.boatCtl?.capsized
			&& input.enabled !== false && input.focused !== false && ! input.interrupted );

	}

	update( dt ) {

		this.cooldown = Math.max( 0, this.cooldown - Math.max( 0, Number.isFinite( dt ) ? dt : 0 ) );
		if ( ! this.canUse() ) {

			this.pending = null;
			const ui = this.game.app.ui?.ui;
			if ( ui?._photo && ui.photoHint ) ui.photoHint.textContent = '潜入水下后，面向目标按 G 拍摄并收录　|　P 返回';
			return;

		}
		const g = this.game;
		const candidates = fieldSubjects( g.app ).filter( ( s ) => subjectVisible( g.app, s.point, FIELD_SUBJECTS[ s.id ].range ) );
		candidates.sort( ( a, b ) => Number( !! g.state.fieldPhotos[ a.id ] ) - Number( !! g.state.fieldPhotos[ b.id ] ) || a.point.distanceToSquared( g.app.camera.position ) - b.point.distanceToSquared( g.app.camera.position ) );
		const target = candidates[ 0 ];
		const hint = target ? `G 拍摄${ FIELD_SUBJECTS[ target.id ].name }${ g.state.fieldPhotos[ target.id ] ? ' · 已收录' : ' · 可收录' }　|　P 返回　|　I 查看图鉴` : '将水下生物或景物放在画面中间，靠近后按 G 拍摄　|　P 返回';
		const ui = g.app.ui.ui;
		if ( ui.photoHint && ui.photoHint.textContent !== hint ) { ui.photoHint.textContent = hint; ui._pokePhotoHint?.(); }
		if ( g.app.input.hit( 'KeyG' ) && this.cooldown === 0 ) {

			this.cooldown = 1;
			if ( ! target ) g.toast( '尚未找到清晰目标 · 再靠近一些，将目标放在画面中间', 3500 );
			else if ( g.state.fieldPhotos[ target.id ] ) g.toast( '这项见闻已收录 · 按 P 返回后，按 I 查看照片', 3000 );
			else this.pending = target.id;

		}

	}

	// Called immediately after the rendered frame is submitted, before the swapchain is recycled.
	flush() {

		const id = this.pending; this.pending = null;
		if ( ! id || ! this.canUse() ) return false;
		const g = this.game, point = fieldSubjects( g.app ).find( ( s ) => s.id === id && subjectVisible( g.app, s.point, FIELD_SUBJECTS[ id ].range ) )?.point;
		if ( ! point ) return false;
		try {

			const canvas = g.app.engine.canvas, thumbnail = document.createElement( 'canvas' );
			thumbnail.width = 320; thumbnail.height = Math.max( 1, Math.round( 320 * canvas.height / canvas.width ) );
			if ( thumbnail.height > 240 ) { thumbnail.height = 240; thumbnail.width = Math.round( 240 * canvas.width / canvas.height ); }
			const context = thumbnail.getContext( '2d' );
			context.drawImage( canvas, 0, 0, thumbnail.width, thumbnail.height );
			const image = thumbnail.toDataURL( 'image/jpeg', 0.65 );
			const saved = g.state.recordFieldPhoto( id, { image, x: point.x, y: point.y, z: point.z, hour: g.hour } );
			g.toast( saved ? `已收录：${ FIELD_SUBJECTS[ id ].name } · 按 P 返回，再按 I 查看摄影图鉴` : '照片未能保存 · 请允许网站存储数据，或释放浏览器站点空间后重试', 5000 );
			return saved;

		} catch { g.toast( '本次照片未能保存，请稍后重试；探索进度仍保留', 4000 ); return false; }

	}

}
