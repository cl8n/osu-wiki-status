const { execFile } = require('child_process');
const { readdir, readFile, stat } = require('fs').promises;
const { safeLoad: loadYaml } = require('js-yaml');
const { join } = require('path');
const memoize = require('./memoize');

// TODO: worst performing algorithms ever cuz lazy
module.exports = class {
    constructor(osuWikiDirectory) {
        this.topDirectory = osuWikiDirectory;
        this.wikiDirectory = join(osuWikiDirectory, 'wiki');
    }

    _git(args) {
        return new Promise((resolve, reject) => {
            execFile('git', args, { cwd: this.topDirectory }, (error, stdout, stderr) => {
                if (error)
                    return reject(error);

                if (stderr.trim() !== '')
                    return reject(stderr);

                resolve(stdout);
            });
        });
    }

    _getArticleInfo = memoize(async () => {
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
            (await getFilenames(this.wikiDirectory)).map(async (filename) => {
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

        return await this._git([
            'diff',
            `${article.outdated_since}^...master`,
            '--',
            `wiki/${article.articlePath}/en.md`,
        ]);
    }

    getMissingArticlesForLocale = memoize(async (locale) => {
        if (locale === 'en')
            return [];

        const { enArticles, translatedArticlePaths } =
            (await this._getArticleInfo()).reduce((grouped, article) => {
                if (article.locale === 'en')
                    grouped.enArticles.push(article);
                else if (article.locale === locale)
                    grouped.translatedArticlePaths.push(article.articlePath);

                return grouped;
            }, { enArticles: [], translatedArticlePaths: [] });

        return enArticles.filter((enArticle) =>
            !translatedArticlePaths.includes(enArticle.articlePath)
        );
    });

    getNeedsCleanupArticlesForLocale = memoize(async (locale) => {
        return (await this._getArticleInfo())
            .filter((article) => article.needs_cleanup && article.locale === locale);
    });

    getOutdatedArticlesForLocale = memoize(async (locale) => {
        const articles = (await this._getArticleInfo())
            .filter((article) => article.outdated && article.locale === locale);

        for (const article of articles)
            article.outdatedSinceDate = await this._git([
                'log',
                '-1',
                '--pretty=%cs',
                '-Soutdated: true',
                `wiki/${article.articlePath}/${article.locale}.md`,
            ]);

        return articles;
    });

    getStubArticles = memoize(async () => {
        return (await this._getArticleInfo())
            .filter((article) => article.stub && article.locale === 'en');
    });

    getTotalProblemCount = memoize(async (locale) => {
        let articles = [
            ...await this.getMissingArticlesForLocale(locale),
            ...await this.getNeedsCleanupArticlesForLocale(locale),
            ...await this.getOutdatedArticlesForLocale(locale),
        ];

        if (locale === 'en')
            articles = [...articles, ...await this.getStubArticles()];
        else
            articles = articles.filter((article) => /(?:contests|staff_log|tournaments)\//i.test(article.articlePath));

        return articles.length;
    });

    pull() {
        return this._git(['pull', '-q']);
    }
}
