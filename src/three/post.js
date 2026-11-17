import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/**
 * Graphics quality.  low    = the original flat look (cheapest, for weak phones/laptops)
 *                    medium = filmic tone mapping + 4x MSAA in a HDR pipeline
 *                    high   = medium + soft bloom on bright lights
 * Pick with ?q=low|medium|high in the URL, or press G in the store to cycle.
 */
export const LEVELS = ['low', 'medium', 'high'];

export function initialQuality() {
  let q = null;
  try { q = new URLSearchParams(location.search).get('q') || localStorage.getItem('vv-quality'); } catch { /* ignore */ }
  if (LEVELS.includes(q)) return q;
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return touch ? 'medium' : 'high';
}

export function saveQuality(q) { try { localStorage.setItem('vv-quality', q); } catch { /* ignore */ } }

export function toast(msg) {
  let el = document.getElementById('vv-toast');
  if (!el) {
    el = document.createElement('div'); el.id = 'vv-toast';
    Object.assign(el.style, {
      position: 'fixed', left: '50%', bottom: '88px', transform: 'translateX(-50%)', padding: '8px 16px',
      background: 'rgba(11,82,40,.92)', color: '#fff', borderRadius: '999px', font: '600 14px Figtree, sans-serif',
      zIndex: 50, pointerEvents: 'none', transition: 'opacity .3s', opacity: 0,
    });
    document.body.appendChild(el);
  }
  el.textContent = msg; el.style.opacity = 1;
  clearTimeout(toast.t); toast.t = setTimeout(() => { el.style.opacity = 0; }, 1600);
}

export function createComposer(gl, scene, camera, w, h) {
  const pr = gl.getPixelRatio();
  const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(gl, rt);
  composer.setPixelRatio(pr);
  composer.setSize(w, h);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.16, 0.5, 1.0);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  composer.bloom = bloom;
  return composer;
}

/** Marks static solid meshes as shadow casters/receivers. Planes (walls, ceiling, labels) and see-through things never cast. */
export function markShadows(root, { cast = true } = {}) {
  root.traverse((m) => {
    if (!m.isMesh) return;
    const mat = Array.isArray(m.material) ? m.material[0] : m.material;
    if (!mat || mat.isMeshBasicMaterial || mat.transparent) return;
    m.receiveShadow = true;
    if (cast && m.geometry && m.geometry.type !== 'PlaneGeometry') m.castShadow = true;
  });
}
