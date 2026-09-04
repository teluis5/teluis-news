import fs from 'fs';
import path from 'path';
import https from 'https';

const urlMap = JSON.parse(fs.readFileSync('urlMap.json', 'utf8'));
const imgDir = 'src/assets/images';
const blogDir = 'src/content/blog';

// Find needed images
const files = fs.readdirSync(blogDir);
const neededImages = new Set();
files.forEach(file => {
    if (file.endsWith('.md') || file.endsWith('.mdx')) {
        const filePath = path.join(blogDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        
        const heroMatch = content.match(/^heroImage:\s*"?\.\.\/\.\.\/assets\/images\/([^"\n]+)"?/m);
        if (heroMatch) neededImages.add(heroMatch[1]);
        
        let match;
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

const missingImages = Array.from(neededImages).filter(img => !fs.existsSync(path.join(imgDir, img)));

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

async function downloadAll() {
    let success = 0;
    let failed = 0;
    
    for (const img of missingImages) {
        let url = urlMap[img];
        
        // Fallback to base image
        let fallbackUsed = false;
        if (!url) {
            const baseName = img.replace(/-\d+x\d+(?=\.[^.]+$)/, '');
            if (urlMap[baseName]) {
                url = urlMap[baseName]; // Just download the base image and pretend it's the resized one!
                fallbackUsed = true;
                console.log(`Will download BASE image ${url} as ${img}`);
            }
        }
        
        if (url) {
            try {
                await downloadImage(url, path.join(imgDir, img));
                console.log(`Downloaded: ${img}`);
                success++;
            } catch (err) {
                console.error(`Failed to download ${img}: ${err.message}`);
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
