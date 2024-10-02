import locales from './locales.js';
import memoize from './memoize.js';
import render from './render-template.js';

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

    #buildArticleSection(title, articles, tableTemplate = 'article-table', rowsBuilt = false) {
        if (articles.length === 0)
            return null;

        return render('section', {
            title,
            content: render(tableTemplate, {
                rows: rowsBuilt
                    ? articles.join('')
                    : articles
                        .map((article) => {
                            article.prCell = article.prs.map((pr) => render('pr-cell', { pr })).join('');

                            return render('article-row', article);
                        })
                        .join(''),
            }),
        });
    }

	#buildLocaleMenu = memoize(async () => {
		const itemProperties = [];

		for (const [locale, properties] of Object.entries(locales)) {
			itemProperties.push({
				...properties,
				class: await this.#osuWiki.getArticleCount(locale) < 10
					? 'locale-menu__item--hidden js-locale-hidden'
					: '',
				locale,
				problemCount: await this.#osuWiki.getTotalProblemCount(locale),
			});
		}

		return render('locale-menu', {
			items: itemProperties
				.sort((a, b) => a.class.length - b.class.length) // Sort hidden last
				.sort((a, b) => +(b.locale === 'en') - +(a.locale === 'en')) // Sort EN first
				.map((properties) => render('locale-menu-item', properties))
				.join(''),
		});
	});

    //#region Section builders
    async #buildEnOutdatedMissingSection() {
        return this.#translation && this.#buildArticleSection(
            'Missing articles (outdated in EN)',
            (await this.#osuWiki.getMissingArticlesForLocale(this.#locale))
                .filter((article) => article.outdated && !article.stub),
        );
    }

    async #buildEnOutdatedMissingStubsSection() {
        return this.#translation && this.#buildArticleSection(
            'Missing stubs (outdated in EN)',
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

        return this.#buildArticleSection(
            'Outdated translations (outdated in EN)',
            articles.map((article) => {
                article.prCell = article.prs.map((pr) => render('pr-cell', { pr })).join('');

                if (article.outdated_since == null) {
                    return render('outdated-row-no-diff', article);
                }

                article.diffLink = this.#osuWiki.diffLink(article.outdated_since, article.gitPath.replace(/\/[^\/]+(\.[a-z]+)$/i, '/en$1'));
                return render('outdated-row', article);
            }),
            'outdated-table',
            true,
        );
    }

    async #buildMissingSection() {
        return this.#translation && this.#buildArticleSection(
            'Missing articles',
            (await this.#osuWiki.getMissingArticlesForLocale(this.#locale))
                .filter((article) => !article.outdated && !article.stub),
        );
    }

    async #buildMissingMetaSection() {
        return this.#translation && this.#buildArticleSection(
            'Missing meta files',
            (await this.#osuWiki.getGroupInfoForLocale(this.#locale)) == null
                ? [{
                    ...await this.#osuWiki.getGroupInfoForLocale('en'),
                    prs: this.#osuWiki.gitPathToPrsMap[`meta/group-info/${this.#locale}.yaml`] ?? [],
                }]
                : []
        );
    }

    async #buildMissingStubsSection() {
        return this.#translation && this.#buildArticleSection(
            'Missing stubs',
            (await this.#osuWiki.getMissingArticlesForLocale(this.#locale))
                .filter((article) => !article.outdated && article.stub),
        );
    }

    async #buildNeedsCleanupSection() {
        return this.#buildArticleSection(
            'Needs cleanup',
            await this.#osuWiki.getNeedsCleanupArticlesForLocale(this.#locale),
        );
    }

    async #buildNoNativeReviewSection() {
        return this.#translation && this.#buildArticleSection(
            'No native review',
            await this.#osuWiki.getNoNativeReviewArticlesForLocale(this.#locale),
        );
    }

    async #buildOutdatedSection() {
        const articles = this.#translation
            ? (await this.#osuWiki.getOutdatedTranslationArticlesForLocale(this.#locale))
                .filter((article) => !article.outdated)
            : await this.#osuWiki.getOutdatedArticlesForEn();

        return this.#buildArticleSection(
            this.#translation ? 'Outdated translations' : 'Outdated',
            articles.map((article) => {
                article.prCell = article.prs.map((pr) => render('pr-cell', { pr })).join('');

                if (!this.#translation) {
                    return render('article-row', article);
                }

                if (article.outdated_since == null) {
                    return render('outdated-row-no-diff', article);
                }

                article.diffLink = this.#osuWiki.diffLink(article.outdated_since, article.gitPath.replace(/\/[^\/]+(\.[a-z]+)$/i, '/en$1'));
                return render('outdated-row', article);
            }),
            this.#translation ? 'outdated-table' : 'article-table',
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

        return this.#buildArticleSection(
            'Outdated translations of meta files',
            articles.map((article) => {
                article.prCell = article.prs.map((pr) => render('pr-cell', { pr })).join('');

                if (article.outdated_since == null) {
                    return render('outdated-row-no-diff', article);
                }

                article.diffLink = this.#osuWiki.diffLink(article.outdated_since, article.gitPath.replace(/\/[^\/]+(\.[a-z]+)$/i, '/en$1'));
                return render('outdated-row', article);
            }),
            'outdated-table',
            true,
        );
    }

    async #buildStubsSection() {
        return !this.#translation && this.#buildArticleSection(
            'Stubs',
            await this.#osuWiki.getStubArticlesForEn(),
        );
    }
    //#endregion

    async build() {
        const sections = [
            await this.#buildOutdatedMetaSection(),
            await this.#buildMissingMetaSection(),
            await this.#buildOutdatedSection(),
            await this.#buildMissingSection(),
            await this.#buildMissingStubsSection(),
            await this.#buildNeedsCleanupSection(),
            await this.#buildNoNativeReviewSection(),
            await this.#buildEnOutdatedOutdatedSection(),
            await this.#buildEnOutdatedMissingSection(),
            await this.#buildEnOutdatedMissingStubsSection(),
            await this.#buildStubsSection(),
        ].filter(Boolean);

        return render('page', {
            flag: locales[this.#locale].flag,
            lastUpdate: new Date().toUTCString(),
            locale: this.#locale.toUpperCase(),
            localeMenu: await this.#buildLocaleMenu(),
            sections: sections.length === 0
                ? 'No issues remaining. Nice work :)'
                : sections.join(''),
        }, true);
    }
}

export default function buildPage(osuWiki, locale) {
    return new PageBuilder(osuWiki, locale).build();
}
