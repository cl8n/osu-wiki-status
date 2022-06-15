const { availableLocales, localeInfo } = require('./locale');
const memoize = require('./memoize');
const render = require('./render-template');

class PageBuilder {
    #locale;
    #osuWiki;

    constructor(osuWiki, locale) {
        this.#locale = locale;
        this.#osuWiki = osuWiki;
    }

    get #translation() {
        return this.#locale !== 'en';
    }

    #buildArticleTable(articles, tableTemplate = 'article-table', rowsBuilt = false) {
        if (articles.length === 0)
            return render('empty-section');

        return render(tableTemplate, {
            rows: rowsBuilt
                ? articles.join('')
                : articles
                    .map((article) => render('article-row', article))
                    .join(''),
        });
    }

    #buildLocaleMenu = memoize(async () => {
        const items = [];

        for (const locale of availableLocales) {
            const problemCount = await this.#osuWiki.getTotalProblemCount(locale);

            items.push(render('locale-menu-item', {
                color: this.#problemCountColor(problemCount),
                locale,
                ...localeInfo[locale],
                problemCount,
            }));
        }

        return render('locale-menu', {
            items: items.join(''),
        });
    });

    #problemCountColor(count) {
        // Red at 550, yellow at 275, green at 0
        const max = 550;
        const rangeSize = 325;
        const red = Math.max(0, Math.min(1, count / rangeSize));
        const green = 1 - Math.max(0, Math.min(1, (count - max + rangeSize) / rangeSize));

        return (
            '#' +
            Math.round(red * 255).toString(16).padStart(2, '0') +
            Math.round(green * 255).toString(16).padStart(2, '0') +
            '00'
        );
    }

    //#region Section builders
    async #buildEnOutdatedMissingSection() {
        return this.#translation && this.#buildArticleTable(
            (await this.#osuWiki.getMissingArticlesForLocale(this.#locale))
                .filter((article) => article.outdated && !article.stub),
        );
    }

    async #buildEnOutdatedMissingStubsSection() {
        return this.#translation && this.#buildArticleTable(
            (await this.#osuWiki.getMissingArticlesForLocale(this.#locale))
                .filter((article) => article.outdated && article.stub),
        );
    }

    async #buildEnOutdatedOutdatedSection() {
        if (!this.#translation) {
            return null;
        }

        const articles =
            (await this.#osuWiki.getOutdatedTranslationArticlesForLocale(this.#locale))
                .filter((article) => article.outdated);

        return this.#buildArticleTable(
            articles.map((article) => {
                if (article.outdated_since == null) {
                    return render('outdated-row-no-diff', article);
                }

                article.diffLink = this.#osuWiki.enDiffLink(article);
                return render('outdated-row', article);
            }),
            'outdated-table',
            true,
        );
    }

    async #buildMissingSection() {
        return this.#translation && this.#buildArticleTable(
            (await this.#osuWiki.getMissingArticlesForLocale(this.#locale))
                .filter((article) => !article.outdated && !article.stub),
        );
    }

    async #buildMissingMetaSection() {
        return this.#translation && this.#buildArticleTable(
            (await this.#osuWiki.getGroupInfoForLocale(this.#locale)) == null
                ? [await this.#osuWiki.getGroupInfoForLocale('en')]
                : []
        );
    }

    async #buildMissingStubsSection() {
        return this.#translation && this.#buildArticleTable(
            (await this.#osuWiki.getMissingArticlesForLocale(this.#locale))
                .filter((article) => !article.outdated && article.stub),
        );
    }

    async #buildNeedsCleanupSection() {
        return this.#buildArticleTable(
            await this.#osuWiki.getNeedsCleanupArticlesForLocale(this.#locale),
        );
    }

    async #buildNoNativeReviewSection() {
        return this.#translation && this.#buildArticleTable(
            await this.#osuWiki.getNoNativeReviewArticlesForLocale(this.#locale),
        );
    }

    async #buildOutdatedSection() {
        const articles = this.#translation
            ? (await this.#osuWiki.getOutdatedTranslationArticlesForLocale(this.#locale))
                .filter((article) => !article.outdated)
            : await this.#osuWiki.getOutdatedArticlesForEn();

        return this.#buildArticleTable(
            articles.map((article) => {
                if (article.outdated_since == null) {
                    return render('outdated-row-no-diff', article);
                }

                article.diffLink = this.#osuWiki.enDiffLink(article);
                return render('outdated-row', article);
            }),
            'outdated-table',
            true,
        );
    }

    async #buildOutdatedMetaSection() {
        if (!this.#translation) {
            return null;
        }

        const articles = [];
        const groupInfo = await this.#osuWiki.getGroupInfoForLocale(this.#locale);

        if (groupInfo?.outdated_translation) {
            articles.push(groupInfo);
        }

        return this.#buildArticleTable(
            articles.map((article) => {
                if (article.outdated_since == null) {
                    return render('outdated-row-no-diff', article);
                }

                article.diffLink = this.#osuWiki.enDiffLink(article);
                return render('outdated-row', article);
            }),
            'outdated-table',
            true,
        );
    }

    async #buildStubsSection() {
        return !this.#translation && this.#buildArticleTable(
            await this.#osuWiki.getStubArticlesForEn(),
        );
    }
    //#endregion

    async build() {
        return render(this.#translation ? 'page' : 'page-en', {
            flag: localeInfo[this.#locale].flag,
            lastUpdate: new Date().toUTCString(),
            locale: this.#locale.toUpperCase(),
            localeMenu: await this.#buildLocaleMenu(),

            enOutdatedMissingSection: await this.#buildEnOutdatedMissingSection(),
            enOutdatedMissingStubsSection: await this.#buildEnOutdatedMissingStubsSection(),
            enOutdatedOutdatedSection: await this.#buildEnOutdatedOutdatedSection(),
            missingMetaSection: await this.#buildMissingMetaSection(),
            missingSection: await this.#buildMissingSection(),
            missingStubsSection: await this.#buildMissingStubsSection(),
            needsCleanupSection: await this.#buildNeedsCleanupSection(),
            noNativeReviewSection: await this.#buildNoNativeReviewSection(),
            outdatedMetaSection: await this.#buildOutdatedMetaSection(),
            outdatedSection: await this.#buildOutdatedSection(),
            stubsSection: await this.#buildStubsSection(),
        }, true);
    }
}

module.exports = (osuWiki, locale) => new PageBuilder(osuWiki, locale).build();
