import { load as loadYaml } from 'js-yaml';
import { execFile } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import memoize from './memoize.js';

// TODO: worst performing algorithms ever cuz lazy
export default class OsuWiki {
    #topDirectory;
    #wikiDirectory;

    constructor(osuWikiDirectory) {
        this.#topDirectory = osuWikiDirectory;
        this.#wikiDirectory = join(osuWikiDirectory, 'wiki');
    }

    #git(args) {
        return new Promise((resolve, reject) => {
            const gitProcess = execFile('git', args, { cwd: this.#topDirectory }, (error, stdout, stderr) => {
                if (error)
                    return reject(error);

                if (stderr.trim() !== '')
                    return reject(stderr.trim());

                resolve(stdout.trim());
            });

            gitProcess.on('error', reject);
        });
    }

    #getArticleInfo = memoize(async () => {
        const getFilenames = async (path) => {
            let files = [];
            const stats = await stat(path);

            if (stats.isFile() && /\/[a-z-]{2,5}\.md$/.test(path))
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
                const filenameMatch = filename.match(/\/wiki\/(.+?)\/([a-z-]{2,5})\.md$/);
                const info = {
                    articlePath: filenameMatch[1],
                    gitPath: relative(this.#topDirectory, filename),
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

    async enDiff(article) {
        if (article.locale === 'en' || article.outdated_since == null) {
            return {};
        }

        const pathsString = await this.#git([
            'log',
            '--follow',
            '--name-only',
            '--pretty=',
            `${article.outdated_since}^..master`,
            '--',
            article.gitPath.replace(/\/[^\/]+(\.[a-z]+)$/i, '/en$1'),
        ]);
        const paths = new Set(pathsString.split(/\r\n|\r|\n/));

        return {
            diff: await this.#git([
                'diff',
                '--find-renames=1%',
                '--minimal',
                '--no-color',
                `${article.outdated_since}^...master`,
                '--',
                ...paths,
            ]),
            diffHasRenames: paths.size > 1,
        };
    }

    diffLink(commitSha, path) {
        return `diff/${commitSha}/${path}`;
    }

    getGroupInfoForLocale = memoize(async (locale) => {
        const path = join(this.#topDirectory, `meta/group-info/${locale}.yaml`);
        const content = await readFile(path, 'utf8').catch(() => null);

        if (content == null) {
            return null;
        }

        const filenameMatch = path.match(/\/meta\/(.+?)\/([a-z-]{2,5})\.yaml$/);
        const groupInfo = {
            articlePath: filenameMatch[1],
            gitPath: relative(this.#topDirectory, path),
            lines: (content.match(/\n/g) || []).length,
            locale: filenameMatch[2],
            needs_cleanup: false,
            outdated_since: null,
            outdated_translation: false,
        };
        Object.assign(groupInfo, loadYaml(content));

        if (groupInfo.outdated_translation) {
            if (groupInfo.outdated_since != null)
                groupInfo.outdatedSinceDate = await this.#git([
                    'log',
                    '-1',
                    '--pretty=%cs',
                    groupInfo.outdated_since,
                ]);
            else
                groupInfo.outdatedSinceDate = await this.#git([
                    'log',
                    '-1',
                    '--pickaxe-regex',
                    '--pretty=%cs',
                    '-S^outdated(_translation)?: true',
                    '--',
                    groupInfo.gitPath,
                ]);
        }

        return groupInfo;
    });

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
            // Translations are unnecessary for these
            !/(?:^|\/)legal\/sctl$/i.test(enArticle.articlePath) &&
            !/(?:^|\/)news_styling_criteria$/i.test(enArticle.articlePath) &&
            // Translations are unnecessary for staff log and its sub-articles
            !/(?:^|\/)staff_log(?:$|\/)/i.test(enArticle.articlePath) &&
            // Translations are unnecessary for sub-articles of contests and tournaments, with some exceptions
            !/(?:^|\/)contests\//i.test(enArticle.articlePath) &&
            (!/(?:^|\/)tournaments\//i.test(enArticle.articlePath) ||
                /(?:^|\/)tournaments\/(?:badge-weighted_seeding|countries_that_participated_in_osu!_tournaments|official_support)(?:$|\/)/i.test(enArticle.articlePath)
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
            .filter((article) => (article.no_native_review || article.no_native_review_since) && article.locale === locale);
    });

    getOutdatedArticlesForEn = memoize(async () => {
        const articles = (await this.#getArticleInfo())
            .filter((article) => article.outdated && article.locale === 'en');

        return articles;
    });

    getOutdatedTranslationArticlesForLocale = memoize(async (locale) => {
        if (locale === 'en')
            return [];

        const articles = (await this.#getArticleInfo())
            .filter((article) => article.outdated_translation && article.locale === locale);

        for (const article of articles)
            if (article.outdated_since != null)
                article.outdatedSinceDate = await this.#git([
                    'log',
                    '-1',
                    '--pretty=%cs',
                    article.outdated_since,
                ]);
            else
                article.outdatedSinceDate = await this.#git([
                    'log',
                    '-1',
                    '--pickaxe-regex',
                    '--pretty=%cs',
                    '-S^outdated(_translation)?: true',
                    '--',
                    article.gitPath,
                ]);

        articles.sort((a, b) => new Date(b.outdatedSinceDate) - new Date(a.outdatedSinceDate));

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
        else if ((await this.getGroupInfoForLocale(locale))?.outdated_translation ?? true) {
            articles.push(null);
        }

        return articles.length;
    });
}
