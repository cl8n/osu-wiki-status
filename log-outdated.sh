#!/bin/sh

git pull

LOCALES='be bg cs da de el en es fi fr hu id it ja ko nl no pl pt pt-br ro ru sk sv th tr vi zh zh-tw'
MARKER='outdated: true'

for LOCALE in $LOCALES
do
    OUT="$1"/$LOCALE.txt
    TEMP="$1"/.temp-$LOCALE.txt

    printf 'Locale %s\nLast updated %s\n' $LOCALE "$(date -R)" > "$TEMP"
    printf '============================================\n\n' >> "$TEMP"
    printf 'Outdated files\n--------------\n\n' >> "$TEMP"

    find wiki -name $LOCALE.md -print0 | sort -z | xargs -0 grep -Fl "$MARKER" | \
    while read -r FILE
    do
        if head "$FILE" | grep -Fq "$MARKER"
        then
            CHANGE_DATE=$(git log -1 --pretty=%cD -S"$MARKER" "$FILE")
            printf '    %s\n    Outdated %s\n\n' "$FILE" "$CHANGE_DATE" >> "$TEMP"
        fi
    done

    if test $LOCALE != 'en'
    then
        printf 'Missing translations\n--------------------\n\n' >> "$TEMP"
        find wiki -name en.md -execdir test ! -f $LOCALE.md ';' -printf '    %h\n' | sort >> "$TEMP"
    fi

    mv -f "$TEMP" "$OUT"
done
