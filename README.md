# Karada

**Realtime unified body tracking for the web — face, body, and both hands as a single, coherent skeleton.**

[![License: PolyForm NC 1.0.0](https://img.shields.io/badge/license-PolyForm%20NC%201.0.0-blue)](./LICENSE)
[![Code size](https://img.shields.io/github/languages/code-size/diegohenriquez279-ctrl/karada)](https://github.com/diegohenriquez279-ctrl/karada)

<!-- TODO: reemplazar por GIF real tras primer deploy -->
![Karada demo](./docs/assets/demo.gif)

**Live demo:** https://diegohenriquez279-ctrl.github.io/karada/

> Not yet published to NPM — coming in Phase 3. See the live demo above and clone the repo to try it locally.

## Example

```ts
import { Karada } from 'karada';

const karada = new Karada({
  track: { face: true, body: true, hands: true },
  quality: 'balanced',
  camera: 'user',
  mirror: true,
});

karada.on('ready', () => console.log('ready'));
karada.on('frame', (skeleton) => {
  if (skeleton.rightHand) drawHand(skeleton.rightHand);
  drawBody(skeleton.body);
});
karada.on('error', (err) => console.error(err.type, err.message));

await karada.start();
```

## License

Karada is licensed under the [PolyForm Noncommercial License 1.0.0](./LICENSE). Non-commercial use is free; commercial use requires explicit permission from the author.

Karada uses [MediaPipe Tasks Vision](https://developers.google.com/mediapipe/solutions/vision) under the Apache License 2.0. See [NOTICE](./NOTICE) for details.
