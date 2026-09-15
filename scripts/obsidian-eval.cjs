// Evaluate a JS expression inside the running Obsidian renderer (started with
// --remote-debugging-port=9333). Usage: node obsidian-eval.cjs "<expression>" [screenshot.png]
const { chromium } = require(process.env.PW_PATH || 'playwright');
(async () => {
	const b = await chromium.connectOverCDP('http://127.0.0.1:9333');
	const page = b.contexts()[0].pages()[0];
	const expr = process.argv[2];
	if (expr) {
		const out = await page.evaluate(async (e) => {
			try {
				const v = await (0, eval)(e);
				return JSON.stringify(v, null, 1) ?? String(v);
			} catch (err) {
				return 'EVAL ERROR: ' + (err && err.stack ? err.stack : String(err));
			}
		}, expr);
		console.log(out);
	}
	if (process.argv[3]) await page.screenshot({ path: process.argv[3] });
	await b.close();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
