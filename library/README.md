# Starter library

Reusable motifs, mappings and palettes in the
[library format](../docs/format.md#library-files). They ship with the app
and appear under *Library…*.

| File | Contents |
|------|----------|
| `peeries.fairisle-library.json` | A plain spacer and 10 peerie bands of 1–7 rows. No float is longer than 4 stitches. |
| `oxo-stars.fairisle-library.json` | 5 OXO bands and 3 large stars. No float is longer than 7 stitches. |
| `neutral.fairisle-library.json` | A neutral 12-colour palette and basic mappings: two-colour, three-step gradient, symmetric five- and seven-row gradients. |

Everything here is dedicated to the public domain under
[CC0 1.0](LICENSE), so anyone can reuse it freely.

## Contributing

Pull requests with new motifs, mappings and palettes are welcome.

- Write files in the canonical form: open them in the app and save, or run
  them through the core's `serialize`.
- `web/src/model/model.test.ts` checks that every library file validates
  without issues and that every motif knits without float warnings; run
  `npm test` in `web/`.
- A mapping may only use colours defined in the same file.
- Shade cards for real yarn lines are welcome too, but each needs a check
  that publishing the shade names and colour approximations is acceptable to
  the yarn maker.
