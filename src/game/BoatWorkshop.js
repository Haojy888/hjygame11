import { Vector3 } from '../engine/index.js';
import { BOATS } from './Boats.js';
import { PAINT_PARTS, PAINT_PRESETS, defaultBoatCustomization } from './BoatCustomization.js';
import { UPGRADES, nextLevel } from './Gear.js';

const BOAT_GEAR = [ 'engine', 'stability', 'propeller', 'hold', 'fuel', 'fishFinder', 'lights' ];
const DESCRIPTIONS = {
	engine: '提升推进力与巡航速度', stability: '增强抗横摇阻尼；安装后可见舷侧舭龙骨',
	propeller: '降低掌舵时的燃油消耗；安装后可见螺旋桨导流罩', hold: '增加可带回港口的渔获重量',
	fuel: '提升油箱容量，新油箱附赠满箱柴油', fishFinder: '显示水深与鱼群', lights: '夜间照亮甲板与船尾水面',
};

export const WORKSHOP_CSS = /* css */`
.gm-panel.gm-workshop { width: min(1180px, calc(100vw - 56px)); height: min(700px, calc(100dvh - 80px));
	max-width: none; max-height: none; padding: 0; display: grid; grid-template-columns: minmax(0, 1fr) 370px;
	background: none; border: 0; box-shadow: none; backdrop-filter: none; -webkit-backdrop-filter: none; gap: 16px; }
.gm-workshop-view { position: relative; min-width: 0; border-radius: 18px; border: 1px solid var(--tw-line-2);
	background: linear-gradient(180deg, rgba(9,20,29,.55), transparent 28%, transparent 78%, rgba(9,20,29,.65));
	touch-action: none; cursor: grab; overflow: hidden; }
.gm-workshop-view:active { cursor: grabbing; }
.gm-workshop-caption { position: absolute; left: 20px; top: 20px; pointer-events: none; }
.gm-workshop-caption small { display: block; color: var(--tw-aqua); letter-spacing: .12em; margin-bottom: 7px; }
.gm-workshop-caption h2 { text-shadow: 0 2px 8px #000; }
.gm-workshop-camera { position: absolute; bottom: 18px; left: 16px; right: 16px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.gm-workshop-camera span { color: var(--tw-ink-2); font-size: 12px; text-shadow: 0 1px 4px #000; }
.gm-workshop-controls { display: flex; flex-direction: column; min-height: 0; padding: 20px; border: 1px solid var(--tw-line-2);
	border-radius: 18px; background: rgba(13,25,35,.97); box-shadow: 0 12px 45px #0008; }
.gm-workshop-controls .gm-list { flex: 1; margin: 0; padding: 0 6px 0 0; }
.gm-workshop-tabs { display: flex; gap: 5px; margin: 10px 0 15px; }
.gm-workshop-tabs button { flex: 1; padding: 8px 4px; }
.gm-workshop-tabs [aria-pressed=true] { color: #0c2024; background: var(--tw-aqua); }
.gm-paint-presets { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 7px; margin-bottom: 18px; }
.gm-paint-preset { border: 1px solid var(--tw-line); border-radius: 9px; padding: 8px 5px; background: var(--tw-fill); color: var(--tw-ink); cursor: pointer; font: inherit; font-size: 12px; }
.gm-paint-preset i { display: block; height: 18px; border-radius: 4px; margin-bottom: 6px; background: linear-gradient(135deg, var(--hull) 60%, var(--stripe) 60%); }
.gm-paint-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--tw-line); }
.gm-paint-row span { display: block; }
.gm-paint-row code { display: block; margin-top: 4px; color: var(--tw-ink-3); font-size: 11px; }
.gm-paint-row input[type=color] { width: 52px; height: 36px; border: 1px solid var(--tw-line-2); border-radius: 7px; padding: 2px; background: var(--tw-fill); cursor: pointer; }
.gm-paint-row select { font: inherit; color: var(--tw-ink); background: #263c4b; border: 1px solid var(--tw-line-2); border-radius: 7px; padding: 7px; }
.gm-workshop-note { margin: 14px 0; color: var(--tw-ink-3); line-height: 1.65; font-size: 12px; }
.gm-workshop-controls .gm-shop-row { gap: 10px; }
.gm-workshop-controls .gm-btn { padding: 8px 13px; }
.gm-workshop-controls .gm-foot { flex-wrap: wrap; }
.gm-workshop-save { width: 100%; }
.gm-workshop-controls button:focus-visible, .gm-workshop-controls input:focus-visible,
.gm-workshop-controls select:focus-visible, .gm-workshop-view button:focus-visible { outline: 2px solid var(--tw-aqua); outline-offset: 3px; }
@media (max-width: 1100px) { .gm-panel.gm-workshop { grid-template-columns: minmax(0,1fr) 320px; gap: 10px; } .gm-workshop-controls { padding: 15px; } }
`;

export class BoatWorkshop {

	constructor( hud ) {

		this.hud = hud;
		this.game = hud.game;
		this.isOpen = false;
		this.tab = 'paint';
		this.target = new Vector3();

	}

	show() {

		if ( ! this.game.canCustomizeBoat() ) return false;
		this.isOpen = true;
		this.draft = { ...this.game.state.boatCustomization };
		this.yaw = - 1.05;
		this.pitch = 0.29;
		this.zoom = 1;
		this.tab = 'paint';
		this.render();
		this.game.app.input.clear();
		this.game.app.post.taau._needsRestart = true;
		this.hud.stand.querySelector( '[data-workshop-back]' ).focus();
		return true;

	}

	hide() {

		if ( ! this.isOpen ) return;
		this.isOpen = false;
		this.pointer = null;
		this.hud.stand.classList.remove( 'gm-workshop' );
		this.game.app.boat.applyCustomization( this.game.state.boatCustomization, this.game.state.upgrades );
		this.game.app.post.taau._needsRestart = true;
		this.game.app.input.clear();

	}

	preview() {

		this.game.app.boat.applyCustomization( this.draft, this.game.state.upgrades );
		const saved = JSON.stringify( this.draft ) === JSON.stringify( this.game.state.boatCustomization );
		const button = this.hud.stand.querySelector( '[data-paint-save]' );
		if ( button ) { button.disabled = saved; button.textContent = saved ? '外观已保存' : '保存涂装与外观 · 免费'; }

	}

	render() {

		const panel = this.hud.stand, state = this.game.state;
		panel.classList.add( 'gm-workshop' );
		const colors = Object.entries( PAINT_PARTS ).map( ( [ key, label ] ) => `<label class="gm-paint-row"><span>${ label }<code data-hex="${ key }">${ this.draft[ key ] }</code></span><input type="color" data-paint="${ key }" value="${ this.draft[ key ] }" aria-label="${ label }"></label>` ).join( '' );
		const presets = [ { id: 'factory', name: '原厂配色', ...defaultBoatCustomization( state.boatId ) }, ...PAINT_PRESETS ];
		const paint = `<div class="gm-paint-presets">${ presets.map( p => `<button class="gm-paint-preset" data-preset="${ p.id }" style="--hull:${ p.hull };--stripe:${ p.stripe }"><i aria-hidden="true"></i>${ p.name }</button>` ).join( '' ) }</div>${ colors }
			<label class="gm-paint-row"><span>漆面质感</span><select data-finish aria-label="漆面质感"><option value="gloss" ${ this.draft.finish === 'gloss' ? 'selected' : '' }>亮光漆</option><option value="matte" ${ this.draft.finish === 'matte' ? 'selected' : '' }>哑光漆</option></select></label>
			<p class="gm-workshop-note">自由调色和预设均免费。左侧预览会保留船体纹理与自然光照；防污底漆位于水线以下。</p>`;
		const parts = [ [ 'rodRack', '船尾海钓竿架', '四支海钓竿与不锈钢架，安装在船尾外缘' ], [ 'fenders', '舷侧防撞护舷', '在舷外加挂四个软质护舷' ] ].map( ( [ key, name, text ] ) => `<div class="gm-shop-row"><span>${ name }<small>${ text }</small></span><button class="gm-mini" data-part="${ key }" aria-pressed="${ this.draft[ key ] }">${ this.draft[ key ] ? '已装 · 点击卸下' : '免费安装' }</button></div>` ).join( '' ) + '<p class="gm-workshop-note">这些外观部件可自由装卸。两艘船分别保存配置，装饰不会占用鱼舱或改变船体碰撞。</p>';
		const upgrades = BOAT_GEAR.map( key => {

			const track = UPGRADES[ key ], cur = track.levels[ state.upgrades[ key ] | 0 ], next = nextLevel( state.upgrades, key );
			return `<div class="gm-shop-row"><span>${ track.name }<small>当前：${ cur.label }</small><small>${ DESCRIPTIONS[ key ] }</small>${ next ? `<small>下一级：${ next.label }</small>` : '' }</span>${ next ? `<button class="gm-btn" data-refit="${ key }" ${ next.cost > state.money ? 'disabled' : '' }>$${ next.cost }</button>` : '<span class="gm-have">已满级</span>' }</div>`;

		} ).join( '' ) + '<p class="gm-workshop-note">性能改装扣除游戏金币后立即生效，两船共用等级。稳航套件增强阻尼，风暴或撞击仍可能导致翻船。</p>';
		panel.innerHTML = `<div class="gm-workshop-view" data-preview aria-label="船只实时预览，可拖拽旋转并滚轮缩放">
			<div class="gm-workshop-caption"><small>玛尔塔 · 船坞改装</small><h2>${ BOATS[ state.boatId ].name }</h2></div>
			<div class="gm-workshop-camera"><button class="gm-mini" data-view="side">侧面</button><button class="gm-mini" data-view="stern">船尾</button><button class="gm-mini" data-view="deck">俯视</button><span>拖动旋转 · 滚轮缩放</span></div></div>
			<div class="gm-workshop-controls"><h2>船坞改装与涂色</h2><p class="gm-sub">余额 $${ state.money.toLocaleString() } · 实船实时预览</p>
			<div class="gm-workshop-tabs" aria-label="改装分类">${ [ [ 'paint', '涂装' ], [ 'parts', '外观部件' ], [ 'gear', '性能改装' ] ].map( ( [ key, name ] ) => `<button class="gm-mini" data-workshop-tab="${ key }" aria-pressed="${ this.tab === key }">${ name }</button>` ).join( '' ) }</div>
			<div class="gm-list">${ this.tab === 'paint' ? paint : this.tab === 'parts' ? parts : upgrades }</div>
			<div class="gm-foot"><button class="gm-btn gm-workshop-save" data-paint-save>保存涂装与外观 · 免费</button><button class="gm-mini" data-workshop-back>返回船具店</button><button class="gm-mini" data-workshop-close>离开 (E)</button></div></div>`;
		for ( const button of panel.querySelectorAll( '[data-workshop-tab]' ) ) button.onclick = () => { this.tab = button.dataset.workshopTab; this.render(); };
		for ( const input of panel.querySelectorAll( '[data-paint]' ) ) input.oninput = () => {

			this.draft[ input.dataset.paint ] = input.value;
			panel.querySelector( `[data-hex="${ input.dataset.paint }"]` ).textContent = input.value;
			this.preview();

		};
		for ( const button of panel.querySelectorAll( '[data-preset]' ) ) button.onclick = () => {

			const preset = presets.find( p => p.id === button.dataset.preset );
			for ( const key of Object.keys( PAINT_PARTS ) ) this.draft[ key ] = preset[ key ];
			this.render();

		};
		const finish = panel.querySelector( '[data-finish]' );
		if ( finish ) finish.onchange = () => { this.draft.finish = finish.value; this.preview(); };
		for ( const button of panel.querySelectorAll( '[data-part]' ) ) button.onclick = () => { const key = button.dataset.part; this.draft[ key ] = ! this.draft[ key ]; this.render(); };
		for ( const button of panel.querySelectorAll( '[data-refit]' ) ) button.onclick = () => { if ( this.game.canCustomizeBoat() ) this.game.buy( button.dataset.refit ); };
		panel.querySelector( '[data-paint-save]' ).onclick = () => this.game.saveBoatCustomization( this.draft );
		panel.querySelector( '[data-workshop-back]' ).onclick = () => { this.hide(); this.hud.renderShop(); this.hud.stand.querySelector( '[data-workshop]' ).focus(); };
		panel.querySelector( '[data-workshop-close]' ).onclick = () => this.hud.closeStand();
		for ( const button of panel.querySelectorAll( '[data-view]' ) ) button.onclick = () => {

			const view = button.dataset.view;
			this.yaw = view === 'side' ? - 1.05 : Math.PI;
			this.pitch = view === 'deck' ? 0.8 : view === 'stern' ? 0.4 : 0.29;
			this.zoom = 1;
			this.game.app.post.taau._needsRestart = true;

		};
		const view = panel.querySelector( '[data-preview]' );
		view.onpointerdown = e => { if ( e.button !== 0 || e.target.closest( 'button' ) ) return; this.pointer = { id: e.pointerId, x: e.clientX, y: e.clientY }; view.setPointerCapture( e.pointerId ); e.preventDefault(); };
		view.onpointermove = e => {

			if ( ! this.pointer || e.pointerId !== this.pointer.id ) return;
			this.yaw -= ( e.clientX - this.pointer.x ) * 0.007;
			this.pitch = Math.max( 0.12, Math.min( 0.8, this.pitch + ( e.clientY - this.pointer.y ) * 0.004 ) );
			this.pointer.x = e.clientX; this.pointer.y = e.clientY;

		};
		view.onpointerup = view.onpointercancel = view.onlostpointercapture = () => { this.pointer = null; };
		view.addEventListener( 'wheel', e => { e.preventDefault(); this.zoom = Math.max( 0.65, Math.min( 1.7, this.zoom * Math.exp( Math.max( - 100, Math.min( 100, e.deltaY ) ) * 0.002 ) ) ); }, { passive: false } );
		this.preview();
		this._viewportWidth = 0;

	}

	updateCamera() {

		if ( ! this.isOpen ) return;
		const app = this.game.app;
		const ui = app.ui?.ui;
		if ( ! this.hud.standOpen || app.freeCam || ui?.panelOpen || ui?.helpOpen || ui?._photo || ui?._start ) {

			this.hud.closeStand();
			return;

		}
		const camera = app.camera, boat = app.boat;
		const width = globalThis.innerWidth || 1280, height = globalThis.innerHeight || 720;
		if ( this._viewportWidth !== width || this._viewportHeight !== height ) {

			this._viewportWidth = width;
			this._viewportHeight = height;
			this._viewRect = this.hud.stand.querySelector( '[data-preview]' ).getBoundingClientRect();

		}
		boat.group.getWorldPosition( this.target );
		this.target.y += 0.8;
		const tan = Math.tan( camera.fov * Math.PI / 360 );
		const rect = this._viewRect;
		const distance = Math.max( boat.dimensions.length * 0.64 / ( camera.aspect * rect.width / width ),
			boat.dimensions.length * 0.48 / ( rect.height / height ) ) / tan * this.zoom;
		const sin = Math.sin( this.yaw ), cos = Math.cos( this.yaw ), flat = Math.cos( this.pitch ) * distance;
		camera.position.set( this.target.x + sin * flat, this.target.y + Math.sin( this.pitch ) * distance, this.target.z + cos * flat );
		const offset = distance * tan * camera.aspect * ( 1 - ( rect.left + rect.width / 2 ) * 2 / width );
		camera.lookAt( this.target.x + cos * offset, this.target.y, this.target.z - sin * offset );
		camera.updateMatrixWorld();

	}

}
