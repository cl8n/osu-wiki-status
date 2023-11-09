import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import buildPage from '../src/build-page.js';
import { availableLocales, localeInfo } from '../src/locale.js';
import OsuWiki from '../src/OsuWiki.js';
import render from '../src/render-template.js';

if (process.argv.length !== 4) {
    throw 'Invalid arguments';
}

const osuWiki = new OsuWiki(process.argv[2]);
const outputDirectory = process.argv[3];

await mkdir(join(outputDirectory, 'flags'), { recursive: true });

for (const locale of availableLocales) {
    const flag = localeInfo[locale].flag;

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
        const diff = await osuWiki.enDiff(article);

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
                    locale: 'EN',
                    toOutputDirectory: relative(join(outputPath, '..'), outputDirectory),
                },
                true,
            ),
        );
    }
}

await copyFile(
    join(fileURLToPath(import.meta.url), '../../templates/style.css'),
    join(outputDirectory, 'style.css'),
);
await copyFile(
    join(fileURLToPath(import.meta.url), '../../templates/style-diff.css'),
    join(outputDirectory, 'style-diff.css'),
);
