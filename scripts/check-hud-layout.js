const fs = require("fs");

const html = fs.readFileSync("public/index.html", "utf8");

const requiredCss = [
  ["rendered game viewport", /#gameViewport\s*\{[\s\S]*?position:\s*relative;[\s\S]*?width:\s*min\(100vw,\s*177\.777vh\);[\s\S]*?height:\s*min\(56\.25vw,\s*100vh\);/],
  ["canvas fills rendered viewport", /canvas\s*\{[\s\S]*?display:\s*block;[\s\S]*?width:\s*100%;[\s\S]*?height:\s*100%;/],
  ["top-center item anchor", /#bottomUi\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?left:\s*50%;[\s\S]*?top:\s*18px;[\s\S]*?transform:\s*translateX\(-50%\);/],
  ["bottom-center HP anchor", /#hpBarWrap\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?left:\s*50%;[\s\S]*?bottom:\s*12px;[\s\S]*?transform:\s*translateX\(-50%\);/],
  ["double-size HP HUD", /#hpBarWrap\s*\{[\s\S]*?width:\s*320px;[\s\S]*?#hpBar\s*\{[\s\S]*?width:\s*320px;[\s\S]*?height:\s*28px;[\s\S]*?#xpBar\s*\{[\s\S]*?width:\s*320px;[\s\S]*?height:\s*14px;/],
  ["arrow HUD sits opposite potion buffs beside HP", /#arrowHud\s*\{[\s\S]*?left:\s*calc\(100% \+ 12px\);[\s\S]*?top:\s*0;/],
  ["potion buffs sit left of HP", /#hudBuffs\s*\{[\s\S]*?right:\s*calc\(100% \+ 12px\);[\s\S]*?top:\s*0;/],
  ["nine weapon/tool slots", /id="slot1"[\s\S]*id="slot9"/],
  ["retired skill bar hidden", /id="abilityBar"[^>]*class="[^"]*retired-system[^"]*"[^>]*aria-hidden="true"/],
  ["world-grid status inside viewport", /id="worldGridStatus"/]
];

for (const [label, pattern] of requiredCss) {
  if (!pattern.test(html)) throw new Error(`HUD anchoring regression: ${label}`);
}

for (const id of ["hpBarWrap", "bottomUi"]) {
  const fixedPattern = new RegExp(`#${id}\\s*\\{[^}]*position:\\s*fixed;`);
  if (fixedPattern.test(html)) {
    throw new Error(`${id} must not anchor to browser/window edges`);
  }
}

const viewportStart = html.indexOf('<div id="gameViewport">');
const inventoryStart = html.indexOf('<div id="inventoryOverlay"');
if (viewportStart < 0 || inventoryStart < 0 || inventoryStart <= viewportStart) {
  throw new Error("Rendered game viewport wrapper is missing or misplaced");
}
const viewportMarkup = html.slice(viewportStart, inventoryStart);
for (const id of ["game", "hpBarWrap", "bottomUi", "worldGridStatus"]) {
  if (!viewportMarkup.includes(`id="${id}"`)) {
    throw new Error(`${id} must live inside the rendered game viewport`);
  }
}

const hpIndex = viewportMarkup.indexOf('<div id="hpBarWrap">');
const gridIndex = viewportMarkup.indexOf('<div id="worldGridStatus"');
const itemIndex = viewportMarkup.indexOf('<div id="bottomUi">');
if (!(hpIndex > 0 && gridIndex > hpIndex && itemIndex > gridIndex)) {
  throw new Error("Active HUD groups must remain independent ordered siblings inside gameViewport");
}

const browsers = [
  { width: 1280, height: 720, label: "16:9" },
  { width: 1600, height: 1200, label: "top/bottom letterbox" },
  { width: 1600, height: 600, label: "left/right gutters" },
  { width: 1000, height: 1000, label: "square tall" },
  { width: 1000, height: 400, label: "wide short" },
  { width: 700, height: 1000, label: "narrow tall" },
  { width: 560, height: 900, label: "compact tall" },
  { width: 420, height: 800, label: "narrow breakpoint" },
  { width: 380, height: 700, label: "extra compact breakpoint" },
  { width: 320, height: 180, label: "minimum 16:9" }
];

const overlaps = (a, b) =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

for (const browser of browsers) {
  const viewportWidth = Math.min(browser.width, browser.height * (16 / 9));
  const viewportHeight = Math.min(browser.width * (9 / 16), browser.height);
  const viewportLeft = (browser.width - viewportWidth) / 2;
  const viewportTop = (browser.height - viewportHeight) / 2;
  const viewportRight = viewportLeft + viewportWidth;
  const viewportBottom = viewportTop + viewportHeight;

  const extraCompact = browser.width <= 380;
  const narrow = browser.width <= 420;
  const compact = browser.width <= 560 || browser.height <= 480;
  const hotbarCompact = browser.width <= 760 || browser.height <= 480;

  const itemTop = extraCompact ? 14 : narrow ? 15 : compact ? 16 : 18;
  const itemOuter = extraCompact ? 29 : narrow ? 38 : compact ? 42 : hotbarCompact ? 53 : 62;
  const itemGap = extraCompact ? 1 : narrow ? 2 : compact ? 4 : hotbarCompact ? 5 : 9;
  const itemWidth = itemOuter * 9 + itemGap * 8;
  const item = {
    left: viewportLeft + (viewportWidth - itemWidth) / 2,
    right: viewportLeft + (viewportWidth + itemWidth) / 2,
    top: viewportTop + itemTop,
    bottom: viewportTop + itemTop + itemOuter
  };

  const hpBottomMargin = extraCompact ? 6 : compact ? 8 : 12;
  const hpWidth = extraCompact ? 240 : narrow ? 272 : compact ? 288 : 320;
  const hpOuterWidth = hpWidth + 4;
  const hpHeight = extraCompact ? 42 : compact ? 49 : 56;
  const hpBottom = viewportBottom - hpBottomMargin;
  const hp = {
    left: viewportLeft + (viewportWidth - hpOuterWidth) / 2,
    right: viewportLeft + (viewportWidth + hpOuterWidth) / 2,
    top: hpBottom - hpHeight,
    bottom: hpBottom
  };

  const indicatorGap = extraCompact ? 4 : narrow ? 6 : compact ? 8 : 12;
  const buffWidth = extraCompact ? 28 : narrow ? 32 : compact ? 84 : 102;
  const buffTopOffset = extraCompact ? -8 : narrow ? -9 : 0;
  const buffHeight = extraCompact ? 50 : narrow ? 58 : compact ? 40 : 48;
  const buffs = {
    left: hp.left - indicatorGap - buffWidth,
    right: hp.left - indicatorGap,
    top: hp.top + buffTopOffset,
    bottom: hp.top + buffTopOffset + buffHeight
  };

  const arrowWidth = extraCompact ? 32 : narrow ? 38 : compact ? 44 : 52;
  const arrowHeight = extraCompact ? 30 : narrow ? 34 : compact ? 40 : 48;
  const arrow = narrow
    ? {
        left: hp.left - indicatorGap - arrowWidth,
        right: hp.left - indicatorGap,
        top: hp.top + (extraCompact ? -38 : -44),
        bottom: hp.top + (extraCompact ? -38 : -44) + arrowHeight
      }
    : {
        left: hp.right + indicatorGap,
        right: hp.right + indicatorGap + arrowWidth,
        top: hp.top,
        bottom: hp.top + arrowHeight
      };

  for (const [name, rect] of [["items", item], ["HP", hp], ["buffs", buffs], ["arrow", arrow]]) {
    const epsilon = 0.001;
    if (
      rect.left < viewportLeft - epsilon ||
      rect.top < viewportTop - epsilon ||
      rect.right > viewportRight + epsilon ||
      rect.bottom > viewportBottom + epsilon
    ) {
      throw new Error(`${name} HUD escaped rendered viewport at ${browser.width}x${browser.height} (${browser.label})`);
    }
  }

  if (
    overlaps(item, hp) || overlaps(hp, buffs) ||
    overlaps(hp, arrow) || overlaps(buffs, arrow)
  ) {
    throw new Error(`HUD group collision at ${browser.width}x${browser.height} (${browser.label})`);
  }

  if (viewportTop > 0 && item.top <= itemTop) {
    throw new Error(`Item hotbar ignored vertical letterbox at ${browser.width}x${browser.height}`);
  }
  if (viewportTop > 0 && hp.bottom >= browser.height - hpBottomMargin) {
    throw new Error(`HP anchor ignored vertical letterbox at ${browser.width}x${browser.height}`);
  }
}

console.log("Viewport HUD anchoring checks passed for unified top-center 1-9 weapons/tools and bottom-center HP/EXP.");
