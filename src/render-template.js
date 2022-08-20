import { minify } from 'html-minifier';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

class HtmlTemplate {
    #data;
    #template;
    #topLevel;

    constructor(templateName, data, topLevel = false) {
        this.#data = data;
        this.#template = readFileSync(join(fileURLToPath(import.meta.url), `../../templates/${templateName}.html`), 'utf8');
        this.#topLevel = topLevel;
    }

    #sanitize(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    render() {
        const templateMarker = '<!-- template -->';
        const html = this.#template.replace(
            /{{(.+?)}}/g,
            (_, key) => {
                let data = this.#data[key];
                if (!data && data !== 0)
                    return '';

                data = data.toString();
                return data.startsWith(templateMarker) ? data : this.#sanitize(data);
            },
        );

        return this.#topLevel
            ? minify(html, {
                collapseBooleanAttributes: true,
                collapseInlineTagWhitespace: true,
                removeComments: true,
            })
            : templateMarker + html;
    }
}

export default function render(templateName, data, topLevel = false) {
    return new HtmlTemplate(templateName, data, topLevel).render();
}
