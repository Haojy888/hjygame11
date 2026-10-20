export const SECRET_SITES = [
	{ id: 'tide', name: '潮蚀石窟', x: - 165, z: - 15, keepsake: '潮纹拓片', clue: '潮水退去，露出一行旧刻痕：“沿着水留下的线，总能找到回家的路。”' },
	{ id: 'night', name: '夜航微光', x: 181, z: - 22, keepsake: '夜航星纹', clue: '四道微光连成旧时的归港航线。最后的石纹上，星星与码头的灯重叠在一起。' },
	{ id: 'storm', name: '风暴后的侧舱', x: 135, z: 190, keepsake: '归航名牌', clue: '风浪冲开了卡住侧舱的浮木。舱内的名牌写着：“归航”，下面刻着所有船员的名字。' },
];
export const NIGHT_TRAIL = [ { x: 181, z: - 22 }, { x: 185, z: - 13 }, { x: 190, z: - 5 }, { x: 188, z: 4 } ];
// Reserve entrances and the walking route before the surrounding procedural
// rocks, vegetation and clutter are scattered.
export const SECRET_CLEARINGS = [ { x: - 165, z: - 13, r: 8 }, { x: 185, z: - 9, r: 18 }, { x: 135, z: 191, r: 10 } ];
export const nearSecret = ( x, z, pad = 0 ) => SECRET_CLEARINGS.some( s => Math.hypot( x - s.x, z - s.z ) < s.r + pad );
export const freshSecrets = () => ( { found: [], nightStep: 0, stormSeen: false, stormCleared: false } );
export function normalizeSecrets( value ) {

	const s = value || {}, found = SECRET_SITES.map( s => s.id ).filter( id => Array.isArray( s.found ) && s.found.includes( id ) );
	return { found, nightStep: found.includes( 'night' ) ? NIGHT_TRAIL.length : Number.isInteger( s.nightStep ) ? Math.max( 0, Math.min( NIGHT_TRAIL.length - 1, s.nightStep ) ) : 0,
		stormSeen: s.stormSeen === true, stormCleared: s.stormSeen === true && s.stormCleared === true };

}
export const secretNight = hour => Number.isFinite( hour ) && ( ( hour % 24 + 24 ) % 24 >= 20 || ( hour % 24 + 24 ) % 24 < 5 );
// Two smooth tides per game day. The engine's existing seaLevel drives the
// rendered surface, refraction, water queries, swimmers and boat buoyancy.
export const tideAt = hour => 0.65 * Math.cos( ( Number.isFinite( hour ) ? hour : 12 ) * Math.PI / 6 );
export function advanceTide( level, hour, dt ) {

	const step = Number.isFinite( dt ) ? Math.max( 0, Math.min( 0.1, dt ) ) : 0;
	return level + Math.max( - 0.04 * step, Math.min( 0.04 * step, tideAt( hour ) - level ) );

}
export function secretHint( id, secrets, { tide = 0, night = false, storm = false } = {} ) {

	if ( secrets?.found?.includes( id ) ) return '见闻已记下 · 可再次探索，按 I 阅读收藏';
	if ( id === 'tide' ) return tide <= - 0.35 ? '潮位已低 · 沿石窟入口涉水，面向刻痕按 G 拓印' : '等待退潮 · 低潮约在 6 时、18 时，T 可继续时间，H → 太阳可调整时刻';
	if ( id === 'night' ) return night ? `沿发光石痕前进 · 面向微光按 G，已读 ${ secrets?.nightStep || 0 } / ${ NIGHT_TRAIL.length } 道` : '20 时至次日 5 时，岸边会出现发光石痕；T 继续时间，H → 太阳可调整时刻';
	return storm ? '雷暴仍在持续 · 等风浪过去再下潜' : secrets?.stormCleared ? '侧舱已露出 · 从正面舱门游入，面向名牌按 G 记录' : '经历一阵雷暴后再来 · H → 天空 → 天气开启雷暴，关闭面板游玩约 10 秒后再关雷暴';

}
