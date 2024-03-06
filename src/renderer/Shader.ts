export class Textures {
    mtlShader = `    
    struct TransformData {
        model: mat4x4<f32>,
        view: mat4x4<f32>,
        projection: mat4x4<f32>,
    };
    
    struct LightData {
        position: vec3<f32>,
        color: vec4<f32>,
        intensity: f32,
    };
// 인스턴스 데이터 버퍼 바인딩
    @binding(0) @group(0) var<storage> instanceDataBuffer:array<f32>;
    
    // 변환 데이터 바인딩
    @binding(1) @group(0) var<uniform> transformUBO: TransformData;
    
    // 카메라 위치 바인딩
    @binding(2) @group(0) var<uniform> cameraPos: vec3<f32>;
    
    // 라이트 정보 바인딩
    @binding(3) @group(0) var<uniform> lightUBO: LightData;    
        
    
    // 정점 출력 구조체 정의
    struct VertexOutput {
        @builtin(position) Position: vec4<f32>,
        @location(0) TexCoord: vec2<f32>,
        @location(1) Normal: vec3<f32>,
        @location(2) FragPos: vec3<f32>,
        // 필요한 데이터를 별도의 변수로 전달
        @location(3) Ns: f32,
        @location(4) Kd: vec3<f32>,
        @location(5) Ka: vec3<f32>,
        @location(6) Ks: vec3<f32>,
        @location(7) Ke: vec3<f32>,
        @location(8) Ni: f32,
        @location(9) d: f32,
        @location(10) illum: f32,
    };
    
    // 정점 쉐이더 함수
    @vertex
    fn vs_main(@location(0) vertexPosition: vec3<f32>, @location(1) vertexTexCoord: vec2<f32>, @location(2) vertexNormal: vec3<f32>, @builtin(instance_index) instanceID: u32) -> VertexOutput {
        var output: VertexOutput;
    
    
        output.Position = transformUBO.projection * transformUBO.view * transformUBO.model * vec4<f32>(vertexPosition, 1.0);
        output.TexCoord = vertexTexCoord;
        output.Normal = (transformUBO.model * vec4<f32>(vertexNormal, 0.0)).xyz;
        output.FragPos = (transformUBO.model * vec4<f32>(vertexPosition, 1.0)).xyz;
        // 필요한 데이터를 별도의 변수로 전달
        output.Ns = instanceDataBuffer[0];        
        output.Ka = vec3<f32>(instanceDataBuffer[1], instanceDataBuffer[2], instanceDataBuffer[3]);
        output.Kd = vec3<f32>(instanceDataBuffer[4], instanceDataBuffer[5], instanceDataBuffer[6]);
        output.Ks = vec3<f32>(instanceDataBuffer[7], instanceDataBuffer[8], instanceDataBuffer[9]);
        output.Ke = vec3<f32>(instanceDataBuffer[10], instanceDataBuffer[11], instanceDataBuffer[12]);
        output.Ni = instanceDataBuffer[13];
        output.d = instanceDataBuffer[14];
        output.illum = instanceDataBuffer[15];
        return output;
    }
    
    // 프래그먼트 쉐이더 함수
    @fragment
    fn fs_main(@location(0) TexCoord: vec2<f32>, @location(1) Normal: vec3<f32>, @location(2) FragPos: vec3<f32>, @location(3) Ns: f32,    @location(4) Kd: vec3<f32>,    @location(5) Ka: vec3<f32>,    @location(6) Ks: vec3<f32>,    @location(7) Ke: vec3<f32>,    @location(8) Ni: f32, @location(9) d: f32,    @location(10) illum: f32,) -> @location(0) vec4<f32> {
        // 라이트 정보
        let lightPos: vec3<f32> = lightUBO.position;
        let lightColor: vec4<f32> = lightUBO.color;
        let lightIntensity: f32 = lightUBO.intensity;
    
        // 주변광 계산
        let ambientColor: vec4<f32> = vec4<f32>(Ka, 1.0) * 0.1;
    
        // diffuse 계산
        let norm: vec3<f32> = normalize(Normal);
        let lightDir: vec3<f32> = normalize(lightPos - FragPos);
        let diff: f32 = max(dot(norm, lightDir), 0.0);
        let diffuse: vec4<f32> = lightColor * diff * lightIntensity * vec4<f32>(Kd, 1.0);
    
        // specular 계산
        let viewDir: vec3<f32> = normalize(cameraPos - FragPos);
        let reflectDir: vec3<f32> = reflect(-lightDir, norm);
        let spec: f32 = pow(max(dot(viewDir, reflectDir), 0.0), Ns);
        let specular: vec4<f32> = lightColor * spec * 3.0 * vec4<f32>(Ks, 1.0);

        // 최종 색상 계산
        var finalColor: vec4<f32> = ambientColor + diffuse + specular + vec4<f32>(Ke, 1.0);        

        return vec4<f32>(finalColor.x,finalColor.y, finalColor.z, d);
    }    
    
    `;
    
    getMaterialShader(){
        return this.mtlShader;
    }

    redShader = `
    struct TransformData {
        model: mat4x4<f32>,
        view: mat4x4<f32>,
        projection: mat4x4<f32>,
    };
    
    struct LightData {
        position: vec3<f32>,
        color: vec4<f32>,
        intensity: f32,
    };
// 인스턴스 데이터 버퍼 바인딩
    @binding(0) @group(0) var<storage> instanceDataBuffer:array<f32>;
    
    // 변환 데이터 바인딩
    @binding(1) @group(0) var<uniform> transformUBO: TransformData;
    
    // 카메라 위치 바인딩
    @binding(2) @group(0) var<uniform> cameraPos: vec3<f32>;
    
    // 라이트 정보 바인딩
    @binding(3) @group(0) var<uniform> lightUBO: LightData;    
        
    
    // 정점 출력 구조체 정의
    struct VertexOutput {
        @builtin(position) Position: vec4<f32>,
        @location(0) TexCoord: vec2<f32>,
        @location(1) Normal: vec3<f32>,
        @location(2) FragPos: vec3<f32>,
        // 필요한 데이터를 별도의 변수로 전달
        @location(3) Ns: f32,
        @location(4) Kd: vec3<f32>,
        @location(5) Ka: vec3<f32>,
        @location(6) Ks: vec3<f32>,
        @location(7) Ke: vec3<f32>,
        @location(8) Ni: f32,
        @location(9) d: f32,
        @location(10) illum: f32,
    };
    
    // 정점 쉐이더 함수
    @vertex
    fn vs_main(@location(0) vertexPosition: vec3<f32>, @location(1) vertexTexCoord: vec2<f32>, @location(2) vertexNormal: vec3<f32>, @builtin(instance_index) instanceID: u32) -> VertexOutput {
        var output: VertexOutput;
    
    
        output.Position = transformUBO.projection * transformUBO.view * transformUBO.model * vec4<f32>(vertexPosition, 1.0);
        output.TexCoord = vertexTexCoord;
        output.Normal = (transformUBO.model * vec4<f32>(vertexNormal, 0.0)).xyz;
        output.FragPos = (transformUBO.model * vec4<f32>(vertexPosition, 1.0)).xyz;
        // 필요한 데이터를 별도의 변수로 전달
        output.Ns = instanceDataBuffer[0];        
        output.Ka = vec3<f32>(instanceDataBuffer[1], instanceDataBuffer[2], instanceDataBuffer[3]);
        output.Kd = vec3<f32>(instanceDataBuffer[4], instanceDataBuffer[5], instanceDataBuffer[6]);
        output.Ks = vec3<f32>(instanceDataBuffer[7], instanceDataBuffer[8], instanceDataBuffer[9]);
        output.Ke = vec3<f32>(instanceDataBuffer[10], instanceDataBuffer[11], instanceDataBuffer[12]);
        output.Ni = instanceDataBuffer[13];
        output.d = instanceDataBuffer[14];
        output.illum = instanceDataBuffer[15];
        return output;
    }
    
    // 프래그먼트 쉐이더 함수
    @fragment
    fn fs_main(@location(0) TexCoord: vec2<f32>, @location(1) Normal: vec3<f32>, @location(2) FragPos: vec3<f32>, @location(3) Ns: f32,    @location(4) Kd: vec3<f32>,    @location(5) Ka: vec3<f32>,    @location(6) Ks: vec3<f32>,    @location(7) Ke: vec3<f32>,    @location(8) Ni: f32, @location(9) d: f32,    @location(10) illum: f32,) -> @location(0) vec4<f32> {        
        return vec4<f32>(1.0, 0.0, 0.0, 0.5);
    }
    
    `;

    getRedShader() {
        return this.redShader;
    }
}