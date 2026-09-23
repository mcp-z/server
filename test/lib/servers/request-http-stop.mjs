const [stopUrl] = process.argv.slice(2);
if (!stopUrl) throw new Error('Expected the test HTTP shutdown URL as the first argument');

const response = await fetch(stopUrl, {
  method: 'POST',
  headers: { Connection: 'close' },
  signal: AbortSignal.timeout(4000),
});
if (!response.ok) throw new Error(`Test HTTP shutdown returned ${response.status}`);
await response.arrayBuffer();
