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

  // User-drawn Arcanist armor set.
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
const beachGirlNpcImage = loadImage("assets/beach_girl_npc.png?v=372");
const icedCoffeeImage = loadImage("assets/iced_coffee.png?v=372");
const greenWitchNpcImage = loadImage("assets/green_witch_npc.png?v=372");
const camoNpcImage = loadImage("assets/camo_npc.png?v=372");

const woodBenchImage = loadImage("assets/wood_bench_v2.png");
const torchImage = loadImage("assets/torch_v1.png?v=431");

// v395: user-supplied in-world building art. These are separate from the
// compact inventory/crafting icons under assets/ui/.
const woodFloorStructureImage = loadImage("assets/building/wood_floor_v395.png?v=431");
const stoneFloorStructureImage = loadImage("assets/building/stone_floor_v413.png?v=431");
const woodWallStructureImage = loadImage("assets/building/wood_wall_v395.png?v=431");
const woodDoorStructureImage = loadImage("assets/building/wood_door_v395.png?v=431");
const woodRoofStructureImage = loadImage("assets/building/roof_v395.png?v=431");
const chestClosedStructureImage = loadImage("assets/building/chest_closed_v414.png?v=431");
const chestOpenStructureImage = loadImage("assets/building/chest_open_v414.png?v=431");

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
const sapgemWandImage = loadImage("assets/sapgem_wand_v4.png?v=372");
// Tiger Paw uses the compact Hurl paw art for its inventory/hotbar icon. It is
// treated like a hand weapon, so no separate held sprite is drawn.
const tigerPawImage = loadImage("assets/tiger_paw_v1.png?v=431");

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
const enemyDeathEffects = [];
const ENEMY_SPAWN_ANIM_DURATION = 0.30;
const ENEMY_DEATH_ANIM_DURATION = 0.36;
const growthParticles = [];
const basicProjectiles = [];
const rainClouds = [];
const levelUpParticles = [];
let mouseCanvasX = VIEW_W / 2;
let mouseCanvasY = VIEW_H / 2;
let primaryAttackHeld = false;
let pendingBasicAttack = null;

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
let currentMapId = WORLD_CONTENT?.worldGrid?.startMapId || "world_p0_p0";

const houses = [];

const {
  houseImage,
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
// Shared gameplay systems use this registry instead of manually enumerating
// slime/goblin/ghost arrays. Species-specific AI and sprite drawing remain
// isolated behind each profile.
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
    const [mapId]
    of Object.entries(WORLD_CONTENT.maps)
  ) {
    const state = mapStates[mapId];

    if (!state) {
      console.warn(
        `WORLD_CONTENT map "${mapId}" has no client mapState yet`
      );
      continue;
    }

    // v398: coordinate-world mobs are server-generated at runtime. The client
    // starts each collection empty and authoritative enemySnapshot packets
    // construct the actual entities for the current server session.
    for (
      const [, collectionName]
      of Object.entries(
        CLIENT_ENEMY_COLLECTIONS
      )
    ) {
      state[collectionName] = [];
    }
  }
}

function reconcileSharedEnemiesForMap(mapId) {
  const state = mapStates[mapId];

  if (!state) {
    return;
  }

  // Runtime-generated coordinate-world enemies must survive map activation.
  // They are created/reconciled by authoritative server snapshots instead of
  // being rebuilt from fixed WORLD_CONTENT spawn coordinates.
  for (
    const [, collectionName]
    of Object.entries(
      CLIENT_ENEMY_COLLECTIONS
    )
  ) {
    if (!Array.isArray(state[collectionName])) {
      state[collectionName] = [];
    }
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
        "wetTime"
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
  player.fireballAiming = false;
  player.fireballAimTime = 0;
  player.fireballAimMapId = null;

  // Local caster effects have no `visualOnly` flag. Preserve remote-player
  // effects while immediately deleting everything owned by the dead player.
  for (const collection of [
    fireballs,
    basicProjectiles
  ]) {
    for (let i = collection.length - 1; i >= 0; i--) {
      if (!collection[i]?.visualOnly) {
        collection.splice(i, 1);
      }
    }
  }

  endLocalRainCloud({ startCooldown: true });

  clearTemporaryRainGrass();
  player.bowDrawing = false;
  player.bowDrawAmount = 0;
  player.bowReleaseTime = 0;
  player.attackTime = 0;
  player.attackCooldown = 0;
  player.slashTime = 0;
  player.hurlReachTime = 0;

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

  const respawnMapId = typeof serverState?.mapId === "string" && mapStates[serverState.mapId]
    ? serverState.mapId
    : (WORLD_CONTENT?.defaultPlayerLoad?.mapId || WORLD_CONTENT?.worldGrid?.startMapId || "world_p0_p0");
  const respawnSpawnId = WORLD_CONTENT?.defaultPlayerLoad?.spawnId || "center";
  activateMap(respawnMapId, respawnSpawnId);

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
  cancelRainCloudCast();
  fireballs.length = 0;
  fireParticles.length = 0;
  basicProjectiles.length = 0;
  endLocalRainCloud({ startCooldown: true });
  // Remote copies are map-local visuals and can be dropped immediately.
  for (let i = rainClouds.length - 1; i >= 0; i--) {
    if (rainClouds[i]?.visualOnly) rainClouds.splice(i, 1);
  }
  clearTemporaryRainGrass();
  levelUpParticles.length = 0;

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

// v378: coordinate-world map changes keep the outgoing scene visible while
// the destination snapshot is synchronized, then slide both scenes across the
// viewport in the direction the player travelled. This avoids the old black
// cover without pre-activating adjacent maps or their enemies.
const MAP_TRANSITION_SLIDE_DURATION = 0.34;
let mapTransitionPhase = "idle";
let mapTransitionProgress = 0;
let pendingMapTransition = null;
let mapTransitionOutgoingFrame = null;
let mapTransitionIncomingFrame = null;
let mapTransitionDirectionX = 0;
let mapTransitionDirectionY = 0;
let mapTransitionOutgoingPlayerScreenX = VIEW_W / 2;
let mapTransitionOutgoingPlayerScreenY = VIEW_H / 2;
let mapTransitionIncomingPlayerScreenX = VIEW_W / 2;
let mapTransitionIncomingPlayerScreenY = VIEW_H / 2;
let forceSuppressLocalPlayerRendering = false;

function shouldSuppressLocalPlayerForMapTransition() {
  return forceSuppressLocalPlayerRendering || mapTransitionPhase !== "idle";
}

function captureMapTransitionFrame() {
  const frame = document.createElement("canvas");
  frame.width = canvas.width;
  frame.height = canvas.height;
  const frameCtx = frame.getContext("2d");
  frameCtx.imageSmoothingEnabled = false;
  frameCtx.drawImage(canvas, 0, 0);
  return frame;
}

function ensureMapTransitionIncomingFrame() {
  if (
    !mapTransitionIncomingFrame ||
    mapTransitionIncomingFrame.width !== canvas.width ||
    mapTransitionIncomingFrame.height !== canvas.height
  ) {
    mapTransitionIncomingFrame = document.createElement("canvas");
    mapTransitionIncomingFrame.width = canvas.width;
    mapTransitionIncomingFrame.height = canvas.height;
  }
  return mapTransitionIncomingFrame;
}

function setMapTransitionNpcLayerHidden(hidden) {
  const layer = document.getElementById("npcNameLayer");
  if (layer) layer.style.visibility = hidden ? "hidden" : "";
}

function mapTransitionDirectionForTarget(mapId) {
  const sourceGrid = worldGridMapMeta(currentMapId);
  const targetGrid = worldGridMapMeta(mapId);
  if (!sourceGrid || !targetGrid) return { x: 0, y: 0 };
  return {
    x: Math.sign(targetGrid.x - sourceGrid.x),
    y: Math.sign(targetGrid.y - sourceGrid.y)
  };
}

function beginMapTransitionSlide() {
  const camera = getCameraPosition();
  mapTransitionIncomingPlayerScreenX = player.x - camera.x;
  mapTransitionIncomingPlayerScreenY = player.y - camera.y;
  mapTransitionPhase = "sliding";
  mapTransitionProgress = 0;
}

function finishMapTransitionPresentation() {
  mapTransitionPhase = "idle";
  mapTransitionProgress = 0;
  mapTransitionOutgoingFrame = null;
  mapTransitionIncomingFrame = null;
  mapTransitionDirectionX = 0;
  mapTransitionDirectionY = 0;
  setMapTransitionNpcLayerHidden(false);
}

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
  // The outgoing screenshot remains visible during this wait, so a slow packet
  // never exposes a half-populated destination or a black transition screen.
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
    beginMapTransitionSlide();
  }
}

function cancelPendingMapEnemySync() {
  pendingMapEnemySyncId = null;
  suppressedEnemyRenderMapId = null;

  if (mapEnemySyncFallbackTimer) {
    clearTimeout(mapEnemySyncFallbackTimer);
    mapEnemySyncFallbackTimer = null;
  }

  // If authority disappears mid-transition, reveal the locally initialized
  // destination by completing the same directional slide instead of dropping
  // to a black screen.
  if (mapTransitionPhase === "syncing") {
    beginMapTransitionSlide();
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

  const mapId = WORLD_CONTENT?.worldGrid?.startMapId || Object.keys(mapStates)[0];
  return { mapId, spawnId: "center" };
}

function worldGridMapMeta(mapId = currentMapId) {
  const grid = WORLD_CONTENT?.maps?.[mapId]?.grid;
  if (!grid || !Number.isFinite(Number(grid.x)) || !Number.isFinite(Number(grid.y))) return null;
  return {
    x: Number(grid.x),
    y: Number(grid.y),
    distance: Math.max(0, Number(grid.distance) || 0),
    biome: String(grid.biome || "plains"),
    seed: Number(grid.seed) || 0
  };
}

function worldGridMapIdAt(x, y) {
  for (const [mapId, definition] of Object.entries(WORLD_CONTENT?.maps || {})) {
    if (Number(definition?.grid?.x) === Number(x) && Number(definition?.grid?.y) === Number(y)) {
      return mapId;
    }
  }
  return null;
}

function worldGridBiomeLabel(biome) {
  if (biome === "spawn-plains") return "Spawn Plains";
  if (biome === "rocky-plains") return "Rocky Plains";
  if (biome === "forest") return "Forest";
  return "Plains";
}

const worldGridDiscoveredCells = new Set();

function worldGridCellKey(x, y) {
  return `${Math.trunc(Number(x) || 0)},${Math.trunc(Number(y) || 0)}`;
}

function worldGridBiomeIconClass(biome) {
  if (biome === "forest") return "biome-forest";
  if (biome === "rocky-plains") return "biome-rocky";
  return "biome-plains";
}

function markWorldGridDiscovered(mapId = currentMapId) {
  const grid = worldGridMapMeta(mapId);
  if (!grid) return false;
  const key = worldGridCellKey(grid.x, grid.y);
  const changed = !worldGridDiscoveredCells.has(key);
  worldGridDiscoveredCells.add(key);
  return changed;
}

function ensureWorldMiniMapCells(miniMap, radius) {
  const dimension = radius * 2 + 1;
  const signature = `${radius}:${dimension}`;
  if (miniMap.dataset.gridSignature === signature) {
    return miniMap.querySelector(".world-mini-player-marker");
  }

  miniMap.replaceChildren();
  miniMap.dataset.gridSignature = signature;
  miniMap.style.gridTemplateColumns = `repeat(${dimension}, var(--mini-cell))`;
  miniMap.style.gridTemplateRows = `repeat(${dimension}, var(--mini-cell))`;

  for (let y = -radius; y <= radius; y += 1) {
    for (let x = -radius; x <= radius; x += 1) {
      const cell = document.createElement("div");
      cell.className = "world-mini-cell";
      cell.dataset.gridX = `${x}`;
      cell.dataset.gridY = `${y}`;
      miniMap.appendChild(cell);
    }
  }

  const playerMarker = document.createElement("span");
  playerMarker.className = "world-mini-player-marker";
  playerMarker.setAttribute("aria-hidden", "true");
  miniMap.appendChild(playerMarker);
  return playerMarker;
}

function updateWorldMiniMap() {
  const miniMap = document.getElementById("worldMiniMap");
  if (!miniMap) return;

  const current = worldGridMapMeta();
  if (!current) {
    miniMap.style.display = "none";
    return;
  }

  const radius = Math.max(0, Number(WORLD_CONTENT?.worldGrid?.radius) || 0);
  miniMap.style.display = "grid";
  const playerMarker = ensureWorldMiniMapCells(miniMap, radius);
  miniMap.setAttribute(
    "aria-label",
    `World map. Current ${current.x},${current.y}, ${worldGridBiomeLabel(current.biome)}.`
  );

  for (const cell of miniMap.querySelectorAll(".world-mini-cell")) {
    const x = Number(cell.dataset.gridX);
    const y = Number(cell.dataset.gridY);
    cell.className = "world-mini-cell";
    cell.replaceChildren();

    const mapId = worldGridMapIdAt(x, y);
    const definition = mapId ? WORLD_CONTENT?.maps?.[mapId] : null;
    const discovered = Boolean(mapId) && worldGridDiscoveredCells.has(worldGridCellKey(x, y));

    if (!mapId) {
      cell.classList.add("outside-world");
      cell.title = "World edge";
    } else if (!discovered) {
      cell.classList.add("undiscovered");
      cell.title = `Undiscovered · ${x},${y}`;
    } else {
      cell.classList.add("discovered");
      const biome = String(definition?.grid?.biome || "plains");
      const icon = document.createElement("span");
      icon.className = `world-mini-biome-icon ${worldGridBiomeIconClass(biome)}`;
      icon.setAttribute("aria-hidden", "true");
      cell.appendChild(icon);
      cell.title = `${worldGridBiomeLabel(biome)} · ${x},${y}`;
    }

    if (x === 0 && y === 0 && mapId) {
      const spawnMarker = document.createElement("span");
      spawnMarker.className = "world-mini-spawn-marker";
      spawnMarker.setAttribute("aria-hidden", "true");
      cell.appendChild(spawnMarker);
      cell.classList.add("spawn-cell");
    }

    if (x === current.x && y === current.y) {
      cell.classList.add("current-cell");
    }
  }

  const targetCell = miniMap.querySelector(
    `.world-mini-cell[data-grid-x="${current.x}"][data-grid-y="${current.y}"]`
  );
  if (playerMarker && targetCell) {
    const x = targetCell.offsetLeft + targetCell.offsetWidth - playerMarker.offsetWidth - 3;
    const y = targetCell.offsetTop + targetCell.offsetHeight - playerMarker.offsetHeight - 3;
    if (miniMap.dataset.markerReady !== "1") {
      playerMarker.style.transition = "none";
      playerMarker.style.transform = `translate(${x}px, ${y}px)`;
      miniMap.dataset.markerReady = "1";
      requestAnimationFrame(() => { playerMarker.style.transition = ""; });
    } else {
      playerMarker.style.transform = `translate(${x}px, ${y}px)`;
    }
  }
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

  const direction = mapTransitionDirectionForTarget(mapId);
  mapTransitionDirectionX = direction.x;
  mapTransitionDirectionY = direction.y;

  const outgoingCamera = getCameraPosition();
  mapTransitionOutgoingPlayerScreenX = player.x - outgoingCamera.x;
  mapTransitionOutgoingPlayerScreenY = player.y - outgoingCamera.y;

  // Capture the outgoing scene without the local player. The transition then
  // draws one player sprite over the composite, eliminating the v379 double
  // sprite where both map screenshots contained their own copy.
  forceSuppressLocalPlayerRendering = true;
  if (typeof gameRenderer !== "undefined") {
    gameRenderer.render();
  }
  mapTransitionOutgoingFrame = captureMapTransitionFrame();
  forceSuppressLocalPlayerRendering = false;

  mapTransitionIncomingFrame = null;
  pendingMapTransition = {
    mapId,
    entrySide,
    sourceX: player.x,
    sourceY: player.y,
    sourceMapId: currentMapId
  };
  mapTransitionPhase = "starting";
  mapTransitionProgress = 0;
  setMapTransitionNpcLayerHidden(true);
  inputController.clearCommands();
  player.walkTime = 0;
  player.wasMoving = false;
  return true;
}

function updateMapTransition(dt) {
  if (mapTransitionPhase === "idle") return false;

  if (mapTransitionPhase === "starting") {
    const target = pendingMapTransition;
    pendingMapTransition = null;

    // Do not complete a queued map change locally after authority disappears.
    if (!target || !onlineClient?.connected) {
      finishMapTransitionPresentation();
      return true;
    }

    mapTransitionPhase = "syncing";
    // Load the destination behind the frozen outgoing frame. The authoritative
    // snapshot completes before the slide begins, so adjacent maps never need
    // to be simulated or streamed merely for presentation.
    activateMap(target.mapId, target.entrySide, target);
    if (pendingMapEnemySyncId === null) beginMapTransitionSlide();
    return true;
  }

  if (mapTransitionPhase === "syncing") {
    return true;
  }

  if (mapTransitionPhase === "sliding") {
    mapTransitionProgress = Math.min(
      1,
      mapTransitionProgress + dt / MAP_TRANSITION_SLIDE_DURATION
    );

    if (mapTransitionProgress >= 1) {
      finishMapTransitionPresentation();
    }
    return true;
  }

  finishMapTransitionPresentation();
  return false;
}

// Draw the live player over the directional transition composite while the
// outgoing frame remains stationary during server sync.
function drawMapTransitionLivePlayer(screenX, screenY) {
  // Transition snapshots live in physical backing pixels on mobile, while the
  // player renderer works in logical game pixels. Restore the normal game
  // transform before drawing the one live player sprite over the composite.
  ctx.save();
  ctx.setTransform(GAME_RENDER_SCALE, 0, 0, GAME_RENDER_SCALE, 0, 0);
  const camX = player.x - screenX;
  const camY = player.y - screenY;
  drawPlayer(camX, camY);
  ctx.restore();
}

function drawMapTransitionCover() {
  if (mapTransitionPhase === "idle" || !mapTransitionOutgoingFrame) return;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;

  if (mapTransitionPhase === "syncing" || mapTransitionPhase === "starting") {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(mapTransitionOutgoingFrame, 0, 0);
    drawMapTransitionLivePlayer(
      mapTransitionOutgoingPlayerScreenX,
      mapTransitionOutgoingPlayerScreenY
    );
    ctx.restore();
    return;
  }

  const incomingFrame = ensureMapTransitionIncomingFrame();
  const incomingCtx = incomingFrame.getContext("2d");
  incomingCtx.setTransform(1, 0, 0, 1, 0, 0);
  incomingCtx.imageSmoothingEnabled = false;
  incomingCtx.clearRect(0, 0, incomingFrame.width, incomingFrame.height);
  incomingCtx.drawImage(canvas, 0, 0);

  const rawProgress = Math.max(0, Math.min(1, mapTransitionProgress));
  const progress = rawProgress * rawProgress * (3 - 2 * rawProgress);
  const outX = Math.round(-mapTransitionDirectionX * progress * canvas.width);
  const outY = Math.round(-mapTransitionDirectionY * progress * canvas.height);
  const inX = Math.round(mapTransitionDirectionX * (1 - progress) * canvas.width);
  const inY = Math.round(mapTransitionDirectionY * (1 - progress) * canvas.height);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(mapTransitionOutgoingFrame, outX, outY);
  ctx.drawImage(incomingFrame, inX, inY);

  const playerScreenX =
    mapTransitionOutgoingPlayerScreenX +
    (mapTransitionIncomingPlayerScreenX - mapTransitionOutgoingPlayerScreenX) * progress;
  const playerScreenY =
    mapTransitionOutgoingPlayerScreenY +
    (mapTransitionIncomingPlayerScreenY - mapTransitionOutgoingPlayerScreenY) * progress;
  drawMapTransitionLivePlayer(playerScreenX, playerScreenY);

  ctx.restore();
}

function activateMap(mapId, entrySide, transitionContext = null) {
  const state = mapStates[mapId];
  if (!state) return;

  const previousMapId = currentMapId;
  if (previousMapId !== mapId) {
    beginMapEnemySync(mapId);
  }

  currentMapId = mapId;
  activeWorldDimensionMapId = mapId;
  markWorldGridDiscovered(mapId);
  updateWorldMiniMap();

  // Ensure this map's natural enemy objects exactly match the shared registry
  // before replacing the active collection views.
  reconcileSharedEnemiesForMap(
    mapId
  );

  loadActiveMapCollections(state);


  clearTransientWorldEffects();

  // Shared drops are reconstructed by the normal online update loop after
  // startup, so no networking access belongs in this startup-safe function.
  player.knockbackX = 0;
  player.knockbackY = 0;
  player.contactCooldown = Math.max(player.contactCooldown, 0.35);

  // Coordinate-grid travel preserves the perpendicular world coordinate.
  // Crossing east/west keeps Y; crossing north/south keeps X. This makes the
  // maps read as adjacent pieces of one world instead of teleporting the
  // player back to the centre line on every boundary crossing.
  const previousGrid = worldGridMapMeta(previousMapId);
  const targetGrid = worldGridMapMeta(mapId);
  const gridTravel = Boolean(
    transitionContext &&
    previousGrid &&
    targetGrid &&
    transitionContext.sourceMapId === previousMapId
  );

  if (gridTravel) {
    const dx = Math.sign(targetGrid.x - previousGrid.x);
    const dy = Math.sign(targetGrid.y - previousGrid.y);
    if (dx !== 0) {
      player.x = dx > 0 ? 9 : world.width - 9;
      player.y = clampToWorld(Number(transitionContext.sourceY), 15, world.height - 1);
    } else if (dy !== 0) {
      player.x = clampToWorld(Number(transitionContext.sourceX), 8, world.width - 8);
      player.y = dy > 0 ? 16 : world.height - 2;
    }
  } else {
    const sharedSpawn = sharedPlayerSpawnPoint(mapId, entrySide) ||
      sharedPlayerSpawnPoint(mapId, "center");
    player.x = Number(sharedSpawn?.x) || world.width / 2;
    player.y = Number(sharedSpawn?.y) || world.height / 2;
  }

  // Map entry is latency-sensitive because the transition stays covered until
  // the server returns the authoritative enemy snapshot. Do not wait for the
  // routine 10 Hz player heartbeat to tell the server which map we entered.
  if (previousMapId !== mapId && onlineClient?.connected) {
    onlineClient.sendLocalState(true);
  }
}

function updateWorldGridMapConnection() {
  const grid = worldGridMapMeta();
  if (!grid) return false;

  const radius = Math.max(0, Number(WORLD_CONTENT?.worldGrid?.radius) || 0);
  let targetX = grid.x;
  let targetY = grid.y;
  let targetSpawnId = null;

  if (player.x <= 8) {
    targetX -= 1;
    targetSpawnId = "east";
  } else if (player.x >= world.width - 8) {
    targetX += 1;
    targetSpawnId = "west";
  } else if (player.y <= 15) {
    targetY -= 1;
    targetSpawnId = "south";
  } else if (player.y >= world.height - 1) {
    targetY += 1;
    targetSpawnId = "north";
  } else {
    return true;
  }

  // Radius is deliberately a square/"ring" limit: radius 1 = 3x3,
  // radius 2 = 5x5, etc. At the current edge the player simply remains in
  // the map until a future world-expansion mechanic increases the radius.
  if (Math.max(Math.abs(targetX), Math.abs(targetY)) > radius) {
    return true;
  }

  const targetMapId = worldGridMapIdAt(targetX, targetY);
  if (!targetMapId || !targetSpawnId) return true;

  requestMapTransition(targetMapId, targetSpawnId);
  return true;
}

function updateMapConnection() {
  updateWorldGridMapConnection();
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
    if (rock.depleted) continue;

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

  // Equipped tool / attack state. New v420 characters start with the Wood Sword
  // selected; browser saves still overwrite this during restore.
  weaponIndex: 0, // -1 empty, 0 Wood Sword, 1 Axe, 2 Fire Wand, 3 Rain Wand, 4 Katana, 5 Sword, 6 Wood Bow, 7 Dreamcatcher, 8 Shepherd Staff, 9 Tournesol, 10 Tabatha's Key, 11 Pickaxe, 12 Sapgem Wand, 13 Tiger Paw

  // Bow draw/release state, including close-range bow melee fallback.
  bowDrawing: false,
  bowDrawAmount: 0,
  // A bow shot requires one full second of draw time. Releasing before the
  // draw completes cancels the shot without consuming an arrow.
  bowDrawDuration: 1.0,
  bowReleaseTime: 0,
  bowReleaseDuration: 0.12,




  // Fireball uses an expanding targeting pulse before release.
  fireballAiming: false,
  fireballAimTime: 0,
  fireballAimMapId: null,
  fireballTargetX: null,
  fireballTargetY: null,
  fireballTargetAngle: null,

  // Item-action cooldowns are tracked locally. Rain Cloud begins its cooldown
  // only after the summoned cloud expires; Fireball begins on successful release.
  actionCooldowns: {
    fireball: 0,
    rainCloud: 0
  },
  // Cooldowns use wall-clock deadlines so background-tab throttling cannot pause them.
  actionCooldownEndTimes: {
    fireball: 0,
    rainCloud: 0
  },

  // Rain Cloud is a committed item action. Its destination is snapshotted when the cast begins.
  rainCloudCasting: false,
  rainCloudCastTime: 0,
  rainCloudCastDuration: 2.00,
  rainCloudCastMapId: null,
  rainCloudCastTargetX: null,
  rainCloudCastTargetY: null,


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

  // Fire debuff state. Player fire lasts longer than monster fire so
  // catching flame feels more consequential and gives the rain spell value.
  burnTime: 0,
  burnDuration: 6.0,
  burnTickTimer: 0,
  burnTickInterval: 0.5,

  // Wet status from standing under a rain cloud.
  wetTime: 0,
  wetDuration: 3.0,



  // Tiger Paw reach feedback when its grab/throw action is used without
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
  healingPotionCooldownUntil: 0,
  attackPotionCooldownUntil: 0,
  magicPotionCooldownUntil: 0,
  attackPotionUntil: 0,
  magicPotionUntil: 0,
  goldSlimeBubbles: 0,
  greenJellyCubes: 0,
  arrows: 0,
  woodFloors: 0,
  stoneFloors: 0,
  woodWalls: 0,
  woodDoors: 0,
  torches: 0,
  chests: 0,
  craftingTables: 0,


  // Count-based item ownership. v420 starter loadout: every brand-new character
  // begins able to gather/build without a tutorial handoff NPC. Existing browser
  // saves overwrite this dictionary during restore.
  items: {
    weapon_sword: 1,
    weapon_pickaxe: 1,
    weapon_axe: 1
  },


  // v424 unified player-arranged weapon/tool belt (physical keys 1-0).
  hotbarAssignments: [
    "weapon_sword", "weapon_pickaxe", "weapon_axe", null, null, null, null, null, null, null
  ],

  // Crafting-history flags used by recipe recovery/persistence.
  story: {
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
};

const HOTBAR_SLOT_COUNT = 10;
const CONSUMABLE_ITEM_IDS = Object.freeze(["healingPotion", "attackPotion", "magicPotion"]);
const BUILD_HOTBAR_ITEMS = Object.freeze(["woodFloor", "stoneFloor", "woodWall", "woodDoor", "torch", "chest", "craftingTable"]);
const HOTBAR_RESOURCE_ITEM_BY_KEY = Object.freeze({
  woodFloors: "woodFloor",
  stoneFloors: "stoneFloor",
  woodWalls: "woodWall",
  woodDoors: "woodDoor",
  torches: "torch",
  chests: "chest",
  craftingTables: "craftingTable"
});

function hotbarKeyLabel(slotIndex) {
  return slotIndex === 9 ? "0" : String(slotIndex + 1);
}
const WEAPON_STYLES = ["sword", "axe", "wand", "rainWand", "katana", "oldSword", "bow", "bow", "shepherdStaff", "lostKeyWand", "sunflowerWand", "pickaxe", "sapgemWand", "tigerPaw"];
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
  "weapon_sapgemWand",
  "weapon_tigerPaw"
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
  recoveryPickaxe: Object.freeze({
    name: "Recovery Pickaxe", itemId: "weapon_pickaxe", equipType: "weapon", equipIndex: 11,
    category: "weapons", station: "hand", ingredients: Object.freeze({}), repeatable: true, recoveryOnly: true
  }),
  craftingTable: Object.freeze({
    name: "Wood Crafting Table",
    resourceKey: "craftingTables",
    outputCount: 1,
    category: "building",
    station: "hand",
    ingredients: Object.freeze({ wood: 10 }),
    repeatable: true
  }),
  woodSword: Object.freeze({
    name: "Wood Sword",
    itemId: "weapon_sword",
    equipType: "weapon",
    equipIndex: 0,
    category: "weapons",
    ingredients: Object.freeze({ wood: 8 }),
    storyKey: "woodSwordCrafted",
    repeatable: true
  }),
  woodBow: Object.freeze({
    name: "Wood Bow",
    itemId: "weapon_bow",
    equipType: "weapon",
    equipIndex: 6,
    category: "weapons",
    ingredients: Object.freeze({ wood: 8 }),
    storyKey: "woodBowCrafted",
    repeatable: true
  }),
  shepherdStaff: Object.freeze({
    name: "Shepherd Staff",
    itemId: "weapon_shepherdStaff",
    equipType: "weapon",
    equipIndex: 8,
    category: "weapons",
    ingredients: Object.freeze({ wood: 10 }),
    storyKey: "shepherdStaffCrafted",
    repeatable: true
  }),
  tigerPaw: Object.freeze({
    name: "Tiger Paw",
    itemId: "weapon_tigerPaw",
    equipType: "weapon",
    equipIndex: 13,
    category: "weapons",
    ingredients: Object.freeze({ wood: 8, stone: 2 }),
    repeatable: true
  }),
  woodHelm: Object.freeze({
    name: "Wood Helm",
    itemId: "hat_wood",
    equipType: "hat",
    equipIndex: 8,
    category: "armor",
    ingredients: Object.freeze({ wood: 8, stone: 2 }),
    storyKey: "woodHelmCrafted",
    repeatable: true
  }),
  woodChest: Object.freeze({
    name: "Wood Chest",
    itemId: "shirt_wood",
    equipType: "shirt",
    equipIndex: 5,
    category: "armor",
    ingredients: Object.freeze({ wood: 12, stone: 3 }),
    storyKey: "woodChestCrafted",
    repeatable: true
  }),
  woodGreaves: Object.freeze({
    name: "Wood Greaves",
    itemId: "pants_wood",
    equipType: "pants",
    equipIndex: 5,
    category: "armor",
    ingredients: Object.freeze({ wood: 10, stone: 2 }),
    storyKey: "woodGreavesCrafted",
    repeatable: true
  }),
  woodRing: Object.freeze({
    name: "Wood Ring",
    itemId: "charm_woodRing",
    equipType: "charm",
    equipIndex: 0,
    category: "armor",
    ingredients: Object.freeze({ wood: 5 }),
    storyKey: "woodRingCrafted",
    repeatable: true
  }),
  woodFloor: Object.freeze({
    name: "Wood Floor ×4",
    resourceKey: "woodFloors",
    outputCount: 4,
    category: "building",
    ingredients: Object.freeze({ wood: 2 }),
    repeatable: true
  }),
  stoneFloor: Object.freeze({
    name: "Stone Floor ×4",
    resourceKey: "stoneFloors",
    outputCount: 4,
    category: "building",
    ingredients: Object.freeze({ stone: 2 }),
    repeatable: true
  }),
  woodWall: Object.freeze({
    name: "Wood Wall ×2",
    resourceKey: "woodWalls",
    outputCount: 2,
    category: "building",
    ingredients: Object.freeze({ wood: 3 }),
    repeatable: true
  }),
  woodDoor: Object.freeze({
    name: "Wood Door",
    resourceKey: "woodDoors",
    outputCount: 1,
    category: "building",
    ingredients: Object.freeze({ wood: 4 }),
    repeatable: true
  }),
  torch: Object.freeze({
    name: "Torch",
    resourceKey: "torches",
    outputCount: 1,
    category: "building",
    ingredients: Object.freeze({ wood: 1, greenJellyCubes: 1 }),
    repeatable: true
  }),
  testWoodSupply: Object.freeze({
    name: "Test Wood +100",
    resourceKey: "wood",
    outputCount: 100,
    category: "building",
    ingredients: Object.freeze({}),
    repeatable: true,
    testSupply: true
  }),
  arrows: Object.freeze({
    name: "50 Arrows",
    resourceKey: "arrows",
    outputCount: 50,
    category: "consumables",
    ingredients: Object.freeze({ wood: 5, stone: 1 }),
    repeatable: true
  }),
  healingPotion: Object.freeze({
    name: "Healing Potion",
    resourceKey: "healingPotions",
    outputCount: 1,
    category: "consumables",
    ingredients: Object.freeze({ whiteFlowers: 1, blueFlowers: 1 }),
    repeatable: true
  }),
  attackPotion: Object.freeze({
    name: "Attack Potion",
    resourceKey: "attackPotions",
    outputCount: 1,
    category: "consumables",
    ingredients: Object.freeze({ whiteFlowers: 2 }),
    repeatable: true
  }),
  magicPotion: Object.freeze({
    name: "Magic Potion",
    resourceKey: "magicPotions",
    outputCount: 1,
    category: "consumables",
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

function potionCooldownUntil(itemId) {
  if (itemId === "healingPotion") return Number(player.healingPotionCooldownUntil) || 0;
  if (itemId === "attackPotion") return Number(player.attackPotionCooldownUntil) || 0;
  if (itemId === "magicPotion") return Number(player.magicPotionCooldownUntil) || 0;
  return 0;
}

function setLocalConsumableCooldown(itemId, now) {
  if (itemId === "healingPotion") player.healingPotionCooldownUntil = now + HEALING_POTION_COOLDOWN_MS;
  if (itemId === "attackPotion") player.attackPotionCooldownUntil = now + BUFF_POTION_COOLDOWN_MS;
  if (itemId === "magicPotion") player.magicPotionCooldownUntil = now + BUFF_POTION_COOLDOWN_MS;
}

function useConsumable(itemId) {
  if (!CONSUMABLE_ITEM_IDS.includes(itemId)) return false;
  if (Date.now() < potionCooldownUntil(itemId)) return false;
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
  // Cam — Ranger gear
  { id: "arrows", name: "Arrows ×50", vendor: "cam", category: "common", price: 5, repeatable: true, resourceKey: "arrows", outputCount: 50 },
  { id: "hat_ranger", name: "Ranger Hat", vendor: "cam", price: 20 },
  { id: "shirt_ranger", name: "Ranger Shirt", vendor: "cam", price: 30 },
  { id: "pants_ranger", name: "Ranger Pants", vendor: "cam", price: 25 },
  { id: "weapon_dreamcatcher", name: "Dreamcatcher", vendor: "cam", price: 60 },

  // Myrtle — Magus gear
  { id: "weapon_sapgemWand", name: "Sapgem Wand", vendor: "myrtle", price: 20 },
  { id: "weapon_lostKey", name: "Tournesol", vendor: "myrtle", price: 35 },
  { id: "weapon_hugeSunflower", name: "Tabatha's Key", vendor: "myrtle", price: 60 },
  { id: "hat_arcanist", name: "Arcanist Hat", vendor: "myrtle", price: 25 },
  { id: "shirt_arcanist", name: "Arcanist Robe", vendor: "myrtle", price: 40 },
  { id: "pants_arcanist", name: "Arcanist Skirt", vendor: "myrtle", price: 30 },
  { id: "hat_jester", name: "Jester Hat", vendor: "myrtle", price: 30 },
  { id: "shirt_jester", name: "Jester Shirt", vendor: "myrtle", price: 45 },
  { id: "pants_jester", name: "Jester Pants", vendor: "myrtle", price: 35 }
];

function shopImageForItemId(itemId) {
  if (itemId === "woodFloor") return document.getElementById("inventoryWoodFloorImg");
  if (itemId === "stoneFloor") return document.getElementById("inventoryStoneFloorImg");
  if (itemId === "chest") return document.getElementById("inventoryChestImg");
  if (itemId === "craftingTable") return document.getElementById("inventoryCraftingTableImg") || woodBenchImage;
  if (itemId === "woodWall") return document.getElementById("inventoryWoodWallImg");
  if (itemId === "woodDoor") return document.getElementById("inventoryWoodDoorImg");
  if (itemId === "torch") return torchImage;
  if (itemId === "arrows") return arrowResourceImage;

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
  return WEAPON_ITEM_IDS.includes(itemId) || BUILD_HOTBAR_ITEMS.includes(itemId);
}

function hotbarItemInventoryCount(itemId) {
  if (WEAPON_ITEM_IDS.includes(itemId)) return inventoryItemCount(itemId);
  if (itemId === "woodFloor") return Math.max(0, Math.floor(Number(player.woodFloors) || 0));
  if (itemId === "stoneFloor") return Math.max(0, Math.floor(Number(player.stoneFloors) || 0));
  if (itemId === "woodWall") return Math.max(0, Math.floor(Number(player.woodWalls) || 0));
  if (itemId === "woodDoor") return Math.max(0, Math.floor(Number(player.woodDoors) || 0));
  if (itemId === "torch") return Math.max(0, Math.floor(Number(player.torches) || 0));
  if (itemId === "chest") return Math.max(0, Math.floor(Number(player.chests) || 0));
  if (itemId === "craftingTable") return Math.max(0, Math.floor(Number(player.craftingTables) || 0));
  return 0;
}

function updateHotbarInventoryCountBadges() {
  for (let slotIndex = 0; slotIndex < HOTBAR_SLOT_COUNT; slotIndex++) {
    const slot = document.getElementById(`slot${slotIndex + 1}`);
    const badge = slot?.querySelector(".hotbar-count");
    if (!badge) continue;
    const itemId = player.hotbarAssignments?.[slotIndex] || null;
    badge.textContent = itemId && hotbarAssignmentCanPersist(itemId)
      ? String(hotbarItemInventoryCount(itemId))
      : "";
  }
}

function hotbarItemDisplayName(itemId) {
  if (itemId === "woodFloor") return "Wood Floor";
  if (itemId === "stoneFloor") return "Stone Floor";
  if (itemId === "woodWall") return "Wood Wall";
  if (itemId === "woodDoor") return "Wood Door";
  if (itemId === "torch") return "Torch";
  if (itemId === "chest") return "Chest";
  const weaponIndex = WEAPON_ITEM_IDS.indexOf(itemId);
  if (weaponIndex >= 0) return weaponDisplayName(weaponIndex);
  return itemId || "Item";
}

function hotbarItemCanBeAssigned(itemId) {
  if (!itemId || !isHotbarAssignableItem(itemId) || hotbarItemInventoryCount(itemId) <= 0) {
    return false;
  }
  return !WEAPON_ITEM_IDS.includes(itemId) || equipmentItemCanBeEquipped(itemId);
}

function hotbarAssignmentCanPersist(itemId) {
  if (!itemId || !isHotbarAssignableItem(itemId)) return false;
  if (WEAPON_ITEM_IDS.includes(itemId)) {
    return playerOwnsItem(itemId) && equipmentItemCanBeEquipped(itemId);
  }
  // Consumable/placeable-style actions may remain assigned at zero so crafting
  // another copy immediately makes the existing hotkey useful again.
  return true;
}

function showHotbarAssignmentRestriction(itemId) {
  if (equipmentMissingRequirements(itemId).length) {
    showEquipmentRestriction(itemId);
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
          !hotbarAssignmentCanPersist(itemId) ||
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
  if (!itemId || fireballIsAiming() || player.rainCloudCasting) return false;

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
  if (fireballIsAiming() || player.rainCloudCasting) return false;

  if (
    !isHotbarAssignableItem(itemId) ||
    hotbarItemInventoryCount(itemId) <= 0 ||
    slotIndex < 0 ||
    slotIndex >= HOTBAR_SLOT_COUNT
  ) {
    return false;
  }

  if (WEAPON_ITEM_IDS.includes(itemId) && !equipmentItemCanBeEquipped(itemId)) {
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
  saveLocalCharacterState(true);
  return true;
}

function clearItemFromHotbar(itemId) {
  if (fireballIsAiming() || player.rainCloudCasting) return false;

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
    saveLocalCharacterState(true);
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

  const emptySlot = firstEmptyHotbarSlot();
  if (emptySlot < 0) return false;

  player.hotbarAssignments[emptySlot] = itemId;
  return true;
}

function hotbarAssignableAcquisitionSnapshot() {
  const snapshot = {};
  for (const itemId of WEAPON_ITEM_IDS) {
    snapshot[itemId] = hotbarItemInventoryCount(itemId);
  }
  for (const itemId of Object.values(HOTBAR_RESOURCE_ITEM_BY_KEY)) {
    snapshot[itemId] = hotbarItemInventoryCount(itemId);
  }
  return snapshot;
}

function autoAssignNewlyAcquiredHotbarItems(beforeCounts = {}) {
  sanitizeHotbarAssignments();
  let changed = false;
  for (const itemId of [...WEAPON_ITEM_IDS, ...Object.values(HOTBAR_RESOURCE_ITEM_BY_KEY)]) {
    const before = Math.max(0, Number(beforeCounts?.[itemId]) || 0);
    const after = hotbarItemInventoryCount(itemId);
    if (after > before && autoAssignHotbarItem(itemId)) changed = true;
  }
  if (changed) saveLocalCharacterState(true);
  return changed;
}

// Any newly received hotbar-eligible equipment fills the lowest free slot.
// This intentionally also reassigns an item after a manual clear if the player
// later acquires another copy; acquisition, not first-ever ownership, is the
// trigger requested by the v421 inventory flow.
function grantInventoryItem(itemId, count = 1) {
  if (!ALL_EQUIPMENT_ITEM_IDS.has(itemId)) {
    return false;
  }

  const amount = Math.max(1, Math.floor(Number(count) || 1));
  player.items[itemId] = inventoryItemCount(itemId) + amount;
  autoAssignHotbarItem(itemId);

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
  beachGirl: "Sunny",
  greenWitch: "Myrtle",
  camoGuy: "Cam"
});

function npcDisplayName(type, npc = null) {
  const customName = typeof npc?.name === "string" ? npc.name.trim() : "";
  return customName || NPC_DEFAULT_NAMES[type] || "";
}

function nearbyChestContextTarget() {
  let nearest = null;
  let nearestDistance = Infinity;

  for (const structure of currentMapStructures()) {
    if (structure?.kind !== "chest") continue;
    const distance = distanceToPlayer(Number(structure.x) || 0, Number(structure.y) || 0);
    if (distance <= 22 && distance < nearestDistance) {
      nearest = structure;
      nearestDistance = distance;
    }
  }

  return nearest;
}

function nearbySpawnInteraction() {
  const candidates = [];

  for (const npc of placedNpcDefinitionsForMap(currentMapId)) {
    const type = npc?.type;
    if (!["beachGirl", "greenWitch", "camoGuy"].includes(type)) continue;
    candidates.push({
      kind: "placedNpc",
      npcType: type,
      npc,
      x: Number(npc.x) || 0,
      y: Number(npc.y) || 0,
      radius: Math.max(8, Number(npc.interactionRadius) || 24)
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

function interactWithCamoNpc(npc) {
  showRewardToast(
    npcDisplayName("camoGuy", npc),
    "Ranger supplies. Keep your arrows dry and your footsteps quiet.",
    camoNpcImage
  );
  openVendorShop("cam");
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

function playerNearCraftingTable(range = 40) {
  const maxRange = Math.max(8, Number(range) || 40);
  return currentMapStructures().some(structure =>
    structure?.kind === "craftingTable" &&
    Math.hypot(Number(structure.x) - Number(player.x), Number(structure.y) - Number(player.y)) <= maxRange
  );
}

function craftRecipeHasIngredients(recipe) {
  if (!recipe) return false;
  const ingredients = recipe.ingredients || { wood: recipe.cost };
  return Object.entries(ingredients).every(
    ([resourceKey, amount]) => (Number(player[resourceKey]) || 0) >= amount
  );
}

function craftRecipeStationAvailable(recipe) {
  if (!recipe) return false;
  if (recipe.station === "hand") return true;
  return playerNearCraftingTable();
}

function craftRecipeCurrentlyAvailable(recipe) {
  return Boolean(
    recipe &&
    !recipe.testSupply &&
    (!recipe.recoveryOnly || !playerOwnsItem(recipe.itemId)) &&
    craftRecipeStationAvailable(recipe) &&
    craftRecipeHasIngredients(recipe)
  );
}

function craftRecipeOffline(recipeId) {
  const recipe = CRAFT_RECIPES[recipeId];
  if (!recipe || !craftRecipeStationAvailable(recipe)) return;

  const beforeHotbarCounts = hotbarAssignableAcquisitionSnapshot();
  const ingredients = recipe.ingredients || { wood: recipe.cost };
  if (!craftRecipeHasIngredients(recipe)) {
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
    if (recipe.storyKey) player.story[recipe.storyKey] = true;
    grantInventoryItem(recipe.itemId, 1);
    equipCraftedRecipe(recipe);
  }

  autoAssignNewlyAcquiredHotbarItems(beforeHotbarCounts);

  // v427: crafting is deliberately quiet. Recipe state/count changes provide feedback.
  updateCraftingUi();
  updateInventoryUi();
  updateHotbar();
  saveLocalCharacterState(true);
}

function tryCraftRecipe(recipeId) {
  const recipe = CRAFT_RECIPES[recipeId];

  if (!recipe || !craftingOpen || player.benchCraftPending) return;
  if (!craftRecipeStationAvailable(recipe)) {
    updateCraftingUi();
    return;
  }
  if (!craftRecipeHasIngredients(recipe)) {
    updateCraftingUi();
    return;
  }

  if (typeof onlineClient !== "undefined" && onlineClient?.connected) {
    player.benchCraftPending = recipeId;
    if (!onlineClient.requestCraft(recipeId)) player.benchCraftPending = null;
    updateCraftingUi();
    return;
  }

  craftRecipeOffline(recipeId);
}

function updateCraftingUi() {
  const entries = Object.entries(CRAFT_RECIPES);
  const availableRecipeIds = new Set(
    entries
      .filter(([, recipe]) => craftRecipeCurrentlyAvailable(recipe))
      .map(([recipeId]) => recipeId)
  );

  const nearTable = playerNearCraftingTable();
  const title = document.getElementById("craftTitle");
  if (title) title.textContent = nearTable ? "Craft · Table" : "Craft";

  let visibleRecipeCount = 0;
  for (const [recipeId, recipe] of entries) {
    const button = document.querySelector(`[data-craft-recipe="${recipeId}"]`);
    if (!button) continue;

    const visible = availableRecipeIds.has(recipeId);
    button.hidden = !visible;
    button.style.display = visible ? "" : "none";
    if (visible) visibleRecipeCount += 1;

    const pending = player.benchCraftPending === recipeId;
    const anyPending = Boolean(player.benchCraftPending);
    button.disabled = anyPending;

    const ingredients = recipe.ingredients || { wood: recipe.cost };
    const image = button.querySelector("img");
    const itemImage = recipe.resourceKey === "arrows"
      ? arrowResourceImage
      : recipe.resourceKey === "wood"
        ? woodImage
        : recipe.resourceKey === "torches"
          ? torchImage
          : recipe.resourceKey === "craftingTables"
            ? woodBenchImage
            : recipe.resourceKey
              ? potionImageForItem(recipeId)
              : shopImageForItemId(recipe.itemId);

    if (image && itemImage) image.src = itemImage.src;

    const cost = button.querySelector(".craft-recipe-cost");
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

    const status = button.querySelector(".craft-recipe-status");
    if (status) status.textContent = pending ? "WORKING..." : "CRAFT";
  }

  const empty = document.getElementById("craftEmpty");
  if (empty) {
    const nothingAvailable = visibleRecipeCount === 0;
    empty.style.display = nothingAvailable ? "block" : "none";
    empty.textContent = nearTable
      ? "Nothing craftable with your current materials."
      : "Gather materials. A Crafting Table unlocks more recipes.";
  }
}

function syncCraftPanelToViewport() {
  const craftPanel = document.getElementById("craftPanel");
  const chestPanel = document.getElementById("chestPanel");
  const viewport = document.getElementById("gameViewport");
  if (!viewport) return;
  const rect = viewport.getBoundingClientRect();
  const mobileLandscape = window.matchMedia("(hover: none) and (pointer: coarse) and (orientation: landscape)").matches;
  const top = Math.round(rect.top + 86);
  const left = Math.round(rect.left + (mobileLandscape ? 2 : 8));
  const maxHeight = `${Math.max(96, Math.round(rect.bottom - top - 8))}px`;

  for (const panel of [craftPanel, chestPanel]) {
    if (!panel) continue;
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.maxHeight = maxHeight;
  }
}

function syncContextOverlayVisibility() {
  const overlay = document.getElementById("craftOverlay");
  if (!overlay) return;
  const open = Boolean(craftingOpen || chestContextOpen);
  overlay.classList.toggle("open", open);
  overlay.setAttribute("aria-hidden", open ? "false" : "true");

  const craftPanel = document.getElementById("craftPanel");
  const chestPanel = document.getElementById("chestPanel");
  if (craftPanel) craftPanel.hidden = !craftingOpen;
  if (chestPanel) chestPanel.hidden = !chestContextOpen;

  if (open) syncCraftPanelToViewport();
}

function chestContextItemName(token) { return inventoryTransferName(token); }
function chestContextItemImage(token) { return inventoryTransferImageForToken(token); }
function normalizedChestContextItems(items) {
  return (Array.isArray(items) ? items : [])
    .map(item => ({
      token: typeof item?.token === "string" ? item.token : "",
      count: Math.max(0, Math.floor(Number(item?.count) || 0))
    }))
    .filter(item => inventoryTransferTokenParts(item.token) && item.count > 0)
    .slice(0, Math.max(1, chestContextSlotLimit));
}
function renderChestContextUi() {
  const grid = document.getElementById("chestGrid");
  const empty = document.getElementById("chestEmpty");
  const footer = document.getElementById("chestFooter");
  const lootAll = document.getElementById("chestLootAll");
  if (!grid) return;
  grid.replaceChildren();
  const items = normalizedChestContextItems(chestContextItems);
  const chestBusy = Boolean(chestTakePendingItemId || chestTakeAllPending || chestStorePendingToken);
  for (const item of items) {
    const card = document.createElement("div");
    card.className = "chest-item";
    card.dataset.chestItem = item.token;
    card.draggable = chestContextOpen && !chestBusy;
    card.classList.toggle("pending", chestTakeAllPending || chestTakePendingItemId === item.token);
    card.title = `Drag or double-click ${chestContextItemName(item.token)} to take it`;
    const image = document.createElement("img");
    const itemImage = chestContextItemImage(item.token);
    if (itemImage?.src) image.src = itemImage.src;
    image.alt = chestContextItemName(item.token);
    const count = document.createElement("span");
    count.className = "chest-item-count";
    count.textContent = `${item.count}`;
    const name = document.createElement("span");
    name.className = "chest-item-name";
    name.textContent = chestContextItemName(item.token);
    card.append(image, count, name);
    grid.append(card);
  }
  for (let i = items.length; i < chestContextSlotLimit; i++) {
    const slot = document.createElement("div");
    slot.className = "chest-item chest-empty-slot";
    slot.setAttribute("aria-label", "Empty chest slot");
    grid.append(slot);
  }
  if (empty) empty.style.display = "none";
  if (footer) footer.textContent = `${items.length} / ${chestContextSlotLimit} slots · Drag stacks both ways.`;
  const storeSelected = document.getElementById("chestStoreSelected");
  if (storeSelected) {
    const selectedToken = selectedOverlayInventoryToken || "";
    storeSelected.disabled = !chestContextOpen || chestBusy || !inventoryTransferTokenParts(selectedToken) || inventoryTransferCount(selectedToken) <= 0;
  }
  if (lootAll) {
    lootAll.disabled = !chestContextOpen || items.length === 0 || chestBusy;
    lootAll.textContent = chestTakeAllPending ? "LOOTING..." : "LOOT ALL";
  }
}

function updateChestHudButton() {
  const button = document.getElementById("chestHudButton");
  if (!button) return;
  const available = Boolean(nearbyChestContextId && !player.isDead);
  button.hidden = !available;
  button.disabled = Boolean(pendingChestContextId);
  button.classList.toggle("active", Boolean(chestContextOpen && activeChestContextId));
  button.setAttribute("aria-pressed", chestContextOpen ? "true" : "false");
  button.title = chestContextBusyId === nearbyChestContextId
    ? "Chest is currently in use by another player"
    : "Open nearby chest";
}

function closeChestContext(sendRequest = true, reason = "closed") {
  const chestId = activeChestContextId || pendingChestContextId;
  if (sendRequest && activeChestContextId && typeof onlineClient !== "undefined" && onlineClient?.connected) {
    onlineClient.requestChestContextClose(activeChestContextId);
  }

  chestContextOpen = false;
  activeChestContextId = null;
  pendingChestContextId = null;
  chestContextItems = [];
  chestTakePendingItemId = null;
  chestTakeAllPending = false;
  chestStorePendingToken = null;
  draggingChestItemId = null;
  document.getElementById("inventoryPage")?.classList.remove("chest-drop-ready");
  document.getElementById("chestPanel")?.classList.remove("inventory-drop-ready");
  renderChestContextUi();
  updateChestHudButton();
  syncContextOverlayVisibility();
  return Boolean(chestId || reason);
}

function requestChestContextOpen(chestId, automatic = false) {
  if (!chestId || player.isDead) return false;
  if (activeChestContextId === chestId && chestContextOpen) return true;
  if (pendingChestContextId === chestId) return true;
  if (typeof onlineClient === "undefined" || !onlineClient?.connected) return false;

  if (craftingOpen) setCraftingOpen(false);
  if (activeChestContextId && activeChestContextId !== chestId) closeChestContext(true, "switch");

  pendingChestContextId = chestId;
  chestContextBusyId = null;
  updateChestHudButton();

  if (!onlineClient.requestChestContextOpen(chestId)) {
    pendingChestContextId = null;
    updateChestHudButton();
    return false;
  }

  return true;
}

function applyChestContextResult(message) {
  const chestId = typeof message?.chestId === "string" ? message.chestId : "";
  if (!chestId) return;
  if (pendingChestContextId === chestId) pendingChestContextId = null;

  if (!message.success) {
    if (message.reason === "busy") {
      chestContextBusyId = chestId;
      showMenuFeedback("CHEST IN USE", "#ffe38b", 0.9);
    }
    updateChestHudButton();
    return;
  }

  // A delayed grant after the player already walked away is immediately
  // released rather than reopening a stale off-range chest.
  if (nearbyChestContextId !== chestId) {
    onlineClient?.requestChestContextClose(chestId);
    return;
  }

  if (craftingOpen) setCraftingOpen(false);
  activeChestContextId = chestId;
  chestContextOpen = true;
  chestContextBusyId = null;
  chestContextSlotLimit = Math.max(1, Math.floor(Number(message.slotLimit) || 5));
  chestContextItems = normalizedChestContextItems(message.items);
  chestTakePendingItemId = null; chestTakeAllPending = false; chestStorePendingToken = null;

  // The player's inventory is the drop target, so surface it automatically.
  setInventoryOpen(true);
  renderChestContextUi();
  updateChestHudButton();
  syncContextOverlayVisibility();
}

function applyChestContextClosed(message) {
  const chestId = typeof message?.chestId === "string" ? message.chestId : "";
  if (chestId && chestId !== activeChestContextId && chestId !== pendingChestContextId) return;
  closeChestContext(false, message?.reason || "closed");
}

function applyChestTakeResult(message) {
  const chestId=typeof message?.chestId==="string"?message.chestId:""; if(chestId&&chestId!==activeChestContextId)return; const token=typeof message?.token==="string"?message.token:""; chestTakePendingItemId=null; if(Number.isFinite(message?.slotLimit))chestContextSlotLimit=Math.max(1,Math.floor(message.slotLimit)); if(Array.isArray(message?.items))chestContextItems=normalizedChestContextItems(message.items); const parts=inventoryTransferTokenParts(token); if(message?.success&&parts?.type==="resource"&&Number.isFinite(message.playerCount))player[parts.id]=Math.max(0,Math.floor(Number(message.playerCount))); else if(message?.success&&parts?.type==="item")applyInventoryTransferDelta(token,Math.max(1,Math.floor(Number(message.amount)||1)),{autoAssign:true}); renderChestContextUi();updateInventoryUi();updateHotbar();saveLocalCharacterState(true);
}
function applyChestTakeAllResult(message) {
  const chestId = typeof message?.chestId === "string" ? message.chestId : "";
  if (chestId && chestId !== activeChestContextId) return;
  chestTakeAllPending = false;
  chestTakePendingItemId = null;
  if (Number.isFinite(message?.slotLimit)) chestContextSlotLimit = Math.max(1, Math.floor(message.slotLimit));
  if (Array.isArray(message?.items)) chestContextItems = normalizedChestContextItems(message.items);
  if (message?.success && Array.isArray(message.transfers)) {
    for (const transfer of message.transfers) {
      const token = typeof transfer?.token === "string" ? transfer.token : "";
      const parts = inventoryTransferTokenParts(token);
      const amount = Math.max(1, Math.floor(Number(transfer?.amount) || 1));
      if (parts?.type === "resource" && Number.isFinite(transfer?.playerCount)) {
        player[parts.id] = Math.max(0, Math.floor(Number(transfer.playerCount)));
      } else if (parts?.type === "item") {
        applyInventoryTransferDelta(token, amount, { autoAssign: true });
      }
    }
  }
  renderChestContextUi();
  updateInventoryUi();
  updateHotbar();
  saveLocalCharacterState(true);
}
function applyChestStoreResult(message) {
  const chestId=typeof message?.chestId==="string"?message.chestId:"";if(chestId&&chestId!==activeChestContextId)return;const token=typeof message?.token==="string"?message.token:"";const wasPending=chestStorePendingToken===token;chestStorePendingToken=null;if(Number.isFinite(message?.slotLimit))chestContextSlotLimit=Math.max(1,Math.floor(message.slotLimit));if(Array.isArray(message?.items))chestContextItems=normalizedChestContextItems(message.items);if(message?.success&&wasPending){const parts=inventoryTransferTokenParts(token);if(parts?.type==="resource"&&Number.isFinite(message.playerCount))player[parts.id]=Math.max(0,Math.floor(Number(message.playerCount)));else if(parts?.type==="item")applyInventoryTransferDelta(token,-Math.max(1,Math.floor(Number(message.amount)||1)));}else if(!message?.success&&message?.reason==="full")showMenuFeedback("CHEST FULL","#ffe38b",0.9);document.getElementById("chestPanel")?.classList.remove("inventory-drop-ready");renderChestContextUi();updateInventoryUi();updateHotbar();saveLocalCharacterState(true);
}
function applyInventoryDropResult(message){const token=typeof message?.token==="string"?message.token:"";if(!token||inventoryDropPendingToken!==token)return;inventoryDropPendingToken=null;if(!message?.success)return;const parts=inventoryTransferTokenParts(token);if(parts?.type==="resource"&&Number.isFinite(message.playerCount)){player[parts.id]=Math.max(0,Math.floor(Number(message.playerCount)));updateInventoryUi();updateHotbar();saveLocalCharacterState(true);}else if(parts?.type==="item")applyInventoryTransferDelta(token,-Math.max(1,Math.floor(Number(message.amount)||1)));}

function updateNearbyChestContext() {
  const target = (player.isDead || shopOpen || beachQuestOpen)
    ? null
    : nearbyChestContextTarget();
  const nextId = target?.id || null;
  if (nextId === nearbyChestContextId) {
    updateChestHudButton();
    return;
  }

  const previousId = nearbyChestContextId;
  nearbyChestContextId = nextId;
  chestContextBusyId = null;

  if (activeChestContextId && activeChestContextId !== nextId) {
    closeChestContext(true, "range");
  } else if (pendingChestContextId && pendingChestContextId !== nextId) {
    pendingChestContextId = null;
  }

  updateChestHudButton();

  // Entering the one-tile proximity zone auto-opens the Chest context once.
  // Closing/switching to Craft while remaining beside the same chest does not
  // immediately reopen it; walking away and back creates the next auto-open.
  if (nextId && nextId !== previousId) {
    requestChestContextOpen(nextId, true);
  }
}

function setCraftingOpen(open) {
  // Craft and Chest occupy one shared context-panel space. Inventory remains a
  // separate live overlay and can stay open alongside either context.
  const nextOpen = Boolean(open);
  if (nextOpen && chestContextOpen) closeChestContext(true, "craft");
  craftingOpen = nextOpen;

  if (craftingOpen && shopOpen) setShopOpen(false);

  const hudButton = document.getElementById("craftHudButton");
  hudButton?.classList.toggle("active", craftingOpen);
  hudButton?.setAttribute("aria-pressed", craftingOpen ? "true" : "false");

  if (craftingOpen) updateCraftingUi();
  syncContextOverlayVisibility();
  if (inventoryOpen) syncInventoryOverlayToViewport();
}

window.addEventListener("resize", () => {
  if (craftingOpen || chestContextOpen) syncCraftPanelToViewport();
}, { passive: true });
window.visualViewport?.addEventListener("resize", () => {
  if (craftingOpen || chestContextOpen) syncCraftPanelToViewport();
}, { passive: true });

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
  const shopButton = document.getElementById("beachQuestShop");
  const questNpcType = message.questNpcType === "greenWitch" ? "greenWitch" : "beachGirl";
  if (title) title.textContent = message.questName || "Crab Beach";
  if (dialogue) dialogue.textContent = message.dialogue || "The surf is nice today.";
  if (npcImage) {
    npcImage.src = questNpcType === "greenWitch" ? greenWitchNpcImage.src : beachGirlNpcImage.src;
    npcImage.alt = questNpcType === "greenWitch" ? "Myrtle" : "Sunny";
  }
  if (shopButton) {
    shopButton.hidden = questNpcType !== "greenWitch";
    shopButton.dataset.shopVendor = questNpcType === "greenWitch" ? "myrtle" : "";
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

function interactWithMyrtle(npc = null) {
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


  if (interaction.kind === "placedNpc") {
    if (interaction.npcType === "beachGirl") {
      interactWithBeachGirl();
      return true;
    }
    if (interaction.npcType === "greenWitch") {
      interactWithMyrtle(interaction.npc);
      return true;
    }
    if (interaction.npcType === "camoGuy") {
      interactWithCamoNpc(interaction.npc);
      return true;
    }
  }


  return false;
}

// Equipment progression is intentionally simple: gear can have an optional level gate.
const EQUIPMENT_LEVEL_REQUIREMENTS = Object.freeze({
  hat_jester: 20,
  shirt_jester: 20,
  pants_jester: 20,
  hat_arcanist: 10,
  shirt_arcanist: 10,
  pants_arcanist: 10,
  hat_ranger: 10,
  shirt_ranger: 10,
  pants_ranger: 10,
  weapon_sapgemWand: 10,
  weapon_lostKey: 15,
  weapon_hugeSunflower: 20,
  weapon_dreamcatcher: 20,
  hat_greencap: 5,
  shirt_greencap: 5,
  pants_greencap: 5
});

function equipmentRequiredLevel(itemId) {
  return Math.max(0, Number(EQUIPMENT_LEVEL_REQUIREMENTS[itemId]) || 0);
}

function equipmentMissingRequirements(itemId) {
  const requiredLevel = equipmentRequiredLevel(itemId);
  return requiredLevel > 0 && Number(player.level) < requiredLevel
    ? [`Requires Lv ${requiredLevel}`]
    : [];
}

function equipmentItemCanBeEquipped(itemId) {
  return Boolean(itemId) && equipmentMissingRequirements(itemId).length === 0;
}

function armorItemCanBeEquipped(itemId) {
  return equipmentItemCanBeEquipped(itemId);
}

function showEquipmentRestriction(itemId) {
  const missing = equipmentMissingRequirements(itemId);
  if (!missing.length) return;
  spawnFloatingText(player.x, player.y - 31, missing.join(" · ").toUpperCase(), "#ffb4bc", 0.9);
}


function shopCategoryForItem(item) {
  if (!item?.id) return "common";
  if (item.id === "arrows") return "consumables";
  if (WEAPON_ITEM_IDS.includes(item.id)) return "weapons";
  if (HAT_ITEM_IDS.includes(item.id) || SHIRT_ITEM_IDS.includes(item.id) || PANTS_ITEM_IDS.includes(item.id) || CHARM_ITEM_IDS.includes(item.id)) return "armor";
  return "common";
}

function weaponTypeForShopItem(itemId) {
  if (["weapon_bow", "weapon_dreamcatcher"].includes(itemId)) return "Bow";
  if (["weapon_wand", "weapon_rainWand", "weapon_shepherdStaff", "weapon_lostKey", "weapon_hugeSunflower", "weapon_sapgemWand"].includes(itemId)) return "Wand";
  if (itemId === "weapon_axe") return "Axe";
  if (itemId === "weapon_pickaxe") return "Pickaxe";
  if (itemId === "weapon_katana") return "Katana";
  if (itemId === "weapon_tigerPaw") return "Hurl";
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
  const requiredLevel = equipmentRequiredLevel(itemId);
  const weaponProfile = weaponCombatProfileForItemId(itemId);

  if (weaponProfile) {
    const rows = [];
    if ((Number(weaponProfile.attackPower) || 0) > 0) {
      rows.push(["Attack Power", `${weaponProfile.attackPower}`]);
    }
    if ((Number(weaponProfile.magicPower) || 0) > 0) {
      rows.push(["Magic Power", `${weaponProfile.magicPower}`]);
    }
    if (itemId === "weapon_tigerPaw") {
      rows.push(["Primary", "Grab / throw mobs"]);
    }
    const weaponIndex = WEAPON_ITEM_IDS.indexOf(itemId);
    const isBowWeapon = typeof COMBAT_BALANCE.isBowWeaponIndex === "function"
      ? COMBAT_BALANCE.isBowWeaponIndex(weaponIndex)
      : weaponIndex === 6 || weaponIndex === 7;
    if (!isBowWeapon) {
      const speedLabel = COMBAT_BALANCE.weaponAttackSpeedLabel(weaponIndex);
      rows.push(["Attack Speed", speedLabel]);
    }
    if (requiredLevel > 0) rows.push(["Required Lv", `${requiredLevel}`]);

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
        ...(requiredLevel > 0 ? [["Required Lv", `${requiredLevel}`]] : [])
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
  if (node?.closest?.("#inventoryOverlay")) return null;
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
  if (item.id === "arrows") return "Ammo · 50 arrows per purchase";

  const armor = armorRatingForItemId(item.id);
  const resist = armorResistForItemId(item.id);
  const requiredLevel = equipmentRequiredLevel(item.id);
  const requirement = requiredLevel > 0 ? ` · Lv ${requiredLevel}` : "";

  if (WEAPON_ITEM_IDS.includes(item.id)) {
    const weaponType = weaponTypeForShopItem(item.id);
    const profile = weaponCombatProfileForItemId(item.id);
    const power = [];
    if ((Number(profile?.attackPower) || 0) > 0) power.push(`ATK ${profile.attackPower}`);
    if ((Number(profile?.magicPower) || 0) > 0) power.push(`MAG ${profile.magicPower}`);
    return `${weaponType}${power.length ? ` · ${power.join(" · ")}` : ""}${requirement}`;
  }

  if (HAT_ITEM_IDS.includes(item.id)) return `Head Armor · Armor ${armor} · Resist ${resist}${requirement}`;
  if (SHIRT_ITEM_IDS.includes(item.id)) return `Torso Armor · Armor ${armor} · Resist ${resist}${requirement}`;
  if (PANTS_ITEM_IDS.includes(item.id)) return `Leg Armor · Armor ${armor} · Resist ${resist}${requirement}`;
  if (CHARM_ITEM_IDS.includes(item.id)) return `Charm · Armor ${armor} · Resist ${resist}${requirement}`;
  return requiredLevel > 0 ? `Lv ${requiredLevel}` : "Common";
}

const HURL_GRAB_RANGE = 22;




















































function expNeededForLevel(level) {
  // Quick early progression for testing: 5, 7, 9, 11...
  return 5 + (level - 1) * 2;
}


function awardExp(amount) {
  player.exp += amount;

  let levelsGained = 0;

  while (player.exp >= player.expToNext) {
    player.exp -= player.expToNext;
    player.level += 1;
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



let remotePlayerDrawDepth = 0;
// v387: declare build-selection state before any startup UI helper can read it.
// Hotbar setup runs before the lower building helper section initializes.
let selectedBuildPiece = null;

function heldBuildPieceForCurrentDraw() {
  return remotePlayerDrawDepth > 0
    ? (typeof player.heldBuildPiece === "string" ? player.heldBuildPiece : null)
    : selectedBuildPiece;
}

function equippedWeapon() {
  // v408: build/held presentation is replicated as durable change-only player
  // state. Local and remote players therefore use the same held-item rule.
  if (heldBuildPieceForCurrentDraw()) return null;

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
  if (fireballIsAiming() || player.rainCloudCasting) return false;
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
    showEquipmentRestriction(itemId);
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

  if (!itemId || hotbarItemInventoryCount(itemId) <= 0) {
    return false;
  }

  if (BUILD_HOTBAR_ITEMS.includes(itemId)) {
    return beginBuildPlacement(itemId);
  }

  if (selectedBuildPiece) cancelBuildPlacement(true);
  return equipWeaponIndex(
    weaponIndexForItemId(itemId)
  );
}

function nextOccupiedHotbarSlot(direction) {
  sanitizeHotbarAssignments();

  const occupied = [];
  for (let i = 0; i < HOTBAR_SLOT_COUNT; i++) {
    const itemId = player.hotbarAssignments[i];
    if (itemId && hotbarItemInventoryCount(itemId) > 0) {
      occupied.push(i);
    }
  }

  if (!occupied.length) return -1;

  const equippedItemId = weaponItemIdForIndex(player.weaponIndex);
  const currentItemId = selectedBuildPiece || equippedItemId;
  const currentSlot = currentItemId ? hotbarSlotForItem(currentItemId) : -1;

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

function hotbarActionIdForItemId(itemId) {
  if (itemId === "weapon_wand") return "fireball";
  if (itemId === "weapon_rainWand") return "rainCloud";
  return null;
}

function updateHotbarActionCooldownSlot(slot, itemId, available) {
  if (!slot) return;
  const itemActionId = hotbarActionIdForItemId(itemId);
  const cooldownRemaining = available && itemActionId
    ? Math.max(0, actionCooldownRemaining(itemActionId))
    : 0;
  const cooldownDuration = itemActionId
    ? Math.max(0.001, actionCooldownDuration(itemActionId))
    : 1;
  const cooldownMask = slot.querySelector(".utility-cooldown-mask");
  const cooldownText = slot.querySelector(".utility-cooldown-text");

  if (cooldownMask) {
    cooldownMask.style.height = cooldownRemaining > 0
      ? `${Math.min(100, cooldownRemaining / cooldownDuration * 100)}%`
      : "0%";
  }
  if (cooldownText) {
    cooldownText.textContent = cooldownRemaining > 0
      ? cooldownRemaining.toFixed(1)
      : "";
  }
  slot.classList.toggle("cooling-down", cooldownRemaining > 0);
}

function updateHotbarActionCooldownHud() {
  for (let slotIndex = 0; slotIndex < HOTBAR_SLOT_COUNT; slotIndex++) {
    const slot = document.getElementById(`slot${slotIndex + 1}`);
    if (!slot) continue;
    const itemId = player.hotbarAssignments?.[slotIndex] || null;
    const available = Boolean(
      itemId &&
      hotbarAssignmentCanPersist(itemId) &&
      hotbarItemInventoryCount(itemId) > 0
    );
    updateHotbarActionCooldownSlot(slot, itemId, available);
  }
}

function updateHotbar() {
  sanitizeHotbarAssignments();

  const equippedItemId = weaponItemIdForIndex(player.weaponIndex);

  for (let slotIndex = 0; slotIndex < HOTBAR_SLOT_COUNT; slotIndex++) {
    const slot = document.getElementById(`slot${slotIndex + 1}`);
    if (!slot) continue;

    const itemId = player.hotbarAssignments[slotIndex];
    const assigned = Boolean(itemId && hotbarAssignmentCanPersist(itemId));
    const available = assigned && hotbarItemInventoryCount(itemId) > 0;
    const image = slot.querySelector(".hotbar-item-img");

    slot.classList.toggle("active", available && (selectedBuildPiece ? selectedBuildPiece === itemId : equippedItemId === itemId));
    slot.classList.remove("cooling-down", "buff-active");
    slot.draggable = Boolean(inventoryOpen && assigned && available);

    if (image) {
      image.classList.toggle(
        "build-hotbar-upright",
        assigned && BUILD_HOTBAR_ITEMS.includes(itemId)
      );
      if (assigned) {
        const itemImage = hotkeyImageForItemId(itemId);
        if (itemImage) image.src = itemImage.src;
        image.alt = hotbarItemDisplayName(itemId);
        image.style.visibility = "visible";
        slot.title = `${hotbarItemDisplayName(itemId)} · key ${hotbarKeyLabel(slotIndex)} · ${inventoryOpen ? "drag to move/swap · " : ""}${BUILD_HOTBAR_ITEMS.includes(itemId) ? "click to build" : "click to equip"}`;
      } else {
        image.removeAttribute("src");
        image.alt = "";
        image.style.visibility = "hidden";
        slot.title = `Empty weapon/tool hotkey ${hotbarKeyLabel(slotIndex)}`;
      }
    }

    const countBadge = slot.querySelector(".utility-count");
    if (countBadge) {
      countBadge.textContent = assigned
        ? String(hotbarItemInventoryCount(itemId))
        : "";
    }
    updateHotbarActionCooldownSlot(slot, itemId, available);
    slot.style.opacity = assigned ? (available ? "1" : "0.5") : "0.48";
  }

}

let inventoryOpen = false;
let shopOpen = false;
let craftingOpen = false;
let chestContextOpen = false;
let nearbyChestContextId = null;
let activeChestContextId = null;
let pendingChestContextId = null;
let chestContextBusyId = null;
let chestContextItems = [];
let chestContextSlotLimit = 5;
let chestTakePendingItemId = null;
let chestTakeAllPending = false;
let chestStorePendingToken = null;
let draggingChestItemId = null;
let draggingInventoryToken = null;
let inventoryDropPendingToken = null;
let inventoryDropDraft = null;
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
  if (style === "tigerPaw") return "Tiger Paw";
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
  if (index === 13) return tigerPawImage;
  return swordImage;
}

// -----------------------------------------------------------------------------
// v422 LIVE INVENTORY OVERLAY
// -----------------------------------------------------------------------------
let selectedOverlayInventoryToken = null;

const INVENTORY_RESOURCE_META = Object.freeze({
  coins: Object.freeze({ name: "Coin", type: "Currency", hint: "Currency used by shops." }),
  wood: Object.freeze({ name: "Wood", type: "Resource", hint: "Harvested from trees and used in crafting." }),
  stone: Object.freeze({ name: "Stone", type: "Resource", hint: "Mined from rocks and used in crafting." }),
  whiteFlowers: Object.freeze({ name: "White Flower", type: "Resource", hint: "A crafting ingredient." }),
  blueFlowers: Object.freeze({ name: "Blue Flower", type: "Resource", hint: "A crafting ingredient." }),
  goldSlimeBubbles: Object.freeze({ name: "Gold Slime Bubble", type: "Loot", hint: "Rare slime loot." }),
  greenJellyCubes: Object.freeze({ name: "Green Jelly Cube", type: "Loot", hint: "Slime material used in crafting." }),
  healingPotions: Object.freeze({ name: "Healing Potion", type: "Consumable", hint: "Restores 20 HP." }),
  attackPotions: Object.freeze({ name: "Attack Potion", type: "Consumable", hint: "+15% physical damage for 5 minutes." }),
  magicPotions: Object.freeze({ name: "Magic Potion", type: "Consumable", hint: "+15% magic damage for 5 minutes." }),
  arrows: Object.freeze({ name: "Arrows", type: "Ammunition", hint: "Ammunition for bows." }),
  woodFloors: Object.freeze({ name: "Wood Floor", type: "Building", hint: "Drag to the hotbar to place it." }),
  stoneFloors: Object.freeze({ name: "Stone Floor", type: "Building", hint: "Drag to the hotbar to place it." }),
  woodWalls: Object.freeze({ name: "Wood Wall", type: "Building", hint: "Drag to the hotbar to place it." }),
  woodDoors: Object.freeze({ name: "Wood Door", type: "Building", hint: "Drag to the hotbar to place it." }),
  torches: Object.freeze({ name: "Torch", type: "Building / Light", hint: "Drag to the hotbar to hold or place it." }),
  chests: Object.freeze({ name: "Chest", type: "Building", hint: "Drag to the hotbar to place it." }),
  craftingTables: Object.freeze({ name: "Crafting Table", type: "Building / Workstation", hint: "Drag to the hotbar to place it." })
});

function inventoryOverlayCellToken(element) {
  if (!element) return null;
  if (element.dataset.resourceKey) return `resource:${element.dataset.resourceKey}`;
  if (element.dataset.ownedItem) return `item:${element.dataset.ownedItem}`;
  return null;
}

function inventoryTransferTokenParts(token) {
  const clean = typeof token === "string" ? token : "";
  if (clean.startsWith("resource:")) { const id = clean.slice(9); return Object.prototype.hasOwnProperty.call(INVENTORY_RESOURCE_META, id) ? { type: "resource", id, token: clean } : null; }
  if (clean.startsWith("item:")) { const id = clean.slice(5); return ALL_EQUIPMENT_ITEM_IDS.has(id) ? { type: "item", id, token: clean } : null; }
  return null;
}
function inventoryTransferCount(token) { const parts = inventoryTransferTokenParts(token); if (!parts) return 0; return parts.type === "resource" ? Math.max(0, Math.floor(Number(player[parts.id]) || 0)) : inventoryItemCount(parts.id); }
function inventoryTransferName(token) { const parts = inventoryTransferTokenParts(token); if (!parts) return "Item"; return parts.type === "resource" ? (INVENTORY_RESOURCE_META[parts.id]?.name || parts.id) : (itemDetailData(parts.id)?.name || itemDisplayNameForId(parts.id)); }
function inventoryTransferImageForToken(token) {
  const cell = inventoryOverlayCellForToken(token); const image = cell?.querySelector("img"); if (image?.src) return image;
  const parts = inventoryTransferTokenParts(token); if (!parts) return null;
  if (parts.type === "item") return shopImageForItemId(parts.id);
  if (parts.id === "coins") return coinImage; if (parts.id === "wood") return woodImage; if (parts.id === "stone") return typeof rockLootableImage !== "undefined" ? rockLootableImage : null;
  if (parts.id === "arrows") return arrowResourceImage; if (parts.id === "healingPotions") return healingPotionImage; if (parts.id === "attackPotions") return attackPotionImage; if (parts.id === "magicPotions") return magicPotionImage; return null;
}
function applyInventoryTransferDelta(token, delta, options = {}) {
  const parts = inventoryTransferTokenParts(token); if (!parts || !Number.isFinite(Number(delta)) || Number(delta) === 0) return false; const amount = Math.trunc(Number(delta));
  if (parts.type === "resource") player[parts.id] = Math.max(0, Math.floor(Number(player[parts.id]) || 0) + amount);
  else {
    const next = Math.max(0, inventoryItemCount(parts.id) + amount); player.items[parts.id] = next;
    if (next <= 0) { delete player.items[parts.id]; for (let i=0;i<player.hotbarAssignments.length;i++) if (player.hotbarAssignments[i] === parts.id) player.hotbarAssignments[i] = null; if (weaponItemIdForIndex(player.weaponIndex) === parts.id) player.weaponIndex = -1; if (HAT_ITEM_IDS[player.hatIndex] === parts.id) player.hatIndex=-1; if (SHIRT_ITEM_IDS[player.shirtIndex] === parts.id) player.shirtIndex=-1; if (PANTS_ITEM_IDS[player.pantsIndex] === parts.id) player.pantsIndex=-1; if (CHARM_ITEM_IDS[player.charmIndex] === parts.id) player.charmIndex=-1; }
    else if (amount > 0 && options.autoAssign) autoAssignHotbarItem(parts.id);
  }
  sanitizeHotbarAssignments(); updateInventoryUi(); updateHotbar(); saveLocalCharacterState(true); return true;
}

function inventoryOverlayCellForToken(token) {
  if (!token) return null;
  for (const element of document.querySelectorAll("#inventoryPage .menu-item")) {
    if (inventoryOverlayCellToken(element) === token) return element;
  }
  return null;
}

function inventoryOverlayCellCount(element) {
  if (!element) return 0;
  if (element.dataset.resourceKey) return Math.max(0, Math.floor(Number(player[element.dataset.resourceKey]) || 0));
  if (element.dataset.ownedItem) return Math.max(0, inventoryItemCount(element.dataset.ownedItem));
  return 0;
}

function inventoryOverlayCellName(element) {
  if (!element) return "Select an item";
  const resourceMeta = INVENTORY_RESOURCE_META[element.dataset.resourceKey];
  if (resourceMeta?.name) return resourceMeta.name;
  const itemId = element.dataset.ownedItem;
  if (itemId) {
    const detail = itemDetailData(itemId);
    if (detail?.name) return detail.name;
    const label = element.querySelector("img")?.alt || element.querySelector("span")?.textContent;
    if (label) return label.trim();
    return itemDisplayNameForId(itemId);
  }
  return element.querySelector("img")?.alt || "Item";
}

function equipmentSlotForInventoryItem(itemId) {
  if (HAT_ITEM_IDS.includes(itemId)) return "head";
  if (SHIRT_ITEM_IDS.includes(itemId)) return "shirt";
  if (PANTS_ITEM_IDS.includes(itemId)) return "pants";
  if (CHARM_ITEM_IDS.includes(itemId)) return "charm";
  return null;
}

function inventoryOverlayCellInfo(element) {
  if (!element) return null;
  const itemId = element.dataset.ownedItem || null;
  const resourceKey = element.dataset.resourceKey || null;
  const detail = itemId ? itemDetailData(itemId) : null;
  const meta = resourceKey ? INVENTORY_RESOURCE_META[resourceKey] : null;
  const equipmentSlot = equipmentSlotForInventoryItem(itemId);
  const hotbarAssignable = Boolean(itemId && hotbarItemCanBeAssigned(itemId));
  const consumableId = element.dataset.consumableItem || null;
  const count = inventoryOverlayCellCount(element);
  const image = element.querySelector("img");

  let hint = meta?.hint || "Inventory item.";
  if (equipmentSlot) hint = `Drag to the ${equipmentSlot === "head" ? "Head" : equipmentSlot === "shirt" ? "Shirt" : equipmentSlot === "pants" ? "Pants" : "Charm"} slot.`;
  else if (hotbarAssignable) hint = "Drag to the actual hotbar to assign it.";

  return {
    token: inventoryOverlayCellToken(element),
    itemId,
    resourceKey,
    consumableId,
    equipmentSlot,
    hotbarAssignable,
    count,
    name: detail?.name || meta?.name || inventoryOverlayCellName(element),
    type: detail?.type || meta?.type || (itemId ? "Item" : "Resource"),
    rows: detail?.rows || [],
    hint,
    imageSrc: image?.src || ""
  };
}

function renderInventoryOverlaySelection() {
  const name = document.getElementById("inventoryDetailName");
  const type = document.getElementById("inventoryDetailType");
  const quantity = document.getElementById("inventoryDetailQuantity");
  const hint = document.getElementById("inventoryDetailHint");
  const icon = document.getElementById("inventoryDetailIcon");
  const stats = document.getElementById("inventoryDetailStats");
  const action = document.getElementById("inventoryDetailAction");

  document.querySelectorAll("#inventoryPage .menu-item.inventory-selected").forEach(element => {
    element.classList.remove("inventory-selected");
  });

  let element = inventoryOverlayCellForToken(selectedOverlayInventoryToken);
  if (element && (element.style.display === "none" || inventoryOverlayCellCount(element) <= 0)) {
    selectedOverlayInventoryToken = null;
    element = null;
  }

  if (!element) {
    if (name) name.textContent = "Select an item";
    if (type) type.textContent = "Inventory";
    if (quantity) quantity.textContent = "Quantity 0";
    if (hint) hint.textContent = "Click an item to inspect it.";
    if (icon) { icon.removeAttribute("src"); icon.alt = ""; }
    if (stats) stats.innerHTML = "";
    if (action) { action.hidden = true; delete action.dataset.consumableItem; }
    return;
  }

  element.classList.add("inventory-selected");
  const info = inventoryOverlayCellInfo(element);
  if (!info) return;

  if (name) name.textContent = info.name;
  if (type) type.textContent = info.type;
  if (quantity) quantity.textContent = `Quantity ${info.count}`;
  if (hint) hint.textContent = info.hint;
  if (icon) {
    if (info.imageSrc) icon.src = info.imageSrc;
    else icon.removeAttribute("src");
    icon.alt = info.name;
  }
  if (stats) {
    stats.innerHTML = info.rows.map(([label, value]) =>
      `<div class="inventory-detail-stat"><span>${label}</span><strong>${value}</strong></div>`
    ).join("");
  }
  if (action) {
    const canUse = Boolean(info.consumableId && consumableCount(info.consumableId) > 0);
    action.hidden = !canUse;
    if (canUse) {
      action.textContent = "USE";
      action.dataset.consumableItem = info.consumableId;
    } else {
      delete action.dataset.consumableItem;
    }
  }
}

function selectInventoryOverlayCell(element) {
  const token = inventoryOverlayCellToken(element);
  if (!token) return false;
  selectedOverlayInventoryToken = token;
  const itemId = element.dataset.ownedItem || null;
  selectedHotbarInventoryItemId = itemId && hotbarItemCanBeAssigned(itemId) ? itemId : null;
  renderInventoryOverlaySelection();
  return true;
}

function equipInventoryArmorItemToSlot(itemId, slot) {
  if (!itemId || !slot || inventoryItemCount(itemId) <= 0) return false;
  if (equipmentSlotForInventoryItem(itemId) !== slot) return false;
  if (!armorItemCanBeEquipped(itemId)) {
    showEquipmentRestriction(itemId);
    return false;
  }

  if (slot === "head") player.hatIndex = HAT_ITEM_IDS.indexOf(itemId);
  else if (slot === "shirt") player.shirtIndex = SHIRT_ITEM_IDS.indexOf(itemId);
  else if (slot === "pants") player.pantsIndex = PANTS_ITEM_IDS.indexOf(itemId);
  else if (slot === "charm") player.charmIndex = CHARM_ITEM_IDS.indexOf(itemId);
  else return false;

  updateInventoryUi();
  saveLocalCharacterState(true);
  return true;
}

function unequipInventoryArmorSlot(slot) {
  if (slot === "head") player.hatIndex = -1;
  else if (slot === "shirt") player.shirtIndex = -1;
  else if (slot === "pants") player.pantsIndex = -1;
  else if (slot === "charm") player.charmIndex = -1;
  else return false;
  updateInventoryUi();
  saveLocalCharacterState(true);
  return true;
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
  const greenJellyCubeCount = document.getElementById("inventoryGreenJellyCubeCount");
  const arrowCount = document.getElementById("inventoryArrowCount");
  const woodFloorCount = document.getElementById("inventoryWoodFloorCount");
  const stoneFloorCount = document.getElementById("inventoryStoneFloorCount");
  const woodWallCount = document.getElementById("inventoryWoodWallCount");
  const woodDoorCount = document.getElementById("inventoryWoodDoorCount");
  const torchCount = document.getElementById("inventoryTorchCount");
  const chestCount = document.getElementById("inventoryChestCount");
  const craftingTableCount = document.getElementById("inventoryCraftingTableCount");
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
  if (greenJellyCubeCount) greenJellyCubeCount.textContent = `${player.greenJellyCubes}`;
  if (arrowCount) arrowCount.textContent = `${player.arrows}`;
  if (woodFloorCount) woodFloorCount.textContent = `${player.woodFloors}`;
  if (stoneFloorCount) stoneFloorCount.textContent = `${player.stoneFloors}`;
  if (woodWallCount) woodWallCount.textContent = `${player.woodWalls}`;
  if (woodDoorCount) woodDoorCount.textContent = `${player.woodDoors}`;
  if (torchCount) torchCount.textContent = `${player.torches}`;
  if (chestCount) chestCount.textContent = `${player.chests}`;
  if (craftingTableCount) craftingTableCount.textContent = `${player.craftingTables}`;
  if (arrowHudCount) arrowHudCount.textContent = `${Math.max(0, Math.floor(Number(player.arrows) || 0))}`;
  if (arrowHud) {
    arrowHud.style.display = equippedWeapon() === "bow" ? "flex" : "none";
  }
  updateHotbarInventoryCountBadges();

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
  updateInventoryResourceGroup("inventoryBuildingGrid", "inventoryBuildingEmpty");

  document.querySelectorAll('#inventoryPage [data-utility-hotbar-assignable="true"]').forEach(element => {
    const itemId = element.dataset.utilityItem;
    const eligible = consumableCount(itemId) > 0;
    element.classList.remove("hotbar-selected");
    element.classList.toggle("hotbar-ineligible", !eligible);
    element.draggable = false;
    element.title = eligible
      ? `${utilityItemDisplayName(itemId)} · click/tap to use`
      : `${utilityItemDisplayName(itemId)} · none owned`;
  });

  function updateOwnedInventoryGroup(gridId, emptyId) {
    const grid = document.getElementById(gridId);
    if (!grid) return;

    let visibleEntries = 0;
    grid.querySelectorAll("[data-owned-item]").forEach(element => {
      const itemId = element.dataset.ownedItem;
      const count = inventoryItemCount(itemId);
      const visible = count > 0;
      element.style.display = visible ? "" : "none";

      let stackCount = element.querySelector(".inventory-stack-count");
      if (!stackCount) {
        stackCount = document.createElement("span");
        stackCount.className = "inventory-stack-count";
        element.append(stackCount);
      }
      stackCount.textContent = `${count}`;
      stackCount.hidden = false;

      if (visible) visibleEntries += 1;
    });

    const empty = document.getElementById(emptyId);
    if (empty) empty.style.display = visibleEntries === 0 ? "block" : "none";
  }

  updateOwnedInventoryGroup("inventoryWeaponsGrid", "inventoryWeaponsEmpty");
  updateOwnedInventoryGroup("inventoryArmorGrid", "inventoryArmorEmpty");
  updateOwnedInventoryGroup("inventoryAccessoriesGrid", "inventoryAccessoriesEmpty");

  document.querySelectorAll("#inventoryPage .menu-item").forEach(element => {
    element.draggable = element.style.display !== "none" && inventoryOverlayCellCount(element) > 0;
  });

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
          hotbarKeyLabel(slotIndex);
      } else {
        delete element.dataset.hotbarSlotLabel;
      }
    });

  const hatStyle = currentHatStyle();
  const shirtStyle = currentShirtStyle();
  const pantsStyle = currentPantsStyle();

  const equippedHatImg = document.getElementById("equippedHatImg");
  const equippedHatName = document.getElementById("equippedHatName");
  const equippedShirtImg = document.getElementById("equippedShirtImg");
  const equippedShirtName = document.getElementById("equippedShirtName");
  const equippedPantsImg = document.getElementById("equippedPantsImg");
  const equippedPantsName = document.getElementById("equippedPantsName");
  const equippedCharmImg = document.getElementById("equippedCharmImg");
  const equippedCharmName = document.getElementById("equippedCharmName");

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
  if (equippedCharmName) {
    equippedCharmName.textContent = player.charmIndex >= 0
      ? itemDisplayNameForId(CHARM_ITEM_IDS[player.charmIndex])
      : "Empty";
  }

  const equippedItemBySlot = {
    head: player.hatIndex >= 0 ? HAT_ITEM_IDS[player.hatIndex] : null,
    shirt: player.shirtIndex >= 0 ? SHIRT_ITEM_IDS[player.shirtIndex] : null,
    pants: player.pantsIndex >= 0 ? PANTS_ITEM_IDS[player.pantsIndex] : null,
    charm: player.charmIndex >= 0 ? CHARM_ITEM_IDS[player.charmIndex] : null
  };
  document.querySelectorAll("#equipmentPage .equipped-box[data-equipment-slot]").forEach(box => {
    const itemId = equippedItemBySlot[box.dataset.equipmentSlot] || null;
    if (itemId) box.dataset.itemDetailId = itemId;
    else delete box.dataset.itemDetailId;
  });

  renderInventoryOverlaySelection();
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
    const count = Math.max(0, Math.min(999999, Math.floor(Number(items[itemId]) || 0)));
    if (count > 0) output[itemId] = count;
  }
  return output;
}

function buildLocalCharacterSave() {
  const story = {};
  for (const key of [
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


  return {
    version: LOCAL_CHARACTER_SAVE_VERSION,
    savedAt: Date.now(),
    worldGridDiscovery: Array.from(worldGridDiscoveredCells).sort(),

    level: clampLocalSaveInteger(player.level, 1, 99, 1),
    exp: Math.max(0, Math.floor(Number(player.exp) || 0)),


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
      greenJellyCubes: Math.max(0, Math.floor(Number(player.greenJellyCubes) || 0)),
      arrows: Math.max(0, Math.floor(Number(player.arrows) || 0)),
      woodFloors: Math.max(0, Math.floor(Number(player.woodFloors) || 0)),
      stoneFloors: Math.max(0, Math.floor(Number(player.stoneFloors) || 0)),
      woodWalls: Math.max(0, Math.floor(Number(player.woodWalls) || 0)),
      woodDoors: Math.max(0, Math.floor(Number(player.woodDoors) || 0)),
      torches: Math.max(0, Math.floor(Number(player.torches) || 0)),
      chests: Math.max(0, Math.floor(Number(player.chests) || 0)),
      craftingTables: Math.max(0, Math.floor(Number(player.craftingTables) || 0))
    },

    items: validSavedItemIds(player.items),

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
    buffs: {
      attackRemainingMs: Math.max(0, (Number(player.attackPotionUntil) || 0) - Date.now()),
      magicRemainingMs: Math.max(0, (Number(player.magicPotionUntil) || 0) - Date.now()),
      healingPotionCooldownRemainingMs: Math.max(0, (Number(player.healingPotionCooldownUntil) || 0) - Date.now()),
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

  worldGridDiscoveredCells.clear();
  for (const key of Array.isArray(save.worldGridDiscovery) ? save.worldGridDiscovery : []) {
    if (/^-?\d+,-?\d+$/.test(String(key))) {
      worldGridDiscoveredCells.add(String(key));
    }
  }
  // The world-grid origin is always known even for saves created before the v378 minimap.
  worldGridDiscoveredCells.add(worldGridCellKey(0, 0));

  player.level = clampLocalSaveInteger(save.level, 1, 99, 1);
  player.expToNext = expNeededForLevel(player.level);
  player.exp = clampLocalSaveInteger(save.exp, 0, Math.max(0, player.expToNext - 1), 0);

  player.coins = clampLocalSaveInteger(save.resources?.coins, 0, 999999, 0);
  player.wood = clampLocalSaveInteger(save.resources?.wood, 0, 999999, 0);
  player.stone = clampLocalSaveInteger(save.resources?.stone, 0, 999999, 0);
  player.whiteFlowers = clampLocalSaveInteger(save.resources?.whiteFlowers, 0, 999999, 0);
  player.blueFlowers = clampLocalSaveInteger(save.resources?.blueFlowers, 0, 999999, 0);
  player.healingPotions = clampLocalSaveInteger(save.resources?.healingPotions, 0, 999999, 0);
  player.attackPotions = clampLocalSaveInteger(save.resources?.attackPotions, 0, 999999, 0);
  player.magicPotions = clampLocalSaveInteger(save.resources?.magicPotions, 0, 999999, 0);
  const saveNow = Date.now();
  player.attackPotionUntil = saveNow + Math.min(POTION_BUFF_MS, clampLocalSaveInteger(save.buffs?.attackRemainingMs, 0, POTION_BUFF_MS, 0));
  player.magicPotionUntil = saveNow + Math.min(POTION_BUFF_MS, clampLocalSaveInteger(save.buffs?.magicRemainingMs, 0, POTION_BUFF_MS, 0));
  player.healingPotionCooldownUntil = saveNow + Math.min(HEALING_POTION_COOLDOWN_MS, clampLocalSaveInteger(
    save.buffs?.healingPotionCooldownRemainingMs,
    0,
    HEALING_POTION_COOLDOWN_MS,
    0
  ));
  player.attackPotionCooldownUntil = saveNow + Math.min(BUFF_POTION_COOLDOWN_MS, clampLocalSaveInteger(save.buffs?.attackPotionCooldownRemainingMs, 0, BUFF_POTION_COOLDOWN_MS, 0));
  player.magicPotionCooldownUntil = saveNow + Math.min(BUFF_POTION_COOLDOWN_MS, clampLocalSaveInteger(save.buffs?.magicPotionCooldownRemainingMs, 0, BUFF_POTION_COOLDOWN_MS, 0));
  player.goldSlimeBubbles = clampLocalSaveInteger(save.resources?.goldSlimeBubbles, 0, 999999, 0);
  player.greenJellyCubes = clampLocalSaveInteger(save.resources?.greenJellyCubes, 0, 999999, 0);
  player.arrows = clampLocalSaveInteger(save.resources?.arrows, 0, 999999, 0);
  player.woodFloors = clampLocalSaveInteger(save.resources?.woodFloors, 0, 999999, 0);
  player.stoneFloors = clampLocalSaveInteger(save.resources?.stoneFloors, 0, 999999, 0);
  player.woodWalls = clampLocalSaveInteger(save.resources?.woodWalls, 0, 999999, 0);
  player.woodDoors = clampLocalSaveInteger(save.resources?.woodDoors, 0, 999999, 0);
  player.torches = clampLocalSaveInteger(save.resources?.torches, 0, 999999, 0);
  player.chests = clampLocalSaveInteger(save.resources?.chests, 0, 999999, 0);
  player.craftingTables = clampLocalSaveInteger(save.resources?.craftingTables, 0, 999999, 0);
  player.items = validSavedItemIds(save.items);
  // v431: old browser saves can no longer depend on retired tutorial handoffs.
  // Bring every migrated character up to the current starter loadout.
  for (const starterItemId of ["weapon_sword", "weapon_pickaxe", "weapon_axe"]) {
    player.items[starterItemId] = Math.max(1, Number(player.items[starterItemId]) || 0);
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

  const savedHotbarAssignments = Array.isArray(save.hotbarAssignments)
    ? save.hotbarAssignments
    : [];
  const legacyFiveSlotHotbar = savedHotbarAssignments.length > 0 && savedHotbarAssignments.length <= 5;
  player.hotbarAssignments = Array.from(
    { length: HOTBAR_SLOT_COUNT },
    (_, index) => {
      // v376 equipment lived on physical keys 4-8. Preserve those physical
      // positions during the one-time migration into the unified number-key belt.
      const sourceIndex = legacyFiveSlotHotbar ? index - 3 : index;
      const itemId = sourceIndex >= 0 ? savedHotbarAssignments[sourceIndex] : null;
      return itemId && hotbarAssignmentCanPersist(itemId)
        ? itemId
        : null;
    }
  );
  sanitizeHotbarAssignments();

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
      greenJellyCubes: player.greenJellyCubes,
      arrows: player.arrows,
      woodFloors: player.woodFloors,
      stoneFloors: player.stoneFloors,
      woodWalls: player.woodWalls,
      woodDoors: player.woodDoors,
      torches: player.torches,
      chests: player.chests,
      craftingTables: player.craftingTables
    },
    buffs: {
      attackRemainingMs: Math.max(0, (Number(player.attackPotionUntil) || 0) - Date.now()),
      magicRemainingMs: Math.max(0, (Number(player.magicPotionUntil) || 0) - Date.now()),
      healingPotionCooldownRemainingMs: Math.max(0, (Number(player.healingPotionCooldownUntil) || 0) - Date.now()),
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
    }
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
let activeShopVendor = null;

function activeVendorShopItems() {
  return SHOP_ITEMS.filter(item => item.vendor === activeShopVendor);
}

function shopVendorTitle(vendor = activeShopVendor) {
  if (vendor === "cam") return "Cam's Shop";
  if (vendor === "myrtle") return "Myrtle's Shop";
  return "Shop";
}

function openVendorShop(vendor) {
  if (!["cam", "myrtle"].includes(vendor)) return false;
  activeShopVendor = vendor;
  shopCategoryFilter = "all";
  document.querySelectorAll(".shop-tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.shopFilter === "all");
  });
  setShopOpen(true);
  return true;
}

function updateShopUi() {
  const grid = document.getElementById("shopGrid");
  const coinText = document.getElementById("shopCoinCount");
  const title = document.getElementById("shopTitle");
  const footer = document.getElementById("shopFooter");

  if (coinText) coinText.textContent = `Coins ${player.coins}`;
  if (title) title.textContent = shopVendorTitle();
  if (footer) footer.textContent = "Prices vary by item · Level requirements apply · Esc to close";
  if (!grid) return;

  grid.innerHTML = "";

  for (const item of activeVendorShopItems()) {
    const itemCategory = shopCategoryForItem(item);
    if (shopCategoryFilter !== "all" && itemCategory !== shopCategoryFilter) continue;

    const ownedCount = item.resourceKey === "arrows"
      ? Math.max(0, Math.floor(Number(player.arrows) || 0))
      : inventoryItemCount(item.id);
    const pending = player.shopPurchasePending === item.id;
    const requiredLevel = equipmentRequiredLevel(item.id);
    const levelLocked = requiredLevel > 0 && Number(player.level) < requiredLevel;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "shop-item";
    button.dataset.shopItemId = item.id;
    // Level-locked items stay clickable so the player gets a clear requirement
    // message instead of a dead-looking shop button.
    button.disabled = pending;

    const image = document.createElement("img");
    const imageObject = shopImageForItemId(item.id);
    if (imageObject) image.src = imageObject.src;
    image.alt = item.name;

    const name = document.createElement("span");
    name.className = "shop-item-name";
    name.textContent = item.name;

    const meta = document.createElement("span");
    meta.className = "shop-item-meta";
    meta.textContent = `${shopItemMetadata(item)} · Owned ${ownedCount}`;

    const price = document.createElement("span");
    price.className = "shop-item-price";
    price.textContent = levelLocked
      ? `REQUIRES LV ${requiredLevel}`
      : pending
        ? "..."
        : `${item.price} COINS`;

    button.append(image, name, meta, price);
    grid.appendChild(button);
  }
}

function setShopOpen(open) {
  shopOpen = Boolean(open && activeShopVendor);
  if (!shopOpen) hideItemDetailTooltip();

  if (shopOpen && fireballIsAiming()) cancelFireballAim();

  const overlay = document.getElementById("shopOverlay");
  if (!overlay) return;

  if (shopOpen && inventoryOpen) setInventoryOpen(false);
  if (shopOpen && craftingOpen) setCraftingOpen(false);
  if (shopOpen && chestContextOpen) closeChestContext(true, "shop");
  if (shopOpen && beachQuestOpen) setBeachQuestOpen(false);

  overlay.classList.toggle("open", shopOpen);
  overlay.setAttribute("aria-hidden", shopOpen ? "false" : "true");
  inputController.clearKeys();

  if (shopOpen) {
    inputController.clearCommands();
    if (typeof onlineClient !== "undefined" && onlineClient?.connected) onlineClient.sendLocalState(true);
    updateShopUi();
  } else {
    activeShopVendor = null;
  }
}

function tryPurchaseShopItem(itemId) {
  const item = activeVendorShopItems().find(entry => entry.id === itemId);
  if (!shopOpen || !item || player.shopPurchasePending) return;

  const requiredLevel = equipmentRequiredLevel(itemId);
  if (requiredLevel > 0 && Number(player.level) < requiredLevel) {
    spawnFloatingText(player.x, player.y - 30, `REQUIRES LV ${requiredLevel}`, "#ffe38b", 0.85);
    return;
  }

  const price = Math.max(1, Number(item.price) || 1);
  if (player.coins < price) {
    spawnFloatingText(player.x, player.y - 30, `NEED ${price} COINS`, "#ffe38b", 0.85);
    return;
  }

  if (typeof onlineClient !== "undefined" && onlineClient?.connected) {
    player.shopPurchasePending = itemId;
    if (!onlineClient.requestShopPurchase(itemId, activeShopVendor)) player.shopPurchasePending = null;
    updateShopUi();
    return;
  }

  player.coins -= price;
  if (item.resourceKey === "arrows") {
    player.arrows += Math.max(1, Number(item.outputCount) || 1);
  } else {
    grantInventoryItem(itemId, 1);
  }
  spawnFloatingText(player.x, player.y - 30, "PURCHASED!", "#ffe38b", 0.85);
  updateShopUi();
  updateInventoryUi();
  updateHotbar();
  saveLocalCharacterState(true);
}

function syncInventoryOverlayToViewport() {
  const overlay = document.getElementById("inventoryOverlay");
  const viewport = document.getElementById("gameViewport");
  if (!overlay || !viewport) return;
  const rect = viewport.getBoundingClientRect();
  overlay.style.left = `${Math.round(rect.left)}px`;
  overlay.style.top = `${Math.round(rect.top)}px`;
  overlay.style.width = `${Math.round(rect.width)}px`;
  overlay.style.height = `${Math.round(rect.height)}px`;
}

function setInventoryOpen(open) {
  // v422: Inventory/equipment is a live overlay. Opening it does not pause or
  // clear gameplay input, and Craft remains independently open if requested.
  inventoryOpen = Boolean(open);
  if (!inventoryOpen) {
    hideItemDetailTooltip();
  }

  if (inventoryOpen && shopOpen) setShopOpen(false);

  const overlay = document.getElementById("inventoryOverlay");
  if (!overlay) return;
  overlay.classList.toggle("open", inventoryOpen);
  overlay.setAttribute("aria-hidden", inventoryOpen ? "false" : "true");

  const hudButton = document.getElementById("menuHudButton");
  hudButton?.classList.toggle("active", inventoryOpen);
  hudButton?.setAttribute("aria-pressed", inventoryOpen ? "true" : "false");

  updateInventoryUi();
  updateHotbar();
  if (!inventoryOpen && inventoryDropDraft) closeInventoryDropQuantityPicker();
  if (inventoryOpen) syncInventoryOverlayToViewport();
}

window.addEventListener("resize", () => {
  if (inventoryOpen) syncInventoryOverlayToViewport();
}, { passive: true });
window.visualViewport?.addEventListener("resize", () => {
  if (inventoryOpen) syncInventoryOverlayToViewport();
}, { passive: true });

document.getElementById("menuHudButton")?.addEventListener("click", () => {
  setInventoryOpen(!inventoryOpen);
});

document.getElementById("craftHudButton")?.addEventListener("click", () => {
  setCraftingOpen(!craftingOpen);
});

document.getElementById("chestHudButton")?.addEventListener("click", () => {
  if (!nearbyChestContextId) return;
  if (chestContextOpen && activeChestContextId === nearbyChestContextId) {
    closeChestContext(true, "closed");
    return;
  }
  requestChestContextOpen(nearbyChestContextId, false);
});

window.addEventListener("wheel", event => {
  if (shopOpen || beachQuestOpen) return;
  if (!Number.isFinite(event.deltaY) || Math.abs(event.deltaY) < 1) return;
  const panel = event.target?.closest?.("#inventoryPage, #craftPanel, #chestPanel, #dropQuantityPanel");
  if (panel) { const scrollTarget = panel.id === "inventoryPage" ? document.getElementById("inventoryScroll") : panel.id === "craftPanel" ? document.getElementById("craftGrid") : panel.id === "chestPanel" ? document.getElementById("chestGrid") : null; if (scrollTarget) scrollTarget.scrollTop += event.deltaY; event.preventDefault(); return; }
  const direction=event.deltaY>0?1:-1;if(!cycleHotbarSelection(direction))return;event.preventDefault();
}, { passive: false });

const topHotbar = document.getElementById("hotbar");
// v427: the canvas owns right-click. Suppress the browser image/context menu
// so right-click never selects/saves the rendered game surface.
canvas?.addEventListener("contextmenu", event => event.preventDefault());
topHotbar?.addEventListener("click", event => {
  if (shopOpen || beachQuestOpen) return;

  const slot = event.target.closest(".hotbar-slot");
  if (!slot || !topHotbar.contains(slot)) return;

  const slotNumber = Number(String(slot.id || "").replace("slot", ""));
  if (!Number.isInteger(slotNumber)) return;

  if (slotNumber >= 1 && slotNumber <= HOTBAR_SLOT_COUNT) {
    if (inventoryOpen && selectedHotbarInventoryItemId && hotbarItemCanBeAssigned(selectedHotbarInventoryItemId)) {
      assignItemToHotbar(selectedHotbarInventoryItemId, slotNumber - 1);
      return;
    }
    inputController.queueCommand("equipWeapon", {
      index: slotNumber - 1
    });
  }
});

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

document.getElementById("chestClose")?.addEventListener("click", () => {
  closeChestContext(true, "closed");
});


document.getElementById("beachQuestClose")?.addEventListener("click", () => {
  setBeachQuestOpen(false);
});

document.getElementById("beachQuestShop")?.addEventListener("click", () => {
  setBeachQuestOpen(false);
  openVendorShop("myrtle");
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

const inventoryPageElement = document.getElementById("inventoryPage");
const chestGridElement = document.getElementById("chestGrid");
const chestPanelElement = document.getElementById("chestPanel");
function requestChestTakeToken(token) {
  if (!chestContextOpen || !activeChestContextId || chestTakePendingItemId || chestTakeAllPending || chestStorePendingToken) return false;
  if (!inventoryTransferTokenParts(token)) return false;
  chestTakePendingItemId = token;
  renderChestContextUi();
  if (!onlineClient?.requestChestTakeItem(activeChestContextId, token)) {
    chestTakePendingItemId = null;
    renderChestContextUi();
    return false;
  }
  return true;
}

function requestChestTakeAll() {
  if (!chestContextOpen || !activeChestContextId || chestTakePendingItemId || chestTakeAllPending || chestStorePendingToken) return false;
  if (normalizedChestContextItems(chestContextItems).length === 0) return false;
  chestTakeAllPending = true;
  renderChestContextUi();
  if (!onlineClient?.requestChestTakeAll(activeChestContextId)) {
    chestTakeAllPending = false;
    renderChestContextUi();
    return false;
  }
  return true;
}

function requestStoreSelectedInventoryStackInChest() {
  const token = selectedOverlayInventoryToken || "";
  const count = inventoryTransferCount(token);
  if (!chestContextOpen || !activeChestContextId || chestTakePendingItemId || chestTakeAllPending || chestStorePendingToken) return false;
  if (!inventoryTransferTokenParts(token) || count <= 0) return false;
  chestStorePendingToken = token;
  renderChestContextUi();
  if (!onlineClient?.requestChestStoreItem(activeChestContextId, token, count)) {
    chestStorePendingToken = null;
    renderChestContextUi();
    return false;
  }
  return true;
}

chestGridElement?.addEventListener("dragstart",event=>{const card=event.target.closest("[data-chest-item]");if(!card||!chestContextOpen||!activeChestContextId||chestTakePendingItemId||chestTakeAllPending||chestStorePendingToken){event.preventDefault();return;}const token=card.dataset.chestItem||"";if(!inventoryTransferTokenParts(token)){event.preventDefault();return;}draggingChestItemId=token;event.dataTransfer.effectAllowed="move";event.dataTransfer.setData("application/x-slime-chest-item",token);event.dataTransfer.setData("text/plain",token);card.classList.add("dragging");});
chestGridElement?.addEventListener("dragend",event=>{event.target.closest("[data-chest-item]")?.classList.remove("dragging");draggingChestItemId=null;inventoryPageElement?.classList.remove("chest-drop-ready");});
chestGridElement?.addEventListener("dblclick", event => {
  const card = event.target.closest("[data-chest-item]");
  if (!card || !chestGridElement.contains(card)) return;
  event.preventDefault();
  requestChestTakeToken(card.dataset.chestItem || "");
});
chestGridElement?.addEventListener("click", event => {
  if (!mobileControlsEnabled) return;
  const card = event.target.closest("[data-chest-item]");
  if (!card || !chestGridElement.contains(card)) return;
  requestChestTakeToken(card.dataset.chestItem || "");
});
document.getElementById("chestLootAll")?.addEventListener("click", requestChestTakeAll);
document.getElementById("chestStoreSelected")?.addEventListener("click", requestStoreSelectedInventoryStackInChest);
inventoryPageElement?.addEventListener("dragover",event=>{if(!draggingChestItemId||!chestContextOpen||!activeChestContextId||chestTakePendingItemId)return;event.preventDefault();event.dataTransfer.dropEffect="move";inventoryPageElement.classList.add("chest-drop-ready");});
inventoryPageElement?.addEventListener("dragleave",event=>{if(!inventoryPageElement.contains(event.relatedTarget))inventoryPageElement.classList.remove("chest-drop-ready");});
inventoryPageElement?.addEventListener("drop",event=>{if(!draggingChestItemId||!chestContextOpen||!activeChestContextId||chestTakePendingItemId||chestTakeAllPending)return;event.preventDefault();inventoryPageElement.classList.remove("chest-drop-ready");const token=event.dataTransfer.getData("application/x-slime-chest-item")||draggingChestItemId;draggingChestItemId=null;requestChestTakeToken(token);});
chestPanelElement?.addEventListener("dragover",event=>{if(!draggingInventoryToken||!chestContextOpen||!activeChestContextId||chestStorePendingToken)return;event.preventDefault();event.dataTransfer.dropEffect="move";chestPanelElement.classList.add("inventory-drop-ready");});
chestPanelElement?.addEventListener("dragleave",event=>{if(!chestPanelElement.contains(event.relatedTarget))chestPanelElement.classList.remove("inventory-drop-ready");});
chestPanelElement?.addEventListener("drop",event=>{if(!draggingInventoryToken||!chestContextOpen||!activeChestContextId||chestStorePendingToken)return;event.preventDefault();chestPanelElement.classList.remove("inventory-drop-ready");const token=event.dataTransfer.getData("application/x-slime-inventory-token")||draggingInventoryToken;draggingInventoryToken=null;const count=inventoryTransferCount(token);if(!inventoryTransferTokenParts(token)||count<=0)return;chestStorePendingToken=token;renderChestContextUi();if(!onlineClient?.requestChestStoreItem(activeChestContextId,token,count)){chestStorePendingToken=null;renderChestContextUi();}});

inventoryPageElement?.addEventListener("click", event => {
  const cell = event.target.closest(".menu-item");
  if (!cell || !inventoryPageElement.contains(cell) || cell.style.display === "none") return;
  selectInventoryOverlayCell(cell);
  if (chestContextOpen) renderChestContextUi();
});

function quickEquipArmorFromInventoryCell(cell) {
  const itemId = cell?.dataset?.ownedItem || "";
  const slot = equipmentSlotForInventoryItem(itemId);
  if (!slot) return false;
  selectInventoryOverlayCell(cell);
  return equipInventoryArmorItemToSlot(itemId, slot);
}

inventoryPageElement?.addEventListener("contextmenu", event => {
  const cell = event.target.closest(".menu-item[data-owned-item]");
  if (!cell || !inventoryPageElement.contains(cell) || !equipmentSlotForInventoryItem(cell.dataset.ownedItem)) return;
  event.preventDefault();
  quickEquipArmorFromInventoryCell(cell);
});

inventoryPageElement?.addEventListener("dblclick", event => {
  const cell = event.target.closest(".menu-item[data-owned-item]");
  if (!cell || !inventoryPageElement.contains(cell) || !equipmentSlotForInventoryItem(cell.dataset.ownedItem)) return;
  event.preventDefault();
  quickEquipArmorFromInventoryCell(cell);
});

inventoryPageElement?.addEventListener("dragstart", event => {
  const cell = event.target.closest(".menu-item");
  if (!cell || !inventoryPageElement.contains(cell) || inventoryOverlayCellCount(cell) <= 0) {
    event.preventDefault();
    return;
  }

  selectInventoryOverlayCell(cell);
  const itemId = cell.dataset.ownedItem || "";
  const token = inventoryOverlayCellToken(cell) || ""; draggingInventoryToken = token;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("application/x-slime-inventory-token", token);
  event.dataTransfer.setData("application/x-slime-inventory-item", itemId);
  if (itemId && hotbarItemCanBeAssigned(itemId)) {
    event.dataTransfer.setData("application/x-slime-item", itemId);
  }
  event.dataTransfer.setData("text/plain", itemId || token);
  cell.classList.add("dragging");
});

inventoryPageElement?.addEventListener("dragend", event => {
  event.target.closest(".menu-item")?.classList.remove("dragging"); draggingInventoryToken = null; chestPanelElement?.classList.remove("inventory-drop-ready");
  document.querySelectorAll("#hotbar .hotbar-slot.drag-over, #equipmentPage .equipped-box.drag-over").forEach(slot => slot.classList.remove("drag-over"));
});
function closeInventoryDropQuantityPicker() {
  inventoryDropDraft = null;
  const overlay = document.getElementById("dropQuantityOverlay");
  overlay?.classList.remove("open");
  overlay?.setAttribute("aria-hidden", "true");
}

function inventoryDropQuantityValue() {
  if (!inventoryDropDraft) return 0;
  const input = document.getElementById("dropQuantityInput");
  const max = Math.max(1, Math.floor(Number(inventoryDropDraft.maxCount) || 1));
  const value = Math.max(1, Math.min(max, Math.floor(Number(input?.value) || 1)));
  if (input) input.value = String(value);
  return value;
}

function openInventoryDropQuantityPicker(token, maxCount, worldX, worldY, clientX, clientY) {
  const parts = inventoryTransferTokenParts(token);
  const max = Math.max(1, Math.floor(Number(maxCount) || 1));
  if (!parts || max <= 0) return false;
  if (max === 1) {
    inventoryDropPendingToken = token;
    if (!onlineClient?.requestInventoryDrop(token, 1, worldX, worldY)) inventoryDropPendingToken = null;
    return true;
  }
  inventoryDropDraft = { token, maxCount: max, worldX, worldY };
  const overlay = document.getElementById("dropQuantityOverlay");
  const panel = document.getElementById("dropQuantityPanel");
  const title = document.getElementById("dropQuantityTitle");
  const owned = document.getElementById("dropQuantityOwned");
  const input = document.getElementById("dropQuantityInput");
  if (title) title.textContent = `Drop ${inventoryTransferName(token)}`;
  if (owned) owned.textContent = `Owned ${max}`;
  if (input) { input.max = String(max); input.value = "1"; }
  overlay?.classList.add("open");
  overlay?.setAttribute("aria-hidden", "false");
  if (panel) {
    const width = 176, height = 142;
    panel.style.left = `${Math.max(6, Math.min(window.innerWidth - width - 6, Number(clientX) + 10))}px`;
    panel.style.top = `${Math.max(6, Math.min(window.innerHeight - height - 6, Number(clientY) - 30))}px`;
  }
  input?.focus({ preventScroll: true });
  input?.select();
  return true;
}

function confirmInventoryDropQuantity() {
  if (!inventoryDropDraft || inventoryDropPendingToken) return false;
  const { token, worldX, worldY } = inventoryDropDraft;
  const amount = inventoryDropQuantityValue();
  closeInventoryDropQuantityPicker();
  inventoryDropPendingToken = token;
  if (!onlineClient?.requestInventoryDrop(token, amount, worldX, worldY)) { inventoryDropPendingToken = null; return false; }
  return true;
}

canvas?.addEventListener("dragover",event=>{if(!draggingInventoryToken||inventoryDropPendingToken||inventoryDropDraft)return;event.preventDefault();event.dataTransfer.dropEffect="move";});
canvas?.addEventListener("drop",event=>{
  if(!draggingInventoryToken||inventoryDropPendingToken||inventoryDropDraft)return;
  event.preventDefault();
  const token=event.dataTransfer.getData("application/x-slime-inventory-token")||draggingInventoryToken;
  const count=inventoryTransferCount(token);
  draggingInventoryToken=null;
  if(!inventoryTransferTokenParts(token)||count<=0)return;
  const pointer=getCanvasPointerPosition(event);
  const camera=getCameraPosition();
  openInventoryDropQuantityPicker(token,count,camera.x+pointer.x,camera.y+pointer.y,event.clientX,event.clientY);
});

document.getElementById("dropQuantityMinus")?.addEventListener("click",()=>{const input=document.getElementById("dropQuantityInput");if(input){input.value=String(Math.max(1,inventoryDropQuantityValue()-1));}});
document.getElementById("dropQuantityPlus")?.addEventListener("click",()=>{const input=document.getElementById("dropQuantityInput");if(input&&inventoryDropDraft){input.value=String(Math.min(inventoryDropDraft.maxCount,inventoryDropQuantityValue()+1));}});
document.getElementById("dropQuantityMax")?.addEventListener("click",()=>{const input=document.getElementById("dropQuantityInput");if(input&&inventoryDropDraft)input.value=String(inventoryDropDraft.maxCount);});
document.getElementById("dropQuantityCancel")?.addEventListener("click",closeInventoryDropQuantityPicker);
document.getElementById("dropQuantityConfirm")?.addEventListener("click",confirmInventoryDropQuantity);
document.getElementById("dropQuantityInput")?.addEventListener("input",inventoryDropQuantityValue);
document.getElementById("dropQuantityInput")?.addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();event.stopPropagation();confirmInventoryDropQuantity();}else if(event.key==="Escape"){event.preventDefault();event.stopPropagation();closeInventoryDropQuantityPicker();}});

document.getElementById("inventoryDetailAction")?.addEventListener("click", event => {
  const itemId = event.currentTarget.dataset.consumableItem;
  if (!itemId || consumableCount(itemId) <= 0) return;
  useConsumable(itemId);
  updateInventoryUi();
});

const liveEquipmentDock = document.querySelector("#equipmentPage .equipped-column");
liveEquipmentDock?.addEventListener("dragover", event => {
  const slot = event.target.closest("[data-equipment-slot]");
  if (!slot) return;
  const itemId = event.dataTransfer.getData("application/x-slime-inventory-item") || "";
  if (equipmentSlotForInventoryItem(itemId) !== slot.dataset.equipmentSlot) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  slot.classList.add("drag-over");
});

liveEquipmentDock?.addEventListener("dragleave", event => {
  event.target.closest("[data-equipment-slot]")?.classList.remove("drag-over");
});

liveEquipmentDock?.addEventListener("drop", event => {
  const slot = event.target.closest("[data-equipment-slot]");
  if (!slot) return;
  event.preventDefault();
  slot.classList.remove("drag-over");
  const itemId = event.dataTransfer.getData("application/x-slime-inventory-item") || "";
  equipInventoryArmorItemToSlot(itemId, slot.dataset.equipmentSlot);
});

liveEquipmentDock?.addEventListener("click", event => {
  const slot = event.target.closest("[data-equipment-slot]");
  if (!slot) return;
  const selectedCell = inventoryOverlayCellForToken(selectedOverlayInventoryToken);
  const selectedItemId = selectedCell?.dataset?.ownedItem || "";
  if (selectedItemId && equipmentSlotForInventoryItem(selectedItemId) === slot.dataset.equipmentSlot) {
    equipInventoryArmorItemToSlot(selectedItemId, slot.dataset.equipmentSlot);
    return;
  }
  const equippedId = slot.dataset.itemDetailId;
  if (equippedId) {
    const cell = document.querySelector(`#inventoryPage [data-owned-item="${equippedId}"]`);
    if (cell) selectInventoryOverlayCell(cell);
  }
});

liveEquipmentDock?.addEventListener("contextmenu", event => {
  const slot = event.target.closest("[data-equipment-slot]");
  if (!slot) return;
  event.preventDefault();
  unequipInventoryArmorSlot(slot.dataset.equipmentSlot);
});

// v426: while Inventory is open, assigned HUD hotbar slots are draggable too.
// assignItemToHotbar already performs the actual move/swap semantics.
topHotbar?.addEventListener("dragstart", event => {
  const slot = event.target.closest(".hotbar-slot");
  if (!inventoryOpen || !slot || !topHotbar.contains(slot)) { event.preventDefault(); return; }
  const slotNumber = Number(String(slot.id || "").replace("slot", ""));
  const slotIndex = slotNumber - 1;
  const itemId = player.hotbarAssignments?.[slotIndex] || "";
  if (!hotbarItemCanBeAssigned(itemId)) { event.preventDefault(); return; }
  selectedHotbarInventoryItemId = itemId;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("application/x-slime-item", itemId);
  event.dataTransfer.setData("application/x-slime-hotbar-source", String(slotIndex));
  event.dataTransfer.setData("text/plain", itemId);
  slot.classList.add("dragging");
});

topHotbar?.addEventListener("dragend", event => {
  event.target.closest(".hotbar-slot")?.classList.remove("dragging");
  topHotbar.querySelectorAll(".hotbar-slot.drag-over").forEach(slot => slot.classList.remove("drag-over"));
});

// The real world HUD hotbar remains the assignment target.
topHotbar?.addEventListener("dragover", event => {
  const slot = event.target.closest(".hotbar-slot");
  if (!slot) return;
  const itemId = event.dataTransfer.getData("application/x-slime-item") || "";
  if (!hotbarItemCanBeAssigned(itemId)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  slot.classList.add("drag-over");
});

topHotbar?.addEventListener("dragleave", event => {
  event.target.closest(".hotbar-slot")?.classList.remove("drag-over");
});

topHotbar?.addEventListener("drop", event => {
  const slot = event.target.closest(".hotbar-slot");
  if (!slot) return;
  event.preventDefault();
  slot.classList.remove("drag-over");
  const itemId = event.dataTransfer.getData("application/x-slime-item") || "";
  if (!hotbarItemCanBeAssigned(itemId)) return;
  const slotNumber = Number(String(slot.id || "").replace("slot", ""));
  if (Number.isInteger(slotNumber) && slotNumber >= 1 && slotNumber <= HOTBAR_SLOT_COUNT) {
    assignItemToHotbar(itemId, slotNumber - 1);
  }
});


// -----------------------------------------------------------------------------
// PLAYER BUILDING (v384 edge-wall model)
// -----------------------------------------------------------------------------
const placedStructuresByMap = new Map();
const removedWorldStructureIdsByMap = new Map();
const worldStructureStatesByMap = new Map();
let placedStructureRevision = 0;
const BUILD_GRID_SIZE = 16;
const BUILD_PLACE_RANGE = 96;
const BUILD_FLOOR_STRUCTURE_KINDS = Object.freeze(["woodFloor", "stoneFloor"]);
const BUILD_EDGE_STRUCTURE_KINDS = Object.freeze(["woodWall", "woodDoor"]);
const DOOR_ADJACENT_DISTANCE = 10;
const DOOR_PASSAGE_DISTANCE = 14;
const DOOR_PASSAGE_MS = 420;
const HOUSE_FOREGROUND_ALPHA = 0.34;
const HOUSE_FOREGROUND_DOOR_ALPHA = 0.52;
const STRUCTURE_COVER_DOOR_ALPHA = 0.72;
const ROOF_PLAYER_COVER_ALPHA = 0.58;
const ROOF_OVERHANG = 3;
const STRUCTURE_EDGE_DARK = "#6b3b22";
const STRUCTURE_EDGE_LIGHT = "#d59a6b";
const ROOF_EDGE_DARK = "#4d1f00";
const ROOF_EAVE_LIGHT = "#a65012";
let localDoorPassageId = null;
let localDoorPassageUntil = 0;
let roofRegionCache = { mapId: null, revision: -1, regions: [] };
let currentMapStructureCache = { mapId: null, revision: -1, structures: [] };

function worldGeneratedStructuresForMap(mapId = currentMapId) {
  const structures = typeof WORLD_CONTENT !== "undefined"
    ? WORLD_CONTENT.maps?.[mapId]?.structures
    : null;
  if (!Array.isArray(structures)) return [];
  const removed = removedWorldStructureIdsByMap.get(mapId) || new Set();
  const states = worldStructureStatesByMap.get(mapId) || new Map();
  return structures
    .filter(structure => structure?.id && !removed.has(structure.id))
    .map(structure => {
      const state = states.get(structure.id);
      return state ? { ...structure, ...state } : structure;
    });
}

function currentMapStructures() {
  if (
    currentMapStructureCache.mapId === currentMapId &&
    currentMapStructureCache.revision === placedStructureRevision
  ) return currentMapStructureCache.structures;

  const worldStructures = worldGeneratedStructuresForMap(currentMapId);
  const placedStructures = placedStructuresByMap.get(currentMapId) || [];
  const structures = placedStructures.length > 0
    ? worldStructures.concat(placedStructures)
    : worldStructures;
  currentMapStructureCache = {
    mapId: currentMapId,
    revision: placedStructureRevision,
    structures
  };
  return structures;
}

function applyStructureSnapshot(mapId, structures, removedWorldStructureIds = [], worldStructureStates = []) {
  if (typeof mapId !== "string") return;
  placedStructuresByMap.set(mapId, Array.isArray(structures) ? structures.map(item => ({ ...item })) : []);
  removedWorldStructureIdsByMap.set(mapId, new Set(
    (Array.isArray(removedWorldStructureIds) ? removedWorldStructureIds : [])
      .filter(id => typeof id === "string" && id)
  ));
  const stateMap = new Map();
  for (const entry of Array.isArray(worldStructureStates) ? worldStructureStates : []) {
    if (!entry?.id) continue;
    const { id, ...state } = entry;
    stateMap.set(id, { ...state });
  }
  worldStructureStatesByMap.set(mapId, stateMap);
  placedStructureRevision += 1;
}

function applyStructurePlaced(structure) {
  if (!structure?.id || !structure?.mapId) return;
  const list = placedStructuresByMap.get(structure.mapId) || [];
  if (!list.some(item => item.id === structure.id)) {
    list.push({ ...structure });
    placedStructureRevision += 1;
  }
  placedStructuresByMap.set(structure.mapId, list);
}

function applyStructureRemoved(mapId, structureId) {
  if (!mapId || !structureId) return false;
  const list = placedStructuresByMap.get(mapId) || [];
  const next = list.filter(item => item.id !== structureId);
  let changed = next.length !== list.length;
  if (changed) {
    placedStructuresByMap.set(mapId, next);
  } else {
    const worldDefinition = WORLD_CONTENT?.maps?.[mapId]?.structures?.find(item => item?.id === structureId);
    if (worldDefinition) {
      let removed = removedWorldStructureIdsByMap.get(mapId);
      if (!removed) {
        removed = new Set();
        removedWorldStructureIdsByMap.set(mapId, removed);
      }
      if (!removed.has(structureId)) {
        removed.add(structureId);
        worldStructureStatesByMap.get(mapId)?.delete(structureId);
        changed = true;
      }
    }
  }
  if (!changed) return false;
  placedStructureRevision += 1;
  if (localDoorPassageId === structureId) {
    localDoorPassageId = null;
    localDoorPassageUntil = 0;
  }
  return true;
}

function applyStructureState(mapId, structureId, state) {
  if (!mapId || !structureId || !state || typeof state !== "object") return false;
  const placed = placedStructuresByMap.get(mapId) || [];
  const dynamic = placed.find(item => item?.id === structureId);
  if (dynamic) {
    Object.assign(dynamic, state);
    placedStructureRevision += 1;
    return true;
  }
  const worldDefinition = WORLD_CONTENT?.maps?.[mapId]?.structures?.find(item => item?.id === structureId);
  if (!worldDefinition) return false;
  let states = worldStructureStatesByMap.get(mapId);
  if (!states) {
    states = new Map();
    worldStructureStatesByMap.set(mapId, states);
  }
  states.set(structureId, { ...(states.get(structureId) || {}), ...state });
  placedStructureRevision += 1;
  return true;
}

function drawStructureFloor(structure, camX, camY, alpha = 1) {
  const x = Math.round(structure.x - camX - 8);
  const y = Math.round(structure.y - camY - 8);
  const image = structure?.kind === "stoneFloor" ? stoneFloorStructureImage : woodFloorStructureImage;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, x, y, 16, 16);
  ctx.restore();
}

function drawChestStructure(structure, camX, camY, alpha = 1) {
  const screenX = Math.round(Number(structure?.x) - camX);
  const screenY = Math.round(Number(structure?.y) - camY);
  const image = structure?.opened ? chestOpenStructureImage : chestClosedStructureImage;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "rgba(30, 24, 18, .28)";
  ctx.fillRect(screenX - 7, screenY, 14, 2);
  ctx.drawImage(image, screenX - 8, screenY - 16, 16, 16);
  ctx.restore();
}

function drawCraftingTableStructure(structure, camX, camY, alpha = 1) {
  const screenX = Math.round(Number(structure?.x) - camX);
  const screenY = Math.round(Number(structure?.y) - camY);
  const width = woodBenchImage.width || 18;
  const height = woodBenchImage.height || 18;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "rgba(30, 24, 18, .28)";
  ctx.fillRect(screenX - 7, screenY, 14, 2);
  ctx.drawImage(woodBenchImage, screenX - Math.round(width / 2), screenY - (height - 1));
  ctx.restore();
}

function torchDisplayWorldPosition(structure) {
  const x = Number(structure?.x);
  const y = Number(structure?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: 0, y: 0 };

  if (structure?.mountType === "wall") {
    // Wall structures store their collision-boundary center. Raise the visible
    // torch onto the painted wall face while keeping its support relationship
    // exact and deterministic on every client.
    return { x, y: y - 8 };
  }
  return { x, y };
}

function torchLightWorldPosition(structure) {
  const display = torchDisplayWorldPosition(structure);
  return { x: display.x, y: display.y - 9 };
}

function torchVisibilityWorldPosition(structure) {
  const light = torchLightWorldPosition(structure);
  if (structure?.mountType !== "wall") {
    // v412: floor/ground Torches use their physical placement anchor as the
    // topology/occlusion origin, while the visible light gradient stays on the
    // raised flame. A Torch on the floor immediately outside a wall can have
    // its flame sprite project above that wall in screen space; using the flame
    // as the world-space ray origin incorrectly classified it as being inside
    // the room and let exterior light illuminate the interior.
    const anchorX = Number(structure?.x);
    const anchorY = Number(structure?.y);
    if (Number.isFinite(anchorX) && Number.isFinite(anchorY)) {
      return { x: anchorX, y: anchorY };
    }
    return light;
  }

  // v408: mounting-side information is interpreted through the shared
  // structure geometry module instead of re-deriving wall axes here. The
  // visible flame may sit on the painted facade, but light visibility always
  // begins just on the side the torch is physically mounted to.
  const offset = STRUCTURE_GEOMETRY.offsetPointToSide(
    { ...structure, axis: structure.mountAxis || structure.axis },
    structure.mountSide,
    2.25
  );
  if (STRUCTURE_GEOMETRY.axisOf({ axis: structure.mountAxis || structure.axis }) === "vertical") {
    return { x: offset.x, y: light.y };
  }
  return { x: light.x, y: offset.y };
}

function drawPlacedTorch(structure, camX, camY, alpha = 1) {
  const display = torchDisplayWorldPosition(structure);
  const x = Math.round(display.x - camX - 8);
  const y = Math.round(display.y - camY - 15);
  const flicker = Math.sin(worldTime * 13.7 + Number(structure.x) * 0.031 + Number(structure.y) * 0.017);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(torchImage, x, y, 16, 16);
  if (alpha > 0.5 && flicker > 0.35) {
    ctx.globalAlpha = alpha * 0.72;
    ctx.fillStyle = "#d9ff9e";
    ctx.fillRect(x + (flicker > 0.75 ? 10 : 5), y + 2, 1, 1);
  }
  ctx.restore();
}

function wallCollisionRect(structure) {
  return STRUCTURE_GEOMETRY.collisionRect(structure, 2);
}

function structureEdgeNeighbor(structure, direction) {
  if (!BUILD_EDGE_STRUCTURE_KINDS.includes(structure?.kind)) return false;
  const axis = structure?.axis === "vertical" ? "vertical" : "horizontal";
  const offsetX = axis === "horizontal" ? direction * BUILD_GRID_SIZE : 0;
  const offsetY = axis === "vertical" ? direction * BUILD_GRID_SIZE : 0;
  return currentMapStructures().some(other =>
    other !== structure &&
    BUILD_EDGE_STRUCTURE_KINDS.includes(other?.kind) &&
    (other?.axis === "vertical" ? "vertical" : "horizontal") === axis &&
    Math.abs(Number(other.x) - (Number(structure.x) + offsetX)) < 1 &&
    Math.abs(Number(other.y) - (Number(structure.y) + offsetY)) < 1
  );
}

function segmentRectIntersectionT(x1, y1, x2, y2, rect, padding = 0) {
  return STRUCTURE_GEOMETRY.segmentRectIntersectionT(x1, y1, x2, y2, rect, padding);
}

function structureWallImpactPoint(fromX, fromY, toX, toY, padding = 0) {
  let best = null;
  for (const structure of currentMapStructures()) {
    const blocks = structure?.kind === "woodWall" ||
      (structure?.kind === "woodDoor" && !doorVisuallyOpen(structure));
    if (!blocks) continue;
    const t = segmentRectIntersectionT(
      Number(fromX),
      Number(fromY),
      Number(toX),
      Number(toY),
      wallCollisionRect(structure),
      padding
    );
    if (t === null || t <= 0.001 || t >= 0.999) continue;
    if (!best || t < best.t) best = { t, structure };
  }

  if (!best) return null;
  const safeT = Math.max(0, best.t - 0.01);
  return {
    x: Number(fromX) + (Number(toX) - Number(fromX)) * safeT,
    y: Number(fromY) + (Number(toY) - Number(fromY)) * safeT,
    structure: best.structure
  };
}

function structureLineOfEffectClear(fromX, fromY, toX, toY, padding = 0) {
  return !structureWallImpactPoint(fromX, fromY, toX, toY, padding);
}

function applyHeldItemStructureVisibilityClip(camX, camY) {
  // v406: every local held-item layer (arm, weapon, bow, string, torch) now
  // uses one visibility mask derived from the player's authoritative collision
  // position. This avoids pose-specific probes that could put the clipping
  // origin on the wrong side of a wall while still clipping any pixels that
  // genuinely extend across a closed wall/door boundary.
  const sourceX = Number(player?.x);
  const sourceY = Number(player?.y);
  if (![sourceX, sourceY].every(Number.isFinite)) return;

  const polygon = torchLightVisibilityPolygon(sourceX, sourceY, 42, "held-item");
  if (!polygon?.length) return;

  ctx.beginPath();
  ctx.moveTo(polygon[0].x - camX, polygon[0].y - camY);
  for (let index = 1; index < polygon.length; index += 1) {
    ctx.lineTo(polygon[index].x - camX, polygon[index].y - camY);
  }
  ctx.closePath();
  ctx.clip();
}

function verticalWallHasUpperHorizontalJoin(structure) {
  if (structure?.axis !== "vertical") return false;
  const x = Number(structure.x);
  const upperY = Number(structure.y) - 8;
  return currentMapStructures().some(other =>
    BUILD_EDGE_STRUCTURE_KINDS.includes(other?.kind) &&
    other.axis !== "vertical" &&
    Math.abs(Number(other.y) - upperY) < 1 &&
    Math.abs(Math.abs(Number(other.x) - x) - 8) < 1
  );
}

function structureVisuallyCoversLocalPlayer(structure) {
  if (!structure || remotePlayerDrawDepth > 0) return false;
  const sx = Number(structure.x);
  const sy = Number(structure.y);
  const px = Number(player.x);
  const py = Number(player.y);
  if (structure.axis === "vertical") {
    const extension = verticalWallHasUpperHorizontalJoin(structure) ? 16 : 0;
    const top = sy - 23 - extension;
    return Math.abs(px - sx) <= 7 && py >= top && py <= sy + 8;
  }
  return Math.abs(px - sx) <= 11 && py >= sy - 31 && py <= sy + 2;
}

function structureBelongsToRoofFacade(structure, region) {
  if (!structure || !region?.boundaryKeys) return false;
  return region.boundaryKeys.has(
    structureBoundaryKey(structure.axis, structure.x, structure.y)
  );
}

function structureIsForegroundRoofBoundary(structure, region) {
  if (!structure || !region?.foregroundBoundaryKeys) return false;
  return region.foregroundBoundaryKeys.has(
    structureBoundaryKey(structure.axis, structure.x, structure.y)
  );
}

function activeInteriorRoofRegion() {
  if (remotePlayerDrawDepth > 0) return null;
  return automaticRoofRegions().find(region => playerInsideRoofRegion(region)) || null;
}

function structureFadeAlpha(structure, alpha = 1) {
  const interiorRegion = activeInteriorRoofRegion();
  if (interiorRegion && structureBelongsToRoofFacade(structure, interiorRegion)) {
    // Inside a finished house the roof disappears completely and only the
    // south/foreground wall is softened. Back and side walls stay fully solid
    // so the interior keeps a stable room-like silhouette.
    return structureIsForegroundRoofBoundary(structure, interiorRegion)
      ? alpha * (structure?.kind === "woodDoor" ? HOUSE_FOREGROUND_DOOR_ALPHA : HOUSE_FOREGROUND_ALPHA)
      : alpha;
  }
  if (!structureVisuallyCoversLocalPlayer(structure)) return alpha;
  return alpha * (structure?.kind === "woodDoor" ? STRUCTURE_COVER_DOOR_ALPHA : 0.58);
}

function doorPerpendicularDistance(structure, x, y) {
  return structure?.axis === "vertical"
    ? Math.abs(Number(x) - Number(structure.x))
    : Math.abs(Number(y) - Number(structure.y));
}

function doorTangentialDistance(structure, x, y) {
  return structure?.axis === "vertical"
    ? Math.abs(Number(y) - Number(structure.y))
    : Math.abs(Number(x) - Number(structure.x));
}

function localDoorPassageActive(structure) {
  if (!structure?.id || localDoorPassageId !== structure.id) return false;
  const now = performance.now();
  const insideDoorway =
    doorPerpendicularDistance(structure, player.x, player.y) <= 5.5 &&
    doorTangentialDistance(structure, player.x, player.y) <= 12;

  if (now > localDoorPassageUntil) {
    // v398: keep a door visually/collision-open while the local player is
    // physically occupying the doorway so it cannot close onto the player.
    if (!insideDoorway) return false;
    localDoorPassageUntil = now + DOOR_PASSAGE_MS;
  }

  return doorPerpendicularDistance(structure, player.x, player.y) <= DOOR_PASSAGE_DISTANCE;
}

function doorAllowsLocalPlayerStep(structure, fromX, fromY, toX, toY, playerRadius = 4) {
  if (structure?.kind !== "woodDoor") return false;
  const tangential = Math.min(
    doorTangentialDistance(structure, fromX, fromY),
    doorTangentialDistance(structure, toX, toY)
  );
  if (tangential > 8 + playerRadius + 2) return false;

  // v418: the automatic door itself never traps the local player. The wall
  // pieces flanking the doorway still provide the solid frame, while any step
  // travelling through the door channel refreshes the open/passage state.
  localDoorPassageId = structure.id;
  localDoorPassageUntil = performance.now() + DOOR_PASSAGE_MS;
  return true;
}

function localPlayerApproachOpensDoor(structure) {
  if (player?.hp <= 0) return false;
  return (
    doorPerpendicularDistance(structure, player.x, player.y) <= DOOR_PASSAGE_DISTANCE &&
    doorTangentialDistance(structure, player.x, player.y) <= 12
  );
}

function doorVisuallyOpen(structure) {
  // v400: mirror the server's v399 shared approach-open rule exactly enough
  // that a doorway never becomes passable to enemies while still drawn shut
  // on the approaching player's client. The older passage state remains as
  // the hold-open mechanism while the player is actually traversing it.
  if (localPlayerApproachOpensDoor(structure)) return true;
  if (localDoorPassageActive(structure)) return true;

  // Remote door state is not networked. A tiny near-plane heuristic keeps the
  // animation plausible for other players without adding a door heartbeat.
  const remotes = typeof onlineClient !== "undefined" ? onlineClient?.remotePlayers : null;
  if (!remotes?.values) return false;
  for (const remote of remotes.values()) {
    if (remote?.mapId !== currentMapId || remote?.hp <= 0) continue;
    const rx = Number.isFinite(remote.renderX) ? remote.renderX : remote.x;
    const ry = Number.isFinite(remote.renderY) ? remote.renderY : remote.y;
    if (
      doorPerpendicularDistance(structure, rx, ry) <= 5 &&
      doorTangentialDistance(structure, rx, ry) <= 11
    ) return true;
  }
  return false;
}

function drawWoodWall(structure, camX, camY, alpha = 1) {
  const sx = Math.round(Number(structure.x) - camX);
  const sy = Math.round(Number(structure.y) - camY);
  const axis = structure?.axis === "vertical" ? "vertical" : "horizontal";

  ctx.save();
  ctx.globalAlpha = structureFadeAlpha(structure, alpha);
  ctx.imageSmoothingEnabled = false;

  if (axis === "horizontal") {
    const left = sx - 8;
    const top = sy - 31;
    ctx.drawImage(woodWallStructureImage, left, top, 16, 32);

    // One continuous silhouette line across connected wall runs. End caps are
    // only drawn at the true ends so adjacent 16px pieces do not look boxed-in.
    ctx.fillStyle = STRUCTURE_EDGE_DARK;
    ctx.fillRect(left, top, 16, 1);
    ctx.fillRect(left, sy, 16, 1);
    if (!structureEdgeNeighbor(structure, -1)) ctx.fillRect(left, top, 1, 32);
    if (!structureEdgeNeighbor(structure, 1)) ctx.fillRect(left + 15, top, 1, 32);

    ctx.fillStyle = STRUCTURE_EDGE_LIGHT;
    ctx.globalAlpha *= 0.42;
    ctx.fillRect(left + 1, top + 1, 14, 1);
  } else {
    const cornerExtension = verticalWallHasUpperHorizontalJoin(structure) ? 16 : 0;
    const height = 32 + cornerExtension;
    const left = sx - 2;
    const top = sy + 9 - height;
    if (cornerExtension) {
      ctx.drawImage(woodWallStructureImage, 0, 0, 16, 16, left, top, 4, 16);
      ctx.drawImage(woodWallStructureImage, 0, 0, 16, 32, left, top + 16, 4, 32);
    } else {
      ctx.drawImage(woodWallStructureImage, left, top, 4, 32);
    }

    ctx.fillStyle = STRUCTURE_EDGE_DARK;
    ctx.globalAlpha = structureFadeAlpha(structure, alpha);
    ctx.fillRect(left, top, 1, height);
    ctx.fillRect(left + 3, top, 1, height);
    if (!structureEdgeNeighbor(structure, -1)) ctx.fillRect(left, top, 4, 1);
    if (!structureEdgeNeighbor(structure, 1)) ctx.fillRect(left, top + height - 1, 4, 1);
  }

  ctx.restore();
}

function drawWoodDoor(structure, camX, camY, alpha = 1) {
  const sx = Math.round(Number(structure.x) - camX);
  const sy = Math.round(Number(structure.y) - camY);
  const axis = structure?.axis === "vertical" ? "vertical" : "horizontal";
  const open = doorVisuallyOpen(structure);

  ctx.save();
  ctx.globalAlpha = structureFadeAlpha(structure, alpha);
  ctx.imageSmoothingEnabled = false;

  if (axis === "horizontal") {
    const left = sx - 8;
    const top = sy - 31;
    if (open) {
      ctx.drawImage(woodDoorStructureImage, left, top, 4, 32);
      ctx.fillStyle = STRUCTURE_EDGE_DARK;
      ctx.fillRect(left, top, 1, 32);
      ctx.fillRect(left + 3, top, 1, 32);
    } else {
      ctx.drawImage(woodDoorStructureImage, left, top, 16, 32);
      ctx.fillStyle = STRUCTURE_EDGE_DARK;
      ctx.fillRect(left, top, 16, 1);
      ctx.fillRect(left, sy, 16, 1);
      ctx.fillRect(left, top, 1, 32);
      ctx.fillRect(left + 15, top, 1, 32);
    }
  } else {
    const extension = verticalWallHasUpperHorizontalJoin(structure) ? 16 : 0;
    const height = 32 + extension;
    const top = sy + 9 - height;
    if (open) {
      ctx.drawImage(woodDoorStructureImage, 0, 0, 16, 32, sx - 8, sy - 8, 8, 3);
      ctx.fillStyle = STRUCTURE_EDGE_DARK;
      ctx.fillRect(sx - 8, sy - 8, 8, 1);
    } else if (extension) {
      ctx.drawImage(woodDoorStructureImage, 0, 0, 16, 16, sx - 2, top, 4, 16);
      ctx.drawImage(woodDoorStructureImage, 0, 0, 16, 32, sx - 2, top + 16, 4, 32);
      ctx.fillStyle = STRUCTURE_EDGE_DARK;
      ctx.fillRect(sx - 2, top, 1, height);
      ctx.fillRect(sx + 1, top, 1, height);
    } else {
      ctx.drawImage(woodDoorStructureImage, sx - 2, top, 4, 32);
      ctx.fillStyle = STRUCTURE_EDGE_DARK;
      ctx.fillRect(sx - 2, top, 1, 32);
      ctx.fillRect(sx + 1, top, 1, 32);
    }
  }

  ctx.restore();
}

function drawPlayerStructureFloors(camX, camY) {
  for (const structure of currentMapStructures()) {
    if (BUILD_FLOOR_STRUCTURE_KINDS.includes(structure.kind)) drawStructureFloor(structure, camX, camY);
  }
}

function structureCellKey(x, y) {
  return `${Math.round(Number(x))},${Math.round(Number(y))}`;
}

function structureBoundaryKey(axis, x, y) {
  return `${axis}:${Math.round(Number(x))},${Math.round(Number(y))}`;
}

function automaticRoofRegions() {
  if (
    roofRegionCache.mapId === currentMapId &&
    roofRegionCache.revision === placedStructureRevision
  ) return roofRegionCache.regions;

  // v411: automatic roofs are based on independent structure layers. Floors
  // connect only when no wall/door separates them, so an exterior floor tile
  // touching a finished house remains outside instead of destroying the roof.
  // Object and attachment layers (floor objects, wall torches, future
  // furniture) are deliberately ignored by roof topology.
  const regions = STRUCTURE_TOPOLOGY.automaticRoofRegions(
    currentMapStructures(),
    BUILD_GRID_SIZE
  );

  roofRegionCache = { mapId: currentMapId, revision: placedStructureRevision, regions };
  return regions;
}

function pointInsideRoofRegion(region, worldX, worldY) {
  return Boolean(region?.floors?.some(floor =>
    Math.abs(Number(worldX) - Number(floor.x)) <= 8 &&
    Math.abs(Number(worldY) - Number(floor.y)) <= 8
  ));
}

function pointUnderAutomaticRoof(worldX, worldY) {
  const x = Number(worldX);
  const y = Number(worldY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const floorX = Math.round(x / BUILD_GRID_SIZE) * BUILD_GRID_SIZE;
  const floorY = Math.round(y / BUILD_GRID_SIZE) * BUILD_GRID_SIZE;
  if (Math.abs(x - floorX) > 8 || Math.abs(y - floorY) > 8) return false;
  const key = structureCellKey(floorX, floorY);
  return automaticRoofRegions().some(region =>
    region?.floorKeys?.has(key) || pointInsideRoofRegion(region, x, y)
  );
}

function playerInsideRoofRegion(region) {
  return pointInsideRoofRegion(region, player.x, player.y);
}

function roofRegionVisuallyCoversLocalPlayer(region) {
  if (!region?.floors || remotePlayerDrawDepth > 0) return false;
  const px = Number(player.x);
  const playerBottom = Number(player.y);
  const playerTop = playerBottom - 15;
  const floorKeys = region.floorKeys || new Set(region.floors.map(floor => structureCellKey(floor.x, floor.y)));

  return region.floors.some(floor => {
    const fx = Number(floor.x);
    const fy = Number(floor.y);
    const west = !floorKeys.has(structureCellKey(fx - BUILD_GRID_SIZE, fy));
    const east = !floorKeys.has(structureCellKey(fx + BUILD_GRID_SIZE, fy));
    const north = !floorKeys.has(structureCellKey(fx, fy - BUILD_GRID_SIZE));
    const south = !floorKeys.has(structureCellKey(fx, fy + BUILD_GRID_SIZE));
    const left = fx - 8 - (west ? ROOF_OVERHANG : 0);
    const right = fx + 8 + (east ? ROOF_OVERHANG : 0);
    const top = fy - 40 - (north ? ROOF_OVERHANG : 0);
    const bottom = fy - 24 + (south ? ROOF_OVERHANG : 0);
    return px >= left - 4 && px <= right + 4 && playerBottom >= top && playerTop <= bottom;
  });
}

function appendRoofRegionSurfacePath(pathCtx, region, camX, camY) {
  if (!pathCtx || !region?.floors?.length) return false;
  const floorKeys = region.floorKeys || new Set(
    region.floors.map(floor => structureCellKey(floor.x, floor.y))
  );

  let appended = false;
  for (const floor of region.floors) {
    const fx = Number(floor.x);
    const fy = Number(floor.y);
    if (!Number.isFinite(fx) || !Number.isFinite(fy)) continue;

    const north = !floorKeys.has(structureCellKey(fx, fy - BUILD_GRID_SIZE));
    const south = !floorKeys.has(structureCellKey(fx, fy + BUILD_GRID_SIZE));
    const west = !floorKeys.has(structureCellKey(fx - BUILD_GRID_SIZE, fy));
    const east = !floorKeys.has(structureCellKey(fx + BUILD_GRID_SIZE, fy));
    const left = fx - 8 - (west ? ROOF_OVERHANG : 0) - camX;
    const top = fy - 40 - (north ? ROOF_OVERHANG : 0) - camY;
    const width = 16 + (west ? ROOF_OVERHANG : 0) + (east ? ROOF_OVERHANG : 0);
    const height = 16 + (north ? ROOF_OVERHANG : 0) + (south ? ROOF_OVERHANG : 0);
    pathCtx.rect(left, top, width, height);
    appended = true;
  }
  return appended;
}

function drawAutomaticStructureRoofs(camX, camY) {
  for (const region of automaticRoofRegions()) {
    const inside = playerInsideRoofRegion(region);
    if (inside) continue;
    const alpha = roofRegionVisuallyCoversLocalPlayer(region)
      ? ROOF_PLAYER_COVER_ALPHA
      : 0.96;
    const floorKeys = region.floorKeys || new Set(region.floors.map(floor => structureCellKey(floor.x, floor.y)));

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = false;

    for (const floor of region.floors) {
      const fx = Number(floor.x);
      const fy = Number(floor.y);
      const x = Math.round(fx - camX - 8);
      const y = Math.round(fy - camY - 40);
      const north = !floorKeys.has(structureCellKey(fx, fy - BUILD_GRID_SIZE));
      const south = !floorKeys.has(structureCellKey(fx, fy + BUILD_GRID_SIZE));
      const west = !floorKeys.has(structureCellKey(fx - BUILD_GRID_SIZE, fy));
      const east = !floorKeys.has(structureCellKey(fx + BUILD_GRID_SIZE, fy));

      // Keep the authored roof tile completely uniform. v396 only gives the
      // *outer roof silhouette* dedicated edge/corner treatment.
      if (north) {
        ctx.drawImage(woodRoofStructureImage, 0, 0, 16, 1, x, y - ROOF_OVERHANG, 16, ROOF_OVERHANG);
      }
      if (south) {
        ctx.drawImage(woodRoofStructureImage, 0, 15, 16, 1, x, y + 16, 16, ROOF_OVERHANG);
      }
      if (west) {
        ctx.drawImage(woodRoofStructureImage, 0, 0, 1, 16, x - ROOF_OVERHANG, y, ROOF_OVERHANG, 16);
      }
      if (east) {
        ctx.drawImage(woodRoofStructureImage, 15, 0, 1, 16, x + 16, y, ROOF_OVERHANG, 16);
      }
      if (north && west) {
        ctx.drawImage(woodRoofStructureImage, 0, 0, 1, 1, x - ROOF_OVERHANG, y - ROOF_OVERHANG, ROOF_OVERHANG, ROOF_OVERHANG);
      }
      if (north && east) {
        ctx.drawImage(woodRoofStructureImage, 15, 0, 1, 1, x + 16, y - ROOF_OVERHANG, ROOF_OVERHANG, ROOF_OVERHANG);
      }
      if (south && west) {
        ctx.drawImage(woodRoofStructureImage, 0, 15, 1, 1, x - ROOF_OVERHANG, y + 16, ROOF_OVERHANG, ROOF_OVERHANG);
      }
      if (south && east) {
        ctx.drawImage(woodRoofStructureImage, 15, 15, 1, 1, x + 16, y + 16, ROOF_OVERHANG, ROOF_OVERHANG);
      }

      ctx.drawImage(woodRoofStructureImage, x, y, 16, 16);

      const edgeLeft = x - (west ? ROOF_OVERHANG : 0);
      const edgeRight = x + 16 + (east ? ROOF_OVERHANG : 0);
      const edgeTop = y - (north ? ROOF_OVERHANG : 0);
      const edgeBottom = y + 16 + (south ? ROOF_OVERHANG : 0);

      ctx.globalAlpha = alpha;
      ctx.fillStyle = ROOF_EDGE_DARK;
      if (north) ctx.fillRect(edgeLeft, edgeTop, edgeRight - edgeLeft, 1);
      if (west) ctx.fillRect(edgeLeft, edgeTop, 1, edgeBottom - edgeTop);
      if (east) ctx.fillRect(edgeRight - 1, edgeTop, 1, edgeBottom - edgeTop);

      if (south) {
        // A stronger eave is the main depth cue: a thin warm lip followed by
        // the dark lower edge keeps the roof distinct from the wall below.
        ctx.fillStyle = ROOF_EAVE_LIGHT;
        ctx.globalAlpha = alpha * 0.72;
        ctx.fillRect(edgeLeft + 1, edgeBottom - 3, Math.max(1, edgeRight - edgeLeft - 2), 1);
        ctx.fillStyle = ROOF_EDGE_DARK;
        ctx.globalAlpha = alpha;
        ctx.fillRect(edgeLeft, edgeBottom - 2, edgeRight - edgeLeft, 2);
      }
    }

    ctx.restore();
  }
}

function wallDrawSortY(structure) {
  return STRUCTURE_GEOMETRY.drawSortY(structure);
}

function addPlayerStructureDrawables(drawables, camX, camY) {
  for (const structure of currentMapStructures()) {
    if (structure.kind === "torch") {
      const sortY = structure.mountType === "wall"
        ? Number(structure.y) + (structure.mountAxis === "vertical" ? 8.25 : 0.25)
        : Number(structure.y);
      addDrawable(drawables, sortY, () => drawPlacedTorch(structure, camX, camY));
      continue;
    }
    if (structure.kind === "chest") {
      addDrawable(drawables, Number(structure.y), () => drawChestStructure(structure, camX, camY));
      continue;
    }
    if (structure.kind === "craftingTable") {
      addDrawable(drawables, Number(structure.y), () => drawCraftingTableStructure(structure, camX, camY));
      continue;
    }
    if (!BUILD_EDGE_STRUCTURE_KINDS.includes(structure.kind)) continue;
    addDrawable(drawables, wallDrawSortY(structure), () => {
      if (structure.kind === "woodDoor") drawWoodDoor(structure, camX, camY);
      else drawWoodWall(structure, camX, camY);
    });
  }
}

function hitsPlayerStructureObstacle(x, y, playerRadius = 4, options = {}) {
  for (const structure of currentMapStructures()) {
    if (structure.kind === "chest" || structure.kind === "craftingTable") {
      const left = Number(structure.x) - 7;
      const top = Number(structure.y) - 8;
      if (circleRectCollision(x, y, playerRadius, left, top, 14, 8)) return true;
      continue;
    }
    if (!BUILD_EDGE_STRUCTURE_KINDS.includes(structure.kind)) continue;
    const rect = wallCollisionRect(structure);
    if (!circleRectCollision(x, y, playerRadius, rect.x, rect.y, rect.width, rect.height)) continue;
    if (
      structure.kind === "woodDoor" &&
      Number.isFinite(options.fromX) &&
      Number.isFinite(options.fromY) &&
      doorAllowsLocalPlayerStep(structure, options.fromX, options.fromY, x, y, playerRadius)
    ) continue;
    return true;
  }
  return false;
}

function pickaxeStructurePointerBounds(structure) {
  if (structure?.kind === "torch") {
    const display = torchDisplayWorldPosition(structure);
    return {
      left: display.x - 8,
      top: display.y - 16,
      right: display.x + 8,
      bottom: display.y + 2
    };
  }

  if (structure?.kind === "chest") {
    return {
      left: Number(structure.x) - 8,
      top: Number(structure.y) - 16,
      right: Number(structure.x) + 8,
      bottom: Number(structure.y)
    };
  }

  if (structure?.kind === "craftingTable") {
    return {
      left: Number(structure.x) - 9,
      top: Number(structure.y) - 18,
      right: Number(structure.x) + 9,
      bottom: Number(structure.y) + 1
    };
  }

  if (BUILD_FLOOR_STRUCTURE_KINDS.includes(structure?.kind)) {
    return {
      left: Number(structure.x) - 8,
      top: Number(structure.y) - 8,
      right: Number(structure.x) + 8,
      bottom: Number(structure.y) + 8
    };
  }

  if (structure?.axis === "vertical") {
    const extension = verticalWallHasUpperHorizontalJoin(structure) ? 16 : 0;
    const height = 32 + extension;
    const x = Number(structure.x);
    const y = Number(structure.y);
    return {
      left: x - 3,
      top: y + 8 - height,
      right: x + 3,
      bottom: y + 10
    };
  }

  const x = Number(structure.x);
  const y = Number(structure.y);
  return {
    left: x - 9,
    top: y - 32,
    right: x + 9,
    bottom: y + 2
  };
}

function pointDistanceToRect(x, y, rect) {
  const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
  const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
  return Math.hypot(dx, dy);
}

function playerStructurePickaxeTarget() {
  const pointerWorldX = currentCamX + mouseCanvasX;
  const pointerWorldY = currentCamY + mouseCanvasY;
  const originX = player.x;
  const originY = player.y - 8;
  const maxRange = currentMeleeReach() + 12;
  const pointerTolerance = 5;
  let best = null;
  let bestPointerDistance = Infinity;
  let bestPriority = Infinity;

  for (const structure of currentMapStructures()) {
    if (!structure?.id || !["woodFloor", "stoneFloor", "woodWall", "woodDoor", "torch", "chest", "craftingTable"].includes(structure.kind)) continue;

    // Player position is only a reach gate. It must never decide which placed
    // piece wins when several structures are in range; the cursor does that.
    const physicalDistance = Math.hypot(Number(structure.x) - originX, Number(structure.y) - originY);
    if (physicalDistance > maxRange) continue;

    const pointerDistance = pointDistanceToRect(
      pointerWorldX,
      pointerWorldY,
      pickaxeStructurePointerBounds(structure)
    );
    if (pointerDistance > pointerTolerance) continue;

    // If the pointer overlaps a wall/door facade and the floor behind it,
    // prefer the visible edge structure. Otherwise choose whichever structure
    // is geometrically closest to the cursor, independent of player distance.
    const priority = ["torch", "chest", "craftingTable"].includes(structure.kind)
      ? 0
      : BUILD_EDGE_STRUCTURE_KINDS.includes(structure.kind)
        ? 1
        : 2;
    if (
      pointerDistance < bestPointerDistance - 0.001 ||
      (
        Math.abs(pointerDistance - bestPointerDistance) <= 0.001 &&
        priority < bestPriority
      )
    ) {
      best = structure;
      bestPointerDistance = pointerDistance;
      bestPriority = priority;
    }
  }

  return best;
}

function drawPickaxeStructureTargetHighlight(camX, camY) {
  if (remotePlayerDrawDepth > 0 || selectedBuildPiece || equippedWeapon() !== "pickaxe") return;
  const structure = playerStructurePickaxeTarget();
  if (!structure) return;

  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = "#ffe38b";

  if (BUILD_FLOOR_STRUCTURE_KINDS.includes(structure.kind)) {
    const left = Math.round(Number(structure.x) - camX - 8);
    const top = Math.round(Number(structure.y) - camY - 8);
    ctx.fillRect(left, top, 16, 1);
    ctx.fillRect(left, top + 15, 16, 1);
    ctx.fillRect(left, top, 1, 16);
    ctx.fillRect(left + 15, top, 1, 16);
  } else if (structure.kind === "craftingTable") {
    const left = Math.round(Number(structure.x) - camX - 9);
    const top = Math.round(Number(structure.y) - camY - 18);
    ctx.fillRect(left, top, 18, 1);
    ctx.fillRect(left, top + 18, 18, 1);
    ctx.fillRect(left, top, 1, 19);
    ctx.fillRect(left + 17, top, 1, 19);
  } else if (structure.kind === "chest") {
    const left = Math.round(Number(structure.x) - camX - 8);
    const top = Math.round(Number(structure.y) - camY - 16);
    ctx.fillRect(left, top, 16, 1);
    ctx.fillRect(left, top + 15, 16, 1);
    ctx.fillRect(left, top, 1, 16);
    ctx.fillRect(left + 15, top, 1, 16);
  } else if (structure.kind === "torch") {
    const display = torchDisplayWorldPosition(structure);
    const left = Math.round(display.x - camX - 8);
    const top = Math.round(display.y - camY - 16);
    ctx.fillRect(left, top, 16, 1);
    ctx.fillRect(left, top + 17, 16, 1);
    ctx.fillRect(left, top, 1, 18);
    ctx.fillRect(left + 15, top, 1, 18);
  } else if (structure.axis === "vertical") {
    const sx = Math.round(Number(structure.x) - camX);
    const sy = Math.round(Number(structure.y) - camY);
    const extension = verticalWallHasUpperHorizontalJoin(structure) ? 16 : 0;
    const height = 32 + extension;
    const left = sx - 3;
    const top = sy + 9 - height - 1;
    ctx.fillRect(left, top, 6, 1);
    ctx.fillRect(left, top + height + 1, 6, 1);
    ctx.fillRect(left, top, 1, height + 2);
    ctx.fillRect(left + 5, top, 1, height + 2);
  } else {
    const sx = Math.round(Number(structure.x) - camX);
    const sy = Math.round(Number(structure.y) - camY);
    const left = sx - 9;
    const top = sy - 32;
    ctx.fillRect(left, top, 18, 1);
    ctx.fillRect(left, sy + 1, 18, 1);
    ctx.fillRect(left, top, 1, 34);
    ctx.fillRect(left + 17, top, 1, 34);
  }
  ctx.restore();
}

function tryHitPlayerStructure(lockedStructureId = undefined) {
  const best = lockedStructureId === undefined
    ? playerStructurePickaxeTarget()
    : lockedStructureId
      ? currentMapStructures().find(structure => structure?.id === lockedStructureId) || null
      : null;
  if (!best) return false;
  return Boolean(
    typeof onlineClient !== "undefined" &&
    onlineClient?.requestStructureDestroy(best.id)
  );
}

function buildPieceCount(kind) {
  if (kind === "woodFloor") return Math.max(0, Number(player.woodFloors) || 0);
  if (kind === "stoneFloor") return Math.max(0, Number(player.stoneFloors) || 0);
  if (kind === "woodWall") return Math.max(0, Number(player.woodWalls) || 0);
  if (kind === "woodDoor") return Math.max(0, Number(player.woodDoors) || 0);
  if (kind === "torch") return Math.max(0, Number(player.torches) || 0);
  if (kind === "chest") return Math.max(0, Number(player.chests) || 0);
  if (kind === "craftingTable") return Math.max(0, Number(player.craftingTables) || 0);
  return 0;
}

function beginBuildPlacement(kind) {
  if (!["woodFloor", "stoneFloor", "woodWall", "woodDoor", "torch", "chest", "craftingTable"].includes(kind) || buildPieceCount(kind) <= 0) return false;
  selectedBuildPiece = kind;
  // v422: build selection is compatible with the live inventory overlay.
  if (
    typeof mobileControlsEnabled !== "undefined" &&
    mobileControlsEnabled &&
    typeof beginMobileBuildCursorForSelectedPiece === "function"
  ) {
    beginMobileBuildCursorForSelectedPiece();
  }
  updateCanvasCursor();
  if (typeof updateMobilePrimaryActionButton === "function") updateMobilePrimaryActionButton();
  // v408: this is a change-only durable presentation field; it sends only when
  // the player changes what they are holding, not every frame.
  if (typeof onlineClient !== "undefined" && onlineClient?.connected) onlineClient.sendLocalState(true);
  return true;
}

function cancelBuildPlacement(quiet = false) {
  if (!selectedBuildPiece) return false;
  selectedBuildPiece = null;
  if (typeof clearMobileBuildCursor === "function") clearMobileBuildCursor();
  if (!quiet) spawnFloatingText(player.x, player.y - 30, "BUILD CANCELLED", "#d9c9a0", 0.65);
  updateCanvasCursor();
  if (typeof updateMobilePrimaryActionButton === "function") updateMobilePrimaryActionButton();
  if (typeof onlineClient !== "undefined" && onlineClient?.connected) onlineClient.sendLocalState(true);
  return true;
}

function floorAtWorldPoint(worldX, worldY) {
  let best = null;
  let bestDistance = Infinity;
  for (const structure of currentMapStructures()) {
    if (!BUILD_FLOOR_STRUCTURE_KINDS.includes(structure?.kind)) continue;
    const dx = Math.abs(worldX - Number(structure.x));
    const dy = Math.abs(worldY - Number(structure.y));
    if (dx > 8 || dy > 8) continue;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      best = structure;
      bestDistance = distance;
    }
  }
  return best;
}


function doorCandidateHasFlankingWalls(candidate) {
  if (!candidate) return false;
  const structures = currentMapStructures();
  const endpoints = candidate.axis === "horizontal"
    ? [
        { x: candidate.x - 8, y: candidate.y, side: -1 },
        { x: candidate.x + 8, y: candidate.y, side: 1 }
      ]
    : [
        { x: candidate.x, y: candidate.y - 8, side: -1 },
        { x: candidate.x, y: candidate.y + 8, side: 1 }
      ];

  const endpointHasWallSupport = endpoint => structures.some(structure => {
    if (structure?.kind !== "woodWall") return false;
    const axis = structure.axis === "vertical" ? "vertical" : "horizontal";

    if (axis === candidate.axis) {
      const expectedX = candidate.axis === "horizontal"
        ? candidate.x + endpoint.side * BUILD_GRID_SIZE
        : candidate.x;
      const expectedY = candidate.axis === "vertical"
        ? candidate.y + endpoint.side * BUILD_GRID_SIZE
        : candidate.y;
      return Math.abs(Number(structure.x) - expectedX) < 1 &&
        Math.abs(Number(structure.y) - expectedY) < 1;
    }

    // A rotated wall that terminates at the door endpoint counts as the
    // required flank, allowing doors immediately beside exterior corners.
    if (candidate.axis === "horizontal") {
      return Math.abs(Number(structure.x) - endpoint.x) < 1 &&
        Math.abs(Math.abs(Number(structure.y) - endpoint.y) - 8) < 1;
    }
    return Math.abs(Number(structure.y) - endpoint.y) < 1 &&
      Math.abs(Math.abs(Number(structure.x) - endpoint.x) - 8) < 1;
  });

  return endpoints.every(endpointHasWallSupport);
}

function rawWallPlacementCandidate(worldX, worldY) {
  const floor = floorAtWorldPoint(worldX, worldY);
  if (!floor) return null;
  const left = Number(floor.x) - 8;
  const right = Number(floor.x) + 8;
  const top = Number(floor.y) - 8;
  const bottom = Number(floor.y) + 8;
  const edges = [
    { edge: "north", distance: Math.abs(worldY - top), x: Number(floor.x), y: top, axis: "horizontal" },
    { edge: "east", distance: Math.abs(worldX - right), x: right, y: Number(floor.y), axis: "vertical" },
    { edge: "south", distance: Math.abs(worldY - bottom), x: Number(floor.x), y: bottom, axis: "horizontal" },
    { edge: "west", distance: Math.abs(worldX - left), x: left, y: Number(floor.y), axis: "vertical" }
  ];
  edges.sort((a, b) => a.distance - b.distance);
  return { ...edges[0], floorX: Number(floor.x), floorY: Number(floor.y), floor };
}

function wallPlacementCandidate(worldX, worldY, kind = selectedBuildPiece) {
  const candidate = rawWallPlacementCandidate(worldX, worldY);
  if (!candidate) return null;
  // v418: boundaries may sit between two floor tiles. This enables interior
  // partitions, rooms, cave-like layouts, and later editing inside an already
  // completed roof without treating adjacent floor as an invalid placement.
  // A door is still a deliberate opening in an established wall run.
  if (kind === "woodDoor" && !doorCandidateHasFlankingWalls(candidate)) return null;
  return candidate;
}

function drawWallEdgeHighlight(candidate, camX, camY, valid = true) {
  if (!candidate) return;
  const x = Math.round(candidate.x - camX);
  const y = Math.round(candidate.y - camY);
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = valid ? "#ffe38b" : "#e86f62";
  if (candidate.axis === "vertical") ctx.fillRect(x - 1, y - 8, 2, 16);
  else ctx.fillRect(x - 8, y - 1, 16, 2);
  ctx.restore();
}

function drawBuildCursorMarker(worldX, worldY, camX, camY, valid = false) {
  const x = Math.round(worldX - camX);
  const y = Math.round(worldY - camY);
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = valid ? "#ffe38b" : "#e86f62";
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 4.5, y - 4.5, 9, 9);
  ctx.restore();
}

function selectedBuildPlacementWorldPoint(camX = currentCamX, camY = currentCamY) {
  if (
    typeof mobileControlsEnabled !== "undefined" &&
    mobileControlsEnabled &&
    typeof mobileBuildCursorWorldPoint === "function"
  ) {
    const mobilePoint = mobileBuildCursorWorldPoint();
    if (mobilePoint) return mobilePoint;
  }
  return {
    x: camX + mouseCanvasX,
    y: camY + mouseCanvasY
  };
}

function buildPlacementWithinRange(x, y) {
  return Math.hypot(Number(x) - Number(player.x), Number(y) - Number(player.y)) <= BUILD_PLACE_RANGE;
}

function torchAttachedToSupport(supportId) {
  return Boolean(supportId) && currentMapStructures().some(structure =>
    structure?.kind === "torch" && structure?.supportId === supportId
  );
}

function torchWallSupportAtWorldPoint(worldX, worldY) {
  let best = null;
  let bestDistance = Infinity;
  for (const structure of currentMapStructures()) {
    if (structure?.kind !== "woodWall") continue;
    const distance = pointDistanceToRect(worldX, worldY, pickaxeStructurePointerBounds(structure));
    if (distance > 2.5 || distance >= bestDistance) continue;
    best = structure;
    bestDistance = distance;
  }
  return best;
}

function chestPlacementCandidate(worldX, worldY) {
  const x = Math.round(worldX / BUILD_GRID_SIZE) * BUILD_GRID_SIZE;
  const y = Math.round(worldY / BUILD_GRID_SIZE) * BUILD_GRID_SIZE;
  const floor = currentMapStructures().find(structure =>
    BUILD_FLOOR_STRUCTURE_KINDS.includes(structure?.kind) &&
    Math.abs(Number(structure.x) - x) < 1 &&
    Math.abs(Number(structure.y) - y) < 1
  ) || null;
  const occupied = currentMapStructures().some(structure =>
    STRUCTURE_TOPOLOGY.layerOf(structure) === STRUCTURE_TOPOLOGY.LAYERS.OBJECT &&
    Math.abs(Number(structure.x) - x) < 1 &&
    Math.abs(Number(structure.y) - y) < 1
  );
  return { x, y, valid: Boolean(floor) && !occupied };
}

function craftingTablePlacementCandidate(worldX, worldY) {
  const x = Math.round(worldX / BUILD_GRID_SIZE) * BUILD_GRID_SIZE;
  const y = Math.round(worldY / BUILD_GRID_SIZE) * BUILD_GRID_SIZE;
  const occupied = currentMapStructures().some(structure =>
    STRUCTURE_TOPOLOGY.layerOf(structure) === STRUCTURE_TOPOLOGY.LAYERS.OBJECT &&
    Math.abs(Number(structure.x) - x) < 1 &&
    Math.abs(Number(structure.y) - y) < 1
  );
  return { x, y, valid: !occupied };
}

function torchPlacementCandidate(worldX, worldY) {
  const wall = torchWallSupportAtWorldPoint(worldX, worldY);
  if (wall) {
    return {
      x: Number(wall.x),
      y: Number(wall.y),
      supportId: wall.id,
      mountType: "wall",
      mountAxis: wall.axis === "vertical" ? "vertical" : "horizontal",
      mountSide: wall.axis === "vertical"
        ? (Number(player.x) < Number(wall.x) ? "west" : "east")
        : (Number(player.y) < Number(wall.y) ? "north" : "south"),
      valid: !torchAttachedToSupport(wall.id)
    };
  }

  const floor = floorAtWorldPoint(worldX, worldY);
  if (floor) {
    return {
      x: Number(floor.x),
      y: Number(floor.y),
      supportId: floor.id,
      mountType: "floor",
      valid: !torchAttachedToSupport(floor.id)
    };
  }

  return {
    x: Math.round(worldX / BUILD_GRID_SIZE) * BUILD_GRID_SIZE,
    y: Math.round(worldY / BUILD_GRID_SIZE) * BUILD_GRID_SIZE,
    supportId: null,
    mountType: "ground",
    valid: true
  };
}

function tryPlaceSelectedBuildPieceAtWorld(worldX, worldY) {
  if (!selectedBuildPiece) return false;
  if (buildPieceCount(selectedBuildPiece) <= 0) {
    cancelBuildPlacement(true);
    return true;
  }

  if (selectedBuildPiece === "woodWall" || selectedBuildPiece === "woodDoor") {
    const candidate = wallPlacementCandidate(worldX, worldY, selectedBuildPiece);
    if (!candidate || !buildPlacementWithinRange(candidate.x, candidate.y)) return true;
    if (typeof onlineClient !== "undefined" && onlineClient?.connected) {
      onlineClient.requestStructurePlacement(selectedBuildPiece, candidate.floorX, candidate.floorY, candidate.edge);
    }
    return true;
  }

  if (selectedBuildPiece === "craftingTable") {
    const candidate = craftingTablePlacementCandidate(worldX, worldY);
    if (!candidate.valid || !buildPlacementWithinRange(candidate.x, candidate.y)) return true;
    if (typeof onlineClient !== "undefined" && onlineClient?.connected) {
      onlineClient.requestStructurePlacement("craftingTable", candidate.x, candidate.y);
    }
    return true;
  }


  if (selectedBuildPiece === "chest") {
    const candidate = chestPlacementCandidate(worldX, worldY);
    if (!candidate.valid || !buildPlacementWithinRange(candidate.x, candidate.y)) return true;
    if (typeof onlineClient !== "undefined" && onlineClient?.connected) {
      onlineClient.requestStructurePlacement("chest", candidate.x, candidate.y);
    }
    return true;
  }

  if (selectedBuildPiece === "torch") {
    const candidate = torchPlacementCandidate(worldX, worldY);
    if (!candidate.valid || !buildPlacementWithinRange(candidate.x, candidate.y)) return true;
    if (typeof onlineClient !== "undefined" && onlineClient?.connected) {
      onlineClient.requestStructurePlacement("torch", candidate.x, candidate.y, null, candidate.supportId);
    }
    return true;
  }

  const x = Math.round(worldX / BUILD_GRID_SIZE) * BUILD_GRID_SIZE;
  const y = Math.round(worldY / BUILD_GRID_SIZE) * BUILD_GRID_SIZE;
  if (!buildPlacementWithinRange(x, y)) return true;
  if (typeof onlineClient !== "undefined" && onlineClient?.connected) {
    onlineClient.requestStructurePlacement(selectedBuildPiece, x, y);
  }
  return true;
}

function tryPlaceSelectedBuildPiece(event) {
  if (!selectedBuildPiece) return false;
  if (event.button !== 0) return true;
  const pointer = getCanvasPointerPosition(event);
  return tryPlaceSelectedBuildPieceAtWorld(
    currentCamX + pointer.x,
    currentCamY + pointer.y
  );
}

function drawBuildPlacementPreview(camX, camY) {
  if (!selectedBuildPiece) return;
  // v430: on touch devices, simply holding a placeable is not the same as
  // choosing a placement target. Suppress the ghost entirely until the player
  // has tapped the world and established the mobile build cursor.
  if (
    typeof mobileControlsEnabled !== "undefined" &&
    mobileControlsEnabled &&
    typeof mobileBuildCursorWorldPoint === "function" &&
    !mobileBuildCursorWorldPoint()
  ) return;
  const point = selectedBuildPlacementWorldPoint(camX, camY);
  const worldX = point.x;
  const worldY = point.y;

  if (selectedBuildPiece === "woodWall" || selectedBuildPiece === "woodDoor") {
    const candidate = wallPlacementCandidate(worldX, worldY, selectedBuildPiece);
    if (!candidate) {
      const rawCandidate = rawWallPlacementCandidate(worldX, worldY);
      if (rawCandidate) drawWallEdgeHighlight(rawCandidate, camX, camY, false);
      else drawBuildCursorMarker(worldX, worldY, camX, camY, false);
      return;
    }

    const inRange = buildPlacementWithinRange(candidate.x, candidate.y);
    drawWallEdgeHighlight(candidate, camX, camY, inRange);
    const preview = { kind: selectedBuildPiece, x: candidate.x, y: candidate.y, axis: candidate.axis };
    if (selectedBuildPiece === "woodDoor") drawWoodDoor(preview, camX, camY, inRange ? 0.42 : 0.18);
    else drawWoodWall(preview, camX, camY, inRange ? 0.42 : 0.18);
    return;
  }

  if (selectedBuildPiece === "craftingTable") {
    const candidate = craftingTablePlacementCandidate(worldX, worldY);
    const valid = candidate.valid && buildPlacementWithinRange(candidate.x, candidate.y);
    drawCraftingTableStructure(
      { kind: "craftingTable", x: candidate.x, y: candidate.y },
      camX,
      camY,
      valid ? 0.72 : 0.22
    );
    if (!valid) drawBuildCursorMarker(candidate.x, candidate.y, camX, camY, false);
    return;
  }

  if (selectedBuildPiece === "chest") {
    const candidate = chestPlacementCandidate(worldX, worldY);
    const valid = candidate.valid && buildPlacementWithinRange(candidate.x, candidate.y);
    drawChestStructure({ kind: "chest", x: candidate.x, y: candidate.y, opened: false }, camX, camY, valid ? 0.7 : 0.22);
    if (!valid) drawBuildCursorMarker(candidate.x, candidate.y, camX, camY, false);
    return;
  }

  if (selectedBuildPiece === "torch") {
    const candidate = torchPlacementCandidate(worldX, worldY);
    const inRange = buildPlacementWithinRange(candidate.x, candidate.y);
    const valid = candidate.valid && inRange;
    drawPlacedTorch(
      {
        kind: "torch",
        x: candidate.x,
        y: candidate.y,
        mountType: candidate.mountType,
        mountAxis: candidate.mountAxis,
        mountSide: candidate.mountSide
      },
      camX,
      camY,
      valid ? 0.72 : 0.24
    );
    if (!valid) drawBuildCursorMarker(candidate.x, candidate.y, camX, camY, false);
    return;
  }

  const x = Math.round(worldX / BUILD_GRID_SIZE) * BUILD_GRID_SIZE;
  const y = Math.round(worldY / BUILD_GRID_SIZE) * BUILD_GRID_SIZE;
  const inRange = buildPlacementWithinRange(x, y);
  drawStructureFloor({ kind: selectedBuildPiece, x, y }, camX, camY, inRange ? 0.55 : 0.2);
  if (!inRange) drawBuildCursorMarker(x, y, camX, camY, false);
}

// -----------------------------------------------------------------------------
// RUNTIME HELPERS / SYSTEM UTILITIES
// -----------------------------------------------------------------------------


function worldPositionIsOpen(x, y, options = {}) {
  // Water is traversable for players. Void/solid geometry still blocks.
  return !hitsSolidObstacle(x, y, options);
}

function moveWithWorldCollision(entity, nextX, nextY) {
  const startX = entity.x;
  const startY = entity.y;
  if (worldPositionIsOpen(nextX, startY, { fromX: startX, fromY: startY })) {
    entity.x = nextX;
  }

  if (worldPositionIsOpen(entity.x, nextY, { fromX: entity.x, fromY: startY })) {
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

// v389 shared day/night clock. The server sends one anchor on connect; clients
// advance it locally from performance.now(), so the clock and lighting stay in
// sync without periodic network packets. Offline/local fallback starts at 08:00.
const WORLD_CLOCK_MINUTES_PER_DAY = 24 * 60;
const WORLD_CLOCK_DEFAULT_REAL_MS_PER_GAME_MINUTE = 500;
let worldClockAnchorGameMinutes = 8 * 60;
let worldClockAnchorAbsoluteGameMinutes = 8 * 60;
let worldClockAnchorLocalMs = performance.now();
let worldClockRealMsPerGameMinute = WORLD_CLOCK_DEFAULT_REAL_MS_PER_GAME_MINUTE;
let worldClockLastHudMinute = null;

function applyWorldClockSnapshot(snapshot) {
  if (!snapshot || !Number.isFinite(Number(snapshot.gameMinutes))) return false;
  const realMsPerGameMinute = Number(snapshot.realMsPerGameMinute);
  worldClockAnchorGameMinutes = ((Number(snapshot.gameMinutes) % WORLD_CLOCK_MINUTES_PER_DAY) + WORLD_CLOCK_MINUTES_PER_DAY) % WORLD_CLOCK_MINUTES_PER_DAY;
  worldClockAnchorAbsoluteGameMinutes = Number.isFinite(Number(snapshot.absoluteGameMinutes))
    ? Number(snapshot.absoluteGameMinutes)
    : worldClockAnchorGameMinutes;
  worldClockAnchorLocalMs = performance.now();
  worldClockRealMsPerGameMinute = Number.isFinite(realMsPerGameMinute) && realMsPerGameMinute > 0
    ? realMsPerGameMinute
    : WORLD_CLOCK_DEFAULT_REAL_MS_PER_GAME_MINUTE;
  worldClockLastHudMinute = null;
  updateWorldClockHud();
  return true;
}

function currentWorldClockAbsoluteMinutes() {
  const elapsedRealMs = Math.max(0, performance.now() - worldClockAnchorLocalMs);
  return worldClockAnchorAbsoluteGameMinutes +
    elapsedRealMs / Math.max(1, worldClockRealMsPerGameMinute);
}

function currentWorldClockMinutes() {
  const absoluteMinutes = currentWorldClockAbsoluteMinutes();
  return ((absoluteMinutes % WORLD_CLOCK_MINUTES_PER_DAY) + WORLD_CLOCK_MINUTES_PER_DAY) % WORLD_CLOCK_MINUTES_PER_DAY;
}

function currentMapRainIntensity() {
  if (typeof WEATHER_RULES === "undefined" || !WEATHER_RULES?.rainIntensity) return 0;
  return WEATHER_RULES.rainIntensity(
    Number(WORLD_CONTENT?.worldSeed) || 0,
    currentMapId,
    currentWorldClockAbsoluteMinutes()
  );
}

function currentMapIsRaining() {
  if (typeof WEATHER_RULES === "undefined") return false;
  if (typeof WEATHER_RULES.isRaining === "function") {
    return WEATHER_RULES.isRaining(
      Number(WORLD_CONTENT?.worldSeed) || 0,
      currentMapId,
      currentWorldClockAbsoluteMinutes()
    );
  }
  return currentMapRainIntensity() > 0.04;
}

function worldClockPhase(minutes = currentWorldClockMinutes()) {
  const hour = minutes / 60;
  if (hour >= 20 || hour < 5) return "NIGHT";
  if (hour < 7) return "DAWN";
  if (hour < 18) return "DAY";
  return "DUSK";
}

const WORLD_DARKNESS_COLOR = "#020307";
const INTERIOR_DAY_AMBIENT_ALPHA = 0.54;
const LOCAL_NIGHT_SIGHT_RADIUS = 18;

function worldClockLightingAlpha(minutes = currentWorldClockMinutes()) {
  const hour = minutes / 60;

  // v418: midnight is now effectively black away from local/placed light. The
  // ramp still leaves dusk and dawn readable while making torches genuinely
  // necessary during the deepest part of the night.
  const duskNightAlpha = 0.68;
  const midnightAlpha = 0.992;
  const preDawnAlpha = 0.72;

  if (hour >= 20) {
    const t = Math.max(0, Math.min(1, (hour - 20) / 4));
    return duskNightAlpha + (midnightAlpha - duskNightAlpha) * t;
  }
  if (hour < 5) {
    const t = Math.max(0, Math.min(1, hour / 5));
    return midnightAlpha + (preDawnAlpha - midnightAlpha) * t;
  }
  if (hour < 7) {
    return preDawnAlpha * (1 - (hour - 5) / 2);
  }
  if (hour >= 18 && hour < 20) {
    return duskNightAlpha * ((hour - 18) / 2);
  }
  return 0;
}

function activeInteriorAmbientAlpha(outdoorAlpha = worldClockLightingAlpha()) {
  // Finished roof regions are dim even at noon. As outdoor darkness overtakes
  // the room's baseline, use the stronger value rather than double-darkening.
  return Math.max(INTERIOR_DAY_AMBIENT_ALPHA, Math.max(0, Number(outdoorAlpha) || 0));
}

// v417: ordinary painted ground shadows belong to sunlight, not ambient
// darkness. Fade them through dusk/dawn and remove them completely once the
// night lighting reaches its established 20:00 level. This is presentation
// only and never enters multiplayer state.
function worldClockSunShadowFactor(minutes = currentWorldClockMinutes()) {
  const darkness = worldClockLightingAlpha(minutes);
  return Math.max(0, Math.min(1, 1 - darkness / 0.68));
}

// Passing cloud shadows are intentionally client-only atmosphere. They do not
// represent gameplay weather and therefore require no server state, heartbeat,
// or replication. A pass is generated only occasionally during daylight and
// moves in world space so walking/camera motion does not pin it to the screen.
const CLOUD_SHADOW_MIN_GAP_SECONDS = 30;
const CLOUD_SHADOW_MAX_GAP_SECONDS = 62;
let cloudShadowPass = null;
let cloudShadowNextAt = 12 + Math.random() * 18;
let cloudShadowMapId = null;

function cloudShadowDaylightFactor(minutes = currentWorldClockMinutes()) {
  const sunFactor = worldClockSunShadowFactor(minutes);
  // Keep them subtle around dawn/dusk and absent at night.
  return Math.max(0, Math.min(1, (sunFactor - 0.12) / 0.88));
}

function scheduleNextCloudShadow(now = worldTime) {
  cloudShadowNextAt = now + CLOUD_SHADOW_MIN_GAP_SECONDS +
    Math.random() * (CLOUD_SHADOW_MAX_GAP_SECONDS - CLOUD_SHADOW_MIN_GAP_SECONDS);
}

function beginCloudShadowPass(camX, camY) {
  const duration = 10 + Math.random() * 6;
  const direction = Math.random() < 0.5 ? 1 : -1;
  const margin = 130;
  const startX = direction > 0
    ? camX - margin
    : camX + VIEW_W + margin;
  const startY = camY + 24 + Math.random() * Math.max(28, VIEW_H - 48);
  const travel = VIEW_W + margin * 2 + 180;
  const bankCount = 2 + Math.floor(Math.random() * 3);
  const banks = [];

  for (let bankIndex = 0; bankIndex < bankCount; bankIndex += 1) {
    const pointCount = 12 + Math.floor(Math.random() * 5);
    const radial = [];
    for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
      const wave = Math.sin(pointIndex * 1.73 + bankIndex * 0.8) * 0.10;
      radial.push(0.82 + wave + Math.random() * 0.24);
    }
    banks.push({
      ox: (bankIndex - (bankCount - 1) / 2) * (64 + Math.random() * 34) + (Math.random() - 0.5) * 24,
      oy: (Math.random() - 0.5) * 42,
      rx: 76 + Math.random() * 58,
      ry: 20 + Math.random() * 24,
      angle: (Math.random() - 0.5) * 0.22,
      alpha: 0.035 + Math.random() * 0.026,
      radial
    });
  }

  const wisps = Array.from({ length: 3 + Math.floor(Math.random() * 4) }, (_, index) => ({
    ox: (index - 2) * (42 + Math.random() * 25) + (Math.random() - 0.5) * 35,
    oy: 18 + (Math.random() - 0.5) * 58,
    rx: 34 + Math.random() * 50,
    ry: 6 + Math.random() * 11,
    angle: (Math.random() - 0.5) * 0.35,
    alpha: 0.018 + Math.random() * 0.018
  }));

  cloudShadowPass = {
    mapId: currentMapId,
    startedAt: worldTime,
    duration,
    startX,
    startY,
    vx: direction * travel / duration,
    vy: (Math.random() - 0.5) * 4,
    banks,
    wisps
  };
}

function traceIrregularCloudBank(pathCtx, centerX, centerY, bank, scale = 1) {
  const radial = Array.isArray(bank?.radial) ? bank.radial : [];
  if (radial.length < 3) return false;
  const points = radial.map((radiusFactor, index) => {
    const angle = index / radial.length * Math.PI * 2;
    return {
      x: Math.cos(angle) * bank.rx * scale * radiusFactor,
      y: Math.sin(angle) * bank.ry * scale * radiusFactor
    };
  });

  pathCtx.save();
  pathCtx.translate(centerX, centerY);
  pathCtx.rotate(bank.angle || 0);
  pathCtx.beginPath();
  const firstMid = {
    x: (points[points.length - 1].x + points[0].x) * 0.5,
    y: (points[points.length - 1].y + points[0].y) * 0.5
  };
  pathCtx.moveTo(firstMid.x, firstMid.y);
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const midpointX = (current.x + next.x) * 0.5;
    const midpointY = (current.y + next.y) * 0.5;
    pathCtx.quadraticCurveTo(current.x, current.y, midpointX, midpointY);
  }
  pathCtx.closePath();
  pathCtx.fill();
  pathCtx.restore();
  return true;
}

function applyCloudShadowInteriorClip(camX, camY) {
  const interiorRegion = typeof activeInteriorRoofRegion === "function"
    ? activeInteriorRoofRegion()
    : null;
  if (!interiorRegion?.floors?.length) return;

  // The roof is hidden while the local player is inside. Cut that revealed
  // room out of the overhead-cloud layer so an outdoor cloud cannot visibly
  // pass through a closed building interior.
  ctx.beginPath();
  ctx.rect(0, 0, VIEW_W, VIEW_H);
  for (const floor of interiorRegion.floors) {
    const x = Number(floor?.x);
    const y = Number(floor?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    ctx.rect(
      Math.floor(x - camX - 8),
      Math.floor(y - camY - 8),
      16,
      16
    );
  }
  ctx.clip("evenodd");
}

function drawCloudShadows(camX, camY) {
  if (cloudShadowMapId !== currentMapId) {
    cloudShadowMapId = currentMapId;
    cloudShadowPass = null;
    scheduleNextCloudShadow(worldTime + 4 + Math.random() * 8);
  }

  const rainSuppression = Math.max(0, 1 - currentMapRainIntensity() * 1.2);
  const daylight = cloudShadowDaylightFactor() * rainSuppression;
  if (daylight <= 0.001) return;

  if (!cloudShadowPass && worldTime >= cloudShadowNextAt) {
    beginCloudShadowPass(camX, camY);
  }
  if (!cloudShadowPass) return;

  const age = worldTime - cloudShadowPass.startedAt;
  if (age >= cloudShadowPass.duration || cloudShadowPass.mapId !== currentMapId) {
    cloudShadowPass = null;
    scheduleNextCloudShadow();
    return;
  }

  const fadeIn = Math.min(1, Math.max(0, age / 1.1));
  const fadeOut = Math.min(1, Math.max(0, (cloudShadowPass.duration - age) / 1.4));
  const passAlpha = daylight * fadeIn * fadeOut;
  const centerX = cloudShadowPass.startX + cloudShadowPass.vx * age - camX;
  const centerY = cloudShadowPass.startY + cloudShadowPass.vy * age - camY;

  ctx.save();
  applyCloudShadowInteriorClip(camX, camY);
  ctx.fillStyle = "#182b24";

  for (const bank of cloudShadowPass.banks || []) {
    const x = centerX + bank.ox;
    const y = centerY + bank.oy;
    if (x + bank.rx * 1.3 < -12 || x - bank.rx * 1.3 > VIEW_W + 12 ||
        y + bank.ry * 1.5 < -12 || y - bank.ry * 1.5 > VIEW_H + 12) continue;

    // Irregular stretched banks avoid the obvious "pile of circles" look. A
    // larger faint pass creates the penumbra, then a denser inner silhouette
    // gives the cloud body subtle mottled variation without blur filters.
    ctx.globalAlpha = passAlpha * bank.alpha * 0.42;
    traceIrregularCloudBank(ctx, x, y, bank, 1.16);
    ctx.globalAlpha = passAlpha * bank.alpha;
    traceIrregularCloudBank(ctx, x, y, bank, 1);
  }

  for (const wisp of cloudShadowPass.wisps || []) {
    const x = centerX + wisp.ox;
    const y = centerY + wisp.oy;
    ctx.globalAlpha = passAlpha * wisp.alpha;
    ctx.beginPath();
    ctx.ellipse(x, y, wisp.rx, wisp.ry, wisp.angle || 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawMapRainOverlay() {
  const intensity = currentMapRainIntensity();
  if (intensity <= 0.01) return;

  const seedPrefix = `${Number(WORLD_CONTENT?.worldSeed) || 0}:${currentMapId}:rain`;
  const columnSpacing = 12;
  const columnCount = Math.ceil((VIEW_W + columnSpacing) / columnSpacing);
  const dropsPerColumn = Math.max(1, 1 + Math.round(3 * intensity));
  const ySpan = VIEW_H + 28;

  ctx.save();
  // Shelter is still purely topology-driven, but the visible rain itself is a
  // screen-space sheet. v421 distributes drops by lanes across the full logical
  // viewport instead of relying on a small random cloud of particles that could
  // leave half of a wide screen visually dry while gameplay correctly stayed Wet.
  applyCloudShadowInteriorClip(currentCamX, currentCamY);

  ctx.globalAlpha = 0.035 * intensity;
  ctx.fillStyle = "#2b3944";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.fillStyle = "#b8cad2";
  for (let column = 0; column < columnCount; column += 1) {
    for (let row = 0; row < dropsPerColumn; row += 1) {
      const key = `${seedPrefix}:${column}:${row}`;
      const jitter = stableTorchLightSeed(`${key}:x`) / (Math.PI * 2);
      const seedY = stableTorchLightSeed(`${key}:y`) / (Math.PI * 2);
      const seedSpeed = stableTorchLightSeed(`${key}:s`) / (Math.PI * 2);
      const speed = 66 + seedSpeed * 52;
      const drift = 9 + seedSpeed * 8;
      const baseY = ((row + seedY) / dropsPerColumn) * ySpan;
      const travel = baseY + worldTime * speed;
      const wrap = Math.floor(travel / ySpan);
      const y = ((travel % ySpan) + ySpan) % ySpan - 14;
      const laneX = column * columnSpacing + (jitter - 0.5) * (columnSpacing * 0.72);
      const shiftedX = laneX - worldTime * drift + wrap * 7;
      const x = ((shiftedX % (VIEW_W + columnSpacing)) + (VIEW_W + columnSpacing)) % (VIEW_W + columnSpacing) - 6;

      ctx.globalAlpha = intensity * (0.13 + seedSpeed * 0.10);
      const length = 3 + Math.round(seedSpeed * 3);
      ctx.fillRect(Math.round(x), Math.round(y), 1, length);
      if (seedSpeed > 0.62) {
        ctx.fillRect(Math.round(x - 1), Math.round(y + length - 1), 1, 1);
      }
    }
  }
  ctx.restore();
}

function formatWorldClock(minutes = currentWorldClockMinutes()) {
  const wholeMinutes = Math.floor(minutes) % WORLD_CLOCK_MINUTES_PER_DAY;
  const hour = Math.floor(wholeMinutes / 60);
  const minute = wholeMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function updateWorldClockHud() {
  const hud = document.getElementById("worldClockHud");
  if (!hud) return;
  const minutes = currentWorldClockMinutes();
  const wholeMinute = Math.floor(minutes);
  if (wholeMinute === worldClockLastHudMinute) return;
  worldClockLastHudMinute = wholeMinute;
  const phase = worldClockPhase(minutes);
  hud.textContent = `${formatWorldClock(minutes)} · ${phase}`;
  hud.dataset.phase = phase.toLowerCase();
  hud.setAttribute("aria-label", `World time ${formatWorldClock(minutes)}, ${phase.toLowerCase()}`);
}

let worldLightingCanvas = null;
let worldLightingContext = null;

function ensureWorldLightingBuffer() {
  if (!worldLightingCanvas) {
    worldLightingCanvas = document.createElement("canvas");
    worldLightingContext = worldLightingCanvas.getContext("2d");
  }
  if (worldLightingCanvas.width !== VIEW_W || worldLightingCanvas.height !== VIEW_H) {
    worldLightingCanvas.width = VIEW_W;
    worldLightingCanvas.height = VIEW_H;
  }
  return worldLightingContext;
}

const TORCH_LIGHT_RAY_COUNT = 64;
const TORCH_LIGHT_RAY_EPSILON = 0.0008;
const torchLightVisibilityCache = new Map();

function torchLightBlockingSegments(sourceX, sourceY, radius) {
  const segments = [];
  const maxDistance = radius + 18;
  for (const structure of currentMapStructures()) {
    const blocks = structure?.kind === "woodWall" ||
      (structure?.kind === "woodDoor" && !doorVisuallyOpen(structure));
    if (!blocks) continue;

    const x = Number(structure.x);
    const y = Number(structure.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (Math.hypot(x - sourceX, y - sourceY) > maxDistance) continue;

    // v408: light, collision and attack blocking now start from the same
    // canonical boundary segment. A tiny tangential overlap seals connected
    // corners against floating-point/ray gaps without making the wall thicker.
    const boundary = STRUCTURE_GEOMETRY.lightBarrierSegment(structure, 0.4);
    if (!boundary) continue;
    segments.push({ id: structure.id, ...boundary });
  }
  return segments;
}

function raySegmentIntersectionDistance(originX, originY, rayX, rayY, segment) {
  return STRUCTURE_GEOMETRY.raySegmentIntersectionDistance(
    originX, originY, rayX, rayY, segment, 0.08
  );
}

function heldItemOcclusionAllowsStructure(structure, sourceY) {
  // v407: gameplay collision and visual occlusion are deliberately separate.
  // A structure only hides a held-item pixel when that structure would be drawn
  // in front of the local player by the world's normal Y-sort. In particular,
  // a horizontal wall behind/below the player may still block the attack, but
  // it must not erase the sword/torch that is visually in front of that wall.
  if (!structure || !Number.isFinite(Number(sourceY))) return false;
  return wallDrawSortY(structure) > Number(sourceY) + 0.01;
}

function torchLightVisibilityPolygon(sourceX, sourceY, radius, cacheKey = null) {
  let blockers = torchLightBlockingSegments(sourceX, sourceY, radius);
  if (cacheKey === "held-item") {
    const structuresById = new Map(currentMapStructures().map(structure => [structure?.id, structure]));
    blockers = blockers.filter(segment =>
      heldItemOcclusionAllowsStructure(structuresById.get(segment.id), sourceY)
    );
  }
  const signature = `${currentMapId}:${placedStructureRevision}:${cacheKey === "held-item" ? "held" : "light"}:${blockers.map(segment => segment.id).sort().join(",")}`;

  if (cacheKey) {
    const cached = torchLightVisibilityCache.get(cacheKey);
    if (
      cached?.signature === signature &&
      Math.abs(cached.sourceX - sourceX) < 0.01 &&
      Math.abs(cached.sourceY - sourceY) < 0.01 &&
      Math.abs(cached.radius - radius) < 0.01
    ) return cached.points;
  }

  const angles = [];
  for (let index = 0; index < TORCH_LIGHT_RAY_COUNT; index += 1) {
    angles.push(index / TORCH_LIGHT_RAY_COUNT * Math.PI * 2 - Math.PI);
  }
  for (const segment of blockers) {
    for (const [x, y] of [[segment.x1, segment.y1], [segment.x2, segment.y2]]) {
      const angle = Math.atan2(y - sourceY, x - sourceX);
      angles.push(angle - TORCH_LIGHT_RAY_EPSILON, angle, angle + TORCH_LIGHT_RAY_EPSILON);
    }
  }
  angles.sort((a, b) => a - b);

  const points = angles.map(angle => {
    const rayX = Math.cos(angle);
    const rayY = Math.sin(angle);
    let distance = radius;
    for (const blocker of blockers) {
      const hit = raySegmentIntersectionDistance(sourceX, sourceY, rayX, rayY, blocker);
      if (hit !== null && hit < distance) distance = hit;
    }
    return {
      x: sourceX + rayX * distance,
      y: sourceY + rayY * distance
    };
  });

  if (cacheKey) {
    if (torchLightVisibilityCache.size > 192) torchLightVisibilityCache.clear();
    torchLightVisibilityCache.set(cacheKey, {
      signature,
      sourceX,
      sourceY,
      radius,
      points
    });
  }
  return points;
}

function carveTorchLight(
  bufferCtx,
  worldX,
  worldY,
  radius,
  seed = 0,
  cacheKey = null,
  visibilityOriginX = worldX,
  visibilityOriginY = worldY
) {
  if (!bufferCtx || !Number.isFinite(worldX) || !Number.isFinite(worldY)) return;
  if (!Number.isFinite(visibilityOriginX) || !Number.isFinite(visibilityOriginY)) return;
  const flicker =
    Math.sin(worldTime * 12.7 + seed) * 2.2 +
    Math.sin(worldTime * 19.3 + seed * 0.37) * 1.2;
  const lightRadius = Math.max(34, radius + flicker);
  // v412: rendering and topology origins may intentionally differ (most
  // notably a floor Torch whose flame is raised above its floor anchor). Grow
  // the visibility envelope by that offset so decoupling occlusion from the
  // flame does not trim the otherwise unchanged circular light radius in open
  // space.
  const originOffset = Math.hypot(worldX - visibilityOriginX, worldY - visibilityOriginY);
  const visibilityRadius = radius + originOffset + 6;
  const polygon = torchLightVisibilityPolygon(
    visibilityOriginX,
    visibilityOriginY,
    visibilityRadius,
    cacheKey
  );
  if (!polygon.length) return;

  const screenX = worldX - currentCamX;
  const screenY = worldY - currentCamY;
  const gradient = bufferCtx.createRadialGradient(
    screenX,
    screenY,
    0,
    screenX,
    screenY,
    lightRadius
  );
  gradient.addColorStop(0, "rgba(0,0,0,0.98)");
  gradient.addColorStop(0.24, "rgba(0,0,0,0.94)");
  gradient.addColorStop(0.62, "rgba(0,0,0,0.58)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");

  bufferCtx.save();
  bufferCtx.beginPath();
  bufferCtx.moveTo(polygon[0].x - currentCamX, polygon[0].y - currentCamY);
  for (let index = 1; index < polygon.length; index += 1) {
    bufferCtx.lineTo(polygon[index].x - currentCamX, polygon[index].y - currentCamY);
  }
  bufferCtx.closePath();
  bufferCtx.clip();
  bufferCtx.globalCompositeOperation = "destination-out";
  bufferCtx.fillStyle = gradient;
  bufferCtx.fillRect(
    screenX - lightRadius,
    screenY - lightRadius,
    lightRadius * 2,
    lightRadius * 2
  );
  bufferCtx.restore();

}

function stableTorchLightSeed(value) {
  const text = String(value ?? "torch");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff * Math.PI * 2;
}

function collectTorchLightSources() {
  const sources = [];

  for (const structure of currentMapStructures()) {
    if (structure?.kind !== "torch") continue;
    const light = torchLightWorldPosition(structure);
    const visibility = torchVisibilityWorldPosition(structure);
    sources.push({
      key: `placed:${structure.id}`,
      x: light.x,
      y: light.y,
      visibilityX: visibility.x,
      visibilityY: visibility.y,
      radius: 74,
      seed: Number(structure.x) * 0.021 + Number(structure.y) * 0.013,
      structure
    });
  }

  if (selectedBuildPiece === "torch" && buildPieceCount("torch") > 0 && player.hp > 0) {
    sources.push({
      key: "held:local",
      x: Number(player.x),
      y: Number(player.y) - 10,
      visibilityX: Number(player.x),
      visibilityY: Number(player.y),
      radius: 68,
      seed: 9.7,
      ownerId: (typeof onlineClient !== "undefined" ? onlineClient?.localPlayerId : null) || "local"
    });
  }

  const remotes = typeof onlineClient !== "undefined" ? onlineClient?.remotePlayers : null;
  if (remotes?.values) {
    for (const remote of remotes.values()) {
      if (
        remote?.mapId !== currentMapId ||
        remote?.heldBuildPiece !== "torch" ||
        remote?.isDead ||
        Number(remote?.hp) <= 0
      ) continue;
      const rx = Number(remote.x);
      const ry = Number(remote.y);
      if (!Number.isFinite(rx) || !Number.isFinite(ry)) continue;
      sources.push({
        key: `held:${remote.id}`,
        x: rx,
        y: ry - 10,
        visibilityX: rx,
        visibilityY: ry,
        radius: 68,
        seed: stableTorchLightSeed(remote.id),
        ownerId: remote.id
      });
    }
  }

  return sources;
}

function structureBlocksLight(structure) {
  return Boolean(
    structure?.kind === "woodWall" ||
    (structure?.kind === "woodDoor" && !doorVisuallyOpen(structure))
  );
}

function structureFacadeWorldRect(structure) {
  return STRUCTURE_GEOMETRY.facadeRect(structure, {
    upperJoin: structure?.axis === "vertical" && verticalWallHasUpperHorizontalJoin(structure)
  });
}

function oppositeStructureBoundarySide(side) {
  if (side === "north") return "south";
  if (side === "south") return "north";
  if (side === "west") return "east";
  if (side === "east") return "west";
  return null;
}

function structureInteriorBoundarySide(structure, region) {
  if (!structure || !region?.floors) return null;
  const floorKeys = region.floorKeys || new Set(
    region.floors.map(floor => structureCellKey(floor.x, floor.y))
  );
  const x = Number(structure.x);
  const y = Number(structure.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  if (STRUCTURE_GEOMETRY.axisOf(structure) === "vertical") {
    const west = floorKeys.has(structureCellKey(x - 8, y));
    const east = floorKeys.has(structureCellKey(x + 8, y));
    if (west === east) return null;
    return west ? "west" : "east";
  }

  const north = floorKeys.has(structureCellKey(x, y - 8));
  const south = floorKeys.has(structureCellKey(x, y + 8));
  if (north === south) return null;
  return north ? "north" : "south";
}

function appendInteriorGroundPath(pathCtx, region, camX = currentCamX, camY = currentCamY) {
  if (!pathCtx || !region?.floors?.length) return false;
  let appended = false;
  for (const floor of region.floors) {
    const x = Number(floor?.x);
    const y = Number(floor?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    pathCtx.rect(
      Math.floor(x - camX - 8),
      Math.floor(y - camY - 8),
      16,
      16
    );
    appended = true;
  }
  return appended;
}

function restoreActiveInteriorAmbient(bufferCtx, region, alpha) {
  if (!bufferCtx || !region?.floors?.length || alpha <= 0.001) return;
  bufferCtx.save();
  bufferCtx.beginPath();
  if (!appendInteriorGroundPath(bufferCtx, region)) {
    bufferCtx.restore();
    return;
  }
  bufferCtx.clip();
  bufferCtx.clearRect(0, 0, VIEW_W, VIEW_H);
  bufferCtx.globalCompositeOperation = "source-over";
  bufferCtx.globalAlpha = alpha;
  bufferCtx.fillStyle = WORLD_DARKNESS_COLOR;
  bufferCtx.fillRect(0, 0, VIEW_W, VIEW_H);
  bufferCtx.restore();
}

function carveLocalPlayerNightSight(bufferCtx, outdoorAlpha) {
  if (!bufferCtx || player?.hp <= 0 || outdoorAlpha <= 0.42) return;
  const visibility = Math.max(0, Math.min(1, (outdoorAlpha - 0.42) / 0.57));
  if (visibility <= 0.001) return;
  const originX = Number(player.x);
  const originY = Number(player.y) - 5;
  const polygon = torchLightVisibilityPolygon(
    originX,
    Number(player.y),
    LOCAL_NIGHT_SIGHT_RADIUS + 4,
    "local-night-sight"
  );
  if (!polygon.length) return;

  const screenX = originX - currentCamX;
  const screenY = originY - currentCamY;
  const gradient = bufferCtx.createRadialGradient(
    screenX, screenY, 0,
    screenX, screenY, LOCAL_NIGHT_SIGHT_RADIUS
  );
  gradient.addColorStop(0, `rgba(0,0,0,${(0.34 * visibility).toFixed(3)})`);
  gradient.addColorStop(0.45, `rgba(0,0,0,${(0.18 * visibility).toFixed(3)})`);
  gradient.addColorStop(1, "rgba(0,0,0,0)");

  bufferCtx.save();
  bufferCtx.beginPath();
  bufferCtx.moveTo(polygon[0].x - currentCamX, polygon[0].y - currentCamY);
  for (let index = 1; index < polygon.length; index += 1) {
    bufferCtx.lineTo(polygon[index].x - currentCamX, polygon[index].y - currentCamY);
  }
  bufferCtx.closePath();
  bufferCtx.clip();
  bufferCtx.globalCompositeOperation = "destination-out";
  bufferCtx.fillStyle = gradient;
  bufferCtx.fillRect(
    screenX - LOCAL_NIGHT_SIGHT_RADIUS,
    screenY - LOCAL_NIGHT_SIGHT_RADIUS,
    LOCAL_NIGHT_SIGHT_RADIUS * 2,
    LOCAL_NIGHT_SIGHT_RADIUS * 2
  );
  bufferCtx.restore();
}

function carveOpenDoorDaylight(bufferCtx, region, outdoorAlpha) {
  if (!bufferCtx || !region?.floors?.length) return;
  const daylight = Math.max(0, Math.min(1, 1 - outdoorAlpha / 0.68));
  if (daylight <= 0.02) return;
  const doors = currentMapStructures().filter(structure =>
    structure?.kind === "woodDoor" &&
    structureBelongsToRoofFacade(structure, region) &&
    doorVisuallyOpen(structure)
  );
  if (!doors.length) return;

  bufferCtx.save();
  bufferCtx.beginPath();
  if (!appendInteriorGroundPath(bufferCtx, region)) {
    bufferCtx.restore();
    return;
  }
  bufferCtx.clip();
  bufferCtx.globalCompositeOperation = "destination-out";

  for (const door of doors) {
    const side = structureInteriorBoundarySide(door, region);
    if (!side) continue;
    let offsetX = 0;
    let offsetY = 0;
    if (side === "north") offsetY = -10;
    else if (side === "south") offsetY = 10;
    else if (side === "west") offsetX = -10;
    else if (side === "east") offsetX = 10;
    const x = Number(door.x) + offsetX - currentCamX;
    const y = Number(door.y) + offsetY - currentCamY;
    const radius = 38;
    const gradient = bufferCtx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(0,0,0,${(0.78 * daylight).toFixed(3)})`);
    gradient.addColorStop(0.45, `rgba(0,0,0,${(0.42 * daylight).toFixed(3)})`);
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    bufferCtx.fillStyle = gradient;
    bufferCtx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  bufferCtx.restore();
}

function visibleStructureLightFaceSide(structure) {
  // v409: a stationary wall no longer asks which side the local player happens
  // to be standing on. For a completed roofed room, the roof reveal state tells
  // us whether the rendered facade represents the interior or exterior face.
  // Standalone/incomplete walls have no hidden opposite facade, so either side
  // may illuminate the one surface that is actually drawn.
  const region = automaticRoofRegions().find(candidate =>
    structureBelongsToRoofFacade(structure, candidate)
  );
  if (!region) return null;
  const interiorSide = structureInteriorBoundarySide(structure, region);
  if (!interiorSide) return null;
  return playerInsideRoofRegion(region)
    ? interiorSide
    : oppositeStructureBoundarySide(interiorSide);
}

function restoreStructureFacadeAmbient(bufferCtx, alpha, interiorRegion = activeInteriorRoofRegion(), interiorAlpha = activeInteriorAmbientAlpha(alpha)) {
  // v408/v418: wall facades remain their own receiver surface. When the local
  // player is inside a completed room, its interior-facing walls inherit the
  // room's darker ambient baseline instead of noon-bright outdoor ambience.
  bufferCtx.save();
  bufferCtx.globalCompositeOperation = "source-over";
  bufferCtx.fillStyle = WORLD_DARKNESS_COLOR;
  for (const structure of currentMapStructures()) {
    if (!structureBlocksLight(structure)) continue;
    const rect = structureFacadeWorldRect(structure);
    if (!rect) continue;
    const x = Math.round(rect.x - currentCamX);
    const y = Math.round(rect.y - currentCamY);
    const width = Math.ceil(rect.width);
    const height = Math.ceil(rect.height);
    const structureAlpha = interiorRegion && structureBelongsToRoofFacade(structure, interiorRegion)
      ? interiorAlpha
      : alpha;
    bufferCtx.clearRect(x, y, width, height);
    bufferCtx.globalAlpha = structureAlpha;
    bufferCtx.fillRect(x, y, width, height);
  }
  bufferCtx.restore();
}

function visibleRoofLightingRegions() {
  return automaticRoofRegions().filter(region => !playerInsideRoofRegion(region));
}

function restoreVisibleRoofSurfaceAmbient(bufferCtx, alpha, regions = visibleRoofLightingRegions()) {
  if (!bufferCtx || !regions.length) return;

  // v410: roofs are a separate rendered surface, just like wall facades. The
  // ground-plane Torch mask is computed in world coordinates, while roof art
  // is projected upward on screen. Without resetting that projected surface,
  // an interior Torch can accidentally punch a bright band through the roof
  // even though its world-space rays correctly stop at the enclosing walls.
  bufferCtx.save();
  bufferCtx.beginPath();
  let hasPath = false;
  for (const region of regions) {
    hasPath = appendRoofRegionSurfacePath(
      bufferCtx,
      region,
      currentCamX,
      currentCamY
    ) || hasPath;
  }
  if (!hasPath) {
    bufferCtx.restore();
    return;
  }

  bufferCtx.clip();
  bufferCtx.clearRect(0, 0, VIEW_W, VIEW_H);
  bufferCtx.globalCompositeOperation = "source-over";
  bufferCtx.globalAlpha = alpha;
  bufferCtx.fillStyle = WORLD_DARKNESS_COLOR;
  bufferCtx.fillRect(0, 0, VIEW_W, VIEW_H);
  bufferCtx.restore();
}

function torchSourceInsideAnyRoofRegion(source, roofRegions) {
  if (!source) return false;
  const worldX = Number(source.visibilityX);
  const worldY = Number(source.visibilityY);
  if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) return false;
  return roofRegions.some(region => pointInsideRoofRegion(region, worldX, worldY));
}

function carveTorchRoofSurfaceLight(bufferCtx, source, regions) {
  if (!bufferCtx || !source || !regions?.length) return;

  const allRoofRegions = automaticRoofRegions();
  // Interior light belongs to the revealed room, not to the exterior roof
  // plane. Skipping it here also prevents a Torch inside one enclosed room
  // from lighting the roof of a nearby structure through its own walls.
  if (torchSourceInsideAnyRoofRegion(source, allRoofRegions)) return;

  const worldX = Number(source.x);
  const worldY = Number(source.y);
  if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) return;

  const seed = Number(source.seed) || 0;
  const flicker =
    Math.sin(worldTime * 12.7 + seed) * 2.2 +
    Math.sin(worldTime * 19.3 + seed * 0.37) * 1.2;
  const lightRadius = Math.max(34, source.radius + flicker);
  const screenX = worldX - currentCamX;
  const screenY = worldY - currentCamY;
  const gradient = bufferCtx.createRadialGradient(
    screenX,
    screenY,
    0,
    screenX,
    screenY,
    lightRadius
  );
  gradient.addColorStop(0, "rgba(0,0,0,0.98)");
  gradient.addColorStop(0.24, "rgba(0,0,0,0.94)");
  gradient.addColorStop(0.62, "rgba(0,0,0,0.58)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");

  bufferCtx.save();
  bufferCtx.beginPath();
  let hasPath = false;
  for (const region of regions) {
    hasPath = appendRoofRegionSurfacePath(
      bufferCtx,
      region,
      currentCamX,
      currentCamY
    ) || hasPath;
  }
  if (!hasPath) {
    bufferCtx.restore();
    return;
  }

  bufferCtx.clip();
  bufferCtx.globalCompositeOperation = "destination-out";
  bufferCtx.fillStyle = gradient;
  bufferCtx.fillRect(
    screenX - lightRadius,
    screenY - lightRadius,
    lightRadius * 2,
    lightRadius * 2
  );
  bufferCtx.restore();
}

function lightPathToStructureFaceClear(source, targetStructure, sourceSide) {
  const boundaryTarget = STRUCTURE_GEOMETRY.closestPointOnBoundary(
    targetStructure,
    source.visibilityX,
    source.visibilityY
  );
  if (!boundaryTarget || !sourceSide) return false;

  // v409: trace to the *near face* of the wall instead of its centerline.
  // A ray aimed at the centerline immediately intersected the mounted Torch's
  // own support (and every coplanar neighbor), so only the single support panel
  // could receive light. Keeping the receiver probe just outside the physical
  // collision thickness lets light travel continuously along connected wall
  // faces while the normal ground-light polygon still stops at the wall plane.
  const target = STRUCTURE_GEOMETRY.offsetBoundaryPointToSide(
    targetStructure,
    boundaryTarget,
    sourceSide,
    1.35
  );
  if (!target) return false;

  for (const structure of currentMapStructures()) {
    if (structure === targetStructure || structure?.id === targetStructure?.id) continue;
    if (!structureBlocksLight(structure)) continue;
    const rect = STRUCTURE_GEOMETRY.collisionRect(structure, 2);
    const t = STRUCTURE_GEOMETRY.segmentRectIntersectionT(
      source.visibilityX,
      source.visibilityY,
      target.x,
      target.y,
      rect,
      0.05
    );
    if (t !== null && t > 0.001 && t < 0.995) return false;
  }
  return true;
}

function carveTorchStructureFaceLight(bufferCtx, source, structure, visibleFaceSide = null) {
  if (!bufferCtx || !source || !structureBlocksLight(structure)) return;
  const closest = STRUCTURE_GEOMETRY.closestPointOnBoundary(
    structure,
    source.visibilityX,
    source.visibilityY
  );
  if (!closest) return;
  if (Math.hypot(closest.x - source.visibilityX, closest.y - source.visibilityY) > source.radius + 20) return;

  // A solid wall has two conceptual faces even though the pixel sprite is one
  // tall facade. v409 removes the per-wall local-player side test that made a
  // fixed Torch switch the same wall on/off as the player walked around it.
  // Completed houses use their stable interior/exterior facade state instead.
  const sourceSide = STRUCTURE_GEOMETRY.sideOfBoundary(
    structure,
    source.visibilityX,
    source.visibilityY
  );
  if (!sourceSide) return;
  if (visibleFaceSide && sourceSide !== visibleFaceSide) return;
  if (!lightPathToStructureFaceClear(source, structure, sourceSide)) return;

  const rect = structureFacadeWorldRect(structure);
  if (!rect) return;
  const screenX = source.x - currentCamX;
  const screenY = source.y - currentCamY;
  const faceRadius = Math.min(source.radius, 54);
  const gradient = bufferCtx.createRadialGradient(
    screenX, screenY, 0,
    screenX, screenY, faceRadius
  );
  gradient.addColorStop(0, "rgba(0,0,0,0.94)");
  gradient.addColorStop(0.42, "rgba(0,0,0,0.72)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");

  bufferCtx.save();
  bufferCtx.beginPath();
  bufferCtx.rect(
    rect.x - currentCamX,
    rect.y - currentCamY,
    rect.width,
    rect.height
  );
  bufferCtx.clip();
  bufferCtx.globalCompositeOperation = "destination-out";
  bufferCtx.fillStyle = gradient;
  bufferCtx.fillRect(
    screenX - faceRadius,
    screenY - faceRadius,
    faceRadius * 2,
    faceRadius * 2
  );
  bufferCtx.restore();
}

function drawWorldLightingOverlay() {
  const minutes = currentWorldClockMinutes();
  const nightAlpha = worldClockLightingAlpha(minutes);
  const rainDimAlpha = currentMapRainIntensity() * 0.08;
  const alpha = Math.max(nightAlpha, rainDimAlpha);
  const interiorRegion = activeInteriorRoofRegion();
  const interiorAlpha = interiorRegion ? activeInteriorAmbientAlpha(alpha) : 0;
  if (alpha <= 0.001 && !interiorRegion) return;

  const bufferCtx = ensureWorldLightingBuffer();
  bufferCtx.clearRect(0, 0, VIEW_W, VIEW_H);
  bufferCtx.globalCompositeOperation = "source-over";
  if (alpha > 0.001) {
    bufferCtx.globalAlpha = alpha;
    bufferCtx.fillStyle = WORLD_DARKNESS_COLOR;
    bufferCtx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  bufferCtx.globalAlpha = 1;

  // v418: a revealed roofed room owns a separate ambient layer. This lets a
  // building (and later a stone cave using the same topology) stay naturally
  // dim even at noon without changing outdoor lighting rules.
  if (interiorRegion) {
    restoreActiveInteriorAmbient(bufferCtx, interiorRegion, interiorAlpha);
  }

  // v408: every torch, whether placed or held by either player, enters one
  // client-side light pipeline. Placed torches still use shared structures;
  // held torches use the already change-only replicated heldBuildPiece field.
  const torchSources = collectTorchLightSources();
  for (const source of torchSources) {
    carveTorchLight(
      bufferCtx,
      source.x,
      source.y,
      source.radius,
      source.seed,
      source.key.startsWith("placed:") ? source.key : null,
      source.visibilityX,
      source.visibilityY
    );
  }

  // The local player gets a tiny, faint night-vision pocket so pitch-black
  // exploration is still possible without a Torch. This is intentionally NOT
  // added to collectTorchLightSources(), so remote players never emit or share
  // this natural visibility bubble on multiplayer clients.
  carveLocalPlayerNightSight(bufferCtx, nightAlpha);

  // General rays model the ground plane only. Reset wall/door facade pixels to
  // ambient darkness, then explicitly light the visible face from same-side
  // sources. Physical boundary, visual depth and surface lighting are now three
  // separate concerns instead of three interpretations of one rectangle.
  restoreStructureFacadeAmbient(bufferCtx, alpha, interiorRegion, interiorAlpha);
  for (const structure of currentMapStructures()) {
    if (!structureBlocksLight(structure)) continue;
    const visibleFaceSide = visibleStructureLightFaceSide(structure);
    for (const source of torchSources) {
      carveTorchStructureFaceLight(bufferCtx, source, structure, visibleFaceSide);
    }
  }

  // Roof art is rendered after wall facades, so its lighting receiver must also
  // be resolved after facade lighting. This masks both ground-light projection
  // and any hidden wall-face illumination underneath the visible roof.
  const visibleRoofRegions = visibleRoofLightingRegions();
  restoreVisibleRoofSurfaceAmbient(bufferCtx, alpha, visibleRoofRegions);

  // Exterior roofs are another explicit receiver surface. Re-light them only
  // from Torch sources that are not inside an enclosed roof region so interior
  // light cannot appear on the outside roof while nearby exterior Torches can
  // still illuminate that roof normally.
  for (const source of torchSources) {
    carveTorchRoofSurfaceLight(bufferCtx, source, visibleRoofRegions);
  }

  // Cherry-on-top daylight spill: an automatic door that is currently open
  // cuts a small soft patch into the interior ambient layer. Closed doors and
  // walls continue to block the normal light-visibility polygons.
  if (interiorRegion) {
    carveOpenDoorDaylight(bufferCtx, interiorRegion, nightAlpha);
  }

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.drawImage(worldLightingCanvas, 0, 0);
  ctx.restore();
}

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
    if (tree.removed) continue;
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

function hitsTerrainVoid(x, y, playerRadius = 4) {
  const definition = WORLD_CONTENT?.maps?.[currentMapId] || null;
  if (
    !definition ||
    typeof TERRAIN_RULES === "undefined" ||
    !TERRAIN_RULES.terrainDefinition(definition)
  ) {
    return false;
  }

  return TERRAIN_RULES.circleCanOccupy(
    definition,
    x,
    y,
    playerRadius,
    { allowWater: true }
  ) === false;
}

function hitsSolidObstacle(x, y, options = {}) {
  return (
    hitsTerrainVoid(x, y) ||
    hitsTreeObstacle(x, y) ||
    hitsSceneryRockObstacle(x, y) ||
    hitsHouseObstacle(x, y) ||
    hitsPlayerStructureObstacle(x, y, 4, options)
  );
}


// -----------------------------------------------------------------------------
// CLIENT RENDERING
// -----------------------------------------------------------------------------
// Everything below this point is presentation. A future authoritative server
// should not need canvas, sprites, camera state, particles, or floating text.
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

  const playerDrawAlpha = 1;

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
    const wading =
      typeof terrainEntityIsWading === "function" &&
      terrainEntityIsWading(player.x, player.y, currentMapId);

    if (!wading) {
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

  const bowDrawAmount =
    bowPoseActive
      ? Math.max(
          0,
          Math.min(
            1,
            Number(player.bowDrawAmount) || 0
          )
        )
      : 0;

  const bowAimingActive =
    bowPoseActive &&
    (
      player.bowDrawing ||
      player.bowReleaseTime > 0 ||
      bowDrawAmount > 0.025
    );

  const attacking = player.attackTime > 0;

  // At rest the bow stays in one consistent hand and does not chase the
  // cursor. Once the player begins drawing, the cursor side chooses which arm
  // presents the bow, just like the earlier visual tests.
  const useRightHand =
    bowPoseActive
      ? (
          bowAimingActive
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

  // v406: held equipment clipping uses one player-centered visibility mask.

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

  const drawHeldArmWithStructureClip = (drawArm) => {
    ctx.save();
    if (!reflectionMode) {
      applyHeldItemStructureVisibilityClip(camX, camY);
    }
    drawArm();
    ctx.restore();
  };

  if (!carryingEnemy) {
    if (bowPoseActive) {
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
      drawHeldArmWithStructureClip(() => ctx.drawImage(
        appearance.rightArm,
        baseX + weaponArmX,
        baseY + weaponArmY
      ));
    } else {
      // Left arm is the weapon arm.
      drawHeldArmWithStructureClip(() => ctx.drawImage(
        appearance.leftArm,
        baseX + weaponArmX,
        baseY + weaponArmY
      ));

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
    !carryingEnemy
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
      bowAimingActive
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
      bowAimingActive
        ? 0
        : 2;

    const bowRestOffsetY =
      bowAimingActive
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

    const drawClippedBowStringSegment = (from, to) => {
      ctx.save();
      if (!reflectionMode) {
        applyHeldItemStructureVisibilityClip(camX, camY);
      }
      drawPixelLine(
        from.x,
        from.y,
        to.x,
        to.y,
        "#d8d0ae"
      );
      ctx.restore();
    };

    drawClippedBowStringSegment(tipA, nock);
    drawClippedBowStringSegment(nock, tipB);

    // Tiny nock pixel makes the pull point easier to read at 320x180. The
    // nock is separately drawn, so give it the same wall clipping as the
    // string rather than letting it float through a blocked wall.
    if (stringGrab > 0.45) {
      ctx.save();
      if (!reflectionMode) {
        applyHeldItemStructureVisibilityClip(camX, camY);
      }
      ctx.fillStyle = "#eee5c5";
      ctx.fillRect(
        Math.round(nock.x),
        Math.round(nock.y),
        1,
        1
      );
      ctx.restore();
    }

    ctx.save();
    if (!reflectionMode) {
      applyHeldItemStructureVisibilityClip(camX, camY);
    }

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
        drawHeldArmWithStructureClip(() => ctx.drawImage(
          appearance.rightArm,
          baseX + weaponArmX,
          baseY + rightArmOffsetY + weaponArmY
        ), true, weaponArmX, rightArmOffsetY + weaponArmY);
      } else {
        drawHeldArmWithStructureClip(() => ctx.drawImage(
          appearance.leftArm,
          baseX + weaponArmX,
          baseY + leftArmOffsetY + weaponArmY
        ), false, weaponArmX, leftArmOffsetY + weaponArmY);
      }
    }

    const shouldDrawBowAimGuide =
      !reflectionMode &&
      remotePlayerDrawDepth === 0 &&
      player.bowDrawing &&
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
    currentWeapon !== "tigerPaw" &&
    !carryingEnemy
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
    if (!reflectionMode) {
      applyHeldItemStructureVisibilityClip(camX, camY);
    }
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

  // v401: a selected Torch is both a placeable build piece and a carried light.
  // Build selection intentionally suppresses normal weapons, so drawing it here
  // gives the player a simple "hold or place" interaction without another mode.
  const heldBuildPiece = heldBuildPieceForCurrentDraw();
  if (
    heldBuildPiece === "torch" &&
    (remotePlayerDrawDepth > 0 || buildPieceCount("torch") > 0) &&
    !carryingEnemy
  ) {
    const torchX = Math.round(handX - 8);
    const torchY = Math.round(handY - 14);
    ctx.save();
    if (!reflectionMode) {
      applyHeldItemStructureVisibilityClip(camX, camY);
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(torchImage, torchX, torchY, 16, 16);
    if (!reflectionMode && Math.sin(worldTime * 15.2) > 0.45) {
      ctx.fillStyle = "#e5ffad";
      ctx.fillRect(torchX + 10, torchY + 2, 1, 1);
    }
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

function drawPlacedNpc(npc, camX, camY) {
  if (!npc) return;
  const allowed = ["beachGirl", "greenWitch", "camoGuy"];
  if (!allowed.includes(npc.type)) return;

  const type = npc.type;
  const screenX = Math.round((Number(npc.x) || 0) - camX);
  const screenY = Math.round((Number(npc.y) || 0) - camY);
  const phase = Array.from(String(npc.id || type)).reduce((sum, char) => sum + char.charCodeAt(0), 0) * 0.07;
  const swayOffset = Math.round(Math.sin(worldTime * 1.08 + phase) * 1);
  const image = type === "beachGirl"
    ? beachGirlNpcImage
    : type === "greenWitch"
      ? greenWitchNpcImage
      : camoNpcImage;
  const height = type === "beachGirl" ? 17 : 20;
  const width = type === "beachGirl" ? 13 : 20;
  const shadowWidth = type === "greenWitch" ? 14 : type === "camoGuy" ? 8 : 10;

  ctx.fillStyle = "rgba(34, 46, 28, .24)";
  ctx.fillRect(screenX - Math.floor(shadowWidth / 2), screenY - 1, shadowWidth, 2);
  ctx.drawImage(image, screenX - Math.floor(width / 2) + swayOffset, screenY - height);
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
  if (shopOpen || beachQuestOpen) return;

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

  drawStaticPixelText(
    "F TALK",
    screenX,
    screenY - 24,
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
  "heldBuildPiece",
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
  "fireballAiming",
  "fireballAimTime",
  "rainCloudCasting",
  "rainCloudCastTime",
  "rainCloudCastDuration",
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

function drawRemotePlayer(
  remote,
  camX,
  camY,
  reflectionMode = false
) {
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
  player.heldBuildPiece = ["woodFloor", "stoneFloor", "woodWall", "woodDoor", "torch", "chest", "craftingTable"].includes(remote.heldBuildPiece)
    ? remote.heldBuildPiece
    : null;

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

  player.fireballAiming = Boolean(remote.fireballAiming);
  player.fireballAimTime = Math.max(0, Number(remote.fireballAimTime) || 0);
  player.rainCloudCasting = Boolean(remote.rainCloudCasting);
  player.rainCloudCastTime = Math.max(0, Number(remote.rainCloudCastTime) || 0);
  player.rainCloudCastDuration = Math.max(0.05, Number(remote.rainCloudCastDuration) || 0.50);

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
  }
}


function drawRemotePlayerReflection(
  remote,
  camX,
  camY
) {
  if (typeof terrainWaterReflectionInfo !== "function") return;

  const reflection = terrainWaterReflectionInfo(
    remote.x,
    remote.y,
    currentMapId,
    16
  );
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
}
