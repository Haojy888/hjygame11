export const SURVEY_SITES = [
	{ id: 'starfish', name: '海星沙园', x: - 38, z: 153, companions: [ 'meadow', 'penicillus', 'conch' ] },
	{ id: 'urchin', name: '海胆礁坡', x: - 139, z: 152, companions: [ 'bayBoulder', 'halimeda', 'tube' ] },
	{ id: 'anemone', name: '海葵浅庭', x: - 151, z: 104, companions: [ 'bayBoulder', 'meadow', 'rod' ] },
];

export const MARINE_SURVEYS = [
	{ id: 'small-life', title: '沙与礁间的小生命', ground: 'reef', subjects: [ 'starfish', 'urchin', 'anemone' ], reward: 60, text: '玛尔塔想做一本海湾小册子。到地图上的三个观察潜点，分别留下一张小生物近照。' },
	{ id: 'wreck-life', title: '旧船的新邻居', ground: 'reef', subjects: [ 'wreck', 'jelly', 'cave' ], reward: 80, text: '木船停下了，海底的生活还在继续。记录归潮号、水母和潮光岩洞，把沿途的景象带回港口。' },
	{ id: 'open-water', title: '从珊瑚礁到深海', ground: 'deep', subjects: [ 'turtle', 'eagleRay', 'elder' ], reward: 120, text: '记录海龟、鹰鳐和遗迹巨章。保持距离，平安回来；这些照片会成为小册子的最后一章。' },
];

export function normalizeSurveyClaims( value ) {

	return MARINE_SURVEYS.filter( ( s ) => Array.isArray( value ) && value.includes( s.id ) ).map( ( s ) => s.id );

}

export function surveyProgress( state, id ) {

	const survey = MARINE_SURVEYS.find( ( s ) => s.id === id );
	if ( ! survey ) return null;
	const count = survey.subjects.filter( ( subject ) => Object.hasOwn( state.fieldPhotos || {}, subject ) ).length;
	const unlocked = state.isGroundUnlocked( survey.ground ), claimed = !! state.surveyClaims?.includes( id );
	return { survey, count, unlocked, claimed, ready: unlocked && ! claimed && count === survey.subjects.length };

}
