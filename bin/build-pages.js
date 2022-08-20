import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import buildPage from '../src/build-page.js';
import { availableLocales, localeInfo } from '../src/locale.js';
import OsuWiki from '../src/OsuWiki.js';
import printDiff from '../src/print-diff.js';

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
        const filename = osuWiki.enDiffLink(article) + '.html';

        if (diff != null)
            printDiff(diff, join(outputDirectory, filename));
    }
}

await copyFile(
    join(fileURLToPath(import.meta.url), '../../templates/style.css'),
    join(outputDirectory, 'style.css'),
);
