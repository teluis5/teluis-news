import fs from 'fs';
import path from 'path';
import https from 'https';

const xmlPath = 'h:\\マイドライブ\\10_teluis\\0_Inbox\\yomilee.WordPress.2026-09-01.xml';
const imgDir = 'src/assets/images';

const xmlContent = fs.readFileSync(xmlPath, 'utf8');

// Build map of EVERY image URL mentioned in the XML
const urlMap = {};

// Find all URLs ending in common image extensions
const allUrlRegex = /https:\/\/yomileeblog\.com\/wp-content\/uploads\/[^"'\s<\]]+\.(?:jpg|jpeg|png|gif|webp)/gi;
let match;
while ((match = allUrlRegex.exec(xmlContent)) !== null) {
    const fullUrl = match[0];
    const filename = path.basename(fullUrl);
    
    // For conflicts like "image.png", we might still overwrite, but for "image-1024x637.png" it's unique enough!
    urlMap[filename] = fullUrl;
}

// 2. Read all markdown files to find referenced images
const blogDir = 'src/content/blog';
const files = fs.readdirSync(blogDir);

const neededImages = new Set();
files.forEach(file => {
    if (file.endsWith('.md') || file.endsWith('.mdx')) {
        const filePath = path.join(blogDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        
        const heroMatch = content.match(/^heroImage:\s*"?\.\.\/\.\.\/assets\/images\/([^"\n]+)"?/m);
        if (heroMatch) neededImages.add(heroMatch[1]);
        
        const mdImgRegex = /!\[.*?\]\(\.\.\/\.\.\/assets\/images\/([^)]+)\)/g;
        while ((match = mdImgRegex.exec(content)) !== null) {
            neededImages.add(match[1]);
        }

        const htmlImgRegex = /<img[^>]+src="\.\.\/\.\.\/assets\/images\/([^"]+)"[^>]*>/g;
        while ((match = htmlImgRegex.exec(content)) !== null) {
            neededImages.add(match[1]);
        }
        
        // Also look for dummy images and try to extract the original filename from somewhere?
        // Wait, if it's already a dummy image, the original filename is GONE from the markdown.
        // I MUST restore the markdown files from WP_Output first!
    }
});

console.log(`Found ${neededImages.size} referenced images in markdown (including dummies if not restored).`);

const missingImages = Array.from(neededImages).filter(img => !fs.existsSync(path.join(imgDir, img)));
console.log(`Need to download ${missingImages.length} images.`);

// But since the markdown might already have dummy images, we should output a map to a file for use after restoring.
fs.writeFileSync('urlMap.json', JSON.stringify(urlMap, null, 2));
console.log("Wrote urlMap.json");
