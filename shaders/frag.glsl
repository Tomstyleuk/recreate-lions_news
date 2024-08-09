uniform sampler2D uTexture;
uniform vec2 uPlaneResolution;
uniform vec2 uQuadSize;

varying vec2 vUv;

void main() {
    vec2 uv = vUv;
    uv.x *= uQuadSize.x / uPlaneResolution.x;
    uv.y *= uQuadSize.y / uPlaneResolution.y;
    
    gl_FragColor = texture2D(uTexture, uv);
}