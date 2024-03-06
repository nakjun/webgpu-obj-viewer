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
        output.Ns = instanceDataBuffer[instanceID * 3 + 0];        
        output.Ka = vec3<f32>(instanceDataBuffer[instanceID * 3 + 1], instanceDataBuffer[instanceID * 3 + 2], instanceDataBuffer[instanceID * 3 + 3]);
        output.Kd = vec3<f32>(instanceDataBuffer[instanceID * 3 + 4], instanceDataBuffer[instanceID * 3 + 5], instanceDataBuffer[instanceID * 3 + 6]);
        output.Ks = vec3<f32>(instanceDataBuffer[instanceID * 3 + 7], instanceDataBuffer[instanceID * 3 + 8], instanceDataBuffer[instanceID * 3 + 9]);
        output.Ke = vec3<f32>(instanceDataBuffer[instanceID * 3 + 10], instanceDataBuffer[instanceID * 3 + 11], instanceDataBuffer[instanceID * 3 + 12]);
        output.Ni = instanceDataBuffer[instanceID * 3 + 13];
        output.d = instanceDataBuffer[instanceID * 3 + 14];
        output.illum = instanceDataBuffer[instanceID * 3 + 15];
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
        let ambientColor: vec4<f32> = vec4<f32>(Ka, d) * 0.1;
    
        // diffuse 계산
        let norm: vec3<f32> = normalize(Normal);
        let lightDir: vec3<f32> = normalize(lightPos - FragPos);
        let diff: f32 = max(dot(norm, lightDir), 0.0);
        let diffuse: vec4<f32> = lightColor * diff * lightIntensity * vec4<f32>(Kd, d);
    
        // specular 계산
        let viewDir: vec3<f32> = normalize(cameraPos - FragPos);
        let reflectDir: vec3<f32> = reflect(-lightDir, norm);
        let spec: f32 = pow(max(dot(viewDir, reflectDir), 0.0), Ns);
        let specular: vec4<f32> = lightColor * spec * 3.0 * vec4<f32>(Ks, d);

        // 최종 색상 계산
        var finalColor: vec4<f32> = ambientColor + diffuse + specular + vec4<f32>(Ke, d);
    
        return finalColor;
    }
    
    
    `;
    
    getMaterialShader(){
        return this.mtlShader;
    }

    textureShader = `
    struct TransformData {
        model: mat4x4<f32>,
        view: mat4x4<f32>,
        projection: mat4x4<f32>,
    };
    @binding(0) @group(0) var<uniform> transformUBO: TransformData;
    @binding(1) @group(0) var myTexture: texture_2d<f32>;
    @binding(2) @group(0) var mySampler: sampler;
    @binding(3) @group(0) var<uniform> cameraPos: vec3<f32>;
    
    // Light 정보를 저장할 새로운 구조체 정의
    struct LightData {
        position: vec3<f32>,
        color: vec4<f32>,
        intensity: f32,
    };
    @binding(4) @group(0) var<uniform> lightUBO: LightData; // Light 정보 바인딩
    
    struct VertexOutput {
        @builtin(position) Position : vec4<f32>,
        @location(0) TexCoord : vec2<f32>,
        @location(1) Normal : vec3<f32>,
        @location(2) FragPos : vec3<f32>,
    };
    
    @vertex
    fn vs_main(@location(0) vertexPosition: vec3<f32>, @location(1) vertexTexCoord: vec2<f32>, @location(2) vertexNormal: vec3<f32>) -> VertexOutput {
        var output : VertexOutput;
        output.Position = transformUBO.projection * transformUBO.view * transformUBO.model * vec4<f32>(vertexPosition, 1.0);
        output.TexCoord = vertexTexCoord;
        output.Normal = (transformUBO.model * vec4<f32>(vertexNormal, 0.0)).xyz;
        output.FragPos = (transformUBO.model * vec4<f32>(vertexPosition, 1.0)).xyz;
        return output;
    }
    
    @fragment
    fn fs_main(@location(0) TexCoord : vec2<f32>, @location(1) Normal : vec3<f32>, @location(2) FragPos: vec3<f32>) -> @location(0) vec4<f32> {            
        let ambientStrength: f32 = 0.005; // 환경광 강도를 적절히 조절
        let ambientColor: vec4<f32> = vec4<f32>(1.0, 1.0, 1.0, 1.0) * ambientStrength; // 환경광 색상을 자연스러운 톤으로 조정
        
        // lightUBO에서 light position과 color 사용
        let lightPos: vec3<f32> = lightUBO.position;
        let lightColor: vec4<f32> = lightUBO.color;
        let lightIntensity: f32 = lightUBO.intensity;
        
        let texColor: vec4<f32> = textureSample(myTexture, mySampler, TexCoord);
        
        let norm: vec3<f32> = normalize(Normal);
        let lightDir: vec3<f32> = normalize(lightPos - FragPos);
        let diff: f32 = max(dot(norm, lightDir), 0.0);
        let diffuse: vec4<f32> = lightColor * texColor * diff * lightIntensity; // 난반사 강도를 조정하여 디테일 강화
        
        let viewDir: vec3<f32> = normalize(cameraPos - FragPos);
        let reflectDir: vec3<f32> = reflect(-lightDir, norm);
        let specularStrength: f32 = 2.0; // 경면반사 강도 조정
        let shininess: f32 = 2048.0; // 경면반사의 블러링 효과 조정
        let spec: f32 = pow(max(dot(viewDir, reflectDir), 0.0), shininess);
        let specular: vec4<f32> = lightColor * spec * specularStrength;
        
        var finalColor: vec4<f32> = ambientColor + diffuse + specular;
        finalColor.a = texColor.a; // 텍스처의 알파 값을 최종 색상의 알파 값으로 설정
        return finalColor;    
    }

    
    `;

    getShaders() {
        return this.textureShader;
    }

    redShader = `
    struct TransformData {
        model: mat4x4<f32>,
        view: mat4x4<f32>,
        projection: mat4x4<f32>,
    };
    @binding(0) @group(0) var<uniform> transformUBO: TransformData;
    @binding(1) @group(0) var myTexture: texture_2d<f32>;
    @binding(2) @group(0) var mySampler: sampler;
    @binding(3) @group(0) var<uniform> cameraPos: vec3<f32>;
    
    // Light 정보를 저장할 새로운 구조체 정의
    struct LightData {
        position: vec3<f32>,
        color: vec4<f32>,
        intensity: f32,
    };
    @binding(4) @group(0) var<uniform> lightUBO: LightData; // Light 정보 바인딩
    
    struct VertexOutput {
        @builtin(position) Position : vec4<f32>,
        @location(0) TexCoord : vec2<f32>,
        @location(1) Normal : vec3<f32>,
        @location(2) FragPos : vec3<f32>,
    };
    
    @vertex
    fn vs_main(@location(0) vertexPosition: vec3<f32>, @location(1) vertexTexCoord: vec2<f32>, @location(2) vertexNormal: vec3<f32>) -> VertexOutput {
        var output : VertexOutput;
        output.Position = transformUBO.projection * transformUBO.view * transformUBO.model * vec4<f32>(vertexPosition, 1.0);
        output.TexCoord = vertexTexCoord;
        output.Normal = (transformUBO.model * vec4<f32>(vertexNormal, 0.0)).xyz;
        output.FragPos = (transformUBO.model * vec4<f32>(vertexPosition, 1.0)).xyz;
        return output;
    }
    
    @fragment
    fn fs_main(@location(0) TexCoord : vec2<f32>, @location(1) Normal : vec3<f32>, @location(2) FragPos: vec3<f32>) -> @location(0) vec4<f32> {                    
        return vec4<f32>(1.0,0.0,0.0,0.9);
    }
    
    `;

    getRedShader() {
        return this.redShader;
    }
}