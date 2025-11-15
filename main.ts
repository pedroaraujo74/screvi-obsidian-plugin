import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, SuggestModal, FuzzySuggestModal } from 'obsidian';
import { ScreviApiClient, ScreviHighlight, Source, VALID_SOURCE_TYPES } from './src/api';
import * as nunjucks from 'nunjucks';

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

export default class ScreviSyncPlugin extends Plugin {
	settings: ScreviSyncSettings;
	syncInterval: NodeJS.Timeout | null = null;
	statusBarItem: HTMLElement;
	highlights: ScreviHighlight[] = [];
	apiClient: ScreviApiClient;
	nunjucksEnv: nunjucks.Environment;
	private isSyncing: boolean = false;

	async onload() {
		await this.loadSettings();
		// Templates are now loaded on-demand

		// Initialize API client
		this.apiClient = new ScreviApiClient(this.settings.apiKey, 'https://api.screvi.com');

		// Initialize Nunjucks template engine
		this.setupNunjucks();

		// Status bar
		this.statusBarItem = this.addStatusBarItem();
		this.updateStatusBar('Ready');

		// Commands
		this.addCommand({
			id: 'sync-screvi-highlights',
			name: 'Sync Screvi highlights',
			callback: async () => {
				await this.syncHighlights();
			}
		});

		this.addCommand({
			id: 'insert-screvi-highlight',
			name: 'Insert Screvi highlight',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				this.insertHighlightModal(editor);
			}
		});

		this.addCommand({
			id: 'search-screvi-highlights',
			name: 'Search Screvi highlights',
			callback: () => {
				new ScreviSearchModal(this.app, this.highlights, (highlight) => {
					// Open or create note with the highlight
					this.openHighlight(highlight);
				}).open();
			}
		});

		this.addCommand({
			id: 'force-full-sync',
			name: 'Force full sync',
			callback: async () => {
				await this.syncHighlights(true);
			}
		});

		this.addCommand({
			id: 'browse-sources',
			name: 'Browse sources',
			callback: () => {
				this.browseSourcesModal();
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
		if (this.syncInterval) {
			clearInterval(this.syncInterval);
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		// Update API client credentials when settings change
		if (this.apiClient) {
			this.apiClient.updateCredentials(this.settings.apiKey, 'https://api.screvi.com');
		}
	}

	async loadHighlightTemplate(): Promise<string> {
		try {
			const fs = require('fs');
			const path = require('path');
			
			// Get the plugin directory path
			const pluginDir = (this.app.vault.adapter as any).basePath + '/.obsidian/plugins/obsidian-screvi-plugin';
			const highlightTemplatePath = path.join(pluginDir, 'templates', 'highlight-template.md');
			
			if (fs.existsSync(highlightTemplatePath)) {
				return fs.readFileSync(highlightTemplatePath, 'utf8');
			}
		} catch (error) {
			console.error('Error loading highlight template:', error);
		}
		return '';
	}

	async loadBookTemplate(): Promise<string> {
		try {
			const fs = require('fs');
			const path = require('path');
			
			// Get the plugin directory path
			const pluginDir = (this.app.vault.adapter as any).basePath + '/.obsidian/plugins/obsidian-screvi-plugin';
			const bookTemplatePath = path.join(pluginDir, 'templates', 'book-template.md');
			
			if (fs.existsSync(bookTemplatePath)) {
				return fs.readFileSync(bookTemplatePath, 'utf8');
			}
		} catch (error) {
			console.error('Error loading book template:', error);
		}
		return '';
	}



	updateStatusBar(text: string) {
		this.statusBarItem.setText(`Screvi: ${text}`);
	}

	setupAutoSync() {
		if (this.syncInterval) {
			clearInterval(this.syncInterval);
		}
		
		if (this.settings.autoSync && this.settings.syncInterval > 0) {
			this.syncInterval = setInterval(() => {
				this.syncHighlights();
			}, this.settings.syncInterval * 60 * 60 * 1000);
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
				
				// Update cached highlights, removing duplicates based on content and date
				const existingIds = new Set(this.highlights.map(h => `${h.content || ''}_${h.created_at || h.date || ''}`));
				const newUniqueHighlights = uniqueHighlights.filter(h => 
					!existingIds.has(`${h.content || ''}_${h.created_at || h.date || ''}`)
				);
				
				this.highlights = [...newUniqueHighlights, ...this.highlights];
				await this.saveCachedHighlights();
				
				this.settings.lastSyncTime = Date.now();
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

	async processHighlights(highlights: ScreviHighlight[]) {
		// Ensure folder exists
		const folder = this.app.vault.getAbstractFileByPath(this.settings.defaultFolder);
		if (!folder) {
			await this.app.vault.createFolder(this.settings.defaultFolder);
		}

		// Group highlights by source type for folder organization
		const highlightsByType = this.groupHighlightsBySourceType(highlights);
		
		for (const [sourceType, typeHighlights] of Object.entries(highlightsByType)) {
			// Create source type folder with display name
			const displayName = this.getSourceTypeDisplayName(sourceType);
			const typeFolderPath = `${this.settings.defaultFolder}/${this.sanitizeFileName(displayName)}`;
			const typeFolder = this.app.vault.getAbstractFileByPath(typeFolderPath);
			if (!typeFolder) {
				await this.app.vault.createFolder(typeFolderPath);
			}

			// Always create book files (group highlights by source)
			// Pass display name for folder path, but keep sourceType for internal logic
			await this.createBookFiles(typeHighlights, displayName);
		}
	}

	async createBookFiles(highlights: ScreviHighlight[], sourceTypeDisplayName?: string) {
		const groupedHighlights = this.groupHighlightsBySource(highlights);
		const baseFolder = sourceTypeDisplayName ? `${this.settings.defaultFolder}/${this.sanitizeFileName(sourceTypeDisplayName)}` : this.settings.defaultFolder;
		
		for (const [source, sourceHighlights] of Object.entries(groupedHighlights)) {
			const fileName = this.sanitizeFileName(source);
			const filePath = `${baseFolder}/${fileName}.md`;
			
			const existingFile = this.app.vault.getAbstractFileByPath(filePath);
			
			if (existingFile instanceof TFile) {
				// File exists - just append new highlights
				const existingContent = await this.app.vault.read(existingFile);
				let newContent = existingContent;
				
				// Append each new highlight
				for (const highlight of sourceHighlights) {
					// Format content as proper blockquote (add > to each line)
					const formattedContent = this.formatAsBlockquote(highlight.content || '');
					const highlightContent = `\n${formattedContent}\n\n---\n`;
					
					// Only append if this exact highlight isn't already in the file
					if (!existingContent.includes(highlight.content)) {
						newContent += highlightContent;
					}
				}
				
				// Only update if we actually added something
				if (newContent !== existingContent) {
					await this.app.vault.modify(existingFile, newContent);
				}
			} else {
				// File doesn't exist - create new one with template
				const templateData = {
					title: source,
					author: sourceHighlights[0]?.author || '',
					url: sourceHighlights[0]?.url || '',
					highlights: sourceHighlights
				};
				
				const bookTemplate = await this.loadBookTemplate();
				const content = this.renderTemplate(bookTemplate, templateData);
				await this.app.vault.create(filePath, content);
			}
		}
	}

	groupHighlightsBySource(highlights: ScreviHighlight[]): Record<string, ScreviHighlight[]> {
		return highlights.reduce((groups, highlight) => {
			const source = highlight.source || 'Unknown Source';
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
			let sourceType = highlight.sourceType || 'self';
			
			// Map to the exact folder types: "book", "tweet", "self", "article", "youtube"
			if (!VALID_SOURCE_TYPES.includes(sourceType as any)) {
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
			// Create a unique key based on content and creation date
			const key = `${highlight.content || ''}_${highlight.created_at || highlight.date || ''}`;
			if (seen.has(key)) {
				return false;
			}
			seen.add(key);
			return true;
		});
	}

	generateFileName(highlight: ScreviHighlight): string {
		const source = this.sanitizeFileName(highlight.source || 'Unknown Source');
		const timestamp = new Date(highlight.created_at || highlight.date).toISOString().split('T')[0];
		const id = highlight.id ? highlight.id.slice(-8) : Math.random().toString(36).substr(2, 8);
		return `${source}_${timestamp}_${id}`;
	}

	formatHighlightContent(content: string): string {
		if (!content) return content;
		
		return content
			.trim()
			.split('\n')
			.map(line => line.trim() ? `> ${line.trim()}` : '>')
			.join('\n');
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
			.replace(/[\/\\]/g, '-')        // Replace path separators with hyphens
			.replace(/\.+$/g, '')           // Remove trailing dots (Windows issue)
			.trim();                        // Remove leading/trailing whitespace
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
				const decoded = this.decodeHtmlEntities(str);
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
				return this.decodeHtmlEntities(str);
			}
			return str;
		});

		this.nunjucksEnv.addFilter('decode_text', (str: string) => {
			if (str && typeof str === 'string') {
				return this.decodeHtmlEntities(str);
			}
			return str;
		});
	}

	renderTemplate(template: string, data: any): string {
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

	getNestedValue(obj: any, path: string): any {
		return path.split('.').reduce((current, key) => current && current[key], obj);
	}

	setNestedValue(obj: any, path: string, value: any): void {
		const keys = path.split('.');
		const lastKey = keys.pop();
		const target = keys.reduce((current, key) => {
			if (!current[key]) current[key] = {};
			return current[key];
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

	decodeHtmlEntities(text: string): string {
		if (!text) return text;
		
		// Common HTML entities that might appear in content
		const entities: { [key: string]: string } = {
			'&amp;': '&',
			'&lt;': '<',
			'&gt;': '>',
			'&quot;': '"',
			'&#39;': "'",
			'&apos;': "'",
			'&nbsp;': ' ',
			'&ndash;': '\u2013',
			'&mdash;': '\u2014',
			'&hellip;': '\u2026',
			'&lsquo;': '\u2018',
			'&rsquo;': '\u2019',
			'&ldquo;': '\u201c',
			'&rdquo;': '\u201d'
		};

		let decoded = text;

		// First handle JSON escape sequences
		decoded = decoded
			.replace(/\\n/g, '\n')      // Newlines
			.replace(/\\t/g, '\t')      // Tabs  
			.replace(/\\r/g, '\r')      // Carriage returns
			.replace(/\\"/g, '"')       // Escaped quotes
			.replace(/\\\\/g, '\\');    // Escaped backslashes (do this last)

		// Replace named HTML entities
		for (const [entity, replacement] of Object.entries(entities)) {
			decoded = decoded.replace(new RegExp(entity, 'g'), replacement);
		}

		// Replace numeric entities (like &#39; &#8217; etc.)
		decoded = decoded.replace(/&#(\d+);/g, (match, num) => {
			return String.fromCharCode(parseInt(num, 10));
		});

		// Replace hex entities (like &#x27; etc.)
		decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => {
			return String.fromCharCode(parseInt(hex, 16));
		});

		return decoded;
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
			.replace(/[^\w\-\/]/g, '')      // Keep only letters, numbers, underscores, hyphens, and forward slashes
			.replace(/\/+/g, '/')           // Collapse multiple slashes
			.replace(/^\/|\/$/g, '')        // Remove leading/trailing slashes
			.toLowerCase();                 // Convert to lowercase for consistency
	}

	async loadCachedHighlights() {
		const cached = await this.loadData();
		this.highlights = cached?.highlights || [];
	}

	async saveCachedHighlights() {
		const data = await this.loadData() || {};
		data.highlights = this.highlights;
		await this.saveData(data);
	}

	async openHighlight(highlight: ScreviHighlight) {
		const fileName = this.generateFileName(highlight);
		const filePath = `${this.settings.defaultFolder}/${fileName}.md`;
		
		let file = this.app.vault.getAbstractFileByPath(filePath);
		
		if (!file) {
					// Create the file if it doesn't exist
		const highlightTemplate = await this.loadHighlightTemplate();
		const content = this.renderTemplate(highlightTemplate, highlight);
		await this.app.vault.create(filePath, content);
			file = this.app.vault.getAbstractFileByPath(filePath);
		}

		if (file instanceof TFile) {
			await this.app.workspace.getLeaf().openFile(file);
		}
	}

	async insertHighlightModal(editor: Editor) {
		new ScreviHighlightModal(this.app, this.highlights, async (highlight) => {
			const highlightTemplate = await this.loadHighlightTemplate();
			const content = this.renderTemplate(highlightTemplate, highlight);
			editor.replaceSelection(content);
		}).open();
	}

	async browseSourcesModal() {
		if (!this.settings.apiKey) {
			new Notice('Please set your Screvi API key in plugin settings');
			return;
		}

		try {
			this.updateStatusBar('Loading sources...');
			const sources = await this.apiClient.fetchSources();
			this.updateStatusBar('Ready');
			
			new ScreviSourceModal(this.app, sources, (source) => {
				// Create a book file for the selected source
				this.createBookFileFromSource(source);
			}).open();
		} catch (error) {
			console.error('Error fetching sources:', error);
			const errorMessage = error instanceof Error ? error.message : String(error);
			new Notice('Failed to fetch sources: ' + errorMessage);
			this.updateStatusBar('Ready');
		}
	}

	async createBookFileFromSource(source: Source) {
		// Ensure folder exists
		const folder = this.app.vault.getAbstractFileByPath(this.settings.defaultFolder);
		if (!folder) {
			await this.app.vault.createFolder(this.settings.defaultFolder);
		}

		const fileName = this.sanitizeFileName(source.name);
		const filePath = `${this.settings.defaultFolder}/${fileName}.md`;
		
		const bookTemplate = await this.loadBookTemplate();
		const content = this.renderTemplate(bookTemplate, {
			title: source.name,
			author: source.author || '',
			url: source.url || '',
			highlights: source.highlights
		});

		const existingFile = this.app.vault.getAbstractFileByPath(filePath);
		
		if (existingFile instanceof TFile) {
			await this.app.vault.modify(existingFile, content);
			new Notice(`Updated book file: ${source.name}`);
		} else {
			await this.app.vault.create(filePath, content);
			new Notice(`Created book file: ${source.name}`);
		}

		// Open the file
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (file instanceof TFile) {
			await this.app.workspace.getLeaf().openFile(file);
		}
	}
}

class ScreviSearchModal extends FuzzySuggestModal<ScreviHighlight> {
	highlights: ScreviHighlight[];
	callback: (highlight: ScreviHighlight) => void;

	constructor(app: App, highlights: ScreviHighlight[], callback: (highlight: ScreviHighlight) => void) {
		super(app);
		this.highlights = highlights;
		this.callback = callback;
		this.setPlaceholder("Search your Screvi highlights...");
	}

	getItems(): ScreviHighlight[] {
		return this.highlights;
	}

	getItemText(highlight: ScreviHighlight): string {
		const content = highlight.content || '';
		return `${highlight.source || 'Unknown Source'} - ${content.substring(0, 100)}...`;
	}

	onChooseItem(highlight: ScreviHighlight, evt: MouseEvent | KeyboardEvent) {
		this.callback(highlight);
	}
}

class ScreviHighlightModal extends Modal {
	highlights: ScreviHighlight[];
	callback: (highlight: ScreviHighlight) => void;

	constructor(app: App, highlights: ScreviHighlight[], callback: (highlight: ScreviHighlight) => void) {
		super(app);
		this.highlights = highlights;
		this.callback = callback;
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.createEl("h1", { text: "Insert Screvi highlight" });
		
		if (this.highlights.length === 0) {
			contentEl.createEl("p", { text: "No highlights available. Please sync your highlights first." });
			const button = contentEl.createEl("button", { text: "Close" });
			button.onclick = () => this.close();
			return;
		}

		const searchInput = contentEl.createEl("input", { 
			type: "text", 
			placeholder: "Search highlights..." 
		});
		searchInput.style.width = "100%";
		searchInput.style.marginBottom = "16px";

		const highlightsList = contentEl.createEl("div");
		highlightsList.style.maxHeight = "400px";
		highlightsList.style.overflowY = "auto";

		const renderHighlights = (filter: string = '') => {
			highlightsList.empty();
			
			const filteredHighlights = this.highlights.filter(h => {
				const content = h.content || '';
				const source = h.source || '';
				return content.toLowerCase().includes(filter.toLowerCase()) ||
					   source.toLowerCase().includes(filter.toLowerCase());
			});

			filteredHighlights.forEach(highlight => {
				const item = highlightsList.createEl("div");
				item.style.padding = "12px";
				item.style.border = "1px solid var(--background-modifier-border)";
				item.style.marginBottom = "8px";
				item.style.cursor = "pointer";
				item.style.borderRadius = "4px";

				item.createEl("strong", { text: highlight.source || 'Unknown Source' });
				const content = highlight.content || '';
				item.createEl("p", { text: content.substring(0, 200) + "..." });
				const date = highlight.created_at || highlight.date || new Date().toISOString();
				item.createEl("small", { text: new Date(date).toLocaleDateString() });

				item.onclick = () => {
					this.callback(highlight);
					this.close();
				};

				item.onmouseenter = () => {
					item.style.backgroundColor = "var(--background-modifier-hover)";
				};

				item.onmouseleave = () => {
					item.style.backgroundColor = "transparent";
				};
			});
		};

		searchInput.oninput = () => renderHighlights(searchInput.value);
		renderHighlights();
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class ScreviSourceModal extends FuzzySuggestModal<Source> {
	sources: Source[];
	callback: (source: Source) => void;

	constructor(app: App, sources: Source[], callback: (source: Source) => void) {
		super(app);
		this.sources = sources;
		this.callback = callback;
		this.setPlaceholder("Search your Screvi sources...");
	}

	getItems(): Source[] {
		return this.sources;
	}

	getItemText(source: Source): string {
		const highlightCount = source.highlights ? source.highlights.length : 0;
		return `${source.name} (${highlightCount} highlights) - ${source.author || 'Unknown Author'}`;
	}

	onChooseItem(source: Source, evt: MouseEvent | KeyboardEvent) {
		this.callback(source);
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

		containerEl.createEl('h2', {text: 'Screvi Sync Settings'});

		// API Key
		new Setting(containerEl)
			.setName('Screvi API key')
			.setDesc('Your Screvi API key for authentication')
			.addText(text => text
				.setPlaceholder('Enter your API key')
				.setValue(this.plugin.settings.apiKey)
				.onChange(async (value) => {
					this.plugin.settings.apiKey = value;
					await this.plugin.saveSettings();
				}));

		// Auto Sync
		new Setting(containerEl)
			.setName('Auto sync')
			.setDesc('Automatically sync highlights at regular intervals')
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
				.setDesc('How often to automatically sync highlights')
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
		containerEl.createEl('h3', {text: 'Actions'});

		new Setting(containerEl)
			.setName('Sync now')
			.setDesc('Manually sync highlights from Screvi')
			.addButton(button => button
				.setButtonText('Sync')
				.setCta()
				.onClick(async () => {
					button.setButtonText('Syncing...');
					button.setDisabled(true);
					try {
						await this.plugin.syncHighlights();
					} finally {
						button.setButtonText('Sync');
						button.setDisabled(false);
					}
				}));

		new Setting(containerEl)
			.setName('Full sync')
			.setDesc('Re-sync all highlights (ignores last sync time)')
			.addButton(button => button
				.setButtonText('Full sync')
				.onClick(async () => {
					button.setButtonText('Syncing...');
					button.setDisabled(true);
					try {
						await this.plugin.syncHighlights(true);
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

