#!/bin/sh

git pull -q

LOCALES='be bg cs da de el en es fi fr hu id it ja ko nl no pl pt pt-br ro ru sk sv th tr vi zh zh-tw'
MARKER='outdated: true'

for LOCALE in $LOCALES
do
    WRITE=$(printf 'Locale %s\\nLast updated %s\\n' $LOCALE "$(date -R)")
    WRITE="$WRITE"'============================================\n\n'
    WRITE="$WRITE"'Outdated files\n--------------\n\n'

    find wiki -name $LOCALE.md -print0 | sort -z | xargs -0 grep -Fl "$MARKER" > .write-temp
    while read FILE
    do
        if head "$FILE" | grep -Fq "$MARKER"
        then
            CHANGE_DATE=$(git log -1 --pretty=%cD -S"$MARKER" "$FILE")
            WRITE="$WRITE"$(printf '    %-60s(outdated %s)\\n' $(dirname "$FILE" | tail -c +6) "$CHANGE_DATE")
        fi
    done < .write-temp

    if test $LOCALE != 'en'
    then
        WRITE="$WRITE"'\nMissing translations\n--------------------\n\n'

        find wiki -name en.md -execdir test ! -f $LOCALE.md ';' -print | sort > .write-temp
        while read FILE
        do
            WRITE="$WRITE"$(printf '    %-60s(%d lines)\\n' $(dirname "$FILE" | tail -c +6) $(wc -l < "$FILE"))
        done < .write-temp
    fi

    rm .write-temp
    printf "$WRITE" > "$1"/$LOCALE.txt
done
