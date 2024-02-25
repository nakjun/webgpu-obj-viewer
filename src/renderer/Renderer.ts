import { vec3 } from 'gl-matrix';
import { RendererOrigin } from './RendererOrigin';
import { makeFloat32ArrayBuffer, makeFloat32ArrayBufferStorage, makeUInt32IndexArrayBuffer } from '../WebGPU/Buffer';
import { ObjLoader, ObjModel } from './ObjLoader';
import { Textures } from './Shader';

interface ModelBuffers {
    positionBuffer: GPUBuffer;
    indexBuffer: GPUBuffer;
    uvBuffer: GPUBuffer;
    normalBuffer: GPUBuffer;
    indicesLength: number;
}

export class Renderer extends RendererOrigin {

    private trianglePipeline!: GPURenderPipeline;
    private triangleBindGroup!: GPUBindGroup;

    private camPosBuffer!: GPUBuffer;

    renderPassDescriptor!: GPURenderPassDescriptor;

    //mateirals - sphere
    private textureObject!: GPUTexture
    private viewObject!: GPUTextureView
    private samplerObject!: GPUSampler

    //3d objects
    private model!: ObjModel;
    private modelBuffersMap: Map<string, ModelBuffers> = new Map();


    //collision response
    private collisionTempBuffer!: GPUBuffer;

    //shaders
    private shader!: Textures;

    /* constructor */
    constructor(canvasId: string) {
        super(canvasId);
        this.model = new ObjModel();
        this.shader = new Textures();
    }

    /* async functions */
    async init() {
        await super.init();
        await this.createAssets();
        await this.MakeModelData();
    }
    async createTextureFromImage(src: string, device: GPUDevice): Promise<{ texture: GPUTexture, sampler: GPUSampler, view: GPUTextureView }> {
        const response: Response = await fetch(src);
        const blob: Blob = await response.blob();
        const imageData: ImageBitmap = await createImageBitmap(blob);

        const texture = await this.loadImageBitmap(device, imageData);

        const view = texture.createView({
            format: "rgba8unorm",
            dimension: "2d",
            aspect: "all",
            baseMipLevel: 0,
            mipLevelCount: 1,
            baseArrayLayer: 0,
            arrayLayerCount: 1
        });

        const sampler = device.createSampler({
            addressModeU: "repeat",
            addressModeV: "repeat",
            magFilter: "linear",
            minFilter: "nearest",
            mipmapFilter: "nearest",
            maxAnisotropy: 1
        });

        return { texture, sampler, view };
    }
    async loadImageBitmap(device: GPUDevice, imageData: ImageBitmap): Promise<GPUTexture> {

        const textureDescriptor: GPUTextureDescriptor = {
            size: {
                width: imageData.width,
                height: imageData.height
            },
            format: "rgba8unorm",
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
        };

        const texture = device.createTexture(textureDescriptor);

        device.queue.copyExternalImageToTexture(
            { source: imageData },
            { texture: texture },
            { width: imageData.width, height: imageData.height },
        );

        return texture;
    }
    async createAssets() {
        console.log("pasing start");
        const assets2 = await this.createTextureFromImage("./textures/metal.jpg", this.device);
        this.textureObject = assets2.texture;
        this.samplerObject = assets2.sampler;
        this.viewObject = assets2.view;
        console.log("pasing end");
    }

    async render() {
        const currentTime = performance.now();

        this.setCamera(this.camera);
        this.makeRenderpassDescriptor();

        const commandEncoder = this.device.createCommandEncoder();

        //render pass
        this.renderObject(commandEncoder);

        this.device.queue.submit([commandEncoder.finish()]);
        await this.device.queue.onSubmittedWorkDone();

        this.stats.ms = (currentTime - this.lastTime).toFixed(2);
        this.stats.fps = Math.round(1000.0 / (currentTime - this.lastTime));

        this.lastTime = currentTime;
        this.localFrameCount++;
    }

    async MakeModelData() {
        const loader = new ObjLoader();

        const models = await loader.load('./objects/benz.obj', 1.0); // 예제 경로와 스케일

        let center: vec3[] = [];

        models.forEach((model, modelName) => {
            // 모델 데이터로부터 버퍼 생성
            const positionBuffer = makeFloat32ArrayBufferStorage(this.device, new Float32Array(model.vertices));
            const indexBuffer = makeUInt32IndexArrayBuffer(this.device, new Uint32Array(model.indices));
            const uvBuffer = makeFloat32ArrayBufferStorage(this.device, new Float32Array(model.uvs));
            const normalBuffer = makeFloat32ArrayBufferStorage(this.device, new Float32Array(model.normals));
            const indicesLength = model.indices.length;
            console.log(this.calculateModelCenter(model.vertices));
            center.push(this.calculateModelCenter(model.vertices));

            console.log("indicesLength:", indicesLength)

            // 모델 이름을 키로 사용하여 모든 데이터 저장
            this.modelBuffersMap.set(modelName, {
                positionBuffer,
                indexBuffer,
                uvBuffer,
                normalBuffer,
                indicesLength,
            });
        });
        console.log(center);
        const overallCenter = this.calculateOverallCenter(center);
        console.log(overallCenter);
        this.camera.target[0] = overallCenter[0];
        this.camera.target[1] = overallCenter[1];
        this.camera.target[2] = overallCenter[2];
    }

    calculateModelCenter(vertices: number[]): [number, number, number] {
        let xSum = 0, ySum = 0, zSum = 0;
        const vertexCount = vertices.length / 3;

        for (let i = 0; i < vertices.length; i += 3) {
            xSum += vertices[i];
            ySum += vertices[i + 1];
            zSum += vertices[i + 2];
        }

        return [xSum / vertexCount, ySum / vertexCount, zSum / vertexCount];
    }

    calculateOverallCenter(centers: vec3[]): vec3 {
        let xSum = 0, ySum = 0, zSum = 0;
        const count = centers.length;

        centers.forEach(center => {
            xSum += center[0];
            ySum += center[1];
            zSum += center[2];
        });

        return [xSum / count, ySum / count, zSum / count];
    }

    createRenderPipeline(render_type: string = 'triangle-list') {
        const textureShaderModule = this.device.createShaderModule({ code: this.shader.getShaders() });
        const bindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: {}
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {}
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {}
                },
                {
                    binding: 3,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: {
                        type: 'uniform',
                    }
                },
            ]
        });

        this.mvpUniformBuffer = this.device.createBuffer({
            size: 64 * 3, // The total size needed for the matrices
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST // The buffer is used as a uniform and can be copied to
        });

        this.camPosBuffer = this.device.createBuffer({
            size: 4 * Float32Array.BYTES_PER_ELEMENT, // vec3<f32> + padding
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.triangleBindGroup = this.device.createBindGroup({
            layout: bindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: this.mvpUniformBuffer
                    }
                },
                {
                    binding: 1,
                    resource: this.viewObject
                },
                {
                    binding: 2,
                    resource: this.samplerObject
                },
                {
                    binding: 3,
                    resource: {
                        buffer: this.camPosBuffer
                    }
                }
            ]
        });

        const pipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [bindGroupLayout],
        });

        this.trianglePipeline = this.device.createRenderPipeline({
            layout: pipelineLayout,
            vertex: {
                module: textureShaderModule,
                entryPoint: 'vs_main',
                buffers: [{
                    arrayStride: 12,
                    attributes: [
                        {
                            shaderLocation: 0,
                            format: "float32x3",
                            offset: 0
                        }
                    ]
                },
                {
                    arrayStride: 8,
                    attributes: [
                        {
                            shaderLocation: 1,
                            format: "float32x2",
                            offset: 0
                        }
                    ]
                },
                {
                    arrayStride: 12,
                    attributes: [
                        {
                            shaderLocation: 2,
                            format: "float32x2",
                            offset: 0
                        }
                    ]
                }
                ],
            },
            fragment: {
                module: textureShaderModule,
                entryPoint: 'fs_main',
                targets: [{ format: this.format }],
            },
            primitive: {
                topology: 'triangle-list',
                //topology: 'line-list',
            },
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: 'less',
                format: 'depth32float',
            },
            multisample: {
                count: this.sampleCount,
            },
        });
    }

    renderObject(commandEncoder: GPUCommandEncoder) {
        const passEncoder = commandEncoder.beginRenderPass(this.renderPassDescriptor);
        this.device.queue.writeBuffer(
            this.camPosBuffer,
            0,
            new Float32Array([...this.camera.position, 1.0]) // vec3 + padding
        );
        passEncoder.setPipeline(this.trianglePipeline);
        this.modelBuffersMap.forEach((buffers, modelName) => {
            // 카메라 및 기타 유니폼 버퍼 업데이트 (생략)
            // ...

            // 렌더링 파이프라인 및 버퍼 설정
            passEncoder.setPipeline(this.trianglePipeline);
            passEncoder.setVertexBuffer(0, buffers.positionBuffer);
            passEncoder.setVertexBuffer(1, buffers.uvBuffer);
            passEncoder.setVertexBuffer(2, buffers.normalBuffer);
            passEncoder.setIndexBuffer(buffers.indexBuffer, 'uint32');
            passEncoder.setBindGroup(0, this.triangleBindGroup);
            passEncoder.drawIndexed(buffers.indicesLength);
        });
        passEncoder.end();
    }

    /* Make Metadata */
    makeRenderpassDescriptor() {
        this.renderPassDescriptor = {
            colorAttachments: [{
                view: this.resolveTexture.createView(),
                resolveTarget: this.context.getCurrentTexture().createView(),
                clearValue: { r: 0.25, g: 0.25, b: 0.25, a: 1.0 }, // Background color
                loadOp: "clear",
                storeOp: "store",
            }],
            depthStencilAttachment: { // Add this attachment for depth testing
                view: this.depthTexture.createView(),
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store",
            },
        };
    }
}