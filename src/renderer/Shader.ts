export class Textures{
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
    
    struct VertexOutput {
        @builtin(position) Position : vec4<f32>,
        @location(0) TexCoord : vec2<f32>,
        @location(1) Normal : vec3<f32>,
        @location(2) FragPos : vec3<f32>, // 프래그먼트 위치 추가
    };
    
    @vertex
    fn vs_main(@location(0) vertexPosition: vec3<f32>, @location(1) vertexTexCoord: vec2<f32>, @location(2) vertexNormal: vec3<f32>) -> VertexOutput {
        var output : VertexOutput;
        output.Position = transformUBO.projection * transformUBO.view * transformUBO.model * vec4<f32>(vertexPosition, 1.0);
        output.TexCoord = vertexTexCoord;
        output.Normal = (transformUBO.model * vec4<f32>(vertexNormal, 0.0)).xyz;
        output.FragPos = (transformUBO.model * vec4<f32>(vertexPosition, 1.0)).xyz; // 월드 공간 위치 계산
        return output;
    }
    
    @fragment
    fn fs_main(@location(0) TexCoord : vec2<f32>, @location(1) Normal : vec3<f32>, @location(2) FragPos: vec3<f32>) -> @location(0) vec4<f32> {            
        let ambientStrength: f32 = 1.5;
        let ambientColor: vec4<f32> = vec4<f32>(0.25, 0.25, 0.25, 1.0) * ambientStrength;
        
        let lightPos: vec3<f32> = vec3<f32>(-30.0, 30.0, 30.0);
        let lightColor: vec4<f32> = vec4<f32>(1.0, 1.0, 1.0, 1.0);
        let lightIntensity: f32 = 3.0;
        
        let texColor: vec4<f32> = textureSample(myTexture, mySampler, TexCoord);
        
        let norm: vec3<f32> = normalize(Normal);
        let lightDir: vec3<f32> = normalize(lightPos - FragPos);
        let diff: f32 = max(dot(norm, lightDir), 0.0);
        let diffuse: vec4<f32> = lightColor * diff * texColor * lightIntensity;
        
        let viewDir: vec3<f32> = normalize(cameraPos - FragPos);
        let reflectDir: vec3<f32> = reflect(-lightDir, norm);
        let specularStrength: f32 = 0.45;
        let shininess: f32 = 32.0;
        let spec: f32 = pow(max(dot(viewDir, reflectDir), 0.0), shininess);
        let specular: vec4<f32> = lightColor * spec * specularStrength;
        
        var finalColor: vec4<f32> = ambientColor + diffuse + specular;
        return finalColor;    
    }
    `;

    getShaders() {
        return this.textureShader;
    }
}