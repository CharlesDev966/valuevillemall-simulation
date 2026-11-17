import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { createPortal, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { setMaxAnisotropy } from '../three/textures';
import { LEVELS, createComposer, initialQuality, markShadows, saveQuality, toast } from '../three/post';
import * as game from '../game/world';
import { getState } from '../store';
import { Gondolas, Room } from './Room';
import { Shelves } from './Shelves';
import Hand from './Hand';
import BasketArm from './BasketArm';
import People from './People';
import Fridges from './Fridges';
import Checkout from './Checkout';
import Avatar from './Avatar';

/**
 * The store renders in two passes: the world, then a "view" scene glued to the camera
 * that holds the hand and the product in your hand, so they never clip into shelves.
 */
export default function Game() {
  const { gl, scene, camera } = useThree();
  const overlay = useMemo(() => new THREE.Scene(), []);
  const viewRoot = useRef();
  const statics = useRef();
  const receivers = useRef();
  const size = useThree((st) => st.size);
  const quality = useRef(initialQuality());

  // Runs during render so the textures built by the children get the right settings.
  useMemo(() => {
    setMaxAnisotropy(gl.capabilities.getMaxAnisotropy());
    scene.background = new THREE.Color('#f3f6f3');
    scene.fog = new THREE.Fog('#f3f6f3', 15, 34);
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    overlay.environment = env;
    camera.rotation.order = 'YXZ';
    // Soft shadows. The shop is static, so the shadow map is drawn once after it has built (see below).
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    gl.shadowMap.autoUpdate = false;
  }, [gl, scene, camera, overlay]);

  // Apply the quality level: low = original flat pipeline, medium/high = HDR + tone mapping (+ bloom).
  const applyQuality = (q, w, h) => {
    const wasComposer = game.world.composer;
    if (wasComposer) { wasComposer.dispose?.(); game.world.composer = null; }
    if (q === 'low') {
      gl.toneMapping = THREE.NoToneMapping;
    } else {
      gl.toneMapping = THREE.ACESFilmicToneMapping;
      gl.toneMappingExposure = 1.0;
      game.world.composer = createComposer(gl, scene, camera, w, h);
      game.world.composer.bloom.enabled = q === 'high';
    }
  };

  useLayoutEffect(() => {
    applyQuality(quality.current, size.width, size.height);
    const onKey = (e) => {
      if (e.code !== 'KeyG' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const next = LEVELS[(LEVELS.indexOf(quality.current) + 1) % LEVELS.length];
      quality.current = next; saveQuality(next);
      applyQuality(next, size.width, size.height);
      toast(`Graphics: ${next[0].toUpperCase() + next.slice(1)}  (press G to change)`);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera]);

  useEffect(() => {
    const c = game.world.composer;
    if (c) { c.setPixelRatio(gl.getPixelRatio()); c.setSize(size.width, size.height); }
  }, [gl, size]);

  // Mark shadow casters once the shop has built, then bake the shadow map (re-baked as late meshes appear).
  useEffect(() => {
    const bake = () => {
      if (statics.current) markShadows(statics.current);
      if (receivers.current) markShadows(receivers.current, { cast: false });
      gl.shadowMap.needsUpdate = true;
    };
    const ids = [150, 700, 2000, 5000].map((ms) => setTimeout(bake, ms));
    return () => ids.forEach(clearTimeout);
  }, [gl]);

  useLayoutEffect(() => {
    Object.assign(game.world, { gl, scene, camera, overlay, viewRoot: viewRoot.current });
    const detach = game.attachInput(gl.domElement);
    game.setPhase('intro');
    if (/[?&]plmdebug\b/.test(location.search)) {
      window.__plm = { ...game, getState, step(n = 1) { for (let i = 0; i < n; i++) game.frame(1 / 60); } };
    }
    return detach;
  }, [gl, scene, camera, overlay]);

  useFrame((_, dt) => game.frame(dt), 1);

  return (
    <>
      <hemisphereLight args={['#ffffff', '#d3d9d4', 1.2]} />
      <ambientLight intensity={0.2} />
      <directionalLight
        position={[3, 9, 4]} intensity={1.35} castShadow
        shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.03} shadow-radius={3}
        shadow-camera-left={-14} shadow-camera-right={14} shadow-camera-top={14} shadow-camera-bottom={-14}
        shadow-camera-near={0.5} shadow-camera-far={40}
      />
      <group ref={statics}>
        <Room />
        <Gondolas />
        <Fridges />
        <Checkout />
      </group>
      <group ref={receivers}><Shelves /></group>
      <People />
      <Avatar />
      {createPortal(
        <group ref={viewRoot}>
          <hemisphereLight args={['#ffffff', '#c9d0cb', 0.9]} />
          <directionalLight position={[-1, 2, 1.6]} intensity={1.35} />
          <directionalLight position={[1.5, 0.5, -1]} intensity={0.45} />
          <Hand />
          <BasketArm />
        </group>,
        overlay,
      )}
    </>
  );
}
