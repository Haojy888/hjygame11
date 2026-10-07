// Boat selection is shared by the save loader, scene startup and Marta's shop.
export const DEFAULT_BOAT_ID = 'coastal';

export const BOATS = Object.freeze( {

	coastal: Object.freeze( { id: 'coastal', name: '近岸渔船', length: 8.2, beam: 2.9, description: '灵活的小型渔船，适合近岸与码头垂钓。' } ),
	offshore: Object.freeze( { id: 'offshore', name: '远海渔船', length: 13.12, beam: 3.915, description: '加长加宽的蓝白渔船，带遮阳棚和宽敞后甲板。' } ),

} );

export function getBoatProfile( id ) {

	return typeof id === 'string' && Object.hasOwn( BOATS, id ) ? BOATS[ id ] : BOATS[ DEFAULT_BOAT_ID ];

}
