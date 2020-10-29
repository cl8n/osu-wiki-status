const { createHash } = require('crypto');
const { availableLocales, localeInfo } = require('./locale');
const memoize = require('./memoize');
const render = require('./render-template');

function md5(data) {
    return createHash('md5').update(data).digest('hex');
}

class PageBuilder {
    constructor(osuWiki, locale) {
        this.locale = locale;
        this.osuWiki = osuWiki;
    }

    _buildArticleTable(articles, tableTemplate = 'article-table', rowsBuilt = false) {
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

    _buildLocaleMenu = memoize(async () =>
        render('locale-menu', {
            items: (await Promise.all(
                availableLocales
                    .map(async (locale) => render('locale-menu-item', {
                        locale,
                        ...localeInfo[locale],
                        problemCount: await this.osuWiki.getTotalProblemCount(locale),
                    }))
            )).join(''),
        })
    );

    async _buildMissingSection() {
        return this._buildArticleTable(await this.osuWiki.getMissingArticlesForLocale(this.locale));
    }

    async _buildNeedsCleanupSection() {
        return this._buildArticleTable(await this.osuWiki.getNeedsCleanupArticlesForLocale(this.locale));
    }

    async _buildOutdatedSection() {
        const buildDiffLink = (article) => `https://github.com/ppy/osu-wiki/compare/${article.outdated_since}^...master#diff-${md5(`wiki/${article.articlePath}/en.md`)}`;

        const articleRows =
            (await this.osuWiki.getOutdatedArticlesForLocale(this.locale))
                .map((article) => {
                    if (article.outdated_since === null)
                        return render('outdated-row-no-diff', article);

                    article.diffLink = buildDiffLink(article);

                    return render('outdated-row', article);
                });

        return this._buildArticleTable(articleRows, 'outdated-table', true);
    }

    async _buildStubsSection() {
        return this._buildArticleTable(await this.osuWiki.getStubArticles());
    }

    async build() {
        return render(this.locale === 'en' ? 'page-en' : 'page', {
            flag: localeInfo[this.locale].flag,
            lastUpdate: new Date().toUTCString(),
            locale: this.locale.toUpperCase(),
            localeMenu: await this._buildLocaleMenu(),
            missingSection: this.locale === 'en' ? undefined : await this._buildMissingSection(),
            needsCleanupSection: await this._buildNeedsCleanupSection(),
            outdatedSection: await this._buildOutdatedSection(),
            stubsSection: this.locale === 'en' ? await this._buildStubsSection() : undefined,
        }, true);
    }
}

module.exports = (osuWiki, locale) => new PageBuilder(osuWiki, locale).build();
