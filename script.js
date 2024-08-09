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

    // animation flags
    isFront;


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
        this.isClicked = false

        this.main = document.querySelector("main")
        this.button = document.querySelector('#back_btn');



        /**
         * Shader
         */
        this.vertex = `
            precision mediump float;
            uniform float uProgress;
            uniform float uRotation;
            //uniform float uDistortion;

            varying vec2 vUv;
            varying vec2 vSize;
            varying float vProgress;
            varying vec4 vPosition;

            void main() {
                // 位置計算
                vec3 newPosition = position + vec3(0.0, uProgress * 3.0, 0.0);
                vProgress = uProgress;
                vUv = uv;

                // ディストーションエフェクト (前後の揺れを追加)
                // float distortionEffect = sin(newPosition.y * 5.0 + uDistortion) * 0.1;
                // newPosition.x += distortionEffect;
                // newPosition.y += cos(newPosition.x * 5.0 + uDistortion) * 0.1;

                // Y軸回転行列の計算
                float cosRot = cos(uRotation);
                float sinRot = sin(uRotation);

                mat4 rotationMatrix = mat4(
                    cosRot, 0.0, sinRot, 0.0,
                    0.0, 1.0, 0.0, 0.0,
                    -sinRot, 0.0, cosRot, 0.0,
                    0.0, 0.0, 0.0, 1.0
                );

                // 最終位置の計算
                gl_Position = projectionMatrix * modelViewMatrix * rotationMatrix * vec4(newPosition, 1.0);
            }
        `;

        this.fragment = `
            precision mediump float;

            uniform sampler2D uTexture;
            uniform vec2 uPlaneResolution;
            uniform float uProgress;
            uniform vec2 uTextureSize;
            uniform vec2 uQuadSize;

            varying vec2 vUv;
            varying vec2 vSize;
            varying vec4 vPosition;

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
            this.geometry = new THREE.PlaneGeometry(1, 1.2, 100, 100);
            this.group = new THREE.Group()

            this.textures.forEach((texture, idx) => {
                const material = new THREE.ShaderMaterial({
                    side: THREE.DoubleSide,
                    uniforms: {
                        uTexture: { value: texture },
                        uPlaneResolution: { value: new THREE.Vector2(this.width, this.height) },
                        uQuadSize: { value: new THREE.Vector2(this.wrapper.offsetWidth, this.wrapper.offsetHeight) },
                        uTextureSize: { value: new THREE.Vector2(texture.image.width, texture.image.height) },
                        uCorners: { value: new THREE.Vector4(0, 0, 0, 0) },
                        time: { value: 1.0 },
                        uProgress: { value: 0 },
                        uRotation: { value: 0 },
                        uCorners: { value: new THREE.Vector4(0, 0, 0, 0) },
                        uClicked: { value: false },
                        uDistortion: { value: 0 }
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

        this.onResize(); // Call once to set initial size
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

        setTimeout(() => {
            this.main.classList.add('view')
            initTextAnimation();
        }, 2100);

        this.tl.clear();
        this.tl.play();

        if (this.selectedMesh) {
            this.isClicked = true;
            this.tl.to(this.selectedMesh.material.uniforms.uRotation, {
                value: -Math.PI,
                duration: 2,
                ease: 'cubic-bezier(0, 0.55, 0.45, 1)',
                onUpdate: function () {
                    console.log("uRotation:", this.selectedMesh.material.uniforms.uRotation.value);
                    // this.selectedMesh.material.uniforms.uDistortion.value = Math.sin(this.tl.progress() * Math.PI) * 20.0;
                }.bind(this),
            }, '0.6')
                .to(this.selectedMesh.scale, {
                    x: 5,
                    y: 5,
                    duration: 2,
                    ease: 'cubic-bezier(0, 0.55, 0.45, 1)',
                    onStart: () => {
                        this.isFront = !this.isFront; // アニメーション開始時にisFrontを反転
                    },
                    onComplete: () => {
                        this.isClicked = false;
                        this.isExpanded = true;
                        // this.selectedMesh.material.uniforms.uDistortion.value = 0; // 回転終了時にディストーションをクリア
                        console.log("Animation complete: isExpanded is", this.isExpanded);
                    }
                }, '0.6');
        }
    }

    handleButtonClick() {
        if (this.isExpanded) {
            this.resetMesh();
        }
    }

    resetMesh() {
        if (!this.selectedMesh || !this.isExpanded) return;

        this.main.classList.remove('view');
        const { scaleX, scaleY } = this.calculateScales();

        this.tl.clear();

        this.tl
            .to(this.selectedMesh.scale, {
                x: scaleX,
                y: scaleY,
                duration: 2.5,
                ease: 'cubic-bezier(0.16, 1, 0.3, 1)',
            }, "0.4")
            .to(this.selectedMesh.material.uniforms.uRotation, {
                value: 0,
                duration: 2.5,
                ease: 'cubic-bezier(0.16, 1, 0.3, 1)',
                onUpdate: () => {
                    // this.selectedMesh.material.uniforms.uDistortion.value = Math.sin(this.tl.progress() * Math.PI) * 20.0;
                },
                onComplete: () => {
                    this.isExpanded = false;
                    this.isFront = true;
                    // this.selectedMesh.material.uniforms.uDistortion.value = 0; // 回転終了時にディストーションをクリア
                    this.selectedMesh = null;
                    console.log("After reset animation: isexpand is", this.isExpanded);

                    const elements = document.querySelectorAll('.inview_fadein');
                    elements.forEach(el => {
                        gsap.set(el, {
                            clearProps: "all" // clear all GSAP inline styles
                        });
                    });
                }
            }, "0.4")

        // Play the timeline
        this.tl.play();
    }


    /**
     * Resize
     */
    calculateScales() {
        const aspect = 1;
        let scaleX, scaleY;

        if (this.width / this.height > aspect) {
            scaleY = this.height / 2000;
            scaleX = scaleY * aspect;
        } else {
            scaleX = this.width / 2000;
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
        requestAnimationFrame(this.render);

        this.renderer.render(this.scene, this.camera);
    }
}