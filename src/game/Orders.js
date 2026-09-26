// A finite voyage. Qualifying sales advance the active request, including partial loads.
export const GROUNDS = {
	coast: { name: '近岸与海湾', unlockAfter: 0 },
	reef: { name: '珊瑚礁钓场', unlockAfter: 2 },
	deep: { name: '远海深水钓场', unlockAfter: 4 },
};

export const CHAPTERS = [
	{ name: '初识渔港', start: 0, end: 2, unlock: 'reef', gear: { line: 1 }, rewardText: '开放珊瑚礁钓场 · 赠送15磅鱼线' },
	{ name: '珊瑚巡游', start: 2, end: 4, unlock: 'deep', gear: { fishFinder: 1 }, rewardText: '开放远海深水钓场 · 赠送探鱼器' },
	{ name: '远海航线', start: 4, end: 6, gear: { lights: 1, hold: 1 }, rewardText: '赠送夜钓甲板灯与70公斤冰柜' },
	{ name: '海岸大师', start: 6, end: 8, gear: { engine: 1 }, rewardText: '获得「潮汐大师」称号 · 赠送翻新柴油机' },
];

export const ORDERS = [
	{ id: 'grunt', chapter: 0, title: '乔的第一笔生意', species: 'grunt', minKg: 0.5, count: 1, reward: 35, hint: '码头边全天可钓；合格渔获卖给乔即可交付。' },
	{ id: 'mullet', chapter: 0, title: '准备出海', species: 'mullet', minKg: 0.4, count: 2, reward: 45, hint: '白天在沙滩浅水钓条纹鲻鱼；可分次出售，进度会保留。' },
	{ id: 'yellowtail', chapter: 1, title: '珊瑚间的金色闪光', species: 'yellowtail', minKg: 0.7, count: 2, reward: 55, hint: '珊瑚礁清晨、傍晚更活跃；小地图金色标记指向推荐钓点。' },
	{ id: 'parrot', chapter: 1, title: '礁湖的色彩', species: 'parrot', minKg: 1.2, count: 1, reward: 80, hint: '白天在珊瑚礁寻找鹦嘴鱼；完成后可前往远海深水垂钓。' },
	{ id: 'redSnapper', chapter: 2, title: '第一次远海订单', species: 'redSnapper', minKg: 3, count: 2, reward: 130, hint: '驶向深水区，停船后按E离舵，再按R取竿；探鱼器可显示水深。' },
	{ id: 'tuna', chapter: 2, title: '破浪而来的力量', species: 'tuna', minKg: 6, count: 1, reward: 220, hint: '深水区清晨或傍晚；建议购买30磅鱼线和顺滑纺车轮，再挑战金枪鱼。' },
	{ id: 'mahi', chapter: 3, title: '追逐蓝海之光', species: 'mahi', minKg: 8, count: 1, reward: 280, hint: '白天在深水区寻找鬼头刀；建议30磅鱼线、顺滑纺车轮。' },
	{ id: 'tarpon', chapter: 3, title: '月下的海岸大师', species: 'tarpon', minKg: 12, count: 1, reward: 350, hint: '夜间回到码头或海湾；建议60磅鱼线和鼓式渔轮。按T让时间流逝，或在H设置中调整时刻。' },
];

export function matchesOrder( order, fish ) {

	return !! order && fish?.species === order.species && Number.isFinite( fish.kg ) && fish.kg >= order.minKg;

}
