const nunjucks = require('nunjucks');
const fs = require('fs');
const path = require('path');

// Initialize Nunjucks environment
const env = new nunjucks.Environment();

// Add custom filters (same as in main.ts)
env.addFilter('link', (str) => {
    if (str && str.trim()) {
        return `[[${str}]]`;
    }
    return str;
});

env.addFilter('color', (str, color) => {
    if (str && str.trim() && color) {
        return `<mark style="background-color: ${color};">${str}</mark>`;
    }
    return str;
});

env.addFilter('sanitize_tag', (str) => {
    return str
        .replace(/\s+/g, '-')           // Replace spaces with hyphens
        .replace(/[^\w\-\/]/g, '')      // Keep only letters, numbers, underscores, hyphens, and forward slashes
        .replace(/\/+/g, '/')           // Collapse multiple slashes
        .replace(/^\/|\/$/g, '')        // Remove leading/trailing slashes
        .toLowerCase();                 // Convert to lowercase for consistency
});

env.addFilter('date', (dateStr, format) => {
    if (dateStr) {
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            
            return format
                .replace('YYYY', String(year))
                .replace('MM', month)
                .replace('DD', day);
        }
    }
    return dateStr;
});

env.addFilter('replace', (str, search, replace) => {
    if (str && search) {
        return str.replace(new RegExp(search, 'g'), replace || '');
    }
    return str;
});

// Sample data for testing
const sampleData = {
    title: "Test Book",
    author: "Test Author",
    url: "https://example.com",
    tag_prefix: "screvi/",
    highlights: [
        {
            content: "This is a test highlight about productivity and focus.",
            note: "Important insight about workflow",
            chapter: "Chapter 1: Getting Started",
            page: "42",
            tags: [
                { name: "productivity", color: "#ff0000" },
                { name: "focus/deep work", color: "#00ff00" }
            ],
            created_at: "2025-01-17T10:30:00Z"
        },
        {
            content: "Another highlight without notes or tags.",
            chapter: "Chapter 2: Advanced Topics",
            page: "85",
            created_at: "2025-01-17T11:45:00Z"
        }
    ]
};

// Read template files
const bookTemplatePath = path.join(__dirname, '../../../templates/book-template.md');
const highlightTemplatePath = path.join(__dirname, '../../../templates/highlight-template.md');

console.log('='.repeat(60));
console.log('TEMPLATE RENDERING TEST');
console.log('='.repeat(60));

try {
    // Test book template
    console.log('\n📚 TESTING BOOK TEMPLATE:');
    console.log('-'.repeat(40));
    
    if (fs.existsSync(bookTemplatePath)) {
        const bookTemplate = fs.readFileSync(bookTemplatePath, 'utf8');
        console.log('📄 Raw template:');
        console.log(bookTemplate);
        console.log('\n🔄 Rendered output:');
        console.log('-'.repeat(40));
        
        try {
            const bookResult = env.renderString(bookTemplate, sampleData);
            console.log(bookResult);
        } catch (error) {
            console.error('❌ Book template rendering error:', error.message);
            console.error('Stack:', error.stack);
        }
    } else {
        console.log('❌ Book template not found at:', bookTemplatePath);
    }

    // Test highlight template
    console.log('\n\n📝 TESTING HIGHLIGHT TEMPLATE:');
    console.log('-'.repeat(40));
    
    if (fs.existsSync(highlightTemplatePath)) {
        const highlightTemplate = fs.readFileSync(highlightTemplatePath, 'utf8');
        console.log('📄 Raw template:');
        console.log(highlightTemplate);
        console.log('\n🔄 Rendered output:');
        console.log('-'.repeat(40));
        
        try {
            const highlightData = {
                ...sampleData.highlights[0],
                title: sampleData.title,
                author: sampleData.author,
                source: sampleData.title,
                url: sampleData.url,
                tag_prefix: sampleData.tag_prefix,
                tags: sampleData.highlights[0].tags
            };
            
            const highlightResult = env.renderString(highlightTemplate, highlightData);
            console.log(highlightResult);
        } catch (error) {
            console.error('❌ Highlight template rendering error:', error.message);
            console.error('Stack:', error.stack);
        }
    } else {
        console.log('❌ Highlight template not found at:', highlightTemplatePath);
    }

} catch (error) {
    console.error('❌ General error:', error.message);
    console.error('Stack:', error.stack);
}

console.log('\n' + '='.repeat(60));
console.log('TEST COMPLETE');
console.log('='.repeat(60)); 