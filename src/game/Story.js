export const STORY_TITLE = '最后一盏归航灯';

export const freshStory = () => ( { stage: 0, route: null, ending: null } );

export function normalizeStory( value ) {

	if ( ! value || typeof value !== 'object' || Array.isArray( value ) ) return freshStory();
	const stage = Number.isSafeInteger( value.stage ) && value.stage >= 0 && value.stage <= 6 ? value.stage : 0;
	// Keep a completed save completed even if optional choice fields were lost; never re-award it.
	return {
		stage,
		route: stage >= 3 ? ( value.route === 'shore' ? 'shore' : 'chart' ) : null,
		ending: stage >= 5 ? ( value.ending === 'names' ? 'names' : 'home' ) : null,
	};

}

export function storyObjective( state ) {

	const { stage, route, ending } = state.story;
	const goal = ( title, text, location ) => ( { title, text, location } );
	if ( stage === 0 ) return state.orderIndex < 1
		? goal( '一段旧事', '先完成乔的第一笔生意，再向他打听旧航标。', 'joe' )
		: goal( '乔的托付', '乔发现西边沙滩露出一个旧玻璃瓶。到鱼摊听他说说。', 'joe' );
	if ( stage === 1 ) return goal( '潮水带回的信', '沿小地图标记走到西边沙滩，靠近旧玻璃瓶按 G 拾取。', 'bottle' );
	if ( stage === 2 ) return state.orderIndex < 2
		? goal( '先学会平安出海', '把瓶中信带给玛尔塔。完成主线「准备出海」后，再选择调查路线。', 'marta' )
		: goal( '给接班人的航线', '把瓶中信交给玛尔塔，选择乘船辨礁线，或步行校对旧岸标。', 'marta' );
	if ( stage === 3 ) return route === 'chart'
		? goal( '暮色中的礁线', '17:00–20:00 驾船到礁边标记处，减速停稳后按 G 观察。可按 T 流逝时间，或在 H 中调整时刻。', 'reef' )
		: goal( '沙滩上的旧岸标', '06:00–18:00 步行到西滩旧系缆点，靠近标记按 G 核对。可按 T 流逝时间，或在 H 中调整时刻。', 'shore' );
	if ( stage === 4 ) return goal( '最后一船乘客', '航线已经核对。回到乔的鱼摊，听他讲完那一夜，决定归航灯的灯铭。', 'joe' );
	if ( stage === 5 ) return goal( '把灯留给后来的人', `18:00–次日06:00 到码头尽头，靠近归航灯按 G 点亮。灯铭：${ ending === 'names' ? '记住每一个归来的人' : '总有一盏灯等你回家' }。`, 'beacon' );
	return goal( '归航灯已亮', ending === 'names' ? '那些被救下的人，都有了留下名字的地方。夜里经过码头，看看这盏灯。' : '从今以后，晚归的船会看见码头有灯在等。夜里经过码头，看看这盏灯。', null );

}

export function storyDialogue( state, kind ) {

	const { stage, route, ending } = state.story;
	const say = ( text, choices = [] ) => ( { text, choices } );
	if ( kind === 'buyer' || kind === 'joe' ) {

		if ( stage === 0 ) return state.orderIndex < 1
			? say( '乔把一枚旧铜扣放回抽屉：“先把第一笔生意做成吧。等你熟悉了码头，我有一件海岸上的旧事想请你帮忙。”' )
			: say( '“这阵浪把西滩翻了个遍，露出一个缠着铜丝的玻璃瓶。那种绑法，我很多年没见过了。能替我去看看里面还有没有东西吗？”', [ { id: 'accept', label: '去西滩找找这个瓶子' } ] );
		if ( stage === 1 ) return say( '“沿岸往西走，瓶子就在地图标记的沙滩上。别急着出海，走着去就行。”' );
		if ( stage === 2 ) return say( '乔看着信末的名字，手停了下来：“埃利亚斯……把它带给玛尔塔吧。这是她父亲的字。信里的旧航线，她比我懂。”' );
		if ( stage === 3 ) return say( route === 'chart' ? '“旧航线的入港方向，要等暮色时看才清楚。到了礁边就停稳，别为了赶时刻往浅礁里闯。”' : '“西滩的旧系缆点还在。白天顺着岸线看过去，旧航道和码头的位置就对得上了。”' );
		if ( stage === 4 ) return say( '乔听完你的发现，沉默了一会儿。“那晚灯塔熄了。埃利亚斯没等人修好它，他把船灯挂得高高的，开着自己的小渔船，在礁外领着最后一船人回来。我当时就在船上，还是个吓得只会哭的孩子。”\n\n“他平安回来了，却总说只是顺路。玛尔塔已经把他的旧灯修好了。我们把它留在码头吧。你觉得，灯下该写点什么？”', [
			{ id: 'names', label: '记住归来的人 · 灯铭留下他们的故事' },
			{ id: 'home', label: '照亮后来的路 · 灯铭欢迎每一位晚归者' },
		] );
		if ( stage === 5 ) return say( ending === 'names' ? '“我会把当年同船的人一个个写下来。你选的灯铭很好——故事不能只剩一个英雄，也该记得他带回来的每个人。天黑后，去码头把灯点亮吧。”' : '“不用把我的名字刻得太大。让后来的人知道，有地方等他们回去，就够了。天黑后，去码头把灯点亮吧。”' );
		return say( ending === 'names' ? '“昨晚有人来添了一个名字，还带来一张旧照片。看来这盏灯，还有好多故事要收呢。对了，你今天的渔获怎么样？”' : '“昨晚一个晚归的小伙子说，还没认出码头，就先看见了那盏灯。够了，这就是它该做的事。来，看看你今天的渔获。”' );

	}
	if ( kind === 'shop' || kind === 'marta' ) {

		if ( stage < 2 ) return null;
		if ( stage === 2 ) {

			const intro = '玛尔塔把信摊平：“这是父亲留给接班人的记录。灯塔停用后，他仍在校对进港的路。‘沿浅礁外缘，转向岸上旧系缆点’……他说过，灯可以换，回家的路不能忘。”';
			if ( state.orderIndex < 2 ) return say( `${ intro }\n\n“你先完成乔的‘准备出海’，把近岸路走熟。我会留着这封信，等你回来再一起查。”` );
			return say( `${ intro }\n\n“旧船灯还在仓库，我来修。你帮我核对这条航线，有两种办法。选你喜欢的就行，不用买零件，也不用交出渔获。”`, [
				{ id: 'chart', label: '乘船辨礁线 · 17:00–20:00 在礁边停船观察' },
				{ id: 'shore', label: '步行查岸标 · 06:00–18:00 在西滩校对方向' },
			] );

		}
		if ( stage === 3 ) return say( route === 'chart' ? '“我在修灯罩，你去核对暮色下的礁线。只要在标记处停稳观察就好；这次我们要查清回港的方向，不用冒险靠近浅礁。”' : '“我在修灯罩，你去看看白天的旧系缆点。海水换了很多次，岸上的位置还记得那条路。”' );
		if ( stage === 4 ) return say( '“灯修好了。乔听说你核对出了航线，一直在等你。他说，这回有件事该亲口告诉你。”' );
		if ( stage === 5 ) return say( '“旧灯已经装到码头尽头了。等天黑，你来点亮它吧。父亲教过我怎么修灯，你们让我知道了他为什么总要修好它。”' );
		return say( '“灯罩我来擦，灯油乔来添。你负责平安回来——当然，顺便带些新鲜鱼也好。”' );

	}
	return null;

}

export function storyJournal( state ) {

	const { stage, route, ending } = state.story;
	const entries = [];
	if ( stage >= 1 ) entries.push( { title: '一 · 潮水带回的东西', text: '乔说，西滩露出了一个用铜丝缠住的旧玻璃瓶。他认得那种绑法，托我去取回。' } );
	if ( stage >= 2 ) entries.push( { title: '二 · 瓶中航线', text: '信纸边缘已经发黄，字迹却还清楚：“留给接班的人：灯塔熄了，就用船上的灯。沿浅礁外缘，转向岸上旧系缆点。最后一船也带回来了。把这条路留着，下次有人需要。——埃利亚斯”\n纸背另有一行小字：“校线记录，存于西滩岸标。”' } );
	if ( stage >= 3 ) entries.push( { title: '三 · 选择怎样读懂海岸', text: `埃利亚斯是玛尔塔的父亲。她负责修好仓库里的旧船灯，我负责核对航线。${ route === 'chart' ? '我选择在暮色中乘船到礁外，重看当年的进港方向。' : '我选择白天沿沙滩步行，从旧系缆点校对岸上的方向。' }` } );
	if ( stage >= 4 ) entries.push( { title: '四 · 找回进港的方向', text: route === 'chart' ? '停在浅礁外侧，暮色把礁影和进港水道分开了。旧航线绕开浅礁，最后指向码头；当年的灯应当挂在领航的船上，才能一直看得见。乔也许知道，那晚是谁跟着灯回来的。' : '旧桩朝海的一侧磨出深深的缆痕，桩旁刻痕的方向与信中一致。从这里校对，航线先绕过浅礁，再转向码头。那些字记录的是一条确实走过的归路。乔也许知道，那晚是谁从这里回来的。' } );
	if ( stage >= 5 ) entries.push( { title: '五 · 乔记得的那一夜', text: `灯塔熄灭后，埃利亚斯用渔船上的灯领回了最后一船人。乔当时还是个孩子，也在船上。埃利亚斯平安返岸，却把救人的事说成顺路。${ ending === 'names' ? '我选择让灯铭记住归来的人：“记住每一个归来的人”。乔会收集同船人的姓名和故事。' : '我选择把灯留给后来的人：“总有一盏灯等你回家”。每一位晚归者，都能在这里找到方向。' }` } );
	if ( stage >= 6 ) entries.push( { title: '六 · 今夜，有灯等你', text: `旧船灯在码头重新亮起。玛尔塔负责擦灯罩，乔负责添灯油，而我把那条旧航线重新走了一遍。${ ending === 'names' ? '灯下开始收集归来者的姓名，这段往事将有人接着讲。' : '灯下写着欢迎晚归的话，这份照应将有人接着传。' }\n收到渔港的谢礼 $150。归航灯会在夜间亮起。` } );
	return entries;

}
