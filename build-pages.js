const { copyFile, mkdir, writeFile } = require('fs').promises;
const { join } = require('path');
const buildPage = require('./build-page');
const { availableLocales, localeInfo } = require('./locale');
const OsuWiki = require('./OsuWiki');
const printDiff = require('./print-diff');

if (process.argv.length !== 4) {
    throw 'Invalid arguments';
}

const osuWiki = new OsuWiki(process.argv[2]);
const outputDirectory = process.argv[3];

(async () => {
    await mkdir(join(outputDirectory, 'flags'), { recursive: true });

    for (const locale of availableLocales) {
        const flag = localeInfo[locale].flag;

        await writeFile(
            join(outputDirectory, `${locale}.html`),
            await buildPage(osuWiki, locale),
        );
        await copyFile(
            join(__dirname, `templates/flags/${flag.toLowerCase()}.png`),
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
        join(__dirname, 'templates/style.css'),
        join(outputDirectory, 'style.css'),
    );
})();
