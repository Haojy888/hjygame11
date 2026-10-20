import { ExplorationWorld } from '../world/ExplorationWorld.js';
import { LIGHTHOUSE, COASTAL_SITES } from './ExplorationLandmarks.js';
import { subjectVisible } from './FieldCamera.js';

export class LandmarksController {

	constructor( game, world = null ) {

		this.game = game; this.world = world || new ExplorationWorld( game.app );
		game.app.explorationWorld = this.world;

	}

	prepare( dt ) { this.world.update( dt, this.game.state.landmarks.lighthouseLit ); }

	update() {

		const g = this.game, a = g.app, p = a.player;
		if ( ! g.secrets?.available() || g.rod.equipped || p.busy || p.climbing || p.mode !== 'walk' || ! subjectVisible( a, this.world.panel, 2.6, 0.4, p.position ) ) return;
		const repaired = g.state.landmarks.lighthouseLit;
		p.prompt = { key: repaired ? '已接通' : 'G', text: repaired ? '归航灯塔 · 入夜后灯光扫过海面' : '接通灯塔备用电源 · 修复夜间航标' };
		if ( ! repaired && a.input.hit( 'KeyG' ) ) {

			const saved = g.state.repairLighthouse();
			g.toast( saved ? '归航灯塔重新亮起 · 夜间旋转照向海湾，进度已保存' : '修复进度未能保存 · 请检查站点存储空间后重试', 5500 );

		}

	}

	locations() {

		const w = this.world, repaired = this.game.state.landmarks.lighthouseLit;
		return [ { id: 'lighthouse', icon: '灯', label: '归航灯塔' + ( repaired ? ' · 电源已修复' : ' · 可登塔' ),
			x: LIGHTHOUSE.x, y: 0, z: LIGHTHOUSE.z + 19.1, underwater: false, color: '#f3d297', hint: '从小岛南侧码头登梯，沿外阶和塔内旋梯登顶，面向控制箱按 G 修复' },
			...Object.entries( COASTAL_SITES ).map( ( [ id, site ] ) => ( { id: 'coastal-' + id, icon: site.icon, label: site.name,
				...( id === 'dolphin' ? w.life.dolphins[ 0 ].pos : id === 'moray' ? w.life.morayPoint : id === 'seahorse' ? w.life.seahorsePoint : w.targets.get( id ) ),
				underwater: id !== 'dolphin', hint: site.hint, color: '#a7d6c8' } ) ) ];

	}

}
