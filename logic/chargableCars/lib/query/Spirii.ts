import { PositionQuery, Position } from './PositionQuery';

interface Charger {
    properties: {
        id: string;
        numOfAvailableConnectors: number;
    };
    geometry: {
        coordinates: [number, number];
    };
}

export class Spirii extends PositionQuery<Charger> {
    protocol = 'https';
    hostname = 'app.spirii.dk';
    endpoint = 'api/clusters';
    headers = {
        appversion: '3.6.1',
    };

    protected filter(objs: Charger[]): Charger[] {
        return objs.filter(
            (charger: Charger) =>
                charger.properties.numOfAvailableConnectors > 0
        );
    }

    protected map(objs: Charger[]): Position[] {
        return objs.map((charger: Charger) => {
            return {
                lat: charger.geometry.coordinates[1],
                lon: charger.geometry.coordinates[0],
            };
        });
    }
}
