const { spawn } = require("child_process");
const WebSocket = require("ws");
const WORLD_CONTENT = require("../public/shared/world-content.js");

const port = 32191;
const server = spawn(process.execPath, ["server.js"], {
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"]
});

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function waitForMessage(socket, type, predicate = () => true, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off("message", onMessage);
      reject(new Error(`Timed out waiting for ${type}`));
    }, timeoutMs);
    function onMessage(raw) {
      const message = JSON.parse(raw.toString());
      if (message.type !== type || !predicate(message)) return;
      clearTimeout(timeout);
      socket.off("message", onMessage);
      resolve(message);
    }
    socket.on("message", onMessage);
  });
}

async function sendAndWait(socket, payload, type, predicate) {
  const pending = waitForMessage(socket, type, predicate);
  socket.send(JSON.stringify(payload));
  return pending;
}

(async () => {
  try {
    await delay(250);
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    });
    await waitForMessage(socket, "welcome");

    const restored = await sendAndWait(socket, {
      type: "persistentStateRestore",
      state: {
        resources: {
          wood: 7,
          stone: 1,
          whiteFlowers: 6,
          blueFlowers: 3
        }
      }
    }, "persistentStateRestored");
    if (restored.whiteFlowers !== 6 || restored.blueFlowers !== 3) {
      throw new Error("split flower persistence failed");
    }

    const defaultMapId = WORLD_CONTENT.defaultPlayerLoad?.mapId;
    const craftingTable = WORLD_CONTENT.maps?.[defaultMapId]?.npcs?.find(
      npc => npc?.type === "craftingTable"
    );
    if (!craftingTable) {
      throw new Error("default map crafting table missing");
    }

    socket.send(JSON.stringify({
      type: "playerStatePatch",
      player: { x: craftingTable.x, y: craftingTable.y }
    }));
    await delay(100);

    const arrows = await sendAndWait(socket, {
      type: "craftRequest", recipe: "arrows"
    }, "craftResult", message => message.recipe === "arrows");
    if (!arrows.success || arrows.totalArrows !== 20 || arrows.totalWood !== 2 || arrows.totalStone !== 0) {
      throw new Error("authoritative arrow recipe failed");
    }

    const woodRing = await sendAndWait(socket, {
      type: "craftRequest", recipe: "woodRing"
    }, "craftResult", message => message.recipe === "woodRing");
    if (!woodRing.success || woodRing.totalWood !== 0) {
      throw new Error("authoritative wood ring recipe failed");
    }

    const duplicateWoodRing = await sendAndWait(socket, {
      type: "craftRequest", recipe: "woodRing"
    }, "craftResult", message => message.recipe === "woodRing");
    if (duplicateWoodRing.success || duplicateWoodRing.reason !== "alreadyCrafted") {
      throw new Error("wood ring duplicate-craft guard failed");
    }

    const attackOne = await sendAndWait(socket, {
      type: "craftRequest", recipe: "attackPotion"
    }, "craftResult", message => message.recipe === "attackPotion");
    const attackTwo = await sendAndWait(socket, {
      type: "craftRequest", recipe: "attackPotion"
    }, "craftResult", message => message.recipe === "attackPotion");
    const healing = await sendAndWait(socket, {
      type: "craftRequest", recipe: "healingPotion"
    }, "craftResult", message => message.recipe === "healingPotion");
    const magic = await sendAndWait(socket, {
      type: "craftRequest", recipe: "magicPotion"
    }, "craftResult", message => message.recipe === "magicPotion");
    if (!attackOne.success || !attackTwo.success || !healing.success || !magic.success || magic.totalWhiteFlowers !== 1 || magic.totalBlueFlowers !== 0) {
      throw new Error("authoritative potion recipes failed");
    }

    const fullHp = await sendAndWait(socket, {
      type: "consumableUse", item: "healingPotion"
    }, "consumableUseResult", message => message.item === "healingPotion");
    if (fullHp.success || fullHp.reason !== "fullHp" || fullHp.totalHealingPotions !== 1) {
      throw new Error("full-HP healing guard consumed a potion");
    }

    const firstAttack = await sendAndWait(socket, {
      type: "consumableUse", item: "attackPotion"
    }, "consumableUseResult", message => message.item === "attackPotion");
    const repeatedAttack = await sendAndWait(socket, {
      type: "consumableUse", item: "attackPotion"
    }, "consumableUseResult", message => message.item === "attackPotion");
    const magicDuringAttackCooldown = await sendAndWait(socket, {
      type: "consumableUse", item: "magicPotion"
    }, "consumableUseResult", message => message.item === "magicPotion");
    if (!firstAttack.success || repeatedAttack.success || repeatedAttack.reason !== "cooldown" || !magicDuringAttackCooldown.success) {
      throw new Error("independent one-second buff-potion cooldowns failed");
    }

    await delay(1100);
    const refreshedAttack = await sendAndWait(socket, {
      type: "consumableUse", item: "attackPotion"
    }, "consumableUseResult", message => message.item === "attackPotion");
    if (!refreshedAttack.success || refreshedAttack.attackPotionUntil <= firstAttack.attackPotionUntil) {
      throw new Error("Attack Potion did not refresh duration after one-second cooldown");
    }

    socket.close();
    console.log("Crafting/consumables WebSocket smoke test passed.");
  } finally {
    server.kill("SIGTERM");
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
