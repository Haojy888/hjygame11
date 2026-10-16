import { BOATS } from './Boats.js';

export const PAINT_PARTS = { hull: '船体主色', stripe: '船身色带', cabin: '船舱与顶棚', bottom: '防污底漆' };
export const PAINT_PRESETS = [
	{ id: 'ocean', name: '海蓝白帆', hull: '#f2efe6', stripe: '#15688f', cabin: '#f1f0eb', bottom: '#7a1d15' },
	{ id: 'rescue', name: '海岸救援', hull: '#e96c21', stripe: '#182c43', cabin: '#f7f3e8', bottom: '#27363b' },
	{ id: 'forest', name: '松林远航', hull: '#245a50', stripe: '#dab879', cabin: '#e3ddc9', bottom: '#202c32' },
	{ id: 'cherry', name: '赤霞归港', hull: '#9f343b', stripe: '#efe5cf', cabin: '#f5eee0', bottom: '#202a38' },
	{ id: 'midnight', name: '午夜极光', hull: '#24394e', stripe: '#42b9b0', cabin: '#d3e1e3', bottom: '#15212e' },
];

export function defaultBoatCustomization( boatId = 'coastal' ) {

	return { hull: '#f2efe6', stripe: boatId === 'offshore' ? '#125b85' : '#0f1a30',
		cabin: '#f1f0eb', bottom: '#7a1d15', finish: 'gloss', rodRack: false, fenders: false };

}

export function normalizeBoatCustomization( input, boatId ) {

	const result = defaultBoatCustomization( boatId );
	if ( ! input || typeof input !== 'object' || Array.isArray( input ) ) return result;
	for ( const key of Object.keys( PAINT_PARTS ) ) if ( typeof input[ key ] === 'string' && /^#[\da-f]{6}$/i.test( input[ key ] ) ) result[ key ] = input[ key ].toLowerCase();
	if ( input.finish === 'matte' ) result.finish = 'matte';
	for ( const key of [ 'rodRack', 'fenders' ] ) result[ key ] = input[ key ] === true;
	return result;

}

export function normalizeBoatCustomizations( saved ) {

	return Object.fromEntries( Object.keys( BOATS ).map( id => [ id, normalizeBoatCustomization( saved?.[ id ], id ) ] ) );

}
