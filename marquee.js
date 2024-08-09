window.addEventListener('load', () => {
    setTimeout(() => {
        const loopContainers = document.querySelectorAll(".loop-container");

        loopContainers.forEach(el => {
            const loopContainerWidth = el.scrollWidth;
            const loopingText = new LoopingText(el, loopContainerWidth);

            // 監視対象の要素を指定
            const main = document.querySelector('main');
            const observer = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    if (mutation.attributeName === 'class') {
                        const hasViewClass = main.classList.contains('view');

                        if (hasViewClass) {
                            loopingText.start();
                        } else {
                            loopingText.stop();
                        }
                    }
                });
            });

            // observer を設定
            observer.observe(main, { attributes: true });

            if (main.classList.contains('view')) {
                loopingText.start();
            }
        });
    }, 1000);
}, false);

class LoopingText {
    constructor(el, containerWidth) {
        this.el = el;
        this.loopContainerWidth = containerWidth;
        this.current = 0;
        this.target = 0;
        this.interpolationFactor = 0.01;
        this.speed = 0.5;
        this.direction = -1; // -1 (to-left), 1 (to-right)
        this.animating = false;

        this.el.style.cssText = `
        position: relative; display: inline-flex; white-space: nowrap;`;
        if (this.el.children[1]) {
            this.el.children[1].style.cssText = `position: absolute; left: ${100 * -this.direction}%;`;
        }

        this.render = this.render.bind(this);
    }

    animate() {
        this.target += this.speed;
        this.current += (this.target - this.current) * this.interpolationFactor;

        if (this.target > this.loopContainerWidth) {
            this.current -= this.target;
            this.target = 0;
        }

        const x = this.current * this.direction;
        this.el.style.transform = `translate3d(${x}px, 0, 0)`;
    }

    render() {
        if (!this.animating) return;
        this.animate();
        window.requestAnimationFrame(this.render);
    }

    start() {
        if (this.animating) return;
        this.animating = true;
        this.render();
    }

    stop() {
        this.animating = false;
    }
}
