import fs from 'fs';
import path from 'path';
import https from 'https';

const xmlPath = 'h:\\マイドライブ\\10_teluis\\0_Inbox\\yomilee.WordPress.2026-09-01.xml';
const imgDir = 'src/assets/images';

// 1. Parse XML and build a map of filename -> URL
const xmlContent = fs.readFileSync(xmlPath, 'utf8');
const urlRegex = /<wp:attachment_url><!\[CDATA\[(https:\/\/yomileeblog\.com\/wp-content\/uploads\/[^\]]+)\]\]><\/wp:attachment_url>/g;

const urlMap = {};
let match;
while ((match = urlRegex.exec(xmlContent)) !== null) {
    const fullUrl = match[1];
    const filename = path.basename(fullUrl);
    urlMap[filename] = fullUrl;
}

console.log(`Found ${Object.keys(urlMap).length} image URLs in XML.`);

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
    }
});

console.log(`Found ${neededImages.size} referenced images in markdown.`);

// 3. Download missing images
const downloadImage = (url, dest) => {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode === 200) {
                const file = fs.createWriteStream(dest);
                res.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve();
                });
            } else {
                reject(new Error(`Status ${res.statusCode} for ${url}`));
            }
        }).on('error', (err) => {
            reject(err);
        });
    });
};

const missingImages = Array.from(neededImages).filter(img => !fs.existsSync(path.join(imgDir, img)));
console.log(`Need to download ${missingImages.length} missing images.`);

async function downloadAll() {
    let success = 0;
    let failed = 0;
    
    for (const img of missingImages) {
        const url = urlMap[img];
        const dest = path.join(imgDir, img);
        
        if (url) {
            try {
                await downloadImage(url, dest);
                console.log(`Downloaded: ${img}`);
                success++;
            } catch (err) {
                console.error(`Failed to download ${img}: ${err.message}`);
                failed++;
            }
        } else {
            console.error(`URL not found in XML for ${img}`);
            failed++;
        }
    }
    console.log(`Download complete. Success: ${success}, Failed: ${failed}`);
}

downloadAll();
