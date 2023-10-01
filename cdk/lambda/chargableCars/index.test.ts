import {
    parsePositions,
    executeGreenMoRequest,
    executeMapsRequest,
    transformImage,
} from './index';

import axios from 'axios';

jest.mock('axios');

describe('when request is received', () => {
    test('then the position is parsed from request', () => {
        const [pos1, pos2] = parsePositions({
            lat1: '1.123456',
            lon1: '2.123456',
            lat2: '3.123456',
            lon2: '4.123456',
        });

        expect(pos1).toStrictEqual({ lat: 1.123456, lon: 2.123456 });
        expect(pos2).toStrictEqual({ lat: 3.123456, lon: 4.123456 });
    });

    test('the location of chargable cars is fetched', async () => {
        const car1 = {
            carId: 1,
            lat: 1.123456,
            lon: 2.123456,
            fuelLevel: 30,
        };
        const car2 = {
            carId: 2,
            lat: 3.123456,
            lon: 4.123456,
            fuelLevel: 50,
        };
        const data = [car1, car2];

        (axios.get as jest.Mock).mockImplementation(() =>
            Promise.resolve({ status: 200, data: data })
        );

        const pos1 = { lat: 1.123456, lon: 2.123456 };
        const pos2 = { lat: 3.123456, lon: 4.123456 };
        const params = `lon1=${pos1.lon}&lat1=${pos1.lat}&lon2=${pos2.lon}&lat2=${pos2.lat}`;
        await executeGreenMoRequest(params).then((data) =>
            expect(data).toEqual([car1])
        );
    });

    test('the image containg a map is generated', async () => {
        const centerPos = { lat: 1.123456, lon: 1.123456 };
        const positions = [
            { lat: 1.123456, lon: 2.123456 },
            { lat: 3.123456, lon: 4.123456 },
        ];

        const mockOutput = Buffer.from([0xff, 0xff, 0xff]);

        (axios.get as jest.Mock).mockImplementation(() =>
            Promise.resolve({ status: 200, data: mockOutput })
        );

        await executeMapsRequest(centerPos, positions).then((data) =>
            expect(data).toBe(mockOutput)
        );
    });

    test('the image is transformed', () => {
        const input = Buffer.from([
            0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00,
            0x01, 0x01, 0x00, 0x00,
        ]);

        const transformedImage = transformImage(input);

        expect(transformedImage).toBe('/9j/4AAQSkZJRgABAQAA');
    });
});