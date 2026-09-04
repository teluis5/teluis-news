import fs from 'fs';
import path from 'path';

const dir = 'src/content/blog';
const files = fs.readdirSync(dir);

files.forEach(file => {
    if (file.endsWith('.md') || file.endsWith('.mdx')) {
        const filePath = path.join(dir, file);
        let content = fs.readFileSync(filePath, 'utf8');
        
        // Check if description exists in frontmatter
        if (content.startsWith('---')) {
            const endOfFrontmatter = content.indexOf('---', 3);
            if (endOfFrontmatter > -1) {
                const frontmatter = content.substring(3, endOfFrontmatter);
                if (!frontmatter.includes('description:')) {
                    // Extract first paragraph for description or use empty string
                    const body = content.substring(endOfFrontmatter + 3).trim();
                    const firstLine = body.split('\n').find(line => line.trim().length > 0 && !line.startsWith('#') && !line.startsWith('!') && !line.startsWith('<')) || '';
                    const desc = firstLine.substring(0, 100).replace(/"/g, '').replace(/'/g, '').trim();
                    
                    const newFrontmatter = frontmatter + `description: "${desc}"\n`;
                    content = '---' + newFrontmatter + content.substring(endOfFrontmatter);
                    fs.writeFileSync(filePath, content);
                }
            }
        }
    }
});
console.log('Descriptions added.');
