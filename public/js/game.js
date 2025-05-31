// public/js/game.js

// 1. Phaser game configuration
const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  parent: 'game-container',  // HTML <div id="game-container"></div>
  physics: {
    default: 'arcade',
    arcade: {
      debug: false  // set to true if you want collision outlines
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

// 2. Create the Phaser game instance
const game = new Phaser.Game(config);

// 3. Global variables for our scene
let player;                 // this client’s own sprite
let cursors;                // for arrow‐key input
let lastSent = 0;           // timestamp of last emit('playerMoved')

// 4. Preload assets
function preload() {
  // These paths are relative to public/index.html. Since assets are in public/assets:
  this.load.image('player1', 'assets/player1.png');
  this.load.image('player2', 'assets/player2.png');
}

// 5. Create scene
function create() {
  // 5a. Spawn position for this player (random within 100px margin)
  const spawnX = Phaser.Math.Between(100, 700);
  const spawnY = Phaser.Math.Between(100, 500);

  // 5b. Create our sprite using key 'player1'
  player = this.physics.add.sprite(spawnX, spawnY, 'player1');
  player.setCollideWorldBounds(true);
  player.coins = 0;   // track how many coins we collected (Day 3+)

  // 5c. Notify server that we're ready and send our starting pos
  socket.emit('playerReady', { x: spawnX, y: spawnY });

  // 5d. Set up arrow keys (up/down/left/right)
  cursors = this.input.keyboard.createCursorKeys();

  // 5e. Listen for other players joining the scene (client-net.js did most work)
  socket.on('playerJoinedScene', ({ playerId, x, y }) => {
    // The server tells us when someone finished loading & gave their initial x,y
    // We already handle adding them in client-net.js via 'newPlayer' and 'currentState'.
    // This event is here for completeness (some codebases use it).
    console.log(`Player ${playerId} joined at (${x}, ${y})`);
  });

  // 5f. Listen for door‐open (not used yet, but will be Day 3+)
  socket.on('openDoor', () => {
    console.log('Door is now open (Phaser can remove door sprite)');
    // In Day 3 or 4, you’ll actually remove the door sprite here
  });
}

// 6. Update loop (called ~60 times/sec)
function update(time, delta) {
  if (!player) return;

  // 6a. Reset velocity each frame
  player.setVelocity(0);

  // 6b. Basic arrow‐key movement controls
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

  // 6c. Emit 'playerMoved' at most every 50 ms to avoid spamming
  //     (time is the current timestamp in ms passed by Phaser)
  if (time - lastSent > 50) {
    socket.emit('playerMoved', { x: player.x, y: player.y });
    lastSent = time;
  }

  // 6d. If we had name/label above our own head, we’d update it here similarly:
  //     e.g. nameLabel.setPosition(player.x, player.y - 20);
}
