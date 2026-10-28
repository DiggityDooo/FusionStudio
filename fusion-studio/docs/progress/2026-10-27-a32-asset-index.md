# A32 asset library indexing and search (2026-10-27)

Kernel: `src/asset-index.js`. Tests:
`tests/asset-index.test.mjs` (4/4).

In-memory inverted index over asset records (id, name, type,
tags, metadata) with a deterministic ranking search: name
tokenization splits words, camelCase, and letter/digit
boundaries; query terms AND together and score exact name token
3, exact tag 2, name/metadata substring 1; `tag:` / `-tag:` /
`type:` filters, `-term` exclusions, and quoted name phrases are
supported; ties break by name then id. `tagCounts` gives the
library's tag frequency table.

The tests caught a real tokenizer bug in the first draft: the
text was lowercased before camelCase splitting, so
`PineTreeTall` indexed as one token — splitting now happens on
the original case. Three hand-sorted expectations in the test
were also corrected against the kernel's (correct) alphabetical
output.

Limits: substring scoring is linear-scan over the indexed
records (fine at library scale, not a database), no fuzzy or
synonym matching, no persisted index format.
