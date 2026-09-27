# Speech variants

These CC0 MakeHuman variants add Visemes 02 by Mika Suominen and fitted
`teeth_base` and `tongue01` system assets. Each preserves the base character's
original binary payload and blink targets. See [the character build guide](../README.md#speech-candidates)
for generation and merge commands, and `sources.json` for checksums.

The browser loads a variant only when a timed voice line needs its profile.
Only its mouth targets and oral meshes attach to the existing character. The
existing textures, styling, animation bones and blink controls remain in use.
The temporary geometry is detached after speech. The cached variants are bounded
to the seven character profiles and are not instantiated across the whole crowd.
