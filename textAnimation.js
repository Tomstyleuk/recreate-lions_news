export default function initTextAnimation(selector = ".inview_fadein") {
    const elements = document.querySelectorAll(selector);
    gsap.to(elements, {
        opacity: 1,
        y: 0,
        duration: 1,
        ease: "cubic-bezier(0.22,1,0.36,1)"
    });
}
