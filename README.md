# Goodreads → OBA Amsterdam

A Tampermonkey userscript that shows, on any Goodreads book page, whether the **OBA (Openbare Bibliotheek Amsterdam)** has that book in **English**.

Copies that are on loan or reserved still count. The question it answers is "does OBA own an English copy?", not "can I pick it up today?".

Code was written using Claude

## What you see

A small box under the *Want to Read* button on the book page:

- 🟢 **OBA has it in English — view / reserve**: links straight to the OBA catalogue page.
- 🔴 **Not at OBA in English**: also lists the languages OBA does have it in (e.g. Dutch) and links to an OBA search.

- Screenshot: https://imgur.com/a/zSv2DIy

## How it works

1. Reads the ISBN, title and author from the Goodreads page.
2. Searches the OBA catalogue (`zoeken.oba.nl`) by ISBN first.
3. If that edition isn't there in English, searches by title and author. This catches other English editions, such as UK vs US.
4. OBA groups all language editions of a book into one result, so the script also checks the "other languages" links on each result.
5. Counts only physical books. DVDs and audio CDs are ignored.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) for your browser.
2. **Chrome / Edge only:** go to `chrome://extensions`, click **Details** on Tampermonkey and turn on **Allow User Scripts**. On older versions, turn on **Developer mode** instead. Without this, the script silently does nothing.
3. Open the [raw script](https://github.com/thecorporatehippy/oba-on-goodreads/blob/main/goodreads-oba-availability.user.js). Tampermonkey will offer to install it.
4. Open any Goodreads book page. The first time, Tampermonkey asks permission to connect to `zoeken.oba.nl`: choose **Always allow domain**.

## Troubleshooting

- **No box at all:** the script isn't running. Check step 2 above, and check that the script is enabled in the Tampermonkey dashboard.
- **"OBA check failed":** OBA's site was unreachable, or the connection permission was denied.
- **Wrong "not found":** matching uses title and author surname. A book that OBA lists under a very different title may be missed. Use the *search OBA* link.

## Limitations

- OBA has no public API. The script reads OBA's public catalogue pages, so a redesign of their site may break it.
- English detection relies on OBA's language label (*Engels*).

