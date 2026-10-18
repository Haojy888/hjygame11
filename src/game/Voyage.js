export const STATION = { x: 110, z: 270 };
export const BUOY = { x: 115, z: 248 };
export const RECORDER = { x: 122, z: 274 };
export const SALVAGE = [
	{ id: 'bell', name: '旧船钟', x: - 35, z: 300 },
	{ id: 'compass', name: '黄铜罗盘', x: - 100, z: 320 },
	{ id: 'instrument', name: '观测仪器', x: 145, z: 332 },
];
export const EVENT_SITES = [ { x: 120, z: 160 }, { x: 90, z: 285 }, { x: - 140, z: 280 } ];
export const RESTORATION_SITES = [
	{ id: 'net', name: '沉船外的幽灵网', x: - 26, z: 190, action: '卷起废弃渔网', result: '旧网已运走，沉船外留出了供鱼群通行的空地。' },
	{ id: 'litter', name: '沙地回收点', x: 12, z: 142, action: '装袋回收海床废弃物', result: '锈罐与塑料瓶已装袋回港，小鱼重新游过这片沙地。' },
	{ id: 'nursery', name: '珊瑚苗圃', x: - 18, z: 118, action: '固定珊瑚苗架', result: '苗架已固定，小株珊瑚与礁鱼留下了新的家。' },
];
export const restorationReady = ( r, id ) => r?.active && ! r.reported && ! r.done.includes( id )
	&& RESTORATION_SITES.some( ( s ) => s.id === id ) && ( id !== 'nursery' || [ 'net', 'litter' ].every( ( key ) => r.done.includes( key ) ) );
export const EVENT_TYPES = {
	supply: { name: '一桶回程油', text: '海燕号：“发动机还好，油却快见底了。能否送来 5 升柴油？我们会付 $30 油费。”', task: '靠近海燕号，停稳船，按 G 转交 5 升柴油；需留下至少 5 升自用。' },
	shoal: { name: '黄昏的银色鱼群', text: '乔：“有人看见外海有小鱼聚成了银色的一团。坐标给你，路过可以停下看看。”', task: '按 M 前往电台坐标，靠近后可看到巡游小鱼；收竿面向鱼群按 G 记录。' },
	drift: { name: '风浪留下的信箱', text: '玛尔塔：“海面上漂着一只密封信箱，上面有我们港口的旧印记。顺路的话，带回来看看。”', task: '靠近海面信箱，收竿并面向它，按 G 收好；获得 $15 整理费。' },
};
export const STATION_STEPS = [
	'船上按 B 打开电台，回应失联观测站的旧呼号。',
	'跟随地图上的 ▤，靠近观测浮标，收竿后面向它按 G 读取编号。',
	'潜到观测站东侧，面向海床上的记录器按 G 读取撤离日志。',
	'回到船上，靠近观测站南侧的控制台；停稳后面向它按 G，重新接通电台。',
	'观测站已恢复播报。回港找乔，讲述这次修复经过。',
	'观测站重新守望海湾。航行中会收到它根据当前天气发出的播报。',
];
export const STATION_ENTRIES = [
	'旧呼号每隔一段时间就重复一次：“这里是海湾七号，自动值守……”坐标指向一座早已失联的观测站。',
	'浮标上的编号仍然清晰。沿缆线的方向，海床记录器里也许还保存着最后一份值班日志。',
	'记录器写着：“所有人员已安全撤离，仪器留在这里，等风浪过去。若有人回来，请让它继续为过路的船报天气。”',
	'我重新接通了控制台。天线下的指示灯亮起，海湾七号第一次不再重复求应，而是开始播报海况。',
	'乔说，那些观测员每年都会寄来问候。下一封回信里，他终于可以告诉他们：站里的灯又亮了。',
];
export const freshVoyage = () => ( { station: 0, event: null, cooldown: 35, serial: 0, salvaged: [], hooked: null, display: 'none', photo: 'none', log: [], restoration: { active: false, done: [], reported: false } } );
const ids = SALVAGE.map( ( s ) => s.id );
const bounded = ( n, lo, hi, fallback ) => Number.isFinite( n ) ? Math.min( hi, Math.max( lo, n ) ) : fallback;
export function normalizeVoyage( value ) {

	const v = value || {}, state = freshVoyage();
	state.station = Number.isInteger( v.station ) ? bounded( v.station, 0, 5, 0 ) : 0;
	state.cooldown = bounded( v.cooldown, 0, 300, 35 );
	state.serial = Number.isSafeInteger( v.serial ) ? bounded( v.serial, 0, 1000000000, 0 ) : 0;
	state.salvaged = ids.filter( ( id ) => Array.isArray( v.salvaged ) && v.salvaged.includes( id ) );
	state.hooked = ids.includes( v.hooked ) && ! state.salvaged.includes( v.hooked ) ? v.hooked : null;
	state.display = state.salvaged.includes( v.display ) ? v.display : 'none';
	state.photo = typeof v.photo === 'string' && /^[a-zA-Z]{3,20}$/.test( v.photo ) ? v.photo : 'none';
	const r = v.restoration;
	if ( r?.active === true ) {

		const done = RESTORATION_SITES.map( ( s ) => s.id ).filter( ( id ) => Array.isArray( r.done ) && r.done.includes( id ) );
		state.restoration = { active: true, done: done.filter( ( id ) => id !== 'nursery' || [ 'net', 'litter' ].every( ( key ) => done.includes( key ) ) ), reported: false };
		state.restoration.reported = r.reported === true && state.restoration.done.length === RESTORATION_SITES.length;

	}
	const e = v.event;
	if ( e && Object.hasOwn( EVENT_TYPES, e.type ) && Number.isInteger( e.site ) && e.site >= 0 && e.site < EVENT_SITES.length
		&& Number.isFinite( e.remaining ) && e.remaining > 0 && Number.isSafeInteger( e.serial ) && e.serial >= 0 ) {

		state.event = { type: e.type, site: e.site, remaining: Math.min( 600, e.remaining ), serial: e.serial, accepted: e.accepted === true };

	}
	const kinds = [ 'accept', 'buoy', 'record', 'repair', 'return', 'supply', 'shoal', 'drift', 'supply-done', 'shoal-done', 'drift-done', 'expired', 'declined', 'weather', 'whale', 'restore-start', 'restore-report', ...RESTORATION_SITES.map( ( s ) => 'restore-' + s.id ), ...ids.map( ( id ) => 'salvage-' + id ) ];
	state.log = ( Array.isArray( v.log ) ? v.log : [] ).filter( ( entry ) => kinds.includes( entry?.kind ) && Number.isFinite( entry.hour ) )
		.slice( - 24 ).map( ( entry ) => ( { kind: entry.kind, hour: ( entry.hour % 24 + 24 ) % 24 } ) );
	return state;

}
export function radioLogText( kind ) {

	const stage = [ 'accept', 'buoy', 'record', 'repair', 'return' ].indexOf( kind );
	if ( stage >= 0 ) return STATION_ENTRIES[ stage ];
	if ( kind === 'restore-start' ) return '玛尔塔送来回收袋和苗架：“先把旧网和废弃物带走，再给礁鱼留一个新家。”';
	if ( kind === 'restore-report' ) return '玛尔塔把这次行动记入港口日志。获得「海湾守护者」纪念称号与 $80 谢礼；以后还可以回潜点看看。';
	const restored = RESTORATION_SITES.find( ( s ) => kind === 'restore-' + s.id );
	if ( restored ) return restored.result;
	if ( kind === 'weather' ) return '收到海况播报。看实际天色与海浪，留够回程油。';
	if ( kind === 'whale' ) return '电台报告附近有座头鲸浮出水面。减速，保持距离，让它沿原来的航线经过。';
	if ( kind === 'expired' ) return '这次海上消息已结束，未完成也没有惩罚。';
	if ( kind === 'declined' ) return '我暂时没有回应，继续自己的航程。';
	if ( EVENT_TYPES[ kind ] ) return '收到消息：' + EVENT_TYPES[ kind ].name;
	if ( kind.endsWith( '-done' ) ) return '已记录这次遭遇：' + ( EVENT_TYPES[ kind.slice( 0, - 5 ) ]?.name || '' );
	return '已打捞：' + ( SALVAGE.find( ( s ) => kind === 'salvage-' + s.id )?.name || '' );

}
