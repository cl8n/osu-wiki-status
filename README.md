# osu-wiki status

Outputs web pages detailing articles in [osu-wiki](https://github.com/ppy/osu-wiki) that need improvement. This is most commonly consumed by translators to help coordinate their updating of the wiki.

## Usage

```
./build-pages [--update-only] <osu-wiki directory> <output directory>
```

The `--update-only` option automatically merges changes from upstream osu-wiki prior to running, or skips building pages if there are no new changes. It should be run on a schedule.
