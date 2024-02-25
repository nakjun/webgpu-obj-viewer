export class ObjModel {
    vertices: number[] = [];
    indices: number[] = [];
    normals: number[] = [];
    uvs: number[] = [];
}

export class ObjLoader {
    model: ObjModel = new ObjModel();
    parse(objData: string, scale: number = 1.0): ObjModel {
        const vertexPositions: number[][] = [];
        const vertexNormals: number[][] = [];
        const vertexUVs: number[][] = [];
        const faces: string[][] = [];

        objData.split('\n').forEach(line => {
            const parts = line.trim().split(/\s+/);
            switch (parts[0]) {
                case 'v':
                    vertexPositions.push(parts.slice(1).map(coord => parseFloat(coord) * scale));
                    break;
                case 'vn':
                    vertexNormals.push(parts.slice(1).map(parseFloat));
                    break;
                case 'vt':
                    vertexUVs.push(parts.slice(1).map(parseFloat));
                    break;
                case 'f':
                    faces.push(parts.slice(1));
                    break;
            }
        });

        const indexMap = new Map<string, number>();
        let currentIndex = 0;

        faces.forEach(faceParts => {
            const faceIndices = faceParts.map(part => {
                const [pos, tex, norm] = part.split('/').map(e => e ? parseInt(e) - 1 : undefined);
                const key = `${pos}|${tex}|${norm}`;

                if (indexMap.has(key)) {
                    return indexMap.get(key)!;
                } else {
                    if (pos !== undefined) {
                        const position = vertexPositions[pos];
                        this.model.vertices.push(...position);
                    }

                    if (tex !== undefined) {
                        const uv = vertexUVs[tex];
                        this.model.uvs.push(...uv);
                    } else {
                        this.model.uvs.push(0, 0);
                    }

                    if (norm !== undefined) {
                        const normal = vertexNormals[norm];
                        this.model.normals.push(...normal);
                    }

                    indexMap.set(key, currentIndex);
                    return currentIndex++;
                }
            });

            for (let i = 1; i < faceIndices.length - 1; i++) {
                this.model.indices.push(faceIndices[0], faceIndices[i], faceIndices[i + 1]);
            }
        });

        if (vertexNormals.length === 0) {
            this.calculateNormals(this.model.vertices, this.model.indices).forEach(n => this.model.normals.push(n));
        }

        return this.model;
    }

    calculateNormals(vertices: number[], indices: number[]): number[] {
        const normals = new Array(vertices.length / 3).fill(0).map(() => [0, 0, 0]);

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
        const normalizedNormals = normals.flatMap(norm => {
            const len = Math.sqrt(norm[0] ** 2 + norm[1] ** 2 + norm[2] ** 2);
            return [norm[0] / len, norm[1] / len, norm[2] / len];
        });

        return normalizedNormals;
    }

    async load(url: string, scale: number = 1.0): Promise<ObjModel> {
        const response = await fetch(url);
        const objData = await response.text();
        return this.parse(objData, scale);
    }
}
