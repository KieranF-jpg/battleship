// Browser playthrough: node tests/e2e.mjs [url]
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://localhost:8080/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) process.exitCode = 1; };
const cell = (board, r, c) => page.locator(`#${board}-board .cell[data-row="${r}"][data-col="${c}"]`);

await page.goto(url);
check(await page.locator('#start-btn').isDisabled(), 'start disabled before placement');

// Manual placement: Carrier horizontal at A1, rotate, Battleship vertical at A3.
await cell('player', 0, 0).click();
check(await page.locator('#player-board .cell.ship').count() === 5, 'carrier placed with 5 cells');
await page.keyboard.press('r');
check((await page.locator('#orientation-label').textContent()) === 'Vertical', 'R key rotates');
await cell('player', 2, 0).click();
check(await page.locator('#player-board .cell.ship').count() === 9, 'battleship placed vertically');
await cell('player', 8, 5).click();
check(await page.locator('#player-board .cell.ship').count() === 9, 'off-board vertical placement rejected');
await cell('player', 0, 0).click();
check(await page.locator('#player-board .cell.ship').count() === 4, 'clicking a placed ship picks it up');

await page.mouse.move(0, 0);
await cell('player', 5, 5).focus();
check(await page.locator('#player-board .cell.preview-ok').count() === 5, 'keyboard focus shows placement preview');

await page.click('#random-btn');
check(await page.locator('#player-board .cell.ship').count() === 17, 'randomize places all 17 ship cells');
await page.selectOption('#difficulty', 'easy');
await page.click('#start-btn');
check(await page.locator('#setup').isHidden(), 'setup hidden after start');

// Rapid double-click should only fire once.
await cell('enemy', 0, 0).dblclick();
await page.waitForTimeout(100);
const shotsAfterDbl = await page.locator('#enemy-board .cell.hit, #enemy-board .cell.miss').count();
check(shotsAfterDbl === 1, `double-click fires once (got ${shotsAfterDbl})`);
await page.waitForFunction(() => document.querySelectorAll('#player-board .cell.hit, #player-board .cell.miss').length === 1);
check(true, 'AI fired back');

// Clicking during the AI's turn should do nothing.
await cell('enemy', 0, 1).click();
await cell('enemy', 0, 2).click({ force: true, timeout: 500 }).catch(() => {});
await page.waitForTimeout(50);
const midTurn = await page.locator('#enemy-board .cell.hit, #enemy-board .cell.miss').count();
check(midTurn === 2, `no extra shot during AI turn (got ${midTurn})`);

// Play out the game by firing at every cell in order.
for (let r = 0; r < 10; r++) {
  for (let c = 0; c < 10; c++) {
    if (await page.locator('#game-over').evaluate((d) => d.open)) break;
    const el = cell('enemy', r, c);
    await page.waitForFunction(() => {
      const d = document.getElementById('game-over');
      return d.open || !document.querySelector('#enemy-board').classList.contains('waiting');
    });
    if (await el.isEnabled()) await el.click();
  }
}
await page.waitForFunction(() => document.getElementById('game-over').open, null, { timeout: 15000 });
check(true, `game over: ${await page.locator('#result-title').textContent()}`);
await page.screenshot({ path: 'test-results/game-over.png' });

// Escape closes the dialog; the player must still be able to start a new game.
await page.keyboard.press('Escape');
await page.waitForTimeout(100);
const canRestart = await page.locator('#setup').isVisible() || await page.locator('#game-over').evaluate((d) => d.open) ||
  await page.locator('#new-game-btn').isVisible().catch(() => false);
check(canRestart, 'player can still start a new game after dismissing the dialog with Escape');

await page.goto(url);
await page.click('#random-btn');
await page.click('#start-btn');
await cell('enemy', 5, 5).click();
await page.waitForTimeout(800);
await page.locator('#game-over').evaluate((d) => d.open || d.showModal());
await page.evaluate(() => document.getElementById('play-again-btn').click());
await page.waitForTimeout(1000);
check(await page.locator('#player-board .cell.hit, #player-board .cell.miss').count() === 0, 'play again resets boards and no stray AI shot');
check(await page.locator('#setup').isVisible(), 'play again returns to setup');

check(errors.length === 0, `no console errors ${errors.join(' | ')}`);
await browser.close();
