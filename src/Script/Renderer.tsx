import { mat4, vec3 } from 'gl-matrix';
import { Camera } from '../WebGPU/Camera';
import { SystemGUI } from '../GUI/GUI';

export class Renderer{
    canvas!: HTMLCanvasElement;
    device!: GPUDevice;
    context!: GPUCanvasContext;
    format!: GPUTextureFormat;
    depthTexture!: GPUTexture;
    resolveTexture!: GPUTexture;
    pipeline!: GPURenderPipeline;
    mvpUniformBuffer!: GPUBuffer;

    systemGUI!: SystemGUI;

    //camera
    camera!: Camera;
    camera_position: vec3 = vec3.fromValues(-52.4, 31.2, -52.4);
    camera_target: vec3 = vec3.fromValues(0.0, 0.0, 0.0);
    camera_up: vec3 = vec3.fromValues(0.0, 1.0, 0.0);

    //fps
    frameCount: number = 0;
    lastTime: number = 0;
    fpsDisplay;
    localFrameCount: number = 0;

    stats = {
        fps: 0,
        ms: ""
    };

    renderOptions = {
        wireFrame: false,
        camPosX: this.camera_position[0],
        camPosY: this.camera_position[1],
        camPosZ: this.camera_position[2],
        renderObject: true,
    }

    camPosXControl: any;
    camPosYControl: any;
    camPosZControl: any;

    sampleCount:number = 4;

    constructor(canvasId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        this.camera = new Camera(
            this.camera_position,
            this.camera_target,
            this.camera_up,
            Math.PI / 4,
            this.canvas.width / this.canvas.height,
            0.1,
            10000
        );
        console.log("Renderer initialized");
        this.fpsDisplay = document.getElementById('fpsDisplay');

        this.systemGUI = new SystemGUI();
        this.systemGUI.performanceGui.add(this.stats, 'ms').name('ms').listen();
        this.systemGUI.performanceGui.add(this.stats, 'fps').name('fps').listen();

        this.systemGUI.renderOptionGui.add(this.renderOptions, 'wireFrame').name('WireFrame');        
        this.systemGUI.renderOptionGui.add(this.renderOptions, 'renderObject').name('renderObject');
        this.camPosXControl = this.systemGUI.renderOptionGui.add(this.renderOptions, 'camPosX', -100, 100).name('Camera Position X').onChange((value: number) => {
            this.camera.position[0] = value;
        });
        this.camPosYControl = this.systemGUI.renderOptionGui.add(this.renderOptions, 'camPosY', -100, 100).name('Camera Position Y').onChange((value: number) => {
            this.camera.position[1] = value;
        });
        this.camPosZControl = this.systemGUI.renderOptionGui.add(this.renderOptions, 'camPosZ', -100, 100).name('Camera Position Z').onChange((value: number) => {
            this.camera.position[2] = value;
        });
    }

    async init() {
        const adapter = await navigator.gpu?.requestAdapter();
        if (!adapter) {
            throw new Error("Failed to get GPU adapter");
        }
        this.device = await adapter?.requestDevice();
        this.context = this.canvas.getContext("webgpu") as GPUCanvasContext;
        this.format = "bgra8unorm";
        this.context.configure({
            device: this.device,
            format: this.format,
            alphaMode: "premultiplied",
        });
        this.createDepthTexture();
        this.createResolveTexture();
        this.printDeviceLimits();

    }
    printDeviceLimits(){
        const limits:GPUSupportedLimits = this.device.limits;
        this.systemGUI.gpuDeviceGui.add(limits, 'maxComputeWorkgroupSizeX').name('Max Compute Workgroup Size X');
        this.systemGUI.gpuDeviceGui.add(limits, 'maxComputeWorkgroupSizeY').name('Max Compute Workgroup Size Y');
        this.systemGUI.gpuDeviceGui.add(limits, 'maxComputeWorkgroupSizeZ').name('Max Compute Workgroup Size Z');
        this.systemGUI.gpuDeviceGui.add(limits, 'maxComputeInvocationsPerWorkgroup').name('Max Compute Invocations Per Workgroup');
        this.systemGUI.gpuDeviceGui.add(limits, 'maxComputeWorkgroupsPerDimension').name('Max Compute Workgroups Per Dimension');
        this.systemGUI.gpuDeviceGui.add(limits, 'maxStorageBufferBindingSize').name('Max Storage Buffer Binding Size');
    }

    createDepthTexture() {
        this.depthTexture = this.device.createTexture({
            size: { width: this.canvas.width, height: this.canvas.height, depthOrArrayLayers: 1 },
            format: 'depth32float',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
            sampleCount: this.sampleCount
        });
    }

    createResolveTexture() {
        this.resolveTexture = this.device.createTexture({
            size: { width: this.canvas.width, height: this.canvas.height, depthOrArrayLayers: 1 },
            format: this.format,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            sampleCount: this.sampleCount
        });
    }

    setCamera(camera: Camera) {        
        const projection = mat4.create();
        mat4.perspective(projection, camera.fov, this.canvas.width / this.canvas.height, camera.near, camera.far);        
        const view = mat4.create();
        mat4.lookAt(view, camera.position, camera.target, camera.up);
        const model = mat4.create();        
        this.updateUniformBuffer(model, view, projection);
    }

    updateUniformBuffer(model: mat4, view: mat4, projection: mat4) {        
        const data = new Float32Array(48);
        data.set(model);
        data.set(view, 16); 
        data.set(projection, 32);

        this.device.queue.writeBuffer(
            this.mvpUniformBuffer,
            0,
            data.buffer,
            0, 
            data.byteLength
        );
    }

    updateRenderOptions() {
        this.renderOptions.camPosX = this.camera.position[0];
        this.renderOptions.camPosY = this.camera.position[1];
        this.renderOptions.camPosZ = this.camera.position[2];

        this.camPosXControl.updateDisplay();
        this.camPosYControl.updateDisplay();
        this.camPosZControl.updateDisplay();
    }

    rotateCamera(dx: number, dy: number) {
        this.camera.position[0] += dx;
        this.camera.position[1] += dy;

        this.updateRenderOptions();
    }

    panCamera(dx: number, dy: number) {
        const cameraDirection = vec3.subtract(vec3.create(), this.camera.target, this.camera.position);
        const cameraRight = vec3.cross(vec3.create(), cameraDirection, this.camera.up);
        const cameraUp = vec3.cross(vec3.create(), cameraRight, cameraDirection);

        vec3.normalize(cameraRight, cameraRight);
        vec3.normalize(cameraUp, cameraUp);

        const scale = 0.1;

        vec3.scaleAndAdd(this.camera.position, this.camera.position, cameraRight, dx * scale);
        vec3.scaleAndAdd(this.camera.position, this.camera.position, cameraUp, -dy * scale);

        vec3.scaleAndAdd(this.camera.target, this.camera.target, cameraRight, dx * scale);
        vec3.scaleAndAdd(this.camera.target, this.camera.target, cameraUp, -dy * scale);

        this.updateRenderOptions();
    }

    zoomCamera(value: number) {
        this.camera.position[2] += value;
        this.updateRenderOptions();
    }
}