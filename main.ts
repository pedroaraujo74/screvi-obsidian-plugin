import { App, Notice, Plugin, PluginSettingTab, Setting, TFile, normalizePath } from 'obsidian';
import { ScreviApiClient, ScreviHighlight, SourceType, VALID_SOURCE_TYPES, API_BASE_URL } from './src/api';
import { decodeHtmlEntities } from './src/utils';
import * as nunjucks from 'nunjucks';

const CACHE_FILE = 'screvi-cache.json';

interface ScreviSyncSettings {
	apiKey: string;
	syncInterval: number;
	defaultFolder: string;
	autoSync: boolean;
	lastSyncTime: number;

	includeMetadata: boolean;
	tagPrefix: string;
	autoLinkFields: string[];
	enableAutoLinking: boolean;
}

const DEFAULT_SETTINGS: ScreviSyncSettings = {
	apiKey: '',
	syncInterval: 2,
	defaultFolder: 'Screvi Highlights',
	autoSync: true,
	lastSyncTime: 0,
	includeMetadata: true,
	tagPrefix: "screvi",
	autoLinkFields: ["author"],
	enableAutoLinking: true
}

const HIGHLIGHT_TEMPLATE = `{{highlight.content | blockquote}}
{%- if highlight.note %}

**Note:** {{highlight.note}}
{%- endif %}
{%- if highlight.chapter %}
**Chapter:** {{highlight.chapter}}
{%- endif %}
{%- if highlight.page %}
**Page:** {{highlight.page}}
{%- endif %}
{%- if highlight.tags %}
{% for tag in highlight.tags %}#{{tag.name}}{% if not loop.last %}, {% endif %}{% endfor %}
{%- endif %}

---
`;

const BOOK_TEMPLATE = `**Author:** {{author}}
{% if url %}**URL:** [{{title}}]({{url}}){% endif %}

## Highlights

{% for highlight in highlights %}
{{highlight.content | blockquote}}
{%- if highlight.note %}

**Note:** {{highlight.note}}
{%- endif %}
{%- if highlight.chapter %}
**Chapter:** {{highlight.chapter}}
{%- endif %}
{%- if highlight.page %}
**Page:** {{highlight.page}}
{%- endif %}
{%- if highlight.tags %}
{% for tag in highlight.tags %}#{{tag.name}}{% if not loop.last %}, {% endif %}{% endfor %}
{%- endif %}

---
{% endfor %}`

export default class ScreviSyncPlugin extends Plugin {
	settings: ScreviSyncSettings;
	syncInterval: number | null = null;
	statusBarItem: HTMLElement;
	highlights: ScreviHighlight[] = [];
	apiClient: ScreviApiClient;
	nunjucksEnv: nunjucks.Environment;
	private isSyncing: boolean = false;

	async onload() {
		await this.loadSettings();

		// Initialize API client
		this.apiClient = new ScreviApiClient(this.settings.apiKey, API_BASE_URL);

		// Initialize Nunjucks template engine
		this.setupNunjucks();

		// Status bar
		this.statusBarItem = this.addStatusBarItem();
		this.updateStatusBar('Ready');

		// Commands
		this.addCommand({
			id: 'sync-highlights',
			name: 'Sync highlights',
			callback: async () => {
				await this.syncHighlights();
			}
		});

		this.addCommand({
			id: 'force-full-sync',
			name: 'Force full sync',
			callback: async () => {
				await this.syncHighlights(true);
			}
		});

		// Settings tab
		this.addSettingTab(new ScreviSyncSettingTab(this.app, this));

		// Setup auto-sync
		if (this.settings.autoSync) {
			this.setupAutoSync();
		}

		// Load cached highlights
		await this.loadCachedHighlights();
	}

	onunload() {
		if (this.syncInterval !== null) {
			window.clearInterval(this.syncInterval);
			this.syncInterval = null;
		}
	}

	async loadSettings() {
		const data = await this.loadData();
		// Only pick known setting keys, ignore any stale 'highlights' key from old versions
		const settingsOnly: Partial<ScreviSyncSettings> = {};
		if (data) {
			for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof ScreviSyncSettings)[]) {
				if (key in data) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					(settingsOnly as any)[key] = data[key];
				}
			}
		}
		this.settings = Object.assign({}, DEFAULT_SETTINGS, settingsOnly);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		// Update API client credentials when settings change
		if (this.apiClient) {
			this.apiClient.updateCredentials(this.settings.apiKey, API_BASE_URL);
		}
	}

	updateStatusBar(text: string) {
		this.statusBarItem.setText(`Screvi: ${text}`);
	}

	setupAutoSync() {
		if (this.syncInterval !== null) {
			window.clearInterval(this.syncInterval);
			this.syncInterval = null;
		}

		if (this.settings.autoSync && this.settings.syncInterval > 0) {
			this.syncInterval = window.setInterval(() => {
				void this.syncHighlights();
			}, this.settings.syncInterval * 60 * 60 * 1000);
			this.registerInterval(this.syncInterval);
		}
	}

	async syncHighlights(fullSync: boolean = false) {
		if (!this.settings.apiKey) {
			new Notice('Please set your Screvi API key in plugin settings');
			return;
		}

		if (this.isSyncing) {
			new Notice('Sync already in progress');
			return;
		}

		try {
			this.isSyncing = true;
			this.updateStatusBar('Syncing...');
			
			const start_from = fullSync ? undefined : this.settings.lastSyncTime;
			const highlights = await this.apiClient.fetchHighlightsSince(start_from);
			
			if (highlights.length > 0) {
				// Deduplicate new highlights before processing
				const uniqueHighlights = this.deduplicateHighlights(highlights);
				
				await this.processHighlights(uniqueHighlights);
				
				// Merge with cache using id-based deduplication
				const existingIds = new Set(this.highlights.map(h => h.id).filter(Boolean));
				const newUniqueHighlights = uniqueHighlights.filter(h => !h.id || !existingIds.has(h.id));
				
				this.highlights = [...newUniqueHighlights, ...this.highlights];
				await this.saveCachedHighlights();
				
				// Use the latest server-side timestamp from fetched highlights
				const latestTimestamp = this.getLatestTimestamp(uniqueHighlights);
				if (latestTimestamp > 0) {
					this.settings.lastSyncTime = latestTimestamp;
				} else {
					// Fallback to client time only if no server timestamps available
					this.settings.lastSyncTime = Date.now();
				}
				await this.saveSettings();
				
				new Notice(`Synced ${uniqueHighlights.length} highlights from Screvi`);
				this.updateStatusBar(`Synced ${uniqueHighlights.length} highlights`);
			} else {
				new Notice('No new highlights to sync');
				this.updateStatusBar('Up to date');
			}
		} catch (error) {
			console.error('Error syncing highlights:', error);
			const errorMessage = error instanceof Error ? error.message : String(error);
			new Notice('Failed to sync highlights: ' + errorMessage);
			this.updateStatusBar('Sync failed');
		} finally {
			this.isSyncing = false;
		}
	}

	/**
	 * Extract the latest created_at/updated_at timestamp from a set of highlights.
	 * Returns 0 if no valid timestamps are found.
	 */
	getLatestTimestamp(highlights: ScreviHighlight[]): number {
		let latest = 0;
		for (const h of highlights) {
			const candidates = [h.updated_at, h.created_at, h.date].filter(Boolean);
			for (const candidate of candidates) {
				const ts = new Date(candidate as string).getTime();
				if (!isNaN(ts) && ts > latest) {
					latest = ts;
				}
			}
		}
		return latest;
	}

	async processHighlights(highlights: ScreviHighlight[]) {
		// Ensure folder exists
		await this.ensureFolder(normalizePath(this.settings.defaultFolder));

		// Group highlights by source type for folder organization
		const highlightsByType = this.groupHighlightsBySourceType(highlights);
		
		for (const [sourceType, typeHighlights] of Object.entries(highlightsByType)) {
			// Create source type folder with display name
			const displayName = this.getSourceTypeDisplayName(sourceType);
			const typeFolderPath = normalizePath(`${this.settings.defaultFolder}/${this.sanitizeFileName(displayName)}`);
			await this.ensureFolder(typeFolderPath);

			// Always create book files (group highlights by source)
			await this.createBookFiles(typeHighlights, displayName);
		}
	}

	async createBookFiles(highlights: ScreviHighlight[], sourceTypeDisplayName?: string) {
		const groupedHighlights = this.groupHighlightsBySource(highlights);
		const baseFolder = normalizePath(sourceTypeDisplayName
			? `${this.settings.defaultFolder}/${this.sanitizeFileName(sourceTypeDisplayName)}`
			: this.settings.defaultFolder);

		for (const [source, sourceHighlights] of Object.entries(groupedHighlights)) {
			const fileName = this.sanitizeFileName(source);
			if (!fileName) continue;
			const filePath = normalizePath(`${baseFolder}/${fileName}.md`);
			
			const existingFile = this.app.vault.getAbstractFileByPath(filePath);
			
			if (existingFile instanceof TFile) {
				// File exists — append new highlights using the template
				const existingContent = await this.app.vault.read(existingFile);
				let newContent = existingContent;
				
				for (const highlight of sourceHighlights) {
					// Use id-based detection if available, fall back to content match
					const isDuplicate = highlight.id
						? existingContent.includes(`<!-- screvi-id:${highlight.id} -->`)
						: existingContent.includes(highlight.content);
					
					if (!isDuplicate) {
						// Render through the template for consistent formatting
						const rendered = this.renderTemplate(HIGHLIGHT_TEMPLATE, { highlight });
						const idMarker = highlight.id ? `<!-- screvi-id:${highlight.id} -->\n` : '';
						newContent += `\n${idMarker}${rendered}`;
					}
				}
				
				// Only update if we actually added something
				if (newContent !== existingContent) {
					await this.app.vault.modify(existingFile, newContent);
				}
			} else {
				// File doesn't exist — create new one with template
				const templateData = {
					title: source,
					author: sourceHighlights[0]?.author || '',
					url: sourceHighlights[0]?.url || '',
					highlights: sourceHighlights
				};
				
				const content = this.renderTemplate(BOOK_TEMPLATE, templateData);
				await this.app.vault.create(filePath, content);
			}
		}
	}

	groupHighlightsBySource(highlights: ScreviHighlight[]): Record<string, ScreviHighlight[]> {
		return highlights.reduce((groups, highlight) => {
			const source = highlight.source || 'Unknown source';
			if (!groups[source]) {
				groups[source] = [];
			}
			groups[source].push(highlight);
			return groups;
		}, {} as Record<string, ScreviHighlight[]>);
	}

	groupHighlightsBySourceType(highlights: ScreviHighlight[]): Record<string, ScreviHighlight[]> {
		return highlights.reduce((groups, highlight) => {
			// Use the source type from the API, defaulting to 'self' if not available
			let sourceType: string = highlight.sourceType || 'self';
			
			// Map to the exact folder types: "book", "tweet", "self", "article", "youtube"
			if (typeof sourceType === 'string' && !VALID_SOURCE_TYPES.includes(sourceType as SourceType)) {
				sourceType = 'self'; // Default fallback
			}
			
			if (!groups[sourceType]) {
				groups[sourceType] = [];
			}
			groups[sourceType].push(highlight);
			return groups;
		}, {} as Record<string, ScreviHighlight[]>);
	}

	deduplicateHighlights(highlights: ScreviHighlight[]): ScreviHighlight[] {
		const seen = new Set<string>();
		return highlights.filter(highlight => {
			// Prefer id-based deduplication when available
			if (highlight.id) {
				if (seen.has(highlight.id)) {
					return false;
				}
				seen.add(highlight.id);
				return true;
			}
			// Fall back to content+date key for highlights without ids
			const key = `${highlight.content || ''}_${highlight.created_at || highlight.date || ''}`;
			if (seen.has(key)) {
				return false;
			}
			seen.add(key);
			return true;
		});
	}

	/**
	 * Ensure a folder exists, handling race conditions gracefully.
	 */
	async ensureFolder(path: string) {
		if (!this.app.vault.getAbstractFileByPath(path)) {
			try {
				await this.app.vault.createFolder(path);
			} catch (e) {
				// Folder may have been created by a concurrent operation — ignore if it now exists
				if (!this.app.vault.getAbstractFileByPath(path)) {
					throw e;
				}
			}
		}
	}

	getSourceTypeDisplayName(sourceType: string): string {
		// Map source types to user-friendly display names
		const displayNames: Record<string, string> = {
			'article': 'Articles',
			'book': 'Books',
			'self': 'Personal Notes',
			'tweet': 'Tweets',
			'youtube': 'YouTube'
		};
		
		return displayNames[sourceType] || sourceType;
	}

	sanitizeFileName(name: string): string {
		// Only remove characters that are actually problematic for file systems
		// Keep spaces, letters, numbers, common punctuation
		return name
			.replace(/[<>:"|?*]/g, '')      // Remove Windows forbidden characters
			.replace(/[/\\]/g, '-')        // Replace path separators with hyphens
			.trim()                         // Trim before stripping trailing dots
			.replace(/\.+$/g, '')           // Remove trailing dots (Windows issue)
			.trim();                        // Final trim in case dots exposed whitespace
	}

	setupNunjucks() {
		// Create a new Nunjucks environment
		this.nunjucksEnv = new nunjucks.Environment();
		
		// Add custom filters
		this.nunjucksEnv.addFilter('link', (str: string) => {
			if (str && str.trim()) {
				return `[[${str}]]`;
			}
			return str;
		});
		
		this.nunjucksEnv.addFilter('color', (str: string, color: string) => {
			if (str && str.trim() && color) {
				return `<mark style="background-color: ${color};">${str}</mark>`;
			}
			return str;
		});
		
		this.nunjucksEnv.addFilter('sanitize_tag', (str: string) => {
			return this.sanitizeTagName(str);
		});
		
		this.nunjucksEnv.addFilter('date', (dateStr: string, format: string) => {
			if (dateStr) {
				const date = new Date(dateStr);
				if (!isNaN(date.getTime())) {
					return this.formatDate(date, format);
				}
			}
			return dateStr;
		});
		
		this.nunjucksEnv.addFilter('replace', (str: string, search: string, replace: string) => {
			if (str && search) {
				return str.replace(new RegExp(search, 'g'), replace || '');
			}
			return str;
		});
		
		this.nunjucksEnv.addFilter('blockquote', (str: string) => {
			if (str && str.trim()) {
				// Decode HTML entities first (in case content has &gt; etc.)
				const decoded = decodeHtmlEntities(str);
				// Split by line breaks and add > to each line
				const blockquoted = decoded.trim().split('\n').map(line => {
					// Handle empty lines by adding just ">"
					return line.trim() ? `> ${line}` : '>';
				}).join('\n');
				// Return as SafeString to prevent Nunjucks from HTML-escaping it
				return new nunjucks.runtime.SafeString(blockquoted);
			}
			return str;
		});

		this.nunjucksEnv.addFilter('decode_html', (str: string) => {
			if (str && typeof str === 'string') {
				return decodeHtmlEntities(str);
			}
			return str;
		});

		this.nunjucksEnv.addFilter('decode_text', (str: string) => {
			if (str && typeof str === 'string') {
				return decodeHtmlEntities(str);
			}
			return str;
		});
	}

	renderTemplate(template: string, data: Record<string, unknown>): string {
		try {
			// Add tag_prefix to the data context
			const contextData = {
				...data,
				tag_prefix: this.settings.tagPrefix
			};
			
			// Process auto-linking for specified fields
			if (this.settings.enableAutoLinking) {
				for (const field of this.settings.autoLinkFields) {
					const value = this.getNestedValue(contextData, field);
					if (value && typeof value === 'string' && value.trim() && 
						!value.startsWith('[[') && !value.startsWith('<mark')) {
						this.setNestedValue(contextData, field, `[[${value}]]`);
					}
				}
			}
			
			return this.nunjucksEnv.renderString(template, contextData);
		} catch (error) {
			console.error('Template rendering error:', error);
			const errorMessage = error instanceof Error ? error.message : String(error);
			return `Template Error: ${errorMessage}`;
		}
	}

	getNestedValue(obj: Record<string, unknown>, path: string): unknown {
		return path.split('.').reduce((current, key) => {
			if (current && typeof current === 'object' && key in current) {
				return (current as Record<string, unknown>)[key];
			}
			return undefined;
		}, obj as unknown);
	}

	setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
		const keys = path.split('.');
		const lastKey = keys.pop();
		const target = keys.reduce((current, key) => {
			if (!current[key] || typeof current[key] !== 'object') {
				current[key] = {};
			}
			return current[key] as Record<string, unknown>;
		}, obj);
		if (lastKey) {
			target[lastKey] = value;
		}
	}

	formatDate(date: Date, format: string): string {
		// Simple date formatting - supports YYYY-MM-DD format
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		
		return format
			.replace('YYYY', String(year))
			.replace('MM', month)
			.replace('DD', day);
	}

	formatAsBlockquote(text: string): string {
		if (!text || !text.trim()) return text;
		
		// Split by line breaks and add > to each line
		return text.trim().split('\n').map(line => {
			// Handle empty lines by adding just ">"
			return line.trim() ? `> ${line}` : '>';
		}).join('\n');
	}

	sanitizeTagName(tagName: string): string {
		// Sanitize tag names according to Obsidian requirements
		// Replace spaces with hyphens, remove special characters except underscores and hyphens
		return tagName
			.replace(/\s+/g, '-')           // Replace spaces with hyphens
			.replace(/[^\w\-/]/g, '')      // Keep only letters, numbers, underscores, hyphens, and forward slashes
			.replace(/\/+/g, '/')           // Collapse multiple slashes
			.replace(/^\/|\/$/g, '')        // Remove leading/trailing slashes
			.toLowerCase();                 // Convert to lowercase for consistency
	}

	private getCachePath(): string | null {
		if (!this.manifest.dir) return null;
		return normalizePath(`${this.manifest.dir}/${CACHE_FILE}`);
	}

	/**
	 * Load cached highlights from a dedicated cache file (separate from settings).
	 */
	async loadCachedHighlights() {
		try {
			const cachePath = this.getCachePath();
			if (cachePath && await this.app.vault.adapter.exists(cachePath)) {
				const raw = await this.app.vault.adapter.read(cachePath);
				const parsed = JSON.parse(raw);
				this.highlights = parsed?.highlights || [];
			}
		} catch (error) {
			console.error('Failed to load cached highlights:', error);
			this.highlights = [];
		}
	}

	/**
	 * Save cached highlights to a dedicated cache file (separate from settings).
	 */
	async saveCachedHighlights() {
		try {
			const cachePath = this.getCachePath();
			if (!cachePath) return;
			const data = JSON.stringify({ highlights: this.highlights });
			await this.app.vault.adapter.write(cachePath, data);
		} catch (error) {
			console.error('Failed to save cached highlights:', error);
		}
	}

}

class ScreviSyncSettingTab extends PluginSettingTab {
	plugin: ScreviSyncPlugin;

	constructor(app: App, plugin: ScreviSyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		// API Key
		const apiKeySetting = new Setting(containerEl)
			.setName('API key')
			.setDesc('Your Screvi API key for authentication. ');
		
		apiKeySetting.descEl.createEl('a', {
			text: 'Get your API key',
			href: 'https://app.screvi.com/settings/api'
		});
		
		apiKeySetting.addText(text => text
			.setPlaceholder('Enter your API key')
			.setValue(this.plugin.settings.apiKey)
			.onChange(async (value) => {
				this.plugin.settings.apiKey = value;
				await this.plugin.saveSettings();
			}));

		// Auto Sync
		new Setting(containerEl)
			.setName('Auto sync')
			.setDesc('Automatically sync highlights at regular intervals.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoSync)
				.onChange(async (value) => {
					this.plugin.settings.autoSync = value;
					await this.plugin.saveSettings();
					this.plugin.setupAutoSync();
					this.display(); // Refresh settings to show/hide interval
				}));

		// Sync Interval (only show if auto sync is enabled)
		if (this.plugin.settings.autoSync) {
			new Setting(containerEl)
				.setName('Sync interval')
				.setDesc('How often to automatically sync highlights (hours).')
				.addSlider(slider => slider
					.setLimits(1, 24, 1)
					.setValue(this.plugin.settings.syncInterval)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.syncInterval = value;
						await this.plugin.saveSettings();
						this.plugin.setupAutoSync();
					}));
		}

		// Sync Actions
		new Setting(containerEl)
			.setName('Actions')
			.setHeading();

		new Setting(containerEl)
			.setName('Sync now')
			.setDesc('Manually sync highlights from Screvi.')
			.addButton(button => button
				.setButtonText('Sync')
				.setCta()
				.onClick(async () => {
					button.setButtonText('Syncing...');
					button.setDisabled(true);
					try {
						await this.plugin.syncHighlights();
					} catch (error) {
						console.error('Sync error:', error);
					} finally {
						button.setButtonText('Sync');
						button.setDisabled(false);
					}
				}));

		new Setting(containerEl)
			.setName('Full sync')
			.setDesc('Re-sync all highlights (ignores last sync time).')
			.addButton(button => button
				.setButtonText('Full sync')
				.onClick(async () => {
					button.setButtonText('Syncing...');
					button.setDisabled(true);
					try {
						await this.plugin.syncHighlights(true);
					} catch (error) {
						console.error('Full sync error:', error);
					} finally {
						button.setButtonText('Full sync');
						button.setDisabled(false);
					}
				}));

		// Last Sync Info
		if (this.plugin.settings.lastSyncTime > 0) {
			const lastSync = new Date(this.plugin.settings.lastSyncTime);
			containerEl.createEl('p', {
				text: `Last sync: ${lastSync.toLocaleString()}`,
				cls: 'setting-item-description'
			});
		}
	}
}
