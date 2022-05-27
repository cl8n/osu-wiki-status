const { availableLocales, localeInfo } = require('./locale');
const memoize = require('./memoize');
const render = require('./render-template');

class PageBuilder {
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
        // Red at 400, yellow at 200, green at 0

        const max = 400;
        const rangeSize = 250;

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

                article.diffLink = this.#osuWiki.enDiffLinkForArticle(article);
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

                article.diffLink = this.#osuWiki.enDiffLinkForArticle(article);
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
            missingSection: await this.#buildMissingSection(),
            missingStubsSection: await this.#buildMissingStubsSection(),
            needsCleanupSection: await this.#buildNeedsCleanupSection(),
            noNativeReviewSection: await this.#buildNoNativeReviewSection(),
            outdatedSection: await this.#buildOutdatedSection(),
            stubsSection: await this.#buildStubsSection(),
        }, true);
    }
}

module.exports = (osuWiki, locale) => new PageBuilder(osuWiki, locale).build();
