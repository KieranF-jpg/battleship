// Browser playthrough: node tests/e2e.mjs [url]
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://localhost:8080/';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1200, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
const page = await context.newPage();
page.on('dialog', (d) => d.accept());
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
const firstGameWon = (await page.locator('#result-title').textContent()).includes('Victory');
const firstGameAdvice = (await page.locator('#result-extra li').last().textContent()) || '';
check(true, `game over: ${await page.locator('#result-title').textContent()}`);
await page.screenshot({ path: 'test-results/game-over.png' });

// Escape closes the dialog; the player must still be able to start a new game.
await page.keyboard.press('Escape');
await page.waitForTimeout(100);
const canRestart = await page.locator('#setup').isVisible() || await page.locator('#game-over').evaluate((d) => d.open) ||
  await page.locator('#new-game-btn').isVisible().catch(() => false);
check(canRestart, 'player can still start a new game after dismissing the dialog with Escape');

// Stats and achievements were recorded for the finished game.
await page.click('#stats-btn');
check((await page.locator('#stats-body .tile .value').first().textContent()) === '1', 'stats count the finished battle');
check(firstGameAdvice.startsWith('Tip: '), `result screen gives a tip (${firstGameAdvice})`);
// Every achievement needs a win, so a lost first game unlocks none.
const unlocked = await page.locator('#stats-body .badges li.unlocked').count();
check(firstGameWon ? unlocked >= 1 : unlocked === 0, `achievements match the first game's result (${unlocked} unlocked)`);
await page.click('#stats-close-btn');

// Replay the finished game with the AI radar.
await page.locator('#game-over').evaluate((d) => d.showModal());
await page.click('#replay-btn');
check(await page.locator('#replay-bar').isVisible(), 'replay controls appear');
await page.click('#replay-play');
const total = Number(await page.locator('#replay-range').getAttribute('max'));
check(total > 30, `replay covers every shot (${total})`);
await page.locator('#replay-range').fill('10');
check((await page.locator('#replay-label').textContent()) === `Shot 10 of ${total}`, 'scrubbing jumps to a shot');
check(await page.locator('#enemy-board .cell.hit, #enemy-board .cell.miss').count() === 5, 'board shows the state at that shot');
check(await page.locator('#enemy-board .cell.ship').count() === 17, 'replay reveals the enemy fleet');
check(await page.locator('#player-board .cell.heat').count() > 0, 'replay shows the AI radar heatmap');
await page.click('#replay-next');
check((await page.locator('#replay-label').textContent()) === `Shot 11 of ${total}`, 'next steps forward one shot');
await page.click('#theme-btn');
check((await page.locator('#log').textContent()).includes('Ye fired') &&
  (await page.locator('#replay-label').textContent()) === `Shot 11 of ${total}`, 'switching theme during replay retells the log and keeps the step');
await page.click('#theme-btn');
await page.click('#replay-exit');
check(await page.locator('#replay-bar').isHidden(), 'exit replay hides controls');
check(await page.locator('#enemy-board .cell.hit, #enemy-board .cell.miss').count() > 30, 'exiting replay restores the final board');

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

// Drag and drop placement.
const centre = async (loc) => { const b = await loc.boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
async function dragTo(from, to) {
  await page.mouse.move(...await centre(from));
  await page.mouse.down();
  await page.mouse.move(...await centre(to), { steps: 8 });
  await page.mouse.up();
}
await page.click('#clear-btn');
await dragTo(page.locator('#ship-picker button').first(), cell('player', 3, 2));
check(await cell('player', 3, 2).evaluate((e) => e.classList.contains('ship') && e.classList.contains('bow')) &&
  await page.locator('#player-board .cell.ship').count() === 5, 'drag a ship from the picker onto the board');
await dragTo(cell('player', 3, 4), cell('player', 6, 4));
check(await cell('player', 6, 2).evaluate((e) => e.classList.contains('bow')) &&
  !(await cell('player', 3, 2).evaluate((e) => e.classList.contains('ship'))), 'drag a placed ship to move it, keeping the grab point');
await dragTo(cell('player', 6, 4), cell('player', 6, 9));
check(await cell('player', 6, 2).evaluate((e) => e.classList.contains('bow')) &&
  await page.locator('#player-board .cell.ship').count() === 5, 'dropping off the board snaps the ship back');
await page.mouse.move(...await centre(cell('player', 6, 4)));
await page.mouse.down();
await page.mouse.move(...await centre(cell('player', 4, 4)), { steps: 8 });
await page.keyboard.press('r');
await page.mouse.up();
check(await cell('player', 2, 4).evaluate((e) => e.classList.contains('bow')) &&
  await cell('player', 6, 4).evaluate((e) => e.classList.contains('stern')), 'rotating mid-drag pivots around the grabbed cell');

// Saved game resumes after a reload, and the AI radar can be shown live.
await page.click('#random-btn');
await page.click('#start-btn');
await cell('enemy', 0, 0).click();
await page.waitForFunction(() => document.querySelectorAll('#player-board .cell.hit, #player-board .cell.miss').length === 1);
await cell('enemy', 9, 9).click();
await page.waitForFunction(() => document.querySelectorAll('#player-board .cell.hit, #player-board .cell.miss').length === 2);
await page.reload();
check(await page.locator('#setup').isHidden() &&
  await page.locator('#enemy-board .cell.hit, #enemy-board .cell.miss').count() === 2 &&
  await page.locator('#player-board .cell.hit, #player-board .cell.miss').count() === 2, 'unfinished battle resumes after reload');
check((await page.locator('#log').textContent()).includes('Resumed'), 'log notes the resumed battle');
await page.check('#radar-toggle');
check(await page.locator('#player-board .cell.heat').count() > 0, 'live AI radar shows a heatmap');

// Abandoning counts as a loss; then the daily challenge and its share text.
await page.click('#new-game-btn');
await page.click('#random-btn');
await page.click('#daily-btn');
check((await page.locator('#log').textContent()).includes('Daily challenge #'), 'daily challenge starts');
await cell('enemy', 4, 4).click();
await page.waitForTimeout(800);
await page.click('#new-game-btn');
check((await page.locator('#daily-btn').textContent()).includes('lost · Share result'), 'daily challenge is one attempt per day');
await page.click('#daily-btn');
await page.locator('.toast', { hasText: 'Result copied' }).waitFor();
check(await page.locator('#toasts').evaluate((e) => e.matches(':popover-open')), 'toasts render in the top layer above dialogs');
const shared = await page.evaluate(() => navigator.clipboard.readText());
check(shared.startsWith('⚓ Battleship Daily #') && shared.includes('Defeated after 1 shot ·'), 'share copies the daily result');
await page.click('#stats-btn');
check((await page.locator('#stats-body .tile .value').first().textContent()) === '3', 'abandoned battles count in stats');
await page.click('#stats-close-btn');

// Pirate theme: switchable, remembered, and renames the fleet without touching saves.
await page.click('#theme-btn');
check(await page.evaluate(() => document.documentElement.dataset.theme) === 'pirate' &&
  (await page.locator('h1').textContent()) === 'Pirate Battleship', 'pirate theme switches on');
check((await page.locator('#ship-picker').textContent()).includes('Galleon') &&
  (await page.locator('#start-btn').textContent()) === 'Set sail!', 'pirate theme renames ships and buttons');
await page.reload();
check(await page.evaluate(() => document.documentElement.dataset.theme) === 'pirate' &&
  (await page.locator('#theme-btn').getAttribute('aria-pressed')) === 'true', 'pirate theme persists across reloads');
await page.click('#random-btn');
await page.click('#start-btn');
await cell('enemy', 0, 0).click();
check((await page.locator('#log').textContent()).includes('Ye fired at A1'), 'pirate theme flavours the battle log');
check(await page.locator('.cannonball').count() >= 1, 'pirate shots fire a cannonball');
await page.locator('.boom').first().waitFor({ state: 'attached', timeout: 2000 }).catch(() => {});
check(await page.locator('.boom').count() >= 1, 'cannonball landing shows a comic boom');
check(await page.locator('#parrot').isVisible() && (await page.locator('.parrot-bubble').textContent()).length > 0, 'the parrot heckles each shot');
await page.waitForFunction(() => document.querySelectorAll('#player-board .cell.hit, #player-board .cell.miss').length === 1);
await page.click('#theme-btn');
check(await page.evaluate(() => document.documentElement.dataset.theme) === 'navy' &&
  (await page.locator('h1').textContent()) === 'Battleship', 'navy theme switches back');
const retold = await page.locator('#log').textContent();
check(retold.includes('You fired at A1') && !retold.includes('Ye fired') &&
  (await page.locator('#status-text').textContent()).includes('Your turn'), 'switching theme mid-battle retells the log and status');
await page.click('#new-game-btn');

// Mute is remembered.
await page.click('#sound-btn');
await page.reload();
check((await page.locator('#sound-btn').textContent()) === 'Sound off', 'mute setting persists across reloads');

// Tips & tricks guide.
await page.click('#tips-btn');
check(await page.locator('#tips-dialog').evaluate((d) => d.open) &&
  (await page.locator('#tips-dialog').textContent()).includes('checkerboard'), 'tips dialog opens with the guide');
check(await page.locator('#tips-parity i').count() === 100 && await page.locator('#tips-density i').count() === 100 &&
  await page.locator('#tips-parity i.on').count() === 50, 'tips draw the checkerboard and heatmap');
check(await page.locator('#tips-dialog').evaluate((d) => d.scrollTop === 0 && document.activeElement.id === 'tips-title'),
  'tips open at the top with focus on the title');
await page.click('#tips-close-btn');
check(!(await page.locator('#tips-dialog').evaluate((d) => d.open)), 'tips dialog closes');

// Pirate finale: the swinging pirate (win) or the kraken (loss), then the result dialog.
await page.click('#theme-btn');
check((await page.locator('#tips-title').textContent()).includes("Pirate's Code"), 'pirate theme renames the tips');
await page.click('#random-btn');
await page.click('#start-btn');
await cell('enemy', 9, 9).click();
await page.click('#theme-btn');
await page.waitForTimeout(700);
check(await page.locator('.cannonball, .boom').count() === 0, 'switching to navy mid-shot stops the pirate effects');
await page.click('#theme-btn');
let finale = false;
page.locator('.pirate-swing, .kraken').first().waitFor({ state: 'attached', timeout: 120000 }).then(() => { finale = true; }, () => {});
for (let r = 0; r < 10; r++) {
  for (let c = 0; c < 10; c++) {
    if (await page.locator('#game-over').evaluate((d) => d.open) || finale) break;
    await page.waitForFunction(() => document.querySelector('.pirate-swing, .kraken') || !document.querySelector('#enemy-board').classList.contains('waiting'));
    const el = cell('enemy', r, c);
    if (!finale && await el.isEnabled()) await el.click();
  }
}
await page.locator('.pirate-swing, .kraken').first().waitFor({ state: 'attached', timeout: 15000 }).catch(() => {});
check(finale || await page.locator('.pirate-swing, .kraken').count() === 1, 'pirate finale plays at the end of the battle');
check(!(await page.locator('#game-over').evaluate((d) => d.open)), 'result dialog waits for the finale');
await page.waitForFunction(() => document.getElementById('game-over').open, null, { timeout: 10000 });
check((await page.locator('#result-extra').textContent()).includes("Cap'n's advice:"), 'pirate result gives the captain\'s advice');
await page.screenshot({ path: 'test-results/pirate-result.png' });
await page.click('#close-result-btn');
await page.click('#new-game-btn');
check((await page.locator('.parrot-bubble').textContent()) === '', 'a new battle clears the parrot\'s last remark');
await page.click('#theme-btn');

// Power-ups mode: sonar, broadside and decoys.
const enemyShots = () => page.locator('#enemy-board .cell.hit, #enemy-board .cell.miss, #enemy-board .cell.decoy').count();
const playerTurn = () => page.waitForFunction(() => !document.querySelector('#enemy-board').classList.contains('waiting'));
await page.click('#random-btn');
await page.selectOption('#mode', 'powerups');
await page.click('#start-btn');
check(await page.locator('#powerups').isVisible(), 'power-ups bar shows in a power-ups battle');
check(await page.locator('#player-board .cell.decoy-buoy').count() === 1, 'your decoy is hidden in your waters');
await page.click('#pw-sonar');
await cell('enemy', 4, 4).hover();
check(await page.locator('#enemy-board .cell.aim').count() === 9, 'sonar aims at a 3x3 area');
await cell('enemy', 4, 4).click();
check(await page.locator('#enemy-board .cell.sonar').count() === 9 &&
  (await page.locator('#log').textContent()).includes('pinged sonar at E5'), 'sonar marks the area and logs the contacts');
check(await enemyShots() === 0, 'sonar does not fire a shot');
await playerTurn();
check(await page.locator('#pw-sonar').isDisabled(), 'sonar is used up after one ping');
await page.click('#pw-broadside');
const arrow = await page.locator('#pw-broadside').textContent();
await page.click('#pw-broadside');
check((await page.locator('#pw-broadside').textContent()) !== arrow, 'tapping broadside again turns it');
await cell('enemy', 0, 7).hover();
check(await page.locator('#enemy-board .cell.aim').count() === 3, 'broadside aims at 3 squares');
await cell('enemy', 0, 7).click();
check(await enemyShots() === 3 && (await page.locator('#log').textContent()).includes('fired a broadside at'), 'broadside fires 3 shots in one turn');
await playerTurn();
check(await page.locator('#pw-broadside').isDisabled() && await page.locator('#pw-shot').getAttribute('aria-pressed') === 'true',
  'broadside is used up and the cannon is selected again');
await page.reload();
await page.locator('#powerups').waitFor();
check(await page.locator('#enemy-board .cell.sonar').count() === 9 && await enemyShots() === 3 &&
  (await page.locator('#pw-broadside').textContent()).includes('×0'), 'a power-ups battle resumes after reload');
await page.click('#new-game-btn');
await page.selectOption('#mode', 'classic');

// Pirate campaign.
await page.click('#campaign-btn');
check(await page.locator('#campaign-list li').count() === 5 && await page.locator('#campaign-list button').first().isEnabled() &&
  await page.locator('#campaign-list button').nth(1).isDisabled(), 'campaign starts with only the first captain unlocked');
await page.locator('#campaign-list button').first().click();
check(await page.locator('#captain').isVisible() && (await page.locator('#captain-name').textContent()).includes('Barnacle Bill') &&
  (await page.locator('#log').textContent()).includes('Barnacle Bill challenges you'), 'campaign battle starts with the captain\'s taunt');
check(await page.locator('#powerups').isHidden(), 'the first captain fights without power-ups');
await page.click('#new-game-btn');
check(await page.locator('#captain').isHidden(), 'the captain leaves when the battle is abandoned');
await page.evaluate(() => localStorage.setItem('battleship.campaign.v1', JSON.stringify({ beaten: { barnacle: { wins: 1, bestShots: 61 } } })));
await page.reload();
await page.click('#campaign-btn');
check((await page.locator('#campaign-list li').first().textContent()).includes('best win 61 shots') &&
  await page.locator('#campaign-list button').nth(1).isEnabled() && await page.locator('#campaign-list button').nth(2).isDisabled(),
  'beating a captain unlocks the next one');
await page.screenshot({ path: 'test-results/campaign.png' });
await page.click('#campaign-close-btn');

// Broken audio (old browsers, blocked AudioContext) must not stall the battle.
const noAudio = await context.newPage();
await noAudio.addInitScript(() => {
  localStorage.clear();
  window.AudioContext = function () { throw new Error('audio blocked'); };
});
await noAudio.goto(url);
await noAudio.click('#random-btn');
await noAudio.click('#start-btn');
await noAudio.locator('#enemy-board .cell[data-row="0"][data-col="0"]').click();
await noAudio.waitForFunction(() => document.querySelectorAll('#player-board .cell.hit, #player-board .cell.miss').length === 1, null, { timeout: 3000 }).catch(() => {});
check(await noAudio.locator('#player-board .cell.hit, #player-board .cell.miss').count() === 1 &&
  await noAudio.locator('#enemy-board .cell[data-row="0"][data-col="1"]').isEnabled(), 'battle keeps going when audio fails');
await noAudio.close();

check(errors.length === 0, `no console errors ${errors.join(' | ')}`);
await browser.close();
