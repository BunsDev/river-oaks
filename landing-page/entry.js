// Preserve shared links made before the landing page had its own address.
const params = new URLSearchParams(location.search);
if (['play', 'world', 'place', 'at'].some(key => params.has(key))) {
  location.replace(`/play${location.search}${location.hash}`);
}
