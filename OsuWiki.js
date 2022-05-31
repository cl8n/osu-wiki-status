const { execFile } = require('child_process');
const { readdir, readFile, stat } = require('fs').promises;
const { load: loadYaml } = require('js-yaml');
const { join } = require('path');
const memoize = require('./memoize');

function execGitRetry(cwd, args, retryWait) {
    return new Promise((resolve, reject) => {
        try {
            const gitProcess = execFile('git', args, { cwd }, (error, stdout, stderr) => {
                if (error)
                    return reject(error);

                if (stderr.trim() !== '')
                    return reject(stderr);

                resolve(stdout);
            });

            gitProcess.on('error', reject);
        } catch (error) {
            // ENOMEM gets thrown here... for some reason
            if (error.code !== 'ENOMEM')
                return reject(error);

            setTimeout(() => {
                execGitRetry(cwd, args, retryWait)
                    .then((value) => resolve(value))
                    .catch((reason) => reject(reason));
            }, retryWait);
        }
    });
}

// TODO: worst performing algorithms ever cuz lazy
module.exports = class {
    #topDirectory;
    #wikiDirectory;

    constructor(osuWikiDirectory) {
        this.#topDirectory = osuWikiDirectory;
        this.#wikiDirectory = join(osuWikiDirectory, 'wiki');
    }

    #git(args) {
        return execGitRetry(this.#topDirectory, args, 5000);
    }

    #getArticleInfo = memoize(async () => {
        const getFilenames = async (path) => {
            let files = [];
            const stats = await stat(path);

            if (stats.isFile() && /\/[a-z]{2}(?:-[a-z]{2})?\.md$/.test(path))
                files.push(path);
            else if (stats.isDirectory()) {
                const dirents = await readdir(path, { withFileTypes: true });

                files = files.concat(await Promise.all(dirents.map(dirent => getFilenames(join(path, dirent.name)))));
            }

            return files.flat().filter(file => file !== undefined);
        }

        return await Promise.all(
            (await getFilenames(this.#wikiDirectory)).map(async (filename) => {
                const content = await readFile(filename, 'utf8');
                const filenameMatch = filename.match(/\/wiki\/(.+?)\/([a-z]{2}(?:-[a-z]{2})?)\.md$/);
                const info = {
                    articlePath: filenameMatch[1],
                    filename,
                    lines: (content.match(/\n/g) || []).length,
                    locale: filenameMatch[2],
                    needs_cleanup: false,
                    outdated: false,
                    outdated_since: null,
                    outdated_translation: false,
                    stub: false,
                };

                const yamlMatch = content.match(/^---\n(.+?\n)---\n/s);
                if (yamlMatch !== null)
                    Object.assign(info, loadYaml(yamlMatch[1]));

                return info;
            })
        );
    });

    async enDiffForArticle(article) {
        if (article.locale === 'en' || article.outdated_since == null)
            return;

        return await this.#git([
            'diff',
            '--minimal',
            '--no-color',
            `${article.outdated_since}^...master`,
            '--',
            `wiki/${article.articlePath}/en.md`,
        ]);
    }

    enDiffLinkForArticle(article) {
        return `diff-${article.locale}-`
            + article.articlePath.replace(/[\/'"]+/g, '-');
    }

    getMissingArticlesForLocale = memoize(async (locale) => {
        if (locale === 'en')
            return [];

        const { enArticles, translatedArticlePaths } =
            (await this.#getArticleInfo()).reduce((grouped, article) => {
                if (article.locale === 'en')
                    grouped.enArticles.push(article);
                else if (article.locale === locale)
                    grouped.translatedArticlePaths.push(article.articlePath);

                return grouped;
            }, { enArticles: [], translatedArticlePaths: [] });

        return enArticles.filter((enArticle) =>
            !translatedArticlePaths.includes(enArticle.articlePath) &&
            !/(?:^|\/)staff_log(?:$|\/)/i.test(enArticle.articlePath) &&
            !/(?:^|\/)contests\//i.test(enArticle.articlePath) &&
            (!/(?:^|\/)tournaments\//i.test(enArticle.articlePath) ||
                /(?:^|\/)tournaments\/(?:countries_that_participated_in_osu!_tournaments|official_support)(?:$|\/)/i.test(enArticle.articlePath)
            )
        );
    });

    getNeedsCleanupArticlesForLocale = memoize(async (locale) => {
        return (await this.#getArticleInfo())
            .filter((article) => article.needs_cleanup && article.locale === locale);
    });

    getNoNativeReviewArticlesForLocale = memoize(async (locale) => {
        if (locale === 'en')
            return [];

        return (await this.#getArticleInfo())
            .filter((article) => article.no_native_review && article.locale === locale);
    });

    getOutdatedArticlesForEn = memoize(async () => {
        const articles = (await this.#getArticleInfo())
            .filter((article) => article.outdated && article.locale === 'en');

        for (const article of articles)
            article.outdatedSinceDate = await this.#git([
                'log',
                '-1',
                '--pretty=%cs',
                '-Soutdated: true',
                `wiki/${article.articlePath}/en.md`,
            ]);

        return articles;
    });

    getOutdatedTranslationArticlesForLocale = memoize(async (locale) => {
        if (locale === 'en')
            return [];

        const articles = (await this.#getArticleInfo())
            .filter((article) => article.outdated_translation && article.locale === locale);

        for (const article of articles)
            article.outdatedSinceDate = await this.#git([
                'log',
                '-1',
                '--pretty=%cs',
                '-Soutdated_translation: true',
                `wiki/${article.articlePath}/${article.locale}.md`,
            ]);

        return articles;
    });

    getStubArticlesForEn = memoize(async () => {
        return (await this.#getArticleInfo())
            .filter((article) => article.stub && article.locale === 'en');
    });

    getTotalProblemCount = memoize(async (locale) => {
        let articles = [
            ...await this.getMissingArticlesForLocale(locale),
            ...await this.getNeedsCleanupArticlesForLocale(locale),
            ...await this.getNoNativeReviewArticlesForLocale(locale),
            ...await this.getOutdatedTranslationArticlesForLocale(locale),
        ];

        if (locale === 'en')
            articles = [
                ...articles,
                ...await this.getOutdatedArticlesForEn(),
                ...await this.getStubArticlesForEn(),
            ];

        return articles.length;
    });

    pull() {
        return this.#git(['pull', '-q']);
    }
}
