export class ObjModel {
    name: string;
    vertices: number[] = [];
    indices: number[] = [];
    normals: number[] = [];
    uvs: number[] = [];
    isHighlighted: boolean = false;

    constructor(name: string = '') {
        this.name = name;
    }
}

export class ObjLoader {
    models: Map<string, ObjModel> = new Map();
    currentModel: ObjModel | null = null;
    vertexPositions: number[][] = [];
    vertexNormals: number[][] = [];
    vertexUVs: number[][] = [];
    faces: string[][] = [];

    curr_offset_pos: number = 0;
    curr_offset_uv: number = 0;
    curr_offset_norm: number = 0;

    parse(objData: string, scale: number = 1.0) {
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
                case 'f':
                    this.faces.push(parts.slice(1));
                    break;
            }
        });

        this.finishCurrentModel();
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
        const response = await fetch(url);
        const objData = await response.text();
        this.parse(objData, scale);
        return this.models;
    }
}
