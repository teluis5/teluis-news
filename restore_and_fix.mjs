import fs from 'fs';
import path from 'path';

const postsDir = 'WP_Output/posts';
const outPostsDir = 'src/content/blog';

// Process markdown files
const processMarkdownFiles = (dir) => {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            if (file !== 'images' && file !== '_drafts') {
                processMarkdownFiles(fullPath);
            }
        } else if (file.endsWith('.md') || file.endsWith('.mdx')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            
            // 1. Process Frontmatter
            // Change `date:` to `pubDate:`
            content = content.replace(/^date:/m, 'pubDate:');
            
            // Change `coverImage: "..."` to `heroImage: "../../assets/images/..."`
            content = content.replace(/^coverImage:\s*"?([^"\n]+)"?/m, 'heroImage: "../../assets/images/$1"');
            
            // Add description: ""
            if (content.startsWith('---')) {
                const endOfFrontmatter = content.indexOf('---', 3);
                if (endOfFrontmatter > -1) {
                    const frontmatter = content.substring(3, endOfFrontmatter);
                    if (!frontmatter.includes('description:')) {
                        content = '---' + frontmatter + 'description: ""\n' + content.substring(endOfFrontmatter);
                    }
                }
            }
            
            // 2. Process image paths in content
            content = content.replace(/\]\(images\//g, '](../../assets/images/');
            content = content.replace(/src="images\//g, 'src="../../assets/images/');
            
            // Write to src/content/blog
            const outPath = path.join(outPostsDir, file);
            fs.writeFileSync(outPath, content, 'utf8');
        }
    });
};

processMarkdownFiles(postsDir);
console.log("Restored and fixed markdown files!");
