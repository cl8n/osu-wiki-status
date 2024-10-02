#!/usr/bin/env node

import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { get } from 'node:https';
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

const prs = [];

for (let page = 1;; page++) {
    const prsOnPage = await github(`/repos/ppy/osu-wiki/pulls?base=master&per_page=100&page=${page}`);

    prs.push(...prsOnPage);

    if (prsOnPage.length < 100) {
        break;
    }
}

for (const pr of prs) {
    const files = await github(`/repos/ppy/osu-wiki/pulls/${pr.number}/files?per_page=100`);

    // Too many files means it's probably a mass cleanup PR that isn't really relevant to this website
    if (files.length >= 100) {
        continue;
    }

    for (const file of files) {
        osuWiki.gitPathToPrsMap[file.filename] ??= [];
        osuWiki.gitPathToPrsMap[file.filename].push(pr.number);
    }
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

function github(uri) {
    return new Promise((resolve, reject) => {
        let rawBody = '';

        get(`https://api.github.com${uri}`, {
            headers: {
                'User-Agent': 'osu-wiki-status',
                'X-GitHub-Api-Version': '2022-11-28',
            },
        }, (response) => {
            if (response.statusCode !== 200) {
                reject('Error from GitHub');
            }

            response.on('data', (chunk) => rawBody += chunk);
            response.on('end', () => resolve(JSON.parse(rawBody)));
            response.on('error', reject);
        })
            .on('error', reject);
    });
}
