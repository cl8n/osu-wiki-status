import { minify } from 'html-minifier';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const templateCache = {};
const templateMarker = '<!-- template -->';

function getTemplate(templateName) {
	templateCache[templateName] ??= readFileSync(join(
		fileURLToPath(import.meta.url),
		`../../templates/${templateName}.html`,
	), 'utf8');

	return templateCache[templateName];
}

export default function render(templateName, data, topLevel = false) {
	const html = getTemplate(templateName).replaceAll(
		/{{([a-z]+)}}/gi,
		(_, key) => {
			let value = data[key]?.toString();

			if (!value) {
				return '';
			}

			return value.startsWith(templateMarker)
				? value
				: value
					.replaceAll('&', '&amp;')
					.replaceAll('<', '&lt;')
					.replaceAll('>', '&gt;')
					.replaceAll('"', '&quot;')
					.replaceAll("'", '&#039;');
		},
	);

	return topLevel
		? minify(html, {
			collapseBooleanAttributes: true,
			collapseInlineTagWhitespace: true,
			removeComments: true,
		})
		: templateMarker + html;
}
