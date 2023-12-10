#!/usr/bin/env node

import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import buildPage from '../src/build-page.js';
import locales from '../src/locales.js';
import OsuWiki from '../src/OsuWiki.js';
import render from '../src/render-template.js';

const updateOnly = process.argv[2] === '--update-only';

if (updateOnly) {
	process.argv.splice(2, 1);
}

if (process.argv.length !== 4) {
	console.error('Usage: npm run build -- [--update-only] <osu-wiki directory> <output directory>');
	process.exit(1);
}

const osuWiki = new OsuWiki(process.argv[2]);
const outputDirectory = process.argv[3];

if (updateOnly && !await osuWiki.checkAndMergeUpdates()) {
	process.exit(1);
}

await mkdir(join(outputDirectory, 'flags'), { recursive: true });

for (const [locale, { flag }] of Object.entries(locales)) {
    await writeFile(
        join(outputDirectory, `${locale}.html`),
        await buildPage(osuWiki, locale),
    );
    await copyFile(
        join(fileURLToPath(import.meta.url), `../../templates/flags/${flag.toLowerCase()}.png`),
        join(outputDirectory, `flags/${flag}.png`),
    );

    if (locale === 'en') {
        continue;
    }

    const groupInfo = await osuWiki.getGroupInfoForLocale(locale);
    const outdatedArticles = await osuWiki.getOutdatedTranslationArticlesForLocale(locale);

    if (groupInfo?.outdated_translation) {
        outdatedArticles.push(groupInfo);
    }

    for (const article of outdatedArticles) {
        const { diff, diffHasRenames } = await osuWiki.enDiff(article);

        if (diff == null) {
            continue;
        }

        const outputPath = join(
            outputDirectory,
            osuWiki.diffLink(article.outdated_since, article.gitPath.replace(/\/[^\/]+(\.[a-z]+)$/i, '/en$1')) + '.html',
        );

        await mkdir(join(outputPath, '..'), { recursive: true });
        await writeFile(
            outputPath,
            render(
                'diff',
                {
                    articleBasename: basename(article.articlePath),
                    articlePath: article.articlePath,
                    commitId: article.outdated_since.slice(0, 7),
                    commitDate: article.outdatedSinceDate,
                    diff,
                    diffClass: diffHasRenames ? '' : 'hide-diff-headers',
                    locale: 'EN',
                    toOutputDirectory: relative(join(outputPath, '..'), outputDirectory),
                },
                true,
            ),
        );
    }
}

await writeFile(
    join(outputDirectory, 'diff-not-found.html'),
    render('diff-not-found', null, true),
);
await copyFile(
    join(fileURLToPath(import.meta.url), '../../templates/style.css'),
    join(outputDirectory, 'style.css'),
);
await copyFile(
    join(fileURLToPath(import.meta.url), '../../templates/style-diff.css'),
    join(outputDirectory, 'style-diff.css'),
);
