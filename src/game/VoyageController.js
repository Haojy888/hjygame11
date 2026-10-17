import { Vector3 } from '../engine/index.js';
import { subjectVisible } from './FieldCamera.js';
import { VoyageWorld } from '../world/VoyageWorld.js';
import { BUOY, STATION, RECORDER, SALVAGE, EVENT_SITES, EVENT_TYPES } from './Voyage.js';

const V = ( p, y = 0 ) => new Vector3( p.x, y, p.z );
export class VoyageController {

	constructor( game, { world = null, random = Math.random } = {} ) {

		this.game = game; this.random = random; this.world = world || new VoyageWorld( game.app );
		this.haul = 0; this.checkpoint = 0; this.noticeAge = 180; this.whaleAge = 180; this.weatherSeen = null; this.radioHint = false;

	}

	get aboard() { return [ 'boat', 'deck' ].includes( this.game.app.player.mode ); }
	available( panel = false ) {

		const g = this.game, a = g.app, ui = a.ui?.ui, input = a.input;
		return !! ( ! a.freeCam && ! g.worldMap?.open && ! ui?.helpOpen && ! ui?.panelOpen && ! ui?._photo && ! ui?._start && ! g.guide?.open
			&& ! g.hud?.standOpen && ( panel || ! g.hud?.invOpen ) && ! g.hud?.catchOpen && ! g.fight && ! g.landing && ! g.rescueHold
			&& ! a.boatCtl?.capsized && ! input.down?.( 'KeyX' ) && input.enabled !== false && input.focused !== false && ! input.interrupted && ! g._cardDismissed );

	}

	get target() {

		const g = this.game, v = g.state.voyage;
		if ( ! g.state.isGroundUnlocked( 'reef' ) ) return null;
		if ( v.station > 0 && v.station < 4 ) return this.world.targets[ [ '', 'buoy', 'record', 'repair' ][ v.station ] ];
		if ( v.event?.accepted ) return V( EVENT_SITES[ v.event.site ], 0.6 + this.world.eventSurfaceY );
		if ( v.hooked ) return this.world.salvage.get( v.hooked )?.point;
		return null;

	}

	command( action, id = null ) {

		const g = this.game, v = g.state.voyage;
		if ( ! this.aboard || ! this.available( true ) || ! g.hud?.invOpen ) return false;
		let result = false;
		if ( action === 'accept' ) result = g.state.voyageAction( 'accept', { hour: g.hour } );
		if ( action === 'respond' || action === 'decline' ) result = g.state.voyageAction( action, { serial: v.event?.serial, hour: g.hour } );
		if ( action === 'display' || action === 'photo' ) result = g.state.voyageAction( action, { id } );
		if ( result ) g.toast( action === 'accept' ? '已回应海湾七号 · 按 M 跟随 ▤，先找到编号浮标' : action === 'respond' ? '已回应电台 · 坐标已标在 M 地图中' : action === 'decline' ? '继续自己的航程 · 之后还会收到海上的消息' : '驾驶舱陈列已保存 · 回到船上即可看到', 4500 );
		else g.toast( '未能完成操作，请检查条件与站点存储空间', 3500 );
		return result;

	}

	openRadio() {

		const g = this.game;
		if ( ! this.aboard || ! this.available( true ) || ! g.hud ) return false;
		g.hud.toggleInventory( true );
		const details = g.hud.inv?.querySelector( 'details.gm-radio' );
		if ( details ) { details.open = true; details.querySelector?.( 'summary' )?.focus(); details.scrollIntoView?.( { block: 'nearest' } ); }
		return true;

	}

	update( dt ) {

		const g = this.game, a = g.app;
		const step = Number.isFinite( dt ) ? Math.min( 0.1, Math.max( 0, dt ) ) : 0;
		const v = g.state.voyage;
		const hook = this.world.salvage.get( v.hooked );
		if ( ! hook || Math.hypot( a.boatCtl.position.x - hook.point.x, a.boatCtl.position.z - hook.point.z ) > 12 ) this.haul = this.world.haul = 0;
		if ( ! this.available() ) {

			if ( this.checkpoint > 0 ) { g.state.save(); this.checkpoint = 0; }
			this.world.update( step, v, g.state, g.hour ); return;

		}
		this.checkpoint += step; this.noticeAge += step; this.whaleAge += step;
		if ( this.aboard && ! this.radioHint ) { this.radioHint = true; g.toast( '船载电台已就绪 · 按 B 收听消息与查看驾驶舱收藏', 5000 ); }
		const openSea = this.aboard && a.player.position.z > 65 && g.state.isGroundUnlocked( 'reef' );
		if ( openSea ) {

			if ( v.event ) {

				v.event.remaining = Math.max( 0, v.event.remaining - step );
				if ( v.event.remaining === 0 && g.state.voyageAction( 'expire', { serial: v.event.serial, hour: g.hour } ) ) g.toast( '电台消息已结束 · 不影响航程与已有进度', 3500 );

			} else {

				v.cooldown = Math.max( 0, v.cooldown - step );
				if ( v.cooldown === 0 ) this.offer();

			}
			this.notices();

		}
		if ( this.checkpoint >= 30 ) { g.state.save(); this.checkpoint = 0; }
		if ( ! g.rod.equipped && ! a.player.busy ) {

			this.stationInteraction(); this.eventInteraction(); this.salvageInteraction( step );

		}
		this.world.update( step, g.state.voyage, g.state, g.hour );

	}

	offer() {

		const g = this.game, p = g.app.player.position;
		const sites = EVENT_SITES.map( ( site, index ) => ( { index, distance: Math.hypot( site.x - p.x, site.z - p.z ) } ) ).filter( ( site ) => site.distance > 20 && site.distance < 350 );
		if ( ! sites.length ) return false;
		const hour = g.hour, types = hour >= 17 || hour < 6 ? [ 'shoal', 'drift', 'supply' ] : [ 'supply', 'drift' ];
		const rand = () => Math.min( 0.999999, Math.max( 0, this.random() || 0 ) );
		const type = types[ Math.floor( rand() * types.length ) ], site = sites[ Math.floor( rand() * sites.length ) ].index;
		if ( ! g.state.voyageAction( 'offer', { type, site, hour } ) ) return false;
		g.toast( `电台收到：${ EVENT_TYPES[ type ].name } · 按 B 回应，未回应也可继续自己的航程`, 6000 ); return true;

	}

	notices() {

		const g = this.game, a = g.app, weather = a.weather?.thunderstorm ? '雷暴' : a.weather?.rain ? '降雨' : '晴朗';
		if ( this.noticeAge >= 150 && ( this.weatherSeen !== weather || g.state.voyage.station >= 4 ) ) {

			const source = g.state.voyage.station >= 4 ? '海湾七号' : '玛尔塔';
			if ( g.state.voyageAction( 'notice', { kind: 'weather', hour: g.hour } ) ) {

				g.toast( `${ source }电台：当前${ weather }。${ weather === '雷暴' ? '暂停打捞，建议驶向港口。' : weather === '降雨' ? '注意能见度和甲板湿滑，留够回程油。' : '海况仍以眼前风浪为准，祝平安归航。' }`, 5500 );
				this.weatherSeen = weather; this.noticeAge = 0;

			}

		}
		const whale = a.whale?.brain;
		if ( this.whaleAge >= 180 && whale?.state === 'surface' && whale.position.distanceTo( a.player.position ) < 160
			&& g.state.voyageAction( 'notice', { kind: 'whale', hour: g.hour } ) ) {

			g.toast( '海上电台：附近有座头鲸浮出水面 · 减速观察，保持距离，让它经过', 5500 ); this.whaleAge = 0;

		}

	}

	stationInteraction() {

		const g = this.game, a = g.app, v = g.state.voyage, stage = v.station;
		if ( ! g.state.isGroundUnlocked( 'reef' ) || stage < 1 || stage > 3 ) return;
		const point = this.world.targets[ [ '', 'buoy', 'record', 'repair' ][ stage ] ];
		if ( stage === 2 ? a.player.mode !== 'swim' || a.camera.position.y > - 1 : ! this.aboard ) return;
		if ( ! subjectVisible( a, point, stage === 2 ? 4 : 8, 0.55, stage === 2 ? a.camera.position : a.player.position ) ) return;
		if ( stage === 3 && ( a.boatCtl.velocity.length() > 0.8 || a.weather?.thunderstorm ) ) {

			a.player.prompt = { key: '停船', text: '观测站控制台 · 降低船速，等雷暴过去再接通' }; return;

		}
		a.player.prompt = { key: 'G', text: [ '', '读取编号浮标', '读取海床值班记录器', '修复海湾七号控制台' ][ stage ] };
		if ( a.input.hit( 'KeyG' ) && g.state.voyageAction( [ '', 'buoy', 'record', 'repair' ][ stage ], { hour: g.hour } ) ) {

			g.toast( [ '', '浮标编号已记下 · 按 M 找海床记录器，下潜调查', '日志：人员都已安全撤离，希望有人回来接通天气播报 · 回船后按 M 找控制台', '海湾七号已恢复播报 · 指示灯亮了，回港把消息告诉乔' ][ stage ], 6500 );

		}

	}

	eventInteraction() {

		const g = this.game, a = g.app, event = g.state.voyage.event;
		if ( ! event?.accepted || ! this.aboard ) return;
		const point = V( EVENT_SITES[ event.site ], event.type === 'shoal' ? - 1.6 : 0.6 + this.world.eventSurfaceY );
		if ( ! subjectVisible( a, point, event.type === 'shoal' ? 14 : 8, 0.45, a.player.position ) ) return;
		const moving = a.boatCtl.velocity.length() > 0.9;
		if ( moving ) { a.player.prompt = { key: '停船', text: '靠近电台目标 · 降低船速再互动' }; return; }
		if ( event.type === 'supply' && g.state.fuelL < 10 ) { a.player.prompt = { key: '柴油不足', text: '需要 5 升转交，并留下至少 5 升自用；可稍后再来' }; return; }
		a.player.prompt = { key: 'G', text: event.type === 'supply' ? '转交 5 升柴油 · 获得 $30 油费' : event.type === 'drift' ? '收好旧信箱 · 获得 $15 整理费' : '记下黄昏鱼群的见闻' };
		if ( a.input.hit( 'KeyG' ) && g.state.voyageAction( 'finish', { serial: event.serial, hour: g.hour } ) ) g.toast( event.type === 'supply' ? '海燕号：“收到了，多谢！回程一路平安。”' : event.type === 'drift' ? '信箱里是旧海图与平安家书 · 见闻已记入电台日志' : '银色小鱼在船边转过一圈 · 见闻已记入电台日志', 5000 );

	}

	salvageInteraction( dt ) {

		const g = this.game, a = g.app, v = g.state.voyage;
		if ( ! g.state.isGroundUnlocked( 'reef' ) ) return;
		if ( a.player.mode === 'swim' && a.camera.position.y < - 1 && ! v.hooked ) for ( const item of SALVAGE ) {

			const point = this.world.salvage.get( item.id ).point;
			if ( v.salvaged.includes( item.id ) || ! subjectVisible( a, point, 3.5, 0.6 ) ) continue;
			a.player.prompt = { key: 'G', text: '为' + item.name + '挂好打捞绳 · 回到远海大船操作绞盘' };
			if ( a.input.hit( 'KeyG' ) && g.state.voyageAction( 'hook', { id: item.id, hour: g.hour } ) ) { this.haul = 0; g.toast( '打捞绳已挂好 · 需要远海大船驶近目标，停稳后长按 G 起吊', 5500 ); }
			return;

		}
		if ( ! this.aboard || ! v.hooked ) return;
		const item = this.world.salvage.get( v.hooked );
		if ( Math.hypot( a.boatCtl.position.x - item.point.x, a.boatCtl.position.z - item.point.z ) > 12 ) return;
		if ( g.state.boatId !== 'offshore' ) { a.player.prompt = { key: '大船绞盘', text: '此物件已挂绳 · 到玛尔塔处换远海大船后再来起吊' }; return; }
		const boat = a.boatCtl, up = new Vector3( 0, 1, 0 ).applyQuaternion( boat.quaternion );
		const unsafe = boat.velocity.length() > 0.8 || up.y < Math.cos( 0.22 ) || a.weather?.thunderstorm;
		if ( unsafe ) { a.player.prompt = { key: '暂停起吊', text: '降低船速、等船身稳定且雷暴过去 · 打捞绳仍保留' }; return; }
		a.player.prompt = { key: '长按 G', text: `绞盘起吊 ${ Math.floor( this.haul * 100 ) }% · 松手暂停，保持停船` };
		if ( a.input.down( 'KeyG' ) ) this.haul = Math.min( 1, this.haul + dt / 12 );
		this.world.haul = this.haul;
		if ( this.haul >= 1 && g.state.voyageAction( 'haul', { id: v.hooked, hour: g.hour } ) ) {

			this.haul = this.world.haul = 0; g.toast( '打捞完成 · 物件已放进驾驶舱收藏架，按 B 可更换陈列', 5500 );

		}

	}

}
