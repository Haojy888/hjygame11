// Joe's standing requests. The hints recommend where and when to fish; only species and weight
// determine whether a sold fish fulfils a request.
export const ORDERS = [
	{ id: 'grunt', species: 'grunt', minKg: 0.5, reward: 35, hint: '码头附近，全天都可能咬钩' },
	{ id: 'yellowtail', species: 'yellowtail', minKg: 0.7, reward: 55, hint: '珊瑚礁附近，清晨或傍晚更活跃；按 T 可切换时间流逝' },
	{ id: 'parrot', species: 'parrot', minKg: 1.2, reward: 80, hint: '珊瑚礁附近，白天更容易遇见' },
	{ id: 'redSnapper', species: 'redSnapper', minKg: 3, reward: 130, hint: '驶向深水区，全天都可能咬钩' },
	{ id: 'tuna', species: 'tuna', minKg: 6, reward: 220, hint: '深水区的清晨或傍晚' },
	{ id: 'tarpon', species: 'tarpon', minKg: 12, reward: 350, hint: '夜间码头或海湾；按 T 切换时间流逝，先升级鱼线并留足鱼舱空间' },
];

export function matchesOrder( order, fish ) {
	return fish?.species === order.species && fish.kg >= order.minKg;

}
