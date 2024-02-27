export class Textures {
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
    let ambientStrength: f32 = 0.05; // 환경광 강도를 적절히 조절
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
    let specularStrength: f32 = 0.5; // 경면반사 강도 조정
    let shininess: f32 = 32.0; // 경면반사의 블러링 효과 조정
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
}