import { vec3 } from 'gl-matrix';
import { RendererOrigin } from './RendererOrigin';
import { makeFloat32ArrayBuffer, makeFloat32ArrayBufferStorage, makeUInt32IndexArrayBuffer } from '../WebGPU/Buffer';
import { ObjLoader, ObjModel } from './ObjLoader';
import { Textures } from './Shader';

interface ModelBuffers {
    positionBuffer: GPUBuffer;
    uvBuffer: GPUBuffer;
    normalBuffer: GPUBuffer;
    render: boolean;
    bindGroups: GPUBindGroup[];
    pipeline: GPURenderPipeline;
    highlightPipeline: GPURenderPipeline;
    lightDataBuffer: GPUBuffer;
    instanceBuffers: GPUBuffer[]; // 인스턴스 버퍼 배열
    indexBuffers: GPUBuffer[];
    indicesLengths: number[];
}
interface Material {
    Ns: number;
    Ka: [number, number, number];
    Kd: [number, number, number];
    Ks: [number, number, number];
    Ke: [number, number, number];
    Ni: number;
    d: number;
    illum: number;
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
    lightPos: vec3 = vec3.fromValues(0.0, 1500.0, 0.0);
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

    makeInstanceBuffer(device: GPUDevice, material: Material): GPUBuffer {
        // 인스턴스 데이터 배열을 합쳐서 버퍼로 변환
        const instanceData = new Float32Array([
            material.Ns,
            ...material.Ka, 
            ...material.Kd, 
            ...material.Ks, 
            ...material.Ke, 
            material.Ni,
            material.d,
            material.illum,
        ]);

        console.log(instanceData.byteLength);
    
        const instanceBuffer = device.createBuffer({
            size: instanceData.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, 
            mappedAtCreation: true
        });

        new Float32Array(instanceBuffer.getMappedRange()).set(instanceData);
        instanceBuffer.unmap();
    
        return instanceBuffer;
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

        //material 미리 정의
        

        this.models.forEach((model, modelName) => {
            // 하이라이트 할 object 설정
            this.systemGUI.highlightOptionGui.add(model, 'isHighlighted').name(modelName);
            
            // 각 인스턴스 그룹에 대한 데이터를 설정
            const instanceBuffers: GPUBuffer[] = [];
            const indexBuffers: GPUBuffer[] = [];
            const indicesLengths: number[] = [];
            const bindGroups: GPUBindGroup[] = [];
            
            const uniqueMaterialNames = Array.from(new Set(model.materials)); // 중복을 제거한 materialName 배열 생성
            
            const lightDataBuffer = this.device.createBuffer({
                size: 48, // vec3 position (12 bytes) + padding (4 bytes) + vec4 color (16 bytes) + intensity (4 bytes)
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });

            const bindGroupLayout = this.device.createBindGroupLayout({
                entries: [
                    {
                        binding: 0,
                        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                        buffer: { type: 'read-only-storage', hasDynamicOffset: false, minBindingSize: 0 },
                    },                    
                    {
                        binding: 1,
                        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                        buffer: { type: 'uniform', hasDynamicOffset: false, minBindingSize: 0 },
                    },
                    {
                        binding: 2,
                        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                        buffer: { type: 'uniform', hasDynamicOffset: false, minBindingSize: 0 },
                    },
                    {
                        binding: 3,
                        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                        buffer: { type: 'uniform', hasDynamicOffset: false, minBindingSize: 0 },
                    },
                ],
            });

            uniqueMaterialNames.forEach((materialName) => {
                const materialData = loader.materials.get(materialName);                
                if (!materialData) {
                    return; // 재질 데이터가 없으면 다음 재질로 건너뜀
                }
                const instanceBuffer = this.makeInstanceBuffer(this.device, materialData); 
                instanceBuffers.push(instanceBuffer);
                
                // 해당 재질에 속하는 모든 삼각형의 인덱스를 찾아내어 인덱스 버퍼 생성
                const _indices: number[] = [];
                for (let i = 0; i < model.materials.length; i++) {
                    if (model.materials[i] === materialName) {
                        const startIndex = i * 3; // 각 삼각형은 3개의 인덱스로 구성되므로 시작 인덱스 계산
                        _indices.push(model.indices[startIndex]);
                        _indices.push(model.indices[startIndex + 1]);
                        _indices.push(model.indices[startIndex + 2]);
                    }
                }
                
                const indexBuffer = this.device.createBuffer({
                    size: _indices.length * Uint32Array.BYTES_PER_ELEMENT,
                    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
                });
                this.device.queue.writeBuffer(indexBuffer, 0, new Uint32Array(_indices));
                indexBuffers.push(indexBuffer);
                
                // 해당 재질에 속하는 인스턴스 수와 인덱스 길이 계산
                const instanceCount = _indices.length / 3;
                const indicesLength = _indices.length;
                indicesLengths.push(indicesLength);

                const bindGroup = this.device.createBindGroup({
                    layout: bindGroupLayout,
                    entries: [
                        {
                            binding: 0,
                            resource: { buffer: instanceBuffer },
                        },
                        {
                            binding: 1,
                            resource: { buffer: this.mvpUniformBuffer },
                        },
                        {
                            binding: 2,
                            resource: { buffer: this.camPosBuffer },
                        },
                        {
                            binding: 3,
                            resource: { buffer: lightDataBuffer },
                        },
                        // 추가적인 바인딩 설정 필요시 여기에 추가...
                    ],
                });
                bindGroups.push(bindGroup);
            });
        
            console.log(instanceBuffers);
        
            // 모델 데이터로부터 버퍼 생성
            const positionBuffer = makeFloat32ArrayBufferStorage(this.device, new Float32Array(model.vertices));
            const uvBuffer = makeFloat32ArrayBufferStorage(this.device, new Float32Array(model.uvs));
            const normalBuffer = makeFloat32ArrayBufferStorage(this.device, new Float32Array(model.normals));
            let render = true;
            center.push(this.calculateModelCenter(model.vertices));
            
            // 모든 데이터 저장
            const textureShaderModule = this.device.createShaderModule({ code: this.shader.getMaterialShader() });
            //const textureShaderModuleHighlight = this.device.createShaderModule({ code: this.shader.getRedShader() });
        
            const pipelineLayout = this.device.createPipelineLayout({
                bindGroupLayouts: [bindGroupLayout],
            });
        
            const pipeline = this.device.createRenderPipeline({
                layout: pipelineLayout,
                vertex: {
                    module: textureShaderModule,
                    entryPoint: 'vs_main',
                    buffers: [
                        {
                            // 위치 데이터를 위한 정점 버퍼
                            arrayStride: 12, // vec3<f32>는 3 * 4bytes = 12bytes
                            attributes: [{
                                // 위치 속성 @location(0)
                                shaderLocation: 0,
                                offset: 0,
                                format: 'float32x3',
                            }],
                        },
                        {
                            // 텍스처 좌표를 위한 정점 버퍼
                            arrayStride: 8, // vec2<f32>는 2 * 4bytes = 8bytes
                            attributes: [{
                                // 텍스처 좌표 속성 @location(1)
                                shaderLocation: 1,
                                offset: 0,
                                format: 'float32x2',
                            }],
                        },
                        {
                            // 법선 벡터를 위한 정점 버퍼
                            arrayStride: 12, // vec3<f32>는 3 * 4bytes = 12bytes
                            attributes: [{
                                // 법선 벡터 속성 @location(2)
                                shaderLocation: 2,
                                offset: 0,
                                format: 'float32x3',
                            }],
                        },
                    ],
                },
                fragment: {
                    module: textureShaderModule,
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
        
            const highlightPipeline = pipeline;

            // const highlightPipeline = this.device.createRenderPipeline({
            //     layout: pipelineLayout,
            //     vertex: {
            //         module: textureShaderModuleHighlight,
            //         entryPoint: 'vs_main',
            //         buffers: [
            //             // 여기에 버퍼 설정을 추가해야 합니다.
            //         ],
            //     },
            //     fragment: {
            //         module: textureShaderModuleHighlight,
            //         entryPoint: 'fs_main',
            //         targets: [{ format: this.format }],
            //     },
            //     primitive: {
            //         topology: 'triangle-list',
            //     },
            //     depthStencil: {
            //         depthWriteEnabled: true,
            //         depthCompare: 'less',
            //         format: 'depth32float',
            //     },
            //     multisample: {
            //         count: this.sampleCount,
            //     },
            // });
        
            // 모델 이름을 키로 사용하여 모든 데이터 저장
            this.modelBuffersMap.set(modelName, {
                positionBuffer,
                indexBuffers,
                uvBuffer,
                normalBuffer,
                indicesLengths,
                render,
                instanceBuffers, // 인스턴스 버퍼 배열 추가
                bindGroups,
                pipeline,
                highlightPipeline,
                lightDataBuffer, // 여기에 라이트 데이터 버퍼 추가
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
            } else {
                // 렌더링 파이프라인 및 버퍼 설정
                passEncoder.setPipeline(buffers.pipeline);
            }
    
            // 모델의 각 인스턴스에 대해 렌더링 수행
            for (let i = 0; i < buffers.instanceBuffers.length; i++) {
                const instanceBuffer = buffers.instanceBuffers[i];
                const indexBuffer = buffers.indexBuffers[i];
                const indicesLength = buffers.indicesLengths[i];
                const bindGroup = buffers.bindGroups[i];
    
                passEncoder.setVertexBuffer(0, buffers.positionBuffer);
                passEncoder.setVertexBuffer(1, buffers.uvBuffer);
                passEncoder.setVertexBuffer(2, buffers.normalBuffer);
                passEncoder.setIndexBuffer(indexBuffer, 'uint32');
                passEncoder.setVertexBuffer(3, instanceBuffer, 0); // 인스턴스 버퍼를 설정합니다.
                passEncoder.setBindGroup(0, bindGroup);
                passEncoder.drawIndexed(indicesLength, 1); // 인스턴스당 한 번씩 렌더링합니다.
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