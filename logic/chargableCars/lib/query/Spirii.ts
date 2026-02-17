import { PositionQuery, Position } from './PositionQuery';

interface Charger {
    properties: {
        id: string;
        availableConnectors: number;
    };
    geometry: {
        coordinates: [number, number];
    };
}

export class Spirii extends PositionQuery<Charger> {
    protocol = 'https';
    hostname = 'app.spirii.dk';
    endpoint = 'api/v2/clusters';

    protected filter(objs: Charger[]): Charger[] {
        return objs.filter(
            (charger: Charger) =>
                charger.properties.availableConnectors > 0
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
