import fs from 'fs';
import path from 'path';

const dir = 'src/content/blog';
const files = fs.readdirSync(dir);

files.forEach(file => {
    if (file.endsWith('.md') || file.endsWith('.mdx')) {
        const filePath = path.join(dir, file);
        let content = fs.readFileSync(filePath, 'utf8');
        
        // Find the description line and replace it
        // The description line looks like: description: "some text"
        // It might span multiple lines if there's no closing quote due to corruption
        // Since we know it's right before `---` we can just replace everything from `description:` to `---`
        content = content.replace(/description:[\s\S]*?\n---/, 'description: ""\n---');
        
        fs.writeFileSync(filePath, content);
    }
});
console.log('Descriptions reset.');
