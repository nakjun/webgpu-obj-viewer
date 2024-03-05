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
    render: boolean;
    bindGroup: GPUBindGroup;
    pipeline: GPURenderPipeline;
    highlightPipeline: GPURenderPipeline;
    lightDataBuffer: GPUBuffer;
}

export class Renderer extends RendererOrigin {

    private camPosBuffer!: GPUBuffer;


    renderPassDescriptor!: GPURenderPassDescriptor;

    //mateirals - sphere
    private textureObject!: GPUTexture
    private viewObject!: GPUTextureView
    private samplerObject!: GPUSampler

    //3d objects
    private models: Map<string, ObjModel> = new Map();
    private modelBuffersMap: Map<string, ModelBuffers> = new Map();

    lightColor: vec3 = vec3.fromValues(1.0, 1.0, 1.0);
    lightPos: vec3 = vec3.fromValues(0.0, 1000.0, 0.0);
    lightIntensity: number = 2.0;

    //collision response
    private collisionTempBuffer!: GPUBuffer;

    //shaders
    private shader!: Textures;

    //model highlight
    private modelNames: string[] = [];

    /* constructor */
    constructor(canvasId: string) {
        super(canvasId);
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
        this.setCamera(this.camera);
        this.makeRenderpassDescriptor();

        const commandEncoder = this.device.createCommandEncoder();

        //render pass
        this.renderObject(commandEncoder);

        this.device.queue.submit([commandEncoder.finish()]);
        await this.device.queue.onSubmittedWorkDone();

        this.frameCount++;
    }

    async MakeModelData() {
        const loader = new ObjLoader();

        this.models = await loader.load('./objects/benz3.obj', 50.0); // 예제 경로와 스케일

        let center: vec3[] = [];

        this.mvpUniformBuffer = this.device.createBuffer({
            size: 64 * 3, // The total size needed for the matrices
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST // The buffer is used as a uniform and can be copied to
        });

        this.camPosBuffer = this.device.createBuffer({
            size: 4 * Float32Array.BYTES_PER_ELEMENT, // vec3<f32> + padding
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });


        this.models.forEach((model, modelName) => {
            //하이라이트 할 object 설정
            this.systemGUI.highlightOptionGui.add(model, 'isHighlighted').name(modelName);

            // 모델 데이터로부터 버퍼 생성
            const positionBuffer = makeFloat32ArrayBufferStorage(this.device, new Float32Array(model.vertices));
            const indexBuffer = makeUInt32IndexArrayBuffer(this.device, new Uint32Array(model.indices));
            const uvBuffer = makeFloat32ArrayBufferStorage(this.device, new Float32Array(model.uvs));
            const normalBuffer = makeFloat32ArrayBufferStorage(this.device, new Float32Array(model.normals));
            const indicesLength = model.indices.length;
            let render = true;
            center.push(this.calculateModelCenter(model.vertices));
            const textureShaderModule = this.device.createShaderModule({ code: this.shader.getShaders() });
            const textureShaderModuleHighlight = this.device.createShaderModule({ code: this.shader.getRedShader() });

            const lightDataBuffer = this.device.createBuffer({
                size: 48, // vec3 position (12 bytes) + padding (4 bytes) + vec4 color (16 bytes) + intensity (4 bytes)
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });

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
                    {
                        binding: 4,
                        visibility: GPUShaderStage.FRAGMENT,
                        buffer: { type: 'uniform' }
                    },
                ]
            });
            const bindGroup = this.device.createBindGroup({
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
                    },
                    {
                        binding: 4,
                        resource: {
                            buffer: lightDataBuffer
                        }
                    }
                ]
            });

            const pipelineLayout = this.device.createPipelineLayout({
                bindGroupLayouts: [bindGroupLayout],
            });

            const pipeline = this.device.createRenderPipeline({
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

            const highlightPipeline = this.device.createRenderPipeline({
                layout: pipelineLayout,
                vertex: {
                    module: textureShaderModuleHighlight,
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
                    module: textureShaderModuleHighlight,
                    entryPoint: 'fs_main',
                    targets: [{ format: this.format }],
                },
                primitive: {
                    topology: 'triangle-list',
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

            // 모델 이름을 키로 사용하여 모든 데이터 저장
            this.modelBuffersMap.set(modelName, {
                positionBuffer,
                indexBuffer,
                uvBuffer,
                normalBuffer,
                indicesLength,
                render,
                bindGroup,
                pipeline,
                lightDataBuffer,
                highlightPipeline
            });

            this.modelNames.push(modelName);
        });
        const overallCenter = this.calculateOverallCenter(center);
        this.camera.target[0] = overallCenter[0];
        this.camera.target[1] = overallCenter[1];
        this.camera.target[2] = overallCenter[2];

        this.camera.position[0] = this.camera_origin[0] = -25;
        this.camera.position[1] = this.camera_origin[1] = 400;
        this.camera.position[2] = this.camera_origin[2] = 750;

        const actions = {
            lookLeft: () => this.lookLeftSide(),
            lookRight: () => this.lookRightSide(),
            lookUp: () => this.lookUpSide(),
            lookOrigin: () => this.lookOrigin()
        };
        this.systemGUI.renderOptionGui.add(actions, 'lookOrigin').name('Origin View');
        this.systemGUI.renderOptionGui.add(actions, 'lookLeft').name('Left View');
        this.systemGUI.renderOptionGui.add(actions, 'lookRight').name('Right View');
        this.systemGUI.renderOptionGui.add(actions, 'lookUp').name('Up View');
        //this.systemGUI.renderOptionGui.addBu

        this.updateRenderOptions();
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

    renderObject(commandEncoder: GPUCommandEncoder) {
        this.device.queue.writeBuffer(
            this.camPosBuffer,
            0,
            new Float32Array([...this.camera.position, 1.0]) // vec3 + padding
        );

        const passEncoder = commandEncoder.beginRenderPass(this.renderPassDescriptor);

        this.modelBuffersMap.forEach((buffers, modelName) => {
            let lightData = [this.lightPos[0], this.lightPos[1], this.lightPos[2], 0.0, this.lightColor[0], this.lightColor[1], this.lightColor[2], 1.0, this.lightIntensity, 0.0, 0.0, 0.0];
            // 라이트 정보 설정
            this.device.queue.writeBuffer(buffers.lightDataBuffer, 0, new Float32Array(lightData));

            if (this.models.get(modelName)?.isHighlighted) {
                // 렌더링 파이프라인 및 버퍼 설정
                passEncoder.setPipeline(buffers.highlightPipeline);
                passEncoder.setVertexBuffer(0, buffers.positionBuffer);
                passEncoder.setVertexBuffer(1, buffers.uvBuffer);
                passEncoder.setVertexBuffer(2, buffers.normalBuffer);
                passEncoder.setIndexBuffer(buffers.indexBuffer, 'uint32');
                passEncoder.setBindGroup(0, buffers.bindGroup);
                passEncoder.drawIndexed(buffers.indicesLength);

            } else {
                // 렌더링 파이프라인 및 버퍼 설정
                passEncoder.setPipeline(buffers.pipeline);
                passEncoder.setVertexBuffer(0, buffers.positionBuffer);
                passEncoder.setVertexBuffer(1, buffers.uvBuffer);
                passEncoder.setVertexBuffer(2, buffers.normalBuffer);
                passEncoder.setIndexBuffer(buffers.indexBuffer, 'uint32');
                passEncoder.setBindGroup(0, buffers.bindGroup);
                passEncoder.drawIndexed(buffers.indicesLength);
            }


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