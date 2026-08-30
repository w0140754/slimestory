// Slime Story client simulation foundation — v242 initialization-order repair.
// These existing replicated-enemy update declarations must exist before game.js
// constructs CLIENT_ENEMY_RUNTIME_PROFILES. Function bodies are unchanged from v240/v241.

function updateSlimes(dt) {
  // Shared slimes are simulated by the Node server. Passive wanderers are
  // dead-reckoned between low-rate server intent anchors; active enemies use
  // the precise server motion stream.

  for (const slime of slimes) {
    tickTimer(slime, "hitFlash", dt);
    tickTimer(slime, "shakeTime", dt);
    tickReplicatedEnemyCountdowns(slime, dt);

    if (slime.serverVariant) {
      slime.variant = slime.serverVariant;
    }

    updateReplicatedEnemyPosition(slime, dt, 14);

  }
}

function updateGoblins(dt) {
  for (const goblin of goblins) {
    tickTimer(goblin, "hitFlash", dt);
    tickTimer(goblin, "shakeTime", dt);
    tickReplicatedEnemyCountdowns(goblin, dt);

    updateReplicatedEnemyPosition(goblin, dt, 14);

    if (
      goblin.networkMotionMode === "active" &&
      Number(goblin.serverMotionReceivedAt) > 0 &&
      performance.now() - goblin.serverMotionReceivedAt > 280
    ) {
      goblin.serverVelocityX = 0;
      goblin.serverVelocityY = 0;
      if (goblin.lungeTime <= 0) goblin.moving = false;
    }

    if (goblin.moving || goblin.lungeTime > 0) {
      goblin.walkTime += dt;
    }

    if (goblin.lungeTime > 0) {
      goblin.lungeTime = Math.max(
        0,
        goblin.lungeTime - dt
      );
    }

  }
}

function updateGhosts(dt) {
  for (const ghost of ghosts) {
    if (
      !naturalEnemyBelongsToCurrentMap(
        ghost
      )
    ) {
      continue;
    }

    tickTimer(ghost, "hitFlash", dt);
    tickTimer(ghost, "shakeTime", dt);
    tickReplicatedEnemyCountdowns(ghost, dt);


    updateReplicatedEnemyPosition(ghost, dt, 14);

  }
}
