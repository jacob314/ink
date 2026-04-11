import fs from 'node:fs';
import inspector from 'node:inspector/promises';

export class Profiler {
	private session: inspector.Session | undefined;

	async start() {
		this.session = new inspector.Session();
		this.session.connect();
		await this.session.post('Profiler.enable');
		await this.session.post('Profiler.start');
	}

	async stopAndSave(filename: string) {
		if (!this.session) return;
		const {profile} = await this.session.post('Profiler.stop');
		await this.session.post('Profiler.disable');
		this.session.disconnect();

		fs.writeFileSync(filename, JSON.stringify(profile));
		console.log(`Saved CPU profile to ${filename}`);
	}
}
