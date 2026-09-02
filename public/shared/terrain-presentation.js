(function (root, factory) {
  const api = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.TERRAIN_PRESENTATION = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Presentation only. Terrain gameplay meaning remains in terrain-rules.js.
  // Both the game renderer and map editor use this exact painter so editor
  // terrain previews cannot silently drift from the runtime look.
  const PALETTE = Object.freeze({
    grass: Object.freeze({
      base: "#70984d",
      dark: "#5d8442",
      deep: "#4f7539",
      light: "#82a95a",
      bright: "#91b968"
    }),
    dirt: Object.freeze({
      base: "#a77d50",
      dark: "#8d6742",
      deep: "#765539",
      light: "#bd9362",
      bright: "#c9a06f"
    }),
    sand: Object.freeze({
      base: "#d7c18a",
      dark: "#b79f68",
      deep: "#9d8756",
      light: "#ead6a1",
      bright: "#f4e5bd"
    }),
    water: Object.freeze({
      base: "#3f7690",
      dark: "#315e76",
      deep: "#294f65",
      light: "#5a95ac",
      bright: "#72aabe"
    }),
    stone: Object.freeze({
      base: "#777c72",
      dark: "#62675f",
      light: "#8d9288"
    })
  });

  function hash(x, y, salt = 0) {
    let value = (
      Math.imul((Math.floor(x) | 0) ^ 0x45d9f3b, 0x27d4eb2d) ^
      Math.imul((Math.floor(y) | 0) ^ 0x119de1f3, 0x165667b1) ^
      Math.imul(salt | 0, 0x9e3779b1)
    ) >>> 0;
    value ^= value >>> 15;
    value = Math.imul(value, 0x2c1b3c6d) >>> 0;
    value ^= value >>> 12;
    return value >>> 0;
  }

  function drawCellTexture(context, type, worldX, worldY, screenX, screenY, size, timeSeconds = 0) {
    const palette = PALETTE[type];
    if (!context || !palette) return;

    const cellHash = hash(worldX, worldY, type.length);
    const hash2 = hash(worldX + 17, worldY - 11, (cellHash >>> 8) & 255);
    const inner = Math.max(1, size - 4);
    const px = offset => screenX + 2 + ((cellHash >>> offset) % inner);
    const py = offset => screenY + 2 + ((hash2 >>> offset) % inner);

    if (type === "grass") {
      context.fillStyle = palette.dark;
      const darkX = px(3);
      const darkY = py(5);
      context.fillRect(darkX, darkY, 2, 1);
      if ((cellHash & 3) === 1 && darkY + 1 < screenY + size - 1) {
        context.fillRect(darkX + ((cellHash >>> 6) & 1), darkY + 1, 1, 1);
      }

      if ((cellHash & 7) <= 3) {
        context.fillStyle = palette.deep;
        context.fillRect(px(10), py(12), 1, 1);
      }

      if (((cellHash >>> 4) & 7) <= 2) {
        context.fillStyle = palette.light;
        const tuftX = px(14);
        const tuftY = py(16);
        context.fillRect(tuftX, tuftY, 1, 1);
        if (tuftY > screenY + 1) context.fillRect(tuftX + 1, tuftY - 1, 1, 1);
      }

      if ((hash2 & 31) === 9 && size >= 8) {
        context.fillStyle = palette.bright;
        const tuftX = screenX + 2 + ((hash2 >>> 8) % Math.max(1, size - 5));
        const tuftY = screenY + size - 3;
        context.fillRect(tuftX, tuftY, 1, 1);
        context.fillRect(tuftX + 1, tuftY - 1, 1, 2);
        context.fillRect(tuftX + 2, tuftY, 1, 1);
      }
      return;
    }

    if (type === "dirt") {
      context.fillStyle = palette.dark;
      context.fillRect(px(4), py(6), 1, 1);
      if ((cellHash & 3) !== 0) context.fillRect(px(11), py(13), 2, 1);

      if ((hash2 & 7) <= 3) {
        context.fillStyle = palette.light;
        context.fillRect(px(15), py(17), 1, 1);
      }

      if ((cellHash & 31) === 12 && size >= 8) {
        const pebbleX = screenX + 2 + ((hash2 >>> 4) % Math.max(1, size - 5));
        const pebbleY = screenY + 2 + ((hash2 >>> 10) % Math.max(1, size - 4));
        context.fillStyle = palette.deep;
        context.fillRect(pebbleX, pebbleY, 3, 1);
        context.fillStyle = palette.bright;
        context.fillRect(pebbleX + 1, pebbleY, 1, 1);
      }
      return;
    }

    if (type === "sand") {
      context.fillStyle = palette.dark;
      context.fillRect(px(4), py(6), 1, 1);
      if ((cellHash & 7) <= 4) context.fillRect(px(11), py(13), 1, 1);

      if ((hash2 & 7) <= 4) {
        context.fillStyle = palette.light;
        context.fillRect(px(15), py(17), 1, 1);
      }

      if ((cellHash & 15) === 5 && size >= 8) {
        const shellX = screenX + 2 + ((hash2 >>> 4) % Math.max(1, size - 5));
        const shellY = screenY + 2 + ((hash2 >>> 10) % Math.max(1, size - 4));
        context.fillStyle = palette.deep;
        context.fillRect(shellX, shellY, 2, 1);
        context.fillStyle = palette.bright;
        context.fillRect(shellX + 1, shellY, 1, 1);
      }

      if ((hash2 & 31) === 7 && size >= 8) {
        context.fillStyle = palette.bright;
        const sparkleX = screenX + 1 + ((cellHash >>> 18) % Math.max(1, size - 2));
        const sparkleY = screenY + 1 + ((hash2 >>> 18) % Math.max(1, size - 2));
        context.fillRect(sparkleX, sparkleY, 1, 1);
      }
      return;
    }

    if (type === "water") {
      context.fillStyle = palette.dark;
      const darkWidth = Math.max(2, Math.min(4, size - 2));
      const darkX = screenX + 1 + ((cellHash >>> 7) % Math.max(1, size - darkWidth - 1));
      const darkY = screenY + 1 + ((hash2 >>> 9) % Math.max(1, size - 3));
      context.fillRect(darkX, darkY, darkWidth, 1);

      if ((cellHash & 7) === 2) {
        context.fillStyle = palette.deep;
        context.fillRect(screenX + 1, screenY + size - 2, Math.max(2, Math.min(3, size - 2)), 1);
      }

      const ripplePhase = Math.floor((Number(timeSeconds) || 0) * 1.8) % 6;
      if (((cellHash >>> 3) % 6) === ripplePhase) {
        context.fillStyle = palette.light;
        const width = Math.max(2, Math.min(4, size - 2));
        const rippleX = screenX + 1 + ((hash2 >>> 13) % Math.max(1, size - width - 1));
        const rippleY = screenY + 2 + ((cellHash >>> 18) % Math.max(1, size - 4));
        context.fillRect(rippleX, rippleY, width, 1);

        if ((hash2 & 3) === 1 && width >= 3) {
          context.fillStyle = palette.bright;
          context.fillRect(rippleX + 1, rippleY, 1, 1);
        }
      }
      return;
    }

    if ((cellHash & 3) === 1) {
      context.fillStyle = palette.dark;
      context.fillRect(screenX + 2, screenY + 2, 1, 1);
    }
  }

  function drawTransitions(context, type, worldX, worldY, screenX, screenY, size, typeAt, timeSeconds = 0) {
    if (!context || typeof typeAt !== "function") return;

    if (type === "water") {
      const left = typeAt(worldX - 1, worldY + size / 2);
      const right = typeAt(worldX + size + 1, worldY + size / 2);
      const top = typeAt(worldX + size / 2, worldY - 1);
      const bottom = typeAt(worldX + size / 2, worldY + size + 1);

      const touchesLand = value => value && value !== "water" && value !== "void";
      const shorelineStyle = value => value === "sand"
        ? { dark: "#bfa46e", light: "#e3d2a0", foam: "#eef9ff", water: "#86bfd0" }
        : { dark: "#665038", light: "#856a46", foam: null, water: PALETTE.water.light };
      const cellHash = hash(worldX, worldY, 133);
      const foamPhase = Math.floor((Number(timeSeconds) || 0) * 2.2) % 4;

      function drawSide(side, neighborType) {
        if (!touchesLand(neighborType)) return;
        const style = shorelineStyle(neighborType);

        context.fillStyle = style.dark;
        if (side === "left") context.fillRect(screenX, screenY, 1, size);
        if (side === "right") context.fillRect(screenX + size - 1, screenY, 1, size);
        if (side === "top") context.fillRect(screenX, screenY, size, 1);
        if (side === "bottom") context.fillRect(screenX, screenY + size - 1, size, 1);

        context.fillStyle = style.light;
        if (side === "top" && (cellHash & 1)) context.fillRect(screenX + 1 + ((cellHash >>> 5) % Math.max(1, size - 4)), screenY, 2, 1);
        if (side === "bottom" && (cellHash & 2)) context.fillRect(screenX + 1 + ((cellHash >>> 8) % Math.max(1, size - 4)), screenY + size - 1, 2, 1);
        if (side === "left" && (cellHash & 4)) context.fillRect(screenX, screenY + 1 + ((cellHash >>> 11) % Math.max(1, size - 4)), 1, 2);
        if (side === "right" && (cellHash & 8)) context.fillRect(screenX + size - 1, screenY + 1 + ((cellHash >>> 14) % Math.max(1, size - 4)), 1, 2);

        context.fillStyle = style.water;
        if (side === "left" && size >= 5) context.fillRect(screenX + 1, screenY + 2 + ((cellHash >>> 10) % Math.max(1, size - 4)), 1, 2);
        if (side === "right" && size >= 5) context.fillRect(screenX + size - 2, screenY + 2 + ((cellHash >>> 13) % Math.max(1, size - 4)), 1, 2);
        if (side === "top" && size >= 5) context.fillRect(screenX + 2 + ((cellHash >>> 16) % Math.max(1, size - 5)), screenY + 1, 3, 1);
        if (side === "bottom" && size >= 5) context.fillRect(screenX + 2 + ((cellHash >>> 19) % Math.max(1, size - 5)), screenY + size - 2, 3, 1);

        if (style.foam && size >= 5) {
          const animate = ((cellHash >>> 22) & 3) === foamPhase;
          context.fillStyle = style.foam;
          if (side === "left" && animate) context.fillRect(screenX + 1, screenY + 1 + ((cellHash >>> 9) % Math.max(1, size - 3)), 1, 2);
          if (side === "right" && animate) context.fillRect(screenX + size - 2, screenY + 1 + ((cellHash >>> 12) % Math.max(1, size - 3)), 1, 2);
          if (side === "top" && animate) context.fillRect(screenX + 1 + ((cellHash >>> 15) % Math.max(1, size - 4)), screenY + 1, 2, 1);
          if (side === "bottom" && animate) context.fillRect(screenX + 1 + ((cellHash >>> 18) % Math.max(1, size - 4)), screenY + size - 2, 2, 1);
        }
      }

      drawSide("left", left);
      drawSide("right", right);
      drawSide("top", top);
      drawSide("bottom", bottom);
      return;
    }

    if (type === "dirt") {
      const cellHash = hash(worldX, worldY, 91);
      context.fillStyle = PALETTE.grass.dark;

      const left = typeAt(worldX - 1, worldY + size / 2);
      const right = typeAt(worldX + size + 1, worldY + size / 2);
      const top = typeAt(worldX + size / 2, worldY - 1);
      const bottom = typeAt(worldX + size / 2, worldY + size + 1);

      if (left === "grass" && (cellHash & 1)) context.fillRect(screenX, screenY + ((cellHash >>> 4) % size), 1, 2);
      if (right === "grass" && (cellHash & 2)) context.fillRect(screenX + size - 1, screenY + ((cellHash >>> 7) % size), 1, 2);
      if (top === "grass" && (cellHash & 4)) context.fillRect(screenX + ((cellHash >>> 10) % size), screenY, 2, 1);
      if (bottom === "grass" && (cellHash & 8)) context.fillRect(screenX + ((cellHash >>> 13) % size), screenY + size - 1, 2, 1);
    }
  }

  return Object.freeze({
    PALETTE,
    hash,
    drawCellTexture,
    drawTransitions
  });
});

