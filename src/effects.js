import { ParticleSystem, Color4, Vector3, MeshBuilder, StandardMaterial, Color3 } from '@babylonjs/core';
import { softDotTexture } from './materials.js';

export function createEffects(scene) {
  const dot = softDotTexture(scene);

  const droplets = new ParticleSystem('droplets', 200, scene);
  droplets.particleTexture = dot;
  droplets.emitter = new Vector3(0, 0.3, 0);
  droplets.minEmitBox = new Vector3(-0.1, 0, -0.1);
  droplets.maxEmitBox = new Vector3(0.1, 0, 0.1);
  droplets.color1 = new Color4(0.85, 0.96, 1, 1);
  droplets.color2 = new Color4(0.55, 0.85, 1, 0.9);
  droplets.colorDead = new Color4(0.7, 0.9, 1, 0);
  droplets.minSize = 0.07;
  droplets.maxSize = 0.17;
  droplets.minLifeTime = 0.45;
  droplets.maxLifeTime = 0.9;
  droplets.direction1 = new Vector3(-1.5, 4.2, -1.5);
  droplets.direction2 = new Vector3(1.5, 6.5, 1.5);
  droplets.gravity = new Vector3(0, -14, 0);
  droplets.emitRate = 0;
  droplets.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  droplets.start();

  const confetti = new ParticleSystem('confetti', 300, scene);
  confetti.particleTexture = dot;
  confetti.emitter = new Vector3(0, 0.5, 0);
  confetti.minEmitBox = new Vector3(-0.2, 0, -0.2);
  confetti.maxEmitBox = new Vector3(0.2, 0, 0.2);
  confetti.addColorGradient(0, new Color4(1, 0.35, 0.4, 1));
  confetti.addColorGradient(0.33, new Color4(1, 0.85, 0.25, 1));
  confetti.addColorGradient(0.66, new Color4(0.4, 0.85, 1, 1));
  confetti.addColorGradient(1, new Color4(0.7, 1, 0.5, 0));
  confetti.minSize = 0.1;
  confetti.maxSize = 0.24;
  confetti.minLifeTime = 0.9;
  confetti.maxLifeTime = 1.7;
  confetti.direction1 = new Vector3(-3.2, 5, -3.2);
  confetti.direction2 = new Vector3(3.2, 9, 3.2);
  confetti.gravity = new Vector3(0, -9, 0);
  confetti.emitRate = 0;
  confetti.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  confetti.start();

  const fire = new ParticleSystem('fire', 400, scene);
  fire.particleTexture = dot;
  fire.emitter = new Vector3(0, 0.5, 0);
  fire.minEmitBox = new Vector3(-0.15, 0, -0.15);
  fire.maxEmitBox = new Vector3(0.15, 0.1, 0.15);
  fire.addColorGradient(0, new Color4(1, 0.95, 0.65, 1));
  fire.addColorGradient(0.35, new Color4(1, 0.55, 0.12, 0.9));
  fire.addColorGradient(1, new Color4(0.6, 0.1, 0.02, 0));
  fire.minSize = 0.5;
  fire.maxSize = 1.1;
  fire.minLifeTime = 0.3;
  fire.maxLifeTime = 0.75;
  fire.direction1 = new Vector3(-3.5, 1, -3.5);
  fire.direction2 = new Vector3(3.5, 6, 3.5);
  fire.gravity = new Vector3(0, -2, 0);
  fire.emitRate = 0;
  fire.blendMode = ParticleSystem.BLENDMODE_ADD;
  fire.start();

  const smoke = new ParticleSystem('smoke', 300, scene);
  smoke.particleTexture = dot;
  smoke.emitter = new Vector3(0, 0.5, 0);
  smoke.minEmitBox = new Vector3(-0.3, 0, -0.3);
  smoke.maxEmitBox = new Vector3(0.3, 0.2, 0.3);
  smoke.addColorGradient(0, new Color4(0.22, 0.2, 0.19, 0.75));
  smoke.addColorGradient(0.5, new Color4(0.42, 0.41, 0.4, 0.45));
  smoke.addColorGradient(1, new Color4(0.6, 0.6, 0.6, 0));
  smoke.minSize = 0.8;
  smoke.maxSize = 1.7;
  smoke.minLifeTime = 1.1;
  smoke.maxLifeTime = 2.3;
  smoke.direction1 = new Vector3(-1.2, 1.5, -1.2);
  smoke.direction2 = new Vector3(1.2, 3.4, 1.2);
  smoke.gravity = new Vector3(0, 0.8, 0);
  smoke.emitRate = 0;
  smoke.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  smoke.start();

  const sparks = new ParticleSystem('sparks', 300, scene);
  sparks.particleTexture = dot;
  sparks.emitter = new Vector3(0, 0.5, 0);
  sparks.minEmitBox = Vector3.Zero();
  sparks.maxEmitBox = Vector3.Zero();
  sparks.addColorGradient(0, new Color4(1, 0.95, 0.6, 1));
  sparks.addColorGradient(1, new Color4(1, 0.4, 0.1, 0));
  sparks.minSize = 0.05;
  sparks.maxSize = 0.13;
  sparks.minLifeTime = 0.2;
  sparks.maxLifeTime = 0.5;
  sparks.direction1 = new Vector3(-5, -2, -5);
  sparks.direction2 = new Vector3(5, 5, 5);
  sparks.gravity = new Vector3(0, -12, 0);
  sparks.emitRate = 0;
  sparks.blendMode = ParticleSystem.BLENDMODE_ADD;
  sparks.start();

  const ringMat = new StandardMaterial('ring', scene);
  ringMat.emissiveColor = new Color3(1, 1, 1);
  ringMat.disableLighting = true;
  ringMat.specularColor = Color3.Black();

  const ripples = [];
  scene.onBeforeRenderObservable.add(() => {
    const dt = scene.getEngine().getDeltaTime() / 1000;
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i];
      r.age += dt;
      const k = r.age / r.life;
      if (k >= 1) {
        r.mesh.dispose();
        ripples.splice(i, 1);
        continue;
      }
      const s = r.from + (r.to - r.from) * (1 - Math.pow(1 - k, 2));
      r.mesh.scaling.set(s, 1, s);
      r.mesh.visibility = (1 - k) * 0.85;
    }
  });

  function ripple(x, y, z, delay = 0, to = 2.6, life = 1.1) {
    const mesh = MeshBuilder.CreateTorus('ripple', { diameter: 1, thickness: 0.04, tessellation: 40 }, scene);
    mesh.position.set(x, y, z);
    mesh.material = ringMat;
    mesh.isPickable = false;
    mesh.scaling.set(0.2, 1, 0.2);
    ripples.push({ mesh, age: -delay, life, from: 0.3, to });
  }

  return {
    splash(x, y, z) {
      droplets.emitter = new Vector3(x, y, z);
      droplets.manualEmitCount = 55;
      ripple(x, y, z);
      ripple(x, y, z, 0.18);
    },
    confetti(x, y, z) {
      confetti.emitter = new Vector3(x, y, z);
      confetti.manualEmitCount = 120;
    },
    // fireball + smoke; `size` scales the particles (1 = bomb, ~2 = helicopter wreck)
    explosion(x, y, z, size = 1) {
      fire.emitter = new Vector3(x, y, z);
      fire.minSize = 0.5 * size;
      fire.maxSize = 1.1 * size;
      fire.manualEmitCount = Math.round(45 * size);
      smoke.emitter = new Vector3(x, y + 0.2, z);
      smoke.minSize = 0.8 * size;
      smoke.maxSize = 1.7 * size;
      smoke.manualEmitCount = Math.round(22 * size);
      sparks.emitter = new Vector3(x, y, z);
      sparks.manualEmitCount = Math.round(30 * size);
      ripple(x, Math.min(y, 0.45), z, 0, 3.2 * size, 0.55);
    },
    sparks(x, y, z, n = 8) {
      sparks.emitter = new Vector3(x, y, z);
      sparks.manualEmitCount = n;
    },
    puff(x, y, z, n = 4) {
      smoke.emitter = new Vector3(x, y, z);
      smoke.minSize = 0.5;
      smoke.maxSize = 1.0;
      smoke.manualEmitCount = n;
    },
  };
}
