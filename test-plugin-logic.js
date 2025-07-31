const nunjucks = require('nunjucks');
const fs = require('fs');
const path = require('path');

// Simulate the plugin's exact setup
class TestScreviPlugin {
    constructor() {
        this.settings = {
            tagPrefix: "screvi/",
            enableAutoLinking: true,
            autoLinkFields: ["author"]
        };
        this.setupNunjucks();
    }

    setupNunjucks() {
        // Create a new Nunjucks environment (exactly like in main.ts)
        this.nunjucksEnv = new nunjucks.Environment();
        
        // Add custom filters (exactly like in main.ts)
        this.nunjucksEnv.addFilter('link', (str) => {
            if (str && str.trim()) {
                return `[[${str}]]`;
            }
            return str;
        });
        
        this.nunjucksEnv.addFilter('color', (str, color) => {
            if (str && str.trim() && color) {
                return `<mark style="background-color: ${color};">${str}</mark>`;
            }
            return str;
        });
        
        this.nunjucksEnv.addFilter('sanitize_tag', (str) => {
            return this.sanitizeTagName(str);
        });
        
        this.nunjucksEnv.addFilter('date', (dateStr, format) => {
            if (dateStr) {
                const date = new Date(dateStr);
                if (!isNaN(date.getTime())) {
                    return this.formatDate(date, format);
                }
            }
            return dateStr;
        });
        
        this.nunjucksEnv.addFilter('replace', (str, search, replace) => {
            if (str && search) {
                return str.replace(new RegExp(search, 'g'), replace || '');
            }
            return str;
        });
    }

    sanitizeTagName(tagName) {
        return tagName
            .replace(/\s+/g, '-')           // Replace spaces with hyphens
            .replace(/[^\w\-\/]/g, '')      // Keep only letters, numbers, underscores, hyphens, and forward slashes
            .replace(/\/+/g, '/')           // Collapse multiple slashes
            .replace(/^\/|\/$/g, '')        // Remove leading/trailing slashes
            .toLowerCase();                 // Convert to lowercase for consistency
    }

    formatDate(date, format) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        
        return format
            .replace('YYYY', String(year))
            .replace('MM', month)
            .replace('DD', day);
    }

    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => current && current[key], obj);
    }

    setNestedValue(obj, path, value) {
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

    renderTemplate(template, data) {
        try {
            // Add tag_prefix to the data context (exactly like in main.ts)
            const contextData = {
                ...data,
                tag_prefix: this.settings.tagPrefix
            };
            
            // Process auto-linking for specified fields (exactly like in main.ts)
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
            return `Template Error: ${error.message}`;
        }
    }

    async loadBookTemplate() {
        const bookTemplatePath = path.join(__dirname, '../../../templates/book-template.md');
        if (fs.existsSync(bookTemplatePath)) {
            return fs.readFileSync(bookTemplatePath, 'utf8');
        }
        return '';
    }

    async loadHighlightTemplate() {
        const highlightTemplatePath = path.join(__dirname, '../../../templates/highlight-template.md');
        if (fs.existsSync(highlightTemplatePath)) {
            return fs.readFileSync(highlightTemplatePath, 'utf8');
        }
        return '';
    }

    // Simulate the exact logic from createBookFiles method
    async simulateCreateBookFiles(highlights, sourceType) {
        const groupedHighlights = this.groupHighlightsBySource(highlights);
        
        for (const [source, sourceHighlights] of Object.entries(groupedHighlights)) {
            const uniqueHighlights = this.deduplicateHighlights(sourceHighlights);
            
            const templateData = {
                title: source,
                author: sourceHighlights[0]?.author || '',
                url: sourceHighlights[0]?.url || '',
                highlights: uniqueHighlights
            };
            
            console.log('\n🔄 Processing source:', source);
            console.log('📊 Template data:', {
                title: templateData.title,
                author: templateData.author,
                url: templateData.url,
                highlightCount: templateData.highlights.length,
                firstHighlight: templateData.highlights[0]
            });
            
            const bookTemplate = await this.loadBookTemplate();
            const content = this.renderTemplate(bookTemplate, templateData);
            
            console.log('\n📄 Generated content:');
            console.log('-'.repeat(60));
            console.log(content);
            console.log('-'.repeat(60));
            
            // Look for any remaining template syntax
            const hasRawSyntax = content.includes('{%') || content.includes('%}');
            if (hasRawSyntax) {
                console.log('❌ FOUND RAW TEMPLATE SYNTAX!');
                console.log('Problematic lines:');
                content.split('\n').forEach((line, index) => {
                    if (line.includes('{%') || line.includes('%}')) {
                        console.log(`Line ${index + 1}: ${line}`);
                    }
                });
            } else {
                console.log('✅ No raw template syntax found - template rendered correctly!');
            }
        }
    }

    groupHighlightsBySource(highlights) {
        return highlights.reduce((groups, highlight) => {
            const source = highlight.source || 'Unknown Source';
            if (!groups[source]) {
                groups[source] = [];
            }
            groups[source].push(highlight);
            return groups;
        }, {});
    }

    deduplicateHighlights(highlights) {
        const seen = new Set();
        return highlights.filter(highlight => {
            const key = `${highlight.content || ''}_${highlight.created_at || highlight.date || ''}`;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }
}

// Test data that simulates real Screvi API response
const testHighlights = [
    {
        id: "highlight_1",
        content: "This is the first highlight from a book about productivity.",
        source: "Atomic Habits",
        author: "James Clear",
        url: "https://example.com/atomic-habits",
        sourceType: "book",
        created_at: "2025-01-17T10:30:00Z",
        note: "Very important insight",
        chapter: "Chapter 1: The Fundamentals",
        page: "23",
        tags: [
            { name: "productivity", color: "#ff0000" },
            { name: "habits", color: "#00ff00" }
        ]
    },
    {
        id: "highlight_2", 
        content: "Another insight about building systems instead of goals.",
        source: "Atomic Habits",
        author: "James Clear", 
        url: "https://example.com/atomic-habits",
        sourceType: "book",
        created_at: "2025-01-17T11:45:00Z",
        chapter: "Chapter 2: How Your Habits Shape Your Identity",
        page: "45",
        tags: [
            { name: "systems", color: "#0000ff" }
        ]
    }
];

// Run the test
async function runTest() {
    console.log('='.repeat(80));
    console.log('PLUGIN LOGIC SIMULATION TEST');
    console.log('='.repeat(80));
    
    const plugin = new TestScreviPlugin();
    await plugin.simulateCreateBookFiles(testHighlights, "book");
    
    console.log('\n' + '='.repeat(80));
    console.log('TEST COMPLETE');
    console.log('='.repeat(80));
}

runTest().catch(console.error); 