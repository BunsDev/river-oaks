// Fills a <dl> with [term, value, title?] rows. Values are written as text, so a
// model or material name can never be parsed as markup.
export function fillTermList(list, rows) {
  list.replaceChildren(...rows.flatMap(([term, value, title]) => {
    const dt = list.ownerDocument.createElement('dt'); dt.textContent = term;
    const dd = list.ownerDocument.createElement('dd'); dd.textContent = String(value);
    if (title !== undefined) dd.title = String(title);
    return [dt, dd];
  }));
}
