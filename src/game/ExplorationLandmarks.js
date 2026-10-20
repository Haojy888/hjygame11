export const LIGHTHOUSE = { x: - 190, z: 238, baseY: 4.2, deckY: 2.4, steps: 60, rise: 0.22, stairRadius: 2.35 };
export const COASTAL_SITES = {
	dolphin: { x: 96, z: 128, name: '海豚巡游水域', icon: '≈', hint: '慢速航行观察海豚伴游；潜水后 P 取景、G 拍摄' },
	moray: { x: - 124, z: 119, name: '海鳗礁洞', icon: '◉', hint: '沿礁底寻找圆形洞口，L 开灯观察；P 取景、G 拍摄' },
	seahorse: { x: - 53, z: 139, name: '海马草庭', icon: '◉', hint: '海草间有三只海马，靠近到约 3 米拍摄' },
	whalebones: { x: 160, z: 325, name: '鲸落骨廊', icon: '⌒', hint: '下潜沿肋骨拱廊穿行，L 开灯、P 取景、G 拍摄' },
};
export const freshLandmarks = () => ( { lighthouseLit: false } );
export const normalizeLandmarks = value => ( { lighthouseLit: value?.lighthouseLit === true } );
