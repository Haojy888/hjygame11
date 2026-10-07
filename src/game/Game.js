import { Vector3, Color } from '../engine/index.js';
import { WORLD } from '../world/WorldLayout.js';
import { FISH } from './FishTable.js';
import { habitatAt, fishGround, pickSpecies, rollWeight, biteDelay } from './Bites.js';
import { GROUNDS, CHAPTERS } from './Orders.js';
import { CatchMinigame } from './CatchMinigame.js';
import { GameState } from './GameState.js';
import { FishingRod } from './FishingRod.js';
import { FishStand, STAND } from './FishStand.js';
import { Chandlery, CHANDLERY } from './Chandlery.js';
import { CatchDisplay } from './CatchDisplay.js';
import { UPGRADES, fuelBurn } from './Gear.js';
import { GameHUD } from './GameHUD.js';
import { Minimap } from './Minimap.js';
import { WorldMap } from './WorldMap.js';
import { Guide } from './Guide.js';
import { StoryWorld, STORY_SPOTS } from './StoryWorld.js';
import { storyObjective, storyDialogue } from './Story.js';

// how long the catch card stays up unless dismissed (ms)
const CATCH_CARD_MS = 9000;

// The fishing game on top of the world:
//   R          take out / put away the rod (on foot, on the pier, on the boat's deck)
//   hold LMB   wind up, release to cast (hold longer = farther)
//   LMB        strike when a fish takes the bobber ("!"); then hold LMB to reel, let go to ease off
//   RMB        reel an empty line back in
//   I / Tab    cooler / hold contents and the fish log
//   E          at the fish stand: sell your catch
export class Game {

	constructor( app ) {

		this.app = app;
		this.state = new GameState();
		this.state.load();
		this.rod = new FishingRod( { scene: app.scene, camera: app.camera, query: app.query, terrain: app.terrainData, audio: app.audio } );
		this.rod.onLand = ( where ) => this.onBobberLanded( where );
		this.stand = new FishStand( { scene: app.scene, terrain: app.terrainData, colliders: app.colliders } );
		this.display = new CatchDisplay( { scene: app.scene, stall: this.stand.iceFish() } );
		this.landing = null; // { species, kg } while the caught fish swings in view
		this.chandlery = new Chandlery( { scene: app.scene, terrain: app.terrainData, colliders: app.colliders, material: this.stand.material } );
		this.vendors = [ this.stand.vendor, this.chandlery.vendor ];
		this.storyWorld = new StoryWorld( app );
		this.storyWorld.update( this.state.story, this.hour, 0 );
		// boat upgrades: engine (thrust / top speed) and deck floodlights for night fishing
		const b = app.boatCtl;
		this._engineBase = { maxThrust: b.maxThrust, pitchSpeed: b.pitchSpeed };
		this.floods = [];
		if ( app.localLights ) this.addFloodlights( app.localLights, app.boat );
		this._fuelOut = false;
		this._sonarT = 0;
		this._sonar = null;
		this.rescueHold = 0;
		this.hud = null;
		this.fight = null; // CatchMinigame while a fish is on
		this.bite = null; // { phase: 'wait' | 'nibble' | 'take', t, nibbles, species, kg }
		this._lmb = false;
		this._rmb = false;
		this._hookedSpecies = null;
		this._pier = WORLD.pier;
		this._tmp = new Vector3();
		this.applyGear();
		this.state.onChange( () => this.applyGear() );

	}

	applyGear() {

		const g = this.state.stats;
		this.rod.setGear( { castM: g.castM, reelSpeed: g.reelSpeed } );
		const b = this.app.boatCtl;
		if ( b && this._engineBase ) {

			b.maxThrust = this._engineBase.maxThrust * g.speedMul * g.speedMul;
			b.pitchSpeed = this._engineBase.pitchSpeed * g.speedMul;

		}

		for ( const f of this.floods || [] ) f.scale = g.deckLights ? 1 : 0;

	}

	// two floodlights under the back of the wheelhouse roof, lighting the cockpit and the water
	// astern (night only, like every local light; switched by the lights upgrade)
	addFloodlights( lights, boat ) {

		const obj = boat.group;
		for ( const x of [ - 0.8, 0.8 ] ) {

			const local = new Vector3( x, 2.25, - 1.0 );
			const localDir = new Vector3( x * 0.25, - 0.75, - 0.62 ).normalize();
			const src = {
				position: new Vector3(), color: new Color( 1.0, 0.93, 0.8 ), intensity: 3.2, range: 14, kind: 'boatFlood',
				dir: new Vector3(), cosInner: 0.8, cosOuter: 0.45, scale: 0,
				update() {

					obj.updateWorldMatrix( true, false );
					this.position.copy( local ).applyMatrix4( obj.matrixWorld );
					this.dir.copy( localDir ).transformDirection( obj.matrixWorld );

				},
			};
			src.update();
			this.floods.push( src );
			lights.add( src );

		}

	}

	buy( key ) {

		const r = this.state.buy( key );
		if ( r ) this.toast( `${ UPGRADES[ key ].name }: ${ r.label }` );
		return r;

	}

	refuel() {

		const l = this.state.refuel();
		if ( l > 0 ) {

			this._fuelOut = false;
			this.toast( `已加油 · ${ l.toFixed( 0 ) } 升` );

		}

		return l;

	}

	toast( text, ms = 2600 ) {

		if ( this.hud ) this.hud.toast( text, ms );
		else console.log( '[game]', text );

	}

	get canFish() {

		const app = this.app, p = app.player;
		return ! app.freeCam && ( p.mode === 'walk' || p.mode === 'deck' ) && ! ( app.ui && app.ui.ui && app.ui.ui._photo );

	}

	rescueToHarbor() {

		const app = this.app;
		this.cancelLine( true );
		this.endLanding();
		this.rod.equip( false );
		this.hud?.toggleInventory( false );
		this.hud?.closeStand();
		this.worldMap?.toggle( false );
		if ( app.freeCam ) app.setFreeCam( false );
		app.boatCtl.reset();
		app.input.clear();
		app.player.rescueToHarbor();
		this.rescueHold = 0;
		this._lmb = this._rmb = this._wasDriven = false;
		this._sonar = null;
		this._sonarT = 0;
		this.state.save();
		this.toast( '救援完成 · 船已扶正并拖回泊位，你已返回码头；渔获和进度已保留', 5000 );

	}

	updateRescue( dt ) {

		const app = this.app, inp = app.input, ui = app.ui?.ui;
		const blocked = app.freeCam || this.worldMap?.open || ui?.helpOpen || ui?.panelOpen || ui?._photo || ui?._start
			|| this.hud?.invOpen || this.hud?.standOpen || this.hud?.catchOpen
			|| inp.enabled === false || inp.focused === false || inp.interrupted;
		if ( ! blocked && inp.down?.( 'KeyX' ) ) {

			this.rescueHold = ( this.rescueHold || 0 ) + Math.min( Math.max( dt, 0 ), 0.1 );
			if ( this.rescueHold >= 2 ) this.rescueToHarbor();

		} else this.rescueHold = 0;

	}

	get storyTarget() {

		if ( ! this.state.story || ( this.state.story.stage === 0 && this.state.orderIndex < 1 ) ) return null;
		const location = storyObjective( this.state ).location;
		if ( location === 'joe' ) return this.stand?.vendor.position || STAND;
		if ( location === 'marta' ) return this.chandlery?.vendor.position || CHANDLERY;
		return this.storyWorld?.[ location ]?.position || STORY_SPOTS[ location ] || null;

	}

	talkStory( choice ) {

		const app = this.app, vendor = this.hud?.vendor, ui = app.ui?.ui;
		if ( ! this.hud?.standOpen || ! vendor || app.freeCam || this.worldMap?.open || ui?.helpOpen || ui?._photo || this.guide?.open
			|| app.input.focused === false || app.player.mode !== 'walk' || ! vendor.inRange( app.player.position ) || this.fight ) return false;
		const dialogue = storyDialogue( this.state, vendor.kind );
		if ( ! dialogue?.choices.some( ( option ) => option.id === choice ) ) return false;
		if ( ! this.state.storyEvent( choice ) ) return false;
		this.toast( '剧情已更新 · 按 I 查看「最后一盏归航灯」日志', 3500 );
		return true;

	}

	updateStory( dt ) {

		if ( ! this.storyWorld ) return;
		const app = this.app, p = app.player, input = app.input, ui = app.ui?.ui;
		this.storyWorld.update( this.state.story, this.hour, dt );
		if ( app.freeCam || this.worldMap?.open || ui?.helpOpen || ui?.panelOpen || ui?._photo || ui?._start || this.guide?.open
			|| this.hud?.invOpen || this.hud?.standOpen || this.hud?.catchOpen
			|| input.enabled === false || input.focused === false || input.interrupted || this._cardDismissed ) return;
		const stage = this.state.story.stage, location = storyObjective( this.state ).location;
		if ( ! [ 1, 3, 5 ].includes( stage ) ) return;
		const target = this.storyTarget;
		const afloat = location === 'reef';
		if ( afloat ? ! [ 'boat', 'deck' ].includes( p.mode ) : p.mode !== 'walk' ) return;
		const pos = afloat ? app.boatCtl.position : p.position;
		if ( Math.hypot( pos.x - target.x, pos.z - target.z ) > ( afloat ? 12 : 3 ) ) return;
		if ( ! afloat && Math.abs( p.position.y - target.y ) > 2.5 ) return;
		const busy = p.busy || this.rod.equipped || this.fight;
		const stopped = ! afloat || ( ! app.boatCtl.capsized && app.boatCtl.speed < 1.2 );
		const hour = this.hour;
		const timeOK = stage === 1 || ( stage === 5 ? hour >= 18 || hour < 6 : afloat ? hour >= 17 && hour < 20 : hour >= 6 && hour < 18 );
		const action = stage === 1 ? '拾取瓶中信' : stage === 5 ? '点亮归航灯' : '核对旧航线';
		p.prompt = { key: 'G', text: busy ? '先收起鱼竿，再调查线索' : ! stopped ? '先减速停稳，再观察礁线'
			: ! timeOK ? `等待${ stage === 5 ? '夜间 18:00–06:00' : afloat ? '暮色 17:00–20:00' : '白天 06:00–18:00' } · H 可调整时刻` : action };
		if ( ! busy && stopped && timeOK && input.hit( 'KeyG' ) ) {

			if ( this.state.storyEvent( stage === 1 ? 'bottle' : stage === 3 ? 'survey' : 'light', { hour } ) ) {

				this.storyWorld.update( this.state.story, hour, 0 );
				this.toast( stage === 5 ? '归航灯亮了 · 渔港谢礼 $150 · 按 I 阅读结局' : '已记录新线索 · 按 I 查看剧情日志', 5000 );

			}

		}

	}

	// ---- per frame (after the player / camera update)
	update( dt ) {

		const app = this.app, p = app.player, inp = app.input, rod = this.rod;
		const ui = app.ui?.ui;
		this._cardDismissed = false;
		if ( ! this.hud && app.ui && app.ui.ui && typeof document !== 'undefined' && document.head ) {

			const ui = app.ui.ui;
			this.hud = new GameHUD( ui, this );
			// the minimap (lower right) and the first-play guide (intro, one-time tips; replay from F1)
			this.minimap = new Minimap( ui.hud || ui.root, this );
			this.worldMap = new WorldMap( ui, this, this.minimap );
			this.guide = new Guide( ui, this, this.minimap );
			ui.onReplayGuide = () => this.guide.replay();

		}

		this.updateRescue( dt );
		const can = this.canFish;
		if ( inp.hit( 'KeyR' ) && can && ! this.fight ) {

			rod.equip( ! rod.equipped );
			if ( ! rod.equipped ) this.cancelLine();
			this.toast( rod.equipped ? '已取出鱼竿 · 按住鼠标左键蓄力抛竿' : '已收起鱼竿', 1600 );

		}

		if ( ! can && rod.equipped ) {

			// swimming, driving, free camera: the line comes in and the rod goes away
			this.cancelLine( true );
			rod.equip( false );

		}

		if ( this.hud && ( inp.hit( 'KeyI' ) || inp.hit( 'Tab' ) ) ) this.hud.toggleInventory();
		if ( this.hud && inp.hit( 'Escape' ) ) {

			this.hud.toggleInventory( false );
			this.hud.closeStand();

		}

		const panelOpen = this.worldMap?.open || this.hud && ( this.hud.invOpen || this.hud.standOpen );
		const fishingPaused = !! ( panelOpen || ui?.helpOpen || inp.focused === false || inp.interrupted );
		if ( fishingPaused ) {

			if ( rod.state === 'windup' ) {

				rod.setState( 'idle' );
				rod.power = 0;

			}
			rod.crankRate = 0;
			this._lmb = this._rmb = false;

		} else if ( this._fishingPaused ) {

			// Require a fresh click after closing a menu or returning to the tab.
			inp.mouseDown = inp.rightDown = false;
			this._lmb = this._rmb = false;

		}
		this._fishingPaused = fishingPaused;
		this._fishingPauseHint = inp.focused === false || inp.interrupted ? '钓鱼已暂停 · 返回游戏窗口后继续' : '钓鱼已暂停 · 关闭当前界面后继续';
		// mouse edges (the left button also looks around while the pointer isn't captured)
		const lmb = ! fishingPaused && inp.mouseDown && inp.enabled, rmb = ! fishingPaused && inp.rightDown && inp.enabled;
		const lDown = lmb && ! this._lmb, lUp = ! lmb && this._lmb, rDown = rmb && ! this._rmb;
		this._lmb = lmb;
		this._rmb = rmb;

		if ( rod.equipped && ! fishingPaused ) {

			if ( rod.state === 'idle' && lDown ) rod.startWindup();
			else if ( rod.state === 'windup' && lUp ) rod.release();
			else if ( rod.state === 'floating' ) {

				if ( lDown ) this.strike();
				else if ( rDown ) {

					rod.retrieve();
					this.bite = null;

				}

			} else if ( rod.state === 'flying' && rDown ) rod.retrieve();

		}

		// bites and the fight
		if ( ! fishingPaused && rod.state === 'floating' ) this.updateBite( dt );
		else if ( ! this.fight ) rod.dip = Math.max( 0, rod.dip - ( fishingPaused ? 0 : dt ) * 4 );
		if ( this.fight && ! fishingPaused ) this.updateFight( dt, lmb );

		rod.update( fishingPaused ? 0 : dt, { visible: can, fight: this.fight } );
		// the landed fish hangs on the end of the line, turned to face you, then goes in the cooler. With
		// the HUD the catch card comes up once the fish has swung in, and the fish stays (slowly turning)
		// until the card is dismissed (click, E, Esc) or times out.
		const L = this.landing;
		if ( L && rod.state === 'landing' && can ) {

			const c = app.camera.position, m = rod.bobber;
			let yaw = Math.atan2( c.x - m.x, c.z - m.z );
			if ( L.card ) {

				if ( ! L.shown && rod.t > 0.3 ) {

					L.shown = true;
					this.hud.showCatch( L.card, CATCH_CARD_MS );

				}

				if ( L.shown ) {

					// a slow turn so both flanks show
					L.cardT += dt;
					yaw += Math.sin( L.cardT * 0.7 ) * 0.55;
					if ( lDown || inp.hit( 'KeyE' ) || inp.hit( 'Escape' ) || L.cardT > CATCH_CARD_MS / 1000 ) {

						this._cardDismissed = true; // this frame's E / click belong to the card
						this.endLanding();

					}

				}

			}

			if ( this.landing ) {

				// with the HUD the fish is shown on the full-screen catch card (studio portrait), not on
				// the line; without it (headless) it hangs on the line for a moment
				if ( ! L.card ) this.display.show( L.species, L.kg, m, yaw, dt );
				else if ( this.display.shown ) this.display.hide();
				if ( ! L.card && rod.t > 2.8 ) this.endLanding();

			}

		} else if ( this.landing || this.display.shown ) this.endLanding();

		p.busy = rod.lineInWater || rod.state === 'windup';

		this.updateBoat( dt );

		// the traders
		for ( const v of this.vendors ) v.update( dt, p.mode === 'walk' ? p.position : null );
		this.updateVendors( inp, p );
		this.updateStory( dt );

		// prompts when the player has nothing to say
		if ( fishingPaused && can && rod.equipped ) p.prompt = this.prompt();
		else if ( ! p.prompt && can ) p.prompt = this.prompt();

		const aboard = p.mode === 'boat' || p.mode === 'deck';
		const capsized = !! app.boatCtl?.capsized;
		if ( capsized || this.rescueHold > 0 ) p.prompt = { key: 'X', text: '长按 2 秒救援回港 · 保留已获渔获和进度' };
		// the catch card's live fish portrait (or one queued thumbnail)
		if ( this.hud && this.hud.portrait ) this.hud.portrait.update( dt );
		if ( this.hud ) this.hud.update( {
			rescue: capsized || this.rescueHold > 0 ? { capsized, hold: Math.min( 1, this.rescueHold / 2 ) } : null,
			fuel: aboard ? { litres: this.state.fuelL, tank: this.state.stats.fuelL } : null,
			sonar: aboard && this.state.stats.finder ? this._sonar : null,
			fight: this.fight,
			casting: rod.state === 'windup',
			power: rod.power,
			bite: this.bite && this.bite.phase === 'take',
			aiming: rod.equipped,
		} );
		if ( this.minimap ) this.minimap.update( dt );
		if ( this.worldMap ) this.worldMap.update( dt );
		if ( this.guide ) this.guide.update( dt );

	}

	prompt() {

		const rod = this.rod, p = this.app.player;
		if ( this._fishingPaused && rod.equipped ) return { key: '…', text: this._fishingPauseHint };
		if ( ! rod.equipped ) {

			// by the water (boat deck, pier, the wet beach, wading): suggest the rod
			const byWater = p.mode === 'deck' || ( p.mode === 'walk' && [ 'wood', 'wetsand', 'water' ].includes( p.surface ) );
			return byWater ? { key: 'R', text: '取出鱼竿' } : null;

		}

		const b = this.bite;
		switch ( rod.state ) {

			case 'idle': return { key: '左键', text: '按住蓄力，松开抛竿   ·   R 收起鱼竿' };
			case 'windup': return { key: '左键', text: '松开抛竿（蓄力越久，抛得越远）' };
			case 'flying': return null;
			case 'floating':
				if ( b && b.phase === 'take' ) return { key: '左键', text: '快提竿！' };
				if ( b && b.phase === 'nibble' ) return { key: '…', text: '鱼在试探鱼饵 · 等浮漂被拉入水中再提竿' };
				return { key: '右键', text: '等待鱼咬钩 · 点击鼠标右键收线' };
			case 'retrieving': return { key: '右键', text: '正在收线' };
			case 'fighting': return this.fight && this.fight.tension > this.fight.band[ 1 ]
				? { key: '左键', text: '鱼线张力过大 · 快松手！' }
				: { key: '左键', text: '按住收线 · 张力变红时松手' };
			case 'landing': return null;
			default: return null;

		}

	}

	// fuel burn at the helm (the engine stops when the tank is dry) and the fish finder
	updateBoat( dt ) {

		const app = this.app, b = app.boatCtl, p = app.player, s = this.state;
		if ( b.driven ) {

			const left = s.burn( fuelBurn( b.rpm ) * dt );
			if ( left <= 0 ) {

				b.throttle = 0;
				if ( ! this._fuelOut ) this.toast( '燃油耗尽 · 请到船屋旁的船具店购买柴油', 4000 );
				this._fuelOut = true;

			}

		} else if ( this._wasDriven ) s.save();
		this._wasDriven = b.driven;

		if ( ( p.mode === 'boat' || p.mode === 'deck' ) && s.stats.finder ) {

			this._sonarT -= dt;
			if ( this._sonarT <= 0 ) {

				this._sonarT = 0.5;
				const x = b.position.x, z = b.position.z;
				const depth = Math.max( 0, - app.terrainData.heightAt( x, z ) );
				const h = this.habitatAtPoint( x, z, depth );
				let rich = 0;
				if ( s.canFishAt( h ) ) for ( const k in h ) rich += h[ k ];
				this._sonar = { depth, fish: Math.min( 1, rich / 1.4 ) };

			}

		}

	}

	updateVendors( inp, p ) {

		const hud = this.hud;
		let near = null;
		if ( p.mode === 'walk' ) for ( const v of this.vendors ) if ( v.inRange( p.position ) ) near = v;
		for ( const v of this.vendors ) v.talking = !! ( hud && hud.standOpen && hud.vendor === v );
		if ( hud && hud.standOpen && ( ! near || near !== hud.vendor ) ) hud.closeStand();
		if ( ! near || this.fight || this._cardDismissed || ( hud && hud.catchOpen ) ) return;
		if ( ! p.prompt ) p.prompt = { key: 'E', text: hud && hud.standOpen ? '离开' : `与${ near.name.split( ' ·' )[ 0 ] }交谈` };
		if ( inp.hit( 'KeyE' ) ) {

			if ( ! hud ) {

				if ( near.kind === 'buyer' ) this.sellAll(); // headless: straight sale

			} else if ( hud.standOpen ) hud.closeStand();
			else hud.openStand( near );

		}

	}

	sellAll() {

		return this.sell();

	}

	sell( ids ) {

		const r = this.state.sell( ids );
		if ( r.count ) {

			this.toast( `卖出 ${ r.count } 条鱼，鱼款 $${ r.total }${ r.bonus ? ` · 任务奖金 $${ r.bonus }（完成 ${ r.completedOrders.length } 项）` : '' }` );
			if ( this.app.audio?.coin ) this.app.audio.coin();
			for ( const chapter of r.completedChapters ) this.toast( `${ chapter.name }完成！${ chapter.rewardText }`, 6500 );

		}
		return r;

	}

	// ---- bites
	habitat() {

		const { x, z } = this.rod.bobber;
		// Use the same seabed as the map and sonar; wave crests must not change fishing access.
		return this.habitatAtPoint( x, z, Math.max( 0, - this.app.terrainData.heightAt( x, z ) ) );

	}

	habitatAtPoint( x, z, depth ) {

		const b = { x, z };
		const reef = WORLD.reef;
		const reefDist = Math.hypot( b.x - reef.center.x, b.z - reef.center.z ) - reef.radius;
		const P = this._pier;
		const rect = ( x0, x1, z0, z1 ) => Math.hypot( Math.max( x0 - b.x, 0, b.x - x1 ), Math.max( z0 - b.z, 0, b.z - z1 ) );
		const walk = rect( P.x - P.width / 2, P.x + P.width / 2, P.zStart, P.zEnd );
		const head = rect( P.x - P.headWidth / 2, P.x + P.headWidth / 2, P.zEnd - P.headDepth, P.zEnd );
		return habitatAt( { depth, reefDist, pierDist: Math.min( walk, head ) } );

	}

	get hour() {

		return this.app.settings.timeOfDay;

	}

	checkFishingAccess( habitat ) {

		if ( this.state.canFishAt( habitat ) ) return true;
		const ground = GROUNDS[ fishGround( habitat ) ];
		const chapter = CHAPTERS.find( ( c ) => c.end === ground.unlockAfter );
		this.bite = null;
		this.rod.retrieve();
		this.toast( `${ ground.name }尚未开放垂钓 · 完成「${ chapter.name }」后解锁，按I查看航程`, 4500 );
		return false;

	}

	onBobberLanded( where ) {

		if ( where !== 'water' ) {

			this.toast( '鱼饵落在沙地上了', 1400 );
			return;

		}

		const habitat = this.habitat();
		if ( ! this.checkFishingAccess( habitat ) ) return;
		this.bite = { phase: 'wait', t: biteDelay( habitat, this.hour ) };

	}

	updateBite( dt ) {

		const rod = this.rod;
		const b = this.bite;
		if ( ! b ) return;
		if ( ! this.checkFishingAccess( this.habitat() ) ) return;
		b.t -= dt;
		// bobber motion for the cues
		if ( b.phase === 'nibble' ) rod.dip = Math.max( 0, Math.sin( Math.min( 1, ( b.pulse || 0 ) ) * Math.PI ) * 0.45 );
		else if ( b.phase === 'take' ) rod.dip += ( 1.4 - rod.dip ) * ( 1 - Math.exp( - dt * 14 ) );
		else rod.dip = Math.max( 0, rod.dip - dt * 3 );
		if ( b.phase === 'nibble' ) b.pulse = ( b.pulse || 0 ) + dt * 3.2;

		if ( b.t > 0 ) return;
		if ( b.phase === 'wait' ) {

			const h = this.habitat();
			const species = pickSpecies( h, this.hour );
			if ( ! species ) {

				b.t = 8;
				return;

			}

			b.species = species;
			b.kg = rollWeight( species );
			b.phase = 'nibble';
			b.nibbles = 1 + Math.floor( Math.random() * 3 );
			b.t = 0.7 + Math.random() * 0.8;
			b.pulse = 0;

		} else if ( b.phase === 'nibble' ) {

			b.nibbles --;
			b.pulse = 0;
			if ( b.nibbles > 0 ) b.t = 0.6 + Math.random() * 1.0;
			else {

				b.phase = 'take';
				// big, strong fish give a (slightly) shorter window
				b.t = 2.4 - FISH[ b.species ].fight * 0.5;
				if ( this.app.audio && this.app.audio.fishSplash ) this.app.audio.fishSplash( rod.bobber, 0.35 );

			}

		} else if ( b.phase === 'take' ) {

			this.toast( '鱼咬钩后逃走了', 1800 );
			this.bite = { phase: 'wait', t: biteDelay( this.habitat(), this.hour ) };

		}

	}

	strike() {

		const b = this.bite;
		if ( ! b || b.phase === 'wait' || b.phase === 'nibble' ) {

			// too early: a nibbling fish isn't hooked yet; it keeps nibbling (a hint, no penalty)
			if ( b && b.phase === 'nibble' ) this.toast( '还没到时候 · 等浮漂被拉入水中', 1500 );
			return;

		}

		if ( ! this.checkFishingAccess( this.habitat() ) ) return;
		const g = this.state.stats;
		this.fight = new CatchMinigame( { species: b.species, kg: b.kg, lineKg: g.lineKg, reelSpeed: g.reelSpeed, distance: Math.max( 3, this.rod.lineOut ) } );
		this.bite = null;
		this.rod.hook();
		this.toast( '鱼上钩了！', 1200 );

	}

	updateFight( dt, reeling ) {

		const f = this.fight;
		const st = f.update( dt, reeling );
		// the fish thrashes at the surface as each run starts
		const au = this.app.audio;
		if ( f.surge > 0.6 && ! f._splashed && au && au.fishSplash ) au.fishSplash( this.rod.bobber, 0.3 + 0.5 * Math.min( 1, f.kg / 8 ) );
		f._splashed = f.surge > 0.6 ? true : f.surge < 0.3 ? false : f._splashed;
		if ( st === 'fighting' ) return;
		this.fight = null;
		this.rod.dip = 0;
		const name = FISH[ f.species ].name;
		if ( st === 'caught' ) {

			const entry = this.state.addFish( f.species, f.kg, this.hour );
			const info = this.state.lastCatch;
			if ( au && au.fishSplash ) au.fishSplash( this.rod.bobber, 0.8 );
			if ( au && au.fishFlop ) au.fishFlop();
			// the catch card (with a HUD) while the fish hangs on the line; a toast otherwise
			if ( this.hud ) this.landing = { species: f.species, kg: f.kg, card: info, cardT: 0 };
			else {

				if ( entry ) this.toast( `${ info.record ? '刷新纪录！' : '' }${ name } · ${ entry.kg.toFixed( 2 ) } kg · $${ entry.value }`, 3600 );
				else this.toast( `${ name } · ${ f.kg.toFixed( 1 ) } 公斤 · ${ this.state.upgrades.hold > 0 ? '鱼舱' : '保温箱' }已满，已放生`, 3600 );
				this.landing = { species: f.species, kg: f.kg };

			}

			this.rod.land();

		} else if ( st === 'snapped' ) {

			this.toast( '啪！鱼线断了', 2400 );
			if ( au && au.lineSnap ) au.lineSnap();
			this.rod.setState( 'idle' );

		} else {

			this.toast( '鱼脱钩了', 2000 );
			this.rod.endFight();

		}

	}

	// the landed fish goes in the cooler: card, fish and line away
	endLanding() {

		this.landing = null;
		this.display.hide();
		if ( this.hud && this.hud.catchOpen ) this.hud.hideCatch();
		if ( this.rod.state === 'landing' ) this.rod.setState( 'idle' );

	}

	// line in at once (mode change)
	cancelLine( silent = false ) {

		if ( this.fight && ! silent ) this.toast( '鱼跑了', 1400 );
		this.fight = null;
		this.bite = null;
		if ( this.rod.state !== 'stowed' ) this.rod.setState( this.rod.equipped ? 'idle' : 'stowed' );

	}

}
