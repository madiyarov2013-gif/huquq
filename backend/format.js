const fs = require('fs');
const path = require('path');

const text = fs.readFileSync('c:\\\\Users\\\\Admin\\\\Desktop\\\\Huquq\\\\backend\\\\konvensiya.txt', 'utf8');

const lines = text.split('\n').filter(l => l.trim() !== '');

let pages = [];
let currentPageContent = '';
let currentLength = 0;

function pushPage() {
    if (currentPageContent.trim()) {
        pages.push(`\n        \`\n${currentPageContent}\n        \``);
    }
    currentPageContent = '';
    currentLength = 0;
}

lines.forEach(line => {
    line = line.trim();
    if (line.match(/^\d+-modda/)) {
        if (currentLength > 1500) {
            pushPage();
        }
        currentPageContent += `        <div class="constitution-article"><span class="article-number">${line}</span></div>\n`;
        currentLength += line.length;
    } else if (line.match(/^[IVX]+ QISM/)) {
        pushPage();
        currentPageContent += `        <div class="constitution-chapter">${line}</div>\n`;
    } else if (line === 'Bola huquqlari toʻgʻrisida' || line === 'Konvensiya' || line === 'quyidagilar haqida kelishib oldilar:') {
        currentPageContent += `        <div class="constitution-section" style="text-align: center;">${line}</div>\n`;
    } else {
        currentPageContent += `        <div class="constitution-text">${line}</div>\n`;
        currentLength += line.length;
    }
});

pushPage();

const formattedPages = pages.join(',');

const booksPath = 'c:\\\\Users\\\\Admin\\\\Desktop\\\\Huquq\\\\frontend\\\\src\\\\data\\\\books.ts';
let booksCode = fs.readFileSync(booksPath, 'utf8');

const target = `
        <div class="constitution-article"><span class="article-number">3. Himoyalanish huquqi:</span></div>
        <div class="constitution-text">
          Ekspluatatsiya, zo'ravonlik, shafqatsiz muomala va haqoratlardan himoyalanish, bola mehnatining eng yomon shakllaridan himoyalanish huquqi.
        </div>
        \``;

if (booksCode.includes(target)) {
    booksCode = booksCode.replace(target, target + ',' + formattedPages);
    fs.writeFileSync(booksPath, booksCode);
    console.log('Successfully updated books.ts');
} else {
    console.log('Target string not found in books.ts');
}
