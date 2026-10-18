async page => {
  // Capture the ordinary shipped presets with the same chair-use fixture as
  // studio-office-neutral and the occupied route regression.
  const { readFile } = await import('node:fs/promises');
  const { pathToFileURL } = await import('node:url');
  const origin = 'http://127.0.0.1:5173';
  const { createSpace } = await import(pathToFileURL(`${process.cwd()}/preview/src/studio/space-templates.js`).href);
  const source = (await readFile('preview/e2e/studio-office-stations.js', 'utf8')).replace(/http:\/\/127\.0\.0\.1:5173/g, origin);
  const captureStations = eval(`(${source})`);
  const occupiedChairs = createSpace('office').objects.filter(item => item.kind === 'chair').map(chair => {
    const yaw = chair.yaw * Math.PI / 180;
    return { id: chair.id, east: chair.east - Math.sin(yaw) * .4, north: chair.north + Math.cos(yaw) * .4, depth: Math.max(chair.depth, .75) };
  });
  const result = await captureStations(page, { occupiedChairs });
  return { ...result, scope: 'Shipped daylight, warm and evening presets with all nine chairs pulled back 0.4 m and deepened to at least 0.75 m. These are local chair-use clearance fixtures, not seating or multiplayer behavior.' };
}
