export class ObjModel {
    name: string;
    vertices: number[] = [];
    indices: number[] = [];
    materials: string[] = [];
    normals: number[] = [];
    uvs: number[] = [];
    isHighlighted: boolean = false;    

    constructor(name: string = '') {
        this.name = name;
    }
}

interface Material {
    name: string;
    Ns: number;
    Ka: [number, number, number];
    Kd: [number, number, number];
    Ks: [number, number, number];
    Ke: [number, number, number];
    Ni: number;
    d: number;
    illum: number;
    map_Kd?: string; // 추가: Diffuse texture map
}

export class ObjLoader {
    models: Map<string, ObjModel> = new Map();
    materials: Map<string, Material> = new Map();
    currentModel: ObjModel | null = null;
    currentMaterial: Material | null = null;
    vertexPositions: number[][] = [];
    vertexNormals: number[][] = [];
    vertexUVs: number[][] = [];
    faces: string[][] = [];
    materialData: string[] = [];
    curr_offset_pos: number = 0;
    curr_offset_uv: number = 0;
    curr_offset_norm: number = 0;

    parse(objData: string, scale: number = 1.0) {
        let currentMaterialName = ""; // 현재 재질 이름 저장
        objData.split('\n').forEach(line => {
            const parts = line.trim().split(/\s+/);
            switch (parts[0]) {
                case 'o':
                    this.finishCurrentModel(); // 현재 모델 처리를 마침
                    this.currentModel = new ObjModel(parts.slice(1).join(' '));
                    this.models.set(this.currentModel.name, this.currentModel);
                    break;
                case 'v':
                    this.vertexPositions.push(parts.slice(1).map(coord => parseFloat(coord) * scale));
                    break;
                case 'vn':
                    this.vertexNormals.push(parts.slice(1).map(parseFloat));
                    break;
                case 'vt':
                    this.vertexUVs.push(parts.slice(1).map(parseFloat));
                    break;
                case 'usemtl':
                    currentMaterialName = parts[1]; // 재질 이름 갱신
                    break;
                case 'f':
                    this.faces.push(parts.slice(1));
                    this.materialData.push(currentMaterialName);
                    break;                
            }
        });

        this.finishCurrentModel();
    }

    parseMtl(mtlData: string) {
        let currentMaterial!: Material;
    
        mtlData.split('\n').forEach(line => {
            const parts = line.trim().split(/\s+/);
            switch(parts[0]) {
                case 'newmtl':
                    if (currentMaterial) {
                        // 이전에 생성된 currentMaterial이 있다면, this.materials에 추가
                        this.materials.set(currentMaterial.name, currentMaterial);
                    }
                    // 새로운 재질 객체 생성
                    currentMaterial = {
                        name: parts[1],
                        Ns: 0,
                        Ka: [0, 0, 0],
                        Kd: [0, 0, 0],
                        Ks: [0, 0, 0],
                        Ke: [0, 0, 0],
                        Ni: 0,
                        d: 0,
                        illum: 0
                    };
                    break;
                case 'Ns':
                    currentMaterial!.Ns = parseFloat(parts[1]);
                    break;
                case 'Ka':
                    currentMaterial!.Ka = [parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])];
                    break;
                case 'Kd':
                    currentMaterial!.Kd = [parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])];
                    break;
                case 'Ks':
                    currentMaterial!.Ks = [parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])];
                    break;
                case 'Ke':
                    currentMaterial!.Ke = [parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])];
                    break;
                case 'Ni':
                    currentMaterial!.Ni = parseFloat(parts[1]);
                    break;
                case 'd':
                    currentMaterial!.d = parseFloat(parts[1]);
                    break;
                case 'illum':
                    currentMaterial!.illum = parseInt(parts[1]);
                    break;
            }
        });
    
        // 마지막 재질 객체도 materials 맵에 추가
        if (currentMaterial) {
            this.materials.set(currentMaterial.name, currentMaterial);
        }
    }

    finishCurrentModel() {
        if (this.currentModel) {
            const indexMap = new Map<string, number>();
            let currentIndex = 0;

            this.faces.forEach(faceParts => {
                const faceIndices = faceParts.map(part => {
                    let [pos, tex, norm] = part.split('/').map(e => e ? parseInt(e) - 1 : 0);
                    pos -= this.curr_offset_pos;
                    tex -= this.curr_offset_uv;
                    norm -= this.curr_offset_norm;
                    const key = `${pos}|${tex}|${norm}`;

                    if (indexMap.has(key)) {
                        return indexMap.get(key) ?? 0; // indexMap에서 undefined 반환 시 0으로 대체
                    } else {
                        if (pos !== undefined) {
                            const position = this.vertexPositions[pos];
                            this.currentModel!.vertices.push(...position);
                        }

                        if (tex !== undefined) {
                            const uv = this.vertexUVs[tex];
                            this.currentModel!.uvs.push(...uv);
                        } else {
                            this.currentModel!.uvs.push(0, 0);
                        }

                        if (norm !== undefined) {
                            const normal = this.vertexNormals[norm];
                            this.currentModel!.normals.push(...normal);
                        }

                        indexMap.set(key, currentIndex);
                        return currentIndex++;
                    }
                });

                for (let i = 1; i < faceIndices.length - 1; i++) {
                    this.currentModel!.indices.push(faceIndices[0], faceIndices[i], faceIndices[i + 1]);
                }
            });

            this.materialData.forEach(value => {
                this.currentModel?.materials.push(value);
            }); 

            if (this.vertexNormals.length === 0) {
                this.calculateNormals().forEach(n => this.currentModel!.normals.push(n));
            }
        }
        this.curr_offset_pos += this.vertexPositions.length;
        this.curr_offset_uv += this.vertexUVs.length;
        this.curr_offset_norm += this.vertexNormals.length;
        this.vertexPositions = [];
        this.vertexUVs = [];
        this.vertexNormals = [];
        this.faces = [];
        this.materialData = [];
    }

    calculateNormals(): number[] {
        const normals = new Array(this.vertexPositions.length).fill(0).map(() => [0, 0, 0]);
        const vertices = this.currentModel!.vertices;
        const indices = this.currentModel!.indices;

        for (let i = 0; i < indices.length; i += 3) {
            const i0 = indices[i];
            const i1 = indices[i + 1];
            const i2 = indices[i + 2];

            const v1 = vertices.slice(i0 * 3, i0 * 3 + 3);
            const v2 = vertices.slice(i1 * 3, i1 * 3 + 3);
            const v3 = vertices.slice(i2 * 3, i2 * 3 + 3);

            const u = v2.map((val, idx) => val - v1[idx]);
            const v = v3.map((val, idx) => val - v1[idx]);

            const norm = [
                u[1] * v[2] - u[2] * v[1],
                u[2] * v[0] - u[0] * v[2],
                u[0] * v[1] - u[1] * v[0]
            ];
            for (let j = 0; j < 3; j++) {
                normals[i0][j] += norm[j];
                normals[i1][j] += norm[j];
                normals[i2][j] += norm[j];
            }
        }

        return normals.flatMap(norm => {
            const len = Math.sqrt(norm[0] ** 2 + norm[1] ** 2 + norm[2] ** 2);
            return [norm[0] / len, norm[1] / len, norm[2] / len];
        });
    }

    async load(url: string, scale: number = 1.0): Promise<Map<string, ObjModel>> {        
        // 파일명에서 확장자 이전의 부분만 추출
        const mtl = url.split('.obj')[0]+'.mtl';

        const response = await fetch(url);
        const mtlResponse = await fetch(mtl);        
        const objData = await response.text();
        const mtlData = await mtlResponse.text();        

        this.parseMtl(mtlData);                
        console.log(this.materials);
        this.parse(objData, scale);
        return this.models;
    }
}
