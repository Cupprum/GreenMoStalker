import { Spirii } from '../lib/query/Spirii';
import axios from 'axios';
jest.mock('axios');

test('the location of chargers is fetched', async () => {
    const charger1 = {
        properties: {
            availableConnectors: 2,
        },
        geometry: {
            coordinates: [2.123456, 1.123456],
        },
    };

    const charger2 = {
        properties: {
            availableConnectors: 0,
        },
        geometry: {
            coordinates: [3.123456, 4.123456],
        },
    };
    const data = [charger1, charger2];

    (axios.get as jest.Mock).mockImplementation(() =>
        Promise.resolve({ status: 200, data: data })
    );

    const pos1 = { lat: 1.123456, lon: 2.123456 };
    const pos2 = { lat: 3.123456, lon: 4.123456 };
    const params = {
        includeOccupied: 'false',
        includeOutOfService: 'false',
        includeRoaming: 'false',
        neCoordinates: `${pos1.lat},${pos2.lon}`,
        swCoordinates: `${pos2.lat},${pos1.lon}`,
        zoom: '22',
    };

    const spirii = new Spirii();
    const chargers = await spirii.query(params);
    expect(chargers).toEqual([pos1]);
});
