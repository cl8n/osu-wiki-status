import { html as diff2Html } from 'diff2html';
import { writeFileSync } from 'node:fs';
import render from './render-template.js';

export default function printDiff(diff, outputFile) {
    const diffHtml = '<!-- template -->' + diff2Html(diff, { drawFileList: false });
    const html = render('diff', { diff: diffHtml }, true);

    writeFileSync(outputFile, html);
}
