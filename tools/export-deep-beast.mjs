// Export the game's original procedural mesh for editing in Blender; not a runtime dependency.
// node tools/export-deep-beast.mjs <output-directory>
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildDeepBeast } from '../src/world/DeepBeast.js';

const out = resolve( process.argv[ 2 ] || '../deep-beast' );
mkdirSync( out, { recursive: true } );
const { geometry: g } = buildDeepBeast();
const attributes = Object.fromEntries( [ 'position', 'normal', 'color', 'aux' ].map( ( name ) => [ name, Array.from( g.attributes[ name ].array ) ] ) );
writeFileSync( out + '/mesh.json', JSON.stringify( { ...attributes, indices: Array.from( g.index.array ) } ) );
console.log( 'Blender mesh input:', out + '/mesh.json' );
