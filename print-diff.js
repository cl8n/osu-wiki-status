const { html: diff2Html } = require('diff2html');
const { writeFileSync } = require('fs');
const render = require('./render-template');

module.exports = function (diff, outputFile) {
    const diffHtml = '<!-- template -->' + diff2Html(diff, { drawFileList: false });
    const html = render('diff', { diff: diffHtml }, true);

    writeFileSync(outputFile, html);
};
