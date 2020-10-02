const { minify } = require('html-minifier');
const { readFileSync } = require('fs');
const { join } = require('path');

class HtmlTemplate {
    constructor(templateName, data, topLevel = false) {
        this.data = data;
        this.template = readFileSync(join(__dirname, `templates/${templateName}.html`), 'utf8');
        this.topLevel = topLevel;
    }

    _sanitize(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    render() {
        const templateMarker = '<!-- template -->';
        const html = this.template.replace(
            /{{(.+?)}}/g,
            (_, key) => {
                let data = this.data[key];
                if (data === undefined || data === null)
                    return '';

                data = data.toString();
                return data.startsWith(templateMarker) ? data : this._sanitize(data);
            },
        );

        return this.topLevel
            ? minify(html, {
                collapseBooleanAttributes: true,
                collapseInlineTagWhitespace: true,
                collapseWhitespace: true,
                removeComments: true,
            })
            : templateMarker + html;
    }
}

module.exports = (templateName, data, topLevel = false) => new HtmlTemplate(templateName, data, topLevel).render();
