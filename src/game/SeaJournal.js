export const SEA_JOURNAL_TITLE = '深海的回声';

export const freshSeaJournal = () => ( { stage: 0, ending: null } );

export function normalizeSeaJournal( value ) {

	if ( ! value || typeof value !== 'object' || Array.isArray( value ) ) return freshSeaJournal();
	const stage = Number.isSafeInteger( value.stage ) && value.stage >= 0 && value.stage <= 4 ? value.stage : 0;
	// Missing or damaged prose choices must never reopen a completed voyage.
	return { stage, ending: stage === 4 && [ 'wonder', 'peace' ].includes( value.ending ) ? value.ending : null };

}

export function seaJournalObjective( state ) {

	const { stage, ending } = state.seaJournal;
	const goal = ( title, text, location ) => ( { title, text, location } );
	if ( stage === 0 ) return state.isGroundUnlocked( 'deep' )
		? goal( '乔听说的深海', '乔听远海船员说起一片海底遗迹。到鱼摊听听这段传闻，想去时再出发。', 'joe' )
		: goal( '海还很辽阔', '先熟悉近岸和珊瑚礁。开放远海后，会有新的见闻等着你。', null );
	if ( stage === 1 ) return goal( '沉没的门廊', '按 M 找到深海遗迹。停稳船、收起鱼竿，下潜靠近古老门廊，按 G 记下发现。', 'abyss' );
	if ( stage === 2 ) return goal( '让深海慢下来', '按 L 开灯，潜到巨章附近、面向它停留 6 秒，再按 G 记录见闻。视线移开或离开会重新计时。', 'elder' );
	if ( stage === 3 ) return goal( '把见闻带回港', '不必带走任何东西。回到乔的鱼摊，把你看见的深海讲给他听。', 'joe' );
	return goal( '这一程，留在心里', ending === 'wonder'
		? '你把巨章的身影和对未知的敬畏写进了航海手记。海上还有许多地方，等你慢慢发现。'
		: ending === 'peace'
			? '你把深海的宁静和归港的安心写进了航海手记。下次出海，可以只是为了看看海。'
			: '这次深海见闻已经记入航海手记。你平安回港，也为下一程留下了想象。', null );

}

export function seaJournalDialogue( state, kind ) {

	const { stage, ending } = state.seaJournal;
	const say = ( text, choices = [] ) => ( { text, choices } );
	if ( kind === 'buyer' || kind === 'joe' ) {

		if ( stage === 0 ) return state.isGroundUnlocked( 'deep' ) ? say( '乔朝外海望了望：“有船员说，深水下面立着几根老石柱，石柱后面有什么很大的东西在动。我没亲眼见过。你要是好奇，可以去看看。别赶着回来交差，也别为了证明什么冒险——能平安回来，讲给我听就好。”', [
			{ id: 'accept', label: '记下位置 · 有空去深海看看' },
		] ) : null;
		if ( stage === 1 ) return say( '“遗迹的位置记在地图上了。出发前看看天气和油量；到了先把船停稳。今天不想去也没关系，海一直在那里。”' );
		if ( stage === 2 ) return say( '“那些石柱真还在啊。若见到那个大家伙，留些距离，安静看一会儿就好。我们只是路过它的家。”' );
		if ( stage === 3 ) return say( '乔听你讲完，把摊上的秤放下了。“那么大的生命，就在我们每天经过的海下面……这趟没带回什么，也像是满载回来。”\n\n“如果给这一页手记留一句话，你最想记住什么？”', [
			{ id: 'wonder', label: '记下敬畏 · 原来海里还有这样的生命' },
			{ id: 'peace', label: '记下宁静 · 看过深海，也平安回家了' },
		] );
		return say( ending === 'wonder'
			? '“以后有人问起远海，我会告诉他：那里有值得敬畏的生命。至于它真正的样子，得自己慢慢去看。今天想去哪里？”'
			: ending === 'peace'
				? '“你说深海很安静，我记住了。有时候出海不必为了多赚一笔，回来坐会儿，讲几句看到的事，也很好。”'
				: '“你带回的深海故事，我记住了。下次见到新鲜事，平安回来，再慢慢讲。”' );

	}
	if ( kind === 'shop' || kind === 'marta' ) {

		if ( stage === 0 ) return null;
		if ( stage < 3 ) return say( '玛尔塔检查着缆绳：“远海出发前看看天气，留够回程的油。下潜前把船停稳、收好鱼竿；天色不合适就改天。看完记得回来，我们等你讲故事。”' );
		if ( stage === 3 ) return say( '“船回来了，人也回来了，这就很好。乔刚才还在朝海上看，去跟他讲讲吧。”' );
		return say( '“上次听你说起深海，乔聊了好几天。船我会帮你照看；往后每一程，也记得给回港留点时间。”' );

	}
	return null;

}

export function seaJournalEntries( state ) {

	const { stage, ending } = state.seaJournal;
	const entries = [];
	if ( stage >= 1 ) entries.push( { title: '一 · 一段不必赶赴的传闻', text: '乔说，远海下面有一片古老遗迹，也许还有一个巨大的身影。我记下了位置。这趟没有订单，也没有期限；想去时，就出发看看。' } );
	if ( stage >= 2 ) entries.push( { title: '二 · 沉没的门廊', text: '海面下，断柱和门廊仍立在沙地上，珊瑚与海草沿着石缝生长。尘粒从光束里缓缓经过。这里不是空无一物，只是需要我慢一点看。' } );
	if ( stage >= 3 ) entries.push( { title: '三 · 深海里的邻居', text: '我停下来，望着巨章在遗迹间缓缓游动。八条触手舒展、收拢，它有自己的节奏。我没有追赶，也没有带走什么；能够亲眼看见，就已经是一段见闻。' } );
	if ( stage >= 4 ) entries.push( { title: '四 · 平安归航', text: ending === 'wonder'
		? '我回到渔港，把深海的故事讲给乔听。我在这一页写下：海比航线更辽阔，还有值得敬畏的生命，生活在我们未曾看见的地方。下一次，我仍想带着好奇出发。'
		: ending === 'peace'
			? '我回到渔港，把深海的故事讲给乔听。我在这一页写下：海底有自己的宁静，岸上有人等我回来。出海有时只是为了看看海，而平安归航，就是很好的一天。'
			: '我回到渔港，把深海的故事讲给乔听。那一片遗迹、一个巨大的身影，和一次平安的归航，已经留在我的手记里。' } );
	return entries;

}
