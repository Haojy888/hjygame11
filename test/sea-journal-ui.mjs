// Exercise the real renderers and bindings using the same small DOM surface as ui-usability.mjs.
import assert from 'node:assert/strict';
import { GameHUD } from '../src/game/GameHUD.js';
import { Guide } from '../src/game/Guide.js';
import { GameState } from '../src/game/GameState.js';

const classList = { add() {}, remove() {}, toggle() {} };
const previousDocument = globalThis.document;
globalThis.document = { activeElement: null };

class Panel {

	set innerHTML( html ) {

		this.html = html;
		this.nodes = { '.gm-list': { scrollTop: 0 } };
		this.buttons = [];
		for ( const match of html.matchAll( /<details class="([^"]+)"([^>]*)>/g ) ) {

			const classes = match[ 1 ].split( ' ' );
			const node = { open: /\bopen\b/.test( match[ 2 ] ), classList: { contains: ( cls ) => classes.includes( cls ) } };
			const summary = { tagName: 'SUMMARY', parentElement: node, focus() { document.activeElement = this; }, hasAttribute: () => false };
			for ( const cls of classes ) {

				this.nodes[ `.${ cls }` ] ||= node;
				this.nodes[ `details.${ cls }` ] ||= node;
				this.nodes[ `details.${ cls } > summary` ] ||= summary;

			}

		}
		for ( const match of html.matchAll( /<button[^>]*\b(data-[\w-]+)(?:="([^"]*)")?[^>]*>/g ) ) {

			const attr = match[ 1 ], value = match[ 2 ] || '';
			const key = attr.slice( 5 ).replace( /-([a-z])/g, ( _, c ) => c.toUpperCase() );
			const node = { dataset: { [ key ]: value }, hasAttribute: ( name ) => name === attr,
				getAttribute: () => value, focus: () => {

					if ( [ 'data-exhibit', 'data-cabin-photo' ].includes( attr ) && ! this.nodes[ 'details.gm-cabin' ]?.open ) return;
					document.activeElement = node;

				} };
			this.nodes[ `[${ attr }]` ] ||= node;
			this.nodes[ `[${ attr }="${ value }"]` ] = node;
			this.buttons.push( node );

		}

	}

	querySelector( selector ) { return this.nodes?.[ selector ] || null; }
	querySelectorAll( selector ) { return this.buttons?.filter( ( node ) => node.hasAttribute( selector.slice( 1, - 1 ) ) ) || []; }
	contains( node ) { return node != null && Object.values( this.nodes || {} ).includes( node ); }

}

try {

	const state = new GameState( null );
	state.seaJournal = { stage: 0, ending: null };
	const calls = [];
	const game = { state, talkSeaJournal: ( id ) => calls.push( `sea:${ id }` ), talkStory: ( id ) => calls.push( `story:${ id }` ), talkExpedition: ( id ) => calls.push( `wreck:${ id }` ) };
	const hud = Object.assign( Object.create( GameHUD.prototype ), {
		game, _last: {}, inv: new Panel(), stand: new Panel(), orderCard: new Panel(),
		invOpen: false, standOpen: false, vendor: { kind: 'buyer', name: '乔' },
		moneyEl: {}, coolerLabel: {}, coolerKg: {}, coolerBar: { style: {} }, coolerEl: { classList }, purse: { classList },
	} );
	assert.equal( hud.seaJournalMarkup(), '', 'unopened deep sea adds no inventory clutter' );
	assert.equal( hud.seaJournalDialogueMarkup( 'buyer' ), '' );
	hud.renderOrderCard();
	assert.doesNotMatch( hud.orderCard.html, /gm-sea-track/, 'unaccepted exploration is not tracked over the main objective' );
	state.legacyAccess = true;
	state.orderIndex = 1;
	hud.renderStand();
	assert.match( hud.stand.html, /<details class="gm-story-dialogue gm-sea-dialogue"><summary>/, 'optional conversation is collapsed by default' );
	hud.stand.querySelector( '[data-sea-journal="accept"]' ).onclick();
	hud.stand.querySelector( '[data-story="accept"]' ).onclick();
	assert.deepEqual( calls, [ 'sea:accept', 'story:accept' ], 'same-named story choices route to independent game actions' );
	hud.stand.querySelector( '[data-expedition="accept"]' ).onclick();
	assert.equal( calls.at( - 1 ), 'wreck:accept', 'wreck choices use their own state machine' );
	assert.match( hud.seaJournalMarkup(), /可探寻/ );

	state.story.stage = 1;
	state.seaJournal.stage = 2;
	hud.invOpen = true;
	hud.refresh();
	assert.match( hud.orderCard.html, /<summary>◎ 探索 ·/ );
	assert.match( hud.orderCard.html, /绿色 ◎ 指向见闻目标/ );
	assert.doesNotMatch( hud.orderCard.html, /☉/, 'the exploration marker differs from the fixed ruin location' );
	assert.match( hud.inv.html, /最后一盏归航灯/ );
	assert.match( hud.inv.html, /航海见闻 · 深海的回声/ );
	assert.match( hud.inv.html, /沉没的门廊/ );
	assert.doesNotMatch( hud.inv.html, /三 · 深海里的邻居/, 'the journal does not reveal unearned discoveries' );
	const selectors = [ 'details.gm-journey', 'details.gm-story-journal', 'details.gm-sea-journal', 'details.gm-expedition-journal', 'details.gm-field-guide' ];
	for ( const selector of selectors ) hud.inv.querySelector( selector ).open = true;
	hud.inv.querySelector( '.gm-list' ).scrollTop = 175;
	hud.inv.querySelector( 'details.gm-sea-journal > summary' ).focus();
	hud.orderCard.querySelector( '.gm-sea-track' ).open = true;
	hud.orderCard.querySelector( '.gm-story-track' ).open = true;
	hud.refresh();
	for ( const selector of selectors ) assert.equal( hud.inv.querySelector( selector ).open, true, `${ selector } stays expanded through refresh` );
	assert.equal( hud.inv.querySelector( '.gm-list' ).scrollTop, 175 );
	assert.equal( document.activeElement, hud.inv.querySelector( 'details.gm-sea-journal > summary' ), 'journal summary keeps keyboard focus' );
	assert.equal( hud.orderCard.querySelector( '.gm-sea-track' ).open, true );
	assert.equal( hud.orderCard.querySelector( '.gm-story-track' ).open, true );
	hud.inv.querySelector( 'details.gm-field-guide > summary' ).focus(); hud.refresh();
	assert.equal( document.activeElement, hud.inv.querySelector( 'details.gm-field-guide > summary' ), 'photography guide preserves keyboard focus' );

	state.seaJournal.stage = 3;
	hud.invOpen = false;
	hud.standOpen = true;
	hud.refresh();
	hud.stand.querySelector( 'details.gm-sea-dialogue' ).open = true;
	hud.stand.querySelector( '[data-sea-journal="wonder"]' ).focus();
	hud.stand.querySelector( '[data-sea-journal="wonder"]' ).onclick();
	hud.stand.querySelector( '[data-sea-journal="peace"]' ).onclick();
	assert.deepEqual( calls.slice( - 2 ), [ 'sea:wonder', 'sea:peace' ] );
	state.seaJournal = { stage: 4, ending: 'peace' };
	hud.refresh();
	assert.equal( hud.stand.querySelector( 'details.gm-sea-dialogue' ).open, true );
	assert.equal( document.activeElement, hud.stand.querySelector( 'details.gm-sea-dialogue > summary' ), 'finished choices move focus to their conversation summary' );
	assert.doesNotMatch( hud.orderCard.html, /gm-sea-track/, 'finished exploration stops occupying the goal card' );
	assert.match( hud.seaJournalMarkup(), /深海见证者/ );
	assert.match( hud.seaJournalMarkup(), /岸上有人等我回来/ );
	state.seaJournal.ending = 'wonder';
	assert.match( hud.seaJournalMarkup(), /下一次，我仍想带着好奇出发/ );
	hud.vendor = { kind: 'shop', name: '玛尔塔', greeting: '欢迎' };
	hud.renderShop();
	assert.match( hud.stand.html, /看你|照看/ );
	assert.match( hud.stand.html, /data-fuel/ );
	assert.match( hud.stand.html, /data-workshop/ );
	state.fieldPhotos = Object.fromEntries( [ 'starfish', 'urchin', 'anemone' ].map( ( id ) => [ id, {} ] ) );
	game.claimSurvey = ( id ) => calls.push( `survey:${ id }` );
	hud.renderShop();
	hud.stand.querySelector( 'details.gm-marine-survey' ).open = true;
	hud.stand.querySelector( '[data-survey="small-life"]' ).onclick();
	assert.equal( calls.at( - 1 ), 'survey:small-life' );
	hud.stand.querySelector( '[data-survey="small-life"]' ).focus();
	state.surveyClaims = [ 'small-life' ]; hud.refresh();
	assert.equal( hud.stand.querySelector( 'details.gm-marine-survey' ).open, true );
	assert.equal( document.activeElement, hud.stand.querySelector( 'details.gm-marine-survey > summary' ), 'claiming removes the button and returns focus to its survey summary' );
	game.app = { player: { mode: 'boat' } }; game.voyage = { command: ( action ) => calls.push( 'radio:' + action ) };
	hud.standOpen = false; hud.invOpen = true; hud.renderInventory();
	hud.inv.querySelector( '[data-radio="accept"]' ).onclick(); assert.equal( calls.at( - 1 ), 'radio:accept' );
	hud.inv.querySelector( 'details.gm-radio' ).open = true; hud.inv.querySelector( 'details.gm-cabin' ).open = true;
	hud.inv.querySelector( '[data-radio="accept"]' ).focus(); state.voyage.station = 1; hud.refresh();
	assert.equal( hud.inv.querySelector( 'details.gm-radio' ).open, true ); assert.equal( hud.inv.querySelector( 'details.gm-cabin' ).open, true );
	assert.equal( document.activeElement, hud.inv.querySelector( 'details.gm-radio > summary' ), 'responding returns focus to radio summary when the button disappears' );
	state.voyage.salvaged = [ 'bell' ]; hud.refresh(); hud.inv.querySelector( 'details.gm-cabin' ).open = true;
	hud.inv.querySelector( '[data-exhibit="bell"]' ).focus(); state.voyage.display = 'bell'; hud.refresh();
	assert.equal( document.activeElement, hud.inv.querySelector( '[data-exhibit="bell"]' ), 'cabin details reopen before restoring focus to a display button' );
	hud.invOpen = false; hud.standOpen = true; hud.vendor = { kind: 'buyer', name: '乔' }; state.voyage.station = 4;
	game.returnStation = () => calls.push( 'station:return' ); hud.renderStand();
	hud.stand.querySelector( '[data-station-return]' ).onclick(); assert.equal( calls.at( - 1 ), 'station:return' );
	hud.stand.querySelector( '[data-station-return]' ).focus(); state.voyage.station = 5; hud.refresh();
	assert.equal( document.activeElement, hud.stand.querySelector( 'details.gm-station-dialogue > summary' ) );

	const guide = Object.assign( Object.create( Guide.prototype ), {
		ui: { _start: false }, game: { state, app: { player: { mode: 'walk', position: { x: 0, z: 0 } } }, rod: {}, vendors: [] },
		eyebrow: {}, title: {}, body: {}, dots: [], nextBtn: {}, el: { classList },
		open: false, _wait: - 1, _queue: [], _prev: {}, seen: {}, coach: { classList }, coachText: {},
	} );
	guide.show( 0 );
	assert.equal( guide.title.textContent, '自由出海，带着故事回港' );
	assert.match( guide.body.innerHTML, /4 章、8 个任务/ );
	assert.match( guide.body.innerHTML, /乔和玛尔塔/ );
	guide.open = false;
	state.seaJournal.stage = 0;
	guide.update( 0.1 );
	assert.match( guide.coachText.innerHTML, /深海的回声/ );
	assert.equal( guide.seen.deep, true );
	guide.update( 8 );
	guide.update( 0.1 );
	assert.deepEqual( guide._queue, [], 'the deep-sea coach is displayed only once' );
	assert.equal( guide._current, null );

} finally {

	if ( previousDocument === undefined ) delete globalThis.document;
	else globalThis.document = previousDocument;

}

console.log( 'Sea journal UI checks passed: collapsed exploration, dialogue actions, independent stories, focus, journal and guide.' );
