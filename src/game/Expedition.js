export const WRECK_SITE = { x: - 48, z: 205 };
export const CAVE_SITE = { x: - 78, z: 225 };
export const freshExpedition = () => ( { stage: 0 } );
export const normalizeExpedition = ( value ) => ( { stage: Number.isInteger( value?.stage ) && value.stage >= 0 && value.stage <= 5 ? value.stage : 0 } );

export const FIELD_SUBJECTS = {
	starfish: { name: '垫状海星', range: 3.5, note: '在海星沙园贴近海床观察，橙色的五条腕伸在沙与海草之间。按 M 找到观察潜点。' },
	urchin: { name: '长棘海胆', range: 4, note: '海胆礁坡的小岩石旁，细长的黑棘围绕着身体展开。保持一点距离，用手电看清轮廓。' },
	anemone: { name: '浅礁海葵', range: 4.5, note: '海葵浅庭位于礁区西侧浅水，柔软触手随水流缓慢摇摆。靠近后把它放到画面中间。' },
	turtle: { name: '绿海龟', range: 12, note: '海龟用前鳍划水，后鳍辅助转向。靠近时留一点距离，也许能看到它上浮换气。' },
	eagleRay: { name: '斑点鹰鳐', range: 16, note: '白斑沿着菱形鳍盘展开，细长的尾巴拖在身后。它沿礁坡巡游，用胸鳍平稳推进。' },
	elder: { name: '深海巨章', range: 24, note: '遗迹中的幻想生命。八条腕足缓缓舒展，巨大的身体在石柱间小范围巡游。' },
	jelly: { name: '漂游水母', range: 12, note: '伞部一张一收，触手随水流摆动。这里的夜间微光是艺术表现，并非所有水母都会发光。' },
	wreck: { name: '归潮号沉船', range: 26, note: '船肋和木板已成为海底的一部分。旧船的最后一程，藏在敞开的货舱里。' },
	cave: { name: '潮光岩洞', range: 22, note: '岩层形成短短的海底通道，两端都能通行，顶部裂隙为洞内留下一线光。' },
	dolphin: { name: '瓶鼻海豚', range: 16, note: '海豚在海湾外缘小群巡游，有时会伴船前行或跃出水面。潜入水下，留些距离观察它们上下摆动的尾鳍。' },
	moray: { name: '礁洞海鳗', range: 5, note: '洞口露出的脑袋慢慢摆动，嘴巴一张一合。用手电照亮洞口，在外面观察。' },
	seahorse: { name: '海草间的海马', range: 3.5, note: '卷曲的小尾巴贴着海草，身体轻轻摇晃。靠近海马草庭，仔细找找三只小海马。' },
	whalebones: { name: '鲸落骨廊', range: 18, note: '半埋的脊骨与成对肋骨铺在远海沙地，贝壳和珊瑚附着其上。骨廊中央留着一条可穿行的通道。' },
};

export function normalizeFieldPhotos( value ) {

	const photos = {};
	for ( const id of Object.keys( FIELD_SUBJECTS ) ) {

		const p = value?.[ id ];
		if ( ! p || typeof p.image !== 'string' || p.image.length > 60000 || ! /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test( p.image )
			|| ! [ p.x, p.y, p.z, p.hour ].every( Number.isFinite ) ) continue;
		photos[ id ] = { image: p.image, x: p.x, y: p.y, z: p.z, hour: ( p.hour % 24 + 24 ) % 24 };

	}
	return photos;

}

export function expeditionObjective( state ) {

	return [
		{ title: '潮声里的旧船', text: '开放珊瑚礁后，到乔的鱼摊听听归潮号的传闻。', location: 'joe' },
		{ title: '归潮号还在那里', text: '按 M 跟随 ⚓，潜到沉船船首，按 G 辨认旧船。', location: 'bow' },
		{ title: '敞开的货舱', text: '从船体中部的破口或上方进入货舱。靠近旧日志，按 G 阅读。', location: 'log' },
		{ title: '潮光岩洞的另一端', text: '日志留下岩洞线索。沿地图到岩洞，从任一入口穿过，寻找出口附近的旧罗盘。', location: 'compass' },
		{ title: '把归航的故事带回去', text: '回港找乔交谈。也可以先按 P，面向水下景物按 G 留下照片。', location: 'joe' },
		{ title: '归潮号，终于靠岸', text: '归潮号的故事已回到港口。下一次出海，还可以继续收集水下照片。', location: null },
	][ state.expedition?.stage || 0 ];

}

export function expeditionDialogue( state, kind ) {

	if ( ! state.expedition || ! state.isGroundUnlocked( 'reef' ) ) return null;
	const stage = state.expedition.stage;
	if ( kind === 'shop' ) return stage > 0 ? { text: stage === 5 ? '玛尔塔：“乔把那张旧航线挂回了墙上。船虽留在海里，故事总算回家了。”' : '玛尔塔：“沉船和岩洞都在珊瑚礁南边。看天气，留够回程油；进洞先记住出口，迷路可以长按 X 救援。”', choices: [] } : null;
	if ( kind !== 'buyer' ) return null;
	if ( stage === 0 ) return { text: '乔翻出一张旧航线：“归潮号曾在礁区南面的风浪中失踪。船员后来都回来了，船和航海日志却没找到。你若路过，帮我看看那艘旧船吧。带回故事就好，别为了它冒险。”', choices: [ { id: 'accept', label: '记下归潮号的位置' } ] };
	if ( stage === 4 ) return { text: '乔听你念完日志，沉默了一会儿：“原来那晚，他们把最后一盏灯留在洞口，让后面的船找得到路。不是没能归航，是先把别人送回了家。”\n“谢谢你。现在这段故事，也终于靠岸了。”', choices: [ { id: 'return', label: '把日志与航线的见闻交给乔' } ] };
	return { text: stage === 5 ? '乔：“归潮号的故事，我讲给老船员们听了。他们说，改天一起去看你找到的地方。今天带回了什么照片？”' : '乔：“先看看船，再沿日志留下的岩洞线索慢慢找。不急，平安回来。”', choices: [] };

}

export function expeditionEntries( state ) {

	return [
		'乔给了我一张旧航线，归潮号在珊瑚礁南侧。没有期限，天气好时去看看。',
		'船首仍指向开阔的海面。破木板间有小鱼穿过，旧船已经成了另一种家。',
		'货舱日志写着：“退潮后向西南短洞航行。把灯留在出口，最后一个人再离开。”日志旁的航线指向潮光岩洞。',
		'穿过岩洞，出口边的旧罗盘还指着北。裂隙洒下微光，原来那一晚，人们就是循着这里的灯回到海面。',
		'我把这段见闻讲给乔听。我们没有把沉船搬回岸上，却让它最后一程的故事重新被人记住。',
	].slice( 0, Math.max( 0, ( state.expedition?.stage || 0 ) ) );

}
