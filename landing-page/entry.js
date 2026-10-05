// Preserve shared links made before the landing page had its own address.
const params = new URLSearchParams(location.search);
if (['play', 'world', 'place', 'at'].some(key => params.has(key))) {
  location.replace(`/play${location.search}${location.hash}`);
}

const dialog = document.querySelector('#detail-dialog');
const content = document.querySelector('#detail-content');

function openDetails(name) {
  const template = document.getElementById(`panel-${name}`);
  if (!(template instanceof HTMLTemplateElement)) return false;
  content.replaceChildren(template.content.cloneNode(true));
  if (!dialog.open) dialog.showModal();
  return true;
}

document.addEventListener('click', event => {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target.closest('a[href^="#"]');
  if (link && openDetails(link.getAttribute('href').slice(1))) event.preventDefault();
});

dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const box = dialog.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
});

openDetails(location.hash.slice(1));
window.addEventListener('hashchange', () => {
  if (!openDetails(location.hash.slice(1)) && dialog.open) dialog.close();
});
