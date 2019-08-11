#!/bin/sh

git pull

LOCALES='be bg cs da de el en es fi fr hu id it ja ko nl no pl pt pt-br ro ru sk sv th tr vi zh zh-tw'
MARKER='outdated: true'

for LOCALE in $LOCALES
do
    OUT="$1"/$LOCALE.txt

    printf 'Outdated files for locale %s\nLast updated %s\n--------------------------------------------\n\n' \
        $LOCALE "$(date -R)" > "$OUT"

    find -name $LOCALE.md -exec grep -Fl "$MARKER" {} + | \
    while read -r FILE
    do
        if head "$FILE" | grep -Fq "$MARKER"
        then
            CHANGE_DATE=$(git log -1 --pretty=%cD -S"$MARKER" "$FILE")
            printf '%s\nOutdated %s\n\n' "$FILE" "$CHANGE_DATE" >> "$OUT"
        fi
    done
done
