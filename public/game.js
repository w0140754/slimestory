const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const GAME_RENDER_SCALE = Math.max(
  1,
  Math.floor(Number(canvas.dataset.mobileRenderScale) || 1)
);
const VIEW_W = Math.max(
  1,
  Math.floor(Number(canvas.dataset.logicalWidth) || canvas.width)
);
const VIEW_H = Math.max(
  1,
  Math.floor(Number(canvas.dataset.logicalHeight) || canvas.height)
);
ctx.setTransform(GAME_RENDER_SCALE, 0, 0, GAME_RENDER_SCALE, 0, 0);
ctx.imageSmoothingEnabled = false;

// Declared before any startup/map/input code can reference it. A later const/let
// declaration created a temporal-dead-zone crash in v6-11-147.
let onlineClient = null;

// -----------------------------------------------------------------------------
// GAME CONFIG
// -----------------------------------------------------------------------------
// Keep frequently tuned gameplay numbers here so balance changes do not require
// hunting through the update/render code.

// -----------------------------------------------------------------------------
// YOUR 7 LAYERED 16x16 PNGS
// -----------------------------------------------------------------------------
const sources = {
  leftLeg: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAPElEQVQ4T2NkoBAwwllkglEDRsNg8KaD/9BUCgN4Uys2yf+9XoZgRvG28yAKmxo4wCZJuQFwFgRgUwMHAIwjChELiOvIAAAAEGRlQkdCNDFDQ0I5NEU0QkVGNEI16P21AgAAAABJRU5ErkJgggAA",
  rightLeg: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAANklEQVQ4T2NkoBAwwllkglEDRsNg6KSD/9BUCwMoqZeYpPy/18sQzCjedh5EDYABEIfAAYoLAOwUChFjx2fmAAAAEGRlQkdERUY1MUI5NjBDOTlDQkY3CoeR9gAAAABJRU5ErkJgggAA",
  torso: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAZUlEQVQ4T2NkoBAwwllkglEDaBQG/3GIgwCGHLrC/71ehgzF287DBZABkhxcH7oBIAA25N5EPbgACCjlX8LQDAK0MSBKS4LhagA/XAAEtDd8ZFh27QWISdgAOAs7IGgASWDgDQAA7+kfEdK/GicAAAAQZGVCR0EyRTc2Rjg2REIzRjY3RkKg/Uf1AAAAAElFTkSuQmCC",
  leftArm: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAP0lEQVQ4T2NkoBAwwllkglEDBmMY/CfVVciK//d6GTIUbzsPYhNtCIoB3w+uYeC0DwGxyTIABCjyAllgGBgAABIYChFcqIyJAAAAEGRlQkdDNThFRjk2MTBBOTRDN0Mx27iMtQAAAABJRU5ErkJgggAA",
  rightArm: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAP0lEQVQ4T2NkoBAwwllkglEDhmoY/Ed2OanR+L/Xy5CheNt5EBusl2QDvh9cw8BpHwJik2UACFDkBQwwDAwAAKn6ChHnBNBfAAAAEGRlQkdDQkExQjBBNDczRjk4NENFxB5CHwAAAABJRU5ErkJgggAA",
  face: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAYElEQVQ4T2NkoBAwwllkgsFrwH+4G1EBhosxBBgYGP6fm94EZmhqaYHp69eugWmjzDoQhaIH3YD/3w+uATM47UMYcLGR9aEbAAJwQ9ABumYQwGYACFAUBiSBUQMGQxgAALKYFxGV2AepAAAAEGRlQkc0ODAyMDE2MTZFM0ZFMjc2Zn0dVQAAAABJRU5ErkJgggAA",
  hat: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAZUlEQVQ4T2NkoBAwwlmo4D+chQow1GMIgDT/lJGGc5AB+5OnIApFD9UNAGuGKmT4f14ITDMavgPTSHJwfcgG/AdpgCqGi/8/L/Sf0fAdjI+hBsMFWMTQAYoaQooJglEDRsMAlA4AQpQhEaNTDfAAAAAQZGVCR0RERkMyRDBBOURCNTExNTFanHCaAAAAAElFTkSuQmCC"
};

const sprite = {
  // Under-clothes / default appearance. These are not inventory items:
  // they are rendered whenever the corresponding armor slot is empty.
  baseLeftLeg: loadImage("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAASklEQVQ4T2NkoBAwwllkglEDRsNg8KaD/9BUCgN4Uys2yf/npjeBGUaZdSAKmxo4wCb5/////wxPnjxhkJWVBfGxqYEDbJIkeQEA2YINEWjEZXQAAAAQZGVCRzlBMEQzQzFGMEM4NkNGOUGyHcfBAAAAAElFTkSuQmCC"),
  baseRightLeg: loadImage("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAARElEQVQ4T2NkoBAwwllkglEDRsNg6KSD/9BUCwMoqZeYpPz/3PQmMMMosw5EkW7A48ePGWRkZBgYGcHKSTcAzoIAFD0AAXMKESJVAOoAAAAQZGVCRzhENDMxQkY2QjA3QTNBRjEn2XE6AAAAAElFTkSuQmCC"),
  baseTorso: loadImage("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAlElEQVQ4T2NkoBAwwllkglEDaBQG/3GIgwCGHLrC/ztb8hncaybCBZABkhxcH7oBIPD/+8E1DBx2wXABEPhxaC0Dp30IiInXBSDw//HjxwwyMjJwARB48uQJg6ysLIhJ2IBVq1YxWFpawgVA4Pjx4wxhYWEgJmEDBPn4GOTk5RkePXwIFoCx33/6BOISNIAkMPAGAAD6ISgRUpy/tAAAABBkZUJHRDUzQzVDNTg1MjE5QjJENi+g4D8AAAAASUVORK5CYIIA"),
  baseLeftArm: loadImage("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAP0lEQVQ4T2NkoBAwwllkglEDBmMY/CfVVciK/5+b3sRglFkHYhNtCIoB3w+uYeC0DwGxyTIABCjyAllgGBgAABWUChEvz5FkAAAAEGRlQkc0RDVDREE2MjE1MEQ5RDQzFt0lugAAAABJRU5ErkJgggAA"),
  baseRightArm: loadImage("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAP0lEQVQ4T2NkoBAwwllkglEDhmoY/Ed2OanR+P/c9CYGo8w6EBusl2QDvh9cw8BpHwJik2UACFDkBQwwDAwAAK12ChG0t5hsAAAAEGRlQkdDMzIyQkMwNTFFNUZCNjM59yRDjAAAAABJRU5ErkJgggAA"),
  baseHat: loadImage("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAjUlEQVQ4T2NkwA7+w1mogBHOggIMAZDmZC8zBhkpCQYeLg6wwJdvPxiePHvBMHfbKRAXRQ+6Af+DTGQYBMWkwByQISAA0gwC7189Y1h35gmICdeH0wBsLiBkANjpIABSCDPE39iEYermLXAxdENQDADZDgLrzjxBdxkYBJnIgAMXlwFkgVEDRsOAKukAAG1dOhFPmxZ7AAAAEGRlQkdBMjhCRkRFNEFGMENENTE3e6xUtQAAAABJRU5ErkJgggAA"),

  leftLeg: loadImage(sources.leftLeg),
  rightLeg: loadImage(sources.rightLeg),
  torso: loadImage(sources.torso),
  leftArm: loadImage(sources.leftArm),
  rightArm: loadImage(sources.rightArm),
  face: loadImage(sources.face),
  hat: loadImage(sources.hat),
  bandanaHat: loadImage("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAnElEQVQ4T2NkwA3+w1kQwAhnIQGsgiDN9Sl+DDxcHGDOl28/GBrnbAIxMdRjCIA0J3uZgRkyUhJg+smzF2B67rZTIApFD7oB/4NMZBgExaTAmpFdADLk/atnDOvOPAEJwfVhGACyfU8kK5gjISUJpl88ew6mXZb/xnAFsgH/2VsVGX5W30c3FC8gSTE2MLhcQBagahiQBUYNYGAAAIrBLhEifdggAAAAEGRlQkdFRDJEM0U5Qjc5NEE4NzJEukB06wAAAABJRU5ErkJgggAA"),
  blueCap: loadImage("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAcElEQVQ4T2NkoBAwwlmo4D+chQow1GMIgDQrTlsJ5yCD+1nhIApFD9UN+C/RO59BXF4BLoAMXj58wPCiOBHEhOtDNuD/wSRRMCPPaxVUCBVM2hYGpu3nvQZRYL0YLsAihg5Q1BBSTBCMGjAaBqB0AAAethkR9yxqpQAAABBkZUJHMjE4RjBGQ0QyMkI2NkE0Q8eRNTMAAAAASUVORK5CYIIA"),
  wizardHat: loadImage("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAhElEQVQ4T2NkwA/+Q2lGKI0BcEqANGdcP8vQLFfHIMq9FcTHqharIEwzMpihaQyiMNRjCIA0v/7qDWbUPmqCCjHgdAkyB+xf/dkTGUT5+GBiKOD1p08MF1PzYVywXpgB/11WzkdXgBXALNgTngjiMmK4AN2JWACKOkKKCYJRA0bDAJQOAK6iJBF69CrqAAAAEGRlQkcyMjQwMkI3RTA3NjkxNDE1WzHzEAAAAABJRU5ErkJgggAA"),

  // User-drawn jester / magician armor set.
  jesterHat: loadImage("assets/jester_hat_v2.png"),
  jesterLeftArm: loadImage("assets/jester_leftarm_v2.png"),
  jesterLeftLeg: loadImage("assets/jester_leftleg_v2.png"),
  jesterRightArm: loadImage("assets/jester_rightarm_v2.png"),
  jesterRightLeg: loadImage("assets/jester_rightleg_v2.png"),
  jesterTorso: loadImage("assets/jester_torso_v2.png"),

  // User-drawn ninja armor set.
  ninjaHat: loadImage("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAfElEQVQ4T2NkoBAwwlmo4D+chQow1GMIgDSLi4gwMLOxwQVA4O+vXwwv37wBMVH0oBsA1gwC2AwAAXRDMAxIkBNhUBURBHNEJSXB9Ovnz8H07TfvGRY8ImAApS5gEBcR+f/yzRsMcRDAJodTITYXoGsGAQwBUsGoAcMiDAAwJS8RTDl2aAAAABBkZUJHMUU4NUUwNzUxQTg0RTgxMbXjug4AAAAASUVORK5CYIIA"),
  ninjaLeftArm: loadImage("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAP0lEQVQ4T2NkoBAwwllkglEDBmMY/CfVVciK/4uLiDC8fPMGxCbaEBQDvh9cw8BpHwJik2UACFDkBbLAMDAAAA70ChH8aZ97AAAAEGRlQkcwQTM1QUQ1N0ZCRTlCRDMxk2oEEQAAAABJRU5ErkJgggAA"),
  ninjaLeftLeg: loadImage("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAARklEQVQ4T2NkoBAwwllkglEDRsNg8KaD/9BUCgN4Uys2yf/iIiJgxss3b0AUNjVwgE3yPy8XF5jx+ds3EIVNDRxgkyTJCwB+owoR8CTjnwAAABBkZUJHNTU4MDQ1QzY4MDFEOUFCM2lukZkAAAAASUVORK5CYIIA"),
  ninjaRightArm: loadImage("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAP0lEQVQ4T2NkoBAwwllkglEDhmoY/Ed2OanR+F9cRITh5Zs3IDZYL8kGfD+4hoHTPgTEJssAEKDICxhgGBgAAKbWChGn8Zh5AAAAEGRlQkdDQjRCQkREQjkzNjNBQjk1EQHD8QAAAABJRU5ErkJgggAA"),
  ninjaRightLeg: loadImage("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAQklEQVQ4T2NkoBAwwllkglEDRsNg6KSD/9BUCwMoqZeYpPxfXEQEzHj55g2IIt0AXi4uMOPzt28ginQD4CwIQNEDAN6UChETOrM3AAAAEGRlQkczQzQwNTJGRkY3RUJDMkIwOAr2YwAAAABJRU5ErkJgggAA"),
  ninjaTorso: loadImage("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAg0lEQVQ4T2NkoBAwwllkglEDaBQG/3GIgwCGHLrC/7xcXAyfv32DCyADJDm4PnQDQOC/uIgIAzMbG5jz99cvhm/fvjFwcXExvHzzBiSE1wUgADYApAkGQJpBgGgDQE4FAZBGmEs+f/iA4XwQwGoAjLGlXQJM+1S+gIqAAUEDSAIDbwAAQSElEba8hIsAAAAQZGVCR0RDODlBNkM4MUNFMUE4ODX8zOLAAAAAAElFTkSuQmCC"),
  knightHat: loadImage("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAsElEQVQ4T2NkQAX/GRgYGKE0NgCTA9FwARj4f3yGGoNlxi2GdCMpBhkRAQYVcUGwxJ2X7xmevPnAMPPcMwaYGpheFANmzZrFICYmxhAQEAAWaHbTAtO1u66B6Q0bNjC8evWKIS0tDcTFNCA/P59BW1sbzEE2CKYRBK5evcowceJEEBPDABAAuwJqA1gjCMAMQpKD60NxAcjvIH8iicMCE85HV4PuApLBqAGjYUCVdAAAVgdAEfDDYbIAAAAQZGVCRzk5OTc4NEZDRTg0ODBDRDgkDWC1AAAAAElFTkSuQmCC"),
  knightLeftArm: loadImage("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAP0lEQVQ4T2NkoBAwwllkglEDBmMY/CfVVciK/8+aNYshLS0NxCbaEBQDvh9cw8BpHwJik2UACFDkBbLAMDAAABUwChECapczAAAAEGRlQkc5QURFMzEwMjRGMDlDMjc3tOc9JQAAAABJRU5ErkJgggAA"),
  knightLeftLeg: loadImage("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAS0lEQVQ4T2NkoBAwwllkglEDRsNg8KaD/9BUCgN4Uys2yf8bNmxgePXqFUNaWhqIj00NHGCTBBuwf/9+hokTJ4L42NTAATZJkrwAAMu8EBEqPCfAAAAAEGRlQkcwRUFFNzVEMEM0NUQ3MEQ5jVZ1vQAAAABJRU5ErkJgggAA"),
  knightRightArm: loadImage("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAP0lEQVQ4T2NkoBAwwllkglEDhmoY/Ed2OanR+H/WrFkMaWlpIDZYL8kGfD+4hoHTPgTEJssAEKDICxhgGBgAAK0SChH2fQqwAAAAEGRlQkcxMzkwQTIyNzZCQUVFMDFFCBnlJgAAAABJRU5ErkJgggAA"),
  knightRightLeg: loadImage("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAQklEQVQ4T2NkoBAwwllkglEDRsNg6KSD/9BUCwMoqZeYpPx/1qxZDGJiYgwBAQEgPukG5OfnMzg6OpJvAJwFASh6APiAChE9RSQcAAAAEGRlQkc0RkU0MkVFRjE3QTQ5MjlDQ8iSdwAAAABJRU5ErkJgggAA"),
  knightTorso: loadImage("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAh0lEQVQ4T2NkoBAwwllkglEDaBQG/3GIgwCGHLrC//n5+QwTJ06ECyADJDm4PnQDQOD/rFmzGHT/9TC8lOgCC4i/KGO4zFTCkJaWBuLidQEIUG4AyKnajLMZGLQmQESuFTBc/Z+K4XwQwGqAIB8fg5y8PMOjhw/BAjD2+0+fQFyCBpAEBt4AAEz9MBE7/ubeAAAAEGRlQkdDRDY5OENFRDk2RUU0QzFGAdyrmwAAAABJRU5ErkJgggAA"),

  // User-drawn bowman outfit, now the Ranger armor set.
  rangerHat: loadImage("assets/ranger_hat_v2.png"),
  rangerTorso: loadImage("assets/ranger_torso_v2.png"),
  rangerLeftArm: loadImage("assets/ranger_leftarm_v2.png"),
  rangerRightArm: loadImage("assets/ranger_rightarm_v2.png"),
  rangerLeftLeg: loadImage("assets/ranger_leftleg_v2.png"),
  rangerRightLeg: loadImage("assets/ranger_rightleg_v2.png"),

  // User-drawn craftable Wood Armor set.
  woodHat: loadImage("assets/wood_armor_hat_v1.png"),
  woodTorso: loadImage("assets/wood_armor_torso_v1.png"),
  woodLeftArm: loadImage("assets/wood_armor_leftarm_v1.png"),
  woodRightArm: loadImage("assets/wood_armor_rightarm_v1.png"),
  woodLeftLeg: loadImage("assets/wood_armor_leftleg_v1.png"),
  woodRightLeg: loadImage("assets/wood_armor_rightleg_v1.png"),

  // User-drawn Arcanist armor set (Magus class).
  arcanistHat: loadImage("assets/arcanist_hat_v1.png"),
  arcanistTorso: loadImage("assets/arcanist_torso_v1.png"),
  arcanistLeftArm: loadImage("assets/arcanist_leftarm_v1.png"),
  arcanistRightArm: loadImage("assets/arcanist_rightarm_v1.png"),
  arcanistLeftLeg: loadImage("assets/arcanist_leftleg_v1.png"),
  arcanistRightLeg: loadImage("assets/arcanist_rightleg_v1.png"),

  // User-drawn Greencap common armor set.
  greencapHat: loadImage("assets/greencap_cap_v1.png"),
  greencapTorso: loadImage("assets/greencap_torso_v1.png"),
  greencapLeftArm: loadImage("assets/greencap_leftarm_v1.png"),
  greencapRightArm: loadImage("assets/greencap_rightarm_v1.png"),
  greencapLeftLeg: loadImage("assets/greencap_leftleg_v1.png"),
  greencapRightLeg: loadImage("assets/greencap_rightleg_v1.png")
};

const woodRingImage = loadImage("assets/wood_ring_v3.png");
const emptyCharmImage = loadImage("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR4nGNgYGAAAAAEAAGjChXjAAAAAElFTkSuQmCC");

// Inventory/equipment previews combine the actual layered armor pieces so
// shirts read as torso + both sleeves and pants show both legs.
const armorPreviewImages = Object.freeze({
  shirts: Object.freeze([
    loadImage("assets/ui/base_shirt_preview.png"),
    loadImage("assets/ui/traveler_shirt_preview.png"),
    loadImage("assets/ui/jester_shirt_preview.png"),
    loadImage("assets/ui/ninja_shirt_preview.png"),
    loadImage("assets/ui/knight_shirt_preview.png"),
    loadImage("assets/ui/ranger_shirt_preview.png"),
    loadImage("assets/ui/wood_shirt_preview.png"),
    loadImage("assets/ui/arcanist_shirt_preview.png"),
    loadImage("assets/ui/greencap_shirt_preview.png")
  ]),
  pants: Object.freeze([
    loadImage("assets/ui/base_pants_preview.png"),
    loadImage("assets/ui/traveler_pants_preview.png"),
    loadImage("assets/ui/jester_pants_preview.png"),
    loadImage("assets/ui/ninja_pants_preview.png"),
    loadImage("assets/ui/knight_pants_preview.png"),
    loadImage("assets/ui/ranger_pants_preview.png"),
    loadImage("assets/ui/wood_pants_preview.png"),
    loadImage("assets/ui/arcanist_pants_preview.png"),
    loadImage("assets/ui/greencap_pants_preview.png")
  ])
});

// On death, torso + arms + legs collapse into this single 16x16 ghost body.
// The current head and current hat continue to render above it.
const playerGhostBodyImage = loadImage("assets/player_ghost_body_v1.png");


// -----------------------------------------------------------------------------
// WOOD SWORD
// -----------------------------------------------------------------------------
// First crafted combat weapon. It keeps the existing sword pivot / combat logic.
const swordImage = new Image();
swordImage.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAZklEQVQ4T2NkoBAwwllkgmFmwH9yvAVT/H9TnhKD36R7UC4GwGkoSOJ/d7gMmKMuzsYgJi4OlUIAi+rjcDYaYIS7ANkQQgBmCchgZKeBw4CAV9AB3AXIAGQQNnGsgGiFuMCoAQwMAJ4PEhAZoz7TAAAAEGRlQkdDNkU2MjVENTdFRjZBNzE0qzz/cwAAAABJRU5ErkJgggAA";

// Restored original pre-Wood-Sword weapon art as its own weapon.
const oldSwordImage = new Image();
oldSwordImage.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAdElEQVQ4T2NkoBAwwllkgmFmwH8kL4HYuACKt+EaumNMGUqXnAZz2tvbGSQkJKBSCPDixQuGyspKGBesF0T8L3BVZJAWF2F4+vINg35UHQMXOzuDnqEhTCEcXDp/nuHbz5/IBjFSxQUwQFEYkA1GDaBCGAAA194oEUjv6x0AAAAQZGVCRzRFQ0U0RDU3NEUxQzVDQjCb0v2LAAAAAElFTkSuQmCC";

// Player-drawn 16x16 Wood Bow arch. The drawstring is procedural.
const bowImage = new Image();
const dreamcatcherBowImage = loadImage("assets/dreamcatcher_bow_v1.png");
bowImage.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAjUlEQVQ4T2NkoBAwwllkgmFswH+4J1EBhpfRBcAaV+WoMJxP4WOQFpMHCz599ZDBcM4nhrApdyCqkPQhG/C/wkuEgZ/9H0Pl+ndwQWTQHijE8PEnE0PHtjcgLlgvzID/qdZcDLOPfoNyMVwGA2AXIqllBClE1oxLIzqA64G7gATNMADWQ6omDDBqAAMDAJKmJxCluA92AAAAEGRlQkdCMUNFQUU3NzJCNjFENDI3TC6AxwAAAABJRU5ErkJgggAA";

// The supplied bow is horizontal, with its curved centre near the top.
// Local -Y is treated as the bow's forward/arrow direction.
const BOW_PIVOT_X = 8;
const BOW_PIVOT_Y = 6;


// Player-drawn 16x16 axe. It uses the same left-edge handle pivot convention
// as the sword, so the existing stepped swing poses can be reused.
const axeImage = new Image();
axeImage.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAkUlEQVQ4T2NkoBAwwllkAroY8B9uHQLALSbkgv9FyTFwjqSUFMPzZ88Y+uYuAXHBegkZAAL/A51twQxFBXkUzSgMkEI4Cw04GOmAaTlJcYZFW/eCmBgG/N+0aRPDxVmNDPpp9WAaGZz7zgWmQS4QfHmdoXbLWRAXwwsUuQAfIDoMsAHqxAKchQBEu4AgGAYGAABhVi4RfP+qCAAAABBkZUJHRjM4MDc2NzI4QkUyRTYxQj+ZE0sAAAAASUVORK5CYIIA";

const AXE_PIVOT_X = 2;
const AXE_PIVOT_Y = 7;

// Temporary 16x16 pickaxe art so Mining is testable immediately. This is a
// normal asset file and can be replaced later without changing any code.
const pickaxeImage = loadImage("assets/pickaxe_v6.png");
const PICKAXE_PIVOT_X = 2;
const PICKAXE_PIVOT_Y = 7;
const PICKAXE_HOLD_OFFSET_Y = 1;

// Spawn-map tutorial NPC and first crafting bench.
const tutorialNpcImage = new Image();
tutorialNpcImage.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAABR0lEQVQ4T2NkwA7+w1mogBHOggIMAZDmMC1eBhVJIbgACNx5/o5h1bXPICaKHnQD/ltJsTLICHBgNeDJhx8Mx579BnHh+jAMANkuJcDBoK2qxMDDJwAW/PLpA8PV2/cYnn34geEKDAMKrEQZJhx7DRdABkhyWA2Aaz43vQksoKmlBaavX7sGpo0y60AUiqUwDlzz94NrwAKc9iE42dhcgOJ0mGJ0gK4ZBEAcsOabzz8ybL//i0FXUoTh8vM3cAXIAEkO0wUgwllXnWHv5ZtgWlxOASoFAS+P7WXY+/4PXA1ML7Jz/oOcDnKmsyALg7iVM1yC/dJRhkcC0mCNMDXYDAABsEtAThX78QEmxsAgo8zw6s1bZK9heAEZ4MoHMICiB6sB7r5RDE9fvGW4cnonWEDH1J1BWkKYYefmZSAuHQyAOAQnQHEBAFxrihE+uaraAAAAEGRlQkczRkJDODFCRkU3MEVCQzZDGCjZMwAAAABJRU5ErkJgggAA";
const hunterNpcImage = loadImage("assets/hunter_npc_v1.png");
const jesterNpcImage = loadImage("assets/jester_npc_v1.png");
const beachGirlNpcImage = loadImage("assets/beach_girl_npc.png?v=370");
const icedCoffeeImage = loadImage("assets/iced_coffee.png?v=370");
const greenWitchNpcImage = loadImage("assets/green_witch_npc.png?v=370");
const camoNpcImage = loadImage("assets/camo_npc.png?v=370");
const classResetCrystalImage = loadImage("assets/class_reset_crystal.png");
const craftRoleAxeImage = loadImage("assets/crafting_bubble_axe_v1.png");

const woodBenchImage = loadImage("assets/wood_bench_v2.png");

// Player-drawn wand sprite.
const wandImage = new Image();
wandImage.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAdElEQVQ4T2NkoBAwwllkgmFmwH80L2HjwwBcHMb43x1jylC65DRMDIP/4msFg+h8GYZvly4x8M6aBROHSC4ucGOInbCLAR+tmiLDYF7+Emwb49atKAaAAMy5GDbD+PhcgA6w+R1sGFwESR6bASSBUQOoEAYAURM4EQAektkAAAAQZGVCRzE0MzA5RjU0RUUyNDU1MDgC5IE6AAAAAElFTkSuQmCC";

// Player-drawn rain wand sprite.
const rainWandImage = new Image();
rainWandImage.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAWUlEQVQ4T2NkoBAwwllkghFowH90b8M4IAl8AKTu/////xkYGcFa4IaAJU79/8zgUZjJsKN/Olb63YQlIN0Mh6Y/YLDLVEAxBGYSRS4gBeAMA7LBqAFUCAMAsI8iEUmLjfsAAAAQZGVCRzc0MDQ2MzU3QTg5QTY5QzRtyupvAAAAAElFTkSuQmCC";

// User-drawn craftable Shepherd Staff. It uses the same hand pivot and
// basic-projectile combat loop as the two existing wands.
const shepherdStaffImage = loadImage("assets/shepherd_staff_v1.png");
const lostKeyWandImage = loadImage("assets/witchs_lost_key_v1.png");
const hugeSunflowerWandImage = loadImage("assets/huge_sunflower_v1.png");
const sapgemWandImage = loadImage("assets/sapgem_wand_v4.png?v=370");

const katanaImage = new Image();
katanaImage.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAcUlEQVQ4T2NkoBAwwllkgqFnwH+426EA3QsgBchiKBr+/4dwnz9/DqalpKTgisEy3UX8DKV9H6FC2DWgA5AB/4NYWBieGBkxhNrcZDg+6SvD2t+/wZqwaEB3MX4XYNOADtAVoIcBQUCSYmxg1AAqhAEAg8MkDpP24bUAAAAQZGVCRzVCQ0I5NjRFNEVGNEFBNEROv4a/AAAAAElFTkSuQmCC";

// Player-drawn rain cloud sprite.
const rainCloudImage = new Image();
rainCloudImage.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAQCAYAAAB3AH1ZAAAA/UlEQVRIS7WU0RGEIAxEtQlbcOzGKizKKuyBKmjBJrxZxmViLgTO0/chKBt2RaHv/ufIvSt97jk0iRyObdu6cRzzAzJNE5rq/FWBQ9EcxBi7eZ7RdT28QWtpqXfNSUuI0sCxrmu+IcuypLbFHIQQWFPyMQdMczIMQ2pbAgARglw85U1a8tLbYaJfzTXWJ2EnfVNQmxyT1DQeOgQuzeZPgACAIR4P4K0QzcGrAYA1160AsojjpbeUWiD1GhkAmCFQuO976nMHoJBaYOmx7bCVWaPRPyHJJx8NaE7EoZK3LKHxSdJY54k+mGQAyVexLjzRx3VtHFw0ukCiiz3tbT7D0JMRd29gRgAAABBkZUJHQUY2QjE1NjQ2MUI5M0I2MTWxkqMAAAAASUVORK5CYIIA";

// Use a pivot near the handle end so it swings naturally in the hand.
const WAND_PIVOT_X = 2;
const WAND_PIVOT_Y = 7;
const WAND_HOLD_OFFSET_Y = 2;

// Shared non-bow basic-attack timing. Every sword/tool/wand now uses the same
// wind-up -> impact -> follow-through lifecycle; bows intentionally keep their
// separate draw/release + close-range bow-smack controls. Wands retain their
// slightly longer deliberate gesture and exact historical impact timing.
const DEFAULT_BASIC_ATTACK_DURATION = 0.30;
const WAND_BASIC_ATTACK_DURATION = 0.42;
const WAND_BASIC_ATTACK_FALLBACK_COOLDOWN = 0.83;
const WAND_BASIC_ATTACK_IMPACT_DELAY = 0.09;
const MELEE_BASIC_ATTACK_IMPACT_PHASE = 0.34;

// Feed the hotbar DOM with the same weapon art.

const SWORD_PIVOT_X = 2;
const SWORD_PIVOT_Y = 7;

// -----------------------------------------------------------------------------
// MAGIC / FIRE
// -----------------------------------------------------------------------------
const fireballs = [];
const fireParticles = [];
const wandSweepParticles = [];
const enemyDeathEffects = [];
const ENEMY_SPAWN_ANIM_DURATION = 0.30;
const ENEMY_DEATH_ANIM_DURATION = 0.36;
const growthParticles = [];
const basicProjectiles = [];
const focusFireOpeners = [];
const hunterSnareVisuals = new Map();
const rainClouds = [];
const shadowSmokeParticles = [];
const jesterConfetti = [];
const levelUpParticles = [];
const jesterAfterimages = [];
let jesterClone = null;
const remoteJesterClones = [];
let mouseCanvasX = VIEW_W / 2;
let mouseCanvasY = VIEW_H / 2;
let primaryAttackHeld = false;
let pendingBasicAttack = null;
const JESTER_BLINK_RANGE = 40;
const JESTER_CLONE_DURATION = 2.0;
const JESTER_CLONE_CONTACT_RADIUS = 8.5;
const JESTER_RETURN_LOCKOUT_SECONDS = 0.35;

// Fire spreads in little pulses rather than instantly chaining through an
// entire field in one frame.
let fireSpreadTimer = 0;
const FIRE_SPREAD_INTERVAL = 0.50;





function spawnTreeRegrowBurst(tree) {
  tree.regrowAnimTime =
    tree.regrowAnimDuration || 0.34;

  const leafColors = [
    "#3f7d3b",
    "#55964a",
    "#6baa54",
    "#87bd62"
  ];

  for (let i = 0; i < 8; i++) {
    const angle =
      Math.random() * Math.PI * 2;

    const speed =
      8 + Math.random() * 18;

    const life =
      0.30 + Math.random() * 0.30;

    growthParticles.push({
      x:
        tree.x +
        (Math.random() - 0.5) * 14,
      y:
        tree.y - 23 +
        (Math.random() - 0.5) * 12,
      vx:
        Math.cos(angle) * speed,
      vy:
        Math.sin(angle) * speed - 8,
      life,
      maxLife: life,
      color:
        leafColors[
          (Math.random() *
            leafColors.length) | 0
        ],
      size:
        Math.random() < 0.28 ? 2 : 1
    });
  }
}

function spawnGrassRegrowBurst(clump) {
  clump.regrowAnimTime =
    clump.regrowAnimDuration || 0.22;

  const grassColors = [
    "#4f8947",
    "#5b9850",
    "#67a858"
  ];

  for (let i = 0; i < 3; i++) {
    const life =
      0.20 + Math.random() * 0.18;

    growthParticles.push({
      x:
        clump.x +
        (Math.random() - 0.5) * 8,
      y:
        clump.y - 2 -
        Math.random() * 4,
      vx:
        (Math.random() - 0.5) * 8,
      vy:
        -7 - Math.random() * 7,
      life,
      maxLife: life,
      color:
        grassColors[
          (Math.random() *
            grassColors.length) | 0
        ],
      size: 1
    });
  }
}

function spawnRockChipBurst(rock, broken = false) {
  if (!rock) return;

  const colors = ["#514c49", "#716a66", "#918985", "#b0a7a0"];
  const count = broken ? 10 : 5;

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = (broken ? 18 : 10) + Math.random() * (broken ? 28 : 18);
    const life = 0.20 + Math.random() * (broken ? 0.34 : 0.22);

    growthParticles.push({
      x: rock.x + (Math.random() - 0.5) * 7,
      y: rock.y - 6 + (Math.random() - 0.5) * 6,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - (broken ? 12 : 7),
      life,
      maxLife: life,
      color: colors[(Math.random() * colors.length) | 0],
      size: broken && Math.random() < 0.35 ? 2 : 1
    });
  }
}

function updateGrowthParticles(dt) {
  for (
    let i = growthParticles.length - 1;
    i >= 0;
    i--
  ) {
    const particle =
      growthParticles[i];

    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;

    particle.vx *= 0.96;
    particle.vy += 13 * dt;

    if (particle.life <= 0) {
      growthParticles.splice(i, 1);
    }
  }
}

function drawGrowthParticles(
  camX,
  camY
) {
  for (const particle of growthParticles) {
    const pct = Math.max(
      0,
      Math.min(
        1,
        particle.life /
          particle.maxLife
      )
    );

    ctx.save();
    ctx.globalAlpha =
      Math.min(1, pct * 1.5);

    ctx.fillStyle =
      particle.color;

    ctx.fillRect(
      Math.round(
        particle.x - camX
      ),
      Math.round(
        particle.y - camY
      ),
      particle.size,
      particle.size
    );

    ctx.restore();
  }
}


function removeClosestRemoteProjectile(
  collection,
  ownerId,
  impactX,
  impactY,
  predicate = null
) {
  let bestIndex = -1;
  let bestDistanceSq = Infinity;

  for (let i = 0; i < collection.length; i++) {
    const projectile = collection[i];

    if (
      !projectile.visualOnly ||
      projectile.ownerId !== ownerId
    ) {
      continue;
    }

    if (
      predicate &&
      !predicate(projectile)
    ) {
      continue;
    }

    const dx = projectile.x - impactX;
    const dy = projectile.y - impactY;
    const distanceSq = dx * dx + dy * dy;

    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      bestIndex = i;
    }
  }

  if (bestIndex < 0) {
    return null;
  }

  const removed =
    collection.splice(bestIndex, 1)[0];

  return removed || null;
}
















const WAND_WEAPON_TYPES = Object.freeze(["wand", "rainWand", "shepherdStaff", "lostKeyWand", "sunflowerWand", "sapgemWand"]);








const FIREBALL_AIM_MIN_RANGE = 26;
const FIREBALL_AIM_MAX_RANGE = 150;
const FIREBALL_AIM_PULSE_DURATION = 1.25;
const FIREBALL_LANDING_RADIUS = 13;



















const FOCUS_FIRE_MIN_RADIUS = 30;
const FOCUS_FIRE_MAX_RADIUS = 150;
const FOCUS_FIRE_PULSE_DURATION = 1.35;
const FOCUS_FIRE_BARRAGE_DURATION = 5.0;
const FOCUS_FIRE_SHOT_INTERVAL = 0.50;
const FOCUS_FIRE_LANDING_RADIUS = 12;

































const RAIN_CLOUD_ORBIT_MAX_RADIUS = 28;
const RAIN_CLOUD_ORBIT_EXPAND_TIME = 7.0;
const RAIN_CLOUD_ORBIT_ANGULAR_SPEED = 0.72;




















function removeRemoteCasterEffectsForOwner(
  ownerId
) {
  if (!ownerId) return;

  removeRemoteRainForOwner(
    ownerId
  );

  clearTemporaryRainGrassForOwner(ownerId);

  removeRemoteJesterForOwner(
    ownerId
  );

  for (let i = focusFireOpeners.length - 1; i >= 0; i--) {
    if (
      focusFireOpeners[i].visualOnly &&
      focusFireOpeners[i].ownerId === ownerId
    ) {
      focusFireOpeners.splice(i, 1);
    }
  }

  for (let i = basicProjectiles.length - 1; i >= 0; i--) {
    if (
      basicProjectiles[i].visualOnly &&
      basicProjectiles[i].ownerId === ownerId
    ) {
      basicProjectiles.splice(i, 1);
    }
  }

  for (let i = fireballs.length - 1; i >= 0; i--) {
    if (
      fireballs[i].visualOnly &&
      fireballs[i].ownerId === ownerId
    ) {
      fireballs.splice(i, 1);
    }
  }
}



const LOCAL_TREE_REGROW_MIN_MS = 360_000;
const LOCAL_TREE_REGROW_MAX_MS = 540_000;
const LOCAL_GRASS_REGROW_MIN_MS = 180_000;
const LOCAL_GRASS_REGROW_MAX_MS = 300_000;

function randomLocalRegrowTimestamp(
  minMs,
  maxMs
) {
  return Date.now() +
    minMs +
    Math.floor(
      Math.random() *
      (maxMs - minMs + 1)
    );
}

function scheduleLocalTreeRegrow(tree) {
  if (
    tree.serverControlled ||
    tree.regrowAt > 0
  ) {
    return;
  }

  tree.regrowAt =
    randomLocalRegrowTimestamp(
      LOCAL_TREE_REGROW_MIN_MS,
      LOCAL_TREE_REGROW_MAX_MS
    );
}

function scheduleLocalGrassRegrow(clump) {
  if (
    isTemporaryRainGrass(clump) ||
    clump.serverControlled ||
    clump.regrowAt > 0
  ) {
    return;
  }

  clump.regrowAt =
    randomLocalRegrowTimestamp(
      LOCAL_GRASS_REGROW_MIN_MS,
      LOCAL_GRASS_REGROW_MAX_MS
    );
}









// -----------------------------------------------------------------------------
// LOCAL STATUS EFFECTS
// -----------------------------------------------------------------------------
// Presentation/offline state mirrors the server rules. Networked enemies still
// receive authoritative timers from snapshots, but every local interaction uses
// these helpers instead of writing burnTime/wetTime ad hoc.







































































function spawnLevelUpBurst(x, y, count = 34) {
  const colors = [
    "#ffffff", "#ffffff", "#ffffff", "#ffffff",
    "#f8fbff", "#fffced", "#eef8ff"
  ];

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 18 + Math.random() * 34;
    const life = 0.48 + Math.random() * 0.48;

    levelUpParticles.push({
      x: x + (Math.random() - 0.5) * 5,
      y: y - 9 + (Math.random() - 0.5) * 6,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 11,
      life,
      maxLife: life,
      color: colors[(Math.random() * colors.length) | 0],
      alpha: 0.38 + Math.random() * 0.62,
      size: Math.random() < 0.24 ? 2 : 1
    });
  }
}

function updateLevelUpParticles(dt) {
  for (let i = levelUpParticles.length - 1; i >= 0; i--) {
    const p = levelUpParticles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 24 * dt;
    p.vx *= 0.975;

    if (p.life <= 0) {
      levelUpParticles.splice(i, 1);
    }
  }
}

function drawLevelUpParticles(camX, camY) {
  for (const p of levelUpParticles) {
    const lifeAlpha = Math.max(0, Math.min(1, p.life / p.maxLife));
    const x = Math.round(p.x - camX);
    const y = Math.round(p.y - camY);

    ctx.save();
    ctx.globalAlpha = lifeAlpha * p.alpha;
    ctx.fillStyle = p.color;
    ctx.fillRect(x, y, p.size, p.size);
    ctx.restore();
  }
}











// Lightweight pixel-style glow.
// Uses only ordinary translucent rectangles, so it is cheap and avoids
// canvas gradient / blend-mode issues.
function drawPixelGlow(screenX, screenY, size, strength, phase = 0) {
  const safePhase = Number.isFinite(phase) ? phase : 0;
  const flicker =
    0.94 +
    Math.sin(worldTime * 15 + safePhase) * 0.04 +
    Math.sin(worldTime * 23 + safePhase * 1.6) * 0.02;

  const x = Math.round(screenX);
  const y = Math.round(screenY);
  const s = Math.max(4, Math.round(size * flicker));
  const a = Math.max(0, Math.min(0.24, strength * flicker));

  ctx.save();

  // Broad faint square.
  ctx.fillStyle = `rgba(255, 137, 45, ${a * 0.28})`;
  ctx.fillRect(
    x - s,
    y - Math.round(s * 0.72),
    s * 2,
    Math.round(s * 1.44)
  );

  // Mid glow.
  const mid = Math.max(3, Math.round(s * 0.62));
  ctx.fillStyle = `rgba(255, 170, 55, ${a * 0.42})`;
  ctx.fillRect(
    x - mid,
    y - Math.round(mid * 0.72),
    mid * 2,
    Math.round(mid * 1.44)
  );

  // Hot center.
  const inner = Math.max(2, Math.round(s * 0.30));
  ctx.fillStyle = `rgba(255, 220, 105, ${a * 0.58})`;
  ctx.fillRect(
    x - inner,
    y - inner,
    inner * 2,
    inner * 2
  );

  ctx.restore();
}



// -----------------------------------------------------------------------------
// MELEE COMBAT
// -----------------------------------------------------------------------------
// The slash arc is drawn at this radius, and this is also the sword's
// actual maximum hit range. Keeping both tied to one value means the
// visual effect accurately shows the player's reach.
const SWORD_REACH = 26;
const SWORD_HALF_ARC = 0.62;
const WAND_MASTERY_REACH = 45;
const WAND_MASTERY_HALF_ARC = 0.56;




const BOW_MELEE_TRIGGER_RANGE = 28;
const BOW_MELEE_HALF_ARC = 1.05;





function canOccupyPlayerPoint(x, y) {
  return (
    x >= 8 &&
    x <= world.width - 8 &&
    y >= 15 &&
    y <= world.height - 1 &&
    !hitsSolidObstacle(x, y)
  );
}









function drawLayerAroundPivot(
  image,
  baseX,
  baseY,
  pivotX,
  pivotY,
  angle
) {
  ctx.save();

  ctx.translate(
    Math.round(baseX + pivotX),
    Math.round(baseY + pivotY)
  );

  ctx.rotate(angle);

  ctx.drawImage(
    image,
    -pivotX,
    -pivotY
  );

  ctx.restore();
}

function rotatedLayerPoint(
  baseX,
  baseY,
  pivotX,
  pivotY,
  pointX,
  pointY,
  angle
) {
  const localX =
    pointX - pivotX;

  const localY =
    pointY - pivotY;

  const cosA =
    Math.cos(angle);

  const sinA =
    Math.sin(angle);

  return {
    x:
      baseX +
      pivotX +
      localX * cosA -
      localY * sinA,

    y:
      baseY +
      pivotY +
      localX * sinA +
      localY * cosA
  };
}

function drawPixelLine(
  x0,
  y0,
  x1,
  y1,
  color
) {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);

  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;

  let error = dx + dy;

  ctx.fillStyle = color;

  while (true) {
    ctx.fillRect(x0, y0, 1, 1);

    if (
      x0 === x1 &&
      y0 === y1
    ) {
      break;
    }

    const e2 = error * 2;

    if (e2 >= dy) {
      error += dy;
      x0 += sx;
    }

    if (e2 <= dx) {
      error += dx;
      y0 += sy;
    }
  }
}

function angleDifference(a, b) {
  let d = a - b;

  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;

  return d;
}

// -----------------------------------------------------------------------------
// ENEMY FOUNDATION / PRESENTATION
// -----------------------------------------------------------------------------
// Defined in client-enemies.js and invoked here at the exact former inline
// location to preserve asset/DOM/random initialization order.
const {
  slimeImage,
  blueSlimeImage,
  purpleSlimeImage,
  goldBabySlimeImage,
  slimeFlashImage,
  coinImage,
  arrowResourceImage,
  goldSlimeBubbleLootImage,
  woodImage,
  makeFlowerIcon,
  flowerImage,
  blueFlowerImage,
  healingPotionImage,
  attackPotionImage,
  magicPotionImage,
  makeSlime,
  slimes,
  mushroomSleepImage,
  mushroomAwakeImage,
  mushroomFlashImage,
  crabImage,
  crabBackImage,
  crabFrontImage,
  makeMushroom,
  updateMushrooms,
  makeCrab,
  updateCrabs,
  bigGoldSlimeImage,
  bigGoldSlimeBubbleImage,
  bigGoldSlimeFlashImage,
  specialResourceDrops,
  SPECIAL_RESOURCE_DROP_PROFILES,
  LOOT_PICKUP_RADIUS,
  lootPickupAnimations,
  lootPickupImage,
  spawnLootPickupAnimation,
  updateLootPickupAnimations,
  drawLootPickupAnimation,
  collectSpecialResourceDrops,
  drawSpecialResourceDrop,
  makeBigGoldSlime,
  ENEMY_ACTIVE_HANDOFF_MAX_CORRECTION_SPEED,
  ENEMY_ACTIVE_HANDOFF_DONE_DISTANCE,
  ENEMY_PASSIVE_SYNC_MAX_CORRECTION_SPEED,
  ENEMY_PASSIVE_SYNC_DONE_DISTANCE,
  updateReplicatedEnemyPosition,
  REPLICATED_ENEMY_COUNTDOWN_FIELDS,
  REPLICATED_ENEMY_COUNTDOWN_FIELD_SET,
  setReplicatedEnemyCountdown,
  applyReplicatedEnemyCountdownsFromState,
  tickReplicatedEnemyCountdowns,
  updateBigGoldSlimes,
  drawBigGoldSlimeHealthBar,
  drawBigGoldSlime,
  goblinImage,
  goblinFlashImage,
  makeGoblin,
  goblins,
  ghostImage,
  ghostFlashImage,
  makeGhost,
  ghosts,
} = buildClientEnemyFoundation();

// -----------------------------------------------------------------------------
// CONNECTED MAPS
// -----------------------------------------------------------------------------
// ARCHITECTURE NOTE:
// Map state owns persistent world objects. The arrays used by update/render are
// active views that are swapped when activateMap() runs. Transient effects are
// intentionally cleared on travel.
//
// The game still uses the same global gameplay systems. Travelling between
// maps swaps the active contents of their arrays, so chopped/burned trees and
// monster health/state remain attached to the map where they belong.
let currentMapId = "meadow";

const houses = [];

const {
  houseImage,
  spawnMapX,
  spawnMapY,
  tutorialNpc,
  hunterNpc,
  jesterNpc,
  woodCraftBench,
  classResetCrystal,
  mapStates,
} = buildClientMapRegistry();

// -----------------------------------------------------------------------------
// SHARED CONTENT -> CLIENT WORLD ENTITY REGISTRY
// -----------------------------------------------------------------------------
const rocks = [];
// Static, non-networked scenery rocks. These are map flavour only and are
// deliberately separate from the throwable authoritative `rocks` collection.
const sceneryRocks = [];

const CLIENT_ENEMY_COLLECTIONS = {
  slime: "slimes",
  mushroom: "mushrooms",
  crab: "crabs",
  goblin: "goblins",
  ghost: "ghosts",
  bigGoldSlime: "bigGoldSlimes"
};

const CLIENT_ENEMY_FACTORIES = {
  slime(spawn) {
    return makeSlime(
      spawn.x,
      spawn.y,
      spawn.phase || 0,
      spawn.wanderRadiusX ?? 26,
      spawn.wanderRadiusY ?? 18,
      spawn.level ?? 1,
      {
        variant: spawn.variant || "green",
        aggressiveOnSight: Boolean(spawn.aggressiveOnSight),
        startsDormant: false
      }
    );
  },

  mushroom(spawn) {
    return makeMushroom(
      spawn.x,
      spawn.y,
      spawn.phase || 0,
      spawn.level ?? 1
    );
  },

  crab(spawn) {
    return makeCrab(
      spawn.x,
      spawn.y,
      spawn.phase || 0,
      spawn.level ?? 2
    );
  },

  goblin(spawn) {
    return makeGoblin(
      spawn.x,
      spawn.y,
      spawn.phase || 0,
      spawn.level ?? 3
    );
  },

  ghost(spawn) {
    return makeGhost(
      spawn.x,
      spawn.y,
      spawn.phase || 0,
      spawn.level ?? 5
    );
  },

  bigGoldSlime(spawn) {
    return makeBigGoldSlime(
      spawn.x,
      spawn.y,
      spawn.phase || 0,
      spawn.level ?? 4
    );
  }
};


// -----------------------------------------------------------------------------
// GENERIC ACTIVE ENEMY RUNTIME
// -----------------------------------------------------------------------------
// Shared gameplay systems should use this registry instead of manually
// enumerating slime/goblin/ghost arrays. Species-specific AI and sprite drawing
// remain isolated behind each profile. Adding a new enemy species should mostly
// mean adding one collection/factory/profile rather than editing every skill.
const CLIENT_ENEMY_RUNTIME_PROFILES = Object.freeze({
  slime: Object.freeze({
    bodyOffsetY: -6,
    projectileHitRadius: 7,
    lockRadiusX: 8,
    lockRadiusY: 7,
    meleeBodyRadius: 5,
    horizontalMeleeBodyRadius: 6,
    rainRadiusInset: 3,
    rainEffect: "none",
    burnSpreadChance: 0.42,
    burnGlowOffsetY: -7,
    burnGlowRadius: 9,
    burnGlowAlpha: 0.12,
    damageTextOffsetY: -24,
    respawnSeconds: 30,
    expAward: 1,
    hurlable: true,
    draw: drawSlime,
    update: updateSlimes,
    updatePriority: 30,
    drawSortY(enemy) {
      if (
        enemy.carriedBy &&
        typeof onlineClient !== "undefined"
      ) {
        const carrier =
          onlineClient.playerForNetworkId(
            enemy.carriedBy
          );

        if (carrier) {
          return carrier.y + 0.25;
        }
      }

      return enemy.y;
    },
    canFocusFire(enemy) {
      return !enemy.carriedBy;
    },
    applySpawnData(enemy, spawn) {
      enemy.variant =
        spawn.variant ||
        enemy.variant ||
        "green";

      enemy.aggressiveOnSight =
        Boolean(
          spawn.aggressiveOnSight ??
          enemy.aggressiveOnSight
        );
    },
    applyNetworkSnapshot(enemy, state) {
      enemy.variant =
        state.variant ||
        enemy.variant ||
        "green";

      enemy.aggressiveOnSight =
        Boolean(
          state.aggressiveOnSight ??
          enemy.aggressiveOnSight
        );
    }
  }),

  mushroom: Object.freeze({
    bodyOffsetY: -7,
    projectileHitRadius: 7,
    lockRadiusX: 8,
    lockRadiusY: 7,
    meleeBodyRadius: 5,
    horizontalMeleeBodyRadius: 6,
    rainRadiusInset: 3,
    rainEffect: "none",
    burnSpreadChance: 0.42,
    burnGlowOffsetY: -8,
    burnGlowRadius: 9,
    burnGlowAlpha: 0.12,
    damageTextOffsetY: -25,
    respawnSeconds: 30,
    expAward: 1,
    hurlable: true,
    draw: drawMushroom,
    update: updateMushrooms,
    updatePriority: 25,
    drawSortY(enemy) {
      if (
        enemy.carriedBy &&
        typeof onlineClient !== "undefined"
      ) {
        const carrier =
          onlineClient.playerForNetworkId(
            enemy.carriedBy
          );

        if (carrier) {
          return carrier.y + 0.25;
        }
      }

      return enemy.y;
    },
    canFocusFire(enemy) {
      return !enemy.carriedBy;
    }
  }),

  crab: Object.freeze({
    bodyOffsetY: -6,
    wetSpeedMultiplier: 1.25,
    projectileHitRadius: 9,
    lockRadiusX: 14,
    lockRadiusY: 7,
    meleeBodyRadius: 7,
    horizontalMeleeBodyRadius: 12,
    rainRadiusInset: 2,
    rainEffect: "none",
    burnSpreadChance: 0.42,
    burnGlowOffsetY: -7,
    burnGlowRadius: 11,
    burnGlowAlpha: 0.12,
    damageTextOffsetY: -24,
    respawnSeconds: 32,
    expAward: 2,
    hurlable: true,
    draw: drawCrab,
    update: updateCrabs,
    updatePriority: 27,
    drawSortY(enemy) {
      if (
        enemy.carriedBy &&
        typeof onlineClient !== "undefined"
      ) {
        const carrier = onlineClient.playerForNetworkId(enemy.carriedBy);
        if (carrier) return carrier.y + 0.25;
      }
      return enemy.y;
    },
    canFocusFire(enemy) {
      return !enemy.carriedBy;
    }
  }),

  goblin: Object.freeze({
    bodyOffsetY: -11,
    projectileHitRadius: 8,
    lockRadiusX: 9,
    lockRadiusY: 10,
    meleeBodyRadius: 6,
    horizontalMeleeBodyRadius: 7,
    rainRadiusInset: 2,
    rainEffect: "none",
    burnSpreadChance: 0.42,
    burnGlowOffsetY: -12,
    burnGlowRadius: 10,
    burnGlowAlpha: 0.12,
    damageTextOffsetY: -31,
    respawnSeconds: 40,
    expAward: 2,
    hurlable: true,
    draw: drawGoblin,
    update: updateGoblins,
    updatePriority: 20,
    applyNetworkSnapshot(enemy, state) {
      // Walk/facing presentation is reconstructed locally from compact motion.
      // Lunge remains authoritative gameplay state and survives late joins.
      enemy.lungeTime = Math.max(
        0,
        Number(state.lungeTime) || 0
      );
      enemy.lungeDirX =
        Number(state.lungeDirX) || 0;
      enemy.lungeDirY =
        Number(state.lungeDirY) || 0;
    },
    onKilledLocal(enemy) {
      enemy.lungeTime = 0;
      enemy.moving = false;
    },
    canFocusFire(enemy) {
      return !enemy.carriedBy;
    },
    drawSortY(enemy) {
      return enemy.y;
    }
  }),

  ghost: Object.freeze({
    bodyOffsetY: -11,
    projectileHitRadius: 8,
    lockRadiusX: 9,
    lockRadiusY: 10,
    meleeBodyRadius: 7,
    horizontalMeleeBodyRadius: 8,
    rainRadiusInset: 2,
    rainEffect: "damage",
    burnSpreadChance: 0.38,
    burnGlowOffsetY: -12,
    burnGlowRadius: 11,
    burnGlowAlpha: 0.13,
    damageTextOffsetY: -31,
    respawnSeconds: 50,
    expAward: 5,
    hurlable: false,
    draw: drawGhost,
    update: updateGhosts,
    updatePriority: 10,
    drawSortY(enemy) {
      return enemy.y + 7;
    },
    belongsToCurrentMap(enemy) {
      return naturalEnemyBelongsToCurrentMap(enemy);
    }
  }),

  bigGoldSlime: Object.freeze({
    bodyOffsetY: -10,
    projectileHitRadius: 12,
    lockRadiusX: 13,
    lockRadiusY: 12,
    meleeBodyRadius: 10,
    horizontalMeleeBodyRadius: 11,
    rainRadiusInset: 0,
    rainEffect: "none",
    burnSpreadChance: 0.42,
    burnGlowOffsetY: -12,
    burnGlowRadius: 13,
    burnGlowAlpha: 0.14,
    damageTextOffsetY: -36,
    respawnSeconds: 90,
    expAward: 10,
    hurlable: false,
    draw: drawBigGoldSlime,
    update: updateBigGoldSlimes,
    updatePriority: 35,
    drawSortY(enemy) {
      return enemy.y;
    }
  })
});

function enemyProfileForType(enemyType) {
  return (
    CLIENT_ENEMY_RUNTIME_PROFILES[enemyType] ||
    null
  );
}

function enemyCollectionForMap(
  mapId,
  enemyType
) {
  const collectionName =
    CLIENT_ENEMY_COLLECTIONS[enemyType];

  if (!collectionName) return [];

  const state = mapStates[mapId];
  if (!state) return [];

  return Array.isArray(state[collectionName])
    ? state[collectionName]
    : [];
}

function currentEnemyCollection(enemyType) {
  return enemyCollectionForMap(
    currentMapId,
    enemyType
  );
}

function enemyTypeOf(enemy) {
  if (!enemy) return null;

  if (
    typeof enemy.networkType === "string" &&
    CLIENT_ENEMY_COLLECTIONS[enemy.networkType]
  ) {
    return enemy.networkType;
  }

  for (
    const enemyType
    of Object.keys(CLIENT_ENEMY_COLLECTIONS)
  ) {
    if (
      currentEnemyCollection(enemyType)
        .includes(enemy)
    ) {
      return enemyType;
    }
  }

  return null;
}

function enemyProfile(enemy) {
  return enemyProfileForType(
    enemyTypeOf(enemy)
  );
}

function ensureEnemyHurlState(enemy) {
  if (!enemy) return enemy;

  enemy.carriedBy =
    typeof enemy.carriedBy === "string"
      ? enemy.carriedBy
      : null;
  enemy.pickupTime = Math.max(0, Number(enemy.pickupTime) || 0);
  enemy.pickupDuration = Math.max(0.01, Number(enemy.pickupDuration) || 0.18);
  enemy.pickupDirX = Number(enemy.pickupDirX) || 0;
  enemy.pickupDirY = Number(enemy.pickupDirY) || 0;
  enemy.hurlTime = Math.max(0, Number(enemy.hurlTime) || 0);
  enemy.hurlDuration = Math.max(0.01, Number(enemy.hurlDuration) || 0.58);
  return enemy;
}

function enemyIsHurlable(enemy) {
  const profile = enemyProfile(enemy);
  return Boolean(
    enemy &&
    enemy.alive &&
    profile &&
    (
      typeof enemy.hurlable === "boolean"
        ? enemy.hurlable
        : profile.hurlable !== false
    )
  );
}

function activeEnemyRecords({
  aliveOnly = false
} = {}) {
  const records = [];

  for (
    const enemyType
    of Object.keys(CLIENT_ENEMY_COLLECTIONS)
  ) {
    const profile =
      enemyProfileForType(enemyType);

    if (!profile) continue;

    for (
      const enemy
      of currentEnemyCollection(enemyType)
    ) {
      if (!enemy) continue;
      if (aliveOnly && !enemy.alive) continue;
      if (
        profile.belongsToCurrentMap &&
        !profile.belongsToCurrentMap(enemy)
      ) {
        continue;
      }

      records.push({
        enemy,
        type: enemyType,
        profile
      });
    }
  }

  return records;
}

function enemyBodyPoint(enemy) {
  const profile = enemyProfile(enemy);

  return {
    x: enemy?.x || 0,
    y:
      (enemy?.y || 0) +
      (profile?.bodyOffsetY || 0)
  };
}

function sendEnemyAction(
  enemy,
  action,
  payload = {}
) {
  if (
    !enemy ||
    typeof onlineClient === "undefined"
  ) {
    return false;
  }

  const type = enemyTypeOf(enemy);
  if (!type) return false;

  return Boolean(
    onlineClient.sendSharedEnemyAction(
      type,
      action,
      enemy,
      payload
    )
  );
}






function redirectEnemy(
  enemy,
  x,
  y,
  duration = JESTER_CLONE_DURATION,
  cloneId = null
) {
  if (!enemy?.alive) return;

  sendEnemyAction(
    enemy,
    "redirect",
    {
      x,
      y,
      duration,
      cloneId
    }
  );
}




function createClientEnemyFromWorldSpawn(
  mapId,
  spawn
) {
  const factory =
    CLIENT_ENEMY_FACTORIES[spawn.type];

  if (!factory) {
    console.warn(
      "Unsupported shared enemy type:",
      spawn.type
    );
    return null;
  }

  const entity = factory(spawn);
  ensureEnemyHurlState(entity);
  if (typeof spawn.hurlable === "boolean") {
    entity.hurlable = spawn.hurlable;
  }

  entity.entityId = spawn.id;
  entity.level =
    Number.isFinite(spawn.level)
      ? spawn.level
      : entity.level;
  const runtimeProfile =
    enemyProfileForType(spawn.type);

  if (
    runtimeProfile?.applySpawnData
  ) {
    runtimeProfile.applySpawnData(
      entity,
      spawn
    );
  }

  entity.networkType = spawn.type;
  entity.networkMapId = mapId;
  entity.serverControlled = true;

  return entity;
}

function applySharedWorldContentToClientMaps() {
  if (
    typeof WORLD_CONTENT === "undefined" ||
    !WORLD_CONTENT.maps
  ) {
    throw new Error(
      "WORLD_CONTENT failed to load"
    );
  }

  for (
    const [mapId, definition]
    of Object.entries(WORLD_CONTENT.maps)
  ) {
    const state = mapStates[mapId];

    if (!state) {
      // The terrain/portal definition for a brand-new map is still client
      // content. Once it exists, enemy networking needs no map-specific code.
      console.warn(
        `WORLD_CONTENT map "${mapId}" has no client mapState yet`
      );
      continue;
    }

    for (
      const [, collectionName]
      of Object.entries(
        CLIENT_ENEMY_COLLECTIONS
      )
    ) {
      state[collectionName] = [];
    }

    for (
      const spawn
      of definition.enemySpawns || []
    ) {
      const collectionName =
        CLIENT_ENEMY_COLLECTIONS[spawn.type];

      if (!collectionName) continue;

      if (!Array.isArray(state[collectionName])) {
        state[collectionName] = [];
      }

      const entity =
        createClientEnemyFromWorldSpawn(
          mapId,
          spawn
        );

      if (entity) {
        state[collectionName].push(entity);
      }
    }
  }
}

function reconcileSharedEnemiesForMap(mapId) {
  const state =
    mapStates[mapId];

  const definition =
    typeof WORLD_CONTENT !== "undefined"
      ? WORLD_CONTENT.maps?.[mapId]
      : null;

  if (!state || !definition) {
    return;
  }

  for (
    const [enemyType, collectionName]
    of Object.entries(
      CLIENT_ENEMY_COLLECTIONS
    )
  ) {
    const currentCollection =
      state[collectionName] || [];

    const existingById =
      new Map(
        currentCollection
          .filter(enemy => enemy.entityId)
          .map(enemy => [
            enemy.entityId,
            enemy
          ])
      );

    const rebuilt = [];

    for (
      const spawn
      of definition.enemySpawns || []
    ) {
      if (spawn.type !== enemyType) {
        continue;
      }

      let entity =
        existingById.get(spawn.id);

      if (!entity) {
        entity =
          createClientEnemyFromWorldSpawn(
            mapId,
            spawn
          );
      }

      if (!entity) continue;

      // Reassert identity every activation. This prevents stale objects from
      // an old map from being rendered through the active-array view.
      entity.entityId = spawn.id;
      if (typeof spawn.hurlable === "boolean") {
        entity.hurlable = spawn.hurlable;
      }
      const runtimeProfile =
        enemyProfileForType(enemyType);

      if (
        runtimeProfile?.applySpawnData
      ) {
        runtimeProfile.applySpawnData(
          entity,
          spawn
        );
      }

      entity.networkType = enemyType;
      entity.networkMapId = mapId;
      entity.serverControlled = true;

      rebuilt.push(entity);
    }

    state[collectionName] =
      rebuilt;
  }
}

function naturalEnemyBelongsToCurrentMap(
  enemy
) {
  if (!enemy) return false;

  return (
    !enemy.networkMapId ||
    enemy.networkMapId ===
      currentMapId
  );
}

function clientEnemyCollectionFor(
  mapId,
  enemyType
) {
  const state = mapStates[mapId];

  const collectionName =
    CLIENT_ENEMY_COLLECTIONS[enemyType];

  if (!state || !collectionName) {
    return [];
  }

  return state[collectionName] || [];
}

function findClientWorldEnemy(
  enemyId,
  enemyType = null,
  mapId = null
) {
  if (mapId && enemyType) {
    return (
      clientEnemyCollectionFor(
        mapId,
        enemyType
      ).find(entity =>
        entity.entityId === enemyId
      ) || null
    );
  }

  for (const candidateMapId of Object.keys(mapStates)) {
    const types = enemyType
      ? [enemyType]
      : Object.keys(CLIENT_ENEMY_COLLECTIONS);

    for (const type of types) {
      const found =
        clientEnemyCollectionFor(
          candidateMapId,
          type
        ).find(entity =>
          entity.entityId === enemyId
        );

      if (found) {
        return found;
      }
    }
  }

  return null;
}


function replaceActiveArray(activeArray, mapArray) {
  activeArray.splice(0, activeArray.length, ...mapArray);
}

// -----------------------------------------------------------------------------
// ENTITY IDENTITY / GAME STATE
// -----------------------------------------------------------------------------
// entityId stays separate from species-specific gameplay state and IDs.
// That means networking can gain stable identifiers without changing any
// current combat or persistence behavior.
function ensureEntityId(entity, entityId) {
  if (!entity || entity.entityId) return entity;
  entity.entityId = entityId;
  return entity;
}

function assignPersistentEntityIds() {
  ensureEntityId(player, "player:local");

  for (const [mapId, state] of Object.entries(mapStates)) {
    const collections = [
      ["tree", state.trees],
      ["grass", state.tallGrass],
      ["rock", state.rocks || []],
      ["flower", state.harvestFlowers],
      ["slime", state.slimes],
      ["ghost", state.ghosts],
      ["goblin", state.goblins],
      ["house", state.houses || []]
    ];

    for (const [type, collection] of collections) {
      collection.forEach((entity, index) => {
        ensureEntityId(entity, `${mapId}:${type}:${index + 1}`);
      });
    }
  }
}

function makeNetworkEntitySnapshot(entity, fields) {
  const snapshot = {
    id: entity.entityId || null
  };

  for (const field of fields) {
    snapshot[field] = entity[field];
  }

  return snapshot;
}

class GameState {
  constructor() {
    this.tick = 0;
  }

  get currentMapId() {
    return currentMapId;
  }

  get currentMap() {
    return mapStateForCurrentMap();
  }

  get player() {
    return player;
  }

  advanceTick() {
    this.tick += 1;
  }

  // Pure JSON-safe state. This is intentionally presentation-free and is the
  // shape we can later evolve into server -> client state synchronization.
  toNetworkSnapshot() {
    return {
      tick: this.tick,
      mapId: currentMapId,

      player: makeNetworkEntitySnapshot(player, [
        "x",
        "y",
        "hp",
        "maxHp",
        "level",
        "weaponIndex",
        "hatIndex",
        "shirtIndex",
        "pantsIndex",
        "burnTime",
        "wetTime",
        "shadowHidden",
        "pvpEnabled"
      ]),

      entities: {
        slimes: slimes.map(entity =>
          makeNetworkEntitySnapshot(
            entity,
            ["x", "y", "hp", "alive", "burnTime"]
          )
        ),

        goblins: goblins.map(entity =>
          makeNetworkEntitySnapshot(
            entity,
            ["x", "y", "hp", "alive", "burnTime"]
          )
        ),

        ghosts: ghosts.map(entity =>
          makeNetworkEntitySnapshot(
            entity,
            ["x", "y", "hp", "alive", "burnTime"]
          )
        ),


        houses: houses.map(entity =>
          makeNetworkEntitySnapshot(entity, ["x", "y"])
        )
      }
    };
  }
}

// -----------------------------------------------------------------------------
// ONLINE CLIENT
// -----------------------------------------------------------------------------
// Phase 1 networking synchronizes player presence/state. The existing monsters,
// trees, drops, and environmental simulation remain client-local for now.

const NETWORK_SNAP_DISTANCE = 96;

function shouldSnapNetworkPosition(
  x,
  y,
  targetX,
  targetY,
  force = false
) {
  if (force) return true;

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(targetX) ||
    !Number.isFinite(targetY)
  ) {
    return true;
  }

  const dx = targetX - x;
  const dy = targetY - y;

  return (
    dx * dx + dy * dy >=
    NETWORK_SNAP_DISTANCE *
    NETWORK_SNAP_DISTANCE
  );
}



installClientEnemyRuntime(OnlineClient);



const ACTIVE_MAP_COLLECTIONS = [
  [trees, "trees"],
  [tallGrass, "tallGrass"],
  [rocks, "rocks"],
  [sceneryRocks, "sceneryRocks"],
  [harvestFlowers, "harvestFlowers"],
  [slimes, "slimes"],
  [ghosts, "ghosts"],
  [goblins, "goblins"],
  [houses, "houses"]
];

function loadActiveMapCollections(state) {
  for (const [activeArray, stateKey] of ACTIVE_MAP_COLLECTIONS) {
    replaceActiveArray(activeArray, state[stateKey] || []);
  }
}

function mapStateForCurrentMap() {
  return mapStates[currentMapId];
}

function setRespawnButtonVisible(visible) {
  const button = document.getElementById("respawnButton");
  if (!button) return;
  button.style.display = visible ? "block" : "none";
  button.disabled = !visible;
}

function removeLocalCasterEffectsOnDeath() {
  cancelHunterSnarePlacement(false);
  clearFocusFireState(true);
  player.focusFireCharging = false;
  player.focusFireOpening = false;
  player.focusFireActive = false;
  player.fireballAiming = false;
  player.fireballAimTime = 0;
  player.fireballBoundKey = null;
  player.fireballAimMapId = null;

  // Local caster effects have no `visualOnly` flag. Preserve remote-player
  // effects while immediately deleting everything owned by the dead player.
  for (const collection of [
    fireballs,
    basicProjectiles,
    focusFireOpeners
  ]) {
    for (let i = collection.length - 1; i >= 0; i--) {
      if (!collection[i]?.visualOnly) {
        collection.splice(i, 1);
      }
    }
  }

  endLocalRainCloud({ startCooldown: true });

  clearTemporaryRainGrass();
  endLocalHallucination({ burst: false, startCooldown: false });
  player.bowDrawing = false;
  player.bowDrawAmount = 0;
  player.bowReleaseTime = 0;
  player.attackTime = 0;
  player.attackCooldown = 0;
  player.slashTime = 0;
  player.shadowCritAttack = false;
  player.hurlReachTime = 0;

  clearCamouflageState(false);
  player.shadowHidden = false;
  player.shadowHideRevealTime = 0;
  player.wetTime = 0;
  player.burnTime = 0;
  player.burnTickTimer = 0;

  inputController.clearCommands();
}

function handlePlayerDeath() {
  const firstDeathFrame = !player.isDead;

  player.hp = 0;
  player.isDead = true;
  player.knockbackX = 0;
  player.knockbackY = 0;
  player.contactCooldown = 0;
  player.walkTime = 0;
  player.wasMoving = false;

  if (firstDeathFrame) {
    removeLocalCasterEffectsOnDeath();
    inputController.clearKeys();

    if (typeof onlineClient !== "undefined") {
      onlineClient.sendLocalState(true);
    }
  }

  setRespawnButtonVisible(true);
}

function completePlayerRespawn(serverState = null) {
  player.isDead = false;
  player.hp = Number.isFinite(serverState?.hp)
    ? serverState.hp
    : player.maxHp;
  player.maxHp = Number.isFinite(serverState?.maxHp)
    ? serverState.maxHp
    : player.maxHp;

  player.knockbackX = 0;
  player.knockbackY = 0;
  player.contactCooldown = 0.8;
  player.walkTime = 0;
  player.wasMoving = false;
  player.burnTime = 0;
  player.burnTickTimer = 0;
  player.wetTime = 0;
  player.shadowHidden = false;
  player.shadowHideRevealTime = 0;

  activateMap("spawn", "center");

  if (serverState) {
    if (Number.isFinite(serverState.x)) player.x = serverState.x;
    if (Number.isFinite(serverState.y)) player.y = serverState.y;
  }

  inputController.clearKeys();
  inputController.clearCommands();
  setRespawnButtonVisible(false);
}

function requestPlayerRespawnFromUi() {
  if (!player.isDead) return;

  const requested =
    typeof onlineClient !== "undefined" &&
    onlineClient?.connected &&
    onlineClient.notifyRespawn();

  if (!requested) {
    completePlayerRespawn();
  }
}

document.getElementById("respawnButton")?.addEventListener(
  "click",
  requestPlayerRespawnFromUi
);

function clearTransientWorldEffects() {
  cancelHunterSnarePlacement(false);
  cancelRainCloudCast();
  fireballs.length = 0;
  fireParticles.length = 0;
  wandSweepParticles.length = 0;
  basicProjectiles.length = 0;
  focusFireOpeners.length = 0;
  clearFocusFireState(false);
  endLocalRainCloud({ startCooldown: true });
  // Remote copies are map-local visuals and can be dropped immediately.
  for (let i = rainClouds.length - 1; i >= 0; i--) {
    if (rainClouds[i]?.visualOnly) rainClouds.splice(i, 1);
  }
  clearTemporaryRainGrass();
  shadowSmokeParticles.length = 0;
  endLocalHallucination({ burst: false, startCooldown: false });
  remoteJesterClones.length = 0;
  jesterConfetti.length = 0;
  levelUpParticles.length = 0;
  jesterAfterimages.length = 0;

  // Pickups remain local to the place where they were dropped. For now,
  // travelling clears loose timed drops rather than carrying world objects
  // through the transition.
  coins.length = 0;
  woodDrops.length = 0;
  flowerDrops.length = 0;
  specialResourceDrops.length = 0;
  lootPickupAnimations.length = 0;

  damageNumbers.length = 0;
  floatingTexts.length = 0;
  potionUseEffects.length = 0;
}

let pendingMapEnemySyncId = null;
let suppressedEnemyRenderMapId = null;
let mapEnemySyncFallbackTimer = null;

// Map changes are presented as one atomic scene load:
// old map -> quick cover -> authoritative enemy snapshot -> quick reveal.
// The cover/reveal are intentionally short presentation transitions; there is
// no arbitrary network wait beyond the actual snapshot synchronization.
const MAP_TRANSITION_COVER_DURATION = 0.08;
const MAP_TRANSITION_REVEAL_DURATION = 0.10;
let mapTransitionPhase = "idle";
let mapTransitionAlpha = 0;
let pendingMapTransition = null;

function beginMapEnemySync(mapId) {
  if (!onlineClient?.connected) {
    pendingMapEnemySyncId = null;
    suppressedEnemyRenderMapId = null;
    return;
  }

  pendingMapEnemySyncId = mapId;
  suppressedEnemyRenderMapId = mapId;

  if (mapEnemySyncFallbackTimer) {
    clearTimeout(mapEnemySyncFallbackTimer);
  }

  // Normal release comes from the server's snapshot-batch completion marker.
  // This safety valve only prevents the transition from remaining covered
  // forever if the connection drops halfway through a map change.
  mapEnemySyncFallbackTimer = setTimeout(() => {
    finishMapEnemySync(mapId);
  }, 1200);
}

function finishMapEnemySync(mapId) {
  if (pendingMapEnemySyncId !== mapId) return;

  pendingMapEnemySyncId = null;

  if (suppressedEnemyRenderMapId === mapId) {
    suppressedEnemyRenderMapId = null;
  }

  if (mapEnemySyncFallbackTimer) {
    clearTimeout(mapEnemySyncFallbackTimer);
    mapEnemySyncFallbackTimer = null;
  }

  if (
    mapTransitionPhase === "syncing" &&
    currentMapId === mapId
  ) {
    mapTransitionPhase = "revealing";
    mapTransitionAlpha = 1;
  }
}

function cancelPendingMapEnemySync() {
  pendingMapEnemySyncId = null;
  suppressedEnemyRenderMapId = null;

  if (mapEnemySyncFallbackTimer) {
    clearTimeout(mapEnemySyncFallbackTimer);
    mapEnemySyncFallbackTimer = null;
  }

  // A disconnect during the covered sync phase must never strand the player
  // behind a permanent dark screen. Reveal the locally initialized scene; the
  // normal reconnect path will resume authoritative synchronization afterward.
  if (mapTransitionPhase === "syncing") {
    mapTransitionPhase = "revealing";
    mapTransitionAlpha = 1;
  }
}

function shouldRenderCurrentMapEnemies() {
  return suppressedEnemyRenderMapId !== currentMapId;
}

function sharedPlayerSpawnPoint(mapId, spawnId) {
  if (!spawnId) return null;

  const spawns = WORLD_CONTENT?.maps?.[mapId]?.playerSpawns;
  if (!Array.isArray(spawns)) return null;

  return spawns.find(spawn => spawn?.id === spawnId) || null;
}

function sharedDefaultPlayerSpawnId(mapId) {
  const map = WORLD_CONTENT?.maps?.[mapId];
  const spawnId = typeof map?.defaultPlayerSpawnId === "string" ? map.defaultPlayerSpawnId : "";
  return sharedPlayerSpawnPoint(mapId, spawnId) ? spawnId : "center";
}

function sharedDefaultPlayerLoadTarget() {
  const configured = WORLD_CONTENT?.defaultPlayerLoad;
  if (
    configured &&
    typeof configured.mapId === "string" &&
    typeof configured.spawnId === "string" &&
    mapStates[configured.mapId] &&
    sharedPlayerSpawnPoint(configured.mapId, configured.spawnId)
  ) {
    return { mapId: configured.mapId, spawnId: configured.spawnId };
  }

  // Compatibility with the short-lived v329 per-map marker shape.
  for (const mapId of Object.keys(WORLD_CONTENT?.maps || {})) {
    const spawnId = sharedDefaultPlayerSpawnId(mapId);
    if (spawnId !== "center" && sharedPlayerSpawnPoint(mapId, spawnId)) {
      return { mapId, spawnId };
    }
  }

  return { mapId: "spawn", spawnId: "center" };
}

function requestMapTransition(mapId, entrySide) {
  if (!mapStates[mapId]) return false;
  if (mapTransitionPhase !== "idle") return false;

  // Map changes are authoritative multiplayer state. Local simulation is
  // allowed to keep rendering while the connection is down, but crossing a
  // portal must wait until the server is available again.
  if (!onlineClient?.connected) {
    return false;
  }

  pendingMapTransition = { mapId, entrySide };
  mapTransitionPhase = "covering";
  mapTransitionAlpha = 0;
  inputController.clearCommands();
  player.walkTime = 0;
  player.wasMoving = false;
  return true;
}

function updateSharedMapPortalConnection() {
  const portals = WORLD_CONTENT?.maps?.[currentMapId]?.portals;
  if (!Array.isArray(portals) || portals.length === 0) return false;

  for (const portal of portals) {
    const x = Number(portal?.x);
    const y = Number(portal?.y);
    const width = Number(portal?.width);
    const height = Number(portal?.height);

    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {
      continue;
    }

    const inside =
      player.x >= x &&
      player.x <= x + width &&
      player.y >= y &&
      player.y <= y + height;

    if (!inside) continue;

    return requestMapTransition(
      portal.targetMapId,
      portal.targetSpawnId
    );
  }

  return false;
}

function updateMapTransition(dt) {
  if (mapTransitionPhase === "idle") return false;

  if (mapTransitionPhase === "covering") {
    mapTransitionAlpha = Math.min(
      1,
      mapTransitionAlpha + dt / MAP_TRANSITION_COVER_DURATION
    );

    if (mapTransitionAlpha >= 1) {
      const target = pendingMapTransition;
      pendingMapTransition = null;

      // A transition may have started a fraction of a second before the
      // socket closed. Do not complete it locally after authority is lost.
      if (!onlineClient?.connected) {
        mapTransitionPhase = "revealing";
        mapTransitionAlpha = 1;
        return true;
      }

      mapTransitionPhase = "syncing";

      if (target) {
        activateMap(target.mapId, target.entrySide);
      }

      if (pendingMapEnemySyncId === null) {
        mapTransitionPhase = "revealing";
      }
    }

    return true;
  }

  if (mapTransitionPhase === "syncing") {
    mapTransitionAlpha = 1;
    return true;
  }

  if (mapTransitionPhase === "revealing") {
    mapTransitionAlpha = Math.max(
      0,
      mapTransitionAlpha - dt / MAP_TRANSITION_REVEAL_DURATION
    );

    if (mapTransitionAlpha <= 0) {
      mapTransitionAlpha = 0;
      mapTransitionPhase = "idle";
    }

    return true;
  }

  mapTransitionPhase = "idle";
  mapTransitionAlpha = 0;
  return false;
}

function drawMapTransitionCover() {
  if (mapTransitionAlpha <= 0) return;

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, mapTransitionAlpha));
  ctx.fillStyle = "#101510";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.restore();
}

function activateMap(mapId, entrySide) {
  const state = mapStates[mapId];
  if (!state) return;

  const previousMapId = currentMapId;
  if (previousMapId !== mapId) {
    beginMapEnemySync(mapId);
  }

  currentMapId = mapId;
  activeWorldDimensionMapId = mapId;
  clearCamouflageState(false);

  // Ensure this map's natural enemy objects exactly match the shared registry
  // before replacing the active collection views.
  reconcileSharedEnemiesForMap(
    mapId
  );

  loadActiveMapCollections(state);

  if (
    mapId === "meadow" ||
    mapId === "ghostGrove"
  ) {
    console.log(
      `Activated ${mapId}:`,
      {
        ghosts:
          ghosts.map(ghost => ({
            id: ghost.entityId,
            mapId:
              ghost.networkMapId,
            alive:
              ghost.alive
          }))
      }
    );
  }

  pond.x = state.pond.x;
  pond.y = state.pond.y;
  pond.width = state.pond.width;
  pond.height = state.pond.height;

  clearTransientWorldEffects();

  // Shared drops are reconstructed by the normal online update loop after
  // startup, so no networking access belongs in this startup-safe function.
  player.knockbackX = 0;
  player.knockbackY = 0;
  player.contactCooldown = Math.max(player.contactCooldown, 0.35);

  // Editor-authored maps name their entry points explicitly. Legacy maps still
  // fall through to the historical side-based entry rules below.
  const sharedSpawn = sharedPlayerSpawnPoint(mapId, entrySide);

  // Enter just inside the opposite side so one movement frame cannot
  // immediately bounce the player back through the connection.
  if (sharedSpawn) {
    player.x = Number(sharedSpawn.x) || 0;
    player.y = Number(sharedSpawn.y) || 0;
  } else if (entrySide === "center") {
    player.x = world.width / 2;
    player.y = world.height / 2;
  } else if (entrySide === "west") {
    player.x = 26;
    player.y = 200;
  } else if (entrySide === "spawnWest") {
    player.x = 26;
    player.y = spawnMapY(200);
  } else if (entrySide === "spawnEast") {
    player.x = world.width - 30;
    player.y = spawnMapY(200);
  } else if (entrySide === "prototypeEast") {
    const layout = getPrototypeIslandLayout(mapId);
    if (layout?.eastBridge) {
      player.x = layout.eastBridge.x + layout.eastBridge.width - 14;
      player.y = layout.eastBridge.y + Math.round(layout.eastBridge.height / 2);
    } else {
      player.x = world.width - 26;
      player.y = 200;
    }
  } else if (entrySide === "prototypeWest") {
    const layout = getPrototypeIslandLayout(mapId);
    if (layout?.westBridge) {
      player.x = layout.westBridge.x + 14;
      player.y = layout.westBridge.y + Math.round(layout.westBridge.height / 2);
    } else {
      player.x = 26;
      player.y = 200;
    }
  } else if (entrySide === "north") {
    player.x = world.width / 2;
    player.y = 26;
  } else if (entrySide === "south") {
    player.x = world.width / 2;
    player.y = world.height - 26;
  } else {
    player.x = world.width - 26;
    player.y = 200;
  }

  // Map entry is latency-sensitive because the transition stays covered until
  // the server returns the authoritative enemy snapshot. Do not wait for the
  // routine 10 Hz player heartbeat to tell the server which map we entered.
  if (previousMapId !== mapId && onlineClient?.connected) {
    onlineClient.sendLocalState(true);
  }
}

function updateMapConnection() {
  // Maps that define explicit portal rectangles own their connections entirely
  // through shared map data. This is the path the visual editor will author.
  if (updateSharedMapPortalConnection()) {
    return;
  }

  const horizontalGateCenterY =
    currentMapId === "spawn"
      ? spawnMapY(200)
      : 200;
  const insideHorizontalGate =
    player.y >= horizontalGateCenterY - 26 &&
    player.y <= horizontalGateCenterY + 26;

  const verticalGateCenter = world.width / 2;
  const insideVerticalGate =
    player.x >= verticalGateCenter - 44 &&
    player.x <= verticalGateCenter + 44;

  // Safe spawn clearing -> Slime Meadow.
  if (
    currentMapId === "spawn" &&
    insideHorizontalGate &&
    player.x <= 9
  ) {
    requestMapTransition(
      "prototypeIsland",
      "eastBridge"
    );
    return;
  }

  if (
    currentMapId === "spawn" &&
    insideHorizontalGate &&
    player.x >= world.width - 12
  ) {
    requestMapTransition(
      "meadow",
      "west"
    );
    return;
  }

  // Prototype Island / West connections are now defined by WORLD_CONTENT
  // portal rectangles above, so no map-specific coordinate code lives here.

  if (currentMapId === "meadow") {
    if (
      insideHorizontalGate &&
      player.x <= 9
    ) {
      requestMapTransition(
        "spawn",
        "spawnEast"
      );
      return;
    }

    if (
      insideHorizontalGate &&
      player.x >= world.width - 9
    ) {
      requestMapTransition(
        "goblinWoods",
        "west"
      );
      return;
    }

    if (
      insideVerticalGate &&
      player.y <= 16
    ) {
      requestMapTransition(
        "ghostGrove",
        "south"
      );
      return;
    }

    if (
      insideVerticalGate &&
      player.y >= world.height - 9
    ) {
      requestMapTransition(
        "hunterHollow",
        "north"
      );
      return;
    }
  }

  if (currentMapId === "hunterHollow") {
    if (
      insideVerticalGate &&
      player.y <= 16
    ) {
      requestMapTransition(
        "meadow",
        "south"
      );
      return;
    }

    if (
      insideVerticalGate &&
      player.y >= world.height - 9
    ) {
      requestMapTransition(
        "goldSlimeDen",
        "north"
      );
      return;
    }
  }

  if (
    currentMapId === "goldSlimeDen" &&
    insideVerticalGate &&
    player.y <= 16
  ) {
    requestMapTransition(
      "hunterHollow",
      "south"
    );
    return;
  }

  // Goblin Woods -> Slime Meadow.
  if (
    currentMapId === "goblinWoods" &&
    insideHorizontalGate &&
    player.x <= 9
  ) {
    requestMapTransition(
      "meadow",
      "east"
    );
    return;
  }

  // Ghost Grove -> Slime Meadow.
  if (
    currentMapId === "ghostGrove" &&
    insideVerticalGate &&
    player.y >= world.height - 9
  ) {
    requestMapTransition(
      "meadow",
      "north"
    );
  }
}

function drawMapConnection(camX, camY) {
  const gateY = currentMapId === "spawn" ? spawnMapY(200) : 200;
  const screenY = Math.round(gateY - camY);

  function drawHorizontalPath(x, width) {
    ctx.fillStyle = "#77934f";
    ctx.fillRect(x, screenY - 12, width, 25);

    ctx.fillStyle = "#9a8352";
    ctx.fillRect(x, screenY - 9, width, 18);

    ctx.fillStyle = "#b09a63";
    ctx.fillRect(x + 8, screenY - 5, 12, 2);
    ctx.fillRect(x + Math.max(20, width - 25), screenY + 4, 11, 2);
  }

  function drawVerticalPath(y, height) {
    const screenX =
      Math.round(
        world.width / 2 - camX
      );

    ctx.fillStyle = "#77934f";
    ctx.fillRect(
      screenX - 12,
      y,
      25,
      height
    );

    ctx.fillStyle = "#9a8352";
    ctx.fillRect(
      screenX - 9,
      y,
      18,
      height
    );

    ctx.fillStyle = "#b09a63";
    ctx.fillRect(
      screenX - 5,
      y + 8,
      2,
      11
    );

    ctx.fillRect(
      screenX + 4,
      y + Math.max(
        20,
        height - 25
      ),
      2,
      11
    );
  }

  if (currentMapId === "spawn") {
    // Quiet path from the house area through the middle of the safe clearing
    // and out the east gate.
    const pathStart = Math.round(spawnMapX(267) - camX);
    const pathEnd = Math.round(world.width - camX);
    drawHorizontalPath(pathStart, pathEnd - pathStart);

    // Small west path for the new prototype-island exit.
    const westEdgeX = Math.round(-camX);
    drawHorizontalPath(westEdgeX, 48);
    return;
  }

  if (isPrototypeIslandMap(currentMapId)) {
    // The island sections use simple grass bridges instead of dirt paths.
    return;
  }

  if (currentMapId === "meadow") {
    // WEST -> safe spawn.
    const westEdgeX = Math.round(-camX);
    drawHorizontalPath(westEdgeX, 48);

    // EAST -> Goblin Woods.
    const eastEdgeX = Math.round(world.width - camX);
    drawHorizontalPath(eastEdgeX - 48, 48);

    // NORTH -> Ghost Grove.
    drawVerticalPath(
      Math.round(-camY),
      48
    );

    return;
  }

  if (currentMapId === "goblinWoods") {
    // Goblin Woods WEST -> Meadow.
    const westEdgeX = Math.round(-camX);
    drawHorizontalPath(westEdgeX, 48);
    return;
  }

  if (currentMapId === "ghostGrove") {
    // Ghost Grove SOUTH -> Meadow.
    const southEdgeY =
      Math.round(
        world.height - camY
      );

    drawVerticalPath(
      southEdgeY - 48,
      48
    );
  }
}

const damageNumbers = [];

// Tiny hand-built 3x5 bitmap digits so the damage text stays genuinely
// chunky/pixel-art instead of becoming blurry browser text.
const DAMAGE_DIGITS = {
  "0": ["111","101","101","101","111"],
  "1": ["010","110","010","010","111"],
  "2": ["111","001","111","100","111"],
  "3": ["111","001","111","001","111"],
  "4": ["101","101","111","001","001"],
  "5": ["111","100","111","001","111"],
  "6": ["111","100","111","101","111"],
  "7": ["111","001","010","010","010"],
  "8": ["111","101","111","101","111"],
  "9": ["111","101","111","001","111"],
  "!": ["010","010","010","000","010"]
};

function spawnDamageNumber(x, y, value, options = {}) {
  // Floating combat text is disposable presentation. Background tabs can have
  // animation frames throttled for seconds at a time, so never queue numbers
  // that would only explode onto the screen when the user returns.
  if (document.hidden) return;

  const duration = options.duration ?? 0.72;
  damageNumbers.push({
    x,
    y,
    value: String(value),
    life: duration,
    duration,
    createdAtMs: Date.now(),
    driftX: (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 2),
    critical: !!options.critical
  });
}

function updateDamageNumbers(dt) {
  for (let i = damageNumbers.length - 1; i >= 0; i--) {
    const n = damageNumbers[i];
    n.life -= dt;
    n.y -= 15 * dt;
    n.x += n.driftX * dt;

    if (n.life <= 0) {
      damageNumbers.splice(i, 1);
    }
  }
}

function drawPixelDamageNumber(number, camX, camY) {
  const age = number.duration - number.life;

  const critical = !!number.critical;

  // Criticals use the same chunky pixel size as normal damage.
  // The red color and trailing ! provide the emphasis.
  const scale = age < 0.09 ? 3 : 2;
  const drawScale = scale;
  const digitWidth = 3 * drawScale;
  const digitGap = drawScale;
  const totalWidth =
    number.value.length * digitWidth +
    (number.value.length - 1) * digitGap;

  const startX = Math.round(number.x - camX - totalWidth / 2);
  const startY = Math.round(number.y - camY);

  // Slight drop during the first instant gives the number a punchy "pop".
  const popY = age < 0.06 ? 1 : 0;

  for (let d = 0; d < number.value.length; d++) {
    const pattern = DAMAGE_DIGITS[number.value[d]];
    if (!pattern) continue;

    const digitX = startX + d * (digitWidth + digitGap);

    // Dark chunky outline.
    ctx.fillStyle = critical ? "#4b0f10" : "#3b251c";
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 3; col++) {
        if (pattern[row][col] !== "1") continue;

        const px = digitX + col * drawScale;
        const py = startY + row * drawScale + popY;

        ctx.fillRect(px - 1, py - 1, drawScale + 2, drawScale + 2);
      }
    }

    // Bright retro damage face.
    ctx.fillStyle = critical ? "#ff4d5a" : "#ffd76a";
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 3; col++) {
        if (pattern[row][col] !== "1") continue;

        const px = digitX + col * drawScale;
        const py = startY + row * drawScale + popY;

        ctx.fillRect(px, py, drawScale, drawScale);
      }
    }

    // Tiny highlight on the upper-left pixels.
    ctx.fillStyle = critical ? "#ffd4d8" : "#fff3b0";
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 3; col++) {
        if (pattern[row][col] !== "1") continue;

        ctx.fillRect(
          digitX + col * drawScale,
          startY + row * drawScale + popY,
          1,
          1
        );
      }
    }
  }
}

function drawDamageNumbers(camX, camY) {
  const now = Date.now();
  for (let i = damageNumbers.length - 1; i >= 0; i--) {
    const number = damageNumbers[i];
    const maxAgeMs = (Number(number.duration) || 0.72) * 1000 + 150;
    if (Number.isFinite(number.createdAtMs) && now - number.createdAtMs > maxAgeMs) {
      damageNumbers.splice(i, 1);
      continue;
    }
    drawPixelDamageNumber(number, camX, camY);
  }
}

// Small 3x5 pixel alphabet used for progression popups above the player.
// Now includes a full A-Z set so short status messages no longer lose letters.
const FLOAT_GLYPHS = {
  "0": ["111","101","101","101","111"],
  "1": ["010","110","010","010","111"],
  "2": ["111","001","111","100","111"],
  "3": ["111","001","111","001","111"],
  "4": ["101","101","111","001","001"],
  "5": ["111","100","111","001","111"],
  "6": ["111","100","111","101","111"],
  "7": ["111","001","010","010","010"],
  "8": ["111","101","111","101","111"],
  "9": ["111","101","111","001","111"],

  "A": ["010","101","111","101","101"],
  "B": ["110","101","110","101","110"],
  "C": ["111","100","100","100","111"],
  "D": ["110","101","101","101","110"],
  "E": ["111","100","110","100","111"],
  "F": ["111","100","110","100","100"],
  "G": ["111","100","101","101","111"],
  "H": ["101","101","111","101","101"],
  "I": ["111","010","010","010","111"],
  "J": ["001","001","001","101","111"],
  "K": ["101","101","110","101","101"],
  "L": ["100","100","100","100","111"],
  "M": ["101","111","111","101","101"],
  "N": ["101","111","111","111","101"],
  "O": ["111","101","101","101","111"],
  "P": ["110","101","110","100","100"],
  "Q": ["111","101","101","111","001"],
  "R": ["110","101","110","101","101"],
  "S": ["111","100","111","001","111"],
  "T": ["111","010","010","010","010"],
  "U": ["101","101","101","101","111"],
  "V": ["101","101","101","101","010"],
  "W": ["101","101","111","111","101"],
  "X": ["101","101","010","101","101"],
  "Y": ["101","101","010","010","010"],
  "Z": ["111","001","010","100","111"],

  "+": ["000","010","111","010","000"],
  "!": ["010","010","010","000","010"],
  "?": ["111","001","010","000","010"],
  ".": ["000","000","000","000","010"],
  ",": ["000","000","000","010","100"],
  ":": ["000","010","000","010","000"],
  "-": ["000","000","111","000","000"],
  "'": ["010","010","000","000","000"],
  "/": ["001","001","010","100","100"],

  " ": ["000","000","000","000","000"]
};

let menuFeedbackToastTimer = null;

function anyMenuOverlayOpen() {
  return Boolean(
    document.getElementById("inventoryOverlay")?.classList.contains("open") ||
    document.getElementById("shopOverlay")?.classList.contains("open") ||
    document.getElementById("craftOverlay")?.classList.contains("open") ||
    document.getElementById("beachQuestOverlay")?.classList.contains("open")
  );
}

function showMenuFeedback(text, color = "#fff2b5", duration = 0.9) {
  const toast = document.getElementById("menuFeedbackToast");
  if (!toast) return;

  toast.textContent = String(text).toUpperCase();
  toast.style.color = color;
  toast.classList.add("show");

  if (menuFeedbackToastTimer) {
    clearTimeout(menuFeedbackToastTimer);
  }

  menuFeedbackToastTimer = setTimeout(() => {
    toast.classList.remove("show");
    menuFeedbackToastTimer = null;
  }, Math.max(350, Number(duration) * 1000));
}

const potionUseEffects = [];

const POTION_USE_EFFECT_STYLES = Object.freeze({
  healingPotion: Object.freeze({
    colors: Object.freeze(["#ffd8e7", "#ff8eb5"]),
    sparkMode: "cross",
    rise: 8
  }),
  attackPotion: Object.freeze({
    colors: Object.freeze(["#ffe090", "#e87533"]),
    sparkMode: "up",
    rise: 10
  }),
  magicPotion: Object.freeze({
    colors: Object.freeze(["#b9d7ff", "#9a7cff"]),
    sparkMode: "arcane",
    rise: 9
  })
});

function spawnPotionUseEffect(itemId, x, y) {
  const style = POTION_USE_EFFECT_STYLES[itemId];
  if (!style) return;
  potionUseEffects.push({
    itemId,
    x: Number(x) || 0,
    y: Number(y) || 0,
    life: 0.78,
    duration: 0.78,
    sparkSeeds: [
      { x: -7, y: -2, delay: 0.03 },
      { x: 7, y: 0, delay: 0.11 },
      { x: -4, y: 6, delay: 0.20 },
      { x: 5, y: 7, delay: 0.28 }
    ]
  });
}

function spawnHealingPotionEffect(x, y) {
  spawnPotionUseEffect("healingPotion", x, y);
}

function triggerPotionFeedback(itemId, x = player.x, y = player.y) {
  spawnPotionUseEffect(itemId, x, y);
  if (itemId !== "healingPotion") return;
  const wrap = document.getElementById("hpBarWrap");
  if (!wrap) return;
  wrap.classList.remove("healing-pulse");
  void wrap.offsetWidth;
  wrap.classList.add("healing-pulse");
  window.setTimeout(() => wrap.classList.remove("healing-pulse"), 700);
}

function triggerHealingPotionFeedback(x = player.x, y = player.y) {
  triggerPotionFeedback("healingPotion", x, y);
}

function updatePotionUseEffects(dt) {
  for (let i = potionUseEffects.length - 1; i >= 0; i--) {
    potionUseEffects[i].life -= dt;
    if (potionUseEffects[i].life <= 0) potionUseEffects.splice(i, 1);
  }
}

function drawPotionUseEffects(camX, camY) {
  for (const effect of potionUseEffects) {
    const style = POTION_USE_EFFECT_STYLES[effect.itemId] || POTION_USE_EFFECT_STYLES.healingPotion;
    const potionImage = potionImageForItem(effect.itemId);
    const progress = Math.max(0, Math.min(1, 1 - effect.life / effect.duration));
    const fade = Math.max(0, Math.min(1, effect.life / 0.22));
    const pop = 1 + Math.sin(Math.min(1, progress / 0.55) * Math.PI) * 0.24;
    const bottleSize = Math.max(12, Math.round(14 * pop));
    const bottleX = Math.round(effect.x - camX - bottleSize / 2);
    const bottleY = Math.round(effect.y - camY - 31 - progress * style.rise - bottleSize / 2);

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = fade;
    if (potionImage?.complete) {
      ctx.drawImage(potionImage, bottleX, bottleY, bottleSize, bottleSize);
    }

    for (let i = 0; i < effect.sparkSeeds.length; i++) {
      const seed = effect.sparkSeeds[i];
      const local = Math.max(0, (progress - seed.delay) / Math.max(0.01, 1 - seed.delay));
      if (local <= 0 || local >= 1) continue;
      const alpha = Math.sin(local * Math.PI) * fade;
      let sx = effect.x - camX + seed.x * (1 + local * 0.55);
      let sy = effect.y - camY - 20 + seed.y - local * 14;

      if (style.sparkMode === "up") {
        sx = effect.x - camX + seed.x * (0.7 + local * 0.25);
        sy = effect.y - camY - 18 + Math.abs(seed.x) * 0.25 - local * (17 + i * 2);
      } else if (style.sparkMode === "arcane") {
        const angle = (i / effect.sparkSeeds.length) * Math.PI * 2 + local * Math.PI * 1.35;
        const radius = 7 + local * 7;
        sx = effect.x - camX + Math.cos(angle) * radius;
        sy = effect.y - camY - 21 + Math.sin(angle) * radius * 0.55 - local * 8;
      }

      sx = Math.round(sx);
      sy = Math.round(sy);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = style.colors[i % style.colors.length];
      if (style.sparkMode === "up") {
        ctx.fillRect(sx, sy - 3, 2, 6);
        ctx.fillRect(sx - 1, sy - 1, 4, 2);
      } else if (style.sparkMode === "arcane") {
        ctx.fillRect(sx - 1, sy - 1, 3, 3);
        if (i % 2 === 0) ctx.fillRect(sx, sy - 3, 1, 7);
      } else {
        ctx.fillRect(sx - 2, sy, 5, 1);
        ctx.fillRect(sx, sy - 2, 1, 5);
      }
    }
    ctx.restore();
  }
}

const floatingTexts = [];

function spawnFloatingText(
  x,
  y,
  text,
  color = "#a9dcff",
  duration = 1.0,
  baseScale = 1,
  driftX = null
) {
  const normalizedText = String(text).toUpperCase();

  if (anyMenuOverlayOpen() && /[A-Z]/.test(normalizedText)) {
    showMenuFeedback(normalizedText, color, duration);
  }

  floatingTexts.push({
    x,
    y,
    text: normalizedText,
    color,
    life: duration,
    duration,
    baseScale: Math.max(1, Math.round(Number(baseScale) || 1)),
    driftX: Number.isFinite(driftX)
      ? driftX
      : (Math.random() - 0.5) * 1.8
  });
}

function updateFloatingTexts(dt) {
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const t = floatingTexts[i];
    t.life -= dt;
    t.y -= 10 * dt;
    t.x += t.driftX * dt;

    if (t.life <= 0) {
      floatingTexts.splice(i, 1);
    }
  }
}

function drawFloatingTexts(camX, camY) {
  for (const item of floatingTexts) {
    const age = item.duration - item.life;
    const baseScale = Math.max(1, Number(item.baseScale) || 1);
    const scale = (age < 0.10 ? 2 : 1) * baseScale;
    const charW = 3 * scale;
    const gap = scale;
    const spaceW = 2 * scale;

    let totalWidth = 0;
    for (const ch of item.text) {
      totalWidth += ch === " " ? spaceW : charW;
      totalWidth += gap;
    }
    totalWidth = Math.max(0, totalWidth - gap);

    let cursorX = Math.round(item.x - camX - totalWidth / 2);
    const startY = Math.round(item.y - camY);

    ctx.save();
    ctx.globalAlpha = Math.min(1, item.life * 2.5);

    for (const ch of item.text) {
      if (ch === " ") {
        cursorX += spaceW + gap;
        continue;
      }

      const glyph = FLOAT_GLYPHS[ch];
      if (!glyph) {
        cursorX += charW + gap;
        continue;
      }

      // Dark one-pixel outline.
      ctx.fillStyle = "#30251e";
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 3; col++) {
          if (glyph[row][col] !== "1") continue;
          const px = cursorX + col * scale;
          const py = startY + row * scale;
          ctx.fillRect(px - 1, py - 1, scale + 2, scale + 2);
        }
      }

      ctx.fillStyle = item.color;
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 3; col++) {
          if (glyph[row][col] !== "1") continue;
          ctx.fillRect(
            cursorX + col * scale,
            startY + row * scale,
            scale,
            scale
          );
        }
      }

      cursorX += charW + gap;
    }

    ctx.restore();
  }
}

const coins = [];

function spawnCoin(x, y, options = {}) {
  const coin = {
    x,
    y,
    life: Number.isFinite(options.life)
      ? options.life
      : 12.0,

    shared: Boolean(options.shared),
    entityId: options.entityId || null,
    mapId: options.mapId || currentMapId,
    pickupRequestCooldown: 0
  };

  coins.push(coin);
  return coin;
}

function updateCoins(dt) {
  for (let i = coins.length - 1; i >= 0; i--) {
    const coin = coins[i];


    if (coin.shared) {
      coin.pickupRequestCooldown = Math.max(
        0,
        coin.pickupRequestCooldown - dt
      );
      continue;
    }

    coin.life -= dt;

    if (coin.life <= 0) {
      coins.splice(i, 1);
    }
  }
}

function collectCoins() {
  for (let i = coins.length - 1; i >= 0; i--) {
    const coin = coins[i];

    if (
      coin.shared &&
      coin.mapId !== currentMapId
    ) {
      continue;
    }

    const dx = player.x - coin.x;
    const dy = (player.y - 4) - coin.y;

    if (dx * dx + dy * dy > LOOT_PICKUP_RADIUS * LOOT_PICKUP_RADIUS) {
      continue;
    }

    if (coin.shared) {
      if (
        coin.pickupRequestCooldown <= 0 &&
        typeof onlineClient !== "undefined"
      ) {
        coin.pickupRequestCooldown = 0.25;
        onlineClient.requestCoinPickup(coin.entityId);
      }

      continue;
    }

    player.coins += 1;
    spawnLootPickupAnimation("coin", coin.x, coin.y);
    coins.splice(i, 1);
  }
}

const woodDrops = [];

function spawnWood(x, y) {
  woodDrops.push({
    x,
    y,
    life: 18.0
  });
}

function updateWoodDrops(dt) {
  for (
    let i = woodDrops.length - 1;
    i >= 0;
    i--
  ) {
    if (woodDrops[i].shared) {
      continue;
    }

    woodDrops[i].life -= dt;

    if (woodDrops[i].life <= 0) {
      woodDrops.splice(i, 1);
    }
  }
}

function collectWoodDrops() {
  for (
    let i = woodDrops.length - 1;
    i >= 0;
    i--
  ) {
    const wood = woodDrops[i];

    if (wood.shared) {
      wood.pickupRequestCooldown =
        Math.max(
          0,
          (wood.pickupRequestCooldown || 0) -
          1 / 60
        );
    }

    const dx = player.x - wood.x;
    const dy = (player.y - 4) - wood.y;

    if (dx * dx + dy * dy <= LOOT_PICKUP_RADIUS * LOOT_PICKUP_RADIUS) {
      if (wood.shared) {
        if (
          wood.pickupRequestCooldown <= 0 &&
          typeof onlineClient !== "undefined"
        ) {
          wood.pickupRequestCooldown = 0.25;

          onlineClient.requestResourcePickup(
            wood.entityId
          );
        }

        continue;
      }

      player.wood += 1;
      spawnLootPickupAnimation("wood", wood.x, wood.y);
      woodDrops.splice(i, 1);
    }
  }
}

function drawWoodDrop(wood, camX, camY, index) {
  const bob = Math.round(Math.sin(worldTime * 4.2 + index * 1.1) * 1);
  const screenX = Math.round(wood.x - camX);
  const screenY = Math.round(wood.y - camY);

  ctx.fillStyle = "rgba(35, 52, 37, .28)";
  ctx.fillRect(screenX - 4, screenY + 1, 8, 2);

  // Use the wood sprite at its natural size.
  ctx.drawImage(
    woodImage,
    screenX - 8,
    screenY - 15 + bob,
    16,
    16
  );
}

function tryHitTree() {
  const originX = player.x;
  const originY = player.y - 8;

  const horizontalSwing =
    player.attackDirection === "left" ||
    player.attackDirection === "right";

  const hitHalfArc =
    horizontalSwing ? 0.88 : 0.74;

  let bestTree = null;
  let bestDistance = Infinity;

  for (const tree of trees) {
    if (tree.nonInteractive || tree.isStump || tree.falling) continue;

    const targetX = tree.x;
    const targetY = tree.y - 15;

    const dx = targetX - originX;
    const dy = targetY - originY;

    const distance = Math.hypot(dx, dy);
    const targetAngle = Math.atan2(dy, dx);

    const insideAngle =
      Math.abs(angleDifference(targetAngle, player.attackAimAngle))
      <= hitHalfArc;

    const trunkRadius = horizontalSwing ? 9 : 8;
    const insideRange = distance <= currentMeleeReach() + trunkRadius;

    if (insideAngle && insideRange && distance < bestDistance) {
      bestTree = tree;
      bestDistance = distance;
    }
  }

  if (!bestTree) return;

  if (
    typeof onlineClient !== "undefined" &&
    onlineClient.sendEnvironmentAction(
      "hitTree",
      bestTree
    )
  ) {
    return;
  }

  // Offline fallback.
  bestTree.hp -= 1;
  bestTree.shakeTime = 0.18;
  scheduleLocalTreeRegrow(bestTree);

  if (bestTree.hp <= 0) {
    bestTree.hp = 0;
    bestTree.shakeTime = 0;
    bestTree.falling = true;
    bestTree.fallTime =
      bestTree.fallDuration;
    bestTree.fallDirection =
      player.x < bestTree.x ? 1 : -1;
  }
}


function tryHitRock() {
  const originX = player.x;
  const originY = player.y - 8;
  const horizontalSwing =
    player.attackDirection === "left" ||
    player.attackDirection === "right";
  const hitHalfArc = horizontalSwing ? 0.88 : 0.74;

  let bestRock = null;
  let bestDistance = Infinity;

  for (const rock of rocks) {
    if (
      rock.depleted ||
      rock.carriedBy ||
      (Number(rock.hurlTime) || 0) > 0 ||
      (Number(rock.rollTime) || 0) > 0
    ) {
      continue;
    }

    const targetX = rock.x;
    const targetY = rock.y - 4;
    const dx = targetX - originX;
    const dy = targetY - originY;
    const distance = Math.hypot(dx, dy);
    const targetAngle = Math.atan2(dy, dx);
    const insideAngle =
      Math.abs(angleDifference(targetAngle, player.attackAimAngle)) <= hitHalfArc;
    const insideRange = distance <= currentMeleeReach() + 7;

    if (insideAngle && insideRange && distance < bestDistance) {
      bestRock = rock;
      bestDistance = distance;
    }
  }

  if (!bestRock) return;

  if (
    typeof onlineClient !== "undefined" &&
    onlineClient.sendEnvironmentAction(
      "hitRock",
      bestRock
    )
  ) {
    return;
  }

  // Offline fallback mirrors the three-hit visual progression. Multiplayer is
  // authoritative and uses real ground pickups; offline testing credits the
  // two Stone directly when the node breaks.
  bestRock.maxHp = Math.max(1, Math.floor(Number(bestRock.maxHp) || 3));
  bestRock.hp = Math.max(0, (Number(bestRock.hp) || bestRock.maxHp) - 1);
  spawnRockChipBurst(bestRock, bestRock.hp <= 0);

  if (bestRock.hp <= 0) {
    bestRock.depleted = true;
    player.stone += 2;
    awardMiningExp(1);
    updateInventoryUi();
  }
}




// -----------------------------------------------------------------------------
// PLAYER
// -----------------------------------------------------------------------------
const player = {
  x: world.width / 2,
  y: world.height / 2,
  speed: GAME_CONFIG.player.baseSpeed,

  // Cosmetic equipment can be mixed independently.
  // -1 means the armor slot is empty. The new base artwork is the
  // underlying appearance shown in that case.
  hatIndex: -1,   // -1 none/base, 0 Hat, 1 Blue Cap, 2 Wizard, 3 Jester, 4 Ninja, 5 Knight, 6 Bandana, 7 Ranger, 8 Wood Helm, 9 Arcanist Hat, 10 Greencap Cap
  shirtIndex: -1, // -1 none/base, 0 Traveler, 1 Jester, 2 Ninja, 3 Knight, 4 Ranger, 5 Wood Chest, 6 Arcanist Robe, 7 Greencap Tunic
  pantsIndex: -1, // -1 none/base, 0 Traveler, 1 Jester, 2 Ninja, 3 Knight, 4 Ranger, 5 Wood Greaves, 6 Arcanist Skirt, 7 Greencap Pants
  charmIndex: -1, // -1 none, 0 Wood Ring
  walkTime: 0,
  wasMoving: false,
  firstRaisedLeg: "left",

  // Equipped tool / attack state.
  weaponIndex: -1, // -1 empty, 0 Wood Sword, 1 Axe, 2 Fire Wand, 3 Rain Wand, 4 Katana, 5 Sword, 6 Wood Bow, 7 Dreamcatcher, 8 Shepherd Staff, 9 Tournesol, 10 Tabatha's Key, 11 Pickaxe, 12 Sapgem Wand

  // Bow draw/release state, including close-range bow melee fallback.
  bowDrawing: false,
  bowDrawAmount: 0,
  // A bow shot requires one full second of draw time. Releasing before the
  // draw completes cancels the shot without consuming an arrow.
  bowDrawDuration: 1.0,
  bowReleaseTime: 0,
  bowReleaseDuration: 0.12,

  // Precision skill: Camouflage. Stand still in natural cover to prepare an
  // ambush. Leaving cover keeps the camouflage briefly so the player can step
  // out and take the opening shot.
  camouflaged: false,
  camouflageBuildTime: 0,
  camouflageBuildDuration: CAMOUFLAGE_RULES.BUILD_DURATION,
  camouflageGraceTime: 0,
  camouflageGraceDuration: CAMOUFLAGE_RULES.GRACE_DURATION,
  camouflageCoverType: null,
  camouflageSourceCover: null,
  camouflageParticleTimer: 0,

  // Precision skill: Hunter's Snare. Placement is intentionally a committed
  // setup action rather than something the hunter can spam while kiting.
  hunterSnareSetting: false,
  hunterSnareSetTime: 0,
  hunterSnareSetDuration: 1.25,
  hunterSnareSetStartX: 0,
  hunterSnareSetStartY: 0,
  hunterSnareCharges: 3,
  hunterSnareMaxCharges: 3,

  // PvP Hunter's Snare status. The server decides when a trap catches a
  // player; these short client timers make the authoritative root/slow feel
  // immediate without turning the trap into a new movement protocol.
  pvpSnareRootTime: 0,
  pvpSnareSlowTime: 0,
  pvpSnareSlowMultiplier: 0.45,

  // Fireball uses an expanding targeting pulse similar to Focus Fire.
  fireballAiming: false,
  fireballAimTime: 0,
  fireballBoundKey: null,
  fireballAimMapId: null,
  fireballTargetX: null,
  fireballTargetY: null,
  fireballTargetAngle: null,

  // Active-skill cooldowns are tracked locally. Rain Cloud begins its cooldown
  // only after the summoned cloud expires; Fireball begins on successful release.
  skillCooldowns: {
    fireball: 0,
    rainCloud: 0
  },
  // Cooldowns use wall-clock deadlines so background-tab throttling cannot
  // pause them. The numeric values above remain for UI/backward compatibility.
  skillCooldownEndTimes: {
    fireball: 0,
    rainCloud: 0
  },

  // Rain Cloud is a committed cast whose duration scales with skill level.
  // Its destination is snapshotted when the cast begins and cannot be retargeted.
  rainCloudCasting: false,
  rainCloudCastTime: 0,
  rainCloudCastDuration: 2.00,
  rainCloudCastMapId: null,
  rainCloudCastTargetX: null,
  rainCloudCastTargetY: null,

  // Precision skill: Focus Fire. The opener is aimed with a cycling pulse;
  // a successful landing locks one monster for a five-second barrage.
  focusFireCharging: false,
  focusFireOpening: false,
  focusFireActive: false,
  focusFireChargeTime: 0,
  focusFireBoundKey: null,
  focusFireMapId: null,
  focusFireTarget: null,
  focusFireTargetType: null,
  focusFireTargetId: null,
  focusFireTime: 0,
  focusFireShotTimer: 0,
  focusFireShotSequence: 0,

  attackTime: 0,
  attackDuration: DEFAULT_BASIC_ATTACK_DURATION,
  attackCooldown: 0,
  basicAttackMovementLockTime: 0,
  attackCooldownDuration: 0.60,
  attackAimAngle: 0,
  attackDirection: "left",
  attackHand: "left",

  // Separate slash-arc effect timing.
  slashTime: 0,
  slashDuration: 0.17,

  // Slime contact knockback. No HP/damage yet — touching the slime
  // simply bumps the player away for now.
  contactCooldown: 0,
  knockbackX: 0,
  knockbackY: 0,

  // Player health / death presentation. HP is authoritative online.
  maxHp: 50,
  hp: 50,
  isDead: false,

  // Opt-in PvP state. Permission is authoritative on the server; the local
  // fields mirror server messages so the menu and overhead marker stay clear.
  pvpEnabled: false,
  pvpCombatUntil: 0,
  pvpTogglePending: false,

  // Fire debuff state. Player fire lasts longer than monster fire so
  // catching flame feels more consequential and gives the rain spell value.
  burnTime: 0,
  burnDuration: 6.0,
  burnTickTimer: 0,
  burnTickInterval: 0.5,

  // Wet status from standing under a rain cloud.
  wetTime: 0,
  wetDuration: 3.0,

  // Jester mobility / trick skill.
  jesterBlinkCooldown: 0,
  jesterBlinkCooldownEndAtMs: 0,
  jesterBlinkCooldownDuration: 15.0,
  jesterBlinkFadeTime: 0,
  jesterBlinkFadeDuration: 0.18,

  // Active skill: hide in the shadows until the player performs
  // any gameplay action other than movement.
  shadowHidden: false,
  shadowHideRevealTime: 0,
  shadowHideRevealDuration: 0.16,
  shadowCritAttack: false,

  // Hurl whiff / reach feedback when the ability is pressed without
  // a valid slime target.
  hurlReachTime: 0,
  hurlReachDuration: 0.18,
  hurlReachDirX: 0,
  hurlReachDirY: 0,

  // Currency / resources.
  coins: 0,
  wood: 0,
  stone: 0,
  whiteFlowers: 0,
  blueFlowers: 0,
  healingPotions: 0,
  attackPotions: 0,
  magicPotions: 0,
  consumableCooldownUntil: 0, // shared healing-potion-family cooldown
  attackPotionCooldownUntil: 0,
  magicPotionCooldownUntil: 0,
  attackPotionUntil: 0,
  magicPotionUntil: 0,
  goldSlimeBubbles: 0,
  arrows: 0,

  // Count-based item ownership. Missing/zero means not owned.
  // New players intentionally start with no gear or weapons.
  items: {},

  // Shop ownership is mirrored locally so browser persistence can restore the
  // server's one-purchase-per-item bookkeeping after a reconnect/reload.
  shopPurchases: [],

  // Independent, player-arranged hotbar.
  hotbarAssignments: [
    null,
    null,
    null,
    null,
    null
  ],

  // Player-arranged consumable/item hotkeys (physical keys 1-3).
  // Slots intentionally start empty and are assigned by dragging consumables
  // from Inventory into the contextual Items rail.
  utilityHotbarAssignments: [
    null,
    null,
    null
  ],
  utilityHotbarCustomized: false,

  // Tiny first-progression quest state. Persistent storage comes later;
  // for now these flags live for the current browser session.
  story: {
    axeReceived: false,
    woodSwordCrafted: false,
    woodBowCrafted: false,
    shepherdStaffCrafted: false,
    woodHelmCrafted: false,
    woodChestCrafted: false,
    woodGreavesCrafted: false,
    woodRingCrafted: false
  },

  beachQuest: {
    stage: "none",
    firstCrabKills: 0,
    secondCrabKills: 0,
    icedCoffee: 0
  },

  myrtleQuest: {
    stage: "none"
  },

  benchCraftPending: null,
  shopPurchasePending: null,

  // Level progression.
  level: 1,
  exp: 0,
  expToNext: 5,
  skillPoints: 0,
  abilityPoints: 0,

  // Choosing a class is permanent for this character/session. Persistence is
  // intentionally deferred until the save system exists, but all skill access
  // respects this lock immediately after selection.
  classId: null,

  abilities: {
    shadowHide: 0,
    hurl: 0,
    jesterBlink: 0,
    wandMastery: 0,
    fireball: 0,
    strafe: 0,
    camouflage: 0,
    focusFire: 0,
    huntersSnare: 0,
    rainCloud: 0
  },

  // Enhancements are now toggled directly inside their parent skill.
  // Missing entries default ON as soon as the enhancement is learned.
  enhancementToggles: {},

  stats: {
    strength: 0,
    dex: 0,
    luck: 0,
    int: 0
  },

  // Gathering skill progression.
  woodcutting: {
    level: 1,
    exp: 0,
    expToNext: 5
  },
  mining: {
    level: 1,
    exp: 0,
    expToNext: 5
  }
};

const HOTBAR_SLOT_COUNT = 5;
const UTILITY_HOTBAR_SLOT_COUNT = 3;
const UTILITY_SLOT_ITEMS = Object.freeze(["healingPotion", "attackPotion", "magicPotion"]);
const WEAPON_STYLES = ["sword", "axe", "wand", "rainWand", "katana", "oldSword", "bow", "bow", "shepherdStaff", "lostKeyWand", "sunflowerWand", "pickaxe", "sapgemWand"];
const HAT_STYLES = ["original", "blueCap", "wizardHat", "jesterHat", "ninjaHat", "knightHat", "bandanaHat", "rangerHat", "woodHat", "arcanistHat", "greencapHat"];
const SHIRT_STYLES = ["traveler", "jester", "ninja", "knight", "ranger", "wood", "arcanist", "greencap"];
const PANTS_STYLES = ["traveler", "jester", "ninja", "knight", "ranger", "wood", "arcanist", "greencap"];

const WEAPON_ITEM_IDS = [
  "weapon_sword",
  "weapon_axe",
  "weapon_wand",
  "weapon_rainWand",
  "weapon_katana",
  "weapon_oldSword",
  "weapon_bow",
  "weapon_dreamcatcher",
  "weapon_shepherdStaff",
  "weapon_lostKey",
  "weapon_hugeSunflower",
  "weapon_pickaxe",
  "weapon_sapgemWand"
];

const HAT_ITEM_IDS = [
  "hat_original",
  "hat_blueCap",
  "hat_wizard",
  "hat_jester",
  "hat_ninja",
  "hat_knight",
  "hat_bandana",
  "hat_ranger",
  "hat_wood",
  "hat_arcanist",
  "hat_greencap"
];

const SHIRT_ITEM_IDS = [
  "shirt_traveler",
  "shirt_jester",
  "shirt_ninja",
  "shirt_knight",
  "shirt_ranger",
  "shirt_wood",
  "shirt_arcanist",
  "shirt_greencap"
];

const PANTS_ITEM_IDS = [
  "pants_traveler",
  "pants_jester",
  "pants_ninja",
  "pants_knight",
  "pants_ranger",
  "pants_wood",
  "pants_arcanist",
  "pants_greencap"
];

const CHARM_ITEM_IDS = [
  "charm_woodRing"
];

const ALL_EQUIPMENT_ITEM_IDS = new Set([
  ...WEAPON_ITEM_IDS,
  ...HAT_ITEM_IDS,
  ...SHIRT_ITEM_IDS,
  ...PANTS_ITEM_IDS,
  ...CHARM_ITEM_IDS
]);

const CRAFT_RECIPES = Object.freeze({
  woodSword: Object.freeze({
    name: "Wood Sword",
    itemId: "weapon_sword",
    equipType: "weapon",
    equipIndex: 0,
    cost: 5,
    storyKey: "woodSwordCrafted",
    repeatable: false
  }),
  woodBow: Object.freeze({
    name: "Wood Bow",
    itemId: "weapon_bow",
    equipType: "weapon",
    equipIndex: 6,
    cost: 5,
    storyKey: "woodBowCrafted",
    repeatable: false
  }),
  shepherdStaff: Object.freeze({
    name: "Shepherd Staff",
    itemId: "weapon_shepherdStaff",
    equipType: "weapon",
    equipIndex: 8,
    cost: 5,
    storyKey: "shepherdStaffCrafted",
    repeatable: false
  }),
  woodHelm: Object.freeze({
    name: "Wood Helm",
    itemId: "hat_wood",
    equipType: "hat",
    equipIndex: 8,
    cost: 3,
    storyKey: "woodHelmCrafted",
    repeatable: false
  }),
  woodChest: Object.freeze({
    name: "Wood Chest",
    itemId: "shirt_wood",
    equipType: "shirt",
    equipIndex: 5,
    cost: 5,
    storyKey: "woodChestCrafted",
    repeatable: false
  }),
  woodGreaves: Object.freeze({
    name: "Wood Greaves",
    itemId: "pants_wood",
    equipType: "pants",
    equipIndex: 5,
    cost: 4,
    storyKey: "woodGreavesCrafted",
    repeatable: false
  }),
  woodRing: Object.freeze({
    name: "Wood Ring",
    itemId: "charm_woodRing",
    equipType: "charm",
    equipIndex: 0,
    cost: 2,
    storyKey: "woodRingCrafted",
    repeatable: false
  }),
  arrows: Object.freeze({
    name: "50 Arrows",
    resourceKey: "arrows",
    outputCount: 50,
    ingredients: Object.freeze({ wood: 5, stone: 1 }),
    repeatable: true
  }),
  healingPotion: Object.freeze({
    name: "Healing Potion",
    resourceKey: "healingPotions",
    outputCount: 1,
    ingredients: Object.freeze({ whiteFlowers: 1, blueFlowers: 1 }),
    repeatable: true
  }),
  attackPotion: Object.freeze({
    name: "Attack Potion",
    resourceKey: "attackPotions",
    outputCount: 1,
    ingredients: Object.freeze({ whiteFlowers: 2 }),
    repeatable: true
  }),
  magicPotion: Object.freeze({
    name: "Magic Potion",
    resourceKey: "magicPotions",
    outputCount: 1,
    ingredients: Object.freeze({ blueFlowers: 2 }),
    repeatable: true
  })
});

function potionImageForItem(itemId) {
  if (itemId === "healingPotion") return healingPotionImage;
  if (itemId === "attackPotion") return attackPotionImage;
  if (itemId === "magicPotion") return magicPotionImage;
  return null;
}

function consumableCount(itemId) {
  const key = { healingPotion: "healingPotions", attackPotion: "attackPotions", magicPotion: "magicPotions" }[itemId];
  return key ? Math.max(0, Math.floor(Number(player[key]) || 0)) : 0;
}

const HEALING_POTION_COOLDOWN_MS = 15000;
const BUFF_POTION_COOLDOWN_MS = 1000;
const POTION_BUFF_MS = 300000;

function consumableCooldownDurationMs(itemId) {
  return itemId === "healingPotion" ? HEALING_POTION_COOLDOWN_MS : BUFF_POTION_COOLDOWN_MS;
}

function consumableCooldownUntil(itemId) {
  if (itemId === "healingPotion") return Number(player.consumableCooldownUntil) || 0;
  if (itemId === "attackPotion") return Number(player.attackPotionCooldownUntil) || 0;
  if (itemId === "magicPotion") return Number(player.magicPotionCooldownUntil) || 0;
  return 0;
}

function setLocalConsumableCooldown(itemId, now) {
  if (itemId === "healingPotion") player.consumableCooldownUntil = now + HEALING_POTION_COOLDOWN_MS;
  if (itemId === "attackPotion") player.attackPotionCooldownUntil = now + BUFF_POTION_COOLDOWN_MS;
  if (itemId === "magicPotion") player.magicPotionCooldownUntil = now + BUFF_POTION_COOLDOWN_MS;
}

function useConsumable(itemId) {
  if (!UTILITY_SLOT_ITEMS.includes(itemId)) return false;
  if (Date.now() < consumableCooldownUntil(itemId)) return false;
  if (consumableCount(itemId) <= 0) return false;
  if (itemId === "healingPotion" && player.hp >= player.maxHp) {
    spawnFloatingText(player.x, player.y - 42, "HP FULL", "#f6c8df", 0.8);
    return false;
  }
  if (typeof onlineClient !== "undefined" && onlineClient?.connected) {
    return onlineClient.requestConsumableUse(itemId);
  }
  const key = { healingPotion: "healingPotions", attackPotion: "attackPotions", magicPotion: "magicPotions" }[itemId];
  player[key] -= 1;
  const now = Date.now();
  setLocalConsumableCooldown(itemId, now);
  if (itemId === "healingPotion") player.hp = Math.min(player.maxHp, player.hp + 20);
  if (itemId === "attackPotion") player.attackPotionUntil = now + POTION_BUFF_MS;
  if (itemId === "magicPotion") player.magicPotionUntil = now + POTION_BUFF_MS;
  triggerPotionFeedback(itemId, player.x, player.y);
  updateInventoryUi();
  updateHotbar();
  return true;
}

const SHOP_ITEMS = [
  { id: "weapon_sword", name: "Wood Sword" },
  { id: "weapon_axe", name: "Axe" },
  { id: "weapon_katana", name: "Katana" },
  { id: "weapon_oldSword", name: "Sword" },
  { id: "weapon_bow", name: "Wood Bow" },
  { id: "weapon_dreamcatcher", name: "Dreamcatcher" },
  { id: "weapon_shepherdStaff", name: "Shepherd Staff" },
  { id: "weapon_lostKey", name: "Tournesol" },
  { id: "weapon_hugeSunflower", name: "Tabatha's Key" },
  { id: "weapon_sapgemWand", name: "Sapgem Wand" },
  { id: "weapon_pickaxe", name: "Pickaxe" },

  { id: "hat_original", name: "Hat" },
  { id: "hat_blueCap", name: "Blue Cap" },
  { id: "hat_wizard", name: "Wizard Hat" },
  { id: "hat_jester", name: "Jester Hat" },
  { id: "hat_ninja", name: "Ninja Hat" },
  { id: "hat_knight", name: "Knight Helm" },
  { id: "hat_bandana", name: "Bandana" },
  { id: "hat_ranger", name: "Ranger Hat" },
  { id: "hat_wood", name: "Wood Helm" },
  { id: "hat_arcanist", name: "Arcanist Hat" },
  { id: "hat_greencap", name: "Greencap Cap" },

  { id: "shirt_traveler", name: "Traveler Shirt" },
  { id: "shirt_jester", name: "Jester Shirt" },
  { id: "shirt_ninja", name: "Ninja Shirt" },
  { id: "shirt_knight", name: "Knight Chest" },
  { id: "shirt_ranger", name: "Ranger Shirt" },
  { id: "shirt_wood", name: "Wood Chest" },
  { id: "shirt_arcanist", name: "Arcanist Robe" },
  { id: "shirt_greencap", name: "Greencap Tunic" },

  { id: "pants_traveler", name: "Traveler Pants" },
  { id: "pants_jester", name: "Jester Pants" },
  { id: "pants_ninja", name: "Ninja Pants" },
  { id: "pants_knight", name: "Knight Greaves" },
  { id: "pants_ranger", name: "Ranger Pants" },
  { id: "pants_wood", name: "Wood Greaves" },
  { id: "pants_arcanist", name: "Arcanist Skirt" },
  { id: "pants_greencap", name: "Greencap Pants" }
];

function shopImageForItemId(itemId) {
  const weaponIndex =
    WEAPON_ITEM_IDS.indexOf(itemId);

  if (weaponIndex >= 0) {
    return weaponImageForIndex(
      weaponIndex
    );
  }

  const hatIndex =
    HAT_ITEM_IDS.indexOf(itemId);

  if (hatIndex >= 0) {
    return hatImageForIndex(
      hatIndex
    );
  }

  const shirtIndex =
    SHIRT_ITEM_IDS.indexOf(itemId);

  if (shirtIndex >= 0) {
    return shirtImageForIndex(
      shirtIndex
    );
  }

  const pantsIndex =
    PANTS_ITEM_IDS.indexOf(itemId);

  if (pantsIndex >= 0) {
    return pantsImageForIndex(
      pantsIndex
    );
  }

  const charmIndex =
    CHARM_ITEM_IDS.indexOf(itemId);

  if (charmIndex >= 0) {
    return charmImageForIndex(
      charmIndex
    );
  }

  return null;
}

function inventoryItemCount(itemId) {
  return Math.max(
    0,
    Math.floor(
      Number(player.items?.[itemId]) || 0
    )
  );
}

function playerOwnsItem(itemId) {
  return inventoryItemCount(itemId) > 0;
}

function playerOwnsWeaponIndex(index) {
  return (
    index >= 0 &&
    index < WEAPON_ITEM_IDS.length &&
    playerOwnsItem(WEAPON_ITEM_IDS[index])
  );
}

function playerOwnsHatIndex(index) {
  return (
    index >= 0 &&
    index < HAT_ITEM_IDS.length &&
    playerOwnsItem(HAT_ITEM_IDS[index])
  );
}

function playerOwnsShirtIndex(index) {
  return (
    index >= 0 &&
    index < SHIRT_ITEM_IDS.length &&
    playerOwnsItem(SHIRT_ITEM_IDS[index])
  );
}

function playerOwnsPantsIndex(index) {
  return (
    index >= 0 &&
    index < PANTS_ITEM_IDS.length &&
    playerOwnsItem(PANTS_ITEM_IDS[index])
  );
}

function playerOwnsCharmIndex(index) {
  return (
    index >= 0 &&
    index < CHARM_ITEM_IDS.length &&
    playerOwnsItem(CHARM_ITEM_IDS[index])
  );
}

function weaponIndexForItemId(itemId) {
  return WEAPON_ITEM_IDS.indexOf(itemId);
}

function weaponItemIdForIndex(index) {
  return (
    index >= 0 &&
    index < WEAPON_ITEM_IDS.length
  )
    ? WEAPON_ITEM_IDS[index]
    : null;
}

function isUtilityHotbarAssignableItem(itemId) {
  return UTILITY_SLOT_ITEMS.includes(itemId);
}

function utilityHotbarItemCanBeAssigned(itemId) {
  return Boolean(itemId && isUtilityHotbarAssignableItem(itemId));
}

function utilityHotbarSlotForItem(itemId) {
  return Array.isArray(player.utilityHotbarAssignments)
    ? player.utilityHotbarAssignments.indexOf(itemId)
    : -1;
}

function sanitizeUtilityHotbarAssignments() {
  const source = Array.isArray(player.utilityHotbarAssignments)
    ? player.utilityHotbarAssignments
    : [];
  const seen = new Set();

  player.utilityHotbarAssignments = Array.from(
    { length: UTILITY_HOTBAR_SLOT_COUNT },
    (_, index) => {
      const itemId = source[index];
      if (!isUtilityHotbarAssignableItem(itemId) || seen.has(itemId)) return null;
      seen.add(itemId);
      return itemId;
    }
  );
}

function assignUtilityItemToHotbar(itemId, slotIndex) {
  if (
    !utilityHotbarItemCanBeAssigned(itemId) ||
    slotIndex < 0 ||
    slotIndex >= UTILITY_HOTBAR_SLOT_COUNT
  ) {
    return false;
  }

  sanitizeUtilityHotbarAssignments();
  const currentSlot = utilityHotbarSlotForItem(itemId);
  if (currentSlot === slotIndex) return true;

  const displacedItem = player.utilityHotbarAssignments[slotIndex] || null;
  if (currentSlot >= 0) {
    player.utilityHotbarAssignments[currentSlot] = displacedItem;
  }
  player.utilityHotbarAssignments[slotIndex] = itemId;
  player.utilityHotbarCustomized = true;

  updateHotbar();
  updateInventoryUi();
  return true;
}

function clearUtilityItemFromHotbar(itemId) {
  sanitizeUtilityHotbarAssignments();
  let changed = false;
  for (let index = 0; index < UTILITY_HOTBAR_SLOT_COUNT; index++) {
    if (player.utilityHotbarAssignments[index] === itemId) {
      player.utilityHotbarAssignments[index] = null;
      changed = true;
    }
  }
  if (changed) {
    player.utilityHotbarCustomized = true;
    updateHotbar();
    updateInventoryUi();
  }
  return changed;
}

function utilityItemDisplayName(itemId) {
  if (itemId === "healingPotion") return "Healing Potion";
  if (itemId === "attackPotion") return "Attack Potion";
  if (itemId === "magicPotion") return "Magic Potion";
  return itemId || "Item";
}

function hotkeyImageForItemId(itemId) {
  return potionImageForItem(itemId) || shopImageForItemId(itemId);
}

function isHotbarAssignableItem(itemId) {
  return WEAPON_ITEM_IDS.includes(itemId);
}

function hotbarItemCanBeAssigned(itemId) {
  return Boolean(
    itemId &&
    isHotbarAssignableItem(itemId) &&
    playerOwnsItem(itemId) &&
    equipmentItemCanBeEquipped(itemId)
  );
}

function showHotbarAssignmentRestriction(itemId) {
  const requiredClass = equipmentRequiredClass(itemId);
  if (requiredClass && player.classId !== requiredClass) {
    showEquipmentClassRestriction(itemId);
    return;
  }
  showMenuFeedback("ITEM CANNOT BE HOTKEYED", "#ffb4bc", 0.9);
}

function hotbarSlotForItem(itemId) {
  return player.hotbarAssignments.indexOf(itemId);
}

function firstEmptyHotbarSlot() {
  return player.hotbarAssignments.findIndex(
    itemId => !itemId
  );
}

function sanitizeHotbarAssignments() {
  if (!Array.isArray(player.hotbarAssignments)) {
    player.hotbarAssignments = [];
  }

  const seen = new Set();

  player.hotbarAssignments =
    Array.from(
      { length: HOTBAR_SLOT_COUNT },
      (_, index) => {
        const itemId =
          player.hotbarAssignments[index];

        if (
          !itemId ||
          !isHotbarAssignableItem(itemId) ||
          !playerOwnsItem(itemId) ||
          !equipmentItemCanBeEquipped(itemId) ||
          seen.has(itemId)
        ) {
          return null;
        }

        seen.add(itemId);
        return itemId;
      }
    );
}

function unequipItemIfNoLongerAssigned(itemId) {
  if (!itemId || focusFireIsCasting() || fireballIsAiming() || player.rainCloudCasting) return false;

  const equippedItemId =
    weaponItemIdForIndex(
      player.weaponIndex
    );

  if (
    equippedItemId === itemId &&
    hotbarSlotForItem(itemId) < 0
  ) {
    player.weaponIndex = -1;
    return true;
  }

  return false;
}

function assignItemToHotbar(itemId, slotIndex) {
  if (focusFireIsCasting() || fireballIsAiming() || player.rainCloudCasting) return false;

  if (
    !isHotbarAssignableItem(itemId) ||
    !playerOwnsItem(itemId) ||
    slotIndex < 0 ||
    slotIndex >= HOTBAR_SLOT_COUNT
  ) {
    return false;
  }

  if (!equipmentItemCanBeEquipped(itemId)) {
    showHotbarAssignmentRestriction(itemId);
    return false;
  }

  sanitizeHotbarAssignments();

  const currentSlot =
    hotbarSlotForItem(itemId);

  if (currentSlot === slotIndex) {
    return true;
  }

  const displacedItem =
    player.hotbarAssignments[slotIndex];

  // Moving an already-assigned item onto an occupied slot swaps the two.
  if (currentSlot >= 0) {
    player.hotbarAssignments[currentSlot] =
      displacedItem || null;
  }

  // A previously unassigned item replaces the destination assignment.
  player.hotbarAssignments[slotIndex] =
    itemId;

  // A normal move/swap keeps both items assigned. But if an unassigned item
  // replaced an occupied slot, the displaced weapon may have left the hotbar
  // entirely. It cannot remain held in that case.
  unequipItemIfNoLongerAssigned(
    displacedItem
  );

  updateHotbar();
  updateInventoryUi();
  return true;
}

function clearItemFromHotbar(itemId) {
  if (focusFireIsCasting() || fireballIsAiming() || player.rainCloudCasting) return false;

  let changed = false;

  for (
    let slotIndex = 0;
    slotIndex < HOTBAR_SLOT_COUNT;
    slotIndex++
  ) {
    if (
      player.hotbarAssignments[slotIndex] ===
      itemId
    ) {
      player.hotbarAssignments[slotIndex] = null;
      changed = true;
    }
  }

  if (changed) {
    unequipItemIfNoLongerAssigned(
      itemId
    );

    updateHotbar();
    updateInventoryUi();
  }

  return changed;
}

function autoAssignHotbarItem(itemId) {
  if (
    !isHotbarAssignableItem(itemId) ||
    hotbarSlotForItem(itemId) >= 0
  ) {
    return false;
  }

  const emptySlot =
    firstEmptyHotbarSlot();

  if (emptySlot < 0) {
    return false;
  }

  player.hotbarAssignments[emptySlot] =
    itemId;

  return true;
}

// Ready for future drops, shops, chests, etc.
function grantInventoryItem(itemId, count = 1) {
  if (!ALL_EQUIPMENT_ITEM_IDS.has(itemId)) {
    return false;
  }

  const amount = Math.max(
    1,
    Math.floor(Number(count) || 1)
  );

  const wasOwned =
    playerOwnsItem(itemId);

  player.items[itemId] =
    inventoryItemCount(itemId) + amount;

  if (!wasOwned) {
    autoAssignHotbarItem(itemId);
  }

  updateInventoryUi();
  updateHotbar();
  return true;
}

function distanceToPlayer(x, y) {
  return Math.hypot(
    player.x - x,
    player.y - y
  );
}

function placedNpcDefinitionsForMap(mapId = currentMapId) {
  const list =
    typeof WORLD_CONTENT !== "undefined"
      ? WORLD_CONTENT.maps?.[mapId]?.npcs
      : null;

  return Array.isArray(list) ? list : [];
}

const NPC_DEFAULT_NAMES = Object.freeze({
  shopkeeper: "Marnie",
  hunter: "Bramble",
  jester: "Jinx",
  beachGirl: "Sunny",
  greenWitch: "Myrtle",
  camoGuy: "Cam"
});

function npcDisplayName(type, npc = null) {
  const customName = typeof npc?.name === "string" ? npc.name.trim() : "";
  return customName || NPC_DEFAULT_NAMES[type] || "";
}

function nearbySpawnInteraction() {
  const candidates = [];

  if (currentMapId === "spawn") {
    candidates.push(
      {
        kind: "npc",
        x: tutorialNpc.x,
        y: tutorialNpc.y,
        radius:
          tutorialNpc.interactionRadius
      },
      {
        kind: "bench",
        x: woodCraftBench.x,
        y: woodCraftBench.y,
        radius:
          woodCraftBench.interactionRadius
      },
      {
        kind: "classResetCrystal",
        x: classResetCrystal.x,
        y: classResetCrystal.y,
        radius:
          classResetCrystal.interactionRadius
      }
    );
  }

  if (currentMapId === "hunterHollow") {
    candidates.push({
      kind: "hunterNpc",
      x: hunterNpc.x,
      y: hunterNpc.y,
      radius:
        hunterNpc.interactionRadius
    });
  }

  for (const npc of placedNpcDefinitionsForMap(currentMapId)) {
    const type = npc?.type;
    if (!["shopkeeper", "hunter", "beachGirl", "greenWitch", "camoGuy", "craftingTable", "classResetCrystal"].includes(type)) continue;
    candidates.push({
      kind: "placedNpc",
      npcType: type,
      npc,
      x: Number(npc.x) || 0,
      y: Number(npc.y) || 0,
      radius: Math.max(8, Number(npc.interactionRadius) || (type === "classResetCrystal" ? 28 : 24))
    });
  }

  if (candidates.length === 0) {
    return null;
  }

  let nearest = null;
  let nearestDistance = Infinity;

  for (const candidate of candidates) {
    const distance =
      distanceToPlayer(
        candidate.x,
        candidate.y
      );

    if (
      distance <= candidate.radius &&
      distance < nearestDistance
    ) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }

  return nearest;
}

function showRewardToast(title, detail, imageObject) {
  const toast =
    document.getElementById(
      "rewardToast"
    );

  if (!toast) return;

  const image =
    document.getElementById(
      "rewardToastImg"
    );

  const titleElement =
    document.getElementById(
      "rewardToastTitle"
    );

  const detailElement =
    document.getElementById(
      "rewardToastDetail"
    );

  if (image && imageObject) {
    image.src = imageObject.src;
    image.style.display = "block";
  } else if (image) {
    image.removeAttribute("src");
    image.style.display = "none";
  }

  if (titleElement) {
    titleElement.textContent = title;
  }

  if (detailElement) {
    detailElement.textContent = detail;
  }

  toast.classList.remove("show");
  void toast.offsetWidth;
  toast.classList.add("show");

  if (rewardToastTimer) {
    clearTimeout(rewardToastTimer);
  }

  rewardToastTimer = setTimeout(() => {
    toast.classList.remove("show");
    rewardToastTimer = null;
  }, 2800);
}

function interactWithTutorialNpc(npc = tutorialNpc) {
  const sourceNpc = npc || tutorialNpc;
  if (!player.story.axeReceived) {
    player.story.axeReceived = true;

    if (!playerOwnsItem("weapon_axe")) {
      grantInventoryItem(
        "weapon_axe",
        1
      );
    }

    showRewardToast(
      "AXE RECEIVED!",
      "Added to Inventory · Equip it and gather 5 Wood",
      axeImage
    );

    spawnFloatingText(
      sourceNpc.x,
      sourceNpc.y - 34,
      "BRING ME 5 WOOD",
      "#fff1b0",
      1.35
    );

    updateInventoryUi();
    updateHotbar();
    return;
  }

  // Once the NPC has handed over the Axe, their shop is immediately
  // available. Crafting progression is handled separately at the bench.
  setShopOpen(true);
}

function interactWithHunterNpc(npc = hunterNpc) {
  const sourceNpc = npc || hunterNpc;
  showRewardToast(
    npcDisplayName("hunter", sourceNpc),
    "Come talk to me when you're ready to become a real hunter.",
    hunterNpcImage
  );

  spawnFloatingText(
    sourceNpc.x,
    sourceNpc.y - 26,
    "REAL HUNTER?",
    "#fff1b0",
    1.0
  );
}

function interactWithCamoNpc(npc) {
  showRewardToast(
    npcDisplayName("camoGuy", npc),
    "If you can see me, no you can't. I'm conducting an extremely secret camouflage exercise.",
    camoNpcImage
  );
  spawnFloatingText(
    Number(npc?.x) || player.x,
    (Number(npc?.y) || player.y) - 30,
    "YOU SAW NOTHING",
    "#c8e6a8",
    1.15
  );
}

function equipCraftedRecipe(recipe) {
  if (!recipe || !Number.isFinite(recipe.equipIndex)) return;

  if (recipe.equipType === "weapon") {
    player.weaponIndex = recipe.equipIndex;
  } else if (recipe.equipType === "hat") {
    player.hatIndex = recipe.equipIndex;
  } else if (recipe.equipType === "shirt") {
    player.shirtIndex = recipe.equipIndex;
  } else if (recipe.equipType === "pants") {
    player.pantsIndex = recipe.equipIndex;
  } else if (recipe.equipType === "charm") {
    player.charmIndex = recipe.equipIndex;
  }
}

function craftRecipeOffline(recipeId) {
  const recipe =
    CRAFT_RECIPES[recipeId];

  if (!recipe) return;

  const alreadyOwned =
    !recipe.repeatable &&
    (
      player.story[recipe.storyKey] ||
      playerOwnsItem(recipe.itemId)
    );

  if (alreadyOwned) {
    spawnFloatingText(
      woodCraftBench.x,
      woodCraftBench.y - 24,
      "ALREADY CRAFTED",
      "#ffe38b",
      0.9
    );
    return;
  }

  const ingredients = recipe.ingredients || { wood: recipe.cost };
  const hasIngredients = Object.entries(ingredients).every(
    ([key, amount]) => (Number(player[key]) || 0) >= amount
  );
  if (!hasIngredients) {
    spawnFloatingText(
      woodCraftBench.x,
      woodCraftBench.y - 24,
      "MISSING INGREDIENTS",
      "#f08a7f",
      0.9
    );
    return;
  }

  for (const [key, amount] of Object.entries(ingredients)) {
    player[key] = Math.max(0, (Number(player[key]) || 0) - amount);
  }

  if (recipe.resourceKey) {
    player[recipe.resourceKey] =
      Math.max(0, Number(player[recipe.resourceKey]) || 0) +
      Math.max(1, Number(recipe.outputCount) || 1);
  } else {
    player.story[recipe.storyKey] = true;

    grantInventoryItem(
      recipe.itemId,
      1
    );

    equipCraftedRecipe(recipe);
  }

  spawnFloatingText(
    woodCraftBench.x,
    woodCraftBench.y - 24,
    `${recipe.name.toUpperCase()} CRAFTED!`,
    "#ffe38b",
    1.2
  );

  updateCraftingUi();
  updateInventoryUi();
  updateHotbar();
}

function tryCraftRecipe(recipeId) {
  const recipe =
    CRAFT_RECIPES[recipeId];

  if (
    !recipe ||
    !craftingOpen ||
    player.benchCraftPending ||
    (
      !recipe.repeatable &&
      (
        player.story[recipe.storyKey] ||
        playerOwnsItem(recipe.itemId)
      )
    )
  ) {
    return;
  }

  const ingredients = recipe.ingredients || { wood: recipe.cost };
  const hasIngredients = Object.entries(ingredients).every(
    ([resourceKey, amount]) => (Number(player[resourceKey]) || 0) >= amount
  );
  if (!hasIngredients) {
    spawnFloatingText(
      woodCraftBench.x,
      woodCraftBench.y - 24,
      "MISSING INGREDIENTS",
      "#f08a7f",
      0.9
    );
    return;
  }

  if (
    typeof onlineClient !== "undefined" &&
    onlineClient?.connected
  ) {
    player.benchCraftPending = recipeId;

    if (!onlineClient.requestCraft(recipeId)) {
      player.benchCraftPending = null;
    }

    updateCraftingUi();
    return;
  }

  craftRecipeOffline(recipeId);
}

function updateCraftingUi() {
  for (const [recipeId, recipe] of
    Object.entries(CRAFT_RECIPES)) {
    const button =
      document.querySelector(
        `[data-craft-recipe="${recipeId}"]`
      );

    if (!button) continue;

    const owned =
      !recipe.repeatable &&
      (
        player.story[recipe.storyKey] ||
        playerOwnsItem(recipe.itemId)
      );

    const pending =
      player.benchCraftPending ===
      recipeId;

    const anyPending =
      Boolean(player.benchCraftPending);

    const ingredients = recipe.ingredients || { wood: recipe.cost };
    const hasIngredients = Object.entries(ingredients).every(
      ([resourceKey, amount]) => (Number(player[resourceKey]) || 0) >= amount
    );

    button.disabled =
      owned || anyPending || !hasIngredients;

    const image =
      button.querySelector("img");

    const itemImage = recipe.resourceKey === "arrows"
      ? arrowResourceImage
      : recipe.resourceKey
        ? potionImageForItem(recipeId)
        : shopImageForItemId(recipe.itemId);

    if (image && itemImage) {
      image.src = itemImage.src;
    }

    const cost =
      button.querySelector(
        ".craft-recipe-cost"
      );

    if (cost) {
      cost.querySelectorAll("[data-craft-ingredient]").forEach(row => {
        const resourceKey = row.dataset.craftIngredient;
        const amount = Number(ingredients[resourceKey]) || 0;
        const enough = (Number(player[resourceKey]) || 0) >= amount;
        const value = row.querySelector(".craft-cost-value");
        const check = row.querySelector(".craft-ingredient-check");
        if (value) value.textContent = `${amount}`;
        if (check) {
          check.textContent = enough ? "✓" : "✕";
          check.classList.toggle("have", enough);
          check.classList.toggle("missing", !enough);
        }
      });
    }

    const status =
      button.querySelector(
        ".craft-recipe-status"
      );

    if (status) {
      status.textContent =
        owned
          ? "CRAFTED"
          : pending
            ? "CRAFTING..."
            : "CRAFT";
    }
  }
}

function setCraftingOpen(open) {
  craftingOpen = open;

  if (open && player.hunterSnareSetting) {
    cancelHunterSnarePlacement(false);
  }

  if (open && focusFireIsCasting()) {
    cancelFocusFire();
  }

  if (open && fireballIsAiming()) {
    cancelFireballAim();
  }

  const overlay =
    document.getElementById(
      "craftOverlay"
    );

  if (!overlay) return;

  if (open && inventoryOpen) {
    setInventoryOpen(false);
  }

  if (open && shopOpen) {
    setShopOpen(false);
  }

  overlay.classList.toggle(
    "open",
    open
  );

  overlay.setAttribute(
    "aria-hidden",
    open ? "false" : "true"
  );

  inputController.clearKeys();

  if (open) {
    inputController.clearCommands();
    updateCraftingUi();
  }
}

function setClassResetConfirmOpen(open) {
  classResetConfirmOpen = Boolean(open);

  const overlay = document.getElementById("classResetConfirmOverlay");
  if (!overlay) return;

  overlay.classList.toggle("open", classResetConfirmOpen);
  overlay.setAttribute(
    "aria-hidden",
    classResetConfirmOpen ? "false" : "true"
  );

  inputController.clearKeys();
  if (classResetConfirmOpen) {
    inputController.clearCommands();
    const noButton = document.getElementById("classResetNo");
    if (noButton) noButton.focus({ preventScroll: true });
  }
}

function interactWithClassResetCrystal() {
  setClassResetConfirmOpen(true);
}

function interactWithWoodBench() {
  setCraftingOpen(true);
}

let beachQuestView = null;

function setBeachQuestOpen(open) {
  beachQuestOpen = Boolean(open);
  const overlay = document.getElementById("beachQuestOverlay");
  if (!overlay) return;
  overlay.classList.toggle("open", beachQuestOpen);
  overlay.setAttribute("aria-hidden", beachQuestOpen ? "false" : "true");
  inputController.clearKeys();
  if (beachQuestOpen) inputController.clearCommands();
}

function updateBeachQuestPanel(message = beachQuestView) {
  if (!message) return;
  beachQuestView = message;

  const title = document.getElementById("beachQuestTitle");
  const dialogue = document.getElementById("beachQuestDialogue");
  const objectives = document.getElementById("beachQuestObjectives");
  const action = document.getElementById("beachQuestAction");
  const npcImage = document.getElementById("beachQuestNpc");
  const questNpcType = message.questNpcType === "greenWitch" ? "greenWitch" : "beachGirl";
  if (title) title.textContent = message.questName || "Crab Beach";
  if (dialogue) dialogue.textContent = message.dialogue || "The surf is nice today.";
  if (npcImage) {
    npcImage.src = questNpcType === "greenWitch" ? greenWitchNpcImage.src : beachGirlNpcImage.src;
    npcImage.alt = questNpcType === "greenWitch" ? "Myrtle" : "Sunny";
  }

  if (objectives) {
    objectives.replaceChildren();
    for (const objective of Array.isArray(message.objectives) ? message.objectives : []) {
      const row = document.createElement("div");
      row.className = `beach-quest-objective${objective.complete ? " complete" : ""}`;
      if (["coffee", "whiteFlower", "blueFlower"].includes(objective.icon)) {
        const image = document.createElement("img");
        image.src = objective.icon === "coffee"
          ? icedCoffeeImage.src
          : objective.icon === "blueFlower"
            ? blueFlowerImage.src
            : flowerImage.src;
        image.alt = objective.icon === "coffee"
          ? "Iced coffee"
          : objective.icon === "blueFlower"
            ? "Blue flower"
            : "White flower";
        row.append(image);
      }
      const copy = document.createElement("span");
      copy.textContent = objective.text || "";
      row.append(copy);
      objectives.append(row);
    }
  }

  if (action) {
    const available = typeof message.action === "string" && message.action.length > 0;
    action.hidden = !available;
    action.disabled = !available;
    action.dataset.questAction = available ? message.action : "";
    action.dataset.questNpcType = questNpcType;
    action.textContent = message.actionLabel || "Continue";
  }
}

function applyBeachQuestState(message) {
  if (!message || message.type !== "beachQuestState") return;
  player.beachQuest.stage = message.stage || player.beachQuest.stage;
  player.beachQuest.firstCrabKills = Math.max(0, Math.floor(Number(message.firstCrabKills) || 0));
  player.beachQuest.secondCrabKills = Math.max(0, Math.floor(Number(message.secondCrabKills) || 0));
  player.beachQuest.icedCoffee = Math.max(0, Math.floor(Number(message.icedCoffee) || 0));
  if (Number.isFinite(message.totalCoins)) player.coins = Math.max(0, Math.floor(message.totalCoins));
  if ((Number(message.rewardExp) || 0) > 0) awardExp(Math.floor(message.rewardExp));
  if ((Number(message.rewardCoins) || 0) > 0) {
    showMenuFeedback(`QUEST COMPLETE! +${Math.floor(message.rewardCoins)} COINS · +${Math.floor(message.rewardExp)} EXP`, "#ffe08a", 1.6);
  }
  updateBeachQuestPanel(message);
  setBeachQuestOpen(true);
  updateInventoryUi();
  saveLocalCharacterState(true);
}

function interactWithBeachGirl() {
  updateBeachQuestPanel({
    questNpcType: "beachGirl",
    questName: "Crab Beach",
    dialogue: "She brushes sand from her beach clothes and turns to you.",
    objectives: []
  });
  setBeachQuestOpen(true);
  return Boolean(onlineClient?.requestBeachGirlQuest("talk"));
}

function applyMyrtleQuestState(message) {
  if (!message || message.type !== "myrtleQuestState") return;
  player.myrtleQuest.stage = ["none", "active", "complete"].includes(message.stage)
    ? message.stage
    : player.myrtleQuest.stage;
  if (Number.isFinite(message.totalWhiteFlowers)) player.whiteFlowers = Math.max(0, Math.floor(message.totalWhiteFlowers));
  if (Number.isFinite(message.totalBlueFlowers)) player.blueFlowers = Math.max(0, Math.floor(message.totalBlueFlowers));
  if (Number.isFinite(message.totalCoins)) player.coins = Math.max(0, Math.floor(message.totalCoins));
  if ((Number(message.rewardExp) || 0) > 0) awardExp(Math.floor(message.rewardExp));
  if ((Number(message.rewardCoins) || 0) > 0) {
    showMenuFeedback(`QUEST COMPLETE! +${Math.floor(message.rewardCoins)} COINS · +${Math.floor(message.rewardExp)} EXP`, "#d9b9ff", 1.6);
  }
  updateBeachQuestPanel(message);
  setBeachQuestOpen(true);
  updateInventoryUi();
  updateCraftingUi();
  saveLocalCharacterState(true);
}

function interactWithMyrtle() {
  updateBeachQuestPanel({
    questNpcType: "greenWitch",
    questName: "Myrtle",
    dialogue: "The waterfall's voice curls through the air around her.",
    objectives: []
  });
  setBeachQuestOpen(true);
  return Boolean(onlineClient?.requestMyrtleQuest("talk"));
}

function interactWithNearbyObject() {
  const interaction =
    nearbySpawnInteraction();

  if (!interaction) {
    return false;
  }

  breakShadowHide();

  if (interaction.kind === "npc") {
    interactWithTutorialNpc();
    return true;
  }

  if (interaction.kind === "hunterNpc") {
    interactWithHunterNpc();
    return true;
  }

  if (interaction.kind === "placedNpc") {
    if (interaction.npcType === "shopkeeper") {
      interactWithTutorialNpc(interaction.npc);
      return true;
    }
    if (interaction.npcType === "hunter") {
      interactWithHunterNpc(interaction.npc);
      return true;
    }
    if (interaction.npcType === "beachGirl") {
      interactWithBeachGirl();
      return true;
    }
    if (interaction.npcType === "greenWitch") {
      interactWithMyrtle();
      return true;
    }
    if (interaction.npcType === "camoGuy") {
      interactWithCamoNpc(interaction.npc);
      return true;
    }
    if (interaction.npcType === "craftingTable") {
      interactWithWoodBench();
      return true;
    }
    if (interaction.npcType === "classResetCrystal") {
      interactWithClassResetCrystal();
      return true;
    }
  }

  if (interaction.kind === "bench") {
    interactWithWoodBench();
    return true;
  }

  if (interaction.kind === "classResetCrystal") {
    interactWithClassResetCrystal();
    return true;
  }

  return false;
}

const ACTIVE_SKILLS = {
  shadowHide: {
    name: "Shadow Hide",
    classId: "guile",
    maxLevel: 5,
    noEnhancements: true
  },
  hurl: {
    name: "Hurl",
    classId: "might",
    maxLevel: 5,
    noEnhancements: true
  },
  jesterBlink: {
    name: "Mirage",
    classId: "arcana",
    maxLevel: 20,
    noEnhancements: true,
    progressionMilestones: [
      { level: 1, name: "30px Blink", effectText: "2.0s return window · 20.0s cooldown from cast." },
      { level: 10, name: "44px Blink", effectText: "3.4s return window · 17.6s cooldown from cast." },
      { level: 20, name: "60px Blink", effectText: "5.0s return window · 15.0s cooldown from cast." }
    ]
  },
  wandMastery: {
    name: "Spellshred",
    classId: "arcana",
    maxLevel: 20,
    passive: true,
    noEnhancements: true,
    progressionMilestones: [
      { level: 1, name: "55 Power", effectText: "Target up to 0 additional foes." },
      { level: 10, name: "64 Power", effectText: "Target up to 1 additional foe." },
      { level: 20, name: "75 Power", effectText: "Target up to 2 additional foes." }
    ]
  },
  fireball: {
    name: "Ignite",
    classId: "arcana",
    maxLevel: 20,
    cooldown: 3.5,
    noEnhancements: true,
    progressionMilestones: [
      { level: 1, name: "100 Power", effectText: "Primary target takes full impact + On-Fire. Up to 4 nearby enemies receive On-Fire only. Burn: 20 Power/sec for 3s. 7.0s cooldown." },
      { level: 10, name: "150 Power", effectText: "Primary target takes full impact + On-Fire. Up to 4 nearby enemies receive On-Fire only. Burn: 20 Power/sec for 3s. 5.3s cooldown." },
      { level: 20, name: "200 Power", effectText: "Primary target takes full impact + On-Fire. Up to 4 nearby enemies receive On-Fire only. Burn: 20 Power/sec for 3s. 3.5s cooldown." }
    ]
  },
  strafe: {
    name: "Strafe",
    classId: "precision",
    maxLevel: 5,
    passive: true,
    levelProgression: [
      { name: "30% Move", effectText: "Move at 30% of normal speed while drawing the bow." },
      { name: "35% Move", effectText: "Move at 35% of normal speed while drawing the bow." },
      { name: "40% Move", effectText: "Move at 40% of normal speed while drawing the bow." },
      { name: "45% Move", effectText: "Move at 45% of normal speed while drawing the bow." },
      { name: "50% Move", effectText: "Move at 50% of normal speed while drawing the bow." }
    ],
    enhancementName: "Strafe Movement",
    enhancementEffect: "Toggle Strafe movement while drawing a bow or using Focus Fire.",
    singleScalingEnhancement: true,
    enhancementUnlockLevel: 1
  },
  camouflage: {
    name: "Camouflage",
    classId: "precision",
    maxLevel: 1,
    passive: true,
    noEnhancements: true,
    levelProgression: [
      {
        name: "Ambush Cover",
        effectText: "Stand still in tree canopy cover, tall grass, or fully grown Magic Grass for 1 second. Camouflage hides you from enemy sight. In PvP you are completely hidden from opted-in opponents, with only an intermittent leaf tell. Your first attack breaks Camouflage; if that opening attack hits, the target is confused for 1.25 seconds before normal aggro."
      }
    ]
  },
  focusFire: {
    name: "Focus Fire",
    classId: "precision",
    maxLevel: 1,
    noEnhancements: true,
    levelProgression: [
      {
        name: "Focus Fire",
        effectText: "Hold to set distance, release an arcing marker arrow, then fire every 0.5s for 5s. In PvP each follow-up aims at the locked player\'s position when that arrow is released; arrows never home after launch, and Camouflage breaks the lock. The first hits are deliberately weak, but consecutive hits ramp sharply toward the end."
      }
    ]
  },
  huntersSnare: {
    name: "Hunter's Snare",
    classId: "precision",
    maxLevel: 1,
    noEnhancements: true,
    levelProgression: [
      {
        name: "Hunter's Snare",
        effectText: "Store up to 3 charges. Stand still for 1.25 seconds to spend 1 charge and set a trap at your feet. Freed charges recover every 15 seconds. Keep up to 3 active traps. The first eligible monster to cross one is rooted for 0.65 seconds, then moves at 45% speed for 3 seconds."
      }
    ]
  },
  rainCloud: {
    name: "Rainbloom",
    classId: "arcana",
    maxLevel: 20,
    cooldown: 30.0,
    noEnhancements: true,
    progressionMilestones: [
      { level: 1, name: "10% Grass Slow", effectText: "2.0s cast · Magic Grass lasts 30s per tuft · 30.0s cooldown after cloud expiry." },
      { level: 10, name: "19% Grass Slow", effectText: "1.3s cast · Magic Grass lasts 30s per tuft · 25.3s cooldown after cloud expiry." },
      { level: 20, name: "30% Grass Slow", effectText: "0.5s cast · Magic Grass lasts 30s per tuft · 20.0s cooldown after cloud expiry." }
    ]
  }
};

const SKILL_ICON_PATHS = {
  shadowHide: "./assets/skills/shadow_hide_approved.png",
  hurl: "./assets/skills/hurl_approved.png",
  jesterBlink: "./assets/skills/jester_blink_approved.png",
  wandMastery: "./assets/shepherd_staff_v1.png",
  fireball: "./assets/skills/fireball_approved.png",
  strafe: "./assets/skills/strafe_precision_v2.png",
  camouflage: "./assets/skills/camouflage_precision_v2.png",
  focusFire: "./assets/skills/focus_fire_precision_v2.png",
  huntersSnare: "./assets/skills/hunters_snare_precision_v1.png",
  rainCloud: "./assets/skills/rain_cloud_approved.png"
};

function skillIconPath(skillId) {
  return SKILL_ICON_PATHS[skillId] || "";
}

function skillLevelProgression(skillId) {
  const skill = ACTIVE_SKILLS[skillId];
  if (!skill) return [];

  if (Array.isArray(skill.progressionMilestones)) {
    return skill.progressionMilestones.map(entry => ({
      level: Math.max(1, Math.floor(Number(entry.level) || 1)),
      name: entry.name || `LV ${entry.level}`,
      effectText: entry.effectText || ""
    }));
  }

  if (Array.isArray(skill.levelProgression)) {
    return Array.from(
      { length: skill.maxLevel },
      (_, index) => {
        const custom = skill.levelProgression[index] || {};
        return {
          level: index + 1,
          name: custom.name || `LV ${index + 1}`,
          effectText: custom.effectText || ""
        };
      }
    );
  }

  const entries = [
    { level: 1, name: "Unlock Ability", effectText: "Unlocks the base ability." }
  ];

  for (let level = 2; level <= skill.maxLevel; level++) {
    const tier = level - 1;
    const custom = Array.isArray(skill.enhancementUnlocks)
      ? skill.enhancementUnlocks[tier - 1]
      : null;

    entries.push({
      level,
      name: custom?.name || `Enhancement ${romanTier(tier)}`,
      effectText: custom?.effectText || skill.enhancementEffect
    });
  }

  return entries;
}

// Active abilities are independent of equipped weapons/armor.
// Skills begin locked and are manually assigned after being unlocked.
const skillBindings = {
  shift: null,
  space: null,
  e: null,
  r: null
};

function skillDisplayName(skillId) {
  return skillId && ACTIVE_SKILLS[skillId]
    ? ACTIVE_SKILLS[skillId].name
    : "Empty";
}

const PLAYER_CLASSES = Object.freeze({
  might: Object.freeze({ name: "Bruiser" }),
  arcana: Object.freeze({ name: "Magus" }),
  precision: Object.freeze({ name: "Ranger" }),
  guile: Object.freeze({ name: "Rogue" })
});

const ARMOR_CLASS_REQUIREMENTS = Object.freeze({
  hat_jester: "arcana",
  shirt_jester: "arcana",
  pants_jester: "arcana",
  hat_arcanist: "arcana",
  shirt_arcanist: "arcana",
  pants_arcanist: "arcana",

  hat_knight: "might",
  shirt_knight: "might",
  pants_knight: "might",

  hat_ninja: "guile",
  shirt_ninja: "guile",
  pants_ninja: "guile",

  hat_ranger: "precision",
  shirt_ranger: "precision",
  pants_ranger: "precision"
});

const EQUIPMENT_ATTRIBUTE_REQUIREMENTS = Object.freeze({
  hat_jester: Object.freeze({ level: 10, luck: 10 }),
  shirt_jester: Object.freeze({ level: 10, luck: 10 }),
  pants_jester: Object.freeze({ level: 10, luck: 10 }),
  hat_arcanist: Object.freeze({ level: 10, luck: 10 }),
  shirt_arcanist: Object.freeze({ level: 10, luck: 10 }),
  pants_arcanist: Object.freeze({ level: 10, luck: 10 }),

  hat_greencap: Object.freeze({ level: 5 }),
  shirt_greencap: Object.freeze({ level: 5 }),
  pants_greencap: Object.freeze({ level: 5 })
});

const WEAPON_CLASS_REQUIREMENTS = Object.freeze({
  weapon_wand: "arcana",
  weapon_rainWand: "arcana",
  weapon_lostKey: "arcana",
  weapon_hugeSunflower: "arcana",
  weapon_sapgemWand: "arcana",
  weapon_dreamcatcher: "precision",
  weapon_katana: "guile"
});

function armorRequiredClass(itemId) {
  return ARMOR_CLASS_REQUIREMENTS[itemId] || null;
}

function weaponRequiredClass(itemId) {
  return WEAPON_CLASS_REQUIREMENTS[itemId] || null;
}

function equipmentRequiredClass(itemId) {
  return armorRequiredClass(itemId) || weaponRequiredClass(itemId);
}

function equipmentAttributeRequirements(itemId) {
  return EQUIPMENT_ATTRIBUTE_REQUIREMENTS[itemId] || null;
}

function equipmentMissingRequirements(itemId) {
  const missing = [];
  const requiredClass = equipmentRequiredClass(itemId);
  const attributeRequirements = equipmentAttributeRequirements(itemId);
  const requiredLevel = Number(attributeRequirements?.level) || 0;
  const requiredLuck = Number(attributeRequirements?.luck) || 0;

  if (requiredClass && player.classId !== requiredClass) {
    missing.push(`Requires ${PLAYER_CLASSES[requiredClass]?.name || "Class"}`);
  }
  if (requiredLevel > 0 && Number(player.level) < requiredLevel) {
    missing.push(`Requires Lv ${requiredLevel}`);
  }
  if (requiredLuck > 0 && Number(player.stats?.luck) < requiredLuck) {
    missing.push(`Requires LUK ${requiredLuck}`);
  }

  return missing;
}

function equipmentItemCanBeEquipped(itemId) {
  return Boolean(itemId) && equipmentMissingRequirements(itemId).length === 0;
}

function armorItemCanBeEquipped(itemId) {
  return equipmentItemCanBeEquipped(itemId);
}

function showEquipmentClassRestriction(itemId) {
  const missing = equipmentMissingRequirements(itemId);
  if (!missing.length) return;

  spawnFloatingText(
    player.x,
    player.y - 31,
    missing.join(" · ").toUpperCase(),
    "#ffb4bc",
    0.9
  );
}

function showArmorClassRestriction(itemId) {
  showEquipmentClassRestriction(itemId);
}

function shopCategoryForItem(item) {
  return equipmentRequiredClass(item?.id) || "common";
}

function weaponTypeForShopItem(itemId) {
  if (["weapon_bow", "weapon_dreamcatcher"].includes(itemId)) return "Bow";
  if (["weapon_wand", "weapon_rainWand", "weapon_shepherdStaff", "weapon_lostKey", "weapon_hugeSunflower", "weapon_sapgemWand"].includes(itemId)) return "Wand";
  if (itemId === "weapon_axe") return "Axe";
  if (itemId === "weapon_pickaxe") return "Pickaxe";
  if (itemId === "weapon_katana") return "Katana";
  if (["weapon_sword", "weapon_oldSword"].includes(itemId)) return "Sword";
  return "Weapon";
}

function armorValueForItemId(itemId, valueKey = "armorDefense") {
  if (typeof COMBAT_BALANCE === "undefined") return 0;

  const hatIndex = HAT_ITEM_IDS.indexOf(itemId);
  if (hatIndex >= 0) return Number(COMBAT_BALANCE[valueKey]?.hats?.[hatIndex]) || 0;

  const shirtIndex = SHIRT_ITEM_IDS.indexOf(itemId);
  if (shirtIndex >= 0) return Number(COMBAT_BALANCE[valueKey]?.shirts?.[shirtIndex]) || 0;

  const pantsIndex = PANTS_ITEM_IDS.indexOf(itemId);
  if (pantsIndex >= 0) return Number(COMBAT_BALANCE[valueKey]?.pants?.[pantsIndex]) || 0;

  const charmIndex = CHARM_ITEM_IDS.indexOf(itemId);
  if (charmIndex >= 0) return Number(COMBAT_BALANCE[valueKey]?.charms?.[charmIndex]) || 0;

  return 0;
}

function armorRatingForItemId(itemId) {
  return armorValueForItemId(itemId, "armorDefense");
}

function armorResistForItemId(itemId) {
  return armorValueForItemId(itemId, "armorResist");
}

function weaponCombatProfileForItemId(itemId) {
  if (typeof COMBAT_BALANCE === "undefined") return null;
  const weaponIndex = WEAPON_ITEM_IDS.indexOf(itemId);
  return weaponIndex >= 0
    ? COMBAT_BALANCE.weaponProfiles?.[weaponIndex] || null
    : null;
}

function armorSlotNameForItemId(itemId) {
  if (HAT_ITEM_IDS.includes(itemId)) return "Head Armor";
  if (SHIRT_ITEM_IDS.includes(itemId)) return "Torso Armor";
  if (PANTS_ITEM_IDS.includes(itemId)) return "Leg Armor";
  if (CHARM_ITEM_IDS.includes(itemId)) return "Charm";
  return null;
}

function itemDisplayNameForId(itemId) {
  if (itemId === "charm_woodRing") return "Wood Ring";
  const shopItem = SHOP_ITEMS.find(item => item.id === itemId);
  if (shopItem?.name) return shopItem.name;
  const craftRecipe = Object.values(CRAFT_RECIPES).find(recipe => recipe?.itemId === itemId);
  if (craftRecipe?.name) return craftRecipe.name;
  const profile = weaponCombatProfileForItemId(itemId);
  return profile?.name || itemId;
}

function itemDetailData(itemId) {
  if (!itemId) return null;

  const image = shopImageForItemId(itemId);
  const requiredClass = equipmentRequiredClass(itemId);
  const classLabel = requiredClass
    ? PLAYER_CLASSES[requiredClass]?.name || "Unknown"
    : "Common";
  const attributeRequirements = equipmentAttributeRequirements(itemId);
  const requiredLevel = Number(attributeRequirements?.level) || 0;
  const requiredLuck = Number(attributeRequirements?.luck) || 0;
  const weaponProfile = weaponCombatProfileForItemId(itemId);

  if (weaponProfile) {
    const rows = [];
    if ((Number(weaponProfile.attackPower) || 0) > 0) {
      rows.push(["Attack Power", `${weaponProfile.attackPower}`]);
    }
    if ((Number(weaponProfile.magicPower) || 0) > 0) {
      rows.push(["Magic Power", `${weaponProfile.magicPower}`]);
    }
    const weaponIndex = WEAPON_ITEM_IDS.indexOf(itemId);
    const isBowWeapon = typeof COMBAT_BALANCE.isBowWeaponIndex === "function"
      ? COMBAT_BALANCE.isBowWeaponIndex(weaponIndex)
      : weaponIndex === 6 || weaponIndex === 7;
    if (!isBowWeapon) {
      const speedLabel = typeof COMBAT_BALANCE.weaponAttackSpeedLabel === "function"
        ? COMBAT_BALANCE.weaponAttackSpeedLabel(weaponIndex)
        : typeof COMBAT_BALANCE.wandAttackSpeedLabel === "function" && COMBAT_BALANCE.isWandWeaponIndex?.(weaponIndex)
          ? COMBAT_BALANCE.wandAttackSpeedLabel(weaponIndex)
          : "Normal";
      rows.push(["Attack Speed", speedLabel]);
    }
    rows.push(["Class", classLabel]);
    if (requiredLevel > 0) rows.push(["Required Lv", `${requiredLevel}`]);
    if (requiredLuck > 0) rows.push(["Required LUK", `${requiredLuck}`]);

    return {
      name: itemDisplayNameForId(itemId),
      type: `${weaponTypeForShopItem(itemId)} Weapon`,
      image,
      rows
    };
  }

  const armorSlot = armorSlotNameForItemId(itemId);
  if (armorSlot) {
    return {
      name: itemDisplayNameForId(itemId),
      type: armorSlot,
      image,
      rows: [
        ["Armor", `${armorRatingForItemId(itemId)}`],
        ["Resist", `${armorResistForItemId(itemId)}`],
        ["Class", classLabel],
        ...(requiredLevel > 0 ? [["Required Lv", `${requiredLevel}`]] : []),
        ...(requiredLuck > 0 ? [["Required LUK", `${requiredLuck}`]] : [])
      ]
    };
  }

  return null;
}

function positionItemDetailTooltip(clientX, clientY) {
  const tooltip = document.getElementById("itemDetailTooltip");
  if (!tooltip || !tooltip.classList.contains("show")) return;

  const margin = 12;
  const width = tooltip.offsetWidth || 280;
  const height = tooltip.offsetHeight || 170;
  let left = clientX + 14;
  let top = clientY + 14;

  if (left + width + margin > window.innerWidth) {
    left = clientX - width - 14;
  }
  if (top + height + margin > window.innerHeight) {
    top = clientY - height - 14;
  }

  tooltip.style.left = `${Math.max(margin, left)}px`;
  tooltip.style.top = `${Math.max(margin, top)}px`;
}

function showItemDetailTooltip(itemId, clientX, clientY) {
  const tooltip = document.getElementById("itemDetailTooltip");
  const data = itemDetailData(itemId);
  if (!tooltip || !data) return;
  if (window.matchMedia("(hover: none) and (pointer: coarse)").matches) return;

  const image = document.getElementById("itemDetailImage");
  const name = document.getElementById("itemDetailName");
  const type = document.getElementById("itemDetailType");
  const stats = document.getElementById("itemDetailStats");

  if (image && data.image) {
    image.src = data.image.src;
    image.alt = data.name;
  }
  if (name) name.textContent = data.name;
  if (type) type.textContent = data.type;
  if (stats) {
    stats.innerHTML = data.rows.map(([label, value]) =>
      `<div class="item-detail-stat"><span>${label}</span><strong>${value}</strong></div>`
    ).join("");
  }

  tooltip.classList.add("show");
  tooltip.setAttribute("aria-hidden", "false");
  positionItemDetailTooltip(clientX, clientY);
}

function hideItemDetailTooltip() {
  const tooltip = document.getElementById("itemDetailTooltip");
  if (!tooltip) return;
  tooltip.classList.remove("show");
  tooltip.setAttribute("aria-hidden", "true");
}

function itemDetailIdFromElement(element) {
  return element?.dataset?.ownedItem ||
    element?.dataset?.shopItemId ||
    element?.dataset?.itemDetailId ||
    null;
}

function itemDetailTargetFromNode(node) {
  return node?.closest?.("[data-owned-item], [data-shop-item-id], [data-item-detail-id]") || null;
}

document.addEventListener("mouseover", event => {
  const target = itemDetailTargetFromNode(event.target);
  if (!target) return;
  const itemId = itemDetailIdFromElement(target);
  if (!itemId) return;
  showItemDetailTooltip(itemId, event.clientX, event.clientY);
});

document.addEventListener("mousemove", event => {
  if (document.getElementById("itemDetailTooltip")?.classList.contains("show")) {
    positionItemDetailTooltip(event.clientX, event.clientY);
  }
});

document.addEventListener("mouseout", event => {
  const target = itemDetailTargetFromNode(event.target);
  if (!target) return;
  const nextTarget = itemDetailTargetFromNode(event.relatedTarget);
  if (nextTarget === target) return;
  hideItemDetailTooltip();
});

document.addEventListener("focusin", event => {
  const target = itemDetailTargetFromNode(event.target);
  const itemId = itemDetailIdFromElement(target);
  if (!target || !itemId) return;
  const rect = target.getBoundingClientRect();
  showItemDetailTooltip(itemId, rect.right, rect.top);
});

document.addEventListener("focusout", event => {
  if (itemDetailTargetFromNode(event.target)) hideItemDetailTooltip();
});

function shopItemMetadata(item) {
  if (!item?.id) return "";

  const requiredClass = equipmentRequiredClass(item.id);
  const armor = armorRatingForItemId(item.id);
  const resist = armorResistForItemId(item.id);
  const attributeRequirements = equipmentAttributeRequirements(item.id);
  const requirementParts = [];

  if (requiredClass) {
    requirementParts.push(`Requires ${PLAYER_CLASSES[requiredClass]?.name || "Unknown"}`);
  } else {
    requirementParts.push("Common");
  }
  if ((Number(attributeRequirements?.level) || 0) > 0) {
    requirementParts.push(`Lv ${Number(attributeRequirements.level)}`);
  }
  if ((Number(attributeRequirements?.luck) || 0) > 0) {
    requirementParts.push(`LUK ${Number(attributeRequirements.luck)}`);
  }

  if (WEAPON_ITEM_IDS.includes(item.id)) {
    const weaponType = weaponTypeForShopItem(item.id);
    const profile = weaponCombatProfileForItemId(item.id);
    const power = [];
    if ((Number(profile?.attackPower) || 0) > 0) power.push(`ATK ${profile.attackPower}`);
    if ((Number(profile?.magicPower) || 0) > 0) power.push(`MAG ${profile.magicPower}`);
    return `${weaponType} · ${power.join(" · ")} · ${requirementParts.join(" · ")}`;
  }

  if (requiredClass || attributeRequirements) {
    return `Armor ${armor} · Resist ${resist} · ${requirementParts.join(" · ")}`;
  }

  if (HAT_ITEM_IDS.includes(item.id)) return `Head Armor · Armor ${armor} · Resist ${resist} · Common`;
  if (SHIRT_ITEM_IDS.includes(item.id)) return `Torso Armor · Armor ${armor} · Resist ${resist} · Common`;
  if (PANTS_ITEM_IDS.includes(item.id)) return `Leg Armor · Armor ${armor} · Resist ${resist} · Common`;
  return "Common";
}

function playerHasChosenClass() {
  return Boolean(player.classId && PLAYER_CLASSES[player.classId]);
}

function refundAllAbilityPoints() {
  let refunded = 0;

  for (const skillId of Object.keys(player.abilities || {})) {
    const level = Math.max(0, Number(player.abilities[skillId]) || 0);
    refunded += level;
    player.abilities[skillId] = 0;
  }

  player.abilityPoints = Math.max(0, Number(player.abilityPoints) || 0) + refunded;
  return refunded;
}

function clearSkillToolbarBindings() {
  for (const key of Object.keys(skillBindings)) {
    skillBindings[key] = null;
  }
}

function clearClassLockedHotbarItems() {
  let removed = 0;

  for (let slotIndex = 0; slotIndex < HOTBAR_SLOT_COUNT; slotIndex++) {
    const itemId = player.hotbarAssignments?.[slotIndex];
    if (!itemId) continue;

    if (equipmentRequiredClass(itemId)) {
      player.hotbarAssignments[slotIndex] = null;
      removed += 1;
    }
  }

  sanitizeHotbarAssignments();
  return removed;
}

function resetClassAndSkills() {
  if (focusFireIsCasting()) cancelFocusFire();
  if (fireballIsAiming()) cancelFireballAim();
  if (player.hunterSnareSetting) cancelHunterSnarePlacement(false);

  const refunded = refundAllAbilityPoints();
  clearSkillToolbarBindings();
  player.enhancementToggles = {};
  player.classId = null;

  player.hatIndex = -1;
  player.shirtIndex = -1;
  player.pantsIndex = -1;
  player.weaponIndex = -1;

  const removedHotbar = clearClassLockedHotbarItems();
  player.skillCooldowns = { fireball: 0, rainCloud: 0 };
  player.skillCooldownEndTimes = { fireball: 0, rainCloud: 0 };
  player.jesterBlinkCooldown = 0;
  player.jesterBlinkCooldownEndAtMs = 0;

  updateInventoryUi();

  if (typeof onlineClient !== "undefined" && onlineClient?.connected) {
    onlineClient.sendLocalState(true);
  }

  const note = [];
  if (refunded > 0) note.push(`+${refunded} AP`);
  if (removedHotbar > 0) note.push(`${removedHotbar} hotbar`);
  const suffix = note.length ? ` (${note.join(" · ")})` : "";

  spawnFloatingText(
    player.x,
    player.y - 36,
    `SKILLS RESET${suffix}`,
    "#e6c8ff",
    1.1
  );

  return true;
}

function skillBelongsToSelectedClass(skillId) {
  const skill = ACTIVE_SKILLS[skillId];
  return Boolean(
    skill &&
    playerHasChosenClass() &&
    skill.classId === player.classId
  );
}

function choosePlayerClass(classId) {
  if (playerHasChosenClass()) return false;
  if (!PLAYER_CLASSES[classId]) return false;

  player.classId = classId;

  // Any test bindings made before choosing a class are cleared if they point
  // outside the chosen tree. Existing ability levels are left untouched so a
  // dev/test session never loses AP, but off-class skills become unusable.
  for (const key of Object.keys(skillBindings)) {
    const skillId = skillBindings[key];
    if (skillId && ACTIVE_SKILLS[skillId]?.classId !== classId) {
      skillBindings[key] = null;
    }
  }

  showSkillCategory(classId);
  updateInventoryUi();

  if (typeof onlineClient !== "undefined" && onlineClient?.connected) {
    onlineClient.sendLocalState(true);
  }

  return true;
}

function updateClassSelectionUi() {
  const skillsPage = document.getElementById("skillsPage");
  const chosen = playerHasChosenClass();

  if (typeof updateSkillClassHeading === "function") {
    updateSkillClassHeading();
  }

  if (skillsPage) {
    skillsPage.classList.toggle("class-unselected", !chosen);
    skillsPage.classList.toggle("class-selected", chosen);
  }

  document.querySelectorAll(".skill-category-tab").forEach(tab => {
    const locked = chosen && tab.dataset.skillCategory !== player.classId;
    tab.disabled = locked;
    tab.classList.toggle("class-locked", locked);
    tab.setAttribute("aria-disabled", locked ? "true" : "false");
  });

  document.querySelectorAll(".skill-category-panel").forEach(panel => {
    panel.classList.toggle(
      "class-locked",
      chosen && panel.dataset.skillCategoryPanel !== player.classId
    );
  });
}



function upgradeAbility(skillId) {
  const skill = ACTIVE_SKILLS[skillId];
  if (!skill || !skillBelongsToSelectedClass(skillId)) return false;

  const level = abilityLevel(skillId);
  if (level >= skill.maxLevel) return false;
  if (player.abilityPoints <= 0) return false;

  player.abilityPoints -= 1;
  player.abilities[skillId] = level + 1;

  updateInventoryUi();

  if (typeof onlineClient !== "undefined" && onlineClient?.connected) {
    onlineClient.sendLocalState(true);
  }

  // Spending a point while the card is already hovered should update the
  // visible tooltip immediately. Previously the tooltip contents were only
  // rebuilt on mouse-enter, so the player had to move off the card and back.
  const tooltip = document.getElementById("skillDetailTooltip");
  if (
    tooltip?.classList.contains("show") &&
    tooltip.dataset.skillId === skillId
  ) {
    refreshSkillDetailTooltip(skillId);
  }

  return true;
}

function romanTier(n) {
  const numerals = ["I", "II", "III", "IV"];
  return numerals[n - 1] || String(n);
}

function getAvailableEnhancements() {
  const list = [];

  for (const [skillId, skill] of Object.entries(ACTIVE_SKILLS)) {
    if (!skillBelongsToSelectedClass(skillId)) {
      continue;
    }

    const level = abilityLevel(skillId);

    if (skill.noEnhancements) {
      continue;
    }

    // Some skills (currently Strafe) own one enhancement that levels alongside
    // the skill instead of spawning a new enhancement entry at each rank.
    if (skill.singleScalingEnhancement) {
      const unlockLevel = Math.max(1, Number(skill.enhancementUnlockLevel) || 1);

      if (level >= unlockLevel) {
        list.push({
          id: `${skillId}_enh_1`,
          skillId,
          tier: 1,
          enhancementLevel: level,
          maxEnhancementLevel: skill.maxLevel,
          scaling: true,
          unlockLevel,
          name: skill.enhancementName || `${skill.name} Enhancement`,
          effectText:
            `${skill.enhancementEffect} Enhancement LV ${level} / ${skill.maxLevel}.`
        });
      }

      continue;
    }

    if (Array.isArray(skill.enhancementUnlockLevels)) {
      skill.enhancementUnlockLevels.forEach((unlockLevel, index) => {
        if (level < unlockLevel) return;

        const tier = index + 1;
        const custom = Array.isArray(skill.enhancementUnlocks)
          ? skill.enhancementUnlocks[index]
          : null;

        list.push({
          id: `${skillId}_enh_${tier}`,
          skillId,
          tier,
          unlockLevel,
          name: custom?.name || skill.enhancementName || `${skill.name} Enhancement`,
          effectText: custom?.effectText || skill.enhancementEffect
        });
      });

      continue;
    }

    // Default active-skill progression: LV2-LV5 unlock one enhancement each.
    for (let tier = 1; tier <= Math.max(0, level - 1); tier++) {
      const custom = Array.isArray(skill.enhancementUnlocks)
        ? skill.enhancementUnlocks[tier - 1]
        : null;

      list.push({
        id: `${skillId}_enh_${tier}`,
        skillId,
        tier,
        name: custom?.name || `${skill.enhancementName} ${romanTier(tier)}`,
        effectText: custom?.effectText || skill.enhancementEffect
      });
    }
  }

  return list;
}

function enhancementById(id) {
  return getAvailableEnhancements().find(entry => entry.id === id) || null;
}

function enhancementToggleState(id) {
  if (!enhancementById(id)) return false;

  const toggles = player.enhancementToggles || (player.enhancementToggles = {});
  // Newly learned enhancements begin enabled automatically.
  return toggles[id] !== false;
}

function setEnhancementToggle(id, enabled) {
  if (!enhancementById(id)) return false;

  const toggles = player.enhancementToggles || (player.enhancementToggles = {});
  toggles[id] = Boolean(enabled);
  updateInventoryUi();
  return true;
}

function hasEnhancement(id) {
  return enhancementToggleState(id);
}

function renderSkillEnhancementToggles(node, skillId) {
  const enhancements = getAvailableEnhancements().filter(entry => entry.skillId === skillId);
  let list = node.querySelector(".skill-enhancement-list");

  if (!enhancements.length) {
    if (list) list.remove();
    return;
  }

  if (!list) {
    list = document.createElement("div");
    list.className = "skill-enhancement-list";
    const description = node.querySelector(".skill-description");
    if (description) {
      description.insertAdjacentElement("afterend", list);
    } else {
      node.appendChild(list);
    }
  }

  const signature = enhancements.map(enh =>
    `${enh.id}:${enh.enhancementLevel || enh.tier || 1}:${enhancementToggleState(enh.id) ? 1 : 0}`
  ).join("|");

  if (list.dataset.signature === signature) return;
  list.dataset.signature = signature;

  list.innerHTML = `
    <div class="skill-enhancement-title">Enhancements</div>
    ${enhancements.map(enh => {
      const enabled = enhancementToggleState(enh.id);
      return `
        <div class="skill-enhancement-row ${enabled ? "enabled" : ""}">
          <div class="skill-enhancement-copy">
            <div class="skill-enhancement-name">${enh.name}</div>
            <div class="skill-enhancement-desc">${enh.effectText}</div>
          </div>
          <button type="button"
                  class="skill-enhancement-toggle ${enabled ? "active" : ""}"
                  data-enh-id="${enh.id}"
                  aria-pressed="${enabled ? "true" : "false"}">
            ${enabled ? "ON" : "OFF"}
          </button>
        </div>
      `;
    }).join("")}
  `;
}



function getBoundKeyForSkill(skillId) {
  for (const [key, boundSkill] of Object.entries(skillBindings)) {
    if (boundSkill === skillId) return key;
  }
  return null;
}

function bindSkillToKey(skillId, key) {
  if (!ACTIVE_SKILLS[skillId]) return;
  if (!skillBelongsToSelectedClass(skillId)) return;
  if (!isAbilityUnlocked(skillId)) return;

  // A skill occupies at most one active key.
  for (const existingKey of Object.keys(skillBindings)) {
    if (skillBindings[existingKey] === skillId) {
      skillBindings[existingKey] = null;
    }
  }

  // Empty string means explicitly unbind this skill.
  if (key && Object.prototype.hasOwnProperty.call(skillBindings, key)) {
    // One skill per key: assigning here automatically displaces the old one.
    skillBindings[key] = skillId;
  }

  updateSkillBindingUi();
}

function moveSkillBinding(sourceKey, targetKey) {
  if (sourceKey === targetKey) return true;
  if (!Object.prototype.hasOwnProperty.call(skillBindings, sourceKey)) return false;
  if (!Object.prototype.hasOwnProperty.call(skillBindings, targetKey)) return false;

  const movingSkill = skillBindings[sourceKey];
  if (!movingSkill || !ACTIVE_SKILLS[movingSkill] || !isAbilityUnlocked(movingSkill)) {
    return false;
  }

  const displacedSkill = skillBindings[targetKey] || null;
  skillBindings[targetKey] = movingSkill;
  skillBindings[sourceKey] = displacedSkill;

  updateSkillBindingUi();
  renderSkillTreeSelectionState();
  return true;
}

let selectedSkillTreeSkillId = null;

function skillTreePanelForClass(classId) {
  return document.querySelector(
    `.skill-category-panel[data-skill-category-panel="${classId}"]`
  );
}

function ensureSelectedSkillForClass(classId = player.classId) {
  if (
    selectedSkillTreeSkillId &&
    ACTIVE_SKILLS[selectedSkillTreeSkillId]?.classId === classId
  ) {
    return selectedSkillTreeSkillId;
  }

  const panel = skillTreePanelForClass(classId);
  const firstNode = panel?.querySelector(".skill-node[data-skill-node]");
  selectedSkillTreeSkillId = firstNode?.dataset.skillNode || null;
  return selectedSkillTreeSkillId;
}

function selectSkillTreeSkill(skillId) {
  if (!ACTIVE_SKILLS[skillId]) return false;
  selectedSkillTreeSkillId = skillId;
  renderSkillTreeSelectionState();
  return true;
}

function renderSkillTreeSelectionState() {
  document.querySelectorAll(".skill-node[data-skill-node]").forEach(node => {
    const skillId = node.dataset.skillNode;
    const skill = ACTIVE_SKILLS[skillId];
    const draggable = Boolean(
      skill && !skill.passive && isAbilityUnlocked(skillId)
    );

    node.classList.toggle("selected", skillId === selectedSkillTreeSkillId);
    node.classList.toggle("bound", Boolean(getBoundKeyForSkill(skillId)));
    node.classList.toggle("skill-draggable", draggable);
    node.draggable = draggable;
    node.setAttribute("aria-grabbed", "false");
    node.title = "";

    const icon = node.querySelector(".skill-node-icon");
    if (icon) {
      icon.draggable = false;
      icon.removeAttribute("title");
    }
  });

  const activeSkill = selectedSkillTreeSkillId;
  document.querySelectorAll(".skill-key-slot[data-skill-key]").forEach(slot => {
    const key = slot.dataset.skillKey;
    const canBind = Boolean(
      activeSkill &&
      ACTIVE_SKILLS[activeSkill] &&
      !ACTIVE_SKILLS[activeSkill].passive &&
      isAbilityUnlocked(activeSkill)
    );
    slot.classList.toggle("bind-target", canBind && skillBindings[key] !== activeSkill);
    slot.classList.toggle("bound", Boolean(skillBindings[key]));
  });
}

function skillDescriptionFromNode(skillId) {
  const skill = ACTIVE_SKILLS[skillId];
  if (!skill) return "";
  const panel = skillTreePanelForClass(skill.classId);
  return panel
    ?.querySelector(`.skill-node[data-skill-node="${skillId}"] .skill-description`)
    ?.textContent?.trim() || "";
}

function skillLevelEffectText(skillId, level) {
  const skill = ACTIVE_SKILLS[skillId];
  if (!skill) return "";
  const cleanLevel = Math.max(0, Math.floor(Number(level) || 0));
  if (cleanLevel <= 0) return "Not unlocked.";

  if (
    skillId === "fireball" &&
    typeof COMBAT_BALANCE !== "undefined" &&
    typeof COMBAT_BALANCE.abilityPowerAtLevel === "function"
  ) {
    const power = COMBAT_BALANCE.abilityPowerAtLevel(skillId, cleanLevel);
    const cooldown = fireballCooldownAtLevel(cleanLevel);
    return `${power} Power · Fire element. Burn: 20 Power/sec for 3s (2 ticks/sec). ${cooldown.toFixed(1)}s cooldown.`;
  }

  if (skillId === "rainCloud" && typeof ABILITY_SCALING !== "undefined") {
    const slowPercent = ABILITY_SCALING.rainCloudGrassSlowPercentAtLevel(cleanLevel);
    const cooldown = ABILITY_SCALING.rainCloudCooldownAtLevel(cleanLevel);
    const castTime = typeof ABILITY_SCALING.rainCloudCastTimeAtLevel === "function"
      ? ABILITY_SCALING.rainCloudCastTimeAtLevel(cleanLevel)
      : 0.5;
    const grassLifetime = typeof RAIN_FIELD !== "undefined" ? RAIN_FIELD.CELL_LIFETIME : 30;
    return `${Math.round(slowPercent)}% Magic Grass slow. ${castTime.toFixed(1)}s cast. ${grassLifetime.toFixed(0)}s grass duration per tuft. ${cooldown.toFixed(1)}s cooldown after cloud expiry.`;
  }

  if (skillId === "jesterBlink" && typeof ABILITY_SCALING !== "undefined") {
    const blinkRange = ABILITY_SCALING.hallucinationBlinkRangeAtLevel(cleanLevel);
    const decoyDuration = ABILITY_SCALING.hallucinationDecoyDurationAtLevel(cleanLevel);
    const cooldown = ABILITY_SCALING.hallucinationCooldownAtLevel(cleanLevel);
    return `${Math.round(blinkRange)}px blink. ${decoyDuration.toFixed(1)}s return window. ${cooldown.toFixed(1)}s cooldown from cast.`;
  }

  if (
    skillId === "wandMastery" &&
    typeof COMBAT_BALANCE !== "undefined" &&
    typeof COMBAT_BALANCE.abilityPowerAtLevel === "function"
  ) {
    const power = COMBAT_BALANCE.abilityPowerAtLevel("wandMasteryMelee", cleanLevel);
    const additionalFoes = Math.max(0, wandMasteryMaxTargets(cleanLevel) - 1);
    return `${power} Power. Target up to ${additionalFoes} additional ${additionalFoes === 1 ? "foe" : "foes"}.`;
  }

  const progression = skillLevelProgression(skillId);
  const exact = progression.find(entry => entry.level === cleanLevel);
  if (exact) {
    return [exact.name, exact.effectText].filter(Boolean).join(" · ");
  }

  const prior = progression
    .filter(entry => entry.level <= cleanLevel)
    .sort((a, b) => b.level - a.level)[0];

  return prior
    ? [prior.name, prior.effectText].filter(Boolean).join(" · ")
    : `Skill level ${cleanLevel}.`;
}

function positionSkillDetailTooltip(clientX, clientY) {
  const tooltip = document.getElementById("skillDetailTooltip");
  if (!tooltip || !tooltip.classList.contains("show")) return;

  const margin = 12;
  const width = tooltip.offsetWidth || 292;
  const height = tooltip.offsetHeight || 250;
  let left = clientX + 14;
  let top = clientY + 14;

  if (left + width + margin > window.innerWidth) {
    left = clientX - width - 14;
  }
  if (top + height + margin > window.innerHeight) {
    top = clientY - height - 14;
  }

  tooltip.style.left = `${Math.max(margin, left)}px`;
  tooltip.style.top = `${Math.max(margin, top)}px`;
}

function refreshSkillDetailTooltip(skillId) {
  const skill = ACTIVE_SKILLS[skillId];
  const tooltip = document.getElementById("skillDetailTooltip");
  if (!skill || !tooltip) return false;

  const level = abilityLevel(skillId);
  const nextLevel = level < skill.maxLevel ? level + 1 : null;
  const image = document.getElementById("skillTooltipImage");
  const name = document.getElementById("skillTooltipName");
  const meta = document.getElementById("skillTooltipMeta");
  const description = document.getElementById("skillTooltipDescription");
  const current = document.getElementById("skillTooltipCurrent");
  const next = document.getElementById("skillTooltipNext");

  if (image) {
    image.src = skillIconPath(skillId);
    image.alt = skill.name;
  }
  if (name) name.textContent = skill.name;
  if (meta) {
    meta.textContent = (skillId === "wandMastery" || skillId === "fireball")
      ? (skill.passive ? "[Passive Skill]" : "[Active Skill]")
      : `${skill.passive ? "Passive" : "Active"} · LV ${level} / ${skill.maxLevel}`;
  }
  if (description) description.textContent = skillDescriptionFromNode(skillId);
  if (current) current.textContent = skillLevelEffectText(skillId, level);
  if (next) {
    next.textContent = nextLevel
      ? `LV ${nextLevel}: ${skillLevelEffectText(skillId, nextLevel)}`
      : "Max level reached.";
  }

  tooltip.dataset.skillId = skillId;
  return true;
}

function showSkillDetailTooltip(skillId, clientX, clientY) {
  const tooltip = document.getElementById("skillDetailTooltip");
  if (!tooltip || !refreshSkillDetailTooltip(skillId)) return;
  if (window.matchMedia("(hover: none) and (pointer: coarse)").matches) return;

  tooltip.classList.add("show");
  tooltip.setAttribute("aria-hidden", "false");
  positionSkillDetailTooltip(clientX, clientY);
}

function hideSkillDetailTooltip() {
  const tooltip = document.getElementById("skillDetailTooltip");
  if (!tooltip) return;
  tooltip.classList.remove("show");
  tooltip.setAttribute("aria-hidden", "true");
  delete tooltip.dataset.skillId;
}

function updateSkillClassHeading() {
  const heading = document.getElementById("skillClassHeading");
  if (!heading) return;
  const className = PLAYER_CLASSES[player.classId]?.name;
  heading.textContent = className
    ? `Introduction to the ${className}`
    : "Skill Arts";
}

function setupSkillTreeUi() {
  const skillsPage = document.getElementById("skillsPage");
  if (!skillsPage) return;

  const header = skillsPage.querySelector(".stats-header");
  const heading = header?.querySelector(".menu-section-title");
  if (heading) heading.id = "skillClassHeading";

  const abilityPointText = document.getElementById("abilityPointText");
  const categoryTabs = skillsPage.querySelector(".skill-category-tabs");
  const panels = Array.from(
    skillsPage.querySelectorAll(".skill-category-panel[data-skill-category-panel]")
  );
  const keyStrip = document.querySelector("#menuSkillHotkeyRail .skill-key-strip");

  let workspace = skillsPage.querySelector(".skill-workspace");
  if (!workspace) {
    workspace = document.createElement("div");
    workspace.className = "skill-workspace";

    const listPane = document.createElement("div");
    listPane.className = "skill-list-pane";

    if (categoryTabs) categoryTabs.insertAdjacentElement("afterend", workspace);
    else if (header) header.insertAdjacentElement("afterend", workspace);
    else skillsPage.appendChild(workspace);

    workspace.appendChild(listPane);

    for (const panel of panels) listPane.appendChild(panel);

    if (abilityPointText) {
      const footer = document.createElement("div");
      footer.className = "skill-list-footer";
      footer.appendChild(abilityPointText);
      listPane.appendChild(footer);
    }
  }

  const slotKeys = ["shift", "space", "e", "r"];
  keyStrip?.querySelectorAll(".skill-key-slot").forEach((slot, index) => {
    slot.dataset.skillKey = slotKeys[index] || "";
    slot.tabIndex = 0;
    slot.title = "Drop a skill here · right-click to clear";
  });

  skillsPage.addEventListener("click", event => {
    const upgrade = event.target.closest(".ability-upgrade-button[data-ability-id]");
    if (upgrade) {
      selectSkillTreeSkill(upgrade.dataset.abilityId);
      return;
    }

    const node = event.target.closest(".skill-node[data-skill-node]");
    if (node) selectSkillTreeSkill(node.dataset.skillNode);
  });

  skillsPage.addEventListener("mouseover", event => {
    const node = event.target.closest(".skill-node[data-skill-node]");
    if (!node) return;
    const fromNode = event.relatedTarget?.closest?.(".skill-node[data-skill-node]");
    if (fromNode === node) return;
    showSkillDetailTooltip(node.dataset.skillNode, event.clientX, event.clientY);
  });

  skillsPage.addEventListener("mousemove", event => {
    if (document.getElementById("skillDetailTooltip")?.classList.contains("show")) {
      positionSkillDetailTooltip(event.clientX, event.clientY);
    }
  });

  skillsPage.addEventListener("mouseout", event => {
    const node = event.target.closest(".skill-node[data-skill-node]");
    if (!node) return;
    const nextNode = event.relatedTarget?.closest?.(".skill-node[data-skill-node]");
    if (nextNode === node) return;
    hideSkillDetailTooltip();
  });

  skillsPage.addEventListener("focusin", event => {
    const node = event.target.closest(".skill-node[data-skill-node]");
    if (!node) return;
    const rect = node.getBoundingClientRect();
    showSkillDetailTooltip(node.dataset.skillNode, rect.right, rect.top);
  });

  skillsPage.addEventListener("focusout", event => {
    if (event.target.closest(".skill-node[data-skill-node]")) hideSkillDetailTooltip();
  });

  skillsPage.addEventListener("dragstart", event => {
    const node = event.target.closest(".skill-node[data-skill-node]");
    if (!node || event.target.closest(".ability-upgrade-button")) {
      event.preventDefault();
      return;
    }

    const skillId = node.dataset.skillNode;
    if (!skillId || ACTIVE_SKILLS[skillId]?.passive || !isAbilityUnlocked(skillId)) {
      event.preventDefault();
      return;
    }

    selectSkillTreeSkill(skillId);
    hideSkillDetailTooltip();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", skillId);
    node.classList.add("dragging");
    node.setAttribute("aria-grabbed", "true");
  });

  skillsPage.addEventListener("dragend", event => {
    const node = event.target.closest(".skill-node[data-skill-node]");
    node?.classList.remove("dragging");
    node?.setAttribute("aria-grabbed", "false");
    document.querySelectorAll("#menuSkillHotkeyRail .skill-key-slot.drag-over")
      .forEach(slot => slot.classList.remove("drag-over"));
  });

  keyStrip?.addEventListener("click", event => {
    const slot = event.target.closest(".skill-key-slot[data-skill-key]");
    if (!slot) return;

    const selected = selectedSkillTreeSkillId;
    if (
      selected &&
      ACTIVE_SKILLS[selected] &&
      !ACTIVE_SKILLS[selected].passive &&
      isAbilityUnlocked(selected)
    ) {
      bindSkillToKey(selected, slot.dataset.skillKey);
      return;
    }

    const existing = skillBindings[slot.dataset.skillKey];
    if (existing) selectSkillTreeSkill(existing);
  });

  keyStrip?.addEventListener("dragstart", event => {
    const slot = event.target.closest(".skill-key-slot[data-skill-key]");
    if (!slot) return;

    const sourceKey = slot.dataset.skillKey;
    const skillId = skillBindings[sourceKey];
    if (!skillId || !isAbilityUnlocked(skillId)) {
      event.preventDefault();
      return;
    }

    selectSkillTreeSkill(skillId);
    hideSkillDetailTooltip();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-slime-skill-key", sourceKey);
    event.dataTransfer.setData("application/x-slime-skill", skillId);
    event.dataTransfer.setData("text/plain", skillId);
    slot.classList.add("dragging");
  });

  keyStrip?.addEventListener("dragend", event => {
    event.target.closest(".skill-key-slot[data-skill-key]")?.classList.remove("dragging");
    keyStrip.querySelectorAll(".skill-key-slot.drag-over")
      .forEach(slot => slot.classList.remove("drag-over"));
  });

  keyStrip?.addEventListener("dragover", event => {
    const slot = event.target.closest(".skill-key-slot[data-skill-key]");
    if (!slot) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    slot.classList.add("drag-over");
  });

  keyStrip?.addEventListener("dragleave", event => {
    const slot = event.target.closest(".skill-key-slot[data-skill-key]");
    slot?.classList.remove("drag-over");
  });

  keyStrip?.addEventListener("drop", event => {
    const slot = event.target.closest(".skill-key-slot[data-skill-key]");
    if (!slot) return;
    event.preventDefault();
    slot.classList.remove("drag-over");

    const targetKey = slot.dataset.skillKey;
    const sourceKey = event.dataTransfer.getData("application/x-slime-skill-key");
    if (sourceKey) {
      const movedSkill = skillBindings[sourceKey];
      if (moveSkillBinding(sourceKey, targetKey) && movedSkill) {
        selectSkillTreeSkill(movedSkill);
      }
      return;
    }

    const skillId =
      event.dataTransfer.getData("application/x-slime-skill") ||
      event.dataTransfer.getData("text/plain");
    bindSkillToKey(skillId, targetKey);
    if (skillId) selectSkillTreeSkill(skillId);
  });

  keyStrip?.addEventListener("contextmenu", event => {
    const slot = event.target.closest(".skill-key-slot[data-skill-key]");
    if (!slot) return;
    event.preventDefault();
    const key = slot.dataset.skillKey;
    if (Object.prototype.hasOwnProperty.call(skillBindings, key)) {
      skillBindings[key] = null;
      updateSkillBindingUi();
    }
  });

  document.querySelectorAll(".skill-node[data-skill-node]").forEach(node => {
    node.tabIndex = 0;
  });

  ensureSelectedSkillForClass(player.classId || "might");
  updateSkillClassHeading();
  renderSkillTreeSelectionState();
}

function updateAbilityTreeUi() {
  updateClassSelectionUi();

  const availableEnhancementIds = new Set(
    getAvailableEnhancements().map(entry => entry.id)
  );
  const toggles = player.enhancementToggles || (player.enhancementToggles = {});
  for (const id of Object.keys(toggles)) {
    if (!availableEnhancementIds.has(id)) delete toggles[id];
  }

  const abilityPointText = document.getElementById("abilityPointText");
  if (abilityPointText) {
    abilityPointText.textContent = `Ability Points ${player.abilityPoints}`;
  }

  document.querySelectorAll(".skill-node[data-skill-node]").forEach(node => {
    const skillId = node.dataset.skillNode;
    const skill = ACTIVE_SKILLS[skillId];
    if (!skill) return;

    const level = abilityLevel(skillId);
    const requirementMet = skillBelongsToSelectedClass(skillId);
    const unlocked = level > 0 && requirementMet;
    const maxed = level >= skill.maxLevel;

    node.classList.toggle("unlocked", unlocked);
    node.classList.toggle("locked", !unlocked);
    node.classList.toggle("ready", !unlocked && requirementMet);

    const status = node.querySelector(".skill-status");
    if (status) {
      status.textContent =
        !requirementMet ? "Class Locked" :
        maxed ? "MAX" :
        unlocked ? `LV ${level}` :
        "Ready";
    }

    let progression = node.querySelector(".skill-progression");
    if (!progression) {
      progression = document.createElement("div");
      progression.className = "skill-progression";
      const levelRow = node.querySelector(".skill-level-row");
      if (levelRow) {
        node.insertBefore(progression, levelRow);
      }
    }

    if (progression) {
      const progressionSignature = `${skillId}:${level}`;
      if (progression.dataset.signature !== progressionSignature) {
        progression.dataset.signature = progressionSignature;
        progression.innerHTML = skillLevelProgression(skillId).map(entry => {
          const reached = level >= entry.level;
          const current = level === entry.level;
          return `
            <div class="skill-progress-step ${reached ? "reached" : ""} ${current ? "current" : ""}"
                 title="${entry.effectText}">
              <span class="skill-progress-level">LV ${entry.level}</span>
              <span class="skill-progress-name">${entry.name}</span>
            </div>
          `;
        }).join("");
      }
    }

    const levelText = node.querySelector(".skill-level-text");
    if (levelText) {
      levelText.textContent = `LV ${level} / ${skill.maxLevel}`;
    }

    const upgradeButton = node.querySelector(".ability-upgrade-button");
    if (upgradeButton) {
      upgradeButton.textContent = maxed ? "MAX" : "+";
      upgradeButton.title = maxed
        ? "Max level"
        : level === 0
          ? `Unlock ${skill.name}`
          : `Level up ${skill.name}`;

      upgradeButton.disabled =
        !requirementMet ||
        maxed ||
        player.abilityPoints <= 0;
    }

    renderSkillEnhancementToggles(node, skillId);
  });
}

function updateAbilityCooldownHud() {
  const slotIds = {
    shift: { hud: "abilitySlotShift" },
    space: { hud: "abilitySlotSpace" },
    e: { hud: "abilitySlotE" },
    r: { hud: "abilitySlotR" }
  };

  for (const [key, targets] of Object.entries(slotIds)) {
    const boundSkill = skillBindings[key];
    const validSkill =
      boundSkill && isAbilityUnlocked(boundSkill)
        ? boundSkill
        : null;
    const hudSlot = document.getElementById(targets.hud);
    if (!hudSlot) continue;

    const cooldownRemaining = validSkill
      ? skillCooldownRemaining(validSkill)
      : 0;
    const cooldownDuration = validSkill
      ? skillCooldownDuration(validSkill)
      : 0;

    // Hallucination has two simultaneous clocks after the first blink:
    // the short clone-return window and the longer cooldown that already began
    // on cast. While the clone exists, surface the return window in the hotbar.
    // As soon as it is consumed/expires, reveal the already-elapsed cooldown.
    let displayRemaining = cooldownRemaining;
    let displayDuration = cooldownDuration;
    let displayKind = "cooldown";
    if (validSkill === "jesterBlink" && jesterClone?.mapId === currentMapId) {
      const cloneDuration = Math.max(0, Number(jesterClone.duration) || 0);
      const cloneRemaining = Number.isFinite(Number(jesterClone.expiresAtMs))
        ? Math.max(0, (Number(jesterClone.expiresAtMs) - Date.now()) / 1000)
        : Math.max(0, Number(jesterClone.life) || 0);
      if (cloneRemaining > 0 && cloneDuration > 0) {
        displayRemaining = cloneRemaining;
        displayDuration = cloneDuration;
        displayKind = "return";
      }
    }

    const showingTimer = displayRemaining > 0 && displayDuration > 0;
    const coolingDown = displayKind === "cooldown" && showingTimer;
    const returnWindow = displayKind === "return" && showingTimer;
    const cooldownMask = hudSlot.querySelector(".ability-cooldown-mask");
    const cooldownText = hudSlot.querySelector(".ability-cooldown-text");

    hudSlot.classList.toggle("cooling-down", coolingDown);
    hudSlot.classList.toggle("return-window", returnWindow);

    if (cooldownMask) {
      const fraction = showingTimer
        ? Math.max(0, Math.min(1, displayRemaining / displayDuration))
        : 0;
      cooldownMask.style.height = `${Math.round(fraction * 100)}%`;
    }

    if (cooldownText) {
      cooldownText.style.display = showingTimer ? "flex" : "none";
      cooldownText.textContent = showingTimer
        ? (displayRemaining >= 10
            ? String(Math.ceil(displayRemaining))
            : displayRemaining.toFixed(1))
        : "";
    }

    const label = hudSlot.querySelector(".hotbar-label")?.textContent || key.toUpperCase();
    hudSlot.title = validSkill
      ? `${label}: ${skillDisplayName(validSkill)}${returnWindow
          ? ` · ${displayRemaining.toFixed(1)}s return window`
          : coolingDown
            ? ` · ${displayRemaining.toFixed(1)}s cooldown`
            : ""}`
      : `${label}: Empty`;
  }
}

function updateSkillBindingUi() {
  const slotIds = {
    shift: { text: "skillSlotShift", icon: "skillSlotShiftIcon", hud: "abilitySlotShift" },
    space: { text: "skillSlotSpace", icon: "skillSlotSpaceIcon", hud: "abilitySlotSpace" },
    e: { text: "skillSlotE", icon: "skillSlotEIcon", hud: "abilitySlotE" },
    r: { text: "skillSlotR", icon: "skillSlotRIcon", hud: "abilitySlotR" }
  };

  document.querySelectorAll("[data-skill-icon]").forEach(icon => {
    const skillId = icon.dataset.skillIcon;
    const path = skillIconPath(skillId);
    if (path) icon.src = path;
  });

  for (const [key, targets] of Object.entries(slotIds)) {
    const boundSkill = skillBindings[key];
    const validSkill =
      boundSkill && isAbilityUnlocked(boundSkill)
        ? boundSkill
        : null;

    const textEl = document.getElementById(targets.text);
    if (textEl) {
      textEl.textContent = validSkill
        ? skillDisplayName(validSkill)
        : "Empty";
    }

    const menuSlot = document.querySelector(
      `#menuSkillHotkeyRail .skill-key-slot[data-skill-key="${key}"]`
    );
    if (menuSlot) {
      menuSlot.draggable = Boolean(validSkill);
      menuSlot.classList.toggle("bound", Boolean(validSkill));
      menuSlot.title = validSkill
        ? `${skillDisplayName(validSkill)} · drag to move/swap · right-click to clear`
        : "Drop a skill here · right-click to clear";
    }

    const iconEl = document.getElementById(targets.icon);
    if (iconEl) {
      if (validSkill) {
        iconEl.src = skillIconPath(validSkill);
        iconEl.alt = skillDisplayName(validSkill);
        iconEl.style.visibility = "visible";
      } else {
        iconEl.removeAttribute("src");
        iconEl.alt = "";
        iconEl.style.visibility = "hidden";
      }
    }

    const hudSlot = document.getElementById(targets.hud);
    if (hudSlot) {
      hudSlot.classList.toggle("empty", !validSkill);
      hudSlot.classList.toggle("active", Boolean(validSkill));
      const hudImg = hudSlot.querySelector(".ability-slot-img");
      if (hudImg) {
        if (validSkill) {
          hudImg.src = skillIconPath(validSkill);
          hudImg.alt = skillDisplayName(validSkill);
          hudImg.style.visibility = "visible";
        } else {
          hudImg.removeAttribute("src");
          hudImg.alt = "";
          hudImg.style.visibility = "hidden";
        }
      }
      const chargeBadge = hudSlot.querySelector(".ability-charge");
      if (chargeBadge) {
        const showCharges = validSkill === "huntersSnare";
        chargeBadge.style.display = showCharges ? "flex" : "none";
        if (showCharges) {
          chargeBadge.textContent = String(
            Math.max(0, Math.floor(Number(player.hunterSnareCharges) || 0))
          );
        }
      }

    }
  }

  updateAbilityCooldownHud();
  updateHunterSnareChargeUi();

  document.querySelectorAll(".skill-bind-button").forEach(button => {
    const skillId = button.dataset.skillId;
    const key = button.dataset.skillKey || "";
    const boundKey = getBoundKeyForSkill(skillId);
    const unlocked = isAbilityUnlocked(skillId);

    button.disabled = !unlocked;
    button.classList.toggle(
      "active",
      unlocked && (key ? boundKey === key : boundKey === null)
    );
  });

  if (playerHasChosenClass()) {
    ensureSelectedSkillForClass(player.classId);
    renderSkillTreeSelectionState();
  }
}



const HURL_GRAB_RANGE = 22;




















































function expNeededForLevel(level) {
  // Quick early progression for testing: 5, 7, 9, 11...
  return 5 + (level - 1) * 2;
}

function woodcuttingExpNeeded(level) {
  // Separate gathering curve so it grows a little more gradually.
  return 5 + (level - 1) * 3;
}

function awardExp(amount) {
  player.exp += amount;

  let levelsGained = 0;

  while (player.exp >= player.expToNext) {
    player.exp -= player.expToNext;
    player.level += 1;
    player.skillPoints += 5;
    player.abilityPoints += 3;
    player.expToNext = expNeededForLevel(player.level);
    levelsGained += 1;
  }

  if (levelsGained > 0) {
    // Keep the celebration clean: the progression rewards still happen, but
    // the only text shown during a level-up is LEVEL UP!.
    spawnFloatingText(
      player.x,
      player.y - 38,
      "LEVEL UP!",
      "#ffe070",
      1.35
    );
    spawnLevelUpBurst(player.x, player.y);

    if (
      typeof onlineClient !== "undefined"
    ) {
      onlineClient.sendVisualEffect(
        "levelUp",
        {
          level: player.level,
          x: player.x,
          y: player.y
        }
      );
    }

    return;
  }

  // Ordinary EXP gains still get their small popup when no level is reached.
  spawnFloatingText(
    player.x,
    player.y - 29,
    `+${amount} EXP`,
    "#9fdcff",
    1.05
  );
}

function awardWoodcuttingExp(amount) {
  const skill = player.woodcutting;
  skill.exp += amount;

  spawnFloatingText(
    player.x,
    player.y - 39,
    `+${amount} WC`,
    "#b9ef8d",
    1.0
  );

  while (skill.exp >= skill.expToNext) {
    skill.exp -= skill.expToNext;
    skill.level += 1;
    skill.expToNext = woodcuttingExpNeeded(skill.level);

    spawnFloatingText(
      player.x,
      player.y - 48,
      "WC UP!",
      "#ddff9e",
      1.25
    );
  }
}

function miningExpNeeded(level) {
  return 5 + (Math.max(1, Number(level) || 1) - 1) * 3;
}

function awardMiningExp(amount) {
  const skill = player.mining;
  skill.exp += amount;

  spawnFloatingText(
    player.x,
    player.y - 39,
    `+${amount} MIN`,
    "#c9c2bc",
    1.0
  );

  while (skill.exp >= skill.expToNext) {
    skill.exp -= skill.expToNext;
    skill.level += 1;
    skill.expToNext = miningExpNeeded(skill.level);

    spawnFloatingText(
      player.x,
      player.y - 48,
      "MINING UP!",
      "#e4ddd7",
      1.25
    );
  }
}

const MAX_PLAYER_STAT = 10;

function spendSkillPoint(stat) {
  if (player.skillPoints <= 0) return;
  if (!Object.prototype.hasOwnProperty.call(player.stats, stat)) return;
  if ((Number(player.stats[stat]) || 0) >= MAX_PLAYER_STAT) return;

  player.stats[stat] = Math.min(
    MAX_PLAYER_STAT,
    (Number(player.stats[stat]) || 0) + 1
  );
  player.skillPoints -= 1;
  updateInventoryUi();
}

let remotePlayerDrawDepth = 0;

function equippedWeapon() {
  if (player.weaponIndex < 0) {
    return null;
  }

  // Local gameplay must still require ownership. Remote rendering is
  // different: a remote player's synced weaponIndex describes THEIR
  // equipment and must not be hidden just because the viewer does not own
  // that same weapon.
  if (
    remotePlayerDrawDepth <= 0 &&
    !playerOwnsWeaponIndex(
      player.weaponIndex
    )
  ) {
    return null;
  }

  return WEAPON_STYLES[
    player.weaponIndex
  ];
}

function currentHatStyle() {
  return HAT_STYLES[player.hatIndex];
}

function currentShirtStyle() {
  return SHIRT_STYLES[player.shirtIndex];
}

function currentPantsStyle() {
  return PANTS_STYLES[player.pantsIndex];
}





function equipWeaponIndex(index) {
  if (focusFireIsCasting() || fireballIsAiming() || player.rainCloudCasting) return false;
  if (player.attackTime > 0) return false;

  if (
    index < 0 ||
    index >= WEAPON_ITEM_IDS.length ||
    !playerOwnsWeaponIndex(index)
  ) {
    return false;
  }

  const itemId = weaponItemIdForIndex(index);
  if (!equipmentItemCanBeEquipped(itemId)) {
    showEquipmentClassRestriction(itemId);
    return false;
  }

  player.weaponIndex = index;
  return true;
}

function selectHotbarSlot(slotIndex) {
  if (
    slotIndex < 0 ||
    slotIndex >= HOTBAR_SLOT_COUNT
  ) {
    return false;
  }

  sanitizeHotbarAssignments();

  const itemId =
    player.hotbarAssignments[slotIndex];

  if (!itemId) {
    return false;
  }

  return equipWeaponIndex(
    weaponIndexForItemId(itemId)
  );
}

function nextOccupiedHotbarSlot(direction) {
  sanitizeHotbarAssignments();

  const occupied = [];
  for (let i = 0; i < HOTBAR_SLOT_COUNT; i++) {
    const itemId = player.hotbarAssignments[i];
    if (itemId && playerOwnsItem(itemId)) {
      occupied.push(i);
    }
  }

  if (!occupied.length) return -1;

  const equippedItemId = weaponItemIdForIndex(player.weaponIndex);
  const currentSlot = equippedItemId ? hotbarSlotForItem(equippedItemId) : -1;

  if (currentSlot < 0) {
    return direction > 0 ? occupied[0] : occupied[occupied.length - 1];
  }

  const currentIndex = occupied.indexOf(currentSlot);
  if (currentIndex < 0) {
    return direction > 0 ? occupied[0] : occupied[occupied.length - 1];
  }

  return occupied[
    (currentIndex + (direction > 0 ? 1 : -1) + occupied.length) % occupied.length
  ];
}

function cycleHotbarSelection(direction) {
  const slotIndex = nextOccupiedHotbarSlot(direction);
  if (slotIndex < 0) return false;

  inputController.queueCommand("equipWeapon", {
    index: slotIndex
  });

  return true;
}

function updateMenuItemHotkeyRail() {
  const equippedItemId = weaponItemIdForIndex(player.weaponIndex);

  document.querySelectorAll("[data-menu-hotbar-slot]").forEach(slot => {
    const slotIndex = Number(slot.dataset.menuHotbarSlot);
    const itemId = player.hotbarAssignments?.[slotIndex] || null;
    const valid = Boolean(itemId && hotbarItemCanBeAssigned(itemId));
    const image = slot.querySelector("img");
    const name = slot.querySelector(".menu-hotkey-item-name");

    slot.classList.toggle("empty", !valid);
    slot.classList.toggle("active", valid && itemId === equippedItemId);
    slot.draggable = valid;

    if (valid) {
      const itemImage = shopImageForItemId(itemId);
      if (image && itemImage) {
        image.src = itemImage.src;
        image.alt = SHOP_ITEMS.find(item => item.id === itemId)?.name || itemId;
      }
      if (name) name.textContent = SHOP_ITEMS.find(item => item.id === itemId)?.name || itemId;
      slot.title = `${name?.textContent || itemId} · key ${slotIndex + 4} · drag to move/swap · right-click to clear`;
    } else {
      if (image) {
        image.removeAttribute("src");
        image.alt = "";
      }
      if (name) name.textContent = "Empty";
      slot.title = "Drop an inventory item here";
    }
  });
}

function updateMenuUtilityHotkeyRail() {
  sanitizeUtilityHotbarAssignments();

  document.querySelectorAll("[data-menu-utility-slot]").forEach(slot => {
    const slotIndex = Number(slot.dataset.menuUtilitySlot);
    const itemId = player.utilityHotbarAssignments?.[slotIndex] || null;
    const valid = Boolean(itemId && utilityHotbarItemCanBeAssigned(itemId));
    const image = slot.querySelector("img");
    const name = slot.querySelector(".menu-hotkey-item-name");

    slot.classList.toggle("empty", !valid);
    slot.classList.toggle("active", valid && consumableCount(itemId) > 0);
    slot.draggable = valid;

    if (valid) {
      const itemImage = potionImageForItem(itemId);
      if (image && itemImage) {
        image.src = itemImage.src;
        image.alt = utilityItemDisplayName(itemId);
      }
      if (name) name.textContent = utilityItemDisplayName(itemId);
      slot.title = `${utilityItemDisplayName(itemId)} · key ${slotIndex + 1} · drag to move/swap · right-click to clear`;
    } else {
      if (image) {
        image.removeAttribute("src");
        image.alt = "";
      }
      if (name) name.textContent = "Empty";
      slot.title = "Drop a consumable here";
    }
  });
}

function updateHotbar() {
  sanitizeHotbarAssignments();

  const equippedItemId =
    weaponItemIdForIndex(
      player.weaponIndex
    );

  for (
    let slotIndex = 0;
    slotIndex < HOTBAR_SLOT_COUNT;
    slotIndex++
  ) {
    const slot =
      document.getElementById(
        `slot${slotIndex + 4}`
      );

    if (!slot) continue;

    const itemId =
      player.hotbarAssignments[slotIndex];

    const valid =
      Boolean(
        itemId &&
        isHotbarAssignableItem(itemId) &&
        playerOwnsItem(itemId)
      );

    const image =
      slot.querySelector(
        ".hotbar-item-img"
      );

    slot.classList.toggle(
      "active",
      valid &&
      equippedItemId === itemId
    );

    if (image) {
      if (valid) {
        const itemImage =
          shopImageForItemId(itemId);

        if (itemImage) {
          image.src = itemImage.src;
        }

        const shopItem =
          SHOP_ITEMS.find(
            item => item.id === itemId
          );

        image.alt =
          shopItem?.name || itemId;

        image.style.visibility =
          "visible";

        slot.title = `${shopItem?.name || itemId} · key ${slotIndex + 4} · click to equip`;
      } else {
        image.removeAttribute("src");
        image.alt = "";
        image.style.visibility =
          "hidden";
        slot.title = `Empty equipment hotkey ${slotIndex + 4}`;
      }
    }

    slot.style.opacity =
      valid ? "1" : "0.48";
  }

  sanitizeUtilityHotbarAssignments();
  for (let index = 0; index < UTILITY_HOTBAR_SLOT_COUNT; index++) {
    const itemId = player.utilityHotbarAssignments[index] || null;
    const slot = document.getElementById(`slot${index + 1}`);
    if (!slot) continue;
    const assigned = utilityHotbarItemCanBeAssigned(itemId);
    const count = assigned ? consumableCount(itemId) : 0;
    const image = slot.querySelector(".hotbar-item-img");
    const countElement = slot.querySelector(".utility-count");
    const cooldownMask = slot.querySelector(".utility-cooldown-mask");
    const cooldownText = slot.querySelector(".utility-cooldown-text");
    const itemImage = assigned ? potionImageForItem(itemId) : null;

    if (image) {
      if (assigned && itemImage) {
        image.src = itemImage.src;
        image.alt = utilityItemDisplayName(itemId);
        image.style.visibility = "visible";
      } else {
        image.removeAttribute("src");
        image.alt = "";
        image.style.visibility = "hidden";
      }
    }
    if (countElement) countElement.textContent = assigned ? `${count}` : "";

    const cooldownRemaining = assigned ? Math.max(0, consumableCooldownUntil(itemId) - Date.now()) : 0;
    const cooldownDuration = assigned ? consumableCooldownDurationMs(itemId) : 1;
    const cooling = assigned && cooldownRemaining > 0;
    const buffActive = itemId === "attackPotion"
      ? Date.now() < (Number(player.attackPotionUntil) || 0)
      : itemId === "magicPotion"
        ? Date.now() < (Number(player.magicPotionUntil) || 0)
        : false;
    slot.classList.toggle("cooling-down", cooling);
    slot.classList.toggle("buff-active", buffActive);
    slot.style.opacity = assigned && count > 0 ? "1" : "0.48";
    slot.title = assigned ? `${utilityItemDisplayName(itemId)} · key ${index + 1} · click to use` : `Empty item hotkey ${index + 1}`;
    if (cooldownMask) cooldownMask.style.height = cooling ? `${Math.min(100, cooldownRemaining / cooldownDuration * 100)}%` : "0%";
    if (cooldownText) cooldownText.textContent = cooling ? (cooldownRemaining / 1000).toFixed(1) : "";
  }

  updateMenuItemHotkeyRail();
  updateMenuUtilityHotkeyRail();
}

let inventoryOpen = false;
let shopOpen = false;
let craftingOpen = false;
let classResetConfirmOpen = false;
let beachQuestOpen = false;
let rewardToastTimer = null;
let selectedHotbarInventoryItemId = null;

function hatDisplayName(style) {
  if (!style) return "None";
  if (style === "blueCap") return "Blue Cap";
  if (style === "wizardHat") return "Wizard Hat";
  if (style === "jesterHat") return "Jester Hat";
  if (style === "ninjaHat") return "Ninja Hat";
  if (style === "knightHat") return "Knight Helm";
  if (style === "bandanaHat") return "Bandana";
  if (style === "rangerHat") return "Ranger Hat";
  if (style === "woodHat") return "Wood Helm";
  if (style === "arcanistHat") return "Arcanist Hat";
  if (style === "greencapHat") return "Greencap Cap";
  return "Hat";
}

function shirtDisplayName(style) {
  if (!style) return "None";
  if (style === "jester") return "Jester Shirt";
  if (style === "ninja") return "Ninja Shirt";
  if (style === "knight") return "Knight Chest";
  if (style === "ranger") return "Ranger Shirt";
  if (style === "wood") return "Wood Chest";
  if (style === "arcanist") return "Arcanist Robe";
  if (style === "greencap") return "Greencap Tunic";
  return "Traveler";
}

function pantsDisplayName(style) {
  if (!style) return "None";
  if (style === "jester") return "Jester Pants";
  if (style === "ninja") return "Ninja Pants";
  if (style === "knight") return "Knight Greaves";
  if (style === "ranger") return "Ranger Pants";
  if (style === "wood") return "Wood Greaves";
  if (style === "arcanist") return "Arcanist Skirt";
  if (style === "greencap") return "Greencap Pants";
  return "Traveler";
}

function weaponDisplayName(style) {
  if (!style) return "Empty Hands";
  if (style === "axe") return "Axe";
  if (style === "pickaxe") return "Pickaxe";
  if (style === "wand") return "Wand";
  if (style === "rainWand") return "Rain Wand";
  if (style === "shepherdStaff") return "Shepherd Staff";
  if (style === "lostKeyWand") return "Tournesol";
  if (style === "sunflowerWand") return "Tabatha's Key";
  if (style === "sapgemWand") return "Sapgem Wand";
  if (style === "katana") return "Katana";
  if (style === "oldSword") return "Sword";
  if (style === "bow") return "Wood Bow";
  return "Wood Sword";
}

function hatImageForIndex(index) {
  if (index < 0) return sprite.baseHat;
  if (index === 1) return sprite.blueCap;
  if (index === 2) return sprite.wizardHat;
  if (index === 3) return sprite.jesterHat;
  if (index === 4) return sprite.ninjaHat;
  if (index === 5) return sprite.knightHat;
  if (index === 6) return sprite.bandanaHat;
  if (index === 7) return sprite.rangerHat;
  if (index === 8) return sprite.woodHat;
  if (index === 9) return sprite.arcanistHat;
  if (index === 10) return sprite.greencapHat;
  return sprite.hat;
}

function shirtImageForIndex(index) {
  if (index < 0) return armorPreviewImages.shirts[0];
  return armorPreviewImages.shirts[Math.min(armorPreviewImages.shirts.length - 1, index + 1)] || armorPreviewImages.shirts[1];
}

function pantsImageForIndex(index) {
  if (index < 0) return armorPreviewImages.pants[0];
  return armorPreviewImages.pants[Math.min(armorPreviewImages.pants.length - 1, index + 1)] || armorPreviewImages.pants[1];
}

function charmImageForIndex(index) {
  return index === 0 ? woodRingImage : emptyCharmImage;
}

function playerAppearanceForIndices(hatIndex, shirtIndex, pantsIndex) {
  const shirtStyle = SHIRT_STYLES[shirtIndex];
  const pantsStyle = PANTS_STYLES[pantsIndex];

  const jesterShirt = shirtStyle === "jester";
  const ninjaShirt = shirtStyle === "ninja";
  const knightShirt = shirtStyle === "knight";
  const rangerShirt = shirtStyle === "ranger";
  const woodShirt = shirtStyle === "wood";
  const arcanistShirt = shirtStyle === "arcanist";
  const greencapShirt = shirtStyle === "greencap";
  const jesterPants = pantsStyle === "jester";
  const ninjaPants = pantsStyle === "ninja";
  const knightPants = pantsStyle === "knight";
  const rangerPants = pantsStyle === "ranger";
  const woodPants = pantsStyle === "wood";
  const arcanistPants = pantsStyle === "arcanist";
  const greencapPants = pantsStyle === "greencap";

  return {
    leftLeg: jesterPants
      ? sprite.jesterLeftLeg
      : ninjaPants
        ? sprite.ninjaLeftLeg
        : knightPants
          ? sprite.knightLeftLeg
          : rangerPants
            ? sprite.rangerLeftLeg
            : woodPants
              ? sprite.woodLeftLeg
              : arcanistPants
                ? sprite.arcanistLeftLeg
                : greencapPants
                  ? sprite.greencapLeftLeg
                  : pantsStyle === "traveler"
            ? sprite.leftLeg
            : sprite.baseLeftLeg,

    rightLeg: jesterPants
      ? sprite.jesterRightLeg
      : ninjaPants
        ? sprite.ninjaRightLeg
        : knightPants
          ? sprite.knightRightLeg
          : rangerPants
            ? sprite.rangerRightLeg
            : woodPants
              ? sprite.woodRightLeg
              : arcanistPants
                ? sprite.arcanistRightLeg
                : greencapPants
                  ? sprite.greencapRightLeg
                  : pantsStyle === "traveler"
            ? sprite.rightLeg
            : sprite.baseRightLeg,

    torso: jesterShirt
      ? sprite.jesterTorso
      : ninjaShirt
        ? sprite.ninjaTorso
        : knightShirt
          ? sprite.knightTorso
          : rangerShirt
            ? sprite.rangerTorso
            : woodShirt
              ? sprite.woodTorso
              : arcanistShirt
                ? sprite.arcanistTorso
                : greencapShirt
                  ? sprite.greencapTorso
                  : shirtStyle === "traveler"
            ? sprite.torso
            : sprite.baseTorso,

    leftArm: jesterShirt
      ? sprite.jesterLeftArm
      : ninjaShirt
        ? sprite.ninjaLeftArm
        : knightShirt
          ? sprite.knightLeftArm
          : rangerShirt
            ? sprite.rangerLeftArm
            : woodShirt
              ? sprite.woodLeftArm
              : arcanistShirt
                ? sprite.arcanistLeftArm
                : greencapShirt
                  ? sprite.greencapLeftArm
                  : shirtStyle === "traveler"
            ? sprite.leftArm
            : sprite.baseLeftArm,

    rightArm: jesterShirt
      ? sprite.jesterRightArm
      : ninjaShirt
        ? sprite.ninjaRightArm
        : knightShirt
          ? sprite.knightRightArm
          : rangerShirt
            ? sprite.rangerRightArm
            : woodShirt
              ? sprite.woodRightArm
              : arcanistShirt
                ? sprite.arcanistRightArm
                : greencapShirt
                  ? sprite.greencapRightArm
                  : shirtStyle === "traveler"
            ? sprite.rightArm
            : sprite.baseRightArm,

    hat: hatImageForIndex(hatIndex)
  };
}

function currentPlayerAppearance() {
  return playerAppearanceForIndices(
    player.hatIndex,
    player.shirtIndex,
    player.pantsIndex
  );
}

function weaponImageForIndex(index) {
  if (index < 0) return null;
  if (index === 1) return axeImage;
  if (index === 2) return wandImage;
  if (index === 3) return rainWandImage;
  if (index === 4) return katanaImage;
  if (index === 5) return oldSwordImage;
  if (index === 6) return bowImage;
  if (index === 7) return dreamcatcherBowImage;
  if (index === 8) return shepherdStaffImage;
  if (index === 9) return lostKeyWandImage;
  if (index === 10) return hugeSunflowerWandImage;
  if (index === 11) return pickaxeImage;
  if (index === 12) return sapgemWandImage;
  return swordImage;
}

function updateHotbarAssignmentUi() {
  const panel =
    document.getElementById(
      "hotbarAssignPanel"
    );

  if (!panel) return;

  const itemId =
    selectedHotbarInventoryItemId;

  const equipmentSelection = Boolean(itemId && hotbarItemCanBeAssigned(itemId));
  const utilitySelection = Boolean(itemId && utilityHotbarItemCanBeAssigned(itemId));
  const validSelection = equipmentSelection || utilitySelection;

  const image =
    document.getElementById(
      "hotbarAssignImg"
    );

  const name =
    document.getElementById(
      "hotbarAssignName"
    );

  const equipmentButtons = document.getElementById("equipmentHotbarAssignButtons");
  const utilityButtons = document.getElementById("utilityHotbarAssignButtons");
  const assignHelp = document.getElementById("hotbarAssignHelp");

  if (equipmentButtons) equipmentButtons.style.display = equipmentSelection ? "flex" : "none";
  if (utilityButtons) utilityButtons.style.display = utilitySelection ? "flex" : "none";
  if (assignHelp) {
    assignHelp.textContent = utilitySelection
      ? "Choose an item hotkey (1–3)"
      : "Choose an equipment hotkey (4–8)";
  }

  document
    .querySelectorAll(
      "[data-hotbar-assign-slot], [data-utility-assign-slot], #hotbarAssignClear"
    )
    .forEach(button => {
      button.disabled = !validSelection;
    });

  if (!validSelection) {
    selectedHotbarInventoryItemId =
      null;

    if (image) {
      image.removeAttribute("src");
      image.style.visibility =
        "hidden";
    }

    if (name) {
      name.textContent =
        "Select a usable item";
    }

    document
      .querySelectorAll(
        "[data-hotbar-assign-slot], [data-utility-assign-slot]"
      )
      .forEach(button => {
        button.classList.remove("active");
      });

    if (equipmentButtons) equipmentButtons.style.display = "none";
    if (utilityButtons) utilityButtons.style.display = "none";
    if (assignHelp) assignHelp.textContent = "Select a usable item";
    return;
  }

  const itemImage = hotkeyImageForItemId(itemId);

  if (image && itemImage) {
    image.src = itemImage.src;
    image.style.visibility =
      "visible";
  }

  const shopItem = SHOP_ITEMS.find(item => item.id === itemId);

  if (name) {
    if (utilitySelection) {
      name.textContent = `${utilityItemDisplayName(itemId)} · ${consumableCount(itemId)} owned`;
    } else {
      const weaponIndex = WEAPON_ITEM_IDS.indexOf(itemId);
      const combatProfile = typeof COMBAT_BALANCE !== "undefined"
        ? COMBAT_BALANCE.weaponProfiles[weaponIndex]
        : null;
      const itemDisplayName = shopItem?.name || combatProfile?.name || (itemId === "weapon_bow" ? "Wood Bow" : itemId);

      if (combatProfile) {
        const powerBits = [];
        if ((Number(combatProfile.attackPower) || 0) > 0) powerBits.push(`ATK ${combatProfile.attackPower}`);
        if ((Number(combatProfile.magicPower) || 0) > 0) powerBits.push(`MAG ${combatProfile.magicPower}`);
        name.textContent = `${itemDisplayName} · ${powerBits.join(" / ")}`;
      } else {
        name.textContent = itemDisplayName;
      }
    }
  }

  const assignedSlot = utilitySelection
    ? utilityHotbarSlotForItem(itemId)
    : hotbarSlotForItem(itemId);

  document.querySelectorAll("[data-hotbar-assign-slot]").forEach(button => {
    button.classList.toggle("active", equipmentSelection && Number(button.dataset.hotbarAssignSlot) === assignedSlot);
  });
document.querySelectorAll("[data-utility-assign-slot]").forEach(button => {
    button.classList.toggle("active", utilitySelection && Number(button.dataset.utilityAssignSlot) === assignedSlot);
  });
}

function updatePvpUi() {
  const badge = document.getElementById("pvpStatusBadge");
  const status = document.getElementById("pvpStatusText");
  const button = document.getElementById("pvpToggleButton");
  const lockText = document.getElementById("pvpLockText");

  if (!badge || !status || !button || !lockText) {
    return;
  }

  const connected =
    Boolean(window.onlineClient?.connected);

  const remainingMs = Math.max(
    0,
    (Number(player.pvpCombatUntil) || 0) - Date.now()
  );

  const locked =
    player.pvpEnabled &&
    remainingMs > 0;

  badge.textContent =
    player.pvpEnabled ? "ON" : "OFF";

  badge.classList.toggle(
    "on",
    player.pvpEnabled
  );

  status.textContent =
    player.pvpEnabled
      ? "PvP is enabled. Other opted-in players can damage you."
      : "PvP is disabled. Other players cannot damage you.";

  button.classList.toggle(
    "on",
    player.pvpEnabled
  );

  button.textContent =
    player.pvpEnabled
      ? locked
        ? `In Combat · ${Math.ceil(remainingMs / 1000)}s`
        : "Disable PvP"
      : "Enable PvP";

  button.disabled =
    !connected ||
    player.pvpTogglePending ||
    locked;

  lockText.textContent =
    !connected
      ? "Connect to the multiplayer server to use PvP."
      : locked
        ? "PvP cannot be disabled while you are in combat."
        : "Both players must opt in. PvP attacks deal 50% damage. Magic is not enabled for PvP yet.";
}

function updateInventoryUi() {
  const coinCount = document.getElementById("inventoryCoinCount");
  const woodCount = document.getElementById("inventoryWoodCount");
  const stoneCount = document.getElementById("inventoryStoneCount");
  const whiteFlowerCount = document.getElementById("inventoryWhiteFlowerCount");
  const blueFlowerCount = document.getElementById("inventoryBlueFlowerCount");
  const healingPotionCount = document.getElementById("inventoryHealingPotionCount");
  const attackPotionCount = document.getElementById("inventoryAttackPotionCount");
  const magicPotionCount = document.getElementById("inventoryMagicPotionCount");
  const goldSlimeBubbleCount = document.getElementById("inventoryGoldSlimeBubbleCount");
  const arrowCount = document.getElementById("inventoryArrowCount");
  const arrowHud = document.getElementById("arrowHud");
  const arrowHudCount = document.getElementById("arrowHudCount");

  if (coinCount) coinCount.textContent = `${player.coins}`;
  if (woodCount) woodCount.textContent = `${player.wood}`;
  if (stoneCount) stoneCount.textContent = `${player.stone}`;
  if (whiteFlowerCount) whiteFlowerCount.textContent = `${player.whiteFlowers}`;
  if (blueFlowerCount) blueFlowerCount.textContent = `${player.blueFlowers}`;
  if (healingPotionCount) healingPotionCount.textContent = `${player.healingPotions}`;
  if (attackPotionCount) attackPotionCount.textContent = `${player.attackPotions}`;
  if (magicPotionCount) magicPotionCount.textContent = `${player.magicPotions}`;
  if (goldSlimeBubbleCount) goldSlimeBubbleCount.textContent = `${player.goldSlimeBubbles}`;
  if (arrowCount) arrowCount.textContent = `${player.arrows}`;
  if (arrowHudCount) arrowHudCount.textContent = `${Math.max(0, Math.floor(Number(player.arrows) || 0))}`;
  if (arrowHud) {
    arrowHud.style.display = equippedWeapon() === "bow" ? "flex" : "none";
  }

  function updateInventoryResourceGroup(gridId, emptyId) {
    const grid = document.getElementById(gridId);
    if (!grid) return;

    let visibleEntries = 0;

    grid.querySelectorAll("[data-resource-key]").forEach(element => {
      const key = element.dataset.resourceKey;
      const count = Math.max(0, Number(player[key]) || 0);
      const visible = count > 0;

      element.style.display = visible ? "" : "none";
      if (visible) visibleEntries += 1;
    });

    const empty = document.getElementById(emptyId);
    if (empty) {
      empty.style.display = visibleEntries === 0 ? "block" : "none";
    }
  }

  updateInventoryResourceGroup("inventoryResourcesGrid", "inventoryResourcesEmpty");
  updateInventoryResourceGroup("inventoryConsumablesGrid", "inventoryConsumablesEmpty");

  document.querySelectorAll('#inventoryPage [data-utility-hotbar-assignable="true"]').forEach(element => {
    const itemId = element.dataset.utilityItem;
    const eligible = utilityHotbarItemCanBeAssigned(itemId) && consumableCount(itemId) > 0;
    element.classList.toggle("hotbar-selected", itemId === selectedHotbarInventoryItemId);
    element.classList.toggle("hotbar-ineligible", !eligible);
    element.draggable = eligible;
    if (eligible) {
      element.title = `${utilityItemDisplayName(itemId)} · drag, or tap then choose Items 1–3`;
    }
  });

  function updateOwnedInventoryGroup(gridId, emptyId) {
    const grid = document.getElementById(gridId);
    if (!grid) return;

    let visibleEntries = 0;
    grid.querySelectorAll("[data-owned-item]").forEach(element => {
      const visible = playerOwnsItem(element.dataset.ownedItem);
      element.style.display = visible ? "" : "none";
      if (visible) visibleEntries += 1;
    });

    const empty = document.getElementById(emptyId);
    if (empty) empty.style.display = visibleEntries === 0 ? "block" : "none";
  }

  updateOwnedInventoryGroup("inventoryWeaponsGrid", "inventoryWeaponsEmpty");
  updateOwnedInventoryGroup("inventoryArmorGrid", "inventoryArmorEmpty");
  updateOwnedInventoryGroup("inventoryAccessoriesGrid", "inventoryAccessoriesEmpty");

  document
    .querySelectorAll(
      '#inventoryPage [data-hotbar-assignable="true"]'
    )
    .forEach(element => {
      const itemId =
        element.dataset.ownedItem;

      const slotIndex =
        hotbarSlotForItem(itemId);
      const eligible = hotbarItemCanBeAssigned(itemId);

      element.classList.toggle(
        "hotbar-selected",
        itemId === selectedHotbarInventoryItemId
      );
      element.classList.toggle("hotbar-ineligible", !eligible);
      element.draggable = eligible;

      const missingRequirements = equipmentMissingRequirements(itemId);
      if (!eligible && missingRequirements.length) {
        element.title = missingRequirements.join(" · ");
      } else {
        element.removeAttribute("title");
      }

      if (slotIndex >= 0) {
        element.dataset.hotbarSlotLabel =
          `${slotIndex + 4}`;
      } else {
        delete element.dataset.hotbarSlotLabel;
      }
    });

  updateHotbarAssignmentUi();

  document
    .querySelectorAll(
      "#equipmentPage [data-owned-item]"
    )
    .forEach(element => {
      const visible =
        playerOwnsItem(
          element.dataset.ownedItem
        );

      element.style.display =
        visible ? "" : "none";
    });

  const woodcuttingFill = document.getElementById("woodcuttingFill");
  const woodcuttingBarText = document.getElementById("woodcuttingBarText");
  const woodcuttingLevelText = document.getElementById("woodcuttingLevelText");

  if (woodcuttingFill) {
    const pct = Math.max(
      0,
      Math.min(1, player.woodcutting.exp / player.woodcutting.expToNext)
    );
    woodcuttingFill.style.width = `${pct * 100}%`;
  }

  if (woodcuttingBarText) {
    woodcuttingBarText.textContent =
      `${player.woodcutting.exp} / ${player.woodcutting.expToNext} EXP`;
  }

  if (woodcuttingLevelText) {
    woodcuttingLevelText.textContent = `LV ${player.woodcutting.level}`;
  }

  const miningFill = document.getElementById("miningFill");
  const miningBarText = document.getElementById("miningBarText");
  const miningLevelText = document.getElementById("miningLevelText");

  if (miningFill) {
    const pct = Math.max(0, Math.min(1, player.mining.exp / player.mining.expToNext));
    miningFill.style.width = `${pct * 100}%`;
  }
  if (miningBarText) {
    miningBarText.textContent = `${player.mining.exp} / ${player.mining.expToNext} EXP`;
  }
  if (miningLevelText) {
    miningLevelText.textContent = `LV ${player.mining.level}`;
  }

  const hatStyle = currentHatStyle();
  const shirtStyle = currentShirtStyle();
  const pantsStyle = currentPantsStyle();
  const weaponStyle = equippedWeapon();

  const equippedHatImg = document.getElementById("equippedHatImg");
  const equippedHatName = document.getElementById("equippedHatName");
  const equippedShirtImg = document.getElementById("equippedShirtImg");
  const equippedShirtName = document.getElementById("equippedShirtName");
  const equippedPantsImg = document.getElementById("equippedPantsImg");
  const equippedPantsName = document.getElementById("equippedPantsName");
  const equippedCharmImg = document.getElementById("equippedCharmImg");
  const equippedCharmName = document.getElementById("equippedCharmName");
  const equippedWeaponImg = document.getElementById("equippedWeaponImg");
  const equippedWeaponName = document.getElementById("equippedWeaponName");

  if (equippedHatImg) equippedHatImg.src = hatImageForIndex(player.hatIndex).src;
  if (equippedHatName) equippedHatName.textContent = hatDisplayName(hatStyle);
  if (equippedShirtImg) equippedShirtImg.src = shirtImageForIndex(player.shirtIndex).src;
  if (equippedShirtName) equippedShirtName.textContent = shirtDisplayName(shirtStyle);
  if (equippedPantsImg) equippedPantsImg.src = pantsImageForIndex(player.pantsIndex).src;
  if (equippedPantsName) equippedPantsName.textContent = pantsDisplayName(pantsStyle);
  if (equippedCharmImg) {
    if (player.charmIndex >= 0) {
      equippedCharmImg.src = charmImageForIndex(player.charmIndex).src;
      equippedCharmImg.style.visibility = "visible";
    } else {
      equippedCharmImg.removeAttribute("src");
      equippedCharmImg.style.visibility = "hidden";
    }
  }
  if (equippedCharmName) equippedCharmName.textContent = player.charmIndex >= 0 ? itemDisplayNameForId(CHARM_ITEM_IDS[player.charmIndex]) : "Empty";

  const equippedBoxes = document.querySelectorAll(".equipped-box[data-gear-panel]");
  if (equippedBoxes[0]) {
    const itemId = player.hatIndex >= 0 ? HAT_ITEM_IDS[player.hatIndex] : null;
    if (itemId) equippedBoxes[0].dataset.itemDetailId = itemId;
    else delete equippedBoxes[0].dataset.itemDetailId;
  }
  if (equippedBoxes[1]) {
    const itemId = player.shirtIndex >= 0 ? SHIRT_ITEM_IDS[player.shirtIndex] : null;
    if (itemId) equippedBoxes[1].dataset.itemDetailId = itemId;
    else delete equippedBoxes[1].dataset.itemDetailId;
  }
  if (equippedBoxes[2]) {
    const itemId = player.pantsIndex >= 0 ? PANTS_ITEM_IDS[player.pantsIndex] : null;
    if (itemId) equippedBoxes[2].dataset.itemDetailId = itemId;
    else delete equippedBoxes[2].dataset.itemDetailId;
  }
  if (equippedBoxes[3]) {
    const itemId = player.charmIndex >= 0 ? CHARM_ITEM_IDS[player.charmIndex] : null;
    if (itemId) equippedBoxes[3].dataset.itemDetailId = itemId;
    else delete equippedBoxes[3].dataset.itemDetailId;
  }

  if (equippedWeaponImg) {
    const equippedWeaponImage = weaponImageForIndex(player.weaponIndex);

    if (equippedWeaponImage) {
      equippedWeaponImg.src = equippedWeaponImage.src;
      equippedWeaponImg.style.visibility = "visible";
    } else {
      equippedWeaponImg.removeAttribute("src");
      equippedWeaponImg.style.visibility = "hidden";
    }
  }

  if (equippedWeaponName) {
    equippedWeaponName.textContent =
      player.weaponIndex === 7
        ? "Dreamcatcher"
        : weaponDisplayName(weaponStyle);
  }

  document.querySelectorAll(".hat-choice").forEach(button => {
    button.classList.toggle(
      "active",
      Number(button.dataset.hatIndex) === player.hatIndex
    );
  });

  document.querySelectorAll(".weapon-choice").forEach(button => {
    button.classList.toggle(
      "active",
      Number(button.dataset.weaponIndex) === player.weaponIndex
    );
  });

  document.querySelectorAll(".shirt-choice").forEach(button => {
    button.classList.toggle(
      "active",
      Number(button.dataset.shirtIndex) === player.shirtIndex
    );
  });

  document.querySelectorAll(".pants-choice").forEach(button => {
    button.classList.toggle(
      "active",
      Number(button.dataset.pantsIndex) === player.pantsIndex
    );
  });

  document.querySelectorAll(".charm-choice").forEach(button => {
    button.classList.toggle(
      "active",
      Number(button.dataset.charmIndex) === player.charmIndex
    );
  });

  const skillPointText = document.getElementById("skillPointText");
  const statStrength = document.getElementById("statStrength");
  const statDex = document.getElementById("statDex");
  const statLuck = document.getElementById("statLuck");
  const statInt = document.getElementById("statInt");
  const statArmor = document.getElementById("statArmor");
  const statResist = document.getElementById("statResist");
  const statMoveSpeed = document.getElementById("statMoveSpeed");
  const statAccuracy = document.getElementById("statAccuracy");
  const statAttackPower = document.getElementById("statAttackPower");
  const statMagicPower = document.getElementById("statMagicPower");
  const statMastery = document.getElementById("statMastery");
  const statMasteryLabel = document.getElementById("statMasteryLabel");

  if (skillPointText) {
    skillPointText.textContent = `Skill Points ${player.skillPoints}`;
  }

  if (statStrength) statStrength.textContent = `${player.stats.strength}`;
  if (statDex) statDex.textContent = `${player.stats.dex}`;
  if (statLuck) statLuck.textContent = `${player.stats.luck}`;
  if (statInt) statInt.textContent = `${player.stats.int}`;

  if (window.COMBAT_BALANCE) {
    const equippedProtection = {
      hatIndex: player.hatIndex,
      shirtIndex: player.shirtIndex,
      pantsIndex: player.pantsIndex,
      charmIndex: player.charmIndex
    };
    if (statArmor) {
      statArmor.textContent = `${COMBAT_BALANCE.playerArmorFromGear(equippedProtection)}`;
    }
    if (statResist) {
      statResist.textContent = `${COMBAT_BALANCE.playerResistFromGear(equippedProtection)}`;
    }
  }

  if (statMoveSpeed) {
    statMoveSpeed.textContent = `${Math.round(
      Number(player.speed) || GAME_CONFIG.player.baseSpeed
    )}`;
  }
  if (statAccuracy) {
    statAccuracy.textContent = "—";
  }

  if (statAttackPower && window.COMBAT_BALANCE) {
    statAttackPower.textContent = `${Math.round(COMBAT_BALANCE.calculateAttackPower(
      player.weaponIndex,
      player.stats
    ))}`;
  }

  if (statMagicPower && window.COMBAT_BALANCE) {
    statMagicPower.textContent = `${Math.round(COMBAT_BALANCE.calculateMagicPower(
      player.weaponIndex,
      player.stats
    ))}`;
  }

  if (statMastery && window.COMBAT_BALANCE) {
    statMastery.textContent = `${Math.round(
      COMBAT_BALANCE.calculateMastery(player.classId) * 100
    )}%`;
  }

  if (statMasteryLabel) {
    statMasteryLabel.textContent = player.classId === "arcana"
      ? "Magic Mastery"
      : playerHasChosenClass()
        ? "Attack Mastery"
        : "Mastery";
  }

  document.querySelectorAll(".stat-plus").forEach(button => {
    const stat = button.dataset.stat;
    const atMax =
      stat &&
      (Number(player.stats?.[stat]) || 0) >= MAX_PLAYER_STAT;

    button.disabled = player.skillPoints <= 0 || atMax;
    button.title = atMax ? `Max ${MAX_PLAYER_STAT}` : "";
  });


  updateAbilityTreeUi();
  updateSkillBindingUi();
  updatePvpUi();
}

// -----------------------------------------------------------------------------
// BROWSER-LOCAL CHARACTER PERSISTENCE
// -----------------------------------------------------------------------------
// This is deliberately a small prototype save layer, not an account system.
// localStorage is origin/browser scoped. Runtime combat state, HP, cooldowns,
// map position, active effects, and world/enemy state are intentionally omitted.
const LOCAL_CHARACTER_SAVE_KEY = "slimeStoryCharacterSaveV1";
const LOCAL_CHARACTER_SAVE_VERSION = 1;
const LOCAL_CHARACTER_AUTOSAVE_MS = 750;

let localCharacterSaveLoaded = false;
let localCharacterSaveSnapshot = null;
let localCharacterLastSavedJson = "";

function clampLocalSaveInteger(value, min, max, fallback = min) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function validSavedItemIds(items) {
  const output = {};
  if (!items || typeof items !== "object") return output;

  for (const itemId of ALL_EQUIPMENT_ITEM_IDS) {
    if ((Number(items[itemId]) || 0) > 0) {
      output[itemId] = 1;
    }
  }
  return output;
}

function buildLocalCharacterSave() {
  const story = {};
  for (const key of [
    "axeReceived",
    "woodSwordCrafted",
    "woodBowCrafted",
    "shepherdStaffCrafted",
    "woodHelmCrafted",
    "woodChestCrafted",
    "woodGreavesCrafted",
    "woodRingCrafted"
  ]) {
    story[key] = Boolean(player.story?.[key]);
  }

  const abilities = {};
  for (const [skillId, skill] of Object.entries(ACTIVE_SKILLS)) {
    abilities[skillId] = Math.max(
      0,
      Math.min(Number(skill.maxLevel) || 0, Math.floor(Number(player.abilities?.[skillId]) || 0))
    );
  }

  const bindings = {};
  for (const key of Object.keys(skillBindings)) {
    bindings[key] = skillBindings[key] || null;
  }

  return {
    version: LOCAL_CHARACTER_SAVE_VERSION,
    savedAt: Date.now(),

    level: clampLocalSaveInteger(player.level, 1, 99, 1),
    exp: Math.max(0, Math.floor(Number(player.exp) || 0)),
    skillPoints: Math.max(0, Math.floor(Number(player.skillPoints) || 0)),
    abilityPoints: Math.max(0, Math.floor(Number(player.abilityPoints) || 0)),

    classId: PLAYER_CLASSES[player.classId] ? player.classId : null,
    abilities,
    enhancementToggles: { ...(player.enhancementToggles || {}) },
    skillBindings: bindings,

    stats: {
      strength: clampLocalSaveInteger(player.stats?.strength, 0, MAX_PLAYER_STAT, 0),
      dex: clampLocalSaveInteger(player.stats?.dex, 0, MAX_PLAYER_STAT, 0),
      luck: clampLocalSaveInteger(player.stats?.luck, 0, MAX_PLAYER_STAT, 0),
      int: clampLocalSaveInteger(player.stats?.int, 0, MAX_PLAYER_STAT, 0)
    },

    woodcutting: {
      level: clampLocalSaveInteger(player.woodcutting?.level, 1, 99, 1),
      exp: Math.max(0, Math.floor(Number(player.woodcutting?.exp) || 0))
    },

    mining: {
      level: clampLocalSaveInteger(player.mining?.level, 1, 99, 1),
      exp: Math.max(0, Math.floor(Number(player.mining?.exp) || 0))
    },

    resources: {
      coins: Math.max(0, Math.floor(Number(player.coins) || 0)),
      wood: Math.max(0, Math.floor(Number(player.wood) || 0)),
      stone: Math.max(0, Math.floor(Number(player.stone) || 0)),
      whiteFlowers: Math.max(0, Math.floor(Number(player.whiteFlowers) || 0)),
      blueFlowers: Math.max(0, Math.floor(Number(player.blueFlowers) || 0)),
      healingPotions: Math.max(0, Math.floor(Number(player.healingPotions) || 0)),
      attackPotions: Math.max(0, Math.floor(Number(player.attackPotions) || 0)),
      magicPotions: Math.max(0, Math.floor(Number(player.magicPotions) || 0)),
      goldSlimeBubbles: Math.max(0, Math.floor(Number(player.goldSlimeBubbles) || 0)),
      arrows: Math.max(0, Math.floor(Number(player.arrows) || 0))
    },

    items: validSavedItemIds(player.items),
    shopPurchases: Array.from(new Set(
      (Array.isArray(player.shopPurchases) ? player.shopPurchases : [])
        .filter(itemId => ALL_EQUIPMENT_ITEM_IDS.has(itemId))
    )),

    equipment: {
      hatIndex: clampLocalSaveInteger(player.hatIndex, -1, HAT_ITEM_IDS.length - 1, -1),
      shirtIndex: clampLocalSaveInteger(player.shirtIndex, -1, SHIRT_ITEM_IDS.length - 1, -1),
      pantsIndex: clampLocalSaveInteger(player.pantsIndex, -1, PANTS_ITEM_IDS.length - 1, -1),
      charmIndex: clampLocalSaveInteger(player.charmIndex, -1, CHARM_ITEM_IDS.length - 1, -1),
      weaponIndex: clampLocalSaveInteger(player.weaponIndex, -1, WEAPON_ITEM_IDS.length - 1, -1)
    },

    hotbarAssignments: Array.from(
      { length: HOTBAR_SLOT_COUNT },
      (_, index) => player.hotbarAssignments?.[index] || null
    ),
    utilityHotbarAssignments: Array.from(
      { length: UTILITY_HOTBAR_SLOT_COUNT },
      (_, index) => player.utilityHotbarAssignments?.[index] || null
    ),
    utilityHotbarCustomized: Boolean(player.utilityHotbarCustomized),

    buffs: {
      attackRemainingMs: Math.max(0, (Number(player.attackPotionUntil) || 0) - Date.now()),
      magicRemainingMs: Math.max(0, (Number(player.magicPotionUntil) || 0) - Date.now()),
      healingPotionCooldownRemainingMs: Math.max(0, (Number(player.consumableCooldownUntil) || 0) - Date.now()),
      attackPotionCooldownRemainingMs: Math.max(0, (Number(player.attackPotionCooldownUntil) || 0) - Date.now()),
      magicPotionCooldownRemainingMs: Math.max(0, (Number(player.magicPotionCooldownUntil) || 0) - Date.now())
    },
    story,
    beachQuest: {
      stage: ["none", "firstActive", "firstComplete", "secondActive", "complete"].includes(player.beachQuest?.stage)
        ? player.beachQuest.stage
        : "none",
      firstCrabKills: clampLocalSaveInteger(player.beachQuest?.firstCrabKills, 0, 10, 0),
      secondCrabKills: clampLocalSaveInteger(player.beachQuest?.secondCrabKills, 0, 25, 0),
      icedCoffee: clampLocalSaveInteger(player.beachQuest?.icedCoffee, 0, 1, 0)
    },
    myrtleQuest: {
      stage: ["none", "active", "complete"].includes(player.myrtleQuest?.stage)
        ? player.myrtleQuest.stage
        : "none"
    }
  };
}

function applyLocalCharacterSave(save) {
  if (!save || Number(save.version) !== LOCAL_CHARACTER_SAVE_VERSION) {
    return false;
  }

  player.level = clampLocalSaveInteger(save.level, 1, 99, 1);
  player.expToNext = expNeededForLevel(player.level);
  player.exp = clampLocalSaveInteger(save.exp, 0, Math.max(0, player.expToNext - 1), 0);
  player.skillPoints = clampLocalSaveInteger(save.skillPoints, 0, 9999, 0);
  player.abilityPoints = clampLocalSaveInteger(save.abilityPoints, 0, 9999, 0);

  player.classId = PLAYER_CLASSES[save.classId] ? save.classId : null;

  for (const [skillId, skill] of Object.entries(ACTIVE_SKILLS)) {
    player.abilities[skillId] = clampLocalSaveInteger(
      save.abilities?.[skillId],
      0,
      Math.max(0, Number(skill.maxLevel) || 0),
      0
    );
  }

  player.enhancementToggles = {};
  if (save.enhancementToggles && typeof save.enhancementToggles === "object") {
    for (const [id, enabled] of Object.entries(save.enhancementToggles)) {
      player.enhancementToggles[id] = Boolean(enabled);
    }
  }

  player.stats.strength = clampLocalSaveInteger(save.stats?.strength, 0, MAX_PLAYER_STAT, 0);
  player.stats.dex = clampLocalSaveInteger(save.stats?.dex, 0, MAX_PLAYER_STAT, 0);
  player.stats.luck = clampLocalSaveInteger(save.stats?.luck, 0, MAX_PLAYER_STAT, 0);
  player.stats.int = clampLocalSaveInteger(save.stats?.int, 0, MAX_PLAYER_STAT, 0);

  player.woodcutting.level = clampLocalSaveInteger(save.woodcutting?.level, 1, 99, 1);
  player.woodcutting.expToNext = woodcuttingExpNeeded(player.woodcutting.level);
  player.woodcutting.exp = clampLocalSaveInteger(
    save.woodcutting?.exp,
    0,
    Math.max(0, player.woodcutting.expToNext - 1),
    0
  );
  player.mining.level = clampLocalSaveInteger(save.mining?.level, 1, 99, 1);
  player.mining.expToNext = miningExpNeeded(player.mining.level);
  player.mining.exp = clampLocalSaveInteger(
    save.mining?.exp,
    0,
    Math.max(0, player.mining.expToNext - 1),
    0
  );

  player.coins = clampLocalSaveInteger(save.resources?.coins, 0, 999999, 0);
  player.wood = clampLocalSaveInteger(save.resources?.wood, 0, 999999, 0);
  player.stone = clampLocalSaveInteger(save.resources?.stone, 0, 999999, 0);
  player.whiteFlowers = clampLocalSaveInteger(save.resources?.whiteFlowers ?? save.resources?.flowers, 0, 999999, 0);
  player.blueFlowers = clampLocalSaveInteger(save.resources?.blueFlowers, 0, 999999, 0);
  player.healingPotions = clampLocalSaveInteger(save.resources?.healingPotions, 0, 999999, 0);
  player.attackPotions = clampLocalSaveInteger(save.resources?.attackPotions, 0, 999999, 0);
  player.magicPotions = clampLocalSaveInteger(save.resources?.magicPotions, 0, 999999, 0);
  const saveNow = Date.now();
  player.attackPotionUntil = saveNow + Math.min(POTION_BUFF_MS, clampLocalSaveInteger(save.buffs?.attackRemainingMs, 0, POTION_BUFF_MS, 0));
  player.magicPotionUntil = saveNow + Math.min(POTION_BUFF_MS, clampLocalSaveInteger(save.buffs?.magicRemainingMs, 0, POTION_BUFF_MS, 0));
  player.consumableCooldownUntil = saveNow + Math.min(HEALING_POTION_COOLDOWN_MS, clampLocalSaveInteger(
    save.buffs?.healingPotionCooldownRemainingMs ?? save.buffs?.consumableCooldownRemainingMs,
    0,
    HEALING_POTION_COOLDOWN_MS,
    0
  ));
  player.attackPotionCooldownUntil = saveNow + Math.min(BUFF_POTION_COOLDOWN_MS, clampLocalSaveInteger(save.buffs?.attackPotionCooldownRemainingMs, 0, BUFF_POTION_COOLDOWN_MS, 0));
  player.magicPotionCooldownUntil = saveNow + Math.min(BUFF_POTION_COOLDOWN_MS, clampLocalSaveInteger(save.buffs?.magicPotionCooldownRemainingMs, 0, BUFF_POTION_COOLDOWN_MS, 0));
  player.goldSlimeBubbles = clampLocalSaveInteger(save.resources?.goldSlimeBubbles, 0, 999999, 0);
  player.arrows = clampLocalSaveInteger(save.resources?.arrows, 0, 999999, 0);

  player.items = validSavedItemIds(save.items);
  player.shopPurchases = Array.from(new Set(
    (Array.isArray(save.shopPurchases) ? save.shopPurchases : [])
      .filter(itemId => ALL_EQUIPMENT_ITEM_IDS.has(itemId))
  ));

  // A persisted purchase always implies ownership, even if an older save
  // happened to omit the parallel item dictionary entry.
  for (const itemId of player.shopPurchases) {
    player.items[itemId] = 1;
  }

  for (const key of Object.keys(player.story)) {
    if (Object.prototype.hasOwnProperty.call(save.story || {}, key)) {
      player.story[key] = Boolean(save.story[key]);
    }
  }

  const savedBeachQuest = save.beachQuest && typeof save.beachQuest === "object"
    ? save.beachQuest
    : {};
  player.beachQuest.stage = ["none", "firstActive", "firstComplete", "secondActive", "complete"].includes(savedBeachQuest.stage)
    ? savedBeachQuest.stage
    : "none";
  player.beachQuest.firstCrabKills = clampLocalSaveInteger(savedBeachQuest.firstCrabKills, 0, 10, 0);
  player.beachQuest.secondCrabKills = clampLocalSaveInteger(savedBeachQuest.secondCrabKills, 0, 25, 0);
  player.beachQuest.icedCoffee = clampLocalSaveInteger(savedBeachQuest.icedCoffee, 0, 1, 0);

  const savedMyrtleQuest = save.myrtleQuest && typeof save.myrtleQuest === "object"
    ? save.myrtleQuest
    : {};
  player.myrtleQuest.stage = ["none", "active", "complete"].includes(savedMyrtleQuest.stage)
    ? savedMyrtleQuest.stage
    : "none";

  player.hatIndex = clampLocalSaveInteger(save.equipment?.hatIndex, -1, HAT_ITEM_IDS.length - 1, -1);
  player.shirtIndex = clampLocalSaveInteger(save.equipment?.shirtIndex, -1, SHIRT_ITEM_IDS.length - 1, -1);
  player.pantsIndex = clampLocalSaveInteger(save.equipment?.pantsIndex, -1, PANTS_ITEM_IDS.length - 1, -1);
  player.charmIndex = clampLocalSaveInteger(save.equipment?.charmIndex, -1, CHARM_ITEM_IDS.length - 1, -1);
  player.weaponIndex = clampLocalSaveInteger(save.equipment?.weaponIndex, -1, WEAPON_ITEM_IDS.length - 1, -1);

  if (!playerOwnsHatIndex(player.hatIndex) || !equipmentItemCanBeEquipped(HAT_ITEM_IDS[player.hatIndex])) {
    player.hatIndex = -1;
  }
  if (!playerOwnsShirtIndex(player.shirtIndex) || !equipmentItemCanBeEquipped(SHIRT_ITEM_IDS[player.shirtIndex])) {
    player.shirtIndex = -1;
  }
  if (!playerOwnsPantsIndex(player.pantsIndex) || !equipmentItemCanBeEquipped(PANTS_ITEM_IDS[player.pantsIndex])) {
    player.pantsIndex = -1;
  }
  if (!playerOwnsCharmIndex(player.charmIndex) || !equipmentItemCanBeEquipped(CHARM_ITEM_IDS[player.charmIndex])) {
    player.charmIndex = -1;
  }
  if (!playerOwnsWeaponIndex(player.weaponIndex) || !equipmentItemCanBeEquipped(WEAPON_ITEM_IDS[player.weaponIndex])) {
    player.weaponIndex = -1;
  }

  player.hotbarAssignments = Array.from(
    { length: HOTBAR_SLOT_COUNT },
    (_, index) => {
      const itemId = save.hotbarAssignments?.[index];
      return itemId && isHotbarAssignableItem(itemId) && playerOwnsItem(itemId)
        ? itemId
        : null;
    }
  );
  sanitizeHotbarAssignments();

  const savedUtilityAssignments = save.utilityHotbarAssignments;
  player.utilityHotbarCustomized = save.utilityHotbarCustomized === true;
  player.utilityHotbarAssignments = player.utilityHotbarCustomized && Array.isArray(savedUtilityAssignments)
    ? Array.from({ length: UTILITY_HOTBAR_SLOT_COUNT }, (_, index) => savedUtilityAssignments[index] || null)
    : Array.from({ length: UTILITY_HOTBAR_SLOT_COUNT }, () => null);
  sanitizeUtilityHotbarAssignments();

  for (const key of Object.keys(skillBindings)) {
    const skillId = save.skillBindings?.[key];
    skillBindings[key] = (
      skillId &&
      ACTIVE_SKILLS[skillId] &&
      ACTIVE_SKILLS[skillId].classId === player.classId &&
      abilityLevel(skillId) > 0
    ) ? skillId : null;
  }

  return true;
}

function loadLocalCharacterState() {
  let raw = null;
  try {
    raw = localStorage.getItem(LOCAL_CHARACTER_SAVE_KEY);
  } catch {
    return false;
  }

  if (!raw) return false;

  try {
    const save = JSON.parse(raw);
    if (!applyLocalCharacterSave(save)) return false;

    localCharacterSaveLoaded = true;
    localCharacterSaveSnapshot = buildLocalCharacterSave();
    localCharacterLastSavedJson = JSON.stringify(localCharacterSaveSnapshot);
    console.log("[SAVE] Browser-local character restored.");
    return true;
  } catch (error) {
    console.warn("[SAVE] Could not restore browser-local character.", error);
    return false;
  }
}

function saveLocalCharacterState(force = false) {
  const save = buildLocalCharacterSave();
  const json = JSON.stringify(save);

  // savedAt changes every snapshot, so compare gameplay content without it.
  const comparison = { ...save, savedAt: 0 };
  const signature = JSON.stringify(comparison);
  const previousComparison = localCharacterSaveSnapshot
    ? JSON.stringify({ ...localCharacterSaveSnapshot, savedAt: 0 })
    : "";

  if (!force && signature === previousComparison) return false;

  try {
    localStorage.setItem(LOCAL_CHARACTER_SAVE_KEY, json);
    localCharacterSaveLoaded = true;
    localCharacterSaveSnapshot = save;
    localCharacterLastSavedJson = json;
    return true;
  } catch (error) {
    console.warn("[SAVE] Browser-local save failed.", error);
    return false;
  }
}

function persistentServerBootstrapPayload() {
  if (!localCharacterSaveLoaded) return null;

  return {
    resources: {
      coins: player.coins,
      wood: player.wood,
      stone: player.stone,
      whiteFlowers: player.whiteFlowers,
      blueFlowers: player.blueFlowers,
      healingPotions: player.healingPotions,
      attackPotions: player.attackPotions,
      magicPotions: player.magicPotions,
      goldSlimeBubbles: player.goldSlimeBubbles,
      arrows: player.arrows
    },
    buffs: {
      attackRemainingMs: Math.max(0, (Number(player.attackPotionUntil) || 0) - Date.now()),
      magicRemainingMs: Math.max(0, (Number(player.magicPotionUntil) || 0) - Date.now()),
      healingPotionCooldownRemainingMs: Math.max(0, (Number(player.consumableCooldownUntil) || 0) - Date.now()),
      attackPotionCooldownRemainingMs: Math.max(0, (Number(player.attackPotionCooldownUntil) || 0) - Date.now()),
      magicPotionCooldownRemainingMs: Math.max(0, (Number(player.magicPotionCooldownUntil) || 0) - Date.now())
    },
    story: {
      woodSwordCrafted: Boolean(player.story.woodSwordCrafted),
      woodBowCrafted: Boolean(player.story.woodBowCrafted),
      shepherdStaffCrafted: Boolean(player.story.shepherdStaffCrafted),
      woodHelmCrafted: Boolean(player.story.woodHelmCrafted),
      woodChestCrafted: Boolean(player.story.woodChestCrafted),
      woodGreavesCrafted: Boolean(player.story.woodGreavesCrafted),
      woodRingCrafted: Boolean(player.story.woodRingCrafted)
    },
    beachQuest: {
      stage: player.beachQuest.stage,
      firstCrabKills: player.beachQuest.firstCrabKills,
      secondCrabKills: player.beachQuest.secondCrabKills,
      icedCoffee: player.beachQuest.icedCoffee
    },
    myrtleQuest: {
      stage: player.myrtleQuest.stage
    },
    shopPurchases: Array.isArray(player.shopPurchases)
      ? player.shopPurchases.slice(0, 64)
      : []
  };
}

function sendLocalPersistentStateToServer(socket) {
  const state = persistentServerBootstrapPayload();
  if (!state || !socket || socket.readyState !== WebSocket.OPEN) return false;

  socket.send(JSON.stringify({
    type: "persistentStateRestore",
    version: LOCAL_CHARACTER_SAVE_VERSION,
    state
  }));
  return true;
}

// Autosave is intentionally slow and change-only. It creates no websocket
// traffic; localStorage is touched only if progression/loadout actually changed.
setInterval(() => {
  saveLocalCharacterState(false);
}, LOCAL_CHARACTER_AUTOSAVE_MS);

window.addEventListener("pagehide", () => {
  saveLocalCharacterState(true);
});

let shopCategoryFilter = "all";

function updateShopUi() {
  const grid =
    document.getElementById(
      "shopGrid"
    );

  const coinText =
    document.getElementById(
      "shopCoinCount"
    );

  if (coinText) {
    coinText.textContent =
      `Coins ${player.coins}`;
  }

  if (!grid) return;

  grid.innerHTML = "";

  for (const item of SHOP_ITEMS) {
    const itemCategory = shopCategoryForItem(item);
    if (
      shopCategoryFilter !== "all" &&
      itemCategory !== shopCategoryFilter
    ) {
      continue;
    }

    const owned =
      playerOwnsItem(item.id);

    const pending =
      player.shopPurchasePending ===
      item.id;

    const button =
      document.createElement(
        "button"
      );

    button.type = "button";
    button.className =
      `shop-item${owned ? " owned" : ""}`;

    button.dataset.shopItemId =
      item.id;

    const questLocked =
      Boolean(item.questOnly) &&
      !owned;

    button.disabled =
      owned ||
      pending ||
      questLocked;

    const image =
      document.createElement("img");

    const imageObject =
      shopImageForItemId(
        item.id
      );

    if (imageObject) {
      image.src =
        imageObject.src;
    }

    image.alt = item.name;

    const name =
      document.createElement("span");

    name.className =
      "shop-item-name";

    name.textContent =
      item.name;

    const meta =
      document.createElement("span");

    meta.className =
      "shop-item-meta";

    meta.textContent =
      shopItemMetadata(item);

    const price =
      document.createElement("span");

    price.className =
      "shop-item-price";

    price.textContent =
      owned
        ? "OWNED"
        : questLocked
          ? "QUEST"
          : pending
            ? "..."
            : "1 COIN";

    button.append(
      image,
      name,
      meta,
      price
    );

    grid.appendChild(button);
  }
}

function setShopOpen(open) {
  shopOpen = open;
  if (!open) hideItemDetailTooltip();

  if (open && player.hunterSnareSetting) {
    cancelHunterSnarePlacement(false);
  }

  if (open && focusFireIsCasting()) {
    cancelFocusFire();
  }

  if (open && fireballIsAiming()) {
    cancelFireballAim();
  }

  const overlay =
    document.getElementById(
      "shopOverlay"
    );

  if (!overlay) return;

  if (open && inventoryOpen) {
    setInventoryOpen(false);
  }

  if (open && craftingOpen) {
    setCraftingOpen(false);
  }

  overlay.classList.toggle(
    "open",
    open
  );

  overlay.setAttribute(
    "aria-hidden",
    open ? "false" : "true"
  );

  inputController.clearKeys();

  if (open) {
    inputController.clearCommands();

    // Keep server position fresh if the player immediately clicks Buy.
    if (
      typeof onlineClient !== "undefined" &&
      onlineClient?.connected
    ) {
      onlineClient.sendLocalState(true);
    }

    updateShopUi();
  }
}

function tryPurchaseShopItem(itemId) {
  if (
    !shopOpen ||
    !ALL_EQUIPMENT_ITEM_IDS.has(
      itemId
    ) ||
    playerOwnsItem(itemId) ||
    player.shopPurchasePending
  ) {
    return;
  }

  if (player.coins < 1) {
    spawnFloatingText(
      tutorialNpc.x,
      tutorialNpc.y - 26,
      "NEED 1 COIN",
      "#ffe38b",
      0.85
    );
    return;
  }

  if (
    typeof onlineClient !== "undefined" &&
    onlineClient?.connected
  ) {
    player.shopPurchasePending =
      itemId;

    if (
      !onlineClient.requestShopPurchase(
        itemId
      )
    ) {
      player.shopPurchasePending =
        null;
    }

    updateShopUi();
    return;
  }

  player.coins -= 1;

  grantInventoryItem(
    itemId,
    1
  );

  spawnFloatingText(
    tutorialNpc.x,
    tutorialNpc.y - 26,
    "PURCHASED!",
    "#ffe38b",
    0.85
  );

  updateShopUi();
  updateInventoryUi();
  updateHotbar();
}

function setInventoryOpen(open) {
  // Inventory/equipment management is allowed while hidden.
  inventoryOpen = open;
  if (!open) {
    hideItemDetailTooltip();
    hideSkillDetailTooltip();
  }

  if (open && player.hunterSnareSetting) {
    cancelHunterSnarePlacement(false);
  }

  if (open && focusFireIsCasting()) {
    cancelFocusFire();
  }

  if (open && fireballIsAiming()) {
    cancelFireballAim();
  }

  if (open && shopOpen) {
    setShopOpen(false);
  }

  if (open && craftingOpen) {
    setCraftingOpen(false);
  }

  const overlay = document.getElementById("inventoryOverlay");
  overlay.classList.toggle("open", open);
  overlay.setAttribute("aria-hidden", open ? "false" : "true");

  // Stop held input and discard queued gameplay commands when a menu opens.
  inputController.clearKeys();
  if (open) inputController.clearCommands();

  updateInventoryUi();
  if (open) {
    updateMenuHotkeyRailVisibility(document.querySelector(".inventory-page.active")?.id || "inventoryPage");
  }
}

function updateMenuHotkeyRailVisibility(pageId) {
  const inventoryContext = pageId === "inventoryPage";
  const skillsContext = pageId === "skillsPage";
  document.getElementById("menuItemHotkeyRail")?.classList.toggle("context-hidden", !inventoryContext);
  document.getElementById("menuUtilityHotkeyRail")?.classList.toggle("context-hidden", !inventoryContext);
  document.getElementById("menuSkillHotkeyRail")?.classList.toggle("context-hidden", !skillsContext);
}

function showInventoryPage(pageId) {
  if (pageId !== "skillsPage") hideSkillDetailTooltip();

  if (pageId === "skillsPage") {
    updateClassSelectionUi();
    if (playerHasChosenClass()) {
      showSkillCategory(player.classId);
    }
  }

  document.querySelectorAll(".inventory-page").forEach(page => {
    page.classList.toggle("active", page.id === pageId);
  });

  document.querySelectorAll(".inventory-tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.page === pageId);
  });

  updateMenuHotkeyRailVisibility(pageId);
}

document.querySelectorAll(".inventory-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    showInventoryPage(tab.dataset.page);
  });
});

window.addEventListener("wheel", event => {
  if (inventoryOpen || shopOpen || craftingOpen || classResetConfirmOpen || beachQuestOpen) {
    return;
  }

  if (!Number.isFinite(event.deltaY) || Math.abs(event.deltaY) < 1) {
    return;
  }

  const direction = event.deltaY > 0 ? 1 : -1;
  if (!cycleHotbarSelection(direction)) {
    return;
  }

  event.preventDefault();
}, { passive: false });

const topHotbar = document.getElementById("hotbar");
topHotbar?.addEventListener("click", event => {
  if (inventoryOpen || shopOpen || craftingOpen || classResetConfirmOpen || beachQuestOpen) {
    return;
  }

  const slot = event.target.closest(".hotbar-slot");
  if (!slot || !topHotbar.contains(slot)) return;

  const slotNumber = Number(String(slot.id || "").replace("slot", ""));
  if (!Number.isInteger(slotNumber)) return;

  if (slotNumber >= 1 && slotNumber <= 3) {
    sanitizeUtilityHotbarAssignments();
    const itemId = player.utilityHotbarAssignments?.[slotNumber - 1] || null;
    if (itemId) useConsumable(itemId);
    return;
  }

  if (slotNumber >= 4 && slotNumber <= 8) {
    inputController.queueCommand("equipWeapon", {
      index: slotNumber - 4
    });
  }
});

function showSkillCategory(categoryId) {
  if (
    playerHasChosenClass() &&
    categoryId !== player.classId
  ) {
    categoryId = player.classId;
  }

  document.querySelectorAll(".skill-category-tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.skillCategory === categoryId);
  });

  document.querySelectorAll(".skill-category-panel").forEach(panel => {
    panel.classList.toggle(
      "active",
      panel.dataset.skillCategoryPanel === categoryId
    );
  });

  ensureSelectedSkillForClass(categoryId);
  updateSkillClassHeading();
  renderSkillTreeSelectionState();
}

document.querySelectorAll(".skill-category-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    showSkillCategory(tab.dataset.skillCategory);
  });
});

document.querySelectorAll("[data-class-choice]").forEach(button => {
  button.addEventListener("click", () => {
    choosePlayerClass(button.dataset.classChoice);
  });
});

const pvpToggleButton = document.getElementById("pvpToggleButton");
if (pvpToggleButton) {
  pvpToggleButton.addEventListener("click", () => {
    if (
      player.pvpTogglePending ||
      typeof onlineClient === "undefined" ||
      !onlineClient?.connected
    ) {
      return;
    }

    const remainingMs = Math.max(
      0,
      (Number(player.pvpCombatUntil) || 0) - Date.now()
    );

    if (player.pvpEnabled && remainingMs > 0) {
      return;
    }

    player.pvpTogglePending = true;

    if (!onlineClient.requestPvpToggle(!player.pvpEnabled)) {
      player.pvpTogglePending = false;
    }

    updatePvpUi();
  });
}

function showGearPanel(panelId) {
  document.querySelectorAll(".gear-panel").forEach(panel => {
    panel.classList.toggle("active", panel.id === panelId);
  });

  document.querySelectorAll(".equipped-box[data-gear-panel]").forEach(button => {
    button.classList.toggle("active", button.dataset.gearPanel === panelId);
  });
}

document.querySelectorAll(".equipped-box[data-gear-panel]").forEach(button => {
  button.addEventListener("click", () => {
    showGearPanel(button.dataset.gearPanel);
  });
});

setupSkillTreeUi();
updateMenuHotkeyRailVisibility(document.querySelector(".inventory-page.active")?.id || "inventoryPage");

document.querySelectorAll(".skill-bind-button").forEach(button => {
  button.addEventListener("click", () => {
    bindSkillToKey(
      button.dataset.skillId,
      button.dataset.skillKey || null
    );
  });
});

document.querySelectorAll(".ability-upgrade-button").forEach(button => {
  button.addEventListener("click", () => {
    breakShadowHide();
    upgradeAbility(button.dataset.abilityId);
  });
});

const skillsPageEl = document.getElementById("skillsPage");
if (skillsPageEl) {
  skillsPageEl.addEventListener("click", event => {
    const button = event.target.closest(".skill-enhancement-toggle");
    if (!button) return;

    const enhId = button.dataset.enhId;
    setEnhancementToggle(
      enhId,
      !enhancementToggleState(enhId)
    );
  });
}

document.getElementById("inventoryClose").addEventListener("click", () => {
  setInventoryOpen(false);
});

document.getElementById("shopClose").addEventListener("click", () => {
  setShopOpen(false);
});

document.getElementById("shopTabs").addEventListener("click", event => {
  const button = event.target.closest("[data-shop-filter]");
  if (!button) return;

  shopCategoryFilter = button.dataset.shopFilter || "all";

  document.querySelectorAll(".shop-tab").forEach(tab => {
    tab.classList.toggle(
      "active",
      tab.dataset.shopFilter === shopCategoryFilter
    );
  });

  updateShopUi();
});

document.getElementById("shopGrid").addEventListener("click", event => {
  const button =
    event.target.closest(
      "[data-shop-item-id]"
    );

  if (
    !button ||
    button.disabled
  ) {
    return;
  }

  tryPurchaseShopItem(
    button.dataset.shopItemId
  );
});


document.getElementById("craftClose").addEventListener("click", () => {
  setCraftingOpen(false);
});

document.getElementById("craftOverlay").addEventListener("pointerdown", event => {
  if (event.target === event.currentTarget) setCraftingOpen(false);
});

document.getElementById("classResetYes").addEventListener("click", () => {
  setClassResetConfirmOpen(false);
  resetClassAndSkills();
});

document.getElementById("classResetNo").addEventListener("click", () => {
  setClassResetConfirmOpen(false);
});

document.getElementById("beachQuestClose")?.addEventListener("click", () => {
  setBeachQuestOpen(false);
});

document.getElementById("beachQuestOverlay")?.addEventListener("pointerdown", event => {
  if (event.target === event.currentTarget) setBeachQuestOpen(false);
});

document.getElementById("beachQuestAction")?.addEventListener("click", event => {
  const action = event.currentTarget.dataset.questAction;
  if (!action) return;
  const questNpcType = event.currentTarget.dataset.questNpcType;
  const requested = questNpcType === "greenWitch"
    ? onlineClient?.requestMyrtleQuest(action)
    : onlineClient?.requestBeachGirlQuest(action);
  if (!requested) return;
  event.currentTarget.disabled = true;
  event.currentTarget.textContent = "...";
});

document.getElementById("craftGrid").addEventListener("click", event => {
  const button =
    event.target.closest(
      "[data-craft-recipe]"
    );

  if (
    !button ||
    button.disabled
  ) {
    return;
  }

  tryCraftRecipe(
    button.dataset.craftRecipe
  );
});

document.getElementById("inventoryPage").addEventListener("click", event => {
  const utilityElement = event.target.closest('[data-utility-hotbar-assignable="true"]');
  if (utilityElement) {
    const utilityItemId = utilityElement.dataset.utilityItem;
    if (!utilityHotbarItemCanBeAssigned(utilityItemId) || consumableCount(utilityItemId) <= 0) {
      return;
    }
    selectedHotbarInventoryItemId = utilityItemId;
    updateInventoryUi();
    return;
  }

  const itemElement =
    event.target.closest(
      '[data-hotbar-assignable="true"]'
    );

  if (!itemElement) return;

  const itemId =
    itemElement.dataset.ownedItem;

  if (
    !itemId ||
    !playerOwnsItem(itemId)
  ) {
    return;
  }

  if (!hotbarItemCanBeAssigned(itemId)) {
    showHotbarAssignmentRestriction(itemId);
    return;
  }

  selectedHotbarInventoryItemId =
    itemId;

  updateInventoryUi();
});

document.getElementById("inventoryPage").addEventListener("dragstart", event => {
  const utilityElement = event.target.closest('[data-utility-hotbar-assignable="true"]');
  if (utilityElement) {
    const itemId = utilityElement.dataset.utilityItem;
    if (!utilityHotbarItemCanBeAssigned(itemId) || consumableCount(itemId) <= 0) {
      event.preventDefault();
      return;
    }
    selectedHotbarInventoryItemId = null;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-slime-utility-item", itemId);
    event.dataTransfer.setData("text/plain", itemId);
    utilityElement.classList.add("dragging");
    return;
  }

  const itemElement = event.target.closest('[data-hotbar-assignable="true"]');
  if (!itemElement) return;

  const itemId = itemElement.dataset.ownedItem;
  if (!hotbarItemCanBeAssigned(itemId)) {
    event.preventDefault();
    showHotbarAssignmentRestriction(itemId);
    return;
  }

  selectedHotbarInventoryItemId = itemId;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("application/x-slime-item", itemId);
  event.dataTransfer.setData("text/plain", itemId);
  itemElement.classList.add("dragging");
  updateInventoryUi();
});

document.getElementById("inventoryPage").addEventListener("dragend", event => {
  event.target.closest('[data-hotbar-assignable="true"]')?.classList.remove("dragging");
  event.target.closest('[data-utility-hotbar-assignable="true"]')?.classList.remove("dragging");
  document.querySelectorAll("[data-menu-hotbar-slot].drag-over, [data-menu-utility-slot].drag-over")
    .forEach(slot => slot.classList.remove("drag-over"));
});

const menuItemHotkeyRail = document.getElementById("menuItemHotkeyRail");
menuItemHotkeyRail?.addEventListener("dragstart", event => {
  const slot = event.target.closest("[data-menu-hotbar-slot]");
  if (!slot) return;

  const slotIndex = Number(slot.dataset.menuHotbarSlot);
  const itemId = player.hotbarAssignments?.[slotIndex] || null;
  if (!hotbarItemCanBeAssigned(itemId)) {
    event.preventDefault();
    return;
  }

  selectedHotbarInventoryItemId = itemId;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("application/x-slime-item", itemId);
  event.dataTransfer.setData("application/x-slime-hotbar-source", String(slotIndex));
  event.dataTransfer.setData("text/plain", itemId);
  slot.classList.add("dragging");
});

menuItemHotkeyRail?.addEventListener("dragend", event => {
  event.target.closest("[data-menu-hotbar-slot]")?.classList.remove("dragging");
  menuItemHotkeyRail.querySelectorAll("[data-menu-hotbar-slot].drag-over")
    .forEach(slot => slot.classList.remove("drag-over"));
});

menuItemHotkeyRail?.addEventListener("dragover", event => {
  const slot = event.target.closest("[data-menu-hotbar-slot]");
  if (!slot) return;
  const itemId = event.dataTransfer.getData("application/x-slime-item") || selectedHotbarInventoryItemId;
  if (!hotbarItemCanBeAssigned(itemId)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  slot.classList.add("drag-over");
});

menuItemHotkeyRail?.addEventListener("dragleave", event => {
  event.target.closest("[data-menu-hotbar-slot]")?.classList.remove("drag-over");
});

menuItemHotkeyRail?.addEventListener("drop", event => {
  const slot = event.target.closest("[data-menu-hotbar-slot]");
  if (!slot) return;
  event.preventDefault();
  slot.classList.remove("drag-over");
  const itemId = event.dataTransfer.getData("application/x-slime-item") || event.dataTransfer.getData("text/plain");
  assignItemToHotbar(itemId, Number(slot.dataset.menuHotbarSlot));
});

menuItemHotkeyRail?.addEventListener("click", event => {
  const slot = event.target.closest("[data-menu-hotbar-slot]");
  if (!slot || !selectedHotbarInventoryItemId) return;
  assignItemToHotbar(selectedHotbarInventoryItemId, Number(slot.dataset.menuHotbarSlot));
});

menuItemHotkeyRail?.addEventListener("contextmenu", event => {
  const slot = event.target.closest("[data-menu-hotbar-slot]");
  if (!slot) return;
  event.preventDefault();
  const slotIndex = Number(slot.dataset.menuHotbarSlot);
  const itemId = player.hotbarAssignments?.[slotIndex];
  if (itemId) clearItemFromHotbar(itemId);
});

const menuUtilityHotkeyRail = document.getElementById("menuUtilityHotkeyRail");
menuUtilityHotkeyRail?.addEventListener("click", event => {
  const slot = event.target.closest("[data-menu-utility-slot]");
  if (!slot || !utilityHotbarItemCanBeAssigned(selectedHotbarInventoryItemId)) return;
  assignUtilityItemToHotbar(
    selectedHotbarInventoryItemId,
    Number(slot.dataset.menuUtilitySlot)
  );
});

menuUtilityHotkeyRail?.addEventListener("dragstart", event => {
  const slot = event.target.closest("[data-menu-utility-slot]");
  if (!slot) return;
  const slotIndex = Number(slot.dataset.menuUtilitySlot);
  const itemId = player.utilityHotbarAssignments?.[slotIndex] || null;
  if (!utilityHotbarItemCanBeAssigned(itemId)) {
    event.preventDefault();
    return;
  }
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("application/x-slime-utility-item", itemId);
  event.dataTransfer.setData("application/x-slime-utility-source", String(slotIndex));
  event.dataTransfer.setData("text/plain", itemId);
  slot.classList.add("dragging");
});

menuUtilityHotkeyRail?.addEventListener("dragend", event => {
  event.target.closest("[data-menu-utility-slot]")?.classList.remove("dragging");
  menuUtilityHotkeyRail.querySelectorAll("[data-menu-utility-slot].drag-over")
    .forEach(slot => slot.classList.remove("drag-over"));
});

menuUtilityHotkeyRail?.addEventListener("dragover", event => {
  const slot = event.target.closest("[data-menu-utility-slot]");
  if (!slot) return;
  const itemId = event.dataTransfer.getData("application/x-slime-utility-item");
  if (!utilityHotbarItemCanBeAssigned(itemId)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  slot.classList.add("drag-over");
});

menuUtilityHotkeyRail?.addEventListener("dragleave", event => {
  event.target.closest("[data-menu-utility-slot]")?.classList.remove("drag-over");
});

menuUtilityHotkeyRail?.addEventListener("drop", event => {
  const slot = event.target.closest("[data-menu-utility-slot]");
  if (!slot) return;
  event.preventDefault();
  slot.classList.remove("drag-over");
  const itemId = event.dataTransfer.getData("application/x-slime-utility-item");
  if (!utilityHotbarItemCanBeAssigned(itemId)) return;
  assignUtilityItemToHotbar(itemId, Number(slot.dataset.menuUtilitySlot));
});

menuUtilityHotkeyRail?.addEventListener("contextmenu", event => {
  const slot = event.target.closest("[data-menu-utility-slot]");
  if (!slot) return;
  event.preventDefault();
  const slotIndex = Number(slot.dataset.menuUtilitySlot);
  const itemId = player.utilityHotbarAssignments?.[slotIndex] || null;
  if (itemId) clearUtilityItemFromHotbar(itemId);
});

document.querySelectorAll("[data-utility-assign-slot]").forEach(button => {
  button.addEventListener("click", () => {
    if (!selectedHotbarInventoryItemId || !utilityHotbarItemCanBeAssigned(selectedHotbarInventoryItemId)) return;
    assignUtilityItemToHotbar(selectedHotbarInventoryItemId, Number(button.dataset.utilityAssignSlot));
  });
});

document.querySelectorAll("[data-hotbar-assign-slot]").forEach(button => {
  button.addEventListener("click", () => {
    if (!selectedHotbarInventoryItemId) {
      return;
    }

    assignItemToHotbar(
      selectedHotbarInventoryItemId,
      Number(
        button.dataset.hotbarAssignSlot
      )
    );
  });
});

document.getElementById("hotbarAssignClear")?.addEventListener("click", () => {
  if (!selectedHotbarInventoryItemId) return;
  if (utilityHotbarItemCanBeAssigned(selectedHotbarInventoryItemId)) {
    clearUtilityItemFromHotbar(selectedHotbarInventoryItemId);
    return;
  }
  clearItemFromHotbar(selectedHotbarInventoryItemId);
});

document.querySelectorAll(".hat-choice").forEach(button => {
  button.addEventListener("click", () => {
    const index =
      Number(
        button.dataset.hatIndex
      );

    if (
      index >= 0 &&
      !playerOwnsHatIndex(index)
    ) {
      return;
    }

    if (index >= 0) {
      const itemId = HAT_ITEM_IDS[index];
      if (!armorItemCanBeEquipped(itemId)) {
        showArmorClassRestriction(itemId);
        return;
      }
    }

    player.hatIndex = index;
    updateInventoryUi();
  });
});

document.querySelectorAll(".weapon-choice").forEach(button => {
  button.addEventListener("click", () => {
    if (focusFireIsCasting() || fireballIsAiming() || player.rainCloudCasting) return;

    const index =
      Number(
        button.dataset.weaponIndex
      );

    if (index === -1) {
      player.weaponIndex = -1;
    } else if (
      playerOwnsWeaponIndex(index)
    ) {
      equipWeaponIndex(index);
    }

    updateInventoryUi();
    updateHotbar();
  });
});

document.querySelectorAll(".shirt-choice").forEach(button => {
  button.addEventListener("click", () => {
    const index =
      Number(
        button.dataset.shirtIndex
      );

    if (
      index >= 0 &&
      !playerOwnsShirtIndex(index)
    ) {
      return;
    }

    if (index >= 0) {
      const itemId = SHIRT_ITEM_IDS[index];
      if (!armorItemCanBeEquipped(itemId)) {
        showArmorClassRestriction(itemId);
        return;
      }
    }

    player.shirtIndex = index;
    updateInventoryUi();
  });
});

document.querySelectorAll(".pants-choice").forEach(button => {
  button.addEventListener("click", () => {
    const index =
      Number(
        button.dataset.pantsIndex
      );

    if (
      index >= 0 &&
      !playerOwnsPantsIndex(index)
    ) {
      return;
    }

    if (index >= 0) {
      const itemId = PANTS_ITEM_IDS[index];
      if (!armorItemCanBeEquipped(itemId)) {
        showArmorClassRestriction(itemId);
        return;
      }
    }

    player.pantsIndex = index;
    updateInventoryUi();
  });
});

document.querySelectorAll(".charm-choice").forEach(button => {
  button.addEventListener("click", () => {
    const index =
      Number(
        button.dataset.charmIndex
      );

    if (
      index >= 0 &&
      !playerOwnsCharmIndex(index)
    ) {
      return;
    }

    if (index >= 0) {
      const itemId = CHARM_ITEM_IDS[index];
      if (!armorItemCanBeEquipped(itemId)) {
        showArmorClassRestriction(itemId);
        return;
      }
    }

    player.charmIndex = index;
    updateInventoryUi();
  });
});

document.querySelectorAll(".stat-plus").forEach(button => {
  button.addEventListener("click", () => {
    breakShadowHide();
    spendSkillPoint(button.dataset.stat);
  });
});


// -----------------------------------------------------------------------------
// RUNTIME HELPERS / SYSTEM UTILITIES
// -----------------------------------------------------------------------------


function worldPositionIsOpen(x, y) {
  // Water is traversable for players. Void/solid geometry still blocks.
  return !hitsSolidObstacle(x, y);
}

function moveWithWorldCollision(entity, nextX, nextY) {
  if (worldPositionIsOpen(nextX, entity.y)) {
    entity.x = nextX;
  }

  if (worldPositionIsOpen(entity.x, nextY)) {
    entity.y = nextY;
  }
}

function getCanvasPointerPosition(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (VIEW_W / rect.width),
    y: (event.clientY - rect.top) * (VIEW_H / rect.height)
  };
}


let worldTime = 0;

// Current camera position, used to aim the sword correctly with the mouse.
let currentCamX = 0;
let currentCamY = 0;

// Mobile renders the world from a whole-pixel camera and applies the remaining
// camera fraction once to the complete world layer. This keeps every sprite on
// the same pixel grid while allowing the enlarged phone view to scroll by less
// than one logical pixel per frame. The local player cancels this presentation
// offset below so it remains firmly centered rather than shimmering in place.
let mobileCameraPresentationOffsetX = 0;
let mobileCameraPresentationOffsetY = 0;


// -----------------------------------------------------------------------------
// COLLISION
// -----------------------------------------------------------------------------


function hitsTreeObstacle(x, y, playerRadius = 4) {
  for (const tree of trees) {
    const width = tree.isStump ? 8 : tree.collision.width;
    const height = tree.isStump ? 4 : tree.collision.height;
    const boxX = tree.x - width / 2;
    const boxY = tree.y - height;

    if (circleRectCollision(
      x,
      y,
      playerRadius,
      boxX,
      boxY,
      width,
      height
    )) {
      return true;
    }
  }

  return false;
}

function hitsSceneryRockObstacle(x, y, playerRadius = 4) {
  for (const rock of sceneryRocks) {
    const width = Math.max(1, Number(rock?.collision?.width) || 10);
    const height = Math.max(1, Number(rock?.collision?.height) || 6);
    const boxX = Number(rock.x) - width / 2;
    const boxY = Number(rock.y) - height;

    if (circleRectCollision(
      x,
      y,
      playerRadius,
      boxX,
      boxY,
      width,
      height
    )) {
      return true;
    }
  }

  return false;
}

function hitsHouseObstacle(x, y, playerRadius = 4) {
  for (const house of houses) {
    const width = house.collision.width;
    const height = house.collision.height;
    const boxX = house.x - width / 2;
    const boxY = house.y - height;

    if (circleRectCollision(
      x,
      y,
      playerRadius,
      boxX,
      boxY,
      width,
      height
    )) {
      return true;
    }
  }

  return false;
}

function hitsSpawnFixtureObstacle(
  x,
  y,
  playerRadius = 4
) {
  if (currentMapId === "hunterHollow") {
    return circleRectCollision(
      x,
      y,
      playerRadius,
      hunterNpc.x - 5,
      hunterNpc.y - 8,
      10,
      8
    );
  }

  if (currentMapId !== "spawn") {
    return false;
  }

  // NPC feet/body footprint.
  if (
    circleRectCollision(
      x,
      y,
      playerRadius,
      tutorialNpc.x - 4,
      tutorialNpc.y - 7,
      8,
      7
    )
  ) {
    return true;
  }

  // Workbench footprint.
  if (
    circleRectCollision(
      x,
      y,
      playerRadius,
      woodCraftBench.x - 7,
      woodCraftBench.y - 6,
      14,
      6
    )
  ) {
    return true;
  }

  // The reset crystal is narrow, so only its grounded base blocks movement.
  if (
    circleRectCollision(
      x,
      y,
      playerRadius,
      classResetCrystal.x - 5,
      classResetCrystal.y - 8,
      10,
      8
    )
  ) {
    return true;
  }

  return false;
}

function hitsPrototypeIslandVoid(x, y, playerRadius = 4) {
  const definition = WORLD_CONTENT?.maps?.[currentMapId] || null;
  const hasAuthoredTerrain = Boolean(
    definition &&
    typeof TERRAIN_RULES !== "undefined" &&
    TERRAIN_RULES.terrainDefinition(definition)
  );

  if (hasAuthoredTerrain) {
    const terrainOccupancy = TERRAIN_RULES.circleCanOccupy(
      definition,
      x,
      y,
      playerRadius,
      { allowWater: true }
    );
    return terrainOccupancy === false;
  }

  if (!isPrototypeIslandMap(currentMapId)) return false;
  return !pointInPrototypeIslandWalkableArea(x, y);
}

function hitsSolidObstacle(x, y) {
  return (
    hitsPrototypeIslandVoid(x, y) ||
    hitsTreeObstacle(x, y) ||
    hitsSceneryRockObstacle(x, y) ||
    hitsHouseObstacle(x, y) ||
    hitsSpawnFixtureObstacle(x, y)
  );
}


// -----------------------------------------------------------------------------
// CLIENT RENDERING
// -----------------------------------------------------------------------------
// Everything below this point is presentation. A future authoritative server
// should not need canvas, sprites, camera state, particles, or floating text.
function drawGround(camX, camY) {
  ctx.fillStyle = "#6f9f52";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // Very subtle grass variation so movement/camera motion is easier to see.
  ctx.fillStyle = "#6a984d";
  for (let y = Math.floor(camY / 16) * 16; y < camY + VIEW_H + 16; y += 16) {
    for (let x = Math.floor(camX / 16) * 16; x < camX + VIEW_W + 16; x += 16) {
      if (((x / 16) + (y / 16)) % 5 === 0) {
        ctx.fillRect(Math.round(x - camX), Math.round(y - camY), 16, 16);
      }
    }
  }
}



function drawPlayer(camX, camY, reflectionMode = false, carryingEnemyOverride = undefined) {
  const pinLocalPlayerToCamera =
    mobileControlsEnabled &&
    !reflectionMode &&
    arguments.length < 4 &&
    (
      mobileCameraPresentationOffsetX !== 0 ||
      mobileCameraPresentationOffsetY !== 0
    );

  if (pinLocalPlayerToCamera) {
    ctx.save();
    ctx.translate(
      -mobileCameraPresentationOffsetX,
      -mobileCameraPresentationOffsetY
    );
  }

  const screenX = Math.round(player.x - camX);
  const screenY = Math.round(player.y - camY);

  if (player.isDead) {
    const ghostFloatWave = Math.sin(worldTime * 2.7);
    const ghostBob =
      reflectionMode
        ? 0
        : Math.round(ghostFloatWave * 1.5);

    const baseX = screenX - 8;
    const baseY = screenY - 15 + ghostBob;
    const appearance = currentPlayerAppearance();

    if (!reflectionMode) {
      const shadowPulse = (ghostFloatWave + 1) * 0.5;
      const shadowWidth = 8 + Math.round(shadowPulse * 4);
      const shadowAlpha = 0.24 + shadowPulse * 0.16;
      ctx.fillStyle = `rgba(35, 52, 37, ${shadowAlpha.toFixed(3)})`;
      ctx.fillRect(
        screenX - Math.floor(shadowWidth / 2),
        screenY,
        shadowWidth,
        3
      );
    }

    ctx.save();
    ctx.globalAlpha *= 0.90;
    ctx.drawImage(playerGhostBodyImage, baseX, baseY);
    ctx.drawImage(sprite.face, baseX, baseY);
    ctx.drawImage(appearance.hat, baseX, baseY);
    ctx.restore();
    if (pinLocalPlayerToCamera) ctx.restore();
    return;
  }

  const blinkFadeAlpha =
    !reflectionMode && player.jesterBlinkFadeTime > 0
      ? 0.30 + 0.70 * (1 - (player.jesterBlinkFadeTime / player.jesterBlinkFadeDuration))
      : 1;

  const shadowHideAlpha =
    player.shadowHidden
      ? (player.shadowHideRevealTime > 0 ? 1 : 0.42)
      : 1;
  const camouflageAlpha =
    player.camouflaged && !player.shadowHidden
      ? 0.64
      : 1;
  const playerDrawAlpha =
    blinkFadeAlpha * shadowHideAlpha * camouflageAlpha;

  const plantedBaseX = screenX - 8;
  const plantedBaseY = screenY - 15;

  let baseX = plantedBaseX;
  let baseY = plantedBaseY;

  // Local rendering calls drawPlayer() without a fourth argument and may
  // look up the local carried enemy. Remote rendering ALWAYS supplies a fourth
  // argument (enemy object or null), so a remote player with no slime must not
  // accidentally inherit the local player's carry state.
  const hasCarryingOverride =
    arguments.length >= 4;

  const carriedEnemy =
    hasCarryingOverride
      ? (
          carryingEnemyOverride &&
          typeof carryingEnemyOverride === "object"
            ? carryingEnemyOverride
            : null
        )
      : getLocalCarriedHurlObject();

  const carryingEnemy =
    Boolean(carriedEnemy);

  const carryPickupDuration =
    carryingEnemy && carriedEnemy
      ? Math.max(
          0.01,
          carriedEnemy.pickupDuration || 0.18
        )
      : 0.18;

  const carryPickupProgressRaw =
    carryingEnemy && carriedEnemy
      ? Math.max(
          0,
          Math.min(
            1,
            1 -
              (carriedEnemy.pickupTime || 0) /
                carryPickupDuration
          )
        )
      : 1;

  const carryPickupEffort =
    carryingEnemy &&
    carryPickupProgressRaw < 1
      ? Math.sin(carryPickupProgressRaw * Math.PI)
      : 0;

  const carryPickupDirX =
    carryingEnemy && carriedEnemy
      ? Number(carriedEnemy.pickupDirX) || 0
      : 0;

  const carryPickupDirY =
    carryingEnemy && carriedEnemy
      ? Number(carriedEnemy.pickupDirY) || 0
      : 0;

  const hurlReachDuration = Math.max(
    0.01,
    Number(player.hurlReachDuration) || 0.18
  );

  const hurlReachProgressRaw =
    !carryingEnemy && player.hurlReachTime > 0
      ? Math.max(
          0,
          Math.min(
            1,
            1 - player.hurlReachTime / hurlReachDuration
          )
        )
      : 1;

  const hurlReachEffort =
    !carryingEnemy &&
    player.hurlReachTime > 0
      ? Math.sin(hurlReachProgressRaw * Math.PI)
      : 0;

  const hurlReachDirX =
    !carryingEnemy
      ? Number(player.hurlReachDirX) || 0
      : 0;

  const hurlReachDirY =
    !carryingEnemy
      ? Number(player.hurlReachDirY) || 0
      : 0;

  // Ground shadow stays planted at the real player position.
  // Reflections do not mirror the shadow into the pond.
  if (!reflectionMode) {
    const visuallyHidden = player.shadowHidden && player.shadowHideRevealTime <= 0;

    const wading =
      typeof terrainEntityIsWading === "function" &&
      terrainEntityIsWading(player.x, player.y, currentMapId);

    if (!visuallyHidden && !wading) {
      ctx.fillStyle = "rgba(35, 52, 37, .48)";
      ctx.fillRect(screenX - 5, screenY, 10, 3);
    }
  }

  // Tiny VISUAL lunge in the direction of the attack.
  // This does not change the player's actual world position/collision.
  if (player.attackTime > 0) {
    const attackProgress =
      1 - (player.attackTime / player.attackDuration);

    // 0 -> 1 -> 0 over the swing.
    const lunge = Math.sin(attackProgress * Math.PI);

    let lungeX = 0;
    let lungeY = 0;

    const lungeDistance =
      isWandTypeWeapon(equippedWeapon())
        ? 1
        : 2;

    if (player.attackDirection === "left")  lungeX = -lungeDistance;
    if (player.attackDirection === "right") lungeX =  lungeDistance;
    if (player.attackDirection === "up")    lungeY = -lungeDistance;
    if (player.attackDirection === "down")  lungeY =  lungeDistance;

    baseX += Math.round(lungeX * lunge);
    baseY += Math.round(lungeY * lunge);
  }

  if (carryingEnemy && carryPickupEffort > 0) {
    // Tiny visual-only step/reach toward the slime during the pickup wind-up.
    // Only move the body base here; headOffsetY is initialized below.
    baseX += Math.round(
      carryPickupDirX *
      3 *
      carryPickupEffort
    );

    baseY += Math.round(
      carryPickupDirY *
      2 *
      carryPickupEffort
    );
  }

  if (hurlReachEffort > 0) {
    baseX += Math.round(
      hurlReachDirX *
      3 *
      hurlReachEffort
    );

    baseY += Math.round(
      hurlReachDirY *
      2 *
      hurlReachEffort
    );
  }

  // ---------------------------------------------------------
  // WALK ANIMATION
  // ---------------------------------------------------------
  let leftLegScaleY = 1;
  let rightLegScaleY = 1;
  let leftArmOffsetY = 0;
  let rightArmOffsetY = 0;
  let headOffsetY = 0;
  let walkWave = 0;

  if (player.walkTime > 0) {
    walkWave = Math.sin(player.walkTime);

    if (player.firstRaisedLeg === "right") {
      walkWave *= -1;
    }

    leftLegScaleY =
      1 - Math.max(0, walkWave) * 0.30;

    rightLegScaleY =
      1 - Math.max(0, -walkWave) * 0.30;

    if (!carryingEnemy) {
      const armStep = Math.round(walkWave);
      leftArmOffsetY = armStep;
      rightArmOffsetY = -armStep;
    }

    headOffsetY = Math.round(
      (1 - Math.cos(player.walkTime * 2)) * 0.5
    );
  }

  if (carryingEnemy && carryPickupEffort > 0) {
    headOffsetY -= Math.round(
      carryPickupEffort
    );
  }

  if (hurlReachEffort > 0) {
    headOffsetY -= Math.round(
      hurlReachEffort
    );
  }

  // Hunter's Snare setup is a deliberate hands-on-ground action. The player
  // settles onto one knee, leans forward, and alternates their hands while the
  // existing setup bar fills. This is presentation-only; world position and
  // collision never move.
  const snareSetupActive =
    Boolean(player.hunterSnareSetting) &&
    !carryingEnemy;

  const snareSetupProgress =
    snareSetupActive
      ? Math.max(
          0,
          Math.min(
            1,
            (Number(player.hunterSnareSetTime) || 0) /
              Math.max(0.1, Number(player.hunterSnareSetDuration) || 1.25)
          )
        )
      : 0;

  const snarePoseBlend =
    snareSetupActive
      ? Math.min(1, snareSetupProgress / 0.10)
      : 0;

  const snareWorkWave =
    snareSetupActive
      ? Math.sin(worldTime * 9.0)
      : 0;

  if (snareSetupActive) {
    baseX += Math.round(snarePoseBlend * 1);
    // Keep the upper body mostly at its normal height. The kneeling legs do
    // most of the posing work so the torso/head do not look vertically squashed.
    baseY += Math.round(snarePoseBlend * 1);

    // One planted leg, one compressed knee.
    leftLegScaleY = 1 - 0.42 * snarePoseBlend;
    rightLegScaleY = 1 - 0.12 * snarePoseBlend;

    // Only a light head dip/bob while the hands work near the ground.
    headOffsetY += Math.round(
      snarePoseBlend * 1 +
      (snareWorkWave > 0.35 ? 1 : 0)
    );

    leftArmOffsetY = 0;
    rightArmOffsetY = 0;
  }

  // Give Ninja Hide a tiny flourish before the stealth visually kicks in:
  // a short hop plus a little empty-hand arm motion.
  if (player.shadowHidden && player.shadowHideRevealTime > 0) {
    const hideProgress =
      1 - (player.shadowHideRevealTime / player.shadowHideRevealDuration);
    const hideHop = Math.sin(hideProgress * Math.PI);

    baseY -= Math.round(hideHop * 3);
    headOffsetY -= Math.round(hideHop);

    const currentWeaponForHide = equippedWeapon();

    if (currentWeaponForHide) {
      // Idle tools are held in the left hand, so flourish with the empty right hand.
      rightArmOffsetY -= 2 + Math.round(hideHop);
      leftArmOffsetY += 1;
    } else {
      // Unarmed: do a tiny two-arm flourish, biased toward the right arm.
      rightArmOffsetY -= 2 + Math.round(hideHop);
      leftArmOffsetY += 1;
    }
  }

  function drawLeg(img, scaleY, drawBaseX = baseX, drawBaseY = baseY) {
    const legTop = 12;
    const legHeight = 4;
    const compressedHeight = Math.max(
      2,
      Math.round(legHeight * scaleY)
    );

    ctx.drawImage(
      img,
      0, legTop, 16, legHeight,
      drawBaseX, drawBaseY + legTop, 16, compressedHeight
    );
  }

  function drawCarryArmFlipped(
    img,
    drawX,
    drawY
  ) {
    // Flip the existing separated arm sprite vertically inside its own
    // 16x16 box. This puts the hand above the shoulder instead of simply
    // lifting the normal hanging-arm artwork upward.
    ctx.save();

    ctx.translate(
      drawX,
      drawY + 16
    );

    ctx.scale(
      1,
      -1
    );

    ctx.drawImage(
      img,
      0,
      0
    );

    ctx.restore();
  }

  ctx.save();
  ctx.globalAlpha *= playerDrawAlpha;

  // ---------------------------------------------------------
  // PIXEL-SAFE ATTACK
  // ---------------------------------------------------------
  const currentWeaponForPose =
    equippedWeapon();

  const wandAttackPoseActive =
    isWandTypeWeapon(currentWeaponForPose) &&
    player.attackTime > 0;

  let attackFrame = -1;

  if (player.attackTime > 0) {
    const progress =
      1 - (player.attackTime / Math.max(0.01, player.attackDuration));

    if (wandAttackPoseActive) {
      // ~0.09s anticipation, ~0.17s active sweep, then follow-through. These
      // boundaries intentionally line up with the delayed wand impact/slash.
      if (progress < 0.22) {
        attackFrame = 0;
      } else if (progress < 0.62) {
        attackFrame = 1;
      } else {
        attackFrame = 2;
      }
    } else if (progress < 0.34) {
      attackFrame = 0;
    } else if (progress < 0.67) {
      attackFrame = 1;
    } else {
      attackFrame = 2;
    }
  }

  // The swing hand comes from which side of the player's sprite was clicked.

  const bowPoseActive =
    currentWeaponForPose === "bow";

  const focusFireBowPose =
    bowPoseActive &&
    focusFireIsCasting();

  const bowDrawAmount =
    bowPoseActive
      ? (
          focusFireBowPose
            ? 1
            : Math.max(
                0,
                Math.min(
                  1,
                  Number(player.bowDrawAmount) || 0
                )
              )
        )
      : 0;

  const bowAimingActive =
    bowPoseActive &&
    (
      focusFireBowPose ||
      player.bowDrawing ||
      player.bowReleaseTime > 0 ||
      bowDrawAmount > 0.025
    );

  const bowMeleeActive =
    bowPoseActive &&
    !focusFireBowPose &&
    player.attackTime > 0 &&
    !player.bowDrawing &&
    player.bowReleaseTime <= 0;

  const attacking = player.attackTime > 0;

  // At rest the bow stays in one consistent hand and does not chase the
  // cursor. Once the player begins drawing, the cursor side chooses which arm
  // presents the bow, just like the earlier visual tests.
  const useRightHand =
    bowPoseActive
      ? (
          (bowAimingActive || bowMeleeActive)
            ? player.attackHand === "right"
            : false
        )
      : (
          attackFrame >= 0 &&
          player.attackHand === "right"
        );

  // Cosmetic body layers can now come from either the original traveler set
  // or the user-drawn Jester Magician set.
  const appearance = currentPlayerAppearance();

  let weaponArmX = 0;
  let weaponArmY = 0;

  const circularWandCastPose =
    (player.rainCloudCasting || player.fireballAiming) &&
    (
      isWandTypeWeapon(currentWeaponForPose)
    );

  let bowDrawArmAngle = 0;
  let bowHoldArmAngle = 0;
  let bowUpAimBlend = 0;

  if (
    bowPoseActive &&
    !bowAimingActive
  ) {
    // True neutral rest: do not move either arm at all. The player body
    // stays in the normal idle pose, and the bow itself remains upright in the
    // hand until the player actually begins drawing.
    weaponArmX = 0;
    weaponArmY = 0;
    bowDrawArmAngle = 0;
    bowHoldArmAngle = 0;
  } else if (bowPoseActive) {
    const aimX =
      Math.cos(
        player.attackAimAngle || 0
      );

    const aimY =
      Math.sin(
        player.attackAimAngle || 0
      );

    bowUpAimBlend =
      Math.max(
        0,
        Math.min(
          1,
          (
            -aimY - 0.35
          ) / 0.65
        )
      );

    // For ordinary left/right/down aim, the holding arm only nudges by about
    // one pixel. As aim becomes steeply upward, this translation fades away
    // and a shoulder pivot takes over instead.
    weaponArmX =
      Math.round(
        aimX *
        (
          1 -
          bowUpAimBlend
        )
      );

    weaponArmY =
      Math.round(
        aimY *
        (
          1 -
          bowUpAimBlend
        )
      );

    const armStep =
      Math.PI / 16;

    // ---------------------------------------------------------------------
    // HOLDING ARM
    // ---------------------------------------------------------------------
    // When aiming upward, rotate the bow hand inward/upward from its shoulder
    // so the bow genuinely crosses the face instead of moving the whole arm
    // sprite off the torso.
    if (bowUpAimBlend > 0) {
      const holdBaseX =
        useRightHand ? 2 : -2;

      const holdBaseY = 4;

      const inwardX =
        useRightHand ? -1 : 1;

      const desiredHoldX =
        holdBaseX +
        inwardX *
          3.0 *
          bowUpAimBlend +
        aimX *
          1.2 *
          bowUpAimBlend;

      const desiredHoldY =
        holdBaseY +
        aimY *
          5.0 *
          bowUpAimBlend;

      const baseHoldAngle =
        Math.atan2(
          holdBaseY,
          holdBaseX
        );

      const targetHoldAngle =
        Math.atan2(
          desiredHoldY,
          desiredHoldX
        );

      const holdDelta =
        Math.atan2(
          Math.sin(
            targetHoldAngle -
            baseHoldAngle
          ),
          Math.cos(
            targetHoldAngle -
            baseHoldAngle
          )
        );

      bowHoldArmAngle =
        Math.round(
          holdDelta /
          armStep
        ) *
        armStep;
    }

    // ---------------------------------------------------------------------
    // DRAW ARM
    // ---------------------------------------------------------------------
    // The physical rule is simple: the string hand pulls OPPOSITE the arrow
    // direction. This removes the side-specific guesswork from earlier
    // passes:
    //   aim left  -> pull right
    //   aim right -> pull left
    //   aim up    -> pull DOWN
    //   aim down  -> pull up
    const drawBaseX =
      useRightHand ? -2 : 2;

    const drawBaseY = 4;

    const pullX = -aimX;
    const pullY = -aimY;

    const desiredDrawX =
      drawBaseX +
      pullX *
        4.2 *
        bowDrawAmount;

    const desiredDrawY =
      drawBaseY +
      pullY *
        4.2 *
        bowDrawAmount;

    const baseDrawAngle =
      Math.atan2(
        drawBaseY,
        drawBaseX
      );

    const targetDrawAngle =
      Math.atan2(
        desiredDrawY,
        desiredDrawX
      );

    let drawDelta =
      Math.atan2(
        Math.sin(
          targetDrawAngle -
          baseDrawAngle
        ),
        Math.cos(
          targetDrawAngle -
          baseDrawAngle
        )
      );

    drawDelta =
      Math.max(
        -1.20,
        Math.min(
          1.20,
          drawDelta
        )
      );

    bowDrawArmAngle =
      Math.round(
        drawDelta /
        armStep
      ) *
      armStep;
  }

  // Whole-pixel arm poses.
  if (hurlReachEffort > 0) {
    const reachSideShift = Math.round(
      hurlReachDirX * 1.5
    );

    const reachVerticalShift =
      Math.round(
        hurlReachDirY * 1.5
      ) - 1;

    weaponArmX = reachSideShift;
    weaponArmY = reachVerticalShift - 1;

    leftArmOffsetY -= 1;
    rightArmOffsetY -= 1;
  }

  if (circularWandCastPose && attackFrame < 0) {
    const castProgress = player.rainCloudCasting
      ? Math.max(
          0,
          Math.min(
            1,
            Number(player.rainCloudCastTime) /
              Math.max(0.05, Number(player.rainCloudCastDuration) || 0.50)
          )
        )
      : (
          (Math.max(0, Number(player.fireballAimTime) || 0) % FIREBALL_AIM_PULSE_DURATION) /
          FIREBALL_AIM_PULSE_DURATION
        );

    // Rain Cloud and Fireball share the same little casting language: keep the
    // wand upright while the hand traces a small pixel-circle. Fireball loops
    // the motion for as long as the expanding aim is held.
    const castCircleAngle =
      -Math.PI / 2 + castProgress * Math.PI * 2;

    weaponArmX += Math.round(Math.cos(castCircleAngle) * 1.5);
    weaponArmY += -2 + Math.round(Math.sin(castCircleAngle) * 1.5);
  }

  if (attackFrame >= 0) {
    if (wandAttackPoseActive) {
      // Keep the permanently front-facing character grounded, but exaggerate
      // the hand travel so the same three 45-degree wand poses read as a real
      // wind-up -> snap -> follow-through. Frame 0 pulls two pixels opposite
      // the target; frame 1 jumps two pixels toward it at impact; frame 2
      // settles halfway back during recovery.
      if (player.attackDirection === "left") {
        if (attackFrame === 0) { weaponArmX =  2; weaponArmY =  0; }
        if (attackFrame === 1) { weaponArmX = -2; weaponArmY = -1; }
        if (attackFrame === 2) { weaponArmX = -1; weaponArmY =  0; }
      }

      if (player.attackDirection === "right") {
        if (attackFrame === 0) { weaponArmX = -2; weaponArmY =  0; }
        if (attackFrame === 1) { weaponArmX =  2; weaponArmY = -1; }
        if (attackFrame === 2) { weaponArmX =  1; weaponArmY =  0; }
      }

      if (player.attackDirection === "up") {
        if (attackFrame === 0) { weaponArmX =  0; weaponArmY =  2; }
        if (attackFrame === 1) { weaponArmX =  0; weaponArmY = -2; }
        if (attackFrame === 2) { weaponArmX =  0; weaponArmY = -1; }
      }

      if (player.attackDirection === "down") {
        if (attackFrame === 0) { weaponArmX =  0; weaponArmY = -2; }
        if (attackFrame === 1) { weaponArmX =  0; weaponArmY =  2; }
        if (attackFrame === 2) { weaponArmX =  0; weaponArmY =  1; }
      }
    } else {
      if (player.attackDirection === "left") {
        if (attackFrame === 0) { weaponArmX = 0;  weaponArmY = -1; }
        if (attackFrame === 1) { weaponArmX = -2; weaponArmY = -1; }
        if (attackFrame === 2) { weaponArmX = -1; weaponArmY =  1; }
      }

      if (player.attackDirection === "right") {
        if (attackFrame === 0) { weaponArmX = 0; weaponArmY = -1; }
        if (attackFrame === 1) { weaponArmX = 2; weaponArmY = -1; }
        if (attackFrame === 2) { weaponArmX = 1; weaponArmY =  1; }
      }

      if (player.attackDirection === "up") {
        if (attackFrame === 0) { weaponArmX = -1; weaponArmY = -1; }
        if (attackFrame === 1) { weaponArmX =  0; weaponArmY = -2; }
        if (attackFrame === 2) { weaponArmX =  1; weaponArmY = -1; }
      }

      if (player.attackDirection === "down") {
        if (attackFrame === 0) { weaponArmX =  1; weaponArmY =  0; }
        if (attackFrame === 1) { weaponArmX =  0; weaponArmY =  1; }
        if (attackFrame === 2) { weaponArmX = -1; weaponArmY =  0; }
      }
    }
  }

  // ---------------------------------------------------------
  // ASSEMBLE CHARACTER
  // ---------------------------------------------------------
  // During an attack, the foot opposite the weapon hand now moves
  // only HALF as far as the torso. This keeps the stance grounded
  // without making the leg look completely pinned in place.
  const halfLungeBaseX =
    plantedBaseX + (baseX - plantedBaseX) * 0.5;

  const halfLungeBaseY =
    plantedBaseY + (baseY - plantedBaseY) * 0.5;

  if (attacking && useRightHand) {
    // Right-hand swing -> left foot follows at half distance.
    drawLeg(appearance.leftLeg, 1, halfLungeBaseX, halfLungeBaseY);
    drawLeg(appearance.rightLeg, rightLegScaleY, baseX, baseY);
  } else if (attacking) {
    // Left-hand swing -> right foot follows at half distance.
    drawLeg(appearance.leftLeg, leftLegScaleY, baseX, baseY);
    drawLeg(appearance.rightLeg, 1, halfLungeBaseX, halfLungeBaseY);
  } else {
    drawLeg(appearance.leftLeg, leftLegScaleY);
    drawLeg(appearance.rightLeg, rightLegScaleY);
  }

  ctx.drawImage(appearance.torso, baseX, baseY);

  if (!carryingEnemy) {
    if (snareSetupActive) {
      const handStep = snareWorkWave >= 0 ? 1 : 0;

      // Pull both hands inward and low, alternating by a pixel so the player
      // looks like they are actually fastening/setting something on the ground.
      ctx.drawImage(
        appearance.leftArm,
        baseX + 1,
        baseY + 2 + handStep
      );

      ctx.drawImage(
        appearance.rightArm,
        baseX - 1,
        baseY + 3 - handStep
      );
    } else if (bowPoseActive) {
      const drawPoseStarted =
        bowDrawAmount > 0.025;

      if (useRightHand) {
        // Left arm is the string/draw arm.
        if (drawPoseStarted) {
          drawLayerAroundPivot(
            appearance.leftArm,
            baseX,
            baseY + leftArmOffsetY,
            4,
            7,
            bowDrawArmAngle
          );
        } else {
          ctx.drawImage(
            appearance.leftArm,
            baseX,
            baseY + leftArmOffsetY
          );
        }

        // Right arm holds the bow. Upward aiming uses a shoulder pivot so the
        // hand can move across the face while remaining attached.
        if (
          bowAimingActive &&
          Math.abs(bowHoldArmAngle) > 0.001
        ) {
          drawLayerAroundPivot(
            appearance.rightArm,
            baseX,
            baseY + rightArmOffsetY,
            11,
            7,
            bowHoldArmAngle
          );
        } else {
          ctx.drawImage(
            appearance.rightArm,
            baseX + weaponArmX,
            baseY + rightArmOffsetY + weaponArmY
          );
        }
      } else {
        // Left arm holds the bow.
        if (
          bowAimingActive &&
          Math.abs(bowHoldArmAngle) > 0.001
        ) {
          drawLayerAroundPivot(
            appearance.leftArm,
            baseX,
            baseY + leftArmOffsetY,
            4,
            7,
            bowHoldArmAngle
          );
        } else {
          ctx.drawImage(
            appearance.leftArm,
            baseX + weaponArmX,
            baseY + leftArmOffsetY + weaponArmY
          );
        }

        // Right arm is the string/draw arm.
        if (drawPoseStarted) {
          drawLayerAroundPivot(
            appearance.rightArm,
            baseX,
            baseY + rightArmOffsetY,
            11,
            7,
            bowDrawArmAngle
          );
        } else {
          ctx.drawImage(
            appearance.rightArm,
            baseX,
            baseY + rightArmOffsetY
          );
        }
      }
    } else if (hurlReachEffort > 0 && attackFrame < 0) {
      // For the no-target Hurl whiff, keep one arm anchored as a support arm
      // and let only one arm do the little reach. This avoids the detached
      // off-body look from moving both arms outward together.
      const whiffUseRightHand =
        Math.abs(hurlReachDirX) > 0.15
          ? hurlReachDirX >= 0
          : true;

      const supportLift = -1;
      const reachX = Math.round(
        hurlReachDirX * 1.5
      );
      const reachY =
        Math.round(
          hurlReachDirY * 1.5
        ) - 2;

      if (whiffUseRightHand) {
        // Left arm stays close to the body.
        ctx.drawImage(
          appearance.leftArm,
          baseX,
          baseY + leftArmOffsetY + supportLift
        );

        // Right arm reaches slightly toward the cursor.
        ctx.drawImage(
          appearance.rightArm,
          baseX + 1 + reachX,
          baseY + rightArmOffsetY + reachY
        );
      } else {
        // Left arm reaches slightly toward the cursor.
        ctx.drawImage(
          appearance.leftArm,
          baseX - 1 + reachX,
          baseY + leftArmOffsetY + reachY
        );

        // Right arm stays close to the body.
        ctx.drawImage(
          appearance.rightArm,
          baseX,
          baseY + rightArmOffsetY + supportLift
        );
      }
    } else if (!currentWeaponForPose && !attacking && !circularWandCastPose) {
      // Truly unarmed: neither arm is reserved as a weapon arm. Both should
      // participate in the normal walk cycle. This also clears the stale pose
      // that could remain after removing the equipped weapon from the hotbar.
      ctx.drawImage(
        appearance.leftArm,
        baseX,
        baseY + leftArmOffsetY
      );

      ctx.drawImage(
        appearance.rightArm,
        baseX,
        baseY + rightArmOffsetY
      );
    } else if (useRightHand) {
      // Left arm stays in its normal walking pose.
      ctx.drawImage(
        appearance.leftArm,
        baseX,
        baseY + leftArmOffsetY
      );

      // Right arm becomes the weapon arm.
      ctx.drawImage(
        appearance.rightArm,
        baseX + weaponArmX,
        baseY + weaponArmY
      );
    } else {
      // Left arm is the weapon arm.
      ctx.drawImage(
        appearance.leftArm,
        baseX + weaponArmX,
        baseY + weaponArmY
      );

      // Right arm stays in its normal walking pose.
      ctx.drawImage(
        appearance.rightArm,
        baseX,
        baseY + rightArmOffsetY
      );
    }
  }

  // ---------------------------------------------------------
  // SWORD
  // ---------------------------------------------------------
  // Approximate hand points from your separated 16x16 arm layers.
  const leftHandX = baseX + 2;
  const leftHandY = baseY + 11;

  const rightHandX = baseX + 13;
  const rightHandY = baseY + 11;

  const bowHoldHandPoint =
    bowPoseActive &&
    bowAimingActive &&
    Math.abs(bowHoldArmAngle) > 0.001
      ? (
          useRightHand
            ? rotatedLayerPoint(
                baseX,
                baseY + rightArmOffsetY,
                11,
                7,
                13,
                11,
                bowHoldArmAngle
              )
            : rotatedLayerPoint(
                baseX,
                baseY + leftArmOffsetY,
                4,
                7,
                2,
                11,
                bowHoldArmAngle
              )
        )
      : {
          x:
            (
              useRightHand
                ? rightHandX
                : leftHandX
            ) +
            weaponArmX,

          y:
            (
              useRightHand
                ? rightHandY +
                  rightArmOffsetY
                : leftHandY +
                  leftArmOffsetY
            ) +
            weaponArmY
        };

  const handX =
    bowPoseActive
      ? bowHoldHandPoint.x
      : (
          (
            useRightHand
              ? rightHandX
              : leftHandX
          ) +
          weaponArmX
        );

  const handY =
    bowPoseActive
      ? bowHoldHandPoint.y
      : (
          (
            useRightHand
              ? rightHandY
              : leftHandY
          ) +
          weaponArmY
        );

  const bowDrawHandPoint =
    useRightHand
      ? rotatedLayerPoint(
          baseX,
          baseY + leftArmOffsetY,
          4,
          7,
          2,
          11,
          bowDrawArmAngle
        )
      : rotatedLayerPoint(
          baseX,
          baseY + rightArmOffsetY,
          11,
          7,
          13,
          11,
          bowDrawArmAngle
        );

  const bowDrawHandX =
    bowDrawHandPoint.x;

  const bowDrawHandY =
    bowDrawHandPoint.y;

  // Idle = straight up in the left hand. Swords/axes retain the existing
  // 90-degree steps; wand attacks use only crisp 45-degree changes around the
  // aimed cardinal direction so the tiny single-frame sprite stays readable.
  let swordAngle = -Math.PI / 2;

  if (circularWandCastPose) {
    swordAngle = -Math.PI / 2;
  } else if (attackFrame >= 0) {
    const UP = -Math.PI / 2;
    const RIGHT = 0;
    const DOWN = Math.PI / 2;
    const LEFT = Math.PI;

    if (wandAttackPoseActive) {
      const DIAG_UP_RIGHT = -Math.PI / 4;
      const DIAG_DOWN_RIGHT = Math.PI / 4;
      const DIAG_DOWN_LEFT = Math.PI * 3 / 4;
      const DIAG_UP_LEFT = -Math.PI * 3 / 4;

      const wandSequences = {
        left:  [DIAG_UP_LEFT, LEFT, DIAG_DOWN_LEFT],
        right: [DIAG_UP_RIGHT, RIGHT, DIAG_DOWN_RIGHT],
        up:    [DIAG_UP_LEFT, UP, DIAG_UP_RIGHT],
        down:  [DIAG_DOWN_RIGHT, DOWN, DIAG_DOWN_LEFT]
      };

      swordAngle =
        wandSequences[player.attackDirection][attackFrame];
    } else {
      const sequences = {
        left:  [UP, LEFT, DOWN],
        right: [UP, RIGHT, DOWN],
        up:    [LEFT, UP, RIGHT],
        down:  [RIGHT, DOWN, LEFT]
      };

      swordAngle =
        sequences[player.attackDirection][attackFrame];
    }
  }

  // Face + hat bob together.
  // Draw these BEFORE the sword so the weapon always appears in front
  // instead of disappearing behind the player's head.
  ctx.drawImage(
    sprite.face,
    baseX,
    baseY + headOffsetY
  );

  ctx.drawImage(
    appearance.hat,
    baseX,
    baseY + headOffsetY
  );

  if (carryingEnemy) {
    // During the pickup wind-up, start the arms slightly lower and extend them
    // a touch toward the slime. Then settle into the overhead carry pose.
    const carryReachBlend =
      1 - carryPickupProgressRaw;

    const carryArmLiftY =
      Math.round(
        baseY +
        1 +
        carryReachBlend * 4
      );

    const carryArmShiftX =
      Math.round(
        carryPickupDirX *
        carryReachBlend *
        2
      );

    const carryArmShiftY =
      Math.round(
        carryPickupDirY *
        carryReachBlend *
        2
      );

    drawCarryArmFlipped(
      appearance.leftArm,
      baseX + 1 + carryArmShiftX,
      carryArmLiftY + carryArmShiftY
    );

    drawCarryArmFlipped(
      appearance.rightArm,
      baseX - 1 + carryArmShiftX,
      carryArmLiftY + carryArmShiftY
    );
  }

  if (!reflectionMode && playerIsWet()) {
    drawWetStatus(screenX, screenY);
  }

  if (!reflectionMode && player.burnTime > 0) {
    drawPixelFlame(screenX - 3, screenY - 8, worldTime + 0.8, 0.95);
    drawPixelFlame(screenX + 3, screenY - 4, worldTime + 2.4, 0.90);

    if (player.burnTime < player.burnDuration * 0.75) {
      drawPixelFlame(screenX, screenY - 12, worldTime + 4.1, 0.85);
    }
  }

  // Draw the equipped tool last so it stays visually in front.
  const currentWeapon = equippedWeapon();

  if (
    currentWeapon === "bow" &&
    !carryingEnemy &&
    !snareSetupActive
  ) {
    const aim =
      Number(player.attackAimAngle) || 0;

    // The supplied sprite is a horizontal arch whose local -Y side is the
    // front of the bow. Rotate that local forward direction toward the cursor.
    // Quantizing to 45-degree steps avoids the awkward intermediate partial
    // angle and keeps the bow on the cleaner diagonal/cardinal poses.
    const rotationStep =
      Math.PI / 4;

    const bowRotation =
      bowMeleeActive
        ? swordAngle
        : bowAimingActive
          ? (
              Math.round(
                (
                  aim +
                  Math.PI / 2
                ) /
                rotationStep
              ) *
              rotationStep
            )
          : Math.PI / 2;

    const cosR =
      Math.cos(bowRotation);

    const sinR =
      Math.sin(bowRotation);

    const bowRestOffsetX =
      (bowAimingActive || bowMeleeActive)
        ? 0
        : 2;

    const bowRestOffsetY =
      (bowAimingActive || bowMeleeActive)
        ? 0
        : -1;

    function bowLocalPoint(
      localX,
      localY
    ) {
      return {
        x:
          handX +
          bowRestOffsetX +
          localX * cosR -
          localY * sinR,

        y:
          handY +
          bowRestOffsetY +
          localX * sinR +
          localY * cosR
      };
    }

    // Approximate endpoints of the user's 16x16 arch relative to pivot 8,6.
    const tipA =
      bowLocalPoint(-7, 4);

    const tipB =
      bowLocalPoint(7, 4);

    const relaxedNock =
      bowLocalPoint(0, 4);

    // At rest the off hand hangs naturally and does not pretend to be touching
    // the string. Once drawing begins, the nock catches up to the actual
    // shoulder-pivoted hand very quickly; after that it stays attached to the
    // hand rather than interpolating toward a fictional translated position.
    const stringGrab =
      Math.max(
        0,
        Math.min(
          1,
          bowDrawAmount / 0.16
        )
      );

    const grabEase =
      stringGrab *
      stringGrab *
      (
        3 -
        2 * stringGrab
      );

    const nock = {
      x:
        relaxedNock.x +
        (
          bowDrawHandX -
          relaxedNock.x
        ) *
        grabEase,

      y:
        relaxedNock.y +
        (
          bowDrawHandY -
          relaxedNock.y
        ) *
        grabEase
    };

    drawPixelLine(
      tipA.x,
      tipA.y,
      nock.x,
      nock.y,
      "#d8d0ae"
    );

    drawPixelLine(
      nock.x,
      nock.y,
      tipB.x,
      tipB.y,
      "#d8d0ae"
    );

    // Tiny nock pixel makes the pull point easier to read at 320x180.
    if (stringGrab > 0.45) {
      ctx.fillStyle = "#eee5c5";
      ctx.fillRect(
        Math.round(nock.x),
        Math.round(nock.y),
        1,
        1
      );
    }

    ctx.save();

    ctx.translate(
      Math.round(
        handX +
        bowRestOffsetX
      ),
      Math.round(
        handY +
        bowRestOffsetY
      )
    );

    ctx.rotate(
      bowRotation
    );

    ctx.drawImage(
      weaponImageForIndex(player.weaponIndex) || bowImage,
      -BOW_PIVOT_X,
      -BOW_PIVOT_Y
    );

    ctx.restore();

    // Idle bow only: redraw the holding arm on top so the player's hand reads
    // as gripping the handle instead of the bow sitting entirely over the hand.
    if (!bowAimingActive) {
      if (useRightHand) {
        ctx.drawImage(
          appearance.rightArm,
          baseX + weaponArmX,
          baseY + rightArmOffsetY + weaponArmY
        );
      } else {
        ctx.drawImage(
          appearance.leftArm,
          baseX + weaponArmX,
          baseY + leftArmOffsetY + weaponArmY
        );
      }
    }

    const shouldDrawBowAimGuide =
      !reflectionMode &&
      remotePlayerDrawDepth === 0 &&
      player.bowDrawing &&
      !player.focusFireCharging &&
      bowDrawAmount > 0.025;

    if (shouldDrawBowAimGuide) {
      const guideAngle = Number(player.attackAimAngle) || 0;
      const guideDirX = Math.cos(guideAngle);
      const guideDirY = Math.sin(guideAngle);
      const guideStartX = handX + guideDirX * 9;
      const guideStartY = handY + guideDirY * 9;
      const chargeStage = bowChargeStage(bowDrawAmount);
      const guideDotCount = 5;
      const guideSpacing = 5;
      const firstDotDistance = 7;

      const guideAlpha = chargeStage === 0 ? 0.48 : 0.92;
      const guideColor = chargeStage === 0 ? "#b8b29b" : "#eadf9d";
      const endpointColor = chargeStage === 0 ? "#c8c1a6" : "#fff4bf";

      ctx.save();
      ctx.globalAlpha *= guideAlpha;

      for (let i = 0; i < guideDotCount; i++) {
        const distance = firstDotDistance + i * guideSpacing;
        const dotX = Math.round(
          guideStartX + guideDirX * distance
        );
        const dotY = Math.round(
          guideStartY + guideDirY * distance
        );

        ctx.fillStyle =
          i === guideDotCount - 1
            ? endpointColor
            : guideColor;

        ctx.fillRect(dotX, dotY, 1, 1);
      }

      ctx.restore();
    }
  } else if (
    currentWeapon &&
    !carryingEnemy &&
    !snareSetupActive
  ) {
    const weaponImage =
      currentWeapon === "axe"
        ? axeImage
        : currentWeapon === "pickaxe"
          ? pickaxeImage
        : currentWeapon === "wand"
          ? wandImage
          : currentWeapon === "rainWand"
            ? rainWandImage
            : currentWeapon === "shepherdStaff"
              ? shepherdStaffImage
              : currentWeapon === "lostKeyWand"
                ? lostKeyWandImage
                : currentWeapon === "sunflowerWand"
                  ? hugeSunflowerWandImage
                  : currentWeapon === "sapgemWand"
                    ? sapgemWandImage
                  : currentWeapon === "katana"
                    ? katanaImage
                    : currentWeapon === "oldSword"
                      ? oldSwordImage
                      : swordImage;

    const weaponPivotX =
      currentWeapon === "axe"
        ? AXE_PIVOT_X
        : currentWeapon === "pickaxe"
          ? PICKAXE_PIVOT_X
        : isWandTypeWeapon(currentWeapon)
          ? WAND_PIVOT_X
          : SWORD_PIVOT_X;

    const weaponPivotY =
      currentWeapon === "axe"
        ? AXE_PIVOT_Y
        : currentWeapon === "pickaxe"
          ? PICKAXE_PIVOT_Y
        : isWandTypeWeapon(currentWeapon)
          ? WAND_PIVOT_Y
          : SWORD_PIVOT_Y;

    const weaponHoldOffsetY =
      isWandTypeWeapon(currentWeapon)
        ? WAND_HOLD_OFFSET_Y
        : currentWeapon === "pickaxe"
          ? PICKAXE_HOLD_OFFSET_Y
          : 0;

    ctx.save();
    ctx.translate(
      Math.round(handX),
      Math.round(handY + weaponHoldOffsetY)
    );
    ctx.rotate(swordAngle);

    ctx.drawImage(
      weaponImage,
      -weaponPivotX,
      -weaponPivotY
    );

    ctx.restore();
  }

  // Close the outer save used for blink/reappear transparency.
  // This is especially important when drawPlayer() is reused inside the
  // water-reflection transform.
  ctx.restore();
  if (pinLocalPlayerToCamera) ctx.restore();
}





function drawHouseGround(house, camX, camY) {
  const screenX = Math.round(house.x - camX);
  const screenY = Math.round(house.y - camY);

  // Short, worn path: broad at the doorstep, then gently narrows and wanders
  // without tapering into an arrow point.
  const pathY = Math.round(screenY - 1);
  const pathRows = [
    { offsetX: -8, width: 16 },
    { offsetX: -8, width: 16 },
    { offsetX: -9, width: 17 },
    { offsetX: -9, width: 17 },
    { offsetX: -8, width: 16 },
    { offsetX: -8, width: 16 },
    { offsetX: -7, width: 15 },
    { offsetX: -7, width: 15 },
    { offsetX: -7, width: 14 },
    { offsetX: -6, width: 14 },
    { offsetX: -6, width: 13 },
    { offsetX: -7, width: 13 },
    { offsetX: -7, width: 12 },
    { offsetX: -6, width: 12 },
    { offsetX: -6, width: 12 },
    { offsetX: -5, width: 11 },
    { offsetX: -5, width: 11 },
    { offsetX: -5, width: 10 }
  ];

  for (let i = 0; i < pathRows.length; i++) {
    const row = pathRows[i];

    ctx.fillStyle = "#8b7949";
    ctx.fillRect(
      screenX + row.offsetX,
      pathY + i,
      row.width,
      1
    );

    if (row.width >= 8) {
      ctx.fillStyle = i < 6 ? "#ab9661" : "#a28d58";
      ctx.fillRect(
        screenX + row.offsetX + 2,
        pathY + i,
        Math.max(3, row.width - 4),
        1
      );
    }
  }

  // A few irregular worn/paver pixels keep the path from reading as one block.
  ctx.fillStyle = "#c1ae72";
  ctx.fillRect(screenX - 3, pathY + 4, 5, 2);
  ctx.fillRect(screenX + 1, pathY + 10, 3, 2);
  ctx.fillRect(screenX - 4, pathY + 15, 4, 2);

  // Grass encroaches unevenly around the sides and at the blunt end.
  ctx.fillStyle = "#5b8a45";
  ctx.fillRect(screenX - 9, pathY + 7, 2, 2);
  ctx.fillRect(screenX + 6, pathY + 9, 2, 2);
  ctx.fillRect(screenX - 7, pathY + 13, 1, 2);
  ctx.fillRect(screenX + 5, pathY + 14, 1, 2);
  ctx.fillRect(screenX - 4, pathY + 17, 2, 1);
  ctx.fillRect(screenX + 3, pathY + 17, 2, 1);
}

function drawHouse(house, camX, camY) {
  const screenX = Math.round(house.x - camX);
  const screenY = Math.round(house.y - camY);

  // Layered contact shadow so the house feels planted instead of sticker-like.
  ctx.fillStyle = "rgba(34, 46, 28, .11)";
  ctx.fillRect(screenX - 25, screenY - 2, 50, 1);
  ctx.fillRect(screenX - 23, screenY - 1, 46, 2);

  ctx.fillStyle = "rgba(34, 46, 28, .18)";
  ctx.fillRect(screenX - 20, screenY, 40, 2);

  ctx.fillStyle = "rgba(34, 46, 28, .26)";
  ctx.fillRect(screenX - 16, screenY + 1, 32, 1);

  const sprite = house.image || houseImage;

  ctx.drawImage(
    sprite,
    screenX - Math.floor(house.width / 2),
    screenY - (house.height - 1)
  );

  // A few tiny foreground tufts help the foundation blend into the grass.
  ctx.fillStyle = "#406b38";
  ctx.fillRect(screenX - 26, screenY - 5, 1, 3);
  ctx.fillRect(screenX - 24, screenY - 7, 1, 5);
  ctx.fillRect(screenX - 22, screenY - 5, 1, 3);
  ctx.fillRect(screenX + 21, screenY - 5, 1, 3);
  ctx.fillRect(screenX + 23, screenY - 7, 1, 5);
  ctx.fillRect(screenX + 25, screenY - 5, 1, 3);

  ctx.fillStyle = "#6ea05a";
  ctx.fillRect(screenX - 24, screenY - 6, 1, 3);
  ctx.fillRect(screenX - 22, screenY - 4, 1, 2);
  ctx.fillRect(screenX + 23, screenY - 6, 1, 3);
  ctx.fillRect(screenX + 25, screenY - 4, 1, 2);
}


function drawBubbleMarker(screenX, anchorY, drawIcon) {
  // Compact 18x18 bubble: a one-pixel frame around the native 16x16 icon.
  const bubbleWidth = 18;
  const bubbleHeight = 18;
  const tailY = anchorY + bubbleHeight;
  const left = screenX - Math.floor(bubbleWidth / 2);

  ctx.fillStyle = "#233323";
  ctx.fillRect(left + 1, anchorY, bubbleWidth - 2, bubbleHeight);
  ctx.fillRect(left, anchorY + 1, bubbleWidth, bubbleHeight - 2);
  ctx.fillRect(screenX - 1, tailY, 2, 2);
  ctx.fillRect(screenX, tailY + 2, 1, 1);

  // Let some of the world show through the speech bubble without dimming the icon.
  ctx.fillStyle = "rgba(248, 244, 221, 0.78)";
  ctx.fillRect(left + 1, anchorY + 1, 16, 16);
  ctx.fillRect(screenX - 1, tailY + 1, 2, 1);
  ctx.fillRect(screenX, tailY + 2, 1, 1);

  if (typeof drawIcon === "function") {
    // Native 16x16 art: no scaling and no icon shadow pass.
    drawIcon(left + 1, anchorY + 1);
  }
}

function drawNpcRoleMarker(screenX, screenY) {
  // Raised enough that the bubble tail clears the NPC sprite instead of hugging it.
  const bubbleY = screenY - 42;

  if (!player.story.axeReceived) {
    drawBubbleMarker(screenX, bubbleY, (left, top) => {
      const midX = left + 8;
      ctx.fillStyle = "#ffe06a";
      ctx.fillRect(midX - 1, top + 2, 3, 8);
      ctx.fillRect(midX - 1, top + 12, 3, 3);
    });
    return;
  }

  drawBubbleMarker(screenX, bubbleY, (left, top) => {
    ctx.drawImage(coinImage, left, top);
  });
}

function drawCraftRoleMarker(screenX, screenY) {
  // Same height and native-scale presentation as the shop bubble.
  const bubbleY = screenY - 42;
  drawBubbleMarker(screenX, bubbleY, (left, top) => {
    ctx.drawImage(craftRoleAxeImage, left, top);
  });
}

function drawTutorialNpc(camX, camY) {
  const screenX =
    Math.round(tutorialNpc.x - camX);

  const screenY =
    Math.round(tutorialNpc.y - camY);

  // A tiny grounded sway reads better than a vertical bob for this sprite.
  const swayOffset =
    Math.round(Math.sin(worldTime * 1.0 + 0.35) * 1);

  ctx.fillStyle =
    "rgba(34, 46, 28, .32)";

  ctx.fillRect(
    screenX - 5,
    screenY,
    10,
    2
  );

  ctx.drawImage(
    tutorialNpcImage,
    screenX - 8 + swayOffset,
    screenY - 15
  );

  drawNpcRoleMarker(screenX, screenY);
  drawNpcNameTag(npcDisplayName("shopkeeper", tutorialNpc), screenX, screenY, "tutorialNpc");
}

function drawHunterNpc(camX, camY) {
  const screenX =
    Math.round(hunterNpc.x - camX);

  const screenY =
    Math.round(hunterNpc.y - camY);

  const swayOffset =
    Math.round(Math.sin(worldTime * 0.95 + 1.15) * 1);

  ctx.fillStyle =
    "rgba(34, 46, 28, .28)";

  ctx.fillRect(
    screenX - 5,
    screenY + 1,
    10,
    2
  );

  ctx.drawImage(
    hunterNpcImage,
    screenX - 8 + swayOffset,
    screenY - 19
  );

  drawNpcNameTag(npcDisplayName("hunter", hunterNpc), screenX, screenY, "hunterNpc");
}

function drawJesterNpc(camX, camY) {
  const screenX =
    Math.round(jesterNpc.x - camX);

  const screenY =
    Math.round(jesterNpc.y - camY);

  const swayOffset =
    Math.round(Math.sin(worldTime * 1.08 + 2.35) * 1);

  ctx.fillStyle =
    "rgba(34, 46, 28, .24)";

  ctx.fillRect(
    screenX - 5,
    screenY + 1,
    10,
    2
  );

  ctx.drawImage(
    jesterNpcImage,
    screenX - 8 + swayOffset,
    screenY - 19
  );

  drawNpcNameTag(npcDisplayName("jester", jesterNpc), screenX, screenY, "jesterNpc");
}

function drawPlacedNpc(npc, camX, camY) {
  if (!npc) return;
  const allowed = ["shopkeeper", "hunter", "jester", "beachGirl", "greenWitch", "camoGuy", "craftingTable", "classResetCrystal"];
  const type = allowed.includes(npc.type) ? npc.type : "shopkeeper";
  const screenX = Math.round((Number(npc.x) || 0) - camX);
  const screenY = Math.round((Number(npc.y) || 0) - camY);
  const phase = Array.from(String(npc.id || type)).reduce((sum, char) => sum + char.charCodeAt(0), 0) * 0.07;

  if (type === "craftingTable") {
    ctx.fillStyle = "rgba(34, 46, 28, .26)";
    ctx.fillRect(screenX - 7, screenY, 14, 2);
    const benchWidth = woodBenchImage.width || 18;
    const benchHeight = woodBenchImage.height || 18;
    ctx.drawImage(woodBenchImage, screenX - Math.round(benchWidth / 2), screenY - (benchHeight - 1));
    drawCraftRoleMarker(screenX, screenY);
    return;
  }

  if (type === "classResetCrystal") {
    const bob = Math.round(Math.sin(worldTime * 1.65 + phase) * 1);
    ctx.fillStyle = "rgba(20, 45, 38, .30)";
    ctx.fillRect(screenX - 7, screenY + 1, 14, 3);
    ctx.drawImage(classResetCrystalImage, screenX - 16, screenY - 31 + bob, 32, 32);
    return;
  }

  const swaySpeed = type === "shopkeeper" ? 1.0 : type === "hunter" ? 0.95 : 1.08;
  const swayOffset = Math.round(Math.sin(worldTime * swaySpeed + phase) * 1);
  const image = type === "hunter"
    ? hunterNpcImage
    : type === "jester"
      ? jesterNpcImage
      : type === "beachGirl"
        ? beachGirlNpcImage
        : type === "greenWitch"
          ? greenWitchNpcImage
          : type === "camoGuy"
            ? camoNpcImage
        : tutorialNpcImage;
  const height = type === "shopkeeper" ? 16 : type === "beachGirl" ? 17 : 20;
  const width = type === "hunter" ? 17 : type === "beachGirl" ? 13 : ["greenWitch", "camoGuy"].includes(type) ? 20 : 16;

  ctx.fillStyle = type === "shopkeeper"
    ? "rgba(34, 46, 28, .32)"
    : type === "hunter"
      ? "rgba(34, 46, 28, .28)"
      : "rgba(34, 46, 28, .24)";
  const shadowY = ["beachGirl", "greenWitch", "camoGuy"].includes(type)
    ? screenY - 1
    : screenY + (type === "shopkeeper" ? 0 : 1);
  const shadowWidth = type === "greenWitch"
    ? 14
    : type === "camoGuy"
      ? 8
      : 10;
  ctx.fillRect(screenX - Math.floor(shadowWidth / 2), shadowY, shadowWidth, 2);
  ctx.drawImage(image, screenX - Math.floor(width / 2) + swayOffset, screenY - height);

  if (type === "shopkeeper") drawNpcRoleMarker(screenX, screenY);
  drawNpcNameTag(npcDisplayName(type, npc), screenX, screenY, npc.id || type);
  if (type === "beachGirl") {
    const quest = player.beachQuest || {};
    const firstReady = quest.stage === "firstActive" && quest.firstCrabKills >= 10 && quest.icedCoffee >= 1;
    const secondReady = quest.stage === "secondActive" && quest.secondCrabKills >= 25;
    const marker = firstReady || secondReady
      ? "?"
      : (quest.stage === "none" && player.level >= 5) || (quest.stage === "firstComplete" && player.level >= 7)
        ? "!"
        : "";
    if (marker) drawStaticPixelText(marker, screenX, screenY - height - 8, "#ffe36e", 1);
  } else if (type === "greenWitch") {
    const stage = player.myrtleQuest?.stage || "none";
    const ready = stage === "active" && player.whiteFlowers >= 10 && player.blueFlowers >= 10;
    const marker = ready
      ? "?"
      : stage === "none" && player.level >= 3
        ? "!"
        : "";
    if (marker) drawStaticPixelText(marker, screenX, screenY - height - 8, "#d9b9ff", 1);
  }
}

const npcNameLayer = document.getElementById("npcNameLayer");
const npcNameLabelNodes = new Map();
const activeNpcNameLabelKeys = new Set();

function beginNpcNameTagFrame() {
  activeNpcNameLabelKeys.clear();
}

function drawNpcNameTag(name, screenX, screenY, key = name) {
  if (!name || !npcNameLayer) return;
  const label = String(name).slice(0, 20);
  const labelKey = String(key || label);
  let node = npcNameLabelNodes.get(labelKey);

  if (!node) {
    node = document.createElement("span");
    node.className = "npc-name-label";
    npcNameLayer.appendChild(node);
    npcNameLabelNodes.set(labelKey, node);
  }

  if (node.textContent !== label) node.textContent = label;

  const presentationX = screenX + mobileCameraPresentationOffsetX;
  const presentationY = screenY + mobileCameraPresentationOffsetY + 3;
  const onScreen =
    presentationX >= -24 &&
    presentationX <= VIEW_W + 24 &&
    presentationY >= 0 &&
    presentationY <= VIEW_H;

  node.hidden = !onScreen;
  if (onScreen) {
    node.style.left = `${presentationX / VIEW_W * 100}%`;
    node.style.top = `${presentationY / VIEW_H * 100}%`;
  }
  activeNpcNameLabelKeys.add(labelKey);
}

function endNpcNameTagFrame() {
  for (const [key, node] of npcNameLabelNodes) {
    if (!activeNpcNameLabelKeys.has(key)) node.hidden = true;
  }
}

function drawWoodCraftBench(camX, camY) {
  const screenX =
    Math.round(
      woodCraftBench.x - camX
    );

  const screenY =
    Math.round(
      woodCraftBench.y - camY
    );

  ctx.fillStyle =
    "rgba(34, 46, 28, .26)";

  ctx.fillRect(
    screenX - 7,
    screenY,
    14,
    2
  );

  const benchWidth = woodBenchImage.width || 18;
  const benchHeight = woodBenchImage.height || 18;

  ctx.drawImage(
    woodBenchImage,
    screenX - Math.round(benchWidth / 2),
    screenY - (benchHeight - 1)
  );

  drawCraftRoleMarker(screenX, screenY);
}

function drawClassResetCrystal(camX, camY) {
  const screenX = Math.round(classResetCrystal.x - camX);
  const screenY = Math.round(classResetCrystal.y - camY);
  const bob = Math.round(Math.sin(worldTime * 1.65 + 0.7) * 1);

  ctx.fillStyle = "rgba(20, 45, 38, .30)";
  ctx.fillRect(screenX - 7, screenY + 1, 14, 3);

  ctx.drawImage(
    classResetCrystalImage,
    screenX - 16,
    screenY - 31 + bob,
    32,
    32
  );
}

function drawStaticPixelText(
  text,
  centerX,
  y,
  color = "#fff3b0",
  scale = 1
) {
  const value =
    String(text).toUpperCase();

  const charW = 3 * scale;
  const gap = scale;
  const spaceW = 2 * scale;

  let totalWidth = 0;

  for (const ch of value) {
    totalWidth +=
      ch === " "
        ? spaceW
        : charW;

    totalWidth += gap;
  }

  totalWidth =
    Math.max(0, totalWidth - gap);

  let cursorX =
    Math.round(
      centerX - totalWidth / 2
    );

  const startY =
    Math.round(y);

  for (const ch of value) {
    if (ch === " ") {
      cursorX +=
        spaceW + gap;
      continue;
    }

    const glyph =
      FLOAT_GLYPHS[ch];

    if (!glyph) {
      cursorX +=
        charW + gap;
      continue;
    }

    ctx.fillStyle = "#30251e";

    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 3; col++) {
        if (
          glyph[row][col] !== "1"
        ) {
          continue;
        }

        const px =
          cursorX + col * scale;

        const py =
          startY + row * scale;

        ctx.fillRect(
          px - 1,
          py - 1,
          scale + 2,
          scale + 2
        );
      }
    }

    ctx.fillStyle = color;

    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 3; col++) {
        if (
          glyph[row][col] !== "1"
        ) {
          continue;
        }

        ctx.fillRect(
          cursorX + col * scale,
          startY + row * scale,
          scale,
          scale
        );
      }
    }

    cursorX +=
      charW + gap;
  }
}

function drawInteractionPrompt(
  camX,
  camY
) {
  if (inventoryOpen || shopOpen || craftingOpen || classResetConfirmOpen || beachQuestOpen) return;

  const interaction =
    nearbySpawnInteraction();

  if (!interaction) return;

  const screenX =
    Math.round(
      interaction.x - camX
    );

  const screenY =
    Math.round(
      interaction.y - camY
    );

  const placedKind = interaction.kind === "placedNpc" ? interaction.npcType : null;
  const promptText =
    interaction.kind === "bench" || placedKind === "craftingTable"
      ? "F CRAFT"
      : interaction.kind === "classResetCrystal" || placedKind === "classResetCrystal"
        ? "F RESET"
        : "F TALK";

  drawStaticPixelText(
    promptText,
    screenX,
    screenY - ((interaction.kind === "classResetCrystal" || placedKind === "classResetCrystal") ? 40 : 24),
    "#fff3b0",
    1
  );
}


const REMOTE_PLAYER_DRAW_FIELDS = [
  "x",
  "y",
  "hatIndex",
  "shirtIndex",
  "pantsIndex",
  "weaponIndex",
  "walkTime",
  "wasMoving",
  "firstRaisedLeg",
  "attackTime",
  "attackDuration",
  "attackDirection",
  "attackHand",
  "attackAimAngle",
  "bowDrawing",
  "bowDrawAmount",
  "bowDrawDuration",
  "bowReleaseTime",
  "bowReleaseDuration",
  "focusFireCharging",
  "focusFireOpening",
  "focusFireActive",
  "fireballAiming",
  "fireballAimTime",
  "rainCloudCasting",
  "rainCloudCastTime",
  "rainCloudCastDuration",
  "camouflaged",
  "hunterSnareSetting",
  "hunterSnareSetTime",
  "hunterSnareSetDuration",
  "jesterBlinkFadeTime",
  "jesterBlinkFadeDuration",
  "shadowHidden",
  "shadowHideRevealTime",
  "shadowHideRevealDuration",
  "wetTime",
  "wetDuration",
  "burnTime",
  "burnDuration",
  "hurlReachTime",
  "hurlReachDuration",
  "hurlReachDirX",
  "hurlReachDirY",
  "isDead"
];

function drawPvpMarker(
  entity,
  camX,
  camY
) {
  if (!entity?.pvpEnabled) return;

  const screenX = Math.round(entity.x - camX);
  const screenY = Math.round(entity.y - camY - 29);

  drawStaticPixelText(
    "PVP",
    screenX,
    screenY,
    "#ff7968",
    1
  );

  if (
    Number.isFinite(entity.hp) &&
    Number.isFinite(entity.maxHp) &&
    entity.maxHp > 0
  ) {
    const width = 18;
    const fill = Math.max(
      0,
      Math.min(
        width,
        Math.round(width * entity.hp / entity.maxHp)
      )
    );

    ctx.fillStyle = "rgba(20, 18, 15, .82)";
    ctx.fillRect(screenX - 9, screenY + 7, width, 3);
    ctx.fillStyle = "#cf5b4d";
    ctx.fillRect(screenX - 9, screenY + 7, fill, 2);
  }
}

function drawRemotePlayer(
  remote,
  camX,
  camY,
  reflectionMode = false
) {
  // In mutual PvP, Camouflage is true concealment: the opponent sprite,
  // equipment, reflection, HP bar and PvP marker are not drawn at all.
  // Position replication still exists so unguided attacks can physically hit
  // the hidden Ranger if the attacker correctly guesses where they are.
  const hiddenFromLocalPvpOpponent = Boolean(
    remote?.camouflaged &&
    player.pvpEnabled &&
    remote.pvpEnabled
  );

  if (!reflectionMode) {
    // The sparse leaf burst is the intended PvP tell. It must be emitted even
    // while the actual remote player draw is suppressed.
    emitRemoteCamouflageParticles(remote);
  }

  if (hiddenFromLocalPvpOpponent) {
    return;
  }

  const backup = {};

  for (const key of REMOTE_PLAYER_DRAW_FIELDS) {
    backup[key] = player[key];
  }

  player.x = remote.x;
  player.y = remote.y;
  player.isDead = Boolean(remote.isDead || Number(remote.hp) <= 0);

  player.hatIndex = Number.isFinite(remote.hatIndex)
    ? remote.hatIndex
    : 0;

  player.shirtIndex = Number.isFinite(remote.shirtIndex)
    ? remote.shirtIndex
    : 0;

  player.pantsIndex = Number.isFinite(remote.pantsIndex)
    ? remote.pantsIndex
    : 0;

  player.weaponIndex = Number.isFinite(remote.weaponIndex)
    ? remote.weaponIndex
    : -1;

  player.walkTime = Number(remote.walkTime) || 0;
  player.wasMoving = false;
  player.firstRaisedLeg =
    remote.firstRaisedLeg === "right" ? "right" : "left";

  player.attackTime = Number(remote.attackTime) || 0;
  player.attackDuration = Number(remote.attackDuration) || 0.30;
  player.attackDirection =
    ["left", "right", "up", "down"].includes(remote.attackDirection)
      ? remote.attackDirection
      : "left";
  player.attackHand =
    remote.attackHand === "right" ? "right" : "left";
  player.attackAimAngle = Number(remote.attackAimAngle) || 0;

  player.bowDrawing =
    Boolean(remote.bowDrawing);

  player.bowDrawAmount =
    Math.max(
      0,
      Math.min(
        1,
        Number(remote.bowDrawAmount) || 0
      )
    );

  player.bowDrawDuration = Math.max(0.05, Number(remote.bowDrawDuration) || 1.0);
  player.bowReleaseTime =
    Math.max(
      0,
      Number(remote.bowReleaseTime) || 0
    );
  player.bowReleaseDuration = Math.max(0.03, Number(remote.bowReleaseDuration) || 0.12);

  player.focusFireCharging = Boolean(remote.focusFireCasting);
  player.focusFireOpening = false;
  player.focusFireActive = false;
  player.fireballAiming = Boolean(remote.fireballAiming);
  player.fireballAimTime = Math.max(0, Number(remote.fireballAimTime) || 0);
  player.rainCloudCasting = Boolean(remote.rainCloudCasting);
  player.rainCloudCastTime = Math.max(0, Number(remote.rainCloudCastTime) || 0);
  player.rainCloudCastDuration = Math.max(0.05, Number(remote.rainCloudCastDuration) || 0.50);
  player.camouflaged = Boolean(remote.camouflaged);

  player.hunterSnareSetting = Boolean(remote.hunterSnareSetting);
  player.hunterSnareSetTime = Math.max(
    0,
    Number(remote.hunterSnareSetTime) || 0
  );
  player.hunterSnareSetDuration = Math.max(
    0.1,
    Number(remote.hunterSnareSetDuration) || 1.25
  );

  player.jesterBlinkFadeTime = 0;
  player.jesterBlinkFadeDuration = 0.18;

  player.shadowHidden = Boolean(remote.shadowHidden);
  player.shadowHideRevealTime =
    Number(remote.shadowHideRevealTime) || 0;
  player.shadowHideRevealDuration = 0.16;

  player.wetTime = Number(remote.wetTime) || 0;
  player.wetDuration = GAME_CONFIG.player.wetDuration;

  player.burnTime = Number(remote.burnTime) || 0;
  player.burnDuration = 6.0;

  player.hurlReachTime = Number(remote.hurlReachTime) || 0;
  player.hurlReachDuration =
    Math.max(0.01, Number(remote.hurlReachDuration) || 0.18);
  player.hurlReachDirX = Number(remote.hurlReachDirX) || 0;
  player.hurlReachDirY = Number(remote.hurlReachDirY) || 0;

  remotePlayerDrawDepth += 1;

  try {
    drawPlayer(
      camX,
      camY,
      reflectionMode,
      getCarriedHurlObjectForPlayerId(
        remote.id
      )
    );
  } finally {
    remotePlayerDrawDepth =
      Math.max(
        0,
        remotePlayerDrawDepth - 1
      );

    for (const key of REMOTE_PLAYER_DRAW_FIELDS) {
      player[key] = backup[key];
    }
  }

  if (!reflectionMode) {
    drawPvpMarker(remote, camX, camY);
  }
}


function drawRemotePlayerReflection(
  remote,
  camX,
  camY
) {
  if (
    remote.shadowHidden &&
    (Number(remote.shadowHideRevealTime) || 0) <= 0
  ) {
    return;
  }

  const terrainDefinition = WORLD_CONTENT?.maps?.[currentMapId] || null;
  const usesAuthoredTerrain = Boolean(TERRAIN_RULES.terrainDefinition(terrainDefinition));

  if (usesAuthoredTerrain && typeof terrainWaterReflectionInfo === "function") {
    const reflection = terrainWaterReflectionInfo(remote.x, remote.y, currentMapId, 16);
    if (!reflection) return;

    const mirrorScreenY = Math.round(reflection.mirrorWorldY - camY);

    ctx.save();
    if (
      typeof terrainWaterClipPath !== "function" ||
      !terrainWaterClipPath(currentMapId, camX, camY)
    ) {
      ctx.restore();
      return;
    }
    ctx.clip();
    ctx.translate(0, mirrorScreenY * 2);
    ctx.scale(1, -1);
    ctx.globalAlpha = 0.18 * reflection.fade;
    drawRemotePlayer(remote, camX, camY, true);
    ctx.restore();
    return;
  }

  // Legacy pond reflection path.
  const withinX =
    remote.x > pond.x - 8 &&
    remote.x < pond.x + pond.width + 8;

  if (!withinX) return;

  let mirrorWorldY = null;
  let distanceToShore = 999;

  if (remote.y <= pond.y) {
    distanceToShore = pond.y - remote.y;
    if (distanceToShore <= 16) mirrorWorldY = pond.y;
  } else if (remote.y >= pond.y + pond.height) {
    distanceToShore = remote.y - (pond.y + pond.height);
    if (distanceToShore <= 16) mirrorWorldY = pond.y + pond.height;
  }

  if (mirrorWorldY === null) return;

  const fade = Math.max(0, 1 - distanceToShore / 16);
  const mirrorScreenY = Math.round(mirrorWorldY - camY);

  ctx.save();
  pondPath(camX, camY, 2);
  ctx.clip();
  ctx.translate(0, mirrorScreenY * 2);
  ctx.scale(1, -1);
  ctx.globalAlpha = 0.18 * fade;
  drawRemotePlayer(remote, camX, camY, true);
  ctx.restore();
}
