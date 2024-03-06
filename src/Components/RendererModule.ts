import { Renderer } from "../renderer/Renderer";

export const Initialize = async () => {

    const canvas = document.querySelector("canvas#gfx-main") as HTMLCanvasElement; // `as HTMLCanvasElement`로 타입 단언 사용
    if (!canvas) {
        console.error("Canvas element not found");
        return;
    }

    let isLeftMouseDown = false;
    let isRightMouseDown = false;
    let lastMouseX: number, lastMouseY: number;

    canvas.addEventListener('mousedown', (event: MouseEvent) => { // `MouseEvent` 타입 명시
        if (event.button === 0) { // 좌클릭
            isLeftMouseDown = true;
            console.log("좌클릭");
        } else if (event.button === 2) { // 우클릭
            isRightMouseDown = true;
            console.log("우클릭");
        }
        lastMouseX = event.clientX;
        lastMouseY = event.clientY;

    });

    document.addEventListener('mouseup', (event) => {
        isLeftMouseDown = false;
        isRightMouseDown = false;
    });

    const sceneManager = new Renderer("gfx-main");
    sceneManager.init().then(() => {

        canvas.addEventListener('mousemove', (event) => {
            if (isLeftMouseDown) {
                // 카메라 회전 로직 구현
                var dx = event.clientX - lastMouseX;
                var dy = event.clientY - lastMouseY;
                //console.log(dx, dy);
                //sceneManager.rotateCamera(dx, dy);

                // 모델 회전 로직 적용
                sceneManager.rotateModel(sceneManager.model, dx/5.0, 0); // rotateModel 함수를 사용하여 모델 회전

                // Uniform 버퍼 업데이트를 위한 매트릭스 정보 업데이트
                sceneManager.updateUniformBuffer(sceneManager.model, sceneManager.view, sceneManager.projection);

            } else if (isRightMouseDown) {
                // 카메라 패닝 로직 구현
                const dx = event.clientX - lastMouseX;
                const dy = event.clientY - lastMouseY;

                // 패닝 로직 실행
                sceneManager.panCamera(dx, dy);
            }
            lastMouseX = event.clientX;
            lastMouseY = event.clientY;
        });

        canvas.addEventListener('wheel', (event) => {
            // 카메라 줌 인/아웃 로직 구현
            sceneManager.zoomCamera(event.deltaY / 100);
        });
        animate();
    });

    function animate() {
        sceneManager.render();
        requestAnimationFrame(animate);
    }
}