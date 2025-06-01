// public/js/game.js

// 1. Phaser game configuration
const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  parent: 'game-container',  // <div id="game-container"></div> in index.html
  physics: {
    default: 'arcade',
    arcade: {
      debug: false            // true = draw collision boxes (for debugging)
    }
  },
  scene: {
    preload: preload,
    create: create,
    update: update
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  }
};

// 2. Instantiate the Phaser game
const game = new Phaser.Game(config);

// 3. Global vars for this scene
let player;              // our local player sprite
let cursors;             // arrow‐key input
let lastSent = 0;        // timestamp of last 'playerMoved' emit
let myScoreText;         // Phaser Text object for *our* coin count
let coinsGroup;          // a Physics Group to hold all coin sprites
let coinsMapLocal = {};  // local mirror of coinId → sprite (in addition to client-net.js's coinsMap)

// ────────────────────────────────────────────────────────────────────────────────
// 4. Preload assets: sprites for player1, player2, and coin
function preload() {
  this.load.image('player1', 'assets/player1.png');
  this.load.image('player2', 'assets/player2.png');
  this.load.image('coin',    'assets/coin.png');
}

// ────────────────────────────────────────────────────────────────────────────────
// 5. Create: set up the world, your player, input, and overlap logic
function create() {
  // 5a. Spawn at a random x,y so players don't stack on top of each other
  const spawnX = Phaser.Math.Between(100, 700);
  const spawnY = Phaser.Math.Between(100, 500);

  // 5b. Create our player sprite (physics‐enabled)
  player = this.physics.add.sprite(spawnX, spawnY, 'player1');
  player.setCollideWorldBounds(true);
  player.coins = 0;   // track how many coins we have (will update over time)

  // 5c. Notify server: “I'm ready, and here's my spawn position”
  socket.emit('playerReady', { x: spawnX, y: spawnY });

  // 5d. Set up arrow key input
  cursors = this.input.keyboard.createCursorKeys();

  // ────────────────────────────────────────────────────────────────────────────────
  // 5e. Create a Physics Group to hold all coin sprites
  coinsGroup = this.physics.add.staticGroup();

  // Note: client-net.js’s addCoinSprite() uses:
  //    const coinSprite = scene.physics.add.staticSprite(x, y, 'coin');
  // but here we can optionally collect all coins into coinsGroup for overlap checks.
  // To unify them, we'll listen for Phaser’s “ScenePlugin” event that fires when
  // client-net.js calls addCoinSprite(). But that's tricky; instead, we’ll:
  //    1) After client-net.js’s addCoinSprite() creates a staticSprite, we also
  //       put it into coinsGroup manually by adding the sprite reference to coinsGroup.
  //    2) For simplicity, we handle overlap on ALL coins via coinsGroup.

  // ---------------------------------------------------------
  // 5f. Overlap logic: when *our* player overlaps ANY coin in coinsGroup,
  //     call collectCoin(ourPlayer, coinSprite).
  this.physics.add.overlap(player, coinsGroup, collectCoin, null, this);

  // ────────────────────────────────────────────────────────────────────────────────
  // 5g. Set up our on-screen score text above our head (initially "Coins: 0")
  myScoreText = this.add.text(spawnX, spawnY - 48, 'Coins: 0', {
    font: '14px PressStart2P, Arial',
    fill: '#ffff00'
  }).setOrigin(0.5);

  // ────────────────────────────────────────────────────────────────────────────────
  // 5h. Listen for coin‐related events from client-net.js:

  // 5h.1. When client-net.js adds a coin sprite via addCoinSprite(),
  //       we need to also add that sprite into coinsGroup & coinsMapLocal.
  //       Since addCoinSprite() creates a staticSprite, we can detect it by
  //       intercepting the 'spawnCoin' event on the socket:
  socket.on('spawnCoin', ({ coinId, x, y }) => {
    // Create a coin sprite at (x, y) matching client-net.js's sprite
    // We cannot create it twice—client-net.js already called addCoinSprite(),
    // so instead, wait a tick and then find that sprite in the world:
    this.time.addEvent({
      delay: 5, // wait 5 ms until client-net.js’s sprite exists
      callback: () => {
        // Find *all* coin sprites at (x, y) and pick the one with coinId
        const found = coinsGroup.getChildren().filter((spr) => spr.x === x && spr.y === y && spr.coinId === coinId);
        if (found.length > 0) {
          // That’s our coin. Nothing more to do here.
          coinsMapLocal[coinId] = found[0];
        } else {
          // If for some reason client-net.js hasn’t added it yet, add it ourselves:
          const newCoin = this.physics.add.staticSprite(x, y, 'coin');
          newCoin.coinId = coinId;
          coinsGroup.add(newCoin);
          coinsMapLocal[coinId] = newCoin;
        }
      },
      loop: false
    });
  });

  // 5h.2. When client-net.js removes a coin from the scene:
  socket.on('removeCoin', ({ coinId }) => {
    if (coinsMapLocal[coinId]) {
      coinsMapLocal[coinId].destroy();
      delete coinsMapLocal[coinId];
    }
  });

  // ────────────────────────────────────────────────────────────────────────────────
  // 5i. Listen for “earnCoin” same as in client-net.js, but focus on *our* score:
  //      client-net.js will do game.events.emit('updateMyScore', newCount) when we get a coin.
  game.events.on('updateMyScore', (newCount) => {
    player.coins = newCount;                       // update our local tracking
    myScoreText.setText(`Coins: ${newCount}`);      // update our on-screen text
  });

  // ────────────────────────────────────────────────────────────────────────────────
  // 5j. Update otherPlayers’ on-screen text when someone else picks a coin:
  //      client-net.js already updates otherPlayers[playerId].scoreText for others.
  //      (No action needed here.)

  // ────────────────────────────────────────────────────────────────────────────────
  // 5k. (Optional) If the server has told us “doorOpen = true” before we connected,
  //      handle removing the door sprite. For now: do nothing.

  // ────────────────────────────────────────────────────────────────────────────────
  // 5l. All “other players” & “coin sprites” are now being managed by client-net.js
  //      via addOtherPlayer() and addCoinSprite(). We just needed to hook overlap
  //      and our own scoreText logic.
}

// ────────────────────────────────────────────────────────────────────────────────
// 6. Update loop: handle movement & send position updates
function update(time, delta) {
  if (!player) return;

  // 6a. Reset velocity every frame
  player.setVelocity(0);

  // 6b. Arrow‐key movement
  const speed = 200;
  if (cursors.left.isDown) {
    player.setVelocityX(-speed);
  } else if (cursors.right.isDown) {
    player.setVelocityX(speed);
  }
  if (cursors.up.isDown) {
    player.setVelocityY(-speed);
  } else if (cursors.down.isDown) {
    player.setVelocityY(speed);
  }

  // 6c. Throttle ‘playerMoved’ so it fires ~20× per second
  if (time - lastSent > 50) {
    socket.emit('playerMoved', { x: player.x, y: player.y });
    lastSent = time;
  }

  // 6d. Always keep our on‐screen score above our head
  myScoreText.setPosition(player.x, player.y - 48);
}

// ────────────────────────────────────────────────────────────────────────────────
// 7. Overlap callback: when our player touches a coin
function collectCoin(playerSprite, coinSprite) {
  // 7a. Identify which coin this is
  const coinId = coinSprite.coinId;

  // 7b. Immediately destroy the local coin sprite so it disappears for us
  coinSprite.destroy();
  delete coinsMapLocal[coinId];

  // 7c. Also inform the server: “I just collected coinId”
  socket.emit('coinCollected', { coinId });

  // 7d. Wait for the server’s 'earnCoin' event to confirm and update our score
  //      (client-net.js will catch 'earnCoin' and do game.events.emit('updateMyScore'))
}
