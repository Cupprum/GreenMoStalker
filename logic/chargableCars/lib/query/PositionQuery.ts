import axios from 'axios';

export class NetworkingError extends Error {}

export type Position = {
    lat: number;
    lon: number;
};

export abstract class PositionQuery<Type> {
    protocol!: string;
    hostname!: string;
    endpoint!: string;
    headers: { [header: string]: string } = {};

    protected async request(params: { [param: string]: string }): Promise<any> {
        const url = `${this.protocol}://${this.hostname}/${this.endpoint}`;

        console.log(`Execute HTTP request against: ${url}.`);
        const response = await axios.get(url, {
            params: params,
            headers: this.headers,
        });

        const expectedStatusCode = 200;
        if (response.status != expectedStatusCode) {
            // TODO: test the this.constuctor.name
            const msg = `Invalid response code - ${this.constructor.name}. Got ${response.status}, expected ${expectedStatusCode}`;
            throw new NetworkingError(msg);
        }

        return response.data;
    }

    protected filter(objs: Type[]): Type[] {
        throw new Error('Method not implemented.');
    }

    protected map(objs: Type[]): Position[] {
        throw new Error('Method not implemented.');
    }

    public async query(params: {
        [param: string]: string;
    }): Promise<Position[]> {
        const response = await this.request(params);
        const filtered = this.filter(response);
        const mapped = this.map(filtered);

        return mapped;
    }
}
