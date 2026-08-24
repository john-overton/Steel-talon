// Dev entry: what the arcade shell will do for real later.
import { onGameOver, start } from './main';

onGameOver((score, salvage) => {
  console.log(`gameover score=${score} salvage=${salvage}`);
});
start(0xc0ffee);
