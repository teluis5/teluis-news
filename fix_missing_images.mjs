import fs from 'fs';
import path from 'path';

const blogDir = 'src/content/blog';
const imgDir = 'src/assets/images';

const files = fs.readdirSync(blogDir);

files.forEach(file => {
    if (file.endsWith('.md') || file.endsWith('.mdx')) {
        const filePath = path.join(blogDir, file);
        let content = fs.readFileSync(filePath, 'utf8');
        
        // Fix missing heroImage
        const heroMatch = content.match(/^heroImage:\s*"?\.\.\/\.\.\/assets\/images\/([^"\n]+)"?/m);
        if (heroMatch) {
            const imgName = heroMatch[1];
            if (!fs.existsSync(path.join(imgDir, imgName))) {
                content = content.replace(/^heroImage:.*$/m, '');
            }
        }
        
        // Fix missing markdown images ![](../../assets/images/xxx)
        const mdImgRegex = /!\[.*?\]\(\.\.\/\.\.\/assets\/images\/([^)]+)\)/g;
        let match;
        while ((match = mdImgRegex.exec(content)) !== null) {
            const imgName = match[1];
            if (!fs.existsSync(path.join(imgDir, imgName))) {
                content = content.replace(match[0], `![Image Not Found](https://dummyimage.com/600x400/cccccc/000000.png&text=Image+Not+Found)`);
            }
        }

        // Fix missing html images <img src="../../assets/images/xxx" />
        const htmlImgRegex = /<img[^>]+src="\.\.\/\.\.\/assets\/images\/([^"]+)"[^>]*>/g;
        while ((match = htmlImgRegex.exec(content)) !== null) {
            const imgName = match[1];
            if (!fs.existsSync(path.join(imgDir, imgName))) {
                content = content.replace(match[0], `<img src="https://dummyimage.com/600x400/cccccc/000000.png&text=Image+Not+Found" alt="Image Not Found" />`);
            }
        }
        
        fs.writeFileSync(filePath, content, 'utf8');
    }
});

console.log('Missing images replaced with placeholders.');
