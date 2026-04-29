// Minimal mock of the parts of the obsidian module the plugin uses.
// requestUrl is implemented with the platform fetch so integration tests
// hit the real Screvi backend.

export interface RequestUrlParam {
	url: string;
	method?: string;
	headers?: Record<string, string>;
	body?: string | ArrayBuffer;
}

export interface RequestUrlResponse {
	status: number;
	headers: Record<string, string>;
	arrayBuffer: ArrayBuffer;
	json: unknown;
	text: string;
}

export async function requestUrl(opts: RequestUrlParam | string): Promise<RequestUrlResponse> {
	const params: RequestUrlParam = typeof opts === 'string' ? { url: opts } : opts;
	const res = await fetch(params.url, {
		method: params.method ?? 'GET',
		headers: params.headers,
		body: params.body as BodyInit | undefined,
	});
	const text = await res.text();
	let json: unknown = null;
	try { json = text.length ? JSON.parse(text) : null; } catch { /* not JSON */ }
	const headers: Record<string, string> = {};
	res.headers.forEach((v, k) => { headers[k] = v; });
	return {
		status: res.status,
		headers,
		text,
		json,
		arrayBuffer: new ArrayBuffer(0),
	};
}

export function normalizePath(path: string): string {
	return path
		.replace(/\\/g, '/')
		.replace(/\/+/g, '/')
		.replace(/^\/+|\/+$/g, '');
}

// Stubs only used so that `import { ... } from 'obsidian'` resolves at
// test time. The plugin code paths exercised by tests don't construct
// these — they're class-method recipients on `Object.create(Plugin.prototype)`.
export class Plugin {
	app: unknown;
	manifest: unknown;
	addCommand(_: unknown) {}
	addStatusBarItem(): HTMLElement { return {} as HTMLElement; }
	addSettingTab(_: unknown) {}
	registerInterval(_: number) {}
	loadData(): Promise<unknown> { return Promise.resolve(null); }
	saveData(_: unknown): Promise<void> { return Promise.resolve(); }
}

export class PluginSettingTab {
	app: unknown;
	plugin: unknown;
	containerEl: HTMLElement = {} as HTMLElement;
	constructor(app: unknown, plugin: unknown) {
		this.app = app;
		this.plugin = plugin;
	}
}

export class Setting {
	descEl: HTMLElement = {} as HTMLElement;
	constructor(_: unknown) {}
	setName(_: string) { return this; }
	setDesc(_: string) { return this; }
	setHeading() { return this; }
	addText(_: unknown) { return this; }
	addToggle(_: unknown) { return this; }
	addSlider(_: unknown) { return this; }
	addButton(_: unknown) { return this; }
}

export class Notice {
	constructor(_: string, __?: number) {}
}

export class TFile {}
export class App {}
