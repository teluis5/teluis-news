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

// Map base filename (without extension) to its directory URL
const baseToDirMap = {};
for (const [filename, url] of Object.entries(urlMap)) {
    const base = filename.replace(/\.[^/.]+$/, "");
    baseToDirMap[base] = path.dirname(url);
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
    }
});

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
console.log(`Need to download ${missingImages.length} remaining missing images.`);

async function downloadAll() {
    let success = 0;
    let failed = 0;
    
    for (const img of missingImages) {
        let url = urlMap[img];
        
        // If not found, try to guess the URL from the base name (handling resized suffixes like -1024x768)
        if (!url) {
            const baseName = img.replace(/-\d+x\d+(?=\.[^.]+$)/, ''); // Remove resolution suffix
            const baseWithoutExt = baseName.replace(/\.[^/.]+$/, "");
            if (baseToDirMap[baseWithoutExt]) {
                url = `${baseToDirMap[baseWithoutExt]}/${img}`;
            }
        }
        
        if (url) {
            try {
                await downloadImage(url, path.join(imgDir, img));
                console.log(`Downloaded: ${img}`);
                success++;
            } catch (err) {
                console.error(`Failed to download ${img} from ${url}: ${err.message}`);
                failed++;
            }
        } else {
            console.error(`Could not construct URL for ${img}`);
            failed++;
        }
    }
    console.log(`Download complete. Success: ${success}, Failed: ${failed}`);
}

downloadAll();
