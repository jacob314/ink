import fs from 'node:fs';
import process from 'node:process';

type CallFrame = {
	functionName: string;
	scriptId: string;
	url: string;
	lineNumber: number;
	columnNumber: number;
};

type ProfileNode = {
	id: number;
	callFrame: CallFrame;
	hitCount?: number;
	children?: number[];
};

type Profile = {
	nodes: ProfileNode[];
	startTime: number;
	endTime: number;
	samples?: number[];
	timeDeltas?: number[];
};

export function analyzeProfile(filename: string) {
	const rawData = fs.readFileSync(filename, 'utf8');
	const profile = JSON.parse(rawData) as Profile;

	if (!profile.samples || !profile.timeDeltas) {
		console.log('No samples found in profile.');
		return;
	}

	const nodeMap = new Map<number, ProfileNode>();
	const parentMap = new Map<number, number>();

	for (const node of profile.nodes) {
		nodeMap.set(node.id, node);
		if (node.children) {
			for (const childId of node.children) {
				parentMap.set(childId, node.id);
			}
		}
	}

	const exclusiveTime = new Map<number, number>();
	const inclusiveTime = new Map<number, number>();

	for (let i = 0; i < profile.samples.length; i++) {
		const nodeId = profile.samples[i]!;
		const delta = profile.timeDeltas[i]!;

		exclusiveTime.set(nodeId, (exclusiveTime.get(nodeId) || 0) + delta);

		let currentId: number | undefined = nodeId;
		const visited = new Set<number>();

		while (currentId !== undefined) {
			if (!visited.has(currentId)) {
				inclusiveTime.set(
					currentId,
					(inclusiveTime.get(currentId) || 0) + delta,
				);
				visited.add(currentId);
			}

			currentId = parentMap.get(currentId);
		}
	}

	const getFunctionName = (node: ProfileNode) => {
		const name = node.callFrame.functionName || '(anonymous)';
		const url = node.callFrame.url ? node.callFrame.url.split('/').pop() : '';
		const line =
			node.callFrame.lineNumber >= 0 ? `:${node.callFrame.lineNumber + 1}` : '';
		return url ? `${name} (${url}${line})` : name;
	};

	const functionStats = new Map<
		string,
		{exclusive: number; inclusive: number}
	>();

	for (const node of profile.nodes) {
		const name = getFunctionName(node);
		const ex = exclusiveTime.get(node.id) || 0;
		const increment = inclusiveTime.get(node.id) || 0;

		if (!functionStats.has(name)) {
			functionStats.set(name, {exclusive: 0, inclusive: 0});
		}

		const stats = functionStats.get(name)!;
		stats.exclusive += ex;

		stats.inclusive = Math.max(stats.inclusive, increment);
	}

	const sortedByExclusive = [...functionStats.entries()]
		.filter(([_, stats]) => stats.exclusive > 0)
		.sort((a, b) => b[1].exclusive - a[1].exclusive);

	const sortedByInclusive = [...functionStats.entries()]
		.filter(([_, stats]) => stats.inclusive > 0)
		.sort((a, b) => b[1].inclusive - a[1].inclusive);

	console.log('--- Top Down (By Inclusive Time) ---');
	for (const [name, stats] of sortedByInclusive.slice(0, 30)) {
		console.log(`${(stats.inclusive / 1000).toFixed(2)}ms\t${name}`);
	}

	console.log('\n--- Bottom Up (By Exclusive Time) ---');
	for (const [name, stats] of sortedByExclusive.slice(0, 30)) {
		console.log(`${(stats.exclusive / 1000).toFixed(2)}ms\t${name}`);
	}
}

if (
	process.argv[1] === import.meta.url ||
	process.argv[1]?.endsWith('analyze-profile.ts')
) {
	const filename = process.argv[2];
	if (filename) {
		analyzeProfile(filename);
	} else {
		console.log('Usage: npx tsx analyze-profile.ts <profile.cpuprofile>');
	}
}
