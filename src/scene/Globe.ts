import {
  AdditiveBlending,
  BackSide,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  NoColorSpace,
  ShaderMaterial,
  SphereGeometry,
  TextureLoader,
  Vector3,
  type PerspectiveCamera,
  type Texture,
} from 'three';
import { sunDirection } from '../core/astronomy';
import { smoothstep } from '../core/math';

const EARTH_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vUv = uv;
    vNormal = normal;
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorldPos, 1.0);
  }
`;

const EARTH_FRAG = /* glsl */ `
  uniform sampler2D uDay;
  uniform sampler2D uNight;
  uniform vec3 uSunDir;
  uniform float uTerminator;
  uniform float uDim;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vec3 n = normalize(vNormal);
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float ndl = dot(n, uSunDir);

    // 1 on the day side, 0 on the night side, with a soft twilight band in between.
    float dayAmt = mix(1.0, smoothstep(-0.10, 0.20, ndl), uTerminator);

    vec3 day = texture2D(uDay, vUv).rgb;
    vec3 night = texture2D(uNight, vUv).rgb;

    float shade = mix(1.0, 0.78 + 0.22 * clamp(ndl, 0.0, 1.0), uTerminator);
    vec3 dayLit = day * shade * 1.06 * (1.0 - 0.62 * uDim);

    // Keep the faint blue land silhouette, but let the city lights do the shining.
    float lights = smoothstep(0.22, 0.75, dot(night, vec3(0.3, 0.59, 0.11)));
    vec3 nightLit = night * 0.85 + vec3(1.0, 0.82, 0.5) * lights * 1.15;

    vec3 color = mix(nightLit, dayLit, dayAmt);

    // Warm twilight glow hugging the terminator.
    float twilight = exp(-pow((ndl - 0.03) / 0.09, 2.0));
    color += vec3(1.0, 0.5, 0.25) * twilight * 0.09 * uTerminator;

    // Thin atmospheric rim on the globe itself.
    float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 3.2);
    color += vec3(0.25, 0.55, 1.0) * fres * 0.6 * (0.25 + 0.75 * dayAmt);

    gl_FragColor = vec4(color, 1.0);
  }
`;

const CLOUD_FRAG = /* glsl */ `
  uniform sampler2D uClouds;
  uniform vec3 uSunDir;
  uniform float uTerminator;
  uniform float uOpacity;
  uniform float uDim;
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    float ndl = dot(normalize(vNormal), uSunDir);
    float dayAmt = mix(1.0, smoothstep(-0.12, 0.25, ndl), uTerminator);
    float a = texture2D(uClouds, vUv).a * uOpacity * (1.0 - 0.65 * uDim);
    vec3 color = mix(vec3(0.05, 0.06, 0.1), vec3(1.0), dayAmt);
    gl_FragColor = vec4(color, a * mix(0.35, 1.0, dayAmt));
  }
`;

const ATMOSPHERE_VERT = /* glsl */ `
  varying vec3 vViewNormal;
  varying vec3 vWorldNormal;
  void main() {
    vViewNormal = normalize(normalMatrix * normal);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ATMOSPHERE_FRAG = /* glsl */ `
  uniform vec3 uSunDir;
  uniform float uTerminator;
  uniform float uFade;
  varying vec3 vViewNormal;
  varying vec3 vWorldNormal;
  void main() {
    // 1 at the centre of the disc, 0 at the outer limb of this (back-facing) shell.
    float d = -dot(vViewNormal, vec3(0.0, 0.0, 1.0));
    float intensity = pow(clamp(d / 0.52, 0.0, 1.0), 2.6);
    vec3 glow = mix(vec3(0.12, 0.42, 1.0), vec3(0.5, 0.8, 1.0), intensity);
    float lit = mix(1.0, 0.22 + 0.78 * smoothstep(-0.35, 0.4, dot(vWorldNormal, uSunDir)), uTerminator);
    gl_FragColor = vec4(glow * intensity * lit * 1.25, intensity * lit * uFade);
  }
`;

const base = import.meta.env.BASE_URL;

export interface GlobeTextureProgress {
  (loaded: number, total: number): void;
}

export class Globe {
  /** Static parent for everything that lives on the planet (data layers). */
  readonly group = new Group();

  private readonly earthMaterial: ShaderMaterial;
  private readonly cloudMaterial: ShaderMaterial;
  private readonly atmosphereMaterial: ShaderMaterial;
  private readonly cloudMesh: Mesh;
  private readonly sun = new Vector3(1, 0, 0);
  private terminator = true;
  private dim = 0;
  private dimTarget = 0;

  constructor() {
    this.earthMaterial = new ShaderMaterial({
      vertexShader: EARTH_VERT,
      fragmentShader: EARTH_FRAG,
      uniforms: {
        uDay: { value: null },
        uNight: { value: null },
        uSunDir: { value: this.sun },
        uTerminator: { value: 1 },
        uDim: { value: 0 },
      },
    });
    const earth = new Mesh(new SphereGeometry(1, 192, 96), this.earthMaterial);
    earth.name = 'earth';

    this.cloudMaterial = new ShaderMaterial({
      vertexShader: EARTH_VERT,
      fragmentShader: CLOUD_FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uClouds: { value: null },
        uSunDir: { value: this.sun },
        uTerminator: { value: 1 },
        uOpacity: { value: 0.8 },
        uDim: { value: 0 },
      },
    });
    this.cloudMesh = new Mesh(new SphereGeometry(1.007, 128, 64), this.cloudMaterial);
    this.cloudMesh.renderOrder = 1;

    this.atmosphereMaterial = new ShaderMaterial({
      vertexShader: ATMOSPHERE_VERT,
      fragmentShader: ATMOSPHERE_FRAG,
      side: BackSide,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uSunDir: { value: this.sun },
        uTerminator: { value: 1 },
        uFade: { value: 1 },
      },
    });
    const atmosphere = new Mesh(new SphereGeometry(1.16, 96, 48), this.atmosphereMaterial);
    atmosphere.renderOrder = 2;

    this.group.add(earth, this.cloudMesh, atmosphere);
  }

  async loadTextures(anisotropy: number, onProgress?: GlobeTextureProgress): Promise<void> {
    const loader = new TextureLoader();
    const files = ['earth_day_4k.jpg', 'earth_night_4k.jpg', 'earth_clouds.png'];
    let loaded = 0;
    const load = async (file: string): Promise<Texture> => {
      const texture = await loader.loadAsync(`${base}textures/${file}`);
      // Shaders work directly in sRGB, so no colour-space decoding on sampling.
      texture.colorSpace = NoColorSpace;
      texture.anisotropy = anisotropy;
      texture.generateMipmaps = true;
      texture.minFilter = LinearMipmapLinearFilter;
      texture.magFilter = LinearFilter;
      onProgress?.(++loaded, files.length);
      return texture;
    };
    const [day, night, clouds] = await Promise.all(files.map(load));
    this.earthMaterial.uniforms.uDay!.value = day;
    this.earthMaterial.uniforms.uNight!.value = night;
    this.cloudMaterial.uniforms.uClouds!.value = clouds;
  }

  setSimTime(timeMs: number): void {
    sunDirection(timeMs, this.sun);
  }

  setTerminatorEnabled(enabled: boolean): void {
    this.terminator = enabled;
    const value = enabled ? 1 : 0;
    this.earthMaterial.uniforms.uTerminator!.value = value;
    this.cloudMaterial.uniforms.uTerminator!.value = value;
    this.atmosphereMaterial.uniforms.uTerminator!.value = value;
  }

  get terminatorEnabled(): boolean {
    return this.terminator;
  }

  setCloudsVisible(visible: boolean): void {
    this.cloudMesh.visible = visible;
  }

  get cloudsVisible(): boolean {
    return this.cloudMesh.visible;
  }

  /** Darken the imagery (0..1) so thin overlays such as wind stay readable. Eased in `update`. */
  setDim(target: number): void {
    this.dimTarget = target;
  }

  /** Called every frame: keeps the atmosphere from tinting the whole screen when zoomed in. */
  update(camera: PerspectiveCamera, dt: number): void {
    const distance = camera.position.length();
    this.atmosphereMaterial.uniforms.uFade!.value = smoothstep(1.17, 1.7, distance);

    this.dim += (this.dimTarget - this.dim) * Math.min(1, dt * 6);
    this.earthMaterial.uniforms.uDim!.value = this.dim;
    this.cloudMaterial.uniforms.uDim!.value = this.dim;
  }

  dispose(): void {
    this.group.traverse((object) => {
      if (object instanceof Mesh) {
        object.geometry.dispose();
        (object.material as ShaderMaterial).dispose();
      }
    });
    for (const material of [this.earthMaterial, this.cloudMaterial]) {
      for (const uniform of Object.values(material.uniforms)) {
        const value = uniform.value as Texture | null;
        if (value && 'isTexture' in value) value.dispose();
      }
    }
  }
}
