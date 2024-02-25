import { vec3 } from 'gl-matrix';
import { RendererOrigin } from './RendererOrigin';
import { makeFloat32ArrayBuffer, makeFloat32ArrayBufferStorage, makeUInt32IndexArrayBuffer } from '../WebGPU/Buffer';
import { ObjLoader, ObjModel } from './ObjLoader';
import { Textures } from './Shader';

export class Renderer extends RendererOrigin {

    private trianglePipeline!: GPURenderPipeline;
    private triangleBindGroup!: GPUBindGroup;
    private camPosBuffer!: GPUBuffer;

    renderPassDescriptor!: GPURenderPassDescriptor;


    //sphere model
    private ObjectPosBuffer!: GPUBuffer;
    private objectIndexBuffer!: GPUBuffer;
    private objectUVBuffer!: GPUBuffer;
    private objectNormalBuffer!: GPUBuffer;
    private objectIndicesLength!: number;
    private objectBindGroup!: GPUBindGroup;
    private objectNumTriangleBuffer!: GPUBuffer;

    //mateirals - sphere
    private textureObject!: GPUTexture
    private viewObject!: GPUTextureView
    private samplerObject!: GPUSampler

    //3d objects
    private model!: ObjModel;

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

        this.model = await loader.load('./objects/Audi_R8_2017.obj', 100.0);

        console.log("object file load end");

        var vertArray = new Float32Array(this.model.vertices);
        var indArray = new Uint32Array(this.model.indices);
        var normalArray = new Float32Array(this.model.normals);
        var uvArray = new Float32Array(this.model.uvs);
        this.objectIndicesLength = this.model.indices.length;

        console.log("this object's indices length: " + this.objectIndicesLength / 3);

        this.ObjectPosBuffer = makeFloat32ArrayBufferStorage(this.device, vertArray);
        this.objectIndexBuffer = makeUInt32IndexArrayBuffer(this.device, indArray);
        this.objectUVBuffer = makeFloat32ArrayBufferStorage(this.device, uvArray);
        this.objectNormalBuffer = makeFloat32ArrayBufferStorage(this.device, normalArray);

        const numTriangleData = new Uint32Array([this.model.indices.length / 3]);
        this.objectNumTriangleBuffer = this.device.createBuffer({
            size: numTriangleData.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
        });
        new Uint32Array(this.objectNumTriangleBuffer.getMappedRange()).set(numTriangleData);
        this.objectNumTriangleBuffer.unmap();
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

        this.objectBindGroup = this.device.createBindGroup({
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
        passEncoder.setVertexBuffer(0, this.ObjectPosBuffer); // 정점 버퍼 설정, 스프링의 경우 필요에 따라
        passEncoder.setVertexBuffer(1, this.objectUVBuffer); // 정점 버퍼 설정, 스프링의 경우 필요에 따라
        passEncoder.setVertexBuffer(2, this.objectNormalBuffer); // 정점 버퍼 설정, 스프링의 경우 필요에 따라
        passEncoder.setIndexBuffer(this.objectIndexBuffer, 'uint32'); // 인덱스 포맷 수정
        passEncoder.setBindGroup(0, this.objectBindGroup); // Set the bind group with MVP matrix
        passEncoder.drawIndexed(this.objectIndicesLength);

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