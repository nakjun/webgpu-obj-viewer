import GUI from 'lil-gui';

export class SystemGUI {
    performanceGui!: GUI;
    renderOptionGui!: GUI;
    highlightOptionGui!: GUI;

    constructor() {
        // this.performanceGui = new GUI({
        //     container: document.body,
        //     autoPlace: false // 기본 위치 배치 사용 안함
        // });
        // this.performanceGui.title("Performance");
        // this.performanceGui.domElement.style.position = 'absolute';
        // this.performanceGui.domElement.style.top = '0px';
        // this.performanceGui.domElement.style.left = '0px';        

        this.renderOptionGui = new GUI({
            container: document.body,
            autoPlace: false // 기본 위치 배치 사용 안함
        });
        this.renderOptionGui.title("Render Options");
        this.renderOptionGui.domElement.style.position = 'absolute';
        this.renderOptionGui.domElement.style.top = '0px';
        this.renderOptionGui.domElement.style.left = '0px';

        this.highlightOptionGui = new GUI({
            container: document.body,
        });
        this.highlightOptionGui.title("Part Highlights");
        this.highlightOptionGui.domElement.style.position = 'fixed'; // 위치를 고정시킴
        this.highlightOptionGui.domElement.style.top = '0'; // 상단에서부터의 거리
        this.highlightOptionGui.domElement.style.right = '0'; // 오른쪽에서부터의 거리
        this.highlightOptionGui.domElement.style.width = '200px';
    }
}