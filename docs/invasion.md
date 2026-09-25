# Alien invasion scenario

An optional scenario in the preview: saucers land at the edge of the district and
their crew walk toward the nearest neighbors to beam them aboard. Jevica, the only playable character, can fight back with magic using the card in the visit tools.

- **Begin invasion** spawns five saucers on free ground around the district edge
  (`invasion.js` `landingSites`). Each lands over about four seconds, then its
  crew member (the alien anatomy from `alien-species.js` on a shared rig) hunts
  the nearest outdoor neighbor at walking pace, steering around buildings with
  the walking environment.
- Within 1.7 m an alien holds its target under a beam for 5 s; the neighbor is
  then hidden, held out of the resident simulation and out of encounters until
  the scenario ends. Five abductions lose the district.
- A magical visitor within 20 m draws the crew off the neighbors: they close in
  and stand off at 4 m, menacing her, which is the moment to cast.
- **Cast (Q)** sends a bolt from the visitor toward the nearest alien within 14 m
  and in line of sight. A hit banishes the alien: it rises into its saucer and
  the saucer leaves. Banishing every alien wins.
- Whatever the outcome, `releaseResidents` returns everyone beamed aboard.

`preview/tests/invasion.test.js` covers the simulation; `preview/e2e/invasion.js`
plays the opening of a fight as Jevica in the real renderer.
