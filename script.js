/**
 * 2つのメッシュに異なる画像を貼って、Group化する？
 * ref - https://hofk.de/main/threejs/1TEST/SimpleDoubleSide(gl_FrontFacing).html
 * https://discourse.threejs.org/t/different-materials-on-plane-side-a-and-side-b/58310/3
 * https://discourse.threejs.org/t/how-to-have-different-colors-textures-on-bottom-and-top-side-of-a-plane/12644/7
 */

import * as THREE from './three.module.js'
import initTextAnimation from './textAnimation.js';

window.addEventListener('DOMContentLoaded', async () => {
    const wrapper = document.querySelector('#webgl');
    const app = new ThreeApp(wrapper);

    await app.load();
    app.init();
    app.render();
}, false);

class ThreeApp {
    /**
     * カメラ定義のための定数
     */
    static CAMERA_PARAM = {
        // fovy: 65,
        fovy: 2 * (Math.atan((window.innerHeight / 2) / 600) * 180 / Math.PI),
        aspect: window.innerWidth / window.innerHeight,
        near: 0.1,
        far: 1000,
        position: new THREE.Vector3(0, 0, 1),
        lookAt: new THREE.Vector3(0.0, 0.0, 0.0),
    };


    /**
     * レンダラー定義のための定数
     */
    static RENDERER_PARAM = {
        clearColor: 0x000000,
        width: window.innerWidth,
        height: window.innerHeight,
    };


    /**
     * 平行光源定義のための定数
     */
    static DIRECTIONAL_LIGHT_PARAM = {
        color: 0xffffff,
        intensity: 1.0,
        position: new THREE.Vector3(1.0, 1.0, 1.0),
    };


    /**
     * アンビエントライト定義のための定数
     */
    static AMBIENT_LIGHT_PARAM = {
        color: 0xffffff,
        intensity: 0.1,
    };


    /**
     * マテリアル定義のための定数
     */
    static MATERIAL_PARAM = {
        color: 0xffffff,
    };

    wrapper;
    renderer;
    scene;
    camera;
    geometry;
    material;
    materials = []
    mesh;
    group;

    directionalLight;
    ambientLight;
    controls;
    axesHelper;
    clock;

    // raycaster
    raycaster;


    /**
     * コンストラクタ
     * @constructor
     * @param {HTMLElement} wrapper - canvas 要素を append する親要素
     */
    constructor(wrapper) {
        this.wrapper = wrapper;
        this.textures = null;

        // Raycaster
        this.raycaster = new THREE.Raycaster();
        this.selectedMesh = null;
        this.tl = gsap.timeline()
        this.isFront = true;
        this.isExpanded = false; // To track if a mesh is expanded
        this.selectedMesh = null; // To keep track of the currently selected mesh
        this.isAnimating = false

        this.main = document.querySelector("main")
        this.button = document.querySelector('#back_btn');


        /**
         * Shader
         */
        this.vertex = `
            precision mediump float;
            // uniform float uRotation;
            uniform float uTime;
            uniform float uSpeed;
            uniform bool uAnimating;

            uniform float uRotationProgress; // 0 - 1
            uniform float uWaveSpeed;
            uniform float uWaveHeight;

            varying vec2 vUv;
            varying vec2 vSize;

            void main() {
                // ワールド空間の位置計算
                vec3 newPosition = position + vec3(0.0);
                vUv = uv;

                if(uAnimating) {
                    //　newPosition.x * XXX = 波の周期, uWaveSpeed = 波の速度, uWaveHeight = 波の高さ
                    float wave = sin(-newPosition.x * 1.5 + uTime * uWaveSpeed * 1.) * uWaveHeight;

                    // 回転の進行に応じて0→1→0と変化する
                    // これにより、回転の開始時と終了時に波が消え、半回転時に最大になる
                    wave = wave * sin(3.14159 * uRotationProgress);
                    newPosition.z += wave;
                }

                // Y軸回転行列の計算 - remove this code later
                // float cosRot = cos(uRotation);
                // float sinRot = sin(uRotation);

                // mat4 rotationMatrix = mat4(
                //     cosRot, 0.0, sinRot, 0.0,
                //     0.0, 1.0, 0.0, 0.0,
                //     -sinRot, 0.0, cosRot, 0.0,
                //     0.0, 0.0, 0.0, 1.0
                // );

                gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
            }
        `;

        this.fragment = `
            precision mediump float;

            uniform sampler2D uTexture;
            uniform vec2 uPlaneResolution;
            uniform vec2 uTextureSize;
            uniform vec2 uQuadSize;

            varying vec2 vUv;
            varying vec2 vSize;

            // texture object-fit cover effect
            vec2 getUV(vec2 uv, vec2 texureSize, vec2 planesize){
                // UVを中心原点とする座標系に変換
                vec2 tempUV = uv - vec2(.5);

                // メッシュのアスペクト比を計算
                float planeAspect = uPlaneResolution.x / uPlaneResolution.y;

                // テクスチャのアスペクト比を計算
                float textureAspect = uTextureSize.x / uTextureSize.y;

                // メッシュとテクスチャのアスペクト比を比較し、適切にスケーリング
                if(planeAspect < textureAspect){
                    // メッシュが横長の場合、横方向にスケーリング
                    tempUV = tempUV * vec2(planeAspect/textureAspect, 1.);
                } else {
                    // メッシュが縦長の場合、縦方向にスケーリング
                    tempUV = tempUV * vec2(1., textureAspect/planeAspect);
                }

                // UV座標を元の0-1の範囲に戻す
                tempUV += vec2(0.5);
                return tempUV;
            }

            void main() {
                vec2 correctUV = getUV(vUv, uTextureSize, vSize);
                vec4 textureColor = texture2D(uTexture, correctUV);

                // テクスチャの裏表の判定
                if (gl_FrontFacing) {
                    // 表面の場合、テクスチャをそのまま表示
                    gl_FragColor = textureColor;
                } else {
                    // 裏面の場合、テクスチャをgreenにする
                    gl_FragColor = vec4(0.0, 0.73, 0.58, 1.0);
                }
            }
        `;


        // this のバインド
        this.render = this.render.bind(this);
        this.onResize = this.onResize.bind(this);
        this.onClick = this.onClick.bind(this);
        this.button.addEventListener('click', this.handleButtonClick.bind(this));


        window.addEventListener('resize', this.onResize, false);
        window.addEventListener('click', this.onClick, false);
    }



    /**
     * Load textures
     */
    async load() {
        this.textures = await this.loadTextures();
    }


    init() {
        const color = new THREE.Color(ThreeApp.RENDERER_PARAM.clearColor);
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true
        });
        this.renderer.setClearColor(color);
        this.renderer.setSize(ThreeApp.RENDERER_PARAM.width, ThreeApp.RENDERER_PARAM.height);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.wrapper.appendChild(this.renderer.domElement);


        /**
         * Scene
         */
        this.scene = new THREE.Scene();


        /**
         * Camera
         */
        this.camera = new THREE.PerspectiveCamera(
            ThreeApp.CAMERA_PARAM.fovy,
            ThreeApp.CAMERA_PARAM.aspect,
            ThreeApp.CAMERA_PARAM.near,
            ThreeApp.CAMERA_PARAM.far,
        );
        this.camera.position.copy(ThreeApp.CAMERA_PARAM.position);
        this.camera.lookAt(ThreeApp.CAMERA_PARAM.lookAt);


        /**
         * Directional light
         */
        this.directionalLight = new THREE.DirectionalLight(
            ThreeApp.DIRECTIONAL_LIGHT_PARAM.color,
            ThreeApp.DIRECTIONAL_LIGHT_PARAM.intensity
        );
        this.directionalLight.position.copy(ThreeApp.DIRECTIONAL_LIGHT_PARAM.position);
        this.scene.add(this.directionalLight);


        /**
         * Ambient light
         */
        this.ambientLight = new THREE.AmbientLight(
            ThreeApp.AMBIENT_LIGHT_PARAM.color,
            ThreeApp.AMBIENT_LIGHT_PARAM.intensity,
        );
        this.scene.add(this.ambientLight);


        /**
         * Mesh
         */
        if (this.textures) {
            this.geometry = new THREE.PlaneGeometry(1, 1.2, 200, 200);
            this.group = new THREE.Group()

            this.textures.forEach((texture, idx) => {
                const material = new THREE.ShaderMaterial({
                    side: THREE.DoubleSide,
                    uniforms: {
                        uTexture: { value: texture },
                        uPlaneResolution: { value: new THREE.Vector2(this.width, this.height) },
                        uQuadSize: { value: new THREE.Vector2(this.wrapper.offsetWidth, this.wrapper.offsetHeight) },
                        uTextureSize: { value: new THREE.Vector2(texture.image.width, texture.image.height) },
                        uSpeed: { value: 0 },
                        uAnimating: { value: false },
                        uTime: { value: 0.0 },
                        uRotationProgress: { value: 0.0 },
                        uWaveSpeed: { value: 1 },
                        uWaveHeight: { value: 0.3 },
                    },
                    vertexShader: this.vertex,
                    fragmentShader: this.fragment
                });
                const mesh = new THREE.Mesh(this.geometry, material);

                mesh.position.set(0, 0, 0);
                const { scaleX, scaleY } = this.calculateScales();
                mesh.scale.set(scaleX, scaleY, 1);

                this.group.add(mesh)
                this.materials.push(mesh)
            });
            this.scene.add(this.group);
        }


        /**
         * Helper
         */
        const axesBarLength = 10.0;
        this.axesHelper = new THREE.AxesHelper(axesBarLength);
        // this.scene.add(this.axesHelper);

        this.onResize();
    }


    /**
     * Loading assets
     */
    loadTexture(url) {
        return new Promise((resolve, reject) => {
            const loader = new THREE.TextureLoader();
            loader.load(url, resolve, undefined, reject);
        });
    }

    async loadTextures() {
        const textureUrls = [
            './7.jpg',
        ];

        try {
            const textures = await Promise.all(textureUrls.map(url => this.loadTexture(url)));
            console.log('All textures loaded successfully');
            return textures;
        } catch (error) {
            console.error('Error loading textures:', error);
        }
    }


    /**
     * Click event
     */
    onClick(event) {
        const mouse = new THREE.Vector2();
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        this.raycaster.setFromCamera(mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.group.children);

        if (!this.isExpanded && intersects.length > 0) {
            const clickedMesh = intersects[0].object;
            this.selectedMesh = clickedMesh;
            this.isFront = true;
            this.expandMesh();
        }
    }


    expandMesh() {
        if (!this.selectedMesh || this.isExpanded) return;

        const rotationDuration = 1.8;
        const scaleDuration = 2.2;
        const totalDuration = rotationDuration + scaleDuration / 2; // 全体の所要時間

        this.isAnimating = true

        this.materials.forEach(mesh => {
            mesh.material.uniforms.uAnimating.value = true;
        });

        const self = this;

        setTimeout(() => {
            initTextAnimation();
            this.main.classList.add('view')
        }, totalDuration * 800);

        this.tl.clear();
        this.tl.play();

        if (this.selectedMesh) {
            this.tl
                .to(this.selectedMesh.rotation, {
                    y: Math.PI,
                    duration: rotationDuration,
                    ease: 'power3.inOut',
                }, '0')
                // .to(this.selectedMesh.material.uniforms.uRotationProgress, {
                //     value: 1,
                //     duration: rotationDuration,
                //     ease: 'power3.inOut',
                // }, '0')
                .to(this.selectedMesh.scale, {
                    x: 5,
                    y: 5,
                    duration: scaleDuration,
                    ease: 'power4.out',
                    onStart: () => {
                        this.isFront = !this.isFront; // アニメーション開始時にisFrontを反転
                    },
                    onComplete: () => {
                        this.isExpanded = true;
                        this.isAnimating = false
                        self.materials.forEach(mesh => {
                            mesh.material.uniforms.uAnimating.value = false;
                            mesh.material.uniforms.uRotationProgress.value = 1;
                        });
                    }
                }, `${scaleDuration / 2.4}`)
        }
    }

    handleButtonClick() {
        if (this.isExpanded) {
            this.resetMesh();
        }
    }

    resetMesh() {
        if (!this.selectedMesh || !this.isExpanded) return;

        const rotationDuration = 1.8;
        const scaleDuration = 1.7

        const duration = 1.6;

        this.main.classList.remove('view');
        const { scaleX, scaleY } = this.calculateScales();

        this.tl.clear();

        const self = this;

        this.isAnimating = true
        this.materials.forEach(mesh => {
            mesh.material.uniforms.uAnimating.value = true;
        });

        setTimeout(() => {
            this.tl
                .to(this.selectedMesh.scale, {
                    x: scaleX,
                    y: scaleY,
                    duration: scaleDuration,
                    ease: 'power3.inOut',
                }, '0')
                .to(this.selectedMesh.rotation, {
                    y: 0,
                    duration: rotationDuration,
                    ease: 'power3.inOut',
                }, '0')
                .to(this.selectedMesh.material.uniforms.uRotationProgress, {
                    value: 0,
                    duration: rotationDuration,
                    ease: 'ease',
                    onComplete: () => {
                        this.isExpanded = false;
                        this.isFront = true;
                        this.selectedMesh = null;
                        self.materials.forEach(mesh => {
                            mesh.material.uniforms.uAnimating.value = false;
                            mesh.material.uniforms.uRotationProgress.value = 0;
                        });

                        const elements = document.querySelectorAll('.inview_fadein');
                        elements.forEach(el => {
                            gsap.set(el, {
                                clearProps: "all"
                            });
                        });
                        this.isAnimating = false
                    }
                }, '0.4')

            this.tl.to(this.selectedMesh.material.uniforms.uTime, {
                value: Math.PI * 2,
                duration: duration + 0.5, //少し長く
                ease: 'linear',
                onComplete: () => {
                    self.materials.forEach(mesh => {
                        mesh.material.uniforms.uTime.value = 0;
                    });
                }
            }, '1.2');
            this.tl.play();
        }, 1000);
    }


    /**
     * Resize
     */
    calculateScales() {
        const aspect = 1;
        let scaleX, scaleY;

        if (this.width / this.height > aspect) {
            scaleY = this.height / 1500;
            scaleX = scaleY * aspect;
        } else {
            scaleX = this.width / 1500;
            scaleY = scaleX / aspect;
        }

        return { scaleX, scaleY };
    }

    onResize() {
        this.width = this.wrapper.offsetWidth;
        this.height = this.wrapper.offsetHeight;

        this.camera.aspect = this.width / this.height;
        this.camera.fov = 2 * (Math.atan((this.height / 2) / 600) * 180 / Math.PI);
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(this.width, this.height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        if (this.group && this.group.children.length > 0) {
            const { scaleX, scaleY } = this.calculateScales();

            this.group.children.forEach((mesh) => {
                if (this.isExpanded && mesh === this.selectedMesh) {
                    return;
                }

                mesh.scale.set(scaleX, scaleY, 1);

                if (mesh.material.uniforms) {
                    mesh.material.uniforms.uPlaneResolution.value.set(this.width, this.height);
                    mesh.material.uniforms.uQuadSize.value.set(this.width, this.height);
                }
            });
        }
    }


    /**
     * Render
     */
    render() {
        if (this.isAnimating) {
            this.materials.forEach((mesh) => {
                mesh.material.uniforms.uTime.value += 0.025;
            });
        }

        requestAnimationFrame(this.render);

        this.renderer.render(this.scene, this.camera);
    }
}